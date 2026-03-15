def test_day_model_has_location_attributes():
    from app.models.day import Day

    assert "location_id" in Day.__table__.columns
    assert "location" in Day.__mapper__.relationships


def test_activity_model_has_location_detail_attributes():
    from app.models.activity import Activity

    assert "location_id" in Activity.__table__.columns
    assert "location_detail" in Activity.__mapper__.relationships
