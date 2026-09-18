import hashlib
import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.http import FileResponse
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from core.auth import request_user
from library.models import Document
from library.serializers import SyncRequest
from library.sync import clear_logo, lock_user, sync, touch_document

# Mirrors SUPPORTED_IMAGE_TYPES in frontend/src/qr/image.ts.
LOGO_MIME_TYPES = ("image/png", "image/jpeg", "image/svg+xml")


class SyncView(APIView):
    def post(self, request: Request) -> Response:
        serializer = SyncRequest(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request_user(request)
        return Response(sync(user, serializer.validated_data))


class DocumentLogoView(APIView):
    """Binary logo of one document, stored in private blob storage."""

    def _document(self, user: User, document_id: uuid.UUID, *, for_update: bool = False) -> Document:
        queryset = Document.objects.filter(owner=user, deleted_at__isnull=True)
        if for_update:
            queryset = queryset.select_for_update()
        document = queryset.filter(pk=document_id).first()
        if document is None:
            raise NotFound(code="document_not_found")
        return document

    def get(self, request: Request, document_id: uuid.UUID) -> FileResponse:
        document = self._document(request_user(request), document_id)
        if not document.logo:
            raise NotFound(code="logo_not_found")
        response = FileResponse(document.logo.open("rb"), content_type=document.logo_mime)
        response["ETag"] = f'"{document.logo_hash}"'
        response["Cache-Control"] = "private, no-cache"
        # SVG logos are user-supplied markup: never let them run as a page.
        response["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def put(self, request: Request, document_id: uuid.UUID) -> Response:
        mime = (request.content_type or "").split(";")[0].strip().lower()
        if mime not in LOGO_MIME_TYPES:
            raise ValidationError({"logo": ["Unsupported image type."]}, code="unsupported_type")
        body = request.body
        if not body:
            raise ValidationError({"logo": ["The image is empty."]}, code="empty")
        if len(body) > settings.LOGO_MAX_BYTES:
            raise ValidationError({"logo": ["The image is too large."]}, code="too_large")
        digest = hashlib.sha256(body).hexdigest()
        user = request_user(request)
        with transaction.atomic():
            lock_user(user)
            document = self._document(user, document_id, for_update=True)
            if document.logo_hash != digest:
                clear_logo(document)
                document.logo_hash = digest
                document.logo_mime = mime
                document.logo.save(f"{document.id}", ContentFile(body), save=False)
                touch_document(document)
                document.save()
        return Response({"logoHash": document.logo_hash, "logoMime": document.logo_mime})

    def delete(self, request: Request, document_id: uuid.UUID) -> Response:
        user = request_user(request)
        with transaction.atomic():
            lock_user(user)
            document = self._document(user, document_id, for_update=True)
            if document.logo_hash:
                clear_logo(document)
                touch_document(document)
                document.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
