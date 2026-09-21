import importlib
from io import StringIO
from types import ModuleType

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.core.management import CommandError, call_command
from django.test import override_settings
from rest_framework.exceptions import NotAuthenticated
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory

from accounts.models import User
from config import env
from core.auth import request_user
from core.exceptions import api_exception_handler
from library.models import Document, Folder, UserSettings


class TestEnv:
    def test_env_bool(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("FLAG", raising=False)
        assert env.env_bool("FLAG", default=True) is True
        monkeypatch.setenv("FLAG", "")
        assert env.env_bool("FLAG", default=True) is True
        monkeypatch.setenv("FLAG", " Yes ")
        assert env.env_bool("FLAG", default=False) is True
        monkeypatch.setenv("FLAG", "0")
        assert env.env_bool("FLAG", default=True) is False

    def test_env_list(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("HOSTS", raising=False)
        assert env.env_list("HOSTS", default=["a"]) == ["a"]
        monkeypatch.setenv("HOSTS", "a.com, b.com,,")
        assert env.env_list("HOSTS", default=[]) == ["a.com", "b.com"]

    def test_required_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("TOKEN", raising=False)
        assert env.required_env("TOKEN", debug=True, default="dev") == "dev"
        monkeypatch.setenv("TOKEN", "  real  ")
        assert env.required_env("TOKEN", debug=False) == "real"

    def test_required_env_is_required_without_debug(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TOKEN", "   ")
        with pytest.raises(ImproperlyConfigured, match="TOKEN is required"):
            env.required_env("TOKEN", debug=False)

    def test_admin_path_defaults_in_debug(self) -> None:
        assert env.required_admin_path(None, debug=True) == "admin"
        assert env.required_admin_path(" /secret-door/ ", debug=False) == "secret-door"

    def test_admin_path_is_required_without_debug(self) -> None:
        with pytest.raises(ImproperlyConfigured, match="DJANGO_ADMIN_PATH is required"):
            env.required_admin_path("", debug=False)

    @pytest.mark.parametrize("value", ["a/b", "../x", "with space", "-dash"])
    def test_admin_path_must_be_a_single_segment(self, value: str) -> None:
        with pytest.raises(ImproperlyConfigured, match="single URL segment"):
            env.required_admin_path(value, debug=False)


class TestSettings:
    @pytest.fixture(autouse=True)
    def _restore_settings_module(self, monkeypatch: pytest.MonkeyPatch):
        yield
        monkeypatch.undo()
        import config.settings

        importlib.reload(config.settings)

    def _reload(self, monkeypatch: pytest.MonkeyPatch, **environ: str) -> ModuleType:
        for key in (
            "DJANGO_DEBUG",
            "DJANGO_SECRET_KEY",
            "DJANGO_ADMIN_PATH",
            "BLOB_READ_WRITE_TOKEN",
            "BREVO_API_KEY",
            "EMAIL_HOST",
            "FRONTEND_URL",
            "VERCEL_URL",
        ):
            monkeypatch.delenv(key, raising=False)
        for key, value in environ.items():
            monkeypatch.setenv(key, value)
        import config.settings

        return importlib.reload(config.settings)

    def test_production_requires_admin_path(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with pytest.raises(ImproperlyConfigured, match="DJANGO_ADMIN_PATH"):
            self._reload(monkeypatch, DJANGO_DEBUG="0", DJANGO_SECRET_KEY="s")

    def test_production_requires_secret_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with pytest.raises(ImproperlyConfigured, match="DJANGO_SECRET_KEY"):
            self._reload(monkeypatch, DJANGO_DEBUG="0", DJANGO_ADMIN_PATH="door")

    def test_production_requires_a_blob_token(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Deployments have no writable filesystem, so logo storage must be configured.
        with pytest.raises(ImproperlyConfigured, match="BLOB_READ_WRITE_TOKEN"):
            self._reload(monkeypatch, DJANGO_DEBUG="0", DJANGO_SECRET_KEY="s", DJANGO_ADMIN_PATH="door")

    def test_production_configuration(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = self._reload(
            monkeypatch,
            DJANGO_DEBUG="0",
            DJANGO_SECRET_KEY="s",
            DJANGO_ADMIN_PATH="door",
            BLOB_READ_WRITE_TOKEN="blob",
            BREVO_API_KEY="brevo",
            VERCEL_URL="preview.vercel.app",
        )

        assert settings.ADMIN_PATH == "door"
        assert settings.STORAGES["default"]["BACKEND"] == "library.storage.BlobStorage"
        assert settings.MAILERS["default"]["BACKEND"] == "anymail.backends.brevo.EmailBackend"
        assert "preview.vercel.app" in settings.ALLOWED_HOSTS
        # E-mail links point at the deployment when FRONTEND_URL isn't set.
        assert settings.FRONTEND_URL == "https://preview.vercel.app"
        assert "https://preview.vercel.app" in settings.CSRF_TRUSTED_ORIGINS
        assert settings.REFRESH_COOKIE_SECURE is True

    def test_development_configuration(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = self._reload(monkeypatch, DJANGO_DEBUG="1", EMAIL_HOST="mailpit")

        assert settings.ADMIN_PATH == "admin"
        assert settings.SECRET_KEY
        assert settings.MAILERS["default"]["OPTIONS"] == {"host": "mailpit", "port": 1025}
        assert settings.STORAGES["default"]["BACKEND"] == "django.core.files.storage.FileSystemStorage"

    def test_console_email_fallback(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = self._reload(monkeypatch, DJANGO_DEBUG="1")

        assert settings.MAILERS["default"]["BACKEND"] == "django.core.mail.backends.console.EmailBackend"


@pytest.mark.django_db
def test_admin_is_served_under_the_admin_path() -> None:
    client = APIClient()

    assert client.get("/api/admin/login/").status_code == 200
    assert client.get("/admin/login/").status_code == 404


def test_health() -> None:
    assert APIClient().get("/api/health/").json() == {"status": "ok"}


def test_request_user_rejects_anonymous() -> None:
    # No authenticators: the user resolves to UNAUTHENTICATED_USER (None).
    request = Request(APIRequestFactory().get("/"), authenticators=())

    with pytest.raises(NotAuthenticated):
        request_user(request)


def test_exception_handler_passes_through_non_api_errors() -> None:
    assert api_exception_handler(ValueError("boom"), {}) is None


def test_exception_handler_wraps_list_validation_errors() -> None:
    from rest_framework.exceptions import ValidationError

    response = api_exception_handler(ValidationError(["bad"]), {})

    assert response is not None
    assert response.data["fields"] == {"non_field_errors": [{"message": "bad", "code": "invalid"}]}


@pytest.mark.django_db
class TestSeed:
    @pytest.fixture(autouse=True)
    def _debug(self, settings) -> None:
        settings.DEBUG = True

    def test_seeds_users_and_libraries(self) -> None:
        out = StringIO()
        call_command("seed", "--users", "2", stdout=out)

        assert User.objects.filter(email="admin@dotcraft.local", is_superuser=True).exists()
        user = User.objects.get(email="user1@dotcraft.local")
        assert user.check_password("password")
        assert Folder.objects.filter(owner=user, parent_id__isnull=True).count() == 3
        assert Document.objects.filter(owner=user).count() == 8
        assert UserSettings.objects.get(user=user).locale == "en"
        assert "Seeded 2 users" in out.getvalue()

    def test_is_idempotent_and_can_flush(self) -> None:
        call_command("seed", "--users", "1", stdout=StringIO())
        out = StringIO()
        call_command("seed", "--users", "1", stdout=out)
        assert "already exists" in out.getvalue()
        assert Document.objects.count() == 8

        call_command("seed", "--users", "1", "--flush", stdout=out)
        assert "Flushed" in out.getvalue()
        assert Document.objects.count() == 8

    def test_refuses_without_debug(self) -> None:
        with override_settings(DEBUG=False), pytest.raises(CommandError, match="DEBUG is off"):
            call_command("seed", stdout=StringIO())

    def test_rejects_negative_count(self) -> None:
        with pytest.raises(CommandError, match="positive"):
            call_command("seed", users=-1, stdout=StringIO())
