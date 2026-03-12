# Trip Archive

Esqueleto inicial do sistema privado para planejamento e memória de viagens com suporte a IA.

## Stack

- Backend: FastAPI + SQLAlchemy + PostgreSQL + pgvector + Alembic
- Frontend: Next.js (App Router) + React + TypeScript + Tailwind + base shadcn/ui
- Infra: Docker + Docker Compose + MinIO
- Worker: pipeline assíncrono (embeddings e thumbnails) — base inicial

## Estrutura

- `docs/`
- `backend/`
- `frontend/`
- `worker/`
- `infra/`
- `schema.sql`
- `docker-compose.yml`

## Como rodar localmente

1. Suba os serviços:

```bash
docker compose up --build
```

2. Acesse:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- MinIO API: http://localhost:9000
- MinIO Console: http://localhost:9001

## Endpoints iniciais (MVP Base)

- `GET/POST /api/v1/trips/`
- `GET/PUT/DELETE /api/v1/trips/{trip_id}`
- `GET/POST /api/v1/days/`
- `GET/PUT/DELETE /api/v1/days/{day_id}`
- `GET/POST /api/v1/activities/`
- `GET/PUT/DELETE /api/v1/activities/{activity_id}`

## Observações

- O `schema.sql` inicializa o PostgreSQL com `pgvector` e tabelas base.
- O backend já está preparado para expansão de RAG, upload via presigned URL e webhook de WhatsApp.
- O worker está em modo skeleton para evoluir com filas/jobs reais na próxima fase.
