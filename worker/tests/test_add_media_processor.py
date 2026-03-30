# worker/tests/test_add_media_processor.py
import uuid
from datetime import date
from unittest.mock import MagicMock

from app.add_media.processor import _find_or_create_day, _renumber_days


# ── Unit: _renumber_days ──────────────────────────────────────────────────────

def test_renumber_days_assigns_sequential_numbers_by_date():
    days = [
        {"id": "a", "date": date(2024, 8, 17), "day_number": 3},
        {"id": "b", "date": date(2024, 8, 15), "day_number": 1},
        {"id": "c", "date": date(2024, 8, 16), "day_number": 2},
        {"id": "d", "date": None, "day_number": 4},
    ]
    result = _renumber_days(days)
    # Sorted by date (None last), reassigned 1..N
    assert result[0] == {"id": "b", "date": date(2024, 8, 15), "day_number": 1}
    assert result[1] == {"id": "c", "date": date(2024, 8, 16), "day_number": 2}
    assert result[2] == {"id": "a", "date": date(2024, 8, 17), "day_number": 3}
    assert result[3] == {"id": "d", "date": None, "day_number": 4}


def test_renumber_days_unknown_always_last():
    days = [
        {"id": "x", "date": None, "day_number": 1},
        {"id": "y", "date": date(2024, 8, 20), "day_number": 2},
    ]
    result = _renumber_days(days)
    assert result[0]["id"] == "y"
    assert result[0]["day_number"] == 1
    assert result[1]["id"] == "x"
    assert result[1]["day_number"] == 2


# ── Unit: _find_or_create_day ─────────────────────────────────────────────────

def _make_conn_with_days(existing_days):
    """
    existing_days: list of (day_id, day_number) tuples for existing rows.
    First fetchone call returns the day lookup.
    Second fetchall call returns all days for renumbering.
    """
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cursor

    # First cursor.fetchone() → day lookup (None = not found)
    # Second cursor.fetchall() → all days
    cursor.fetchone.side_effect = existing_days[:1] or [None]
    cursor.fetchall.return_value = []
    return conn, cursor


def test_find_or_create_day_returns_existing_id():
    trip_id = uuid.uuid4()
    day_id = uuid.uuid4()
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cursor
    cursor.fetchone.return_value = (day_id, 2)

    result = _find_or_create_day(conn, trip_id, "2024-08-15")

    assert result == day_id
    # Should NOT insert a new day
    insert_calls = [str(c) for c in cursor.execute.call_args_list]
    assert not any("INSERT INTO days" in c for c in insert_calls)


def test_find_or_create_day_inserts_new_day_when_not_found():
    trip_id = uuid.uuid4()
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cursor
    cursor.fetchone.return_value = None
    cursor.fetchall.return_value = []  # no existing days to renumber

    result = _find_or_create_day(conn, trip_id, "2024-08-15")

    assert isinstance(result, uuid.UUID)
    insert_calls = " ".join(str(c) for c in cursor.execute.call_args_list)
    assert "INSERT INTO days" in insert_calls
