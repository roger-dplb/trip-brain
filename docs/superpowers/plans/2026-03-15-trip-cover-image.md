# Trip Cover Image Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to set a cover image for each trip, displayed as a banner in the trip card and as the hero background in the trip overview tab.

**Architecture:** Add `cover_image_url TEXT NULL` to the `trips` table. Reuse the existing presigned-upload flow (MinIO) for direct uploads; for picking from memories, copy the memory's `public_url`. The backend exposes `public_url` in `UploadPresignResponse` so the frontend never needs to construct MinIO URLs manually. A new `CoverImageModal` component handles both tabs.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend), Next.js 14 App Router + TypeScript + Tailwind (frontend), MinIO/S3-compatible storage.

---

## Chunk 1: Backend — Data Layer

### Task 1: Migration — add `cover_image_url` to trips

**Files:**
- Create: `backend/alembic/versions/20260315_0001_add_cover_image_url_to_trips.py`

- [ ] **Step 1: Write the migration file**

```python
# backend/alembic/versions/20260315_0001_add_cover_image_url_to_trips.py
"""add cover_image_url to trips

Revision ID: 20260315_0001
Revises: 20260314_0004
Create Date: 2026-03-15
"""

import sqlalchemy as sa
from alembic import op

revision = "20260315_0001"
down_revision = "20260314_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trips",
        sa.Column("cover_image_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trips", "cover_image_url")
```

- [ ] **Step 2: Run the migration**

```bash
cd backend
docker compose -f ../docker-compose.yml exec backend alembic upgrade head
```

Or with a local DB:
```bash
cd backend && alembic upgrade head
```

Expected: `Running upgrade 20260314_0004 -> 20260315_0001, add cover_image_url to trips`

- [ ] **Step 3: Verify column was added**

```bash
cd backend
docker compose -f ../docker-compose.yml exec db psql -U postgres -d tripbrain -c "\d trips"
```

Expected: `cover_image_url | text | | |` in the output.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/20260315_0001_add_cover_image_url_to_trips.py
git commit -m "feat: add cover_image_url column to trips table"
```

---

### Task 2: Trip model and schemas

**Files:**
- Modify: `backend/app/models/trip.py`
- Modify: `backend/app/schemas/trip.py`
- Test: `backend/tests/integration/test_trips_api_integration.py`

- [ ] **Step 1: Write a failing integration test**

Add to `backend/tests/integration/test_trips_api_integration.py`:

```python
def test_cover_image_url_is_returned_in_trip_response(client) -> None:
    create_response = client.post(
        "/api/v1/trips/",
        json={
            "name": "Cover Test",
            "destinations": ["Lisboa, Portugal"],
            "start_date": "2026-08-01",
            "end_date": "2026-08-10",
            "status": "planned",
        },
    )
    assert create_response.status_code == 201
    trip_id = create_response.json()["id"]

    # Initially null
    get_response = client.get(f"/api/v1/trips/{trip_id}")
    assert get_response.status_code == 200
    assert get_response.json()["cover_image_url"] is None

    # Update cover
    put_response = client.put(
        f"/api/v1/trips/{trip_id}",
        json={"cover_image_url": "https://example.com/cover.jpg"},
    )
    assert put_response.status_code == 200
    assert put_response.json()["cover_image_url"] == "https://example.com/cover.jpg"
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd backend && pytest tests/integration/test_trips_api_integration.py::test_cover_image_url_is_returned_in_trip_response -v
```

Expected: FAIL — `cover_image_url` key not present in response.

- [ ] **Step 3: Add `cover_image_url` to Trip model**

In `backend/app/models/trip.py`, add after the `summary` field:

```python
cover_image_url: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
```

The file already imports `Text` from sqlalchemy — no new import needed.

- [ ] **Step 4: Add `cover_image_url` to TripUpdate and TripRead**

In `backend/app/schemas/trip.py`:

Add to `TripUpdate` (after `summary` field):
```python
cover_image_url: str | None = None
```

Add to `TripRead` (after `id` field, or end of class body — before `created_at`):
```python
cover_image_url: str | None = None
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
cd backend && pytest tests/integration/test_trips_api_integration.py::test_cover_image_url_is_returned_in_trip_response -v
```

Expected: PASS

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
cd backend && pytest -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/trip.py backend/app/schemas/trip.py \
        backend/tests/integration/test_trips_api_integration.py
git commit -m "feat: expose cover_image_url on Trip model and schemas"
```

---

### Task 3: Add `public_url` to `UploadPresignResponse`

**Files:**
- Modify: `backend/app/schemas/upload.py`
- Modify: `backend/app/api/routes/uploads.py`
- Test: `backend/tests/unit/test_storage_service.py` (read first to understand patterns)

- [ ] **Step 1: Read the existing storage service test**

```bash
cat backend/tests/unit/test_storage_service.py
```

Understand what's already tested so you don't duplicate it.

- [ ] **Step 2: Write a failing unit test for the presign route**

Add to `backend/tests/unit/` a new file `test_upload_presign_public_url.py`:

```python
# backend/tests/unit/test_upload_presign_public_url.py
from unittest.mock import MagicMock, patch
import uuid


def test_presign_response_includes_public_url() -> None:
    """UploadPresignResponse must include public_url so frontend never constructs MinIO URLs."""
    from app.schemas.upload import UploadPresignResponse

    resp = UploadPresignResponse(
        object_key="trips/abc/cover.jpg",
        upload_url="https://minio.example.com/presigned?sig=x",
        expires_in=900,
        public_url="https://minio.example.com/tripbrain/trips/abc/cover.jpg",
    )
    assert resp.public_url == "https://minio.example.com/tripbrain/trips/abc/cover.jpg"
```

- [ ] **Step 3: Run to confirm it fails**

```bash
cd backend && pytest tests/unit/test_upload_presign_public_url.py -v
```

Expected: FAIL — `UploadPresignResponse` does not accept `public_url`.

- [ ] **Step 4: Add `public_url` to schema**

In `backend/app/schemas/upload.py`, update `UploadPresignResponse`:

```python
class UploadPresignResponse(BaseModel):
    object_key: str
    upload_url: str
    expires_in: int
    public_url: str
```

- [ ] **Step 5: Update the presign route to compute and include `public_url`**

In `backend/app/api/routes/uploads.py`, update the `create_upload_url` function return statement:

```python
    public_url = storage_service.build_public_object_url(object_key)

    return UploadPresignResponse(
        object_key=object_key,
        upload_url=upload_url,
        expires_in=storage_service.expires_in_seconds,
        public_url=public_url or "",
    )
```

`build_public_object_url` returns `str | None`; since `object_key` is always set here, `public_url` will never be `None`. The `or ""` is a type-narrowing safety fallback.

- [ ] **Step 6: Run the unit test to confirm it passes**

```bash
cd backend && pytest tests/unit/test_upload_presign_public_url.py -v
```

Expected: PASS

- [ ] **Step 7: Run full test suite**

```bash
cd backend && pytest -v
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/upload.py backend/app/api/routes/uploads.py \
        backend/tests/unit/test_upload_presign_public_url.py
git commit -m "feat: include public_url in UploadPresignResponse"
```

---

## Chunk 2: Frontend — API Layer

### Task 4: Update `api.ts` — Trip type, UploadPresignResponse type, updateTrip function

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add `cover_image_url` to the `Trip` type**

In `frontend/lib/api.ts`, update the `Trip` type (currently ends at `status: string`):

```typescript
export type Trip = {
  id: string;
  name: string;
  destinations: string[];
  start_date: string;
  end_date: string;
  summary?: string | null;
  status: string;
  cover_image_url?: string | null;
};
```

- [ ] **Step 2: Add `public_url` to `UploadPresignResponse`**

In `frontend/lib/api.ts`, update `UploadPresignResponse`:

```typescript
export type UploadPresignResponse = {
  object_key: string;
  upload_url: string;
  expires_in: number;
  public_url: string;
};
```

- [ ] **Step 3: Add `updateTrip` function**

In `frontend/lib/api.ts`, add after `fetchTrip`:

```typescript
export function updateTrip(
  tripId: string,
  data: { cover_image_url?: string | null },
): Promise<Trip> {
  return request<Trip>(
    `/trips/${tripId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    API_BASE_PUBLIC,
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add cover_image_url to Trip type and updateTrip API function"
```

---

## Chunk 3: Frontend — UI Components

### Task 5: Update `TripCard` — cover image banner

**Files:**
- Modify: `frontend/components/trip-card.tsx`

- [ ] **Step 1: Read the current file**

```bash
cat frontend/components/trip-card.tsx
```

Confirm the root elements and `p-5` padding location.

- [ ] **Step 2: Update the card to show cover image**

The card currently renders `{cardContent}` inside a `<Link>` or `<div>` with `p-5`. Move the padding to an inner wrapper and add the cover image before it.

Replace the entire `return (` block (from `return (` through the final `</>`) with:

```tsx
  return (
    <>
      {isGenerating ? (
        <div className="block bg-white rounded-xl border border-[rgba(0,0,0,0.08)] shadow-sm cursor-default opacity-80 overflow-hidden">
          {trip.cover_image_url && (
            <img
              src={trip.cover_image_url}
              alt="Capa da viagem"
              className="w-full h-[120px] object-cover"
            />
          )}
          <div className="p-5">{cardContent}</div>
        </div>
      ) : (
        <Link
          href={`/trips/${trip.id}`}
          className="block bg-white rounded-xl border border-[rgba(0,0,0,0.08)] shadow-sm hover:shadow-md transition-shadow overflow-hidden"
        >
          {trip.cover_image_url && (
            <img
              src={trip.cover_image_url}
              alt="Capa da viagem"
              className="w-full h-[120px] object-cover"
            />
          )}
          <div className="p-5">{cardContent}</div>
        </Link>
      )}

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-red-50 shrink-0">
                <TrashIcon className="text-[#ff6b6b]" size={20} />
              </span>
              <h2 className="text-base font-semibold text-[#242424]">Excluir viagem?</h2>
            </div>
            <p className="text-sm text-[#8b8b8b] mb-1">
              Isso removerá permanentemente <span className="font-medium text-[#242424]">{trip.name}</span> e todas as:
            </p>
            <ul className="text-sm text-[#8b8b8b] list-disc list-inside mb-5 space-y-0.5">
              <li>Histórias e registros da viagem</li>
              <li>Memórias e fotos</li>
              <li>Lembranças e anotações</li>
            </ul>
            <p className="text-xs text-red-500 mb-5 font-medium">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-[rgba(0,0,0,0.12)] px-4 py-2 text-sm text-[#8b8b8b] hover:text-[#242424] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  if (onDelete) onDelete(trip.id);
                }}
                className="flex-1 rounded-lg bg-[#ff6b6b] px-4 py-2 text-sm font-medium text-white hover:bg-[#e05555] transition-colors"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
```

The key changes from the original:
- Add `overflow-hidden` to both root elements (was missing)
- Remove `p-5` from root, add `<div className="p-5">` wrapping `{cardContent}`
- Insert `<img>` before the padded wrapper, gated on `cover_image_url`
- Delete confirmation modal is kept verbatim

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start the dev server and visually verify the card**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000/trips`. Verify:
- Card without cover: looks identical to before.
- Card with cover: shows 120px image banner at top, content below.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/trip-card.tsx
git commit -m "feat: show cover image banner in trip card"
```

---

### Task 6: Update trip overview hero — cover image + "Alterar capa" button

**Files:**
- Modify: `frontend/app/trips/[tripId]/page.tsx`

- [ ] **Step 1: Add `showCoverModal` state and import `updateTrip`**

At the top of `TripDetailsPage`, add:
```typescript
const [showCoverModal, setShowCoverModal] = useState(false);
```

In the import block at the top of the file, add `updateTrip` to the import from `@/lib/api`.

- [ ] **Step 2: Replace the hero `<div>` with cover-aware version**

Find the hero section (line ~366):
```tsx
<div className="relative h-[240px] sm:h-[280px] bg-gradient-to-br from-[#ff6b6b] via-[#ff8c69] to-[#f3905a] overflow-hidden">
```

Replace the entire hero `<div>` (from `{/* Hero Section */}` to the closing `</div>` of that block) with:

```tsx
      {/* Hero Section */}
      <div
        className="relative h-[240px] sm:h-[280px] overflow-hidden"
        style={
          trip.cover_image_url
            ? { backgroundImage: `url(${trip.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        {/* Gradient: coral when no cover, dark overlay when cover exists */}
        <div
          className={
            trip.cover_image_url
              ? "absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10"
              : "absolute inset-0 bg-gradient-to-br from-[#ff6b6b] via-[#ff8c69] to-[#f3905a]"
          }
        />
        {/* Alterar capa button */}
        <button
          onClick={() => setShowCoverModal(true)}
          className="absolute top-3 right-4 sm:top-4 sm:right-8 z-10 flex items-center gap-1.5 rounded-lg bg-black/30 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
        >
          ✏️ Alterar capa
        </button>
        <div className="absolute bottom-6 sm:bottom-10 left-4 sm:left-8 lg:left-12 right-4 sm:right-8 lg:right-12">
          {trip.destinations.length > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-[#ff6b6b] px-3 py-1.5 rounded-full text-white text-xs sm:text-sm font-semibold mb-3">
              <PinIcon size={14} />
              {trip.destinations.join(" · ")}
            </span>
          )}
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2 leading-tight">{trip.name}</h1>
          {(trip.start_date || trip.end_date) && (
            <div className="flex items-center gap-2 text-white/90">
              <CalendarIcon size={18} />
              <span className="text-sm sm:text-base font-medium">
                {[trip.start_date, trip.end_date].filter(Boolean).map((d) => formatDate(d as string)).join(" → ")}
              </span>
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 3: Mount the modal at the bottom of the return JSX**

Just before the final closing `</div>` of the page return, add:

```tsx
      {showCoverModal && (
        <CoverImageModal
          tripId={params.tripId}
          onClose={() => setShowCoverModal(false)}
          onCoverUpdated={(url) => {
            setTrip((prev) => prev ? { ...prev, cover_image_url: url } : prev);
            setShowCoverModal(false);
          }}
        />
      )}
```

- [ ] **Step 4: Add the import for `CoverImageModal`**

At the top of the file, add:
```typescript
import { CoverImageModal } from "@/components/CoverImageModal";
```

Note: this import will cause a TypeScript error until Task 7 creates the component — that's fine, continue.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/trips/[tripId]/page.tsx
git commit -m "feat: hero with cover image and Alterar capa button on trip overview"
```

---

### Task 7: Create `CoverImageModal` component

**Files:**
- Create: `frontend/components/CoverImageModal.tsx`

- [ ] **Step 1: Create the file with the full component**

```tsx
// frontend/components/CoverImageModal.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { createUploadPresign, fetchMemoriesByTrip, updateTrip, Memory } from "@/lib/api";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 26214400; // 25 MB — matches backend config.max_upload_size_bytes

type Props = {
  tripId: string;
  onClose: () => void;
  onCoverUpdated: (url: string) => void;
};

export function CoverImageModal({ tripId, onClose, onCoverUpdated }: Props) {
  const [tab, setTab] = useState<"upload" | "memories">("upload");

  // Upload tab state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Memories tab state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [memoriesError, setMemoriesError] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [savingMemory, setSavingMemory] = useState(false);

  // Close on ESC
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Load memories when tab switches
  useEffect(() => {
    if (tab !== "memories") return;
    setMemoriesLoading(true);
    setMemoriesError(null);
    fetchMemoriesByTrip(tripId)
      .then((all) => setMemories(all.filter((m) => m.memory_type === "photo")))
      .catch(() => setMemoriesError("Erro ao carregar memórias. Tente novamente."))
      .finally(() => setMemoriesLoading(false));
  }, [tab, tripId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const chosen = e.target.files?.[0] ?? null;
    if (!chosen) return;

    if (!ACCEPTED_TYPES.includes(chosen.type)) {
      setUploadError("Formato não suportado. Use JPG, PNG ou WebP.");
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setUploadError("Imagem muito grande (máx. 25 MB).");
      return;
    }
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  }

  async function handleUploadConfirm() {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const presign = await createUploadPresign({
        trip_id: tripId,
        filename: file.name,
        content_type: file.type,
        file_size_bytes: file.size,
      });

      const s3Res = await fetch(presign.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!s3Res.ok) {
        setUploadError("Erro ao enviar imagem. Tente novamente.");
        return;
      }

      await updateTrip(tripId, { cover_image_url: presign.public_url });
      onCoverUpdated(presign.public_url);
    } catch {
      setUploadError("Erro ao salvar capa. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  async function handleMemoryConfirm() {
    if (!selectedMemory?.public_url) return;
    setSavingMemory(true);
    try {
      await updateTrip(tripId, { cover_image_url: selectedMemory.public_url });
      onCoverUpdated(selectedMemory.public_url);
    } catch {
      setMemoriesError("Erro ao salvar capa. Tente novamente.");
    } finally {
      setSavingMemory(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[rgba(0,0,0,0.08)]">
          <h2 className="text-base font-semibold text-[#242424]">Alterar capa da viagem</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[#f5f5f5] transition-colors text-[#8b8b8b]"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[rgba(0,0,0,0.08)]">
          {(["upload", "memories"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? "text-[#ff6b6b] border-b-2 border-[#ff6b6b]"
                  : "text-[#8b8b8b] hover:text-[#242424]"
              }`}
            >
              {t === "upload" ? "Fazer upload" : "Escolher das memórias"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "upload" && (
            <div className="space-y-4">
              {preview ? (
                <div className="relative">
                  <img
                    src={preview}
                    alt="Prévia da capa"
                    className="w-full h-48 object-cover rounded-xl"
                  />
                  <button
                    onClick={() => { setFile(null); setPreview(null); setUploadError(null); }}
                    className="absolute top-2 right-2 bg-black/40 text-white rounded-full px-2 py-0.5 text-xs hover:bg-black/60"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-40 rounded-xl border-2 border-dashed border-[rgba(0,0,0,0.15)] flex flex-col items-center justify-center gap-2 text-[#8b8b8b] hover:border-[#ff6b6b] hover:text-[#ff6b6b] transition-colors"
                >
                  <span className="text-3xl">📷</span>
                  <span className="text-sm font-medium">Clique para selecionar imagem</span>
                  <span className="text-xs">JPG, PNG ou WebP · máx. 25 MB</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              {uploadError && (
                <p className="text-sm text-red-500">{uploadError}</p>
              )}
            </div>
          )}

          {tab === "memories" && (
            <div>
              {memoriesLoading && (
                <div className="flex justify-center py-10 text-[#8b8b8b] text-sm">
                  Carregando fotos...
                </div>
              )}
              {memoriesError && (
                <p className="text-sm text-red-500 text-center py-6">{memoriesError}</p>
              )}
              {!memoriesLoading && !memoriesError && memories.length === 0 && (
                <p className="text-sm text-[#8b8b8b] text-center py-6">
                  Sem fotos nas memórias desta viagem. Adicione fotos na aba Memórias ou faça upload direto.
                </p>
              )}
              {!memoriesLoading && memories.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {memories.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMemory(m)}
                      className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        selectedMemory?.id === m.id
                          ? "border-[#ff6b6b] scale-95"
                          : "border-transparent hover:border-[rgba(0,0,0,0.2)]"
                      }`}
                    >
                      <img
                        src={m.public_url ?? ""}
                        alt={m.caption ?? "Memória"}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-[rgba(0,0,0,0.08)] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[rgba(0,0,0,0.12)] text-sm text-[#8b8b8b] hover:text-[#242424] transition-colors"
          >
            Cancelar
          </button>
          {tab === "upload" ? (
            <button
              onClick={handleUploadConfirm}
              disabled={!file || uploading}
              className="px-5 py-2 rounded-lg bg-[#ff6b6b] text-sm font-medium text-white hover:bg-[#e05555] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploading && (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
              Confirmar
            </button>
          ) : (
            <button
              onClick={handleMemoryConfirm}
              disabled={!selectedMemory || savingMemory}
              className="px-5 py-2 rounded-lg bg-[#ff6b6b] text-sm font-medium text-white hover:bg-[#e05555] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingMemory && (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
              Confirmar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start dev server and test end-to-end**

```bash
cd frontend && npm run dev
```

Manual test checklist:
1. Open a trip detail page → confirm "✏️ Alterar capa" button appears in hero
2. Click it → modal opens
3. **Upload tab:** select a JPG file → preview shows → click Confirmar → hero updates with new image → card on trips list shows image banner
4. Open modal again → **Memórias tab:** if trip has photo memories, grid appears → select one → Confirmar → cover updates
5. Click outside modal → closes without changes
6. Press ESC → closes without changes
7. Trip with no cover: card looks identical to before (no image)

- [ ] **Step 4: Run backend tests one final time**

```bash
cd backend && pytest -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/CoverImageModal.tsx
git commit -m "feat: CoverImageModal with upload and memory picker tabs"
```

---

## Final Integration Check

- [ ] **Verify all TypeScript is clean**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Verify all backend tests pass**

```bash
cd backend && pytest -v
```

- [ ] **Manual smoke test**

1. Create a new trip → card shows no cover image
2. Go to trip overview → click "Alterar capa" → upload an image → cover appears in hero and in card
3. Click "Alterar capa" again → Memórias tab → pick a photo → cover updates
4. Refresh the page → cover persists (loaded from DB)
