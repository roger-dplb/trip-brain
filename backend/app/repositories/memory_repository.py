import uuid

from sqlalchemy.orm import Session

from app.models.memory import Memory
from app.schemas.memory import MemoryCreate, MemoryUpdate


class MemoryRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(
        self,
        trip_id: uuid.UUID | None = None,
        day_id: uuid.UUID | None = None,
        activity_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Memory]:
        query = self.db.query(Memory)
        if trip_id:
            query = query.filter(Memory.trip_id == trip_id)
        if day_id:
            query = query.filter(Memory.day_id == day_id)
        if activity_id:
            query = query.filter(Memory.activity_id == activity_id)

        return (
            query.order_by(Memory.created_at.desc()).offset(offset).limit(limit).all()
        )

    def get(self, memory_id: uuid.UUID) -> Memory | None:
        return self.db.query(Memory).filter(Memory.id == memory_id).first()

    def create(self, payload: MemoryCreate) -> Memory:
        memory = Memory(**payload.model_dump())
        self.db.add(memory)
        self.db.commit()
        self.db.refresh(memory)
        return memory

    def update(self, memory: Memory, payload: MemoryUpdate) -> Memory:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(memory, field, value)
        self.db.add(memory)
        self.db.commit()
        self.db.refresh(memory)
        return memory

    def delete(self, memory: Memory) -> None:
        self.db.delete(memory)
        self.db.commit()
