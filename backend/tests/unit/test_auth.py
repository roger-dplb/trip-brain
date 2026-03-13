import pytest
from app.core import auth as auth_module
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


def _restore_settings(snapshot: dict[str, object]) -> None:
    for key, value in snapshot.items():
        setattr(auth_module.settings, key, value)


def test_require_couple_auth_allows_dev_without_token() -> None:
    snapshot = {
        "app_env": auth_module.settings.app_env,
        "couple_auth_enabled": auth_module.settings.couple_auth_enabled,
    }
    try:
        auth_module.settings.app_env = "development"
        auth_module.settings.couple_auth_enabled = False

        context = auth_module.require_couple_auth(None)

        assert context.role == "owner"
    finally:
        _restore_settings(snapshot)


def test_require_couple_auth_rejects_missing_token_when_enabled() -> None:
    snapshot = {
        "app_env": auth_module.settings.app_env,
        "couple_auth_enabled": auth_module.settings.couple_auth_enabled,
    }
    try:
        auth_module.settings.app_env = "development"
        auth_module.settings.couple_auth_enabled = True

        with pytest.raises(HTTPException) as exc_info:
            auth_module.require_couple_auth(None)

        assert exc_info.value.status_code == 401
    finally:
        _restore_settings(snapshot)


def test_require_couple_auth_accepts_primary_partner_token() -> None:
    snapshot = {
        "app_env": auth_module.settings.app_env,
        "couple_auth_enabled": auth_module.settings.couple_auth_enabled,
        "couple_primary_name": auth_module.settings.couple_primary_name,
        "couple_primary_token": auth_module.settings.couple_primary_token,
    }
    try:
        auth_module.settings.app_env = "development"
        auth_module.settings.couple_auth_enabled = True
        auth_module.settings.couple_primary_name = "roger"
        auth_module.settings.couple_primary_token = "token-1"

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials="token-1",
        )
        context = auth_module.require_couple_auth(credentials)

        assert context.actor == "roger"
        assert context.role == "owner"
    finally:
        _restore_settings(snapshot)


def test_issue_and_accept_signed_session_token() -> None:
    snapshot = {
        "app_env": auth_module.settings.app_env,
        "couple_auth_enabled": auth_module.settings.couple_auth_enabled,
        "couple_auth_secret": auth_module.settings.couple_auth_secret,
        "couple_access_token_ttl_minutes": auth_module.settings.couple_access_token_ttl_minutes,
    }
    try:
        auth_module.settings.app_env = "development"
        auth_module.settings.couple_auth_enabled = True
        auth_module.settings.couple_auth_secret = "secret-123"
        auth_module.settings.couple_access_token_ttl_minutes = 60

        token, _expires_at = auth_module.issue_session_token(actor="ana")
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )

        context = auth_module.require_couple_auth(credentials)
        assert context.actor == "ana"
    finally:
        _restore_settings(snapshot)
