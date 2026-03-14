# Design: Stories Export Feature

**Data:** 2026-03-14
**Status:** Aprovado

---

## Visão Geral

Feature que permite visualizar e exportar a história de uma viagem no formato Stories (estilo Instagram). Inclui um viewer interno fullscreen e exportação de arquivos (PNG + MP4) para postar em redes sociais.

---

## Objetivos

- Viewer interno: reviver a viagem em formato Stories sem custo de processamento
- Export: gerar slides PNG (ZIP) + vídeo MP4 com captions gerados por IA
- Cache do export: gerar uma vez, reutilizar; regenerar apenas quando dados mudaram

---

## Estrutura de Slides

Cada dia da viagem gera uma sequência de slides:

1. **Slide Capa** — nome da cidade + data + contagem de atividades/fotos + caption gerado por IA
2. **1 slide por atividade com fotos** — foto destaque + nome + localização + horário; se múltiplas fotos, miniaturas no rodapé
3. **Slide Resumo** (condicional) — lista compacta das atividades sem foto, exibido apenas se existirem

Proporção: **9:16** (1080×1920px no export, responsivo no viewer).

---

## Arquitetura

```
Frontend (Next.js)
├── StoryViewer         → modal fullscreen, navegação por toque/clique
├── StorySlide          → renderiza 1 slide (capa | atividade | resumo)
├── StoryProgress       → barra de progresso no topo (segmentos por slide)
└── ExportPanel         → estados do job + botões de download

Backend (FastAPI)
├── POST /trips/{id}/stories/export        → cria ExportJob, retorna job_id
└── GET  /trips/{id}/stories/export/{job_id}  → status + presigned URLs

Worker (Celery)
└── generate_stories_export(trip_id, job_id)
    ├── build_slides_data()        → monta estrutura de slides
    ├── generate_day_caption()     → LLM: 1 caption por dia
    ├── render_slide_png()         → Puppeteer: HTML template → PNG
    ├── compile_video()            → FFmpeg: PNGs → MP4
    └── upload_export()            → MinIO: ZIP + MP4
```

---

## Modelo de Dados

### Nova tabela: `story_export_jobs`

```sql
id          UUID        PRIMARY KEY
trip_id     UUID        FK → trips (UNIQUE — 1 job ativo por viagem)
status      TEXT        -- queued | processing | done | failed
zip_url     TEXT        -- presigned URL MinIO (nullable)
mp4_url     TEXT        -- presigned URL MinIO (nullable)
error_msg   TEXT        -- nullable
created_at  TIMESTAMPTZ
expires_at  TIMESTAMPTZ -- links expiram em 24h
```

### Lógica de cache e invalidação

```python
# Antes de criar novo job:
last_job = get_last_export(trip_id)
if last_job and last_job.status == "done":
    trip_updated_at = max(trip.updated_at, max(m.created_at for m in memories))
    if trip_updated_at <= last_job.created_at:
        return last_job  # retorna cache, sem reprocessar
# Caso contrário: cria novo job
```

---

## Frontend

### Entry points

- **Card da viagem** (`/trips`) — botão "▶ Stories" abre o viewer em modal fullscreen
- **Aba "Stories"** na página da viagem (`/trips/[tripId]/stories`) — mesma experiência, URL própria

### Novos componentes

```
components/stories/
├── StoryViewer.tsx    → modal fullscreen; gerencia índice atual e navegação
├── StorySlide.tsx     → renderiza 1 slide conforme tipo
├── StoryProgress.tsx  → barra de progresso segmentada no topo
└── ExportPanel.tsx    → gerencia estados do job e exibe botões de download
```

### Navegação no StoryViewer

- Clique/toque na metade esquerda → slide anterior
- Clique/toque na metade direita → próximo slide
- `Esc` ou swipe down → fecha o viewer
- Auto-advance opcional: 5s por slide, pausa no toque

### Estados do ExportPanel

| Estado | UI |
|---|---|
| Sem export anterior | Botão "Gerar export" |
| queued / processing | Spinner + "Gerando… pode levar até 1 minuto" |
| done (dados fresh) | Botões "↓ Baixar PNGs" e "↓ Baixar MP4" |
| done (dados stale) | Botões de download + aviso "Viagem atualizada desde o último export" + "↺ Regenerar" |
| failed | Mensagem de erro + "Tentar novamente" |

Polling a cada 3s enquanto status for `queued` ou `processing`.

---

## Worker

### Algoritmo de geração

```python
async def generate_stories_export(trip_id, job_id):
    # 1. Busca dados
    trip = get_trip_with_days_activities_memories(trip_id)

    # 2. Monta estrutura de slides
    slides = build_slides_data(trip)
    # Para cada dia:
    #   - slide capa
    #   - 1 slide por activity com memories do tipo "photo"
    #   - 1 slide resumo se houver activities sem photo

    # 3. Gera captions por dia via LLM
    for day in trip.days:
        day.caption = generate_day_caption(day)  # 1 frase curta

    # 4. Renderiza PNGs via Puppeteer
    png_paths = []
    for slide in slides:
        path = render_slide_png(slide)  # injeta JSON no template HTML
        png_paths.append(path)

    # 5. Compila MP4 via FFmpeg
    mp4_path = compile_video(png_paths, fps=1, transition="fade")

    # 6. Cria ZIP dos PNGs
    zip_path = create_zip(png_paths)

    # 7. Upload para MinIO
    zip_url = upload_to_minio(zip_path)
    mp4_url = upload_to_minio(mp4_path)

    # 8. Atualiza job
    update_job(job_id, status="done", zip_url=zip_url, mp4_url=mp4_url)

    # 9. Limpeza
    cleanup_temp_files(png_paths + [mp4_path, zip_path])
```

### Templates HTML

```
worker/stories/templates/
├── slide-cover.html       → capa do dia
├── slide-activity.html    → atividade com foto
└── slide-summary.html     → resumo das atividades sem foto
```

Cada template recebe dados via `window.__DATA__` injetado pelo Puppeteer.

### Dependências novas no worker

- `pyppeteer` (ou subprocess para Node Puppeteer) — HTML → PNG
- `ffmpeg` no Docker do worker (já presente para thumbnails)
- Nenhuma nova dependência no backend ou frontend

### Estimativa de tamanho (viagem de 14 dias, 5 ativ/dia, 3 fotos/ativ)

- ~70–100 slides PNG @ 1080×1920 ≈ 150–300MB temporário
- ZIP final ≈ 50–80MB
- MP4 final ≈ 20–40MB
- Worker limpa arquivos temporários após upload

---

## Fora do Escopo (MVP)

- Música de fundo no vídeo
- Customização de tema/cores
- Compartilhamento direto para Instagram via API
- Narração em áudio (TTS)
- Auto-advance configurável pelo usuário
