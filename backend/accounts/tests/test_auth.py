from collections.abc import Callable

import pytest
from django.conf import settings
from django.core import mail
from django.core.mail import EmailMultiAlternatives
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from accounts.emails import password_reset_link
from accounts.models import User
from conftest import PASSWORD

pytestmark = pytest.mark.django_db

COOKIE = settings.REFRESH_COOKIE_NAME


def _codes(response, field: str) -> list[str]:
    return [error["code"] for error in response.json()["fields"][field]]


class TestRegister:
    def test_creates_account_and_session(self, api: APIClient) -> None:
        response = api.post("/api/v1/auth/register/", {"email": "New@Example.com", "password": PASSWORD})

        assert response.status_code == 201
        body = response.json()
        assert body["user"]["email"] == "new@example.com"
        assert body["access"]
        cookie = response.cookies[COOKIE]
        assert cookie["httponly"]
        assert cookie["samesite"] == "Strict"
        assert cookie["path"] == "/api/v1/auth/"
        assert User.objects.get(email="new@example.com").check_password(PASSWORD)

    def test_rejects_taken_email_case_insensitively(self, api: APIClient, user: User) -> None:
        response = api.post("/api/v1/auth/register/", {"email": "ADA@example.com", "password": PASSWORD})

        assert response.status_code == 400
        assert response.json()["code"] == "invalid"
        assert _codes(response, "email") == ["email_taken"]

    def test_rejects_weak_password_with_validator_codes(self, api: APIClient) -> None:
        response = api.post("/api/v1/auth/register/", {"email": "bob@example.com", "password": "123"})

        assert response.status_code == 400
        codes = _codes(response, "password")
        assert "password_too_short" in codes
        assert "password_entirely_numeric" in codes

    def test_rejects_invalid_email(self, api: APIClient) -> None:
        response = api.post("/api/v1/auth/register/", {"email": "nope", "password": PASSWORD})

        assert response.status_code == 400
        assert _codes(response, "email") == ["invalid"]


class TestLogin:
    def test_returns_access_and_refresh_cookie(self, api: APIClient, user: User) -> None:
        response = api.post("/api/v1/auth/token/", {"email": "ADA@example.com", "password": PASSWORD})

        assert response.status_code == 200
        assert response.json()["user"]["id"] == str(user.id)
        assert response.cookies[COOKIE].value
        user.refresh_from_db()
        assert user.last_login is not None

    def test_rejects_bad_password(self, api: APIClient, user: User) -> None:
        response = api.post("/api/v1/auth/token/", {"email": user.email, "password": "wrong"})

        assert response.status_code == 400
        assert _codes(response, "non_field_errors") == ["invalid_credentials"]

    def test_rejects_inactive_user(self, api: APIClient, make_user: Callable[..., User]) -> None:
        inactive = make_user(is_active=False)
        response = api.post("/api/v1/auth/token/", {"email": inactive.email, "password": PASSWORD})

        assert response.status_code == 400

    def test_is_throttled(self, api: APIClient, user: User, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"auth": "2/min"})
        for _ in range(2):
            api.post("/api/v1/auth/token/", {"email": user.email, "password": "wrong"})
        response = api.post("/api/v1/auth/token/", {"email": user.email, "password": "wrong"})

        assert response.status_code == 429
        assert response.json()["code"] == "throttled"


class TestRefreshAndLogout:
    def _login(self, api: APIClient, user: User) -> str:
        response = api.post("/api/v1/auth/token/", {"email": user.email, "password": PASSWORD})
        return response.cookies[COOKIE].value

    def test_refresh_rotates_the_cookie(self, api: APIClient, user: User) -> None:
        first = self._login(api, user)

        response = api.post("/api/v1/auth/token/refresh/")

        assert response.status_code == 200
        assert response.json()["access"]
        assert response.json()["user"]["email"] == user.email
        assert response.cookies[COOKIE].value != first
        # The previous refresh token can't be replayed.
        api.cookies[COOKIE] = first
        assert api.post("/api/v1/auth/token/refresh/").status_code == 401

    def test_refresh_without_cookie_is_unauthorized(self, api: APIClient) -> None:
        response = api.post("/api/v1/auth/token/refresh/")

        assert response.status_code == 401
        assert response.json()["code"] == "no_session"

    def test_refresh_with_garbage_cookie_clears_it(self, api: APIClient) -> None:
        api.cookies[COOKIE] = "garbage"
        response = api.post("/api/v1/auth/token/refresh/")

        assert response.status_code == 401
        assert response.json()["code"] == "invalid_session"
        assert response.cookies[COOKIE].value == ""

    def test_refresh_for_deactivated_user_fails(self, api: APIClient, user: User) -> None:
        self._login(api, user)
        user.is_active = False
        user.save()

        assert api.post("/api/v1/auth/token/refresh/").status_code == 401

    def test_logout_blacklists_and_clears(self, api: APIClient, user: User) -> None:
        token = self._login(api, user)

        response = api.post("/api/v1/auth/logout/")

        assert response.status_code == 204
        assert response.cookies[COOKIE].value == ""
        api.cookies[COOKIE] = token
        assert api.post("/api/v1/auth/token/refresh/").status_code == 401

    def test_logout_is_idempotent(self, api: APIClient) -> None:
        assert api.post("/api/v1/auth/logout/").status_code == 204
        api.cookies[COOKIE] = "garbage"
        assert api.post("/api/v1/auth/logout/").status_code == 204


class TestPasswordReset:
    def test_sends_email_for_known_account(self, api: APIClient, user: User) -> None:
        response = api.post("/api/v1/auth/password-reset/", {"email": "ADA@example.com"})

        assert response.status_code == 204
        assert len(mail.outbox) == 1
        message = mail.outbox[0]
        assert isinstance(message, EmailMultiAlternatives)
        assert message.to == ["ada@example.com"]
        assert message.subject == "Reset your Dotcraft password"
        assert "http://testserver.local/reset-password/" in message.body
        html = message.alternatives[0]
        assert html[1] == "text/html"
        assert "Choose a new password" in str(html[0])

    def test_is_silent_for_unknown_account(self, api: APIClient) -> None:
        response = api.post("/api/v1/auth/password-reset/", {"email": "ghost@example.com"})

        assert response.status_code == 204
        assert mail.outbox == []

    def test_confirm_sets_password_and_revokes_sessions(self, api: APIClient, user: User) -> None:
        api.post("/api/v1/auth/token/", {"email": user.email, "password": PASSWORD})
        user.refresh_from_db()
        uid, token = password_reset_link(user).rsplit("/", 2)[-2:]

        response = api.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "a-brand-new-secret"},
        )

        assert response.status_code == 204
        user.refresh_from_db()
        assert user.check_password("a-brand-new-secret")
        assert OutstandingToken.objects.filter(user=user).count() == BlacklistedToken.objects.count()
        assert api.post("/api/v1/auth/token/refresh/").status_code == 401
        # The link is single-use: the password hash changed.
        again = api.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "another-new-secret"},
        )
        assert again.status_code == 400

    @pytest.mark.parametrize(
        ("uid", "token"),
        [("not-base64!", "x"), ("MTIz", "x"), ("", "")],
    )
    def test_confirm_rejects_bad_links(self, api: APIClient, user: User, uid: str, token: str) -> None:
        response = api.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "a-brand-new-secret"},
        )

        assert response.status_code == 400

    def test_confirm_rejects_wrong_token(self, api: APIClient, user: User) -> None:
        uid, _ = password_reset_link(user).rsplit("/", 2)[-2:]
        response = api.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": uid, "token": "bad-token", "new_password": "a-brand-new-secret"},
        )

        assert response.status_code == 400
        assert _codes(response, "token") == ["invalid_token"]

    def test_confirm_validates_new_password(self, api: APIClient, user: User) -> None:
        uid, token = password_reset_link(user).rsplit("/", 2)[-2:]
        response = api.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "short"},
        )

        assert response.status_code == 400
        assert "password_too_short" in _codes(response, "new_password")
