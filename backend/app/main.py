import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request

from app.api.router import api_router
from app.api.routes import auth
from app.core.config import settings
from app.db.session import init_db

logger = logging.getLogger("trip_archive.api")

HTTP_REQUEST_COUNT = Counter(
    "trip_archive_http_requests_total",
    "Total number of HTTP requests processed by the API",
    ["method", "path", "status_code"],
)

HTTP_REQUEST_LATENCY_SECONDS = Histogram(
    "trip_archive_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
)


def _configure_logging() -> None:
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    _configure_logging()
    settings.validate_sensitive_settings()
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_observability_middleware(request: Request, call_next):
    start_time = time.perf_counter()
    method = request.method
    path = request.url.path

    try:
        response = await call_next(request)
    except Exception:
        elapsed_seconds = time.perf_counter() - start_time
        elapsed_ms = round(elapsed_seconds * 1000, 2)
        HTTP_REQUEST_COUNT.labels(method=method, path=path, status_code="500").inc()
        HTTP_REQUEST_LATENCY_SECONDS.labels(method=method, path=path).observe(
            elapsed_seconds
        )
        logger.error(
            json.dumps(
                {
                    "event": "http_request",
                    "method": method,
                    "path": path,
                    "status_code": 500,
                    "duration_ms": elapsed_ms,
                }
            )
        )
        raise

    route = request.scope.get("route")
    normalized_path = getattr(route, "path", path)
    status_code = response.status_code
    elapsed_seconds = time.perf_counter() - start_time
    elapsed_ms = round(elapsed_seconds * 1000, 2)

    HTTP_REQUEST_COUNT.labels(
        method=method,
        path=normalized_path,
        status_code=str(status_code),
    ).inc()
    HTTP_REQUEST_LATENCY_SECONDS.labels(method=method, path=normalized_path).observe(
        elapsed_seconds
    )
    logger.info(
        json.dumps(
            {
                "event": "http_request",
                "method": method,
                "path": normalized_path,
                "status_code": status_code,
                "duration_ms": elapsed_ms,
            }
        )
    )

    return response


def _status_to_code(status_code: int) -> str:
    if status_code == 404:
        return "not_found"
    if status_code == 409:
        return "conflict"
    if status_code == 422:
        return "validation_error"
    if status_code >= 500:
        return "internal_error"
    return "http_error"


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_: Request, exc: StarletteHTTPException):
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    details = None if isinstance(exc.detail, str) else exc.detail
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": _status_to_code(exc.status_code),
                "message": message,
                "details": details,
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "Invalid request payload",
                "details": exc.errors(),
            }
        },
    )


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/metrics", include_in_schema=False)
def metrics() -> PlainTextResponse:
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


app.include_router(api_router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
