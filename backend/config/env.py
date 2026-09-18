"""Small helpers to read typed values from environment variables."""

import os
import re

from django.core.exceptions import ImproperlyConfigured

_TRUTHY = {"1", "true", "yes", "on"}
_ADMIN_PATH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")


def env_bool(name: str, *, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in _TRUTHY


def env_list(name: str, *, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if not raw:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def required_admin_path(raw: str | None, *, debug: bool) -> str:
    """Validate the admin URL segment.

    It defaults to ``admin`` in development but must be set explicitly (and be a
    single safe path segment) when ``DEBUG`` is off.
    """
    value = (raw or "").strip().strip("/")
    if not value:
        if debug:
            return "admin"
        raise ImproperlyConfigured("DJANGO_ADMIN_PATH is required when DEBUG is off.")
    if not _ADMIN_PATH_RE.match(value):
        raise ImproperlyConfigured("DJANGO_ADMIN_PATH must be a single URL segment (letters, digits, '-' or '_').")
    return value
