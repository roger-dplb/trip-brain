# Estratégia de Embeddings

Este documento define como o sistema indexa conteúdo para busca semântica.

Banco utilizado:

PostgreSQL com extensão pgvector.

---

# Conteúdos Vetorizados

Tipos de conteúdo:

- atividades
- notas
- memórias
- captions de fotos

---

# Estrutura da Tabela

Tabela embeddings.

Campos:

id  
source_type  
source_id  
content  
embedding

---

# Tipos de Source

activity  
memory  
note  
photo_caption

---

# Pipeline de Indexação

Fluxo:

conteúdo criado  
↓  
normalização do texto  
↓  
geração de embedding  
↓  
salvar no banco

---

# Exemplo de Conteúdo

Atividade:

"visita ao templo Fushimi Inari em Kyoto"

Nota:

"subimos até o topo e a vista foi incrível"

Caption de foto:

"portões torii vermelhos no templo Fushimi Inari"

---

# Consulta Semântica

Fluxo:

pergunta do usuário  
↓  
gerar embedding da pergunta  
↓  
buscar vetores similares  
↓  
retornar contexto  
↓  
LLM gera resposta

---

# Exemplo de Pergunta

Pergunta:

qual foi nosso templo favorito?

Resultado possível:

Fushimi Inari  
Kiyomizu-dera

---

# Otimizações

Utilizar índice vetorial:

ivfflat

Exemplo:

CREATE INDEX embeddings_idx
ON embeddings
USING ivfflat (embedding vector_cosine_ops);

---

# Estratégia de Contexto

Durante consultas, retornar:

- top 5 memórias
- top 3 atividades
- top 3 notas

Esses dados são enviados como contexto para o LLM.