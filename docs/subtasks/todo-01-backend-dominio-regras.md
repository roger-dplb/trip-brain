# Subtasks — Backend: domínio e regras de negócio

## Objetivo
Cobrir regras de domínio e APIs faltantes do núcleo de viagem.

## Subtasks
- [x] Criar CRUD de `memories` (schemas, repository, service, routes)
- [x] Criar endpoint de timeline por viagem (`GET /trips/{id}/timeline`)
- [x] Validar datas da viagem (`start_date <= end_date`)
- [x] Validar `day_number` único por viagem
- [x] Restringir status de atividade (`planned`, `done`, `skipped`)
- [x] Adicionar paginação em listagens (`limit`, `offset`)
- [x] Adicionar filtros básicos (`trip_id`, `day_id`, status, range de datas)
- [x] Padronizar respostas de erro (`404`, `422`, `409`)

## Critérios de pronto
- [x] Endpoints com contratos Pydantic consistentes
- [ ] Regras de domínio cobertas por testes unitários
