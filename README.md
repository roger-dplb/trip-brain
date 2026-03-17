# Trip Brain

Sistema privado de planejamento e memória de viagens com suporte a IA — geração de itinerários, busca por contexto (RAG) e exportação de stories.

## Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + pgvector + Alembic
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Worker**: pipeline assíncrono de jobs (embeddings, thumbnails, itinerários, stories)
- **Infra**: Docker + Docker Compose + MinIO

## Estrutura

```
.
├── backend/        # API FastAPI
├── frontend/       # App Next.js
├── worker/         # Worker de jobs em background
├── infra/          # Configurações de infra
├── docker/         # Scripts de backup
├── docs/           # Documentação adicional
├── schema.sql      # Init do PostgreSQL (pgvector + tabelas base)
├── docker-compose.yml
└── docker-compose.prod.yml
```

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

## Worker de jobs

O worker processa jobs da tabela `worker_jobs` com as seguintes filas:

| Job type             | Descrição                                              |
|----------------------|--------------------------------------------------------|
| `embedding_generation` | Gera embeddings das memórias via OpenAI             |
| `thumbnail_generation` | Gera thumbnails de imagens                          |
| `itinerary_generation` | Gera roteiro de viagem via LLM (assíncrono)        |
| `stories_export`       | Exporta slides da viagem como vídeo/zip             |

Constraint de idempotência: `(job_type, source_type, source_id)` — upsert seguro.

### Status de uma viagem

```
planned → generating_itinerary → planned
                               ↘ itinerary_failed  (após 3 tentativas)
```

## Endpoints principais

### Viagens
- `GET /api/v1/trips/`
- `POST /api/v1/trips/`
- `GET /api/v1/trips/{trip_id}`
- `PUT /api/v1/trips/{trip_id}`
- `DELETE /api/v1/trips/{trip_id}`

### Dias e atividades
- `GET/POST /api/v1/days/`
- `GET/PUT/DELETE /api/v1/days/{day_id}`
- `GET/POST /api/v1/activities/`
- `GET/PUT/DELETE /api/v1/activities/{activity_id}`

### RAG e IA
- `POST /api/v1/rag/query` — busca semântica por contexto
- `POST /api/v1/rag/itinerary` → `202 Accepted` — enfileira geração de itinerário

### Stories
- `POST /api/v1/trips/{trip_id}/stories/export` → `202` (novo job) ou `200` (cache válido)
- `GET /api/v1/trips/{trip_id}/stories/export/status` — status do export

### Uploads
- `POST /api/v1/uploads/presign` — gera URL assinada para upload direto no MinIO
- `POST /api/v1/uploads/complete` — persiste metadata da memória após upload

### Auth
- `POST /api/v1/auth/login` — login do casal; retorna token de sessão assinado

## Variáveis de ambiente relevantes

| Variável                     | Descrição                                          | Padrão           |
|------------------------------|----------------------------------------------------|------------------|
| `OPENAI_API_KEY`             | Chave da API OpenAI                               | —                |
| `OPENAI_EMBEDDING_MODEL`     | Modelo de embeddings                              | `text-embedding-3-small` |
| `ITINERARY_MODEL`            | Modelo usado pelo worker para gerar itinerários   | `gpt-4o`         |
| `CAPTION_MODEL`              | Modelo usado para gerar legendas dos slides       | —                |
| `APP_ENV`                    | Ambiente (`development` / `production`)           | `development`    |
| `COUPLE_AUTH_ENABLED`        | Habilita autenticação por casal                   | `false`          |

## Segurança de ambiente (produção)

Não use credenciais padrão (`minioadmin`, `trip_pass`) em produção. Defina variáveis seguras antes de subir os serviços:

```bash
export APP_ENV=production
export POSTGRES_PASSWORD=<senha-forte>
export MINIO_ROOT_USER=<usuario-forte>
export MINIO_ROOT_PASSWORD=<senha-forte>
export OPENAI_API_KEY=<chave-openai>
export COUPLE_AUTH_ENABLED=true
export COUPLE_PRIMARY_NAME=<nome-parceiro-1>
export COUPLE_PRIMARY_TOKEN=<token-forte-1>
export COUPLE_PRIMARY_USERNAME=<usuario-login-1>
export COUPLE_PRIMARY_PASSWORD=<senha-login-1>
export COUPLE_PARTNER_NAME=<nome-parceiro-2>
export COUPLE_PARTNER_TOKEN=<token-forte-2>
export COUPLE_PARTNER_USERNAME=<usuario-login-2>
export COUPLE_PARTNER_PASSWORD=<senha-login-2>
export COUPLE_AUTH_SECRET=<segredo-assinatura-token>
```

- Backend e worker validam essas configurações na inicialização e falham se detectarem valores inseguros em `APP_ENV=production`.
- Com `COUPLE_AUTH_ENABLED=true`, os endpoints em `/api/v1/*` exigem `Authorization: Bearer <token>`.

## Erros padronizados da API

```json
{
  "error": {
    "code": "not_found|conflict|validation_error|http_error",
    "message": "Mensagem de erro",
    "details": null
  }
}
```

| Status HTTP | Código            |
|-------------|-------------------|
| `404`       | `not_found`       |
| `409`       | `conflict`        |
| `422`       | `validation_error`|

## Fluxo de upload (presigned URL)

1. Frontend chama `POST /api/v1/uploads/presign` com `filename`, `content_type` e `file_size_bytes`.
2. Backend valida tipo/tamanho e retorna URL temporária de upload.
3. Frontend faz upload direto no MinIO via URL assinada.
4. Frontend chama `POST /api/v1/uploads/complete` para persistir metadata da memória.

Regras de upload:
- Objetos são enviados com ACL privada.
- Tipos permitidos vêm de `ALLOWED_UPLOAD_CONTENT_TYPES`.
- Tamanho máximo vem de `MAX_UPLOAD_SIZE_BYTES`.

## Backup rápido

- Gerar snapshot: `./docker/backup/backup.sh`
- Restaurar snapshot: `./docker/backup/restore.sh docker/backup/artifacts/<timestamp_utc>`
- Runbook completo: [docs/BACKUP_STRATEGY.md](docs/BACKUP_STRATEGY.md)
