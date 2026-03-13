from dataclasses import dataclass
import base64
import hashlib
import hmac
import json
from secrets import compare_digest
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthContext:
    actor: str
    role: str


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def _sign(payload_b64: str) -> str:
    secret = settings.couple_auth_secret
    if not secret:
        raise RuntimeError("COUPLE_AUTH_SECRET is required to issue session tokens")

    signature = hmac.new(
        key=secret.encode("utf-8"),
        msg=payload_b64.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    return _b64url_encode(signature)


def issue_session_token(actor: str, role: str = "owner") -> tuple[str, int]:
    expires_at = int(time.time()) + settings.couple_access_token_ttl_minutes * 60
    payload = {
        "sub": actor,
        "role": role,
        "exp": expires_at,
        "typ": "couple-session",
    }
    payload_b64 = _b64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signature_b64 = _sign(payload_b64)
    return f"{payload_b64}.{signature_b64}", expires_at


def _decode_session_token(token: str) -> AuthContext | None:
    try:
        payload_b64, signature_b64 = token.split(".", maxsplit=1)
    except ValueError:
        return None

    expected_signature = _sign(payload_b64)
    if not compare_digest(signature_b64, expected_signature):
        return None

    try:
        payload_raw = _b64url_decode(payload_b64)
        payload = json.loads(payload_raw.decode("utf-8"))
    except Exception:
        return None

    if payload.get("typ") != "couple-session":
        return None

    if int(payload.get("exp", 0)) < int(time.time()):
        return None

    subject = str(payload.get("sub") or "").strip()
    role = str(payload.get("role") or "owner").strip() or "owner"
    if not subject:
        return None

    return AuthContext(actor=subject, role=role)


def authenticate_couple_credentials(username: str, password: str) -> AuthContext | None:
    primary_ok = (
        settings.couple_primary_username
        and settings.couple_primary_password
        and compare_digest(username, settings.couple_primary_username)
        and compare_digest(password, settings.couple_primary_password)
    )
    if primary_ok:
        return AuthContext(actor=settings.couple_primary_name, role="owner")

    partner_ok = (
        settings.couple_partner_username
        and settings.couple_partner_password
        and compare_digest(username, settings.couple_partner_username)
        and compare_digest(password, settings.couple_partner_password)
    )
    if partner_ok:
        return AuthContext(actor=settings.couple_partner_name, role="owner")

    return None


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

    session_context = _decode_session_token(token)
    if session_context:
        return session_context

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid access token",
    )
