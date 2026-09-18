from django.contrib import admin

from library.models import Document, Folder, UserSettings


@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "parent_id", "deleted_at", "server_seq")
    list_filter = ("deleted_at",)
    search_fields = ("name", "owner__email")
    readonly_fields = ("server_seq",)


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "folder_id", "logo_mime", "deleted_at", "server_seq")
    search_fields = ("name", "owner__email")
    readonly_fields = ("server_seq", "logo_hash", "logo_mime")


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    list_display = ("user", "locale", "color_format", "updated_at")
    search_fields = ("user__email",)
