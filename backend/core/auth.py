from rest_framework.exceptions import NotAuthenticated
from rest_framework.request import Request
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User


def request_user(request: Request) -> User:
    """The authenticated ``User`` of a request guarded by ``IsAuthenticated``."""
    user = request.user
    if not isinstance(user, User):
        raise NotAuthenticated
    return user


def parse_refresh_token(raw: str) -> RefreshToken:
    """Decode and verify an encoded refresh token (raises ``TokenError``).

    simplejwt annotates ``Token.__init__`` as taking a ``Token``, but its
    documented and actual input is the encoded string.
    """
    return RefreshToken(raw)  # ty: ignore[invalid-argument-type]
