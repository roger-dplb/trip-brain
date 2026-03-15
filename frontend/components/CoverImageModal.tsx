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

  // Revoke preview object URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

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
                    onClick={() => {
                      if (preview) URL.revokeObjectURL(preview);
                      setFile(null);
                      setPreview(null);
                      setUploadError(null);
                    }}
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
              {!memoriesLoading && !memoriesError && memories.length > 0 && (
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
