# Travel Memory & Planner

## Visão Geral

Aplicação privada para um casal planejar, registrar e consultar viagens.

O sistema combina:

- planejamento de roteiro com IA
- execução dinâmica do roteiro
- registro de memórias (fotos, vídeos e notas)
- timeline da viagem
- consulta via WhatsApp com IA

Objetivo principal: transformar viagens em uma linha de memória consultável.

---

## Objetivos

### Principais

- gerar roteiros automaticamente
- registrar experiências da viagem
- permitir edição do roteiro durante a viagem
- criar histórico das viagens

### Secundários

- consultar memórias via IA
- interagir via WhatsApp
- gerar timeline automática

---

## Usuários

Sistema privado.

Usuários:

- Usuário 1
- Usuário 2

Não há multi-tenant.

---

## Funcionalidades

### Criação de viagem

Campos:

- nome
- destino
- datas
- resumo da viagem

Exemplo:

Viagem: Japão 2027  
Datas: 10/03 - 24/03  
Resumo: comida, templos e cultura japonesa.

---

### Geração de roteiro com IA

Entrada:

Resumo da viagem.

Saída:

Lista de dias com atividades.

Exemplo:

Dia 1  
• Check-in hotel  
• Passeio em Shinjuku  
• Jantar izakaya

---

### Estrutura de dias

Cada viagem contém dias.

Cada dia possui:

- atividades
- memórias
- notas

---

### Atividades

Campos:

- título
- localização
- horário
- notas
- status

Status possíveis:

planned  
done  
skipped

---

### Registro de memórias

Cada atividade pode conter:

- fotos
- vídeos
- notas

---

### Timeline

A timeline é gerada automaticamente a partir de:

- atividades executadas
- memórias registradas

---

### Assistente via WhatsApp

Usuários podem interagir com o sistema via WhatsApp.

Exemplos:

"o que temos hoje em kyoto?"

"qual foi nosso restaurante favorito?"

---

## MVP

Primeira versão:

- criação de viagem
- geração de roteiro com IA
- edição de atividades
- registro de memórias
- timeline automática
- consulta via WhatsApp