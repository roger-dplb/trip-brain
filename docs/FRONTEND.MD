# Frontend PRD — Travel Memory & Planner

## 1. Visão Geral

O frontend será a interface principal para planejamento, execução e registro de viagens.

A aplicação permitirá que os usuários:

- criem e gerenciem viagens
- visualizem e editem roteiros
- registrem memórias com fotos, vídeos e notas
- acompanhem a timeline da viagem
- consultem dados da viagem
- façam upload de mídia

O frontend funcionará como um **companheiro de viagem visual**, enquanto o WhatsApp atuará como interface conversacional.

---

# 2. Objetivos do Frontend

## Objetivo principal

Fornecer uma interface simples e rápida para registrar e consultar informações da viagem.

## Objetivos secundários

- facilitar edição de roteiros
- registrar memórias rapidamente
- visualizar timeline da viagem
- permitir uploads de mídia
- permitir uso confortável em dispositivos móveis

---

# 3. Plataforma

O sistema será desenvolvido como **Web App responsivo**.

Suporte principal:

- desktop
- mobile

Opcionalmente poderá evoluir para **PWA (Progressive Web App)**.

---

# 4. Stack Tecnológica

Framework principal:

- Next.js
- React
- TypeScript

Estilização:

- Tailwind CSS
- shadcn/ui

Gerenciamento de estado:

- React Query ou TanStack Query

Upload de arquivos:

- presigned URLs para object storage

Mapa (opcional):

- Mapbox ou Google Maps

---

# 5. Estrutura da Aplicação

Estrutura de páginas:

/  
/trips  
/trips/[tripId]  
/trips/[tripId]/timeline  
/trips/[tripId]/memories  

---

# 6. Telas Principais

## 6.1 Home

Lista de viagens registradas.

Elementos:

- lista de viagens
- botão "Nova viagem"

Card de viagem contém:

- nome
- destino
- datas
- foto de capa

---

## 6.2 Criar Viagem

Tela para criação de nova viagem.

Campos:

- nome da viagem
- destino
- datas
- resumo da viagem

Botão:

"Gerar roteiro com IA"

Após criação o sistema gera dias e atividades sugeridas.

---

## 6.3 Página da Viagem

Página principal da viagem.

Seções:

Roteiro  
Timeline  
Memórias  
Mapa (opcional)

---

# 7. Planejamento de Roteiro

Interface principal de planejamento.

Estrutura:

Viagem  
→ dias  
→ atividades

Cada dia apresenta lista de atividades.

Exemplo:

Dia 1  
• Check-in hotel  
• Passeio em Shinjuku  
• Jantar izakaya

---

## Funcionalidades

- adicionar atividade
- editar atividade
- remover atividade
- reorder
- mover entre dias
- marcar como feito

---

# 8. Atividade

Detalhes de uma atividade.

Campos:

- nome
- localização
- horário
- notas

A atividade pode conter memórias associadas.

---

# 9. Registro de Memórias

Usuários podem registrar memórias durante a viagem.

Tipos de memória:

- foto
- vídeo
- nota

Interface deve permitir:

- upload rápido
- adicionar descrição
- associar à atividade

---

# 10. Upload de Mídia

Fluxo de upload:

1 usuário seleciona arquivo
2 frontend solicita URL de upload
3 upload direto para object storage
4 backend salva metadata

Benefícios:

- menor carga no backend
- upload mais rápido

---

# 11. Timeline da Viagem

Visualização cronológica da viagem.

Conteúdo exibido:

- atividades executadas
- fotos
- vídeos
- notas

Estrutura:

Dia  
→ atividades  
→ memórias

Exemplo:

Dia 3 – Kyoto

✓ Fushimi Inari  
✓ Nishiki Market  

Memórias:
- 8 fotos
- 1 vídeo

---

# 12. Galeria de Memórias

Página dedicada para visualização de mídia.

Filtros disponíveis:

- por dia
- por cidade
- por atividade

Exibição:

grid de fotos e vídeos.

---

# 13. Modo Viagem

Durante a viagem a interface terá um modo simplificado.

Tela principal:

Hoje

Atividades do dia:

• Fushimi Inari  
• Nishiki Market  

Botões:

✓ marcar como feito  
📸 adicionar foto  
📝 adicionar nota  

---

# 14. Integração com IA

Frontend permite interação com IA para:

- gerar roteiro
- replanejar dia
- gerar resumo do dia
- consultar memórias

Exemplo:

"o que temos hoje?"

"qual foi nosso restaurante favorito?"

---

# 15. Requisitos de UX

A aplicação deve:

- funcionar bem em mobile
- permitir interação rápida
- minimizar passos para registrar memórias

Registro de foto deve ocorrer em até 3 cliques.

---

# 16. Performance

Requisitos:

- carregamento de página < 2s
- upload de foto otimizado
- lazy loading de imagens

---

# 17. Segurança

Acesso restrito aos usuários autorizados.

Autenticação:

- login tradicional
ou
- autenticação via WhatsApp

---

# 18. Funcionalidades Futuras

Possíveis evoluções:

- mapa da viagem
- geração automática de álbum
- geração de vídeo recap
- estatísticas da viagem
- compartilhamento com amigos