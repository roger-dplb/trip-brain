from app.core.config import settings


def test_api_requires_bearer_when_couple_auth_enabled(client) -> None:
    snapshot = {
        "couple_auth_enabled": settings.couple_auth_enabled,
        "couple_primary_token": settings.couple_primary_token,
        "couple_partner_token": settings.couple_partner_token,
    }

    try:
        settings.couple_auth_enabled = True
        settings.couple_primary_token = "token-a"
        settings.couple_partner_token = "token-b"

        unauthorized = client.get("/api/v1/trips/")
        assert unauthorized.status_code == 401

        authorized = client.get(
            "/api/v1/trips/",
            headers={"Authorization": "Bearer token-a"},
        )
        assert authorized.status_code == 200
    finally:
        settings.couple_auth_enabled = snapshot["couple_auth_enabled"]
        settings.couple_primary_token = snapshot["couple_primary_token"]
        settings.couple_partner_token = snapshot["couple_partner_token"]


def test_login_endpoint_returns_session_token(client) -> None:
    snapshot = {
        "couple_auth_secret": settings.couple_auth_secret,
        "couple_primary_username": settings.couple_primary_username,
        "couple_primary_password": settings.couple_primary_password,
        "couple_primary_name": settings.couple_primary_name,
        "couple_auth_enabled": settings.couple_auth_enabled,
    }

    try:
        settings.couple_auth_secret = "integration-secret"
        settings.couple_primary_username = "roger"
        settings.couple_primary_password = "senha-super-forte"
        settings.couple_primary_name = "Roger"
        settings.couple_auth_enabled = True

        login_response = client.post(
            "/api/v1/auth/login",
            json={"username": "roger", "password": "senha-super-forte"},
        )

        assert login_response.status_code == 200
        payload = login_response.json()
        assert payload["access_token"]

        protected = client.get(
            "/api/v1/trips/",
            headers={"Authorization": f"Bearer {payload['access_token']}"},
        )
        assert protected.status_code == 200
    finally:
        settings.couple_auth_secret = snapshot["couple_auth_secret"]
        settings.couple_primary_username = snapshot["couple_primary_username"]
        settings.couple_primary_password = snapshot["couple_primary_password"]
        settings.couple_primary_name = snapshot["couple_primary_name"]
        settings.couple_auth_enabled = snapshot["couple_auth_enabled"]
