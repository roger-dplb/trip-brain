# Add Media to Trip — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a page inside the trip detail (sidebar nav) where the user can drag-and-drop photos and videos; the files are uploaded via presigned URLs and the `POST /trips/{trip_id}/add-media` endpoint is called to trigger AI processing.

**Architecture:** New page `app/trips/[tripId]/add-media/page.tsx` mirrors the existing `app/trips/import/page.tsx` flow. Reuses `createImportPresign` for upload and calls a new `addMediaToTrip` API function. After the job is enqueued the user is redirected to the trip timeline. A small backend prerequisite extends the import-presign allowed content types to include videos.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, native `fetch`, Vitest + Testing Library.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `backend/app/api/routes/uploads.py` | Add video MIME types to `_IMPORT_ALLOWED_CONTENT_TYPES` |
| Modify | `frontend/lib/api.ts` | Add `TripAddMediaResponse` type + `addMediaToTrip()` |
| Modify | `frontend/components/trip-sidebar.tsx` | Add "Adicionar Mídia" nav item with Upload icon |
| Create | `frontend/app/trips/[tripId]/add-media/page.tsx` | Upload page (photos + videos, presign flow, enqueue job) |
| Create | `frontend/tests/api-add-media.test.ts` | Unit tests for `addMediaToTrip` |
| Create | `frontend/tests/add-media-page.test.tsx` | Component tests for the add-media page |

---

## Task 0 (Backend prerequisite): Allow video content types in import-presign

**Files:**
- Modify: `backend/app/api/routes/uploads.py`

- [ ] **Step 1: Update the allowed types constant**

In `backend/app/api/routes/uploads.py`, replace:

```python
_IMPORT_ALLOWED_CONTENT_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
```

With:

```python
_IMPORT_ALLOWED_CONTENT_TYPES = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/quicktime",
    "video/avi",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
})
```

- [ ] **Step 2: Run backend tests to confirm nothing broke**

```bash
cd backend && python -m pytest -v
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/uploads.py
git commit -m "feat: allow video content types in import-presign endpoint"
```

---

## Task 1: Add addMediaToTrip API function

**Files:**
- Modify: `frontend/lib/api.ts`
- Test: `frontend/tests/api-add-media.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/tests/api-add-media.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { addMediaToTrip } from "@/lib/api";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

describe("addMediaToTrip", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
    localStorageMock.setItem("trip_archive_access_token", "test-token");
  });

  it("sends POST to /trips/{tripId}/add-media with object_keys", async () => {
    const mockResponse = { trip_id: "trip-123", job_id: "job-456" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve(mockResponse),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await addMediaToTrip("trip-123", ["imports/s/a.jpg", "imports/s/b.mp4"]);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/trips/trip-123/add-media");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.object_keys).toEqual(["imports/s/a.jpg", "imports/s/b.mp4"]);
    expect(result.job_id).toBe("job-456");
    expect(result.trip_id).toBe("trip-123");
  });

  it("includes Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ trip_id: "t", job_id: "j" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await addMediaToTrip("trip-123", ["imports/s/a.jpg"]);

    const [, options] = fetchMock.mock.calls[0];
    const headers = new Headers(options.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm run test:run -- tests/api-add-media.test.ts
```

Expected: FAIL with `addMediaToTrip is not exported`

- [ ] **Step 3: Add the type and function to lib/api.ts**

After the `TripImportResponse` type (around line 444), add:

```typescript
export type TripAddMediaResponse = {
  trip_id: string;
  job_id: string;
};
```

Then after the `importTripFromPhotos` function, add:

```typescript
export function addMediaToTrip(
  tripId: string,
  objectKeys: string[],
): Promise<TripAddMediaResponse> {
  return request<TripAddMediaResponse>(
    `/trips/${tripId}/add-media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object_keys: objectKeys }),
    },
    API_BASE_PUBLIC,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npm run test:run -- tests/api-add-media.test.ts
```

Expected: 2 PASSED

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts frontend/tests/api-add-media.test.ts
git commit -m "feat: add addMediaToTrip API function"
```

---

## Task 2: Add sidebar nav item

**Files:**
- Modify: `frontend/components/trip-sidebar.tsx`

- [ ] **Step 1: Add the Upload icon SVG function**

In `frontend/components/trip-sidebar.tsx`, after the `ChatBubble` function (around line 130), add:

```tsx
function Upload() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}
```

- [ ] **Step 2: Add the nav item**

In `frontend/components/trip-sidebar.tsx`, find the `navItems` array (around line 177):

```tsx
const navItems = [
  { href: `/trips/${tripId}`, label: "Visão Geral", icon: <MapPin /> },
  { href: `/trips/${tripId}/timeline`, label: "Timeline", icon: <BarChart /> },
  { href: `/trips/${tripId}/memories`, label: "Memórias", icon: <Camera /> },
  { href: `/trips/${tripId}/stories`, label: "Stories", icon: <Film /> },
  { href: `/trips/${tripId}/chat`, label: "Chat", icon: <ChatBubble /> },
];
```

Replace with:

```tsx
const navItems = [
  { href: `/trips/${tripId}`, label: "Visão Geral", icon: <MapPin /> },
  { href: `/trips/${tripId}/timeline`, label: "Timeline", icon: <BarChart /> },
  { href: `/trips/${tripId}/memories`, label: "Memórias", icon: <Camera /> },
  { href: `/trips/${tripId}/add-media`, label: "Adicionar Mídia", icon: <Upload /> },
  { href: `/trips/${tripId}/stories`, label: "Stories", icon: <Film /> },
  { href: `/trips/${tripId}/chat`, label: "Chat", icon: <ChatBubble /> },
];
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/components/trip-sidebar.tsx
git commit -m "feat: add Adicionar Mídia nav item to trip sidebar"
```

---

## Task 3: Create the add-media page

**Files:**
- Create: `frontend/app/trips/[tripId]/add-media/page.tsx`
- Test: `frontend/tests/add-media-page.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/tests/add-media-page.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ tripId: "trip-123" }),
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock API functions
vi.mock("@/lib/api", () => ({
  createImportPresign: vi.fn(),
  addMediaToTrip: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import AddMediaPage from "@/app/trips/[tripId]/add-media/page";
import { createImportPresign, addMediaToTrip } from "@/lib/api";

describe("AddMediaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the drop zone and import button", () => {
    render(<AddMediaPage />);
    expect(
      screen.getByText(/arraste suas fotos e vídeos/i),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /adicionar à viagem/i }),
    ).toBeDefined();
  });

  it("import button is disabled when no files selected", () => {
    render(<AddMediaPage />);
    const btn = screen.getByRole("button", {
      name: /adicionar à viagem/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("shows error when API call fails", async () => {
    const { createImportPresign: mockPresign } = await import("@/lib/api");
    (mockPresign as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    render(<AddMediaPage />);

    // Simulate file selection via file input
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.upload(input, file);

    const btn = screen.getByRole("button", { name: /adicionar à viagem/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/ocorreu um erro/i)).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm run test:run -- tests/add-media-page.test.tsx
```

Expected: FAIL with module not found

- [ ] **Step 3: Create the page**

```tsx
// frontend/app/trips/[tripId]/add-media/page.tsx
"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, addMediaToTrip, createImportPresign } from "@/lib/api";

function ArrowLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#8b8b8b"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

type SelectedFile = {
  file: File;
  preview: string | null; // null for videos
  id: string;
  isVideo: boolean;
};

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/avi",
  "video/x-msvideo",
  "video/x-matroska",
  "video/webm",
];
const ACCEPTED_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES];

export default function AddMediaPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const accepted = newFiles.filter((f) => ACCEPTED_TYPES.includes(f.type));
    const selected: SelectedFile[] = accepted.map((file) => {
      const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);
      return {
        file,
        preview: isVideo ? null : URL.createObjectURL(file),
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        isVideo,
      };
    });
    setFiles((prev) => [...prev, ...selected]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(Array.from(e.target.files));
        e.target.value = "";
      }
    },
    [addFiles],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const toRemove = prev.find((f) => f.id === id);
      if (toRemove?.preview) URL.revokeObjectURL(toRemove.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  async function handleAddMedia() {
    if (files.length === 0 || uploading) return;

    setError(null);
    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    try {
      let sessionId: string | undefined;
      const objectKeys: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const { file } = files[i];
        setUploadProgress({ current: i + 1, total: files.length });

        const presign = await createImportPresign({
          session_id: sessionId,
          filename: file.name,
          content_type: file.type,
          file_size_bytes: file.size,
        });

        if (!sessionId) {
          sessionId = presign.session_id;
        }

        const uploadResponse = await fetch(presign.upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Falha ao enviar "${file.name}". Tente novamente.`);
        }

        objectKeys.push(presign.object_key);
      }

      await addMediaToTrip(tripId, objectKeys);

      setSuccess(true);
      setTimeout(() => {
        router.push(`/trips/${tripId}/timeline`);
      }, 2500);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Erro ao enviar (código ${err.status}). Tente novamente.`);
      } else if (err instanceof Error) {
        setError(err.message || "Ocorreu um erro ao enviar os arquivos. Tente novamente.");
      } else {
        setError("Ocorreu um erro inesperado. Tente novamente.");
      }
      setUploading(false);
    }
  }

  const photoCount = files.filter((f) => !f.isVideo).length;
  const videoCount = files.filter((f) => f.isVideo).length;

  function fileSummary() {
    const parts: string[] = [];
    if (photoCount > 0) parts.push(`${photoCount} foto${photoCount > 1 ? "s" : ""}`);
    if (videoCount > 0) parts.push(`${videoCount} vídeo${videoCount > 1 ? "s" : ""}`);
    return parts.join(" e ") + " selecionado" + (files.length > 1 ? "s" : "");
  }

  return (
    <div className="min-h-screen bg-[#fff9f6]">
      <header className="bg-white border-b border-[rgba(0,0,0,0.08)]">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <span className="text-lg font-bold text-[#242424]">Adicionar Mídia</span>
          <Link
            href={`/trips/${tripId}`}
            className="flex items-center gap-1.5 text-sm text-[#8b8b8b] hover:text-[#242424] transition-colors"
          >
            <ArrowLeft />
            Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-[#242424]">
            Adicionar fotos e vídeos
          </h1>
          <p className="text-sm text-[#8b8b8b] mt-1">
            Envie novos arquivos e nossa IA os organizará automaticamente na viagem
          </p>
        </div>

        <section className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] shadow-sm p-5 sm:p-6 space-y-5">
          {success ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-[#242424]">
                Processando sua mídia...
              </h2>
              <p className="text-sm text-[#8b8b8b]">
                Arquivos enviados com sucesso. Novos dias e atividades aparecerão na
                timeline em instantes.
              </p>
            </div>
          ) : (
            <>
              {/* Drag-and-drop zone */}
              <div
                className={`relative rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-3 py-10 px-6 text-center cursor-pointer select-none ${
                  isDragOver
                    ? "border-[#ff6b6b] bg-[#fff0ed]"
                    : "border-[rgba(0,0,0,0.15)] hover:border-[#ff6b6b] hover:bg-[#fff9f6]"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isDragOver ? "#ff6b6b" : "#c0c0c0"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="16 16 12 12 8 16" />
                  <line x1="12" y1="12" x2="12" y2="21" />
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-[#242424]">
                    {isDragOver
                      ? "Solte os arquivos aqui"
                      : "Arraste suas fotos e vídeos ou clique para selecionar"}
                  </p>
                  <p className="text-xs text-[#8b8b8b] mt-1">
                    Fotos: JPEG, PNG, WebP · Vídeos: MP4, MOV, AVI, MKV
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* File count */}
              {files.length > 0 && (
                <p className="text-sm text-[#8b8b8b]">{fileSummary()}</p>
              )}

              {/* File grid */}
              {files.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {files.map((f) => (
                    <div key={f.id} className="relative group aspect-square">
                      {f.isVideo ? (
                        <div className="w-full h-full rounded-lg bg-[#f3ece8] flex items-center justify-center">
                          <VideoIcon />
                        </div>
                      ) : (
                        <img
                          src={f.preview!}
                          alt={f.file.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(f.id);
                        }}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remover arquivo"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="3"
                          strokeLinecap="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload progress */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#242424] font-medium">Enviando arquivos...</span>
                    <span className="text-[#8b8b8b]">
                      {uploadProgress.current}/{uploadProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-[#f0f0f0] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#ff6b6b] h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          uploadProgress.total > 0
                            ? (uploadProgress.current / uploadProgress.total) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Error banner */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-3">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    className="shrink-0 mt-0.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Add button */}
              <button
                type="button"
                onClick={handleAddMedia}
                disabled={files.length === 0 || uploading}
                className="w-full rounded-lg bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                {uploading ? (
                  <>
                    <svg
                      className="animate-spin text-white shrink-0"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Enviando arquivos... ({uploadProgress.current}/{uploadProgress.total})
                  </>
                ) : (
                  "Adicionar à viagem"
                )}
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm run test:run -- tests/add-media-page.test.tsx
```

Expected: 3 PASSED

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Run full frontend test suite**

```bash
cd frontend && npm run test:run
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add frontend/app/trips/[tripId]/add-media/page.tsx frontend/tests/add-media-page.test.tsx
git commit -m "feat: add add-media page for uploading photos and videos to existing trip"
```

---

## Task 4: Final regression

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && python -m pytest -v
```

Expected: all pass

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npm run test:run
```

Expected: all pass

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors
