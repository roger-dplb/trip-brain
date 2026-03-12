# Subtasks — IA / RAG

## Objetivo
Entregar primeira versão do fluxo de geração de roteiro e consulta semântica.

## Subtasks
- [x] Definir provider/modelo LLM e estratégia de prompt
- [x] Implementar serviço de geração de roteiro por resumo
- [x] Configurar geração de roteiro via OpenAI (`gpt-5`)
- [x] Implementar geração de embeddings no worker
- [x] Utilizar embeddings da própria OpenAI (backend + worker)
- [x] Persistir embeddings para atividades/notas/memórias
- [x] Implementar busca vetorial (`top-k`) na tabela `embeddings`
- [x] Implementar montagem de contexto (memórias + atividades + notas)
- [x] Expor endpoint de consulta semântica
- [x] Adicionar fallback quando não houver contexto suficiente
- [x] Manter fallback de template para roteiro quando OpenAI falhar/indisponível

## Critérios de pronto
- [ ] Perguntas como “o que fizemos em kyoto?” retornam resposta contextual
- [x] Roteiro inicial pode ser gerado por IA para uma viagem
- [x] `ITINERARY_PROVIDER=openai` com `ITINERARY_MODEL=gpt-5` definido por configuração
