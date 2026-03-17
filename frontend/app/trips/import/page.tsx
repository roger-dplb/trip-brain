"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createImportPresign, importTripFromPhotos } from "@/lib/api";

function HeartSolid() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

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

type SelectedFile = {
  file: File;
  preview: string;
  id: string;
};

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ImportTripPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) => ACCEPTED_TYPES.includes(f.type));
    const selected: SelectedFile[] = imageFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
    }));
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
        // Reset so the same file can be re-added after removal
        e.target.value = "";
      }
    },
    [addFiles],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const toRemove = prev.find((f) => f.id === id);
      if (toRemove) URL.revokeObjectURL(toRemove.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  async function handleImport() {
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
          content_type: file.type || "image/jpeg",
          file_size_bytes: file.size,
        });

        if (!sessionId) {
          sessionId = presign.session_id;
        }

        const uploadResponse = await fetch(presign.upload_url, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "image/jpeg",
          },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Falha ao enviar a foto "${file.name}". Tente novamente.`);
        }

        objectKeys.push(presign.object_key);
      }

      await importTripFromPhotos({
        session_id: sessionId!,
        object_keys: objectKeys,
      });

      setSuccess(true);
      setTimeout(() => {
        router.push("/trips");
      }, 2000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Erro ao importar viagem (código ${err.status}). Tente novamente.`);
      } else if (err instanceof Error) {
        setError(err.message || "Ocorreu um erro ao enviar as fotos. Tente novamente.");
      } else {
        setError("Ocorreu um erro inesperado. Tente novamente.");
      }
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fff9f6]">
      {/* Header */}
      <header className="bg-white border-b border-[rgba(0,0,0,0.08)]">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[#ff6b6b]">
              <HeartSolid />
            </span>
            <span className="text-lg sm:text-xl font-bold text-[#ff6b6b]">Roger e Ana</span>
          </div>
          <Link
            href="/trips"
            className="flex items-center gap-1.5 text-sm text-[#8b8b8b] hover:text-[#242424] transition-colors"
          >
            <ArrowLeft />
            Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-[#242424]">Importar viagem de fotos</h1>
          <p className="text-sm text-[#8b8b8b] mt-1">
            Envie fotos e nossa IA criará uma viagem automaticamente
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
              <h2 className="text-lg font-semibold text-[#242424]">Gerando sua viagem...</h2>
              <p className="text-sm text-[#8b8b8b]">
                Suas fotos foram enviadas com sucesso. Você será redirecionado em instantes.
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
                      ? "Solte as fotos aqui"
                      : "Arraste suas fotos ou clique para selecionar"}
                  </p>
                  <p className="text-xs text-[#8b8b8b] mt-1">JPEG, PNG ou WebP</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* File count */}
              {files.length > 0 && (
                <p className="text-sm text-[#8b8b8b]">
                  {files.length === 1
                    ? "1 foto selecionada"
                    : `${files.length} fotos selecionadas`}
                </p>
              )}

              {/* Photo grid */}
              {files.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {files.map((f) => (
                    <div key={f.id} className="relative group aspect-square">
                      <img
                        src={f.preview}
                        alt={f.file.name}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(f.id);
                        }}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remover foto"
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
                    <span className="text-[#242424] font-medium">Enviando fotos...</span>
                    <span className="text-[#8b8b8b]">
                      {uploadProgress.current}/{uploadProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-[#f0f0f0] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#ff6b6b] h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%`,
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

              {/* Import button */}
              <button
                type="button"
                onClick={handleImport}
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
                    Enviando fotos... ({uploadProgress.current}/{uploadProgress.total})
                  </>
                ) : (
                  "Importar viagem"
                )}
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
