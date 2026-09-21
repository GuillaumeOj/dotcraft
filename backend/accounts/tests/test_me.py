from collections.abc import Callable

import pytest
from django.conf import settings
from django.core import mail
from rest_framework.test import APIClient
from rest_framework_simplejwt.exceptions import TokenError

from accounts.models import User
from conftest import PASSWORD
from core.auth import parse_refresh_token

pytestmark = pytest.mark.django_db


def _codes(response, field: str) -> list[str]:
    return [error["code"] for error in response.json()["fields"][field]]


class TestMe:
    def test_requires_authentication(self, api: APIClient) -> None:
        response = api.get("/api/v1/me/")

        assert response.status_code == 401
        assert response.json()["code"] == "not_authenticated"

    def test_rejects_invalid_token(self, api: APIClient) -> None:
        api.credentials(HTTP_AUTHORIZATION="Bearer nope")

        assert api.get("/api/v1/me/").status_code == 401

    def test_returns_current_user(self, auth_api: APIClient, user: User) -> None:
        response = auth_api.get("/api/v1/me/")

        assert response.status_code == 200
        assert response.json() == {
            "id": str(user.id),
            "email": user.email,
            "date_joined": user.date_joined.isoformat().replace("+00:00", "Z"),
        }


class TestChangeEmail:
    def test_changes_email_and_notifies_old_address(self, auth_api: APIClient, user: User) -> None:
        response = auth_api.patch("/api/v1/me/", {"email": "Lovelace@Example.com", "current_password": PASSWORD})

        assert response.status_code == 200
        assert response.json()["email"] == "lovelace@example.com"
        user.refresh_from_db()
        assert user.email == "lovelace@example.com"
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["ada@example.com"]
        assert "lovelace@example.com" in mail.outbox[0].body

    def test_same_email_is_a_noop(self, auth_api: APIClient, user: User) -> None:
        response = auth_api.patch("/api/v1/me/", {"email": user.email, "current_password": PASSWORD})

        assert response.status_code == 200
        assert mail.outbox == []

    def test_requires_current_password(self, auth_api: APIClient) -> None:
        response = auth_api.patch("/api/v1/me/", {"email": "x@example.com", "current_password": "wrong"})

        assert response.status_code == 400
        assert _codes(response, "current_password") == ["wrong_password"]

    def test_rejects_email_of_another_account(self, auth_api: APIClient, make_user: Callable[..., User]) -> None:
        make_user("taken@example.com")
        response = auth_api.patch("/api/v1/me/", {"email": "TAKEN@example.com", "current_password": PASSWORD})

        assert response.status_code == 400
        assert _codes(response, "email") == ["email_taken"]


class TestChangePassword:
    def test_changes_password_and_rotates_sessions(self, api: APIClient, user: User) -> None:
        login = api.post("/api/v1/auth/token/", {"email": user.email, "password": PASSWORD})
        old_refresh = login.cookies[settings.REFRESH_COOKIE_NAME].value
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['access']}")

        response = api.post(
            "/api/v1/me/password/", {"current_password": PASSWORD, "new_password": "a-brand-new-secret"}
        )

        assert response.status_code == 200
        assert response.json()["access"]
        new_refresh = response.cookies[settings.REFRESH_COOKIE_NAME].value
        user.refresh_from_db()
        assert user.check_password("a-brand-new-secret")
        # Other sessions are revoked, this device keeps a fresh one.
        with pytest.raises(TokenError, match="blacklisted"):
            parse_refresh_token(old_refresh)
        parse_refresh_token(new_refresh)

    def test_requires_current_password(self, auth_api: APIClient) -> None:
        response = auth_api.post(
            "/api/v1/me/password/", {"current_password": "wrong", "new_password": "a-brand-new-secret"}
        )

        assert response.status_code == 400
        assert _codes(response, "current_password") == ["wrong_password"]

    def test_validates_new_password(self, auth_api: APIClient) -> None:
        response = auth_api.post("/api/v1/me/password/", {"current_password": PASSWORD, "new_password": "ada"})

        assert response.status_code == 400
        assert "password_too_short" in _codes(response, "new_password")
