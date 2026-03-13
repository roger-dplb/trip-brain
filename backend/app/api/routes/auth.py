from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import (
    AuthContext,
    authenticate_couple_credentials,
    issue_session_token,
    require_couple_auth,
)
from app.core.config import settings
from app.schemas.auth import LoginRequest, LoginResponse, MeResponse

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    has_primary_credentials = bool(
        settings.couple_primary_username and settings.couple_primary_password
    )
    has_partner_credentials = bool(
        settings.couple_partner_username and settings.couple_partner_password
    )

    if not settings.couple_auth_secret or not (
        has_primary_credentials or has_partner_credentials
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login is not configured",
        )

    auth_context = authenticate_couple_credentials(
        username=payload.username,
        password=payload.password,
    )
    if not auth_context:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    access_token, expires_at = issue_session_token(
        actor=auth_context.actor,
        role=auth_context.role,
    )
    return LoginResponse(
        access_token=access_token,
        expires_at=expires_at,
        actor=auth_context.actor,
        role=auth_context.role,
    )


@router.get("/me", response_model=MeResponse)
def me(auth_context: AuthContext = Depends(require_couple_auth)):
    return MeResponse(actor=auth_context.actor, role=auth_context.role)
