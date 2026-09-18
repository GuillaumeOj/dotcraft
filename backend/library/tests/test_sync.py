import uuid
from collections.abc import Callable
from typing import Any

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from library import sync as sync_module
from library.models import Document, Folder, UserSettings

pytestmark = pytest.mark.django_db

URL = "/api/v1/sync/"


def folder(updated_at: int = 1000, **extra: Any) -> dict[str, Any]:
    return {
        "id": str(extra.pop("id", uuid.uuid4())),
        "name": "Project",
        "parentId": None,
        "createdAt": 1000,
        "updatedAt": updated_at,
        **extra,
    }


def document(folder_id: str, updated_at: int = 1000, **extra: Any) -> dict[str, Any]:
    return {
        "id": str(extra.pop("id", uuid.uuid4())),
        "name": "QR",
        "folderId": folder_id,
        "options": {"dotStyle": "rounded", "fillColor": "#000000"},
        "createdAt": 1000,
        "updatedAt": updated_at,
        **extra,
    }


def post(client: APIClient, **payload: Any) -> dict[str, Any]:
    response = client.post(URL, {"cursor": 0, **payload}, format="json")
    assert response.status_code == 200, response.json()
    return response.json()


def test_requires_authentication(api: APIClient) -> None:
    assert api.post(URL, {}, format="json").status_code == 401


def test_empty_sync(auth_api: APIClient) -> None:
    body = post(auth_api)

    assert body == {"cursor": 0, "folders": [], "documents": [], "settings": None, "rejected": [], "hasMore": False}


def test_push_creates_records_and_does_not_echo_them(auth_api: APIClient, user: User) -> None:
    f = folder()
    d = document(f["id"])

    body = post(auth_api, folders=[f], documents=[d])

    assert body["folders"] == []
    assert body["documents"] == []
    assert body["cursor"] > 0
    stored = Document.objects.get(pk=d["id"])
    assert stored.owner == user
    assert stored.options == d["options"]
    assert Folder.objects.get(pk=f["id"]).name == "Project"


def test_pull_returns_changes_since_cursor(
    auth_api: APIClient, user: User, client_for: Callable[[User], APIClient]
) -> None:
    other_device = client_for(user)
    f = folder()
    first = post(auth_api, folders=[f])

    # Another device pushes a document; the first device pulls it.
    d = document(f["id"])
    post(other_device, cursor=first["cursor"], documents=[d])
    body = post(auth_api, cursor=first["cursor"])

    assert [row["id"] for row in body["documents"]] == [d["id"]]
    assert body["documents"][0]["logoHash"] is None
    assert body["folders"] == []
    # Nothing new after that.
    assert post(auth_api, cursor=body["cursor"])["documents"] == []


def test_newer_update_wins(auth_api: APIClient) -> None:
    f = folder(updated_at=1000)
    post(auth_api, folders=[f])

    post(auth_api, folders=[{**f, "name": "Renamed", "updatedAt": 2000, "parentId": str(uuid.uuid4())}])

    stored = Folder.objects.get(pk=f["id"])
    assert stored.name == "Renamed"
    assert stored.updated_at == 2000
    assert stored.parent_id is not None


def test_older_update_is_ignored_and_server_version_echoed(auth_api: APIClient) -> None:
    f = folder(updated_at=2000, name="Server")
    body = post(auth_api, folders=[f])

    body = post(auth_api, cursor=body["cursor"], folders=[{**f, "name": "Stale", "updatedAt": 1000}])

    assert Folder.objects.get(pk=f["id"]).name == "Server"
    assert [row["name"] for row in body["folders"]] == ["Server"]


def test_equal_timestamp_is_a_noop(auth_api: APIClient) -> None:
    f = folder(updated_at=1000)
    first = post(auth_api, folders=[f])

    body = post(auth_api, cursor=first["cursor"], folders=[{**f, "name": "Same time"}])

    assert Folder.objects.get(pk=f["id"]).name == "Project"
    assert body["folders"] == []
    assert body["cursor"] == first["cursor"]


def test_tombstone_beats_older_edit(auth_api: APIClient) -> None:
    f = folder(updated_at=1000)
    d = document(f["id"], updated_at=1000)
    post(auth_api, folders=[f], documents=[d])

    post(auth_api, documents=[{"id": d["id"], "updatedAt": 3000, "deletedAt": 3000}])
    body = post(auth_api, documents=[{**d, "name": "Edited offline", "updatedAt": 2000}])

    stored = Document.objects.get(pk=d["id"])
    assert stored.deleted_at == 3000
    assert stored.name == "QR"
    assert body["documents"][0]["deletedAt"] == 3000


def test_newer_edit_resurrects_a_tombstone(auth_api: APIClient) -> None:
    f = folder()
    post(auth_api, folders=[f])
    post(auth_api, folders=[{"id": f["id"], "updatedAt": 2000, "deletedAt": 2000}])

    post(auth_api, folders=[{**f, "name": "Back", "updatedAt": 3000}])

    stored = Folder.objects.get(pk=f["id"])
    assert stored.deleted_at is None
    assert stored.name == "Back"


def test_unknown_tombstone_is_stored(auth_api: APIClient) -> None:
    doc_id = str(uuid.uuid4())

    post(auth_api, documents=[{"id": doc_id, "updatedAt": 5000, "deletedAt": 5000}])

    stored = Document.objects.get(pk=doc_id)
    assert stored.is_deleted
    assert stored.created_at == 5000
    assert stored.folder_id == uuid.UUID(int=0)


def test_foreign_ids_are_rejected(
    auth_api: APIClient, make_user: Callable[..., User], client_for: Callable[[User], APIClient]
) -> None:
    mallory = make_user("mallory@example.com")
    f = folder()
    d = document(f["id"])
    post(auth_api, folders=[f], documents=[d])

    body = post(
        client_for(mallory),
        folders=[{**f, "name": "Hijacked", "updatedAt": 9000}],
        documents=[{**d, "name": "Hijacked", "updatedAt": 9000}],
    )

    assert sorted(body["rejected"]) == sorted([f["id"], d["id"]])
    assert Folder.objects.get(pk=f["id"]).name == "Project"
    assert Document.objects.get(pk=d["id"]).name == "QR"
    # And mallory never sees ada's records.
    assert body["folders"] == []
    assert body["documents"] == []


def test_settings_last_write_wins(auth_api: APIClient, user: User, client_for: Callable[[User], APIClient]) -> None:
    first = post(auth_api, settings={"locale": "fr", "colorFormat": "hsl", "updatedAt": 1000})
    assert first["settings"] is None
    stored = UserSettings.objects.get(user=user)
    assert (stored.locale, stored.color_format) == ("fr", "hsl")

    # Another device pulls them.
    pulled = post(client_for(user))
    assert pulled["settings"] == {"locale": "fr", "colorFormat": "hsl", "updatedAt": 1000}

    # A stale write is ignored and answered with the server value.
    stale = post(auth_api, cursor=first["cursor"], settings={"locale": "de", "colorFormat": "hex", "updatedAt": 500})
    assert stale["settings"]["locale"] == "fr"

    # Same timestamp: nothing to do, nothing sent.
    same = post(auth_api, cursor=first["cursor"], settings={"locale": "fr", "colorFormat": "hsl", "updatedAt": 1000})
    assert same["settings"] is None


def test_pagination(auth_api: APIClient, user: User, monkeypatch: pytest.MonkeyPatch, client_for) -> None:
    monkeypatch.setattr(sync_module, "PAGE_SIZE", 2)
    f = folder()
    docs = [document(f["id"]) for _ in range(3)]
    post(client_for(user), folders=[f], documents=docs)

    page1 = post(auth_api)
    page2 = post(auth_api, cursor=page1["cursor"])

    assert page1["hasMore"] is True
    assert len(page1["folders"]) + len(page1["documents"]) == 2
    assert page2["hasMore"] is False
    seen = {r["id"] for page in (page1, page2) for r in page["folders"] + page["documents"]}
    assert seen == {f["id"], *(d["id"] for d in docs)}


def test_logo_is_stripped_from_options(auth_api: APIClient) -> None:
    f = folder()
    d = document(f["id"], options={"logo": "data:image/png;base64,AAAA", "dotStyle": "dots"})

    post(auth_api, folders=[f], documents=[d])

    assert Document.objects.get(pk=d["id"]).options == {"logo": None, "dotStyle": "dots"}


@pytest.mark.parametrize(
    "payload",
    [
        {"folders": [{"id": "not-a-uuid", "updatedAt": 1}]},
        {"folders": [{"id": str(uuid.uuid4()), "updatedAt": 1}]},  # live folder without a name
        {"documents": [{"id": str(uuid.uuid4()), "name": "x", "createdAt": 1, "updatedAt": 1}]},
        {"documents": [document(str(uuid.uuid4()), options={"blob": "x" * 70_000})]},
        {"settings": {"locale": "xx", "updatedAt": 1}},
        {"cursor": -1},
    ],
)
def test_validation_errors(auth_api: APIClient, payload: dict[str, Any]) -> None:
    response = auth_api.post(URL, {"cursor": 0, **payload}, format="json")

    assert response.status_code == 400
    assert response.json()["code"] == "invalid"


def test_null_settings_are_accepted(auth_api: APIClient) -> None:
    assert post(auth_api, settings=None)["settings"] is None


def test_str_representations(auth_api: APIClient, user: User) -> None:
    f = folder(name="Named")
    post(auth_api, folders=[f], settings={"locale": "en", "colorFormat": "hex", "updatedAt": 1})

    assert str(Folder.objects.get(pk=f["id"])) == "Named"
    assert str(UserSettings.objects.get(user=user)) == f"Settings of {user.id}"
