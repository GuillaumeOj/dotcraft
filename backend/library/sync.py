"""Last-write-wins synchronisation of a user's library.

A sync round-trip pushes the client's changed records and pulls everything the
server has seen since the client's cursor:

* each incoming record (live or tombstone) replaces the stored one only when its
  ``updatedAt`` is strictly newer;
* a record the server kept because it is newer is echoed back so the client
  converges on it;
* records the server just accepted from this client are not echoed back;
* every write takes a new ``server_seq`` from a global sequence; the returned
  cursor is the highest sequence the client has now seen.

All writes for a user happen while holding a row lock on their
``UserSettings``, so a user's sequence numbers are committed in order and a
cursor can never skip a record.
"""

import uuid
from dataclasses import dataclass, field
from itertools import chain
from typing import Any

from django.db import transaction
from django.db.models import Max

from accounts.models import User
from library.models import Document, Folder, UserSettings, next_change_seq
from library.serializers import document_out, folder_out, settings_out

PAGE_SIZE = 500
_NIL_UUID = uuid.UUID(int=0)


@dataclass
class SyncResult:
    cursor: int
    folders: list[dict[str, Any]] = field(default_factory=list)
    documents: list[dict[str, Any]] = field(default_factory=list)
    settings: dict[str, Any] | None = None
    rejected: list[str] = field(default_factory=list)
    has_more: bool = False

    def as_response(self) -> dict[str, Any]:
        return {
            "cursor": self.cursor,
            "folders": self.folders,
            "documents": self.documents,
            "settings": self.settings,
            "rejected": self.rejected,
            "hasMore": self.has_more,
        }


@dataclass
class _Push:
    accepted: set[uuid.UUID] = field(default_factory=set)
    stale: list[Folder | Document] = field(default_factory=list)
    rejected: list[str] = field(default_factory=list)


def lock_user(user: User) -> UserSettings:
    """Serialise sync writes for ``user`` (must run inside a transaction)."""
    UserSettings.objects.get_or_create(user=user)
    return UserSettings.objects.select_for_update().get(user=user)


def _apply_common(record: Folder | Document, data: dict[str, Any]) -> None:
    record.updated_at = data["updatedAt"]
    record.deleted_at = data["deletedAt"]
    if data["deletedAt"] is None:
        record.name = data["name"]
        record.created_at = data["createdAt"]
    elif record._state.adding:
        record.name = data.get("name", "")
        record.created_at = data.get("createdAt") or data["updatedAt"]
    record.server_seq = next_change_seq()


def _push_folders(user: User, items: list[dict[str, Any]], push: _Push) -> None:
    existing = Folder.objects.in_bulk([item["id"] for item in items])
    for data in items:
        folder = existing.get(data["id"])
        if folder is not None and folder.owner_id != user.pk:
            push.rejected.append(str(data["id"]))
            continue
        if folder is not None and data["updatedAt"] <= folder.updated_at:
            if data["updatedAt"] < folder.updated_at:
                push.stale.append(folder)
            continue
        folder = folder or Folder(id=data["id"], owner=user)
        _apply_common(folder, data)
        if data["deletedAt"] is None:
            folder.parent_id = data["parentId"]
        folder.save()
        push.accepted.add(folder.id)


def _push_documents(user: User, items: list[dict[str, Any]], push: _Push) -> None:
    existing = Document.objects.in_bulk([item["id"] for item in items])
    for data in items:
        document = existing.get(data["id"])
        if document is not None and document.owner_id != user.pk:
            push.rejected.append(str(data["id"]))
            continue
        if document is not None and data["updatedAt"] <= document.updated_at:
            if data["updatedAt"] < document.updated_at:
                push.stale.append(document)
            continue
        document = document or Document(id=data["id"], owner=user, folder_id=data["folderId"] or _NIL_UUID)
        _apply_common(document, data)
        if data["deletedAt"] is None:
            document.folder_id = data["folderId"]
            document.options = data["options"]
        else:
            clear_logo(document)
        document.save()
        push.accepted.add(document.id)


def clear_logo(document: Document) -> None:
    if document.logo:
        document.logo.delete(save=False)
    document.logo = None
    document.logo_hash = ""
    document.logo_mime = ""


def _push_settings(user_settings: UserSettings, data: dict[str, Any] | None) -> tuple[bool, bool]:
    """Returns ``(accepted, stale)``."""
    if data is None or data["updatedAt"] == user_settings.updated_at:
        return False, False
    if data["updatedAt"] < user_settings.updated_at:
        return False, True
    user_settings.locale = data["locale"]
    user_settings.color_format = data["colorFormat"]
    user_settings.updated_at = data["updatedAt"]
    user_settings.server_seq = next_change_seq()
    user_settings.save()
    return True, False


def _latest_seq(user: User, user_settings: UserSettings) -> int:
    folders = Folder.objects.filter(owner=user).aggregate(m=Max("server_seq"))["m"] or 0
    documents = Document.objects.filter(owner=user).aggregate(m=Max("server_seq"))["m"] or 0
    return max(folders, documents, user_settings.server_seq)


def sync(user: User, payload: dict[str, Any]) -> SyncResult:
    cursor: int = payload["cursor"]
    with transaction.atomic():
        user_settings = lock_user(user)
        push = _Push()
        _push_folders(user, payload["folders"], push)
        _push_documents(user, payload["documents"], push)
        settings_accepted, settings_stale = _push_settings(user_settings, payload["settings"])

        folders = list(
            Folder.objects.filter(owner=user, server_seq__gt=cursor)
            .exclude(id__in=push.accepted)
            .order_by("server_seq")[: PAGE_SIZE + 1]
        )
        documents = list(
            Document.objects.filter(owner=user, server_seq__gt=cursor)
            .exclude(id__in=push.accepted)
            .order_by("server_seq")[: PAGE_SIZE + 1]
        )
        changes = sorted(chain(folders, documents), key=lambda record: record.server_seq)
        has_more = len(changes) > PAGE_SIZE
        page = changes[:PAGE_SIZE]
        new_cursor = page[-1].server_seq if has_more else max(cursor, _latest_seq(user, user_settings))

        # Records the client lost a conflict on are always echoed, even if their
        # sequence is older than the client's cursor.
        included = {record.id for record in page}
        page.extend(record for record in push.stale if record.id not in included)

        send_settings = settings_stale or (not settings_accepted and user_settings.server_seq > cursor)
        return SyncResult(
            cursor=new_cursor,
            folders=[folder_out(r) for r in page if isinstance(r, Folder)],
            documents=[document_out(r) for r in page if isinstance(r, Document)],
            settings=settings_out(user_settings) if send_settings else None,
            rejected=push.rejected,
            has_more=has_more,
        )


def touch_document(document: Document) -> None:
    """Give ``document`` a new sequence so other devices pull its logo change."""
    document.server_seq = next_change_seq()
