# TASKS — Trip Archive

Checklist do projeto com status atual da implementação.

## ✅ Já implementado

### Estrutura e organização
- [x] Estrutura base do repositório (`docs`, `backend`, `frontend`, `worker`, `infra`)
- [x] Arquivo raiz `docker-compose.yml`
- [x] `README.md` com instruções de execução local

### Backend (FastAPI)
- [x] Estrutura modular por camadas (`api`, `services`, `repositories`, `models`, `schemas`)
- [x] Configuração inicial FastAPI com rota de health check
- [x] Configuração PostgreSQL com SQLAlchemy
- [x] Suporte a pgvector
- [x] Modelos base: trips, days, activities, memories, embeddings
- [x] CRUD de `trips`
- [x] CRUD de `days`
- [x] CRUD de `activities`
- [x] Alembic configurado
- [x] Migração inicial criada

### Banco de dados
- [x] `schema.sql` inicial
- [x] Extensão `vector` habilitada
- [x] Índices principais de relacionamento
- [x] Índice vetorial `ivfflat` na tabela de embeddings

### Frontend (Next.js)
- [x] Estrutura Next.js App Router com TypeScript
- [x] Tailwind configurado
- [x] Base de componentes no padrão shadcn/ui
- [x] Página de lista de viagens (`/trips`)
- [x] Página de detalhe da viagem (`/trips/[tripId]`)
- [x] Cliente de API frontend para consumo do backend
- [x] Ajuste para URL interna em Docker (`INTERNAL_API_BASE_URL`)

### Infraestrutura / Docker
- [x] Serviço `postgres` com imagem `pgvector/pgvector:pg16`
- [x] Serviço `minio`
- [x] Serviço `backend`
- [x] Serviço `frontend`
- [x] Serviço `worker`
- [x] Healthcheck no `postgres`
- [x] Healthcheck no `backend`
- [x] `frontend` aguardando `backend` saudável (`depends_on: condition: service_healthy`)

### Worker
- [x] Estrutura inicial do worker
- [x] Loop placeholder para processamento assíncrono

---

## ⏳ Falta implementar

### Backend — domínio e regras de negócio
- [x] CRUD de memórias
- [x] Endpoint de timeline por viagem
- [x] Validações de domínio (datas da viagem, consistência de day_number, status permitidos)
- [x] Paginação e filtros nos endpoints
- [x] Tratamento de erros padronizado (response model de erro)

### Upload e storage
- [x] Endpoint para geração de presigned URL (upload)
- [x] Endpoint para metadata de mídia após upload
- [x] Estrutura de bucket/prefix (`trips/{trip_id}/days/{day_id}/activities/{activity_id}/...`)
- [x] Validação de tipo/tamanho no presign
- [x] Política base de segurança no MinIO (upload privado)

### IA / RAG
- [ ] Serviço de geração de roteiro com LLM
- [ ] Pipeline real de embeddings (producer/consumer)
- [ ] Busca semântica em `embeddings`
- [ ] Montagem de contexto para resposta RAG
- [ ] Endpoints de consulta inteligente

### WhatsApp (integração futura)
- [ ] Endpoint de webhook
- [ ] Autorização por número de telefone
- [ ] Identificação de intenção (roteiro, memória, adicionar memória, replanejamento)
- [ ] Resposta assistida por RAG via WhatsApp

### Frontend — evolução de produto
- [x] Tela de criação de viagem com formulário
- [ ] Edição e remoção de atividades na UI
- [x] Tela de timeline (`/trips/[tripId]/timeline`)
- [x] Tela de memórias/galeria (`/trips/[tripId]/memories`)
- [x] Fluxo de upload com presigned URL
- [x] Feedback de carregamento/erro e estados vazios mais completos

### Worker — processamento real
- [ ] Consumo de fila/jobs (ex.: Redis/Celery/RQ)
- [ ] Geração de thumbnails de fotos/vídeos
- [ ] Geração de embeddings para atividades/notas/memórias
- [ ] Reprocessamento e retry de jobs com falha

### Qualidade, segurança e operação
- [ ] Testes unitários backend
- [ ] Testes de integração API + DB
- [ ] Testes frontend (componentes e páginas)
- [ ] Lint/format automatizado no CI
- [ ] Autenticação/autorização dos usuários do casal
- [ ] Observabilidade (logs estruturados, métricas básicas)
- [ ] Hardening de variáveis sensíveis (não usar credenciais padrão em produção)

---

## 🎯 Próximo marco sugerido (MVP funcional de ponta a ponta)

- [ ] Criar viagem na UI
- [x] Criar viagem na UI
- [x] Editar dias/atividades na UI
- [x] Upload de mídia via presigned URL
- [x] Registrar memória vinculada à atividade
- [x] Exibir timeline por viagem
- [ ] Consulta semântica simples (RAG v1)

---

## 📂 Detalhamento por arquivos de subtasks

- [AGENTS_PARALLEL_PLAN](AGENTS_PARALLEL_PLAN.md)

### Concluídos
- [done-01-estrutura-organizacao](subtasks/done-01-estrutura-organizacao.md)
- [done-02-backend-base](subtasks/done-02-backend-base.md)
- [done-03-banco-dados-base](subtasks/done-03-banco-dados-base.md)
- [done-04-frontend-base](subtasks/done-04-frontend-base.md)
- [done-05-infra-docker-base](subtasks/done-05-infra-docker-base.md)
- [done-06-worker-base](subtasks/done-06-worker-base.md)

### Pendentes
- [todo-01-backend-dominio-regras](subtasks/todo-01-backend-dominio-regras.md)
- [todo-02-upload-storage](subtasks/todo-02-upload-storage.md)
- [todo-03-ia-rag](subtasks/todo-03-ia-rag.md)
- [todo-04-whatsapp-integracao](subtasks/todo-04-whatsapp-integracao.md)
- [todo-05-frontend-evolucao](subtasks/todo-05-frontend-evolucao.md)
- [todo-06-worker-processamento](subtasks/todo-06-worker-processamento.md)
- [todo-07-qualidade-seguranca-operacao](subtasks/todo-07-qualidade-seguranca-operacao.md)
- [todo-08-mvp-marco](subtasks/todo-08-mvp-marco.md)
