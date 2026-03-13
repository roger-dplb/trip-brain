# Infraestrutura

## Serviços

Stack sugerida:

- postgres
- minio
- backend
- worker
- redis (opcional)

---

## PostgreSQL

Banco principal do sistema.

Extensão utilizada:

pgvector

Armazena:

- dados estruturados
- embeddings

---

## MinIO

Object storage compatível com S3.

Utilizado para:

- fotos
- vídeos

Estrutura:

trips/{trip_id}/days/{day_id}/activities/{activity_id}/media.jpg

---

## Upload de mídia

Fluxo recomendado:

cliente solicita upload  
↓  
API gera presigned URL  
↓  
cliente envia direto ao MinIO  
↓  
metadata salva no banco

---

## Docker Compose (exemplo)

services:

postgres  
image: pgvector/pgvector:pg16

minio  
image: minio/minio

backend  
build: ./backend

worker  
build: ./worker

---

## Backup e restore

Estratégia documentada em:

- [BACKUP_STRATEGY](BACKUP_STRATEGY.md)

Scripts operacionais:

- `./docker/backup/backup.sh`
- `./docker/backup/restore.sh docker/backup/artifacts/<timestamp_utc>`