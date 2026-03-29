// frontend/app/trips/[tripId]/add-media/page.tsx
"use client";

import React from "react";
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
