"""Seed a local database with users and libraries.

    python manage.py seed [--users N] [--flush]

Creates ``admin@dotcraft.local`` (superuser) and ``user<N>@dotcraft.local``
accounts, all with the password ``password``, each owning a few projects,
nested folders and styled QR documents. Refuses to run unless DEBUG is on.
"""

import random
import time
import uuid
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from accounts.models import User
from library.models import Document, Folder, UserSettings, next_change_seq

SEED_PASSWORD = "password"  # noqa: S105 - local seed data only
SEED_DOMAIN = "dotcraft.local"

DOT_STYLES = ("square", "gapped", "rounded", "circle", "dots")
EYE_STYLES = ("square", "rounded", "circle", "droplet")
PALETTE = (
    ("#111827", "#ffffff"),
    ("#1d4ed8", "#eff6ff"),
    ("#b91c1c", "#fff1f2"),
    ("#047857", "#ecfdf5"),
    ("#7c3aed", "#f5f3ff"),
    ("#ea580c", "#fff7ed"),
)
PROJECTS = {
    "Marketing": {"Flyers": ["Summer sale", "Store opening"], "Social": ["Instagram bio"]},
    "Personal": {"Contacts": ["My business card"], "Home": ["Guest Wi-Fi"]},
    "Events": {"Conference 2026": ["Badge", "Schedule", "Feedback form"]},
}


def _contents(name: str, index: int) -> tuple[str, dict[str, Any]]:
    """One filled-in content draft; the SPA fills the other types with defaults."""
    slug = name.lower().replace(" ", "-")
    drafts: tuple[dict[str, Any], ...] = (
        {"type": "url", "url": f"https://example.com/{slug}"},
        {"type": "text", "text": f"{name} - made with Dotcraft"},
        {"type": "wifi", "ssid": "Dotcraft-Guest", "password": "welcome-home", "encryption": "WPA", "hidden": False},
        {"type": "email", "to": "hello@example.com", "subject": name, "body": ""},
        {"type": "vcard", "firstName": "Ada", "lastName": "Lovelace", "org": "Dotcraft"},
    )
    draft = drafts[index % len(drafts)]
    return draft["type"], {draft["type"]: draft}


def _options(rng: random.Random, name: str, index: int) -> dict[str, Any]:
    fill, bg = rng.choice(PALETTE)
    content_type, contents = _contents(name, index)
    return {
        "contentType": content_type,
        "contents": contents,
        "dotStyle": rng.choice(DOT_STYLES),
        "eyeStyle": rng.choice(EYE_STYLES),
        "fillColor": fill,
        "bgColor": bg,
        "margin": 4,
        "errorCorrection": "auto",
    }


class Command(BaseCommand):
    help = "Seed the local database with demo users and libraries (DEBUG only)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--users", type=int, default=3, help="Number of regular users to create.")
        parser.add_argument("--flush", action="store_true", help="Delete previously seeded users first.")

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("Refusing to seed: DEBUG is off.")
        count: int = options["users"]
        if count < 0:
            raise CommandError("--users must be positive.")

        with transaction.atomic():
            if options["flush"]:
                deleted, _ = User.objects.filter(email__endswith=f"@{SEED_DOMAIN}").delete()
                self.stdout.write(f"Flushed {deleted} seeded rows.")
            self._user(f"admin@{SEED_DOMAIN}", superuser=True)
            for n in range(1, count + 1):
                user = self._user(f"user{n}@{SEED_DOMAIN}")
                self._library(user, random.Random(n))  # noqa: S311 - deterministic demo data

        self.stdout.write(self.style.SUCCESS(f"Seeded {count} users (password: {SEED_PASSWORD!r})."))

    def _user(self, email: str, *, superuser: bool = False) -> User:
        user = User.objects.filter(email=email).first()
        if user is not None:
            self.stdout.write(f"  {email} already exists, skipping.")
            return user
        if superuser:
            user = User.objects.create_superuser(email, SEED_PASSWORD)
        else:
            user = User.objects.create_user(email, SEED_PASSWORD)
        self.stdout.write(f"  created {email}")
        return user

    def _library(self, user: User, rng: random.Random) -> None:
        if Folder.objects.filter(owner=user).exists():
            return
        now = int(time.time() * 1000)
        index = 0
        for project_name, folders in PROJECTS.items():
            project = self._folder(user, project_name, None, now)
            for folder_name, documents in folders.items():
                folder = self._folder(user, folder_name, project.id, now)
                for document_name in documents:
                    Document.objects.create(
                        id=uuid.uuid4(),
                        owner=user,
                        name=document_name,
                        folder_id=folder.id,
                        options=_options(rng, document_name, index),
                        created_at=now,
                        updated_at=now,
                        server_seq=next_change_seq(),
                    )
                    index += 1
        UserSettings.objects.update_or_create(
            user=user,
            defaults={"locale": "en", "color_format": "hex", "updated_at": now, "server_seq": next_change_seq()},
        )

    @staticmethod
    def _folder(user: User, name: str, parent_id: uuid.UUID | None, now: int) -> Folder:
        return Folder.objects.create(
            id=uuid.uuid4(),
            owner=user,
            name=name,
            parent_id=parent_id,
            created_at=now,
            updated_at=now,
            server_seq=next_change_seq(),
        )
