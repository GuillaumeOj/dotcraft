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


def revoke_all_refresh_tokens(user: User) -> None:
    """Blacklist every outstanding refresh token, signing the user out everywhere."""
    for token in OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False):
        BlacklistedToken.objects.get_or_create(token=token)


class AuthThrottleMixin:
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "auth"


class RegisterView(AuthThrottleMixin, APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return _session_response(user, status_code=status.HTTP_201_CREATED)


class LoginView(AuthThrottleMixin, APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user: User = serializer.validated_data["user"]
        update_last_login(User, user)
        return _session_response(user)


class RefreshView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

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


class LogoutView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request: Request) -> Response:
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw:
            # An already invalid token has nothing left to revoke.
            with contextlib.suppress(TokenError):
                parse_refresh_token(raw).blacklist()
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class PasswordResetRequestView(AuthThrottleMixin, APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request: Request) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = normalize_email_address(serializer.validated_data["email"])
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is not None:
            send_password_reset(user)
        # Same answer whether or not the account exists, to avoid leaking it.
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(AuthThrottleMixin, APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request: Request) -> Response:
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user: User = serializer.validated_data["user"]
        with transaction.atomic():
            user.set_password(serializer.validated_data["new_password"])
            user.save(update_fields=["password"])
            revoke_all_refresh_tokens(user)
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
        with transaction.atomic():
            user.set_password(serializer.validated_data["new_password"])
            user.save(update_fields=["password"])
            # Sign out every other device, then hand this one a fresh session.
            revoke_all_refresh_tokens(user)
        return _session_response(user)
