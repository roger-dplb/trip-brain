# Subtasks — Worker: processamento real

## Objetivo
Trocar o placeholder por pipeline assíncrono confiável.

## Subtasks
- [x] Escolher mecanismo de fila (Redis + RQ/Celery, etc.)
- [x] Implementar consumidor de jobs
- [x] Implementar job de geração de thumbnail
- [x] Implementar job de geração de embedding
- [x] Definir estratégia de retry/backoff
- [x] Persistir status do job (pending/running/failed/done)
- [x] Criar logs por job para troubleshooting

## Critérios de pronto
- [x] Worker processa tarefas automaticamente com retry e observabilidade básica
