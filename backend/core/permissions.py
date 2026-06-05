from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission


def _expected_token() -> str:
    return (getattr(settings, "WRITE_TOKEN", "") or "").strip()


def _provided_token(request) -> str:
    return (request.headers.get("X-Anno-Lab-Write-Token", "") or "").strip()


class HasWriteToken(BasePermission):
    """Simple header-based write protection for shared deployments.

    Allows read-only requests without a token.
    Requires header for write methods:
      X-Anno-Lab-Write-Token: <token>

    Disable by leaving WRITE_TOKEN empty.
    """

    message = "Missing or invalid write token."

    def has_permission(self, request, view):
        # Always allow safe/read methods
        if request.method in SAFE_METHODS:
            return True

        token = _expected_token()
        if not token:
            return True  # disabled

        return _provided_token(request) == token


class HasOperatorToken(BasePermission):
    """Require the operator token even for read-only raw-export access."""

    message = "Missing or invalid operator token."

    def has_permission(self, request, view):
        token = _expected_token()
        if not token:
            return True
        return _provided_token(request) == token
