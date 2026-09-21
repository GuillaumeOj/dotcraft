"""API error format.

Every error body carries a machine-readable ``code`` so the SPA can show a
translated message; validation errors also list per-field codes::

    {"code": "invalid", "detail": "...", "fields": {"email": [{"code": "email_taken", "message": "..."}]}}
"""

from typing import Any

from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    response = exception_handler(exc, context)
    if response is None or not isinstance(exc, exceptions.APIException):
        return response
    if isinstance(exc, exceptions.ValidationError):
        details = exc.get_full_details()
        if not isinstance(details, dict):
            details = {"non_field_errors": details}
        response.data = {"code": "invalid", "detail": "Invalid input.", "fields": details}
        return response
    codes = exc.get_codes()
    response.data = {"code": codes if isinstance(codes, str) else exc.default_code, "detail": str(exc.detail)}
    return response
