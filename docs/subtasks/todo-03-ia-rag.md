# Subtasks — IA / RAG

## Objetivo
Entregar primeira versão do fluxo de geração de roteiro e consulta semântica.

## Subtasks
- [ ] Definir provider/modelo LLM e estratégia de prompt
- [ ] Implementar serviço de geração de roteiro por resumo
- [ ] Implementar geração de embeddings no worker
- [ ] Persistir embeddings para atividades/notas/memórias
- [ ] Implementar busca vetorial (`top-k`) na tabela `embeddings`
- [ ] Implementar montagem de contexto (memórias + atividades + notas)
- [ ] Expor endpoint de consulta semântica
- [ ] Adicionar fallback quando não houver contexto suficiente

## Critérios de pronto
- [ ] Perguntas como “o que fizemos em kyoto?” retornam resposta contextual
- [ ] Roteiro inicial pode ser gerado por IA para uma viagem
