from fastapi import APIRouter

from app.api.routes import activities, days, memories, rag, trips, uploads

api_router = APIRouter()
api_router.include_router(trips.router, prefix="/trips", tags=["trips"])
api_router.include_router(days.router, prefix="/days", tags=["days"])
api_router.include_router(activities.router, prefix="/activities", tags=["activities"])
api_router.include_router(memories.router, prefix="/memories", tags=["memories"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(rag.router, prefix="/rag", tags=["rag"])
