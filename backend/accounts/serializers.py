from typing import Any

from django.contrib.auth import authenticate, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.exceptions import ErrorDetail

from accounts.models import User, normalize_email_address
from accounts.tokens import password_reset_token


def _validate_password(password: str, user: User | None = None) -> str:
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as exc:
        # Keep Django's codes (password_too_short, password_too_common, ...) so
        # the SPA can show a translated message for each failed rule.
        details = [
            ErrorDetail(message, code=error.code or "password_invalid")
            for error in exc.error_list
            for message in error.messages
        ]
        raise serializers.ValidationError(details) from exc
    return password


def _ensure_email_available(email: str, *, exclude: User | None = None) -> str:
    email = normalize_email_address(email)
    taken = User.objects.filter(email__iexact=email)
    if exclude is not None:
        taken = taken.exclude(pk=exclude.pk)
    if taken.exists():
        raise serializers.ValidationError("This e-mail is already registered.", code="email_taken")
    return email


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "date_joined")
        read_only_fields = fields


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, value: str) -> str:
        return _ensure_email_available(value)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        try:
            _validate_password(attrs["password"], User(email=attrs["email"]))
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"password": exc.detail}) from exc
        return attrs

    def create(self, validated_data: dict[str, Any]) -> User:
        return User.objects.create_user(validated_data["email"], validated_data["password"])


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        user = authenticate(
            self.context.get("request"),
            username=normalize_email_address(attrs["email"]),
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError("Invalid e-mail or password.", code="invalid_credentials")
        attrs["user"] = user
        return attrs


class CurrentPasswordMixin(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value: str) -> str:
        user: User = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("The current password is incorrect.", code="wrong_password")
        return value


class ChangeEmailSerializer(CurrentPasswordMixin):
    email = serializers.EmailField()

    def validate_email(self, value: str) -> str:
        return _ensure_email_available(value, exclude=self.context["request"].user)


class ChangePasswordSerializer(CurrentPasswordMixin):
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_new_password(self, value: str) -> str:
        return _validate_password(value, self.context["request"].user)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        invalid = serializers.ValidationError(
            {"token": ["This reset link is invalid or has expired."]}, code="invalid_token"
        )
        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=user_id, is_active=True)
        except (ValueError, TypeError, OverflowError, DjangoValidationError, User.DoesNotExist) as exc:
            raise invalid from exc
        if not password_reset_token.check_token(user, attrs["token"]):
            raise invalid
        try:
            _validate_password(attrs["new_password"], user)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.detail}) from exc
        attrs["user"] = user
        return attrs
