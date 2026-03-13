import pytest

from app.main import _status_to_code


@pytest.mark.parametrize(
    ("status_code", "expected"),
    [
        (404, "not_found"),
        (409, "conflict"),
        (422, "validation_error"),
        (500, "internal_error"),
        (503, "internal_error"),
        (401, "http_error"),
    ],
)
def test_status_to_code_mapping(status_code: int, expected: str) -> None:
    assert _status_to_code(status_code) == expected
