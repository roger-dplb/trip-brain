# Arquitetura do Sistema

## Visão Geral

Arquitetura baseada em API com serviços separados.

Componentes principais:

- Backend API
- Banco PostgreSQL
- Armazenamento MinIO
- Worker de processamento
- Integração WhatsApp
- LLM

---

## Componentes

### Backend

Responsável por:

- CRUD de viagens
- atividades
- memórias
- integração IA
- integração WhatsApp

Stack sugerida:

- FastAPI ou .NET
- ORM
- PostgreSQL

---

### Banco de Dados

Banco principal:

PostgreSQL

Extensão utilizada:

pgvector

Armazena:

- dados estruturados
- embeddings semânticos

---

### Armazenamento de mídia

Sistema de armazenamento:

MinIO

Armazena:

- fotos
- vídeos

Banco guarda apenas metadata.

---

### Worker

Processa tarefas assíncronas:

- geração de thumbnails
- geração de embeddings
- processamento de imagens

---

### IA

Responsável por:

- gerar roteiros
- responder perguntas
- gerar embeddings

---

### Integração WhatsApp

Interface conversacional com o sistema.

Fluxo:

WhatsApp → Webhook → API → LLM → resposta