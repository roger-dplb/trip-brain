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

## Segurança de ambiente (produção)

- Não use credenciais padrão (`minioadmin`, `trip_pass`) em produção.
- Defina variáveis seguras antes de subir os serviços:

```bash
export APP_ENV=production
export POSTGRES_PASSWORD=<senha-forte>
export MINIO_ROOT_USER=<usuario-forte>
export MINIO_ROOT_PASSWORD=<senha-forte>
export OPENAI_API_KEY=<chave-openai>
export COUPLE_AUTH_ENABLED=true
export COUPLE_PRIMARY_NAME=<nome-parceiro-1>
export COUPLE_PRIMARY_TOKEN=<token-forte-1>
export COUPLE_PARTNER_NAME=<nome-parceiro-2>
export COUPLE_PARTNER_TOKEN=<token-forte-2>
```

- Backend e worker validam essas configurações na inicialização e falham se detectarem valores inseguros em `APP_ENV=production`.
- Com `COUPLE_AUTH_ENABLED=true`, os endpoints em `/api/v1/*` exigem `Authorization: Bearer <token>`.

## Endpoints iniciais (MVP Base)

- `GET/POST /api/v1/trips/`
- `GET/PUT/DELETE /api/v1/trips/{trip_id}`
- `GET/POST /api/v1/days/`
- `GET/PUT/DELETE /api/v1/days/{day_id}`
- `GET/POST /api/v1/activities/`
- `GET/PUT/DELETE /api/v1/activities/{activity_id}`
- `POST /api/v1/rag/query`

## Erros padronizados da API

As respostas de erro seguem o formato:

```json
{
	"error": {
		"code": "not_found|conflict|validation_error|http_error",
		"message": "Mensagem de erro",
		"details": null
	}
}
```

Status principais padronizados:

- `404` → `not_found`
- `409` → `conflict`
- `422` → `validation_error`

## Fluxo de upload (presigned URL)

1. Frontend chama `POST /api/v1/uploads/presign` com `filename`, `content_type` e `file_size_bytes`.
2. Backend valida tipo/tamanho e retorna URL temporária de upload.
3. Frontend faz upload direto no MinIO via URL assinada.
4. Frontend chama `POST /api/v1/uploads/complete` para persistir metadata da memória.

Regras atuais de segurança/upload:

- Objetos são enviados com ACL privada.
- Tipos permitidos vêm de `ALLOWED_UPLOAD_CONTENT_TYPES`.
- Tamanho máximo vem de `MAX_UPLOAD_SIZE_BYTES`.

## Observações

- O `schema.sql` inicializa o PostgreSQL com `pgvector` e tabelas base.
- O backend já está preparado para expansão de RAG, upload via presigned URL e webhook de WhatsApp.
- O worker está em modo skeleton para evoluir com filas/jobs reais na próxima fase.

## Backup rápido

- Gerar snapshot: `./docker/backup/backup.sh`
- Restaurar snapshot: `./docker/backup/restore.sh docker/backup/artifacts/<timestamp_utc>`
- Runbook completo: [docs/BACKUP_STRATEGY.md](docs/BACKUP_STRATEGY.md)
