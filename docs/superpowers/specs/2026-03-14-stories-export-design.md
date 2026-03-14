# Design: Stories Export Feature

**Data:** 2026-03-14
**Status:** Revisado

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

### Edge cases na geração de slides

| Situação | Comportamento |
|---|---|
| Dia sem atividades | Apenas slide capa é gerado para o dia |
| Dia sem nenhuma foto | Apenas slide capa + slide resumo com todas as atividades listadas |
| Trip sem nenhuma foto em nenhum dia | Export é abortado com erro amigável: "Adicione fotos à viagem antes de exportar" |
| Atividade com `memory_type = note` ou `text` mas sem foto | Aparece apenas no slide resumo |
| Memória com `activity_id = null` (foto associada ao dia, não à atividade) | Incluída no slide capa do dia como foto destaque (se for a única do dia) ou ignorada |

---

## Arquitetura

```
Frontend (Next.js)
├── StoryViewer         → modal fullscreen, navegação por toque/clique
├── StorySlide          → renderiza 1 slide (capa | atividade | resumo)
├── StoryProgress       → barra de progresso no topo (segmentos por slide)
└── ExportPanel         → estados do job + botões de download

Backend (FastAPI)
├── POST /trips/{id}/stories/export        → cria job em worker_jobs, retorna job_id
└── GET  /trips/{id}/stories/export/{job_id}  → status + URLs de download

Worker (custom polling loop — não usa Celery)
└── _enqueue_stories_export()   → nova função no loop existente
└── _process_stories_export()   → handler para job_type = "stories_export"
    ├── build_slides_data()         → monta estrutura de slides
    ├── generate_day_caption()      → LLM: 1 caption por dia
    ├── render_slide_png()          → Puppeteer headless: HTML template → PNG
    ├── compile_video()             → FFmpeg: PNGs → MP4
    ├── upload_export()             → MinIO: ZIP + MP4
    └── cleanup_temp_files()        → sempre em bloco finally
```

### Integração com o worker existente

O worker usa um polling loop customizado que lê da tabela `worker_jobs`. O job de stories segue o mesmo padrão:

- Backend insere na tabela `worker_jobs` com `job_type = "stories_export"` e `payload = {"trip_id": "...", "story_export_job_id": "..."}`
- Worker adiciona uma função `_enqueue_stories_export()` ao loop de enfileiramento existente
- Worker adiciona um branch `elif job_type == "stories_export"` no dispatcher existente

A tabela `story_export_jobs` existe separadamente para rastrear estado e URLs do export (não é processada diretamente pelo worker — o worker atualiza ela ao concluir).

---

## Modelo de Dados

### Nova tabela: `story_export_jobs`

```sql
id                UUID        PRIMARY KEY DEFAULT gen_random_uuid()
trip_id           UUID        UNIQUE NOT NULL FK → trips (ON DELETE CASCADE)
status            TEXT        NOT NULL DEFAULT 'queued'  -- queued | processing | done | failed
zip_object_key    TEXT        -- chave MinIO (nullable até done)
mp4_object_key    TEXT        -- chave MinIO (nullable até done)
error_msg         TEXT        -- nullable
created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Nota sobre URLs:** o bucket MinIO já é público (`s3:GetObject` para `*`), seguindo o padrão existente no `StorageService`. As URLs de download são construídas na hora a partir das `object_key`s — sem presigned URLs com TTL, sem problema de expiração.

### Lógica de cache e invalidação

```python
def get_or_create_export_job(trip_id: UUID, db: Session) -> tuple[StoryExportJob, bool]:
    """
    Retorna (job, is_cached).
    is_cached=True significa que o export existente ainda é válido — não reprocessar.
    """
    # SELECT FOR UPDATE para evitar race condition
    job = db.execute(
        "SELECT * FROM story_export_jobs WHERE trip_id = :trip_id FOR UPDATE",
        {"trip_id": trip_id}
    ).fetchone()

    if job and job.status == "done":
        # Verifica se dados da viagem mudaram desde o export
        last_data_change = db.execute("""
            SELECT GREATEST(
                t.updated_at,
                COALESCE(MAX(m.created_at), t.updated_at)
            ) as last_change
            FROM trips t
            LEFT JOIN memories m ON m.trip_id = t.id
            WHERE t.id = :trip_id
            GROUP BY t.updated_at
        """, {"trip_id": trip_id}).scalar()

        if last_data_change <= job.created_at:
            return job, True  # cache válido

    # Cria ou atualiza job (INSERT ... ON CONFLICT DO UPDATE)
    job = db.execute("""
        INSERT INTO story_export_jobs (trip_id, status)
        VALUES (:trip_id, 'queued')
        ON CONFLICT (trip_id) DO UPDATE SET status = 'queued', error_msg = null, created_at = now()
        RETURNING *
    """, {"trip_id": trip_id}).fetchone()

    return job, False
```

**Limitação conhecida:** a tabela `memories` não tem `updated_at`, apenas `created_at`. Edições em captions de memórias existentes não invalidam o cache. Aceito como limitação do MVP.

---

## API Endpoints

### `POST /trips/{trip_id}/stories/export`

Cria ou valida o export de uma viagem.

**Request:** sem body.

**Response `202 Accepted`:**
```json
{
  "job_id": "uuid",
  "status": "queued",
  "cached": false
}
```

**Response `200 OK`** (export cacheado válido):
```json
{
  "job_id": "uuid",
  "status": "done",
  "cached": true,
  "zip_url": "http://minio.../stories/trip-uuid/export.zip",
  "mp4_url": "http://minio.../stories/trip-uuid/export.mp4"
}
```

**Erros:**
- `404` — trip não encontrada
- `422` — trip sem nenhuma foto (erro amigável)

### `GET /trips/{trip_id}/stories/export/{job_id}`

Consulta status do job.

**Response `200 OK`:**
```json
{
  "job_id": "uuid",
  "status": "queued | processing | done | failed",
  "zip_url": "string | null",
  "mp4_url": "string | null",
  "error_msg": "string | null"
}
```

**Erros:**
- `404` — job não encontrado ou não pertence à trip (verificação de autorização)

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
| queued / processing | Spinner + "Gerando… pode levar alguns minutos" |
| done (dados fresh) | Botões "↓ Baixar PNGs" e "↓ Baixar MP4" |
| done (dados stale) | Botões de download + aviso "Viagem atualizada desde o último export" + "↺ Regenerar" |
| failed | Mensagem de erro + "Tentar novamente" |
| trip sem fotos | Mensagem "Adicione fotos à viagem para exportar Stories" |

**Polling:** frontend faz polling a cada 5s enquanto status for `queued` ou `processing`. Dado que o worker consulta jobs a cada 15s, comunicar ao usuário que o processo pode levar alguns minutos (não "1 minuto") para começar.

---

## Worker

### Algoritmo de geração

```python
async def _process_stories_export(job: dict):
    trip_id = job["payload"]["trip_id"]
    story_export_job_id = job["payload"]["story_export_job_id"]
    tmp_dir = Path(f"/tmp/stories/{story_export_job_id}")
    tmp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 1. Busca dados
        trip = get_trip_with_days_activities_memories(trip_id)

        # Validação antecipada
        all_photos = [m for m in all_memories(trip) if m.memory_type == "photo"]
        if not all_photos:
            raise ExportError("Trip has no photos")

        # 2. Monta estrutura de slides + captions
        slides = build_slides_data(trip)  # ver edge cases acima
        for day in trip.days:
            day.caption = generate_day_caption(day)  # LLM, 1 frase

        # 3. Renderiza PNGs via Puppeteer
        png_paths = []
        for i, slide in enumerate(slides):
            path = tmp_dir / f"slide_{i:04d}.png"
            render_slide_png(slide, path)  # Puppeteer subprocess
            png_paths.append(path)

        # 4. Compila MP4 via FFmpeg
        # Cada slide: 5s de exibição + 0.5s fade
        # Codec: libx264, pixel format: yuv420p (compatibilidade Instagram)
        # Bitrate: CRF 23
        mp4_path = tmp_dir / "export.mp4"
        compile_video(png_paths, mp4_path, hold_seconds=5, fps=30, transition_frames=15)

        # 5. Cria ZIP dos PNGs
        zip_path = tmp_dir / "export.zip"
        create_zip(png_paths, zip_path)

        # 6. Upload para MinIO
        zip_key = f"stories/{trip_id}/export.zip"
        mp4_key = f"stories/{trip_id}/export.mp4"
        upload_to_minio(zip_path, zip_key)
        upload_to_minio(mp4_path, mp4_key)

        # 7. Atualiza story_export_job
        update_story_export_job(story_export_job_id, status="done",
                                zip_object_key=zip_key, mp4_object_key=mp4_key)

    except Exception as e:
        update_story_export_job(story_export_job_id, status="failed", error_msg=str(e))
        raise

    finally:
        # Sempre limpa arquivos temporários, mesmo em caso de erro
        shutil.rmtree(tmp_dir, ignore_errors=True)
```

### Templates HTML

```
worker/stories/templates/
├── slide-cover.html       → capa do dia
├── slide-activity.html    → atividade com foto
└── slide-summary.html     → resumo das atividades sem foto
```

Cada template recebe dados via `window.__DATA__` injetado pelo Puppeteer antes do render.

### Dependências e mudanças no Docker do worker

O worker Docker image (`python:3.12-slim`) precisará de alterações significativas:

```dockerfile
# Adicionar ao Dockerfile do worker:
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxss1 \
    ffmpeg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
```

**Impacto no tamanho da imagem:** estimativa de +400–600MB. Aceito como custo do approach B.

**Dependência Python nova:** `pyppeteer` ou uso de `subprocess` com `chromium --headless`.

### Parâmetros FFmpeg

```bash
ffmpeg -framerate 1/5 -i slide_%04d.png \
  -vf "fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" \
  -c:v libx264 -pix_fmt yuv420p -crf 23 \
  -an \  # sem áudio (MVP)
  export.mp4
```

Cada slide é exibido por 5 segundos. `yuv420p` garante compatibilidade com Instagram.

### Estimativa de tamanho (viagem de 14 dias, 5 ativ/dia, 3 fotos/ativ)

- ~70–100 slides PNG @ 1080×1920 ≈ 150–300MB temporário (limpo após upload)
- ZIP final ≈ 50–80MB
- MP4 final ≈ 20–40MB

---

## Fora do Escopo (MVP)

- Música de fundo no vídeo
- Customização de tema/cores
- Compartilhamento direto para Instagram via API
- Narração em áudio (TTS)
- Auto-advance configurável pelo usuário
- Invalidação de cache por edição de captions de memórias existentes
