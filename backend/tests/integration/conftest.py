import json
from collections.abc import Generator
from unittest.mock import MagicMock, patch

import app.main as main_module
import pytest
from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models.activity import Activity
from app.models.day import Day
from app.models.location import Location
from app.models.memory import Memory
from app.models.trip import Trip
from fastapi.testclient import TestClient
from sqlalchemy import String, create_engine
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import Text, TypeDecorator


# ---------------------------------------------------------------------------
# SQLite shim for PostgreSQL ARRAY type
#
# 1.  DDL: compile ARRAY(String) as TEXT so SQLite can create the table.
# 2.  DML: a TypeDecorator stores/retrieves the list as a JSON string.
# ---------------------------------------------------------------------------


@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(element, compiler, **kw):
    return "TEXT"


class _JsonList(TypeDecorator):
    """Stores a Python list as a JSON string in SQLite TEXT columns."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return json.loads(value)


def _patch_array_column_for_sqlite():
    """Replace the ARRAY column type on Trip with _JsonList for SQLite."""
    Trip.__table__.c.destinations.type = _JsonList()


def _restore_array_column():
    """Restore the original ARRAY type on the Trip model."""
    Trip.__table__.c.destinations.type = ARRAY(String(120))


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    _patch_array_column_for_sqlite()

    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    Location.__table__.create(bind=engine)
    Trip.__table__.create(bind=engine)
    Day.__table__.create(bind=engine)
    Activity.__table__.create(bind=engine)
    Memory.__table__.create(bind=engine)

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
        # Restore the original ARRAY type so other test runs are not affected.
        _restore_array_column()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    main_module.init_db = lambda: None

    def override_get_db() -> Generator[Session, None, None]:
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    # Temporarily disable couple_auth so non-auth tests work without tokens.
    # The test_auth_integration tests re-enable auth inside their own bodies.
    original_auth_enabled = settings.couple_auth_enabled
    settings.couple_auth_enabled = False

    fake_s3 = MagicMock()
    fake_s3.head_bucket.return_value = {}
    with patch("app.services.storage_service.boto3.client", return_value=fake_s3):
        with TestClient(app) as test_client:
            yield test_client

    settings.couple_auth_enabled = original_auth_enabled
    app.dependency_overrides.clear()
