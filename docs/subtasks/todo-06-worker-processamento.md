# Subtasks — Worker: processamento real

## Objetivo
Trocar o placeholder por pipeline assíncrono confiável.

## Subtasks
- [ ] Escolher mecanismo de fila (Redis + RQ/Celery, etc.)
- [ ] Implementar consumidor de jobs
- [ ] Implementar job de geração de thumbnail
- [ ] Implementar job de geração de embedding
- [ ] Definir estratégia de retry/backoff
- [ ] Persistir status do job (pending/running/failed/done)
- [ ] Criar logs por job para troubleshooting

## Critérios de pronto
- [ ] Worker processa tarefas automaticamente com retry e observabilidade básica
