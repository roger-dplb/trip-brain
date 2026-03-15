import uuid

from app.models.location import Location


def test_location_model_has_expected_fields() -> None:
    loc = Location(
        trip_id=uuid.uuid4(),
        country="France",
        city="Paris",
        region="Montmartre",
        place_name="Sacré-Cœur",
    )
    assert loc.country == "France"
    assert loc.city == "Paris"
    assert loc.region == "Montmartre"
    assert loc.place_name == "Sacré-Cœur"


def test_location_model_nullable_fields_default_to_none() -> None:
    loc = Location(trip_id=uuid.uuid4(), country="Italy", city="Rome")
    assert loc.region is None
    assert loc.place_name is None
