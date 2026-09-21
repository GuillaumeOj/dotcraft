"""Cloud copy of a user's library.

The browser owns record identity: folder and document ids are UUIDs generated
client-side and reused as primary keys here. Timestamps (``created_at``,
``updated_at``, ``deleted_at``) are the client's epoch milliseconds and drive
last-write-wins conflict resolution. ``server_seq`` is a server-assigned,
monotonically increasing change number used as the sync cursor.
"""

import uuid
from typing import ClassVar

from django.conf import settings
from django.db import connection, models

from core.models import UUIDModel

CHANGE_SEQUENCE = "library_change_seq"

# Longest folder/document name. Mirrored by MAX_NAME_LENGTH in
# frontend/src/qr/storage.ts, which clips names before they are synced.
MAX_NAME_LENGTH = 200


def next_change_seq() -> int:
    """Draw the next value of the global change sequence (Postgres)."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT nextval(%s)", [CHANGE_SEQUENCE])
        row = cursor.fetchone()
    assert row is not None  # noqa: S101 - nextval always returns a row
    return int(row[0])


class SyncedRecord(UUIDModel):
    # Indexed through the (owner, server_seq) index declared on each model.
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+", db_index=False)
    name = models.CharField(max_length=MAX_NAME_LENGTH)
    created_at = models.BigIntegerField()
    updated_at = models.BigIntegerField()
    deleted_at = models.BigIntegerField(null=True, blank=True)
    server_seq = models.BigIntegerField()

    owner_id: uuid.UUID

    class Meta:
        abstract = True

    def __str__(self) -> str:
        return self.name


class Folder(SyncedRecord):
    parent_id = models.UUIDField(null=True, blank=True)

    class Meta:
        indexes: ClassVar = [models.Index(fields=["owner", "server_seq"])]


def logo_upload_path(instance: "Document", _filename: str) -> str:
    return f"logos/{instance.owner_id}/{instance.id}-{instance.logo_hash[:16]}"


class Document(SyncedRecord):
    # Null only for the tombstone of a document the server never had.
    folder_id = models.UUIDField(null=True, blank=True)
    options = models.JSONField(default=dict)
    logo = models.FileField(upload_to=logo_upload_path, null=True, blank=True, max_length=255)
    logo_hash = models.CharField(max_length=64, blank=True, default="")
    logo_mime = models.CharField(max_length=40, blank=True, default="")

    class Meta:
        indexes: ClassVar = [models.Index(fields=["owner", "server_seq"])]


class UserSettings(UUIDModel):
    """Preferences that follow the user across devices."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="library_settings")
    locale = models.CharField(max_length=8, blank=True, default="")
    color_format = models.CharField(max_length=16, blank=True, default="")
    updated_at = models.BigIntegerField(default=0)
    server_seq = models.BigIntegerField(default=0)

    user_id: uuid.UUID

    class Meta:
        verbose_name_plural = "user settings"

    def __str__(self) -> str:
        return f"Settings of {self.user_id}"
