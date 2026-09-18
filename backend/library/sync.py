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
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from django.db import transaction

from accounts.models import User
from library.models import Document, Folder, SyncedRecord, UserSettings, next_change_seq
from library.serializers import document_out, folder_out, settings_out

PAGE_SIZE = 500


@dataclass
class _Push:
    accepted: set[uuid.UUID] = field(default_factory=set)
    accepted_seqs: list[int] = field(default_factory=list)
    stale: list[SyncedRecord] = field(default_factory=list)
    rejected: list[str] = field(default_factory=list)


def lock_user(user: User) -> UserSettings:
    """Serialise sync writes for ``user`` (must run inside a transaction)."""
    return UserSettings.objects.select_for_update().get_or_create(user=user)[0]


def clear_logo(document: Document) -> None:
    """Detach the logo; the blob itself is deleted once the transaction commits."""
    if name := document.logo.name:
        storage = document.logo.storage
        transaction.on_commit(lambda: storage.delete(name))
    document.logo = None
    document.logo_hash = ""
    document.logo_mime = ""


def _apply_folder(folder: Folder, data: dict[str, Any]) -> None:
    folder.parent_id = data["parentId"]


def _apply_document(document: Document, data: dict[str, Any]) -> None:
    document.folder_id = data["folderId"]
    document.options = data["options"]


def _push(
    model: type[SyncedRecord],
    user: User,
    items: list[dict[str, Any]],
    push: _Push,
    apply_live: Callable[[Any, dict[str, Any]], None],
) -> None:
    existing = model.objects.in_bulk([item["id"] for item in items])
    for data in items:
        record = existing.get(data["id"])
        if record is not None and record.owner_id != user.pk:
            push.rejected.append(str(data["id"]))
            continue
        if record is not None and data["updatedAt"] <= record.updated_at:
            if data["updatedAt"] < record.updated_at:
                push.stale.append(record)
            continue
        record = record or model(id=data["id"], owner=user)
        record.updated_at = data["updatedAt"]
        record.deleted_at = data["deletedAt"]
        if data["deletedAt"] is None:
            record.name = data["name"]
            record.created_at = data["createdAt"]
            apply_live(record, data)
        else:
            if record._state.adding:
                record.name = data.get("name", "")
                record.created_at = data.get("createdAt") or data["updatedAt"]
            if isinstance(record, Document):
                clear_logo(record)
        record.server_seq = next_change_seq()
        record.save()
        push.accepted.add(record.id)
        push.accepted_seqs.append(record.server_seq)


def _push_settings(user_settings: UserSettings, data: dict[str, Any] | None) -> tuple[bool, bool]:
    """Returns ``(accepted, stale)``."""
    if data is None or data["updatedAt"] == user_settings.updated_at:
        return False, False
    if data["updatedAt"] < user_settings.updated_at:
        return False, True
    user_settings.locale = data["locale"] or ""
    user_settings.color_format = data["colorFormat"] or ""
    user_settings.updated_at = data["updatedAt"]
    user_settings.server_seq = next_change_seq()
    user_settings.save()
    return True, False


def sync(user: User, payload: dict[str, Any]) -> dict[str, Any]:
    """Apply a push and return the pull, as the API response body."""
    cursor: int = payload["cursor"]
    with transaction.atomic():
        user_settings = lock_user(user)
        push = _Push()
        _push(Folder, user, payload["folders"], push, _apply_folder)
        _push(Document, user, payload["documents"], push, _apply_document)
        settings_accepted, settings_stale = _push_settings(user_settings, payload["settings"])

        changes: list[SyncedRecord] = sorted(
            (
                record
                for model in (Folder, Document)
                for record in model.objects.filter(owner=user, server_seq__gt=cursor)
                .exclude(id__in=push.accepted)
                .order_by("server_seq")[: PAGE_SIZE + 1]
            ),
            key=lambda record: record.server_seq,
        )
        has_more = len(changes) > PAGE_SIZE
        page = changes[:PAGE_SIZE]
        # Without more pages, every change after the cursor is either on this
        # page or was just accepted from this client.
        seen = [record.server_seq for record in page]
        new_cursor = seen[-1] if has_more else max(cursor, *seen, *push.accepted_seqs, user_settings.server_seq)

        # Records the client lost a conflict on are always echoed, even if their
        # sequence is older than the client's cursor.
        included = {record.id for record in page}
        page.extend(record for record in push.stale if record.id not in included)

        send_settings = settings_stale or (not settings_accepted and user_settings.server_seq > cursor)
        return {
            "cursor": new_cursor,
            "folders": [folder_out(r) for r in page if isinstance(r, Folder)],
            "documents": [document_out(r) for r in page if isinstance(r, Document)],
            "settings": settings_out(user_settings) if send_settings else None,
            "rejected": push.rejected,
            "hasMore": has_more,
        }


def touch_document(document: Document) -> None:
    """Give ``document`` a new sequence so other devices pull its logo change."""
    document.server_seq = next_change_seq()
