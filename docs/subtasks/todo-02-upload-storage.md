# Subtasks — Upload e storage (MinIO)

## Objetivo
Habilitar fluxo de upload direto para object storage com presigned URL.

## Subtasks
- [x] Definir configuração S3/MinIO no backend
- [x] Criar endpoint para gerar presigned URL de upload
- [x] Criar endpoint para confirmação/salvamento de metadata
- [x] Definir padrão de chave (`trips/{trip_id}/days/{day_id}/activities/{activity_id}/...`)
- [ ] Validar tipo/tamanho de arquivo aceito
- [x] Definir bucket default
- [ ] Definir política de acesso
- [ ] Documentar fluxo no README técnico

## Critérios de pronto
- [ ] Upload funcional de foto e vídeo via frontend
- [x] Metadata persistida e vinculada à atividade/memória
