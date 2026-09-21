import hashlib
import uuid
from collections.abc import Callable

import pytest
from django.http import FileResponse
from django.test import override_settings
from rest_framework.test import APIClient

from accounts.models import User
from library.models import Document

pytestmark = pytest.mark.django_db

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture
def doc(auth_api: APIClient) -> Document:
    folder_id = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())
    response = auth_api.post(
        "/api/v1/sync/",
        {
            "cursor": 0,
            "folders": [{"id": folder_id, "name": "P", "createdAt": 1, "updatedAt": 1}],
            "documents": [
                {"id": doc_id, "name": "D", "folderId": folder_id, "options": {}, "createdAt": 1, "updatedAt": 1}
            ],
        },
        format="json",
    )
    assert response.status_code == 200
    return Document.objects.get(pk=doc_id)


def url(document: Document | uuid.UUID) -> str:
    pk = document.pk if isinstance(document, Document) else document
    return f"/api/v1/documents/{pk}/logo/"


def put(client: APIClient, document: Document, body: bytes = PNG, content_type: str = "image/png"):
    return client.put(url(document), body, content_type=content_type)


def content(response) -> bytes:
    assert isinstance(response, FileResponse)
    return b"".join(response.streaming_content)


def test_upload_download_and_delete(auth_api: APIClient, doc: Document) -> None:
    before = doc.server_seq

    response = put(auth_api, doc)

    assert response.status_code == 200
    digest = hashlib.sha256(PNG).hexdigest()
    assert response.json() == {"logoHash": digest, "logoMime": "image/png"}
    doc.refresh_from_db()
    assert doc.server_seq > before
    assert (doc.logo.name or "").startswith(f"logos/{doc.owner_id}/{doc.id}-")

    download = auth_api.get(url(doc))
    assert download.status_code == 200
    assert content(download) == PNG
    assert download["Content-Type"] == "image/png"
    assert download["ETag"] == f'"{digest}"'
    assert "sandbox" in download["Content-Security-Policy"]

    # The change is pulled by other devices through the document's logoHash.
    pulled = auth_api.post("/api/v1/sync/", {"cursor": before}, format="json").json()
    assert pulled["documents"][0]["logoHash"] == digest

    assert auth_api.delete(url(doc)).status_code == 204
    doc.refresh_from_db()
    assert not doc.logo
    assert doc.logo_hash == ""
    assert auth_api.get(url(doc)).status_code == 404


def test_same_logo_is_not_rewritten(auth_api: APIClient, doc: Document) -> None:
    put(auth_api, doc)
    doc.refresh_from_db()
    seq = doc.server_seq

    assert put(auth_api, doc).status_code == 200
    doc.refresh_from_db()
    assert doc.server_seq == seq


def test_replacing_a_logo_updates_hash_and_mime(auth_api: APIClient, doc: Document) -> None:
    put(auth_api, doc)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"/>'

    response = put(auth_api, doc, svg, "image/svg+xml; charset=utf-8")

    assert response.json()["logoMime"] == "image/svg+xml"
    assert content(auth_api.get(url(doc))) == svg


def test_delete_without_logo_is_a_noop(auth_api: APIClient, doc: Document) -> None:
    seq = doc.server_seq

    assert auth_api.delete(url(doc)).status_code == 204
    doc.refresh_from_db()
    assert doc.server_seq == seq


@pytest.mark.parametrize(
    ("body", "content_type", "code"),
    [
        (PNG, "image/gif", "unsupported_type"),
        (b"", "image/png", "empty"),
    ],
)
def test_rejects_invalid_uploads(auth_api: APIClient, doc: Document, body: bytes, content_type: str, code: str) -> None:
    response = put(auth_api, doc, body, content_type)

    assert response.status_code == 400
    assert response.json()["fields"]["logo"][0]["code"] == code


@override_settings(LOGO_MAX_BYTES=10)
def test_rejects_large_uploads(auth_api: APIClient, doc: Document) -> None:
    response = put(auth_api, doc)

    assert response.status_code == 400
    assert response.json()["fields"]["logo"][0]["code"] == "too_large"


def test_other_users_documents_are_not_found(
    doc: Document, make_user: Callable[..., User], client_for: Callable[[User], APIClient]
) -> None:
    mallory = client_for(make_user("mallory@example.com"))

    assert put(mallory, doc).status_code == 404
    assert mallory.get(url(doc)).status_code == 404
    assert mallory.delete(url(doc)).status_code == 404


def test_deleting_a_document_removes_its_logo(
    auth_api: APIClient, doc: Document, django_capture_on_commit_callbacks
) -> None:
    put(auth_api, doc)
    doc.refresh_from_db()
    storage = doc.logo.storage
    name = doc.logo.name or ""

    # The blob is only deleted once the sync transaction commits.
    with django_capture_on_commit_callbacks(execute=True):
        auth_api.post(
            "/api/v1/sync/",
            {"cursor": 0, "documents": [{"id": str(doc.id), "updatedAt": 99, "deletedAt": 99}]},
            format="json",
        )

    assert not storage.exists(name)
    assert auth_api.get(url(doc)).status_code == 404


def test_unknown_document(auth_api: APIClient) -> None:
    assert auth_api.get(url(uuid.uuid4())).status_code == 404
