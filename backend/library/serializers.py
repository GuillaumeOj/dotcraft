"""Wire format of the sync endpoint (camelCase, mirroring the SPA's records)."""

import json
from typing import Any

from rest_framework import serializers

from library.models import Document, Folder, UserSettings

MAX_BATCH = 1000
MAX_OPTIONS_BYTES = 64 * 1024
LOCALES = ("en", "fr", "es", "de", "it", "pt")
COLOR_FORMATS = ("hex", "rgb", "hsl", "named")


class _RecordIn(serializers.Serializer):
    # Fields a live record must send; a tombstone only needs id + dates.
    live_required: tuple[str, ...] = ("name", "createdAt")

    id = serializers.UUIDField()
    name = serializers.CharField(max_length=200, allow_blank=True, required=False, default="")
    createdAt = serializers.IntegerField(min_value=0, required=False, default=0)
    updatedAt = serializers.IntegerField(min_value=0)
    deletedAt = serializers.IntegerField(min_value=0, required=False, allow_null=True, default=None)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["deletedAt"] is None:
            sent = set(self.initial_data)
            missing = [field for field in self.live_required if field not in sent]
            if missing:
                raise serializers.ValidationError({field: ["This field is required."] for field in missing})
        return attrs


class FolderIn(_RecordIn):
    parentId = serializers.UUIDField(required=False, allow_null=True, default=None)


class DocumentIn(_RecordIn):
    folderId = serializers.UUIDField(required=False, allow_null=True, default=None)
    options = serializers.DictField(required=False, default=dict)

    live_required = ("name", "createdAt", "folderId", "options")

    def validate_options(self, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value)) > MAX_OPTIONS_BYTES:
            raise serializers.ValidationError("Options are too large.", code="too_large")
        # Logos never travel inside the options; they have their own endpoint.
        return {**value, "logo": None} if "logo" in value else value


class SettingsIn(serializers.Serializer):
    locale = serializers.ChoiceField(choices=LOCALES, required=False, allow_blank=True, default="")
    colorFormat = serializers.ChoiceField(choices=COLOR_FORMATS, required=False, allow_blank=True, default="")
    updatedAt = serializers.IntegerField(min_value=0)


class SyncRequest(serializers.Serializer):
    cursor = serializers.IntegerField(min_value=0, default=0)
    folders = serializers.ListField(child=serializers.DictField(), max_length=MAX_BATCH, required=False, default=list)
    documents = serializers.ListField(child=serializers.DictField(), max_length=MAX_BATCH, required=False, default=list)
    settings = serializers.DictField(required=False, allow_null=True, default=None)

    def _validate_each(
        self, items: list[dict[str, Any]], serializer: type[serializers.Serializer]
    ) -> list[dict[str, Any]]:
        validated: list[dict[str, Any]] = []
        errors: dict[str, Any] = {}
        for index, item in enumerate(items):
            child = serializer(data=item)
            if child.is_valid():
                validated.append(dict(child.validated_data))
            else:
                errors[str(index)] = child.errors
        if errors:
            raise serializers.ValidationError(errors)
        return validated

    def validate_folders(self, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return self._validate_each(value, FolderIn)

    def validate_documents(self, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return self._validate_each(value, DocumentIn)

    def validate_settings(self, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        child = SettingsIn(data=value)
        child.is_valid(raise_exception=True)
        return dict(child.validated_data)


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
        "folderId": str(document.folder_id),
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
