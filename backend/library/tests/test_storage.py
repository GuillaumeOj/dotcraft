from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from django.core.files.base import ContentFile
from django.test import override_settings

from library import storage as storage_module
from library.storage import BlobStorage


@pytest.fixture
def fake_blob(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    fake = MagicMock()
    fake.BlobNotFoundError = type("BlobNotFoundError", (Exception,), {})
    monkeypatch.setattr(storage_module, "blob", fake)
    return fake


def test_uses_token_from_settings() -> None:
    with override_settings(BLOB_READ_WRITE_TOKEN="settings-token"):
        assert BlobStorage().token == "settings-token"
    assert BlobStorage("explicit").token == "explicit"


def test_save_puts_a_private_blob(fake_blob: MagicMock) -> None:
    fake_blob.put.return_value = SimpleNamespace(pathname="logos/a/b")
    name = BlobStorage("t").save("logos/a/b", ContentFile(b"data"))

    assert name == "logos/a/b"
    fake_blob.put.assert_called_once_with("logos/a/b", b"data", access="private", overwrite=True, token="t")


def test_open_reads_the_private_blob(fake_blob: MagicMock) -> None:
    fake_blob.get.return_value = SimpleNamespace(content=b"bytes")

    file = BlobStorage("t").open("logos/a/b")

    assert file.read() == b"bytes"
    fake_blob.get.assert_called_once_with("logos/a/b", access="private", token="t", use_cache=False)


def test_delete(fake_blob: MagicMock) -> None:
    storage = BlobStorage("t")
    storage.delete("logos/a/b")
    storage.delete("")

    fake_blob.delete.assert_called_once_with("logos/a/b", token="t")


def test_exists_and_size(fake_blob: MagicMock) -> None:
    storage = BlobStorage("t")
    fake_blob.head.return_value = SimpleNamespace(size=42)

    assert storage.exists("x") is True
    assert storage.size("x") == 42

    fake_blob.head.side_effect = fake_blob.BlobNotFoundError()
    assert storage.exists("x") is False


def test_names_are_kept_and_urls_unsupported() -> None:
    storage = BlobStorage("t")

    assert storage.get_available_name("logos/a/b") == "logos/a/b"
    with pytest.raises(NotImplementedError):
        storage.url("logos/a/b")
