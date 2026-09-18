from collections.abc import Callable
from typing import Any

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User

PASSWORD = "correct-horse-battery"


@pytest.fixture(autouse=True)
def _clear_throttle_cache() -> None:
    cache.clear()


@pytest.fixture
def api() -> APIClient:
    return APIClient()


@pytest.fixture
def make_user(db: None) -> Callable[..., User]:
    counter = iter(range(1, 10_000))

    def factory(email: str | None = None, password: str = PASSWORD, **extra: Any) -> User:
        return User.objects.create_user(email or f"user{next(counter)}@example.com", password, **extra)

    return factory


@pytest.fixture
def user(make_user: Callable[..., User]) -> User:
    return make_user("ada@example.com")


@pytest.fixture
def auth_api(user: User) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


@pytest.fixture
def client_for() -> Callable[[User], APIClient]:
    def factory(owner: User) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(owner).access_token}")
        return client

    return factory
