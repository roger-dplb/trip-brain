# Estratégia de Backup

## Escopo

A estratégia cobre os dois ativos críticos do projeto:

- **PostgreSQL**: dados estruturados e embeddings
- **MinIO**: mídias e artefatos de upload

## Artefatos

Cada snapshot gera:

- `postgres.dump` (pg_dump em formato custom)
- `minio-data.tar.gz` (snapshot do diretório `/data` do MinIO)
- `metadata.txt`
- `SHA256SUMS`

Local padrão dos snapshots:

- `docker/backup/artifacts/<timestamp_utc>/`

## Backup manual

Com os serviços do `docker-compose` em execução:

```bash
./docker/backup/backup.sh
```

Opcional: alterar diretório de saída:

```bash
BACKUP_DIR=/caminho/seguro ./docker/backup/backup.sh
```

## Restore

```bash
./docker/backup/restore.sh docker/backup/artifacts/<timestamp_utc>
```

O restore:

1. valida checksums (se `SHA256SUMS` existir)
2. recria o banco `trip_archive`
3. restaura o dump PostgreSQL
4. sobrescreve dados atuais do MinIO

## Frequência recomendada

- Backup diário automático
- Backup adicional antes de deploy/migração
- Teste de restore ao menos 1x por mês

## Retenção sugerida

- 7 backups diários
- 4 backups semanais
- 3 backups mensais

## Observações

- Não versionar snapshots no Git.
- Armazenar snapshots em storage externo (bucket privado ou volume dedicado).
- Criptografar snapshots em ambientes de produção.
