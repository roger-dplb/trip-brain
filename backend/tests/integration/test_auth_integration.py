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
