# Subtasks — IA / RAG

## Objetivo
Entregar primeira versão do fluxo de geração de roteiro e consulta semântica.

## Subtasks
- [x] Definir provider/modelo LLM e estratégia de prompt
- [x] Implementar serviço de geração de roteiro por resumo
- [ ] Implementar geração de embeddings no worker
- [x] Persistir embeddings para atividades/notas/memórias
- [x] Implementar busca vetorial (`top-k`) na tabela `embeddings`
- [x] Implementar montagem de contexto (memórias + atividades + notas)
- [x] Expor endpoint de consulta semântica
- [x] Adicionar fallback quando não houver contexto suficiente

## Critérios de pronto
- [ ] Perguntas como “o que fizemos em kyoto?” retornam resposta contextual
- [ ] Roteiro inicial pode ser gerado por IA para uma viagem
