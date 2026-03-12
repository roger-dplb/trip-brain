# Fluxo WhatsApp

Este documento define como o sistema interage com usuários via WhatsApp.

A integração pode utilizar a API oficial da
Meta Platforms (WhatsApp Business API).

---

# Arquitetura

WhatsApp  
↓  
Webhook  
↓  
Backend  
↓  
RAG Retriever  
↓  
LLM  
↓  
Resposta

---

# Tipos de Mensagens

## Consulta de roteiro

Usuário:

o que temos hoje?

Fluxo:

1 identificar viagem ativa
2 buscar atividades do dia
3 retornar lista

---

## Consulta de memórias

Usuário:

qual foi nosso restaurante favorito?

Fluxo:

1 gerar embedding da pergunta
2 busca vetorial no banco
3 retornar memória relevante
4 gerar resposta

---

## Adicionar memória

Usuário envia:

- foto
- vídeo
- texto

Fluxo:

1 salvar mídia no MinIO
2 gerar metadata
3 associar à atividade mais provável

---

# Identificação de Intenção

Tipos de intenção:

consultar roteiro  
consultar memórias  
adicionar memória  
replanejar dia

---

# Exemplos de perguntas

o que fizemos em kyoto?

qual foi nosso melhor restaurante?

mostra fotos de shibuya

qual dia teve mais coisas?

---

# Segurança

Autenticação baseada no número do WhatsApp.

Somente números autorizados podem acessar o sistema.