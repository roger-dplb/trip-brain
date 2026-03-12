# AGENTS PARALLEL EXECUTION PLAN

Plano de execução com agentes em paralelo para acelerar entrega sem quebrar dependências.

## Regras de paralelismo
- Só executar em paralelo tarefas sem dependência direta de contrato/API.
- Tarefas que definem contratos (`backend endpoints`, `schemas`, `payloads`) são bloqueantes para frontend e integrações.
- Cada agente deve abrir PR/commit lógico por trilha, evitando conflitos de arquivos.

---

## Fase 1 — Fundação funcional (paralelo)

### Agent A — Backend Core
**Escopo**
- `todo-01-backend-dominio-regras`

**Entregas**
- CRUD de memórias
- Timeline por viagem
- Validações de domínio
- Paginação/filtros
- Erros padronizados

**Bloqueia**
- Agent C (Frontend) para telas dependentes de novos endpoints
- Agent D (WhatsApp) para intents com timeline/memórias

### Agent B — Upload/Storage API
**Escopo**
- `todo-02-upload-storage`

**Entregas**
- Presigned URL
- Persistência de metadata
- Padrão de chave no MinIO

**Bloqueia**
- Agent C (Frontend upload)
- Agent E (Worker thumbnails em mídia real)

### Agent G — Qualidade mínima contínua
**Escopo**
- Parte inicial de `todo-07-qualidade-seguranca-operacao`

**Entregas**
- Lint/format no CI
- Esqueleto de testes backend/frontend
- Pipeline de validação

**Pode rodar em paralelo com**
- A, B, C, D, E, F (baixo acoplamento)

---

## Fase 2 — Produto e processamento (paralelo após Fase 1)

### Agent C — Frontend Produto
**Escopo**
- `todo-05-frontend-evolucao`

**Pré-requisitos**
- Contratos dos endpoints de A e B estáveis

**Entregas**
- Form de criação de viagem
- Edição/remoção de atividades
- Timeline UI
- Memórias/galeria UI
- Upload com presigned URL

### Agent E — Worker Real
**Escopo**
- `todo-06-worker-processamento`

**Pré-requisitos**
- Fluxo de upload/metadata (B)

**Entregas**
- Consumo de fila
- Jobs de thumbnail
- Jobs de embedding
- Retry/status/logs

### Agent F — IA/RAG
**Escopo**
- `todo-03-ia-rag`

**Pré-requisitos**
- Embeddings e dados disponíveis (A + E)

**Entregas**
- Geração de roteiro
- Busca vetorial
- Montagem de contexto
- Endpoint de consulta semântica

---

## Fase 3 — Canal conversacional e hardening

### Agent D — WhatsApp
**Escopo**
- `todo-04-whatsapp-integracao`

**Pré-requisitos**
- Endpoint de consulta RAG funcional (F)
- Endpoints de memória/timeline funcionais (A)

**Entregas**
- Webhook
- Auth por número
- Roteamento de intenção
- Resposta via RAG

### Agent G — Qualidade/Segurança final
**Escopo**
- Restante de `todo-07-qualidade-seguranca-operacao`

**Entregas**
- Testes de integração completos
- Observabilidade
- Hardening de segredos
- Backup strategy

---

## Matriz rápida de bloqueios
- A bloqueia: C, D, F
- B bloqueia: C, E
- E habilita: F
- F habilita: D
- G: paralelo em todas as fases

---

## Ordem sugerida de start
1. Iniciar em paralelo: **A + B + G**
2. Quando A/B finalizarem contratos: iniciar **C + E**
3. Quando E estiver gerando embeddings: iniciar **F**
4. Quando F estiver estável: iniciar **D**
5. G acompanha e fecha hardening no final
