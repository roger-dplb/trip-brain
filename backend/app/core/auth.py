from dataclasses import dataclass
from secrets import compare_digest

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthContext:
    actor: str
    role: str


def _is_auth_required() -> bool:
    return settings.couple_auth_enabled or settings.is_production()


def require_couple_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthContext:
    if not _is_auth_required():
        return AuthContext(actor="local-dev", role="owner")

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization scheme",
        )

    token = credentials.credentials

    if compare_digest(token, settings.couple_primary_token):
        return AuthContext(actor=settings.couple_primary_name, role="owner")

    if compare_digest(token, settings.couple_partner_token):
        return AuthContext(actor=settings.couple_partner_name, role="owner")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid access token",
    )
