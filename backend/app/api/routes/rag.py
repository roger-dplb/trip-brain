from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.rag import SemanticQueryRequest, SemanticQueryResponse
from app.services.rag_service import RagService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> RagService:
    return RagService(db)


@router.post("/query", response_model=SemanticQueryResponse)
def semantic_query(
    payload: SemanticQueryRequest,
    service: RagService = Depends(get_service),
):
    return service.ask_trip(
        trip_id=payload.trip_id,
        query=payload.query,
        top_k=payload.top_k,
    )
