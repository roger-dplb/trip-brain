# Sistema de IA e RAG

## Objetivo

Permitir consultas inteligentes sobre viagens.

Exemplo:

"qual foi nosso restaurante favorito?"

---

## Estratégia

Sistema utiliza RAG.

Passos:

1 mensagem do usuário
2 busca vetorial no banco
3 contexto enviado para LLM
4 resposta gerada

---

## Conteúdo indexado

Conteúdo vetorizado:

- notas
- descrições
- memórias
- atividades

---

## Pipeline de embeddings

Fluxo:

conteúdo criado  
↓  
gerar embedding  
↓  
salvar em pgvector

---

## Consulta

Fluxo:

pergunta do usuário  
↓  
embedding da pergunta  
↓  
busca vetorial  
↓  
contexto recuperado  
↓  
LLM gera resposta

---

## Exemplos de perguntas

"o que fizemos em kyoto?"

"qual foi o melhor restaurante?"

"mostra fotos de shibuya"

---

## Memórias visuais

Opcional:

gerar captions automáticas de fotos.

Exemplo:

"foto do templo Fushimi Inari"

Essa descrição também é vetorizada.