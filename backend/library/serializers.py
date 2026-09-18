"""Wire format of the sync endpoint (camelCase, mirroring the SPA's records)."""

import json
from typing import Any, ClassVar

from rest_framework import serializers

from library.models import Document, Folder, UserSettings

MAX_BATCH = 1000
MAX_OPTIONS_BYTES = 64 * 1024
LOCALES = ("en", "fr", "es", "de", "it", "pt")
COLOR_FORMATS = ("hex", "rgb", "hsl", "named")


class _RecordIn(serializers.Serializer):
    # Content a live record must send (a tombstone only needs id + dates), and
    # the values tombstones get instead.
    live_fields: ClassVar[dict[str, Any]] = {"name": "", "createdAt": 0}

    id = serializers.UUIDField()
    name = serializers.CharField(max_length=200, allow_blank=True, required=False)
    createdAt = serializers.IntegerField(min_value=0, required=False)
    updatedAt = serializers.IntegerField(min_value=0)
    deletedAt = serializers.IntegerField(min_value=0, required=False, allow_null=True, default=None)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        missing = [field for field in self.live_fields if field not in attrs]
        if attrs["deletedAt"] is None and missing:
            raise serializers.ValidationError({field: ["This field is required."] for field in missing})
        return {**self.live_fields, **attrs}


class FolderIn(_RecordIn):
    parentId = serializers.UUIDField(required=False, allow_null=True, default=None)


class DocumentIn(_RecordIn):
    live_fields: ClassVar[dict[str, Any]] = {"name": "", "createdAt": 0, "folderId": None, "options": {}}

    folderId = serializers.UUIDField(required=False, allow_null=True)
    options = serializers.DictField(required=False)

    def validate_options(self, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value)) > MAX_OPTIONS_BYTES:
            raise serializers.ValidationError("Options are too large.", code="too_large")
        # Logos never travel inside the options; they have their own endpoint.
        return {**value, "logo": None} if "logo" in value else value


class SettingsIn(serializers.Serializer):
    # null (or blank) means "not chosen on that device".
    locale = serializers.ChoiceField(choices=LOCALES, required=False, allow_blank=True, allow_null=True, default="")
    colorFormat = serializers.ChoiceField(
        choices=COLOR_FORMATS, required=False, allow_blank=True, allow_null=True, default=""
    )
    updatedAt = serializers.IntegerField(min_value=0)


class SyncRequest(serializers.Serializer):
    cursor = serializers.IntegerField(min_value=0, default=0)
    folders = serializers.ListField(child=FolderIn(), max_length=MAX_BATCH, required=False, default=list)
    documents = serializers.ListField(child=DocumentIn(), max_length=MAX_BATCH, required=False, default=list)
    settings = SettingsIn(required=False, allow_null=True, default=None)


def folder_out(folder: Folder) -> dict[str, Any]:
    return {
        "id": str(folder.id),
        "name": folder.name,
        "parentId": str(folder.parent_id) if folder.parent_id else None,
        "createdAt": folder.created_at,
        "updatedAt": folder.updated_at,
        "deletedAt": folder.deleted_at,
    }


def document_out(document: Document) -> dict[str, Any]:
    return {
        "id": str(document.id),
        "name": document.name,
        "folderId": str(document.folder_id) if document.folder_id else None,
        "options": document.options,
        "createdAt": document.created_at,
        "updatedAt": document.updated_at,
        "deletedAt": document.deleted_at,
        "logoHash": document.logo_hash or None,
        "logoMime": document.logo_mime or None,
    }


def settings_out(user_settings: UserSettings) -> dict[str, Any]:
    return {
        "locale": user_settings.locale or None,
        "colorFormat": user_settings.color_format or None,
        "updatedAt": user_settings.updated_at,
    }
