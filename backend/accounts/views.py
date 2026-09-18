"""Account endpoints.

Authentication uses short-lived JWT access tokens (returned in the body and
kept in memory by the SPA) and long-lived rotating refresh tokens stored in an
HttpOnly, SameSite=Strict cookie scoped to ``/api/v1/auth/``.
"""

import contextlib

from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.emails import send_email_changed, send_password_reset
from accounts.models import User, normalize_email_address
from accounts.serializers import (
    ChangeEmailSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserSerializer,
)
from core.auth import parse_refresh_token, request_user


def _set_refresh_cookie(response: Response, refresh: RefreshToken) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=settings.REFRESH_COOKIE_PATH,
        secure=settings.REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite="Strict",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH, samesite="Strict")


def _session_response(user: User, *, status_code: int = status.HTTP_200_OK) -> Response:
    """Issue a new token pair: access in the body, refresh in the cookie."""
    refresh = RefreshToken.for_user(user)
    response = Response(
        {"user": UserSerializer(user).data, "access": str(refresh.access_token)},
        status=status_code,
    )
    _set_refresh_cookie(response, refresh)
    return response


def set_password_everywhere(user: User, password: str) -> None:
    """Set a new password and sign every session out (blacklist all refresh tokens)."""
    with transaction.atomic():
        user.set_password(password)
        user.save(update_fields=["password"])
        BlacklistedToken.objects.bulk_create(
            [BlacklistedToken(token=token) for token in OutstandingToken.objects.filter(user=user)],
            ignore_conflicts=True,
        )


class PublicView(APIView):
    """An endpoint reachable without an access token."""

    permission_classes = (AllowAny,)
    authentication_classes = ()


class ThrottledPublicView(PublicView):
    """A public endpoint that accepts credentials: rate-limited."""

    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "auth"


class RegisterView(ThrottledPublicView):
    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return _session_response(user, status_code=status.HTTP_201_CREATED)


class LoginView(ThrottledPublicView):
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user: User = serializer.validated_data["user"]
        update_last_login(User, user)
        return _session_response(user)


class RefreshView(PublicView):
    """Exchange the refresh cookie for a new session, rotating the refresh token."""

    def post(self, request: Request) -> Response:
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw:
            return self._unauthorized("no_session")
        try:
            refresh = parse_refresh_token(raw)
            user = User.objects.get(pk=refresh["user_id"], is_active=True)
            refresh.blacklist()
        except (TokenError, User.DoesNotExist):
            return self._unauthorized("invalid_session")
        return _session_response(user)

    @staticmethod
    def _unauthorized(code: str) -> Response:
        response = Response({"code": code, "detail": "Not signed in."}, status=status.HTTP_401_UNAUTHORIZED)
        _clear_refresh_cookie(response)
        return response


class LogoutView(PublicView):
    def post(self, request: Request) -> Response:
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw:
            # An already invalid token has nothing left to revoke.
            with contextlib.suppress(TokenError):
                parse_refresh_token(raw).blacklist()
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class PasswordResetRequestView(ThrottledPublicView):
    def post(self, request: Request) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = normalize_email_address(serializer.validated_data["email"])
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is not None:
            send_password_reset(user)
        # Same answer whether or not the account exists, to avoid leaking it.
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(ThrottledPublicView):
    def post(self, request: Request) -> Response:
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        set_password_everywhere(serializer.validated_data["user"], serializer.validated_data["new_password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        return Response(UserSerializer(request_user(request)).data)

    def patch(self, request: Request) -> Response:
        user = request_user(request)
        serializer = ChangeEmailSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        old_email = user.email
        new_email: str = serializer.validated_data["email"]
        if new_email != old_email:
            user.email = new_email
            user.save(update_fields=["email"])
            send_email_changed(old_email, new_email)
        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        user = request_user(request)
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        # Sign out every other device, then hand this one a fresh session.
        set_password_everywhere(user, serializer.validated_data["new_password"])
        return _session_response(user)
