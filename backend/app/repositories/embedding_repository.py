import uuid

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.embedding import Embedding


class EmbeddingRepository:
    def __init__(self, db: Session):
        self.db = db

    def upsert(
        self,
        source_type: str,
        source_id: uuid.UUID,
        content: str,
        embedding: list[float],
    ) -> Embedding:
        existing = (
            self.db.query(Embedding)
            .filter(
                Embedding.source_type == source_type,
                Embedding.source_id == source_id,
            )
            .first()
        )

        if existing:
            existing.content = content
            existing.embedding = embedding
            self.db.add(existing)
            self.db.commit()
            self.db.refresh(existing)
            return existing

        entity = Embedding(
            source_type=source_type,
            source_id=source_id,
            content=content,
            embedding=embedding,
        )
        self.db.add(entity)
        self.db.commit()
        self.db.refresh(entity)
        return entity

    def search_top_k(
        self,
        query_embedding: list[float],
        top_k: int,
        allowed_sources: dict[str, set[uuid.UUID]],
    ) -> list[tuple[Embedding, float]]:
        filters = []
        for source_type, source_ids in allowed_sources.items():
            if not source_ids:
                continue
            filters.append(
                and_(
                    Embedding.source_type == source_type,
                    Embedding.source_id.in_(list(source_ids)),
                )
            )

        if not filters:
            return []

        distance = Embedding.embedding.cosine_distance(query_embedding).label(
            "distance"
        )
        rows = (
            self.db.query(Embedding, distance)
            .filter(Embedding.embedding.is_not(None))
            .filter(or_(*filters))
            .order_by(distance.asc())
            .limit(top_k)
            .all()
        )
        return [(embedding, float(raw_distance)) for embedding, raw_distance in rows]
