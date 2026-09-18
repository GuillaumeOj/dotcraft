"""Settings used by the test suite."""

import os

os.environ.setdefault("DJANGO_DEBUG", "1")
os.environ.pop("BLOB_READ_WRITE_TOKEN", None)
os.environ.pop("BREVO_API_KEY", None)
os.environ.pop("EMAIL_HOST", None)

from config.settings import *  # noqa: F403

MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
FRONTEND_URL = "http://testserver.local"
# No collected static files in tests.
MIDDLEWARE = [m for m in MIDDLEWARE if "whitenoise" not in m]  # noqa: F405
