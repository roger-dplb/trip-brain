import hashlib
import math
import uuid

from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.day import Day
from app.models.memory import Memory
from app.repositories.embedding_repository import EmbeddingRepository
from app.schemas.rag import SemanticQueryMatch, SemanticQueryResponse


class RagService:
    def __init__(self, db: Session):
        self.db = db
        self.embedding_repository = EmbeddingRepository(db)

    def ask_trip(
        self, trip_id: uuid.UUID, query: str, top_k: int
    ) -> SemanticQueryResponse:
        self._sync_trip_embeddings(trip_id)

        allowed_sources = self._allowed_sources_for_trip(trip_id)
        query_embedding = self._embed_text(query)
        results = self.embedding_repository.search_top_k(
            query_embedding=query_embedding,
            top_k=top_k,
            allowed_sources=allowed_sources,
        )

        if not results:
            return SemanticQueryResponse(
                answer=(
                    "Ainda não encontrei contexto suficiente nesta viagem para responder "
                    "com precisão. Registre mais atividades ou memórias e tente novamente."
                ),
                used_context=False,
                matches=[],
            )

        matches = [
            SemanticQueryMatch(
                source_type=embedding.source_type,
                source_id=embedding.source_id,
                content=embedding.content,
                score=max(0.0, 1.0 - distance),
            )
            for embedding, distance in results
        ]

        answer_lines = [
            "Encontrei estes pontos mais relevantes da viagem:",
            *[f"- {match.content}" for match in matches[:3]],
        ]

        return SemanticQueryResponse(
            answer="\n".join(answer_lines),
            used_context=True,
            matches=matches,
        )

    def _sync_trip_embeddings(self, trip_id: uuid.UUID) -> None:
        activities = (
            self.db.query(Activity)
            .join(Day, Activity.day_id == Day.id)
            .filter(Day.trip_id == trip_id)
            .all()
        )
        memories = self.db.query(Memory).filter(Memory.trip_id == trip_id).all()

        for activity in activities:
            content = self._activity_content(activity)
            if not content:
                continue
            self.embedding_repository.upsert(
                source_type="activity",
                source_id=activity.id,
                content=content,
                embedding=self._embed_text(content),
            )

        for memory in memories:
            content = self._memory_content(memory)
            if not content:
                continue
            self.embedding_repository.upsert(
                source_type="memory",
                source_id=memory.id,
                content=content,
                embedding=self._embed_text(content),
            )

    def _allowed_sources_for_trip(
        self, trip_id: uuid.UUID
    ) -> dict[str, set[uuid.UUID]]:
        activity_ids = {
            activity_id
            for (activity_id,) in (
                self.db.query(Activity.id)
                .join(Day, Activity.day_id == Day.id)
                .filter(Day.trip_id == trip_id)
                .all()
            )
        }
        memory_ids = {
            memory_id
            for (memory_id,) in self.db.query(Memory.id)
            .filter(Memory.trip_id == trip_id)
            .all()
        }
        return {"activity": activity_ids, "memory": memory_ids}

    def _activity_content(self, activity: Activity) -> str:
        fields = [
            activity.title,
            activity.location,
            activity.notes,
            f"status={activity.status}",
        ]
        return " | ".join([value for value in fields if value]).strip()

    def _memory_content(self, memory: Memory) -> str:
        fields = [
            f"type={memory.memory_type}",
            memory.caption,
            memory.content_text,
        ]
        return " | ".join([value for value in fields if value]).strip()

    def _embed_text(self, text: str, dimensions: int = 1536) -> list[float]:
        if not text.strip():
            return [0.0] * dimensions

        seed = hashlib.sha256(text.encode("utf-8")).digest()
        values: list[float] = []
        counter = 0

        while len(values) < dimensions:
            block = hashlib.sha256(seed + counter.to_bytes(4, byteorder="big")).digest()
            for index in range(0, len(block), 4):
                chunk = block[index : index + 4]
                integer = int.from_bytes(chunk, byteorder="big", signed=False)
                value = (integer / 4294967295.0) * 2.0 - 1.0
                values.append(value)
                if len(values) >= dimensions:
                    break
            counter += 1

        norm = math.sqrt(sum(value * value for value in values))
        if norm == 0:
            return values
        return [value / norm for value in values]
