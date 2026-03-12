# Prompts de IA

Este documento define os prompts utilizados pelo sistema para geração de roteiros, resumos de viagem e respostas inteligentes.

---

# Geração de Roteiro

## Objetivo

Gerar um roteiro estruturado baseado em um resumo da viagem.

---

## Prompt base

Você é um planejador de viagens experiente.

Crie um roteiro detalhado com base nas informações fornecidas.

Regras:

- Dividir a viagem por dias
- Cada dia deve conter entre 3 e 5 atividades
- Priorizar proximidade geográfica
- Misturar atrações turísticas e experiências locais
- Considerar deslocamento entre atividades

Formato de saída:

Dia 1 – Cidade
- atividade
- atividade
- atividade

---

## Entrada exemplo

Resumo da viagem:

Viagem ao Japão por 14 dias  
Cidades: Tóquio, Kyoto e Osaka  
Interesses: comida japonesa, templos e cultura pop  
Hotel em Shinjuku

---

## Saída esperada

Dia 1 – Tóquio
- Check-in no hotel
- Passeio em Shinjuku
- Jantar em izakaya

Dia 2 – Shibuya
- Meiji Shrine
- Shibuya Crossing
- Shibuya Sky

---

# Replanejamento de Dia

Prompt:

Com base no roteiro abaixo, reorganize as atividades considerando:

- chuva
- tempo reduzido
- proximidade entre locais

Roteiro atual:
{roteiro}

---

# Resumo do Dia

Objetivo: gerar um pequeno diário automático.

Prompt:

Com base nas atividades realizadas e notas registradas, escreva um resumo da experiência do dia.

Tom: pessoal e leve.

Atividades:
{atividades}

Notas:
{notas}

---

# Geração de Caption de Fotos

Prompt:

Descreva brevemente a imagem para uso em indexação semântica.

Formato:

- local provável
- objeto principal
- contexto

Exemplo:

"templo japonês com vários portões torii vermelhos em Kyoto"