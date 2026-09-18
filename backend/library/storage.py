"""Django storage backed by a private Vercel Blob store.

Files are never exposed through public URLs: the API streams them to their
owner after checking permissions, so ``url()`` is intentionally unsupported.
"""

from django.conf import settings
from django.core.files.base import ContentFile, File
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible
from vercel import blob


@deconstructible
class BlobStorage(Storage):
    def __init__(self, token: str | None = None) -> None:
        self.token = token or settings.BLOB_READ_WRITE_TOKEN

    def _save(self, name: str, content: File) -> str:
        content.seek(0)
        result = blob.put(
            name,
            content.read(),
            access="private",
            content_type=getattr(content, "content_type", None),
            overwrite=True,
            token=self.token,
        )
        return result.pathname

    def _open(self, name: str, mode: str = "rb") -> File:
        result = blob.get(name, access="private", token=self.token, use_cache=False)
        return ContentFile(result.content, name=name)

    def delete(self, name: str) -> None:
        if name:
            blob.delete(name, token=self.token)

    def exists(self, name: str) -> bool:
        try:
            blob.head(name, token=self.token)
        except blob.BlobNotFoundError:
            return False
        return True

    def size(self, name: str) -> int:
        return blob.head(name, token=self.token).size

    def get_available_name(self, name: str, max_length: int | None = None) -> str:
        # Names already embed the content hash, and uploads overwrite.
        return name

    def url(self, name: str | None) -> str:
        raise NotImplementedError("Private blobs are served through the API, not by URL.")
