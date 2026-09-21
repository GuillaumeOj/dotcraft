import uuid

import pytest
from django.db import IntegrityError

from accounts.models import User

pytestmark = pytest.mark.django_db


def test_primary_key_is_uuid() -> None:
    user = User.objects.create_user("a@example.com", "pw")

    assert isinstance(user.pk, uuid.UUID)
    assert str(user) == "a@example.com"


def test_email_is_normalized_and_unique_case_insensitively() -> None:
    User.objects.create_user("  Mixed@Example.COM ", "pw")

    assert User.objects.get_by_natural_key("MIXED@example.com").email == "mixed@example.com"
    with pytest.raises(IntegrityError):
        User.objects.bulk_create([User(email="MIXED@example.com")])


def test_create_user_requires_email() -> None:
    with pytest.raises(ValueError, match="e-mail"):
        User.objects.create_user("", "pw")


def test_create_superuser() -> None:
    admin = User.objects.create_superuser("root@example.com", "pw")

    assert admin.is_staff
    assert admin.is_superuser


def test_create_superuser_rejects_non_staff() -> None:
    with pytest.raises(ValueError, match="superuser"):
        User.objects.create_superuser("root@example.com", "pw", is_staff=False)


def test_clean_normalizes_email() -> None:
    user = User(email="Upper@Example.com")
    user.clean()

    assert user.email == "upper@example.com"
