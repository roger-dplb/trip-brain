from collections.abc import Generator

import app.main as main_module
import pytest
from app.db.session import get_db
from app.main import app
from app.models.activity import Activity
from app.models.day import Day
from app.models.memory import Memory
from app.models.trip import Trip
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

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


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    main_module.init_db = lambda: None

    def override_get_db() -> Generator[Session, None, None]:
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
