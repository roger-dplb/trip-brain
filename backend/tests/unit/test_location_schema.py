import uuid
from types import SimpleNamespace

from app.schemas.location import LocationPatchRequest, LocationResponse


def test_location_response_validates_from_attributes():
    loc = SimpleNamespace(
        id=uuid.UUID("12345678-1234-5678-1234-567812345678"),
        country="France",
        city="Paris",
        region="Montmartre",
        place_name="Sacré-Cœur",
    )
    result = LocationResponse.model_validate(loc)
    assert result.country == "France"
    assert result.city == "Paris"
    assert result.region == "Montmartre"
    assert isinstance(result.id, uuid.UUID)


def test_location_response_nullable_fields():
    loc = SimpleNamespace(
        id=uuid.uuid4(),
        country="Italy",
        city="Rome",
        region=None,
        place_name=None,
    )
    result = LocationResponse.model_validate(loc)
    assert result.region is None
    assert result.place_name is None


def test_location_patch_request_requires_country_and_city():
    req = LocationPatchRequest(country="Spain", city="Madrid")
    assert req.country == "Spain"
    assert req.city == "Madrid"
    assert req.region is None
    assert req.place_name is None
