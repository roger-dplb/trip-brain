"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    Activity,
    Trip,
    completeUpload,
    createUploadPresign,
    deleteMemory,
    fetchActivitiesByDay,
    fetchDaysByTrip,
    fetchMemoriesByTrip,
    fetchTrip,
} from "@/lib/api";
import { getDayLabel } from "@/lib/utils";

type PageProps = {
  params: {
    tripId: string;
  };
};

const inputClass =
  "w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2.5 text-sm text-[#242424] placeholder-[#8b8b8b] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors";

export default function TripMemoriesPage({ params }: PageProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [memories, setMemories] = useState<
    Array<{
      id: string;
      memory_type: string;
      caption?: string | null;
      storage_key: string;
      public_url?: string | null;
      created_at: string;
      day_id?: string | null;
      activity_id?: string | null;
    }>
  >([]);
  const [days, setDays] = useState<Array<{ id: string; day_number: number; date?: string | null }>>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedDayId, setSelectedDayId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [caption, setCaption] = useState("");
  const [memoryType, setMemoryType] = useState("photo");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; caption?: string | null } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [tripMemories, tripDays, tripData] = await Promise.all([
      fetchMemoriesByTrip(params.tripId),
      fetchDaysByTrip(params.tripId),
      fetchTrip(params.tripId),
    ]);
    setMemories(tripMemories);
    setDays(tripDays.map((day) => ({ id: day.id, day_number: day.day_number, date: day.date })));
    setTrip(tripData);
  }, [params.tripId]);

  useEffect(() => {
    loadData().catch(() => setError("Falha ao carregar memórias."));
  }, [loadData]);

  useEffect(() => {
    if (!selectedDayId) {
      setActivities([]);
      setSelectedActivityId("");
      return;
    }
    fetchActivitiesByDay(selectedDayId)
      .then((result) => {
        setActivities(result);
        setSelectedActivityId("");
      })
      .catch(() => setError("Falha ao carregar atividades do dia."));
  }, [selectedDayId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }

    if (memoryType !== "note" && !file) {
      setError("Selecione uma foto ou vídeo.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const presign = await createUploadPresign({
        trip_id: params.tripId,
        day_id: selectedDayId || undefined,
        activity_id: selectedActivityId || undefined,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        file_size_bytes: file.size,
      });

      const uploadResponse = await fetch(presign.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!uploadResponse.ok) throw new Error("upload_failed");

      await completeUpload({
        trip_id: params.tripId,
        day_id: selectedDayId || undefined,
        activity_id: selectedActivityId || undefined,
        memory_type: memoryType,
        object_key: presign.object_key,
        caption,
      });

      setCaption("");
      setFile(null);
      await loadData();
    } catch {
      setError("Não foi possível fazer upload da memória.");
    } finally {
      setLoading(false);
    }
  }

  const selectClass =
    "w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2.5 text-sm text-[#242424] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors";

  function renderMemoryPreview(memory: (typeof memories)[number]) {
    if (!memory.public_url) {
      return null;
    }

    if (memory.memory_type === "photo") {
      return (
        <button
          type="button"
          className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#fff9f6] cursor-zoom-in"
          onClick={() => setLightbox({ url: memory.public_url!, caption: memory.caption })}
        >
          <Image
            src={memory.public_url}
            alt={memory.caption ?? "Memória da viagem"}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover hover:scale-105 transition-transform duration-300"
            unoptimized
          />
        </button>
      );
    }

    if (memory.memory_type === "video") {
      return (
        <video
          className="mt-3 aspect-[4/3] w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-black object-cover"
          controls
          preload="metadata"
          src={memory.public_url}
        />
      );
    }

    return null;
  }

  return (
    <>
    {lightbox && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        onClick={() => setLightbox(null)}
      >
        <button
          type="button"
          className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          onClick={() => setLightbox(null)}
          aria-label="Fechar"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.caption ?? "Memória da viagem"}
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
          />
          {lightbox.caption && (
            <p className="mt-3 text-center text-sm text-white/80">{lightbox.caption}</p>
          )}
        </div>
      </div>
    )}
    <div className="min-h-screen">
      {/* Page header */}
      <div className="bg-[#f3ece8] border-b border-[rgba(0,0,0,0.08)] px-4 sm:px-8 lg:px-12 py-6 sm:py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#242424]">Memórias</h1>
        <p className="text-sm text-[#8b8b8b] mt-1">Fotos, vídeos e notas da viagem</p>
      </div>

      <div className="px-4 sm:px-8 lg:px-12 py-6 sm:py-8 space-y-8">
        {/* Upload form */}
        <section className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-6">
          <h2 className="text-lg font-semibold text-[#242424] mb-4">Upload de memória</h2>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[#242424] mb-1.5">Tipo</label>
                <Select
                  value={memoryType}
                  onValueChange={(val) => {
                    setMemoryType(val);
                    if (val === "note") setFile(null);
                  }}
                >
                  <SelectTrigger className="w-full h-11 bg-white border-[rgba(0,0,0,0.12)] text-[#242424] focus:ring-[#ff6b6b] focus:border-[#ff6b6b] transition-colors rounded-lg">
                    <SelectValue placeholder="Selecione um tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="photo">Foto</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="note">Nota</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#242424] mb-1.5">Dia</label>
                <Select
                  value={selectedDayId || "none"}
                  onValueChange={(val) => setSelectedDayId(val === "none" ? "" : val)}
                >
                  <SelectTrigger className="w-full h-11 bg-white border-[rgba(0,0,0,0.12)] text-[#242424] focus:ring-[#ff6b6b] focus:border-[#ff6b6b] transition-colors rounded-lg">
                    <SelectValue placeholder="Sem dia específico" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem dia específico</SelectItem>
                    {days.map((day) => (
                      <SelectItem key={day.id} value={day.id}>
                        {getDayLabel(day.day_number, trip?.start_date, day.date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedDayId && (
                <div>
                  <label className="block text-sm font-medium text-[#242424] mb-1.5">
                    Atividade
                  </label>
                  <Select
                    value={selectedActivityId || "none"}
                    onValueChange={(val) => setSelectedActivityId(val === "none" ? "" : val)}
                    disabled={!selectedDayId}
                  >
                    <SelectTrigger className="w-full h-11 bg-white border-[rgba(0,0,0,0.12)] text-[#242424] focus:ring-[#ff6b6b] focus:border-[#ff6b6b] transition-colors rounded-lg">
                      <SelectValue placeholder="Sem atividade específica" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem atividade específica</SelectItem>
                      {activities.map((activity) => (
                        <SelectItem key={activity.id} value={activity.id}>
                          {activity.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[#242424] mb-1.5">Legenda</label>
              <input
                className={inputClass}
                placeholder="Uma descrição desta memória..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>

            {memoryType !== "note" && (
              <div>
                <label className="block text-sm font-medium text-[#242424] mb-1.5">
                  {memoryType === "photo" ? "Foto" : memoryType === "video" ? "Vídeo" : "Arquivo"}
                </label>
                <label className="flex flex-col items-center justify-center w-full min-h-[120px] rounded-xl border-2 border-dashed border-[rgba(0,0,0,0.15)] bg-[#fafafa] hover:bg-[#f3ece8] hover:border-[#ff6b6b] transition-colors cursor-pointer group relative">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="sr-only"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] ?? null;
                      setFile(selected);
                      if (selected) {
                        if (selected.type.startsWith("video/")) setMemoryType("video");
                        else if (selected.type.startsWith("image/")) setMemoryType("photo");
                      }
                    }}
                    required={memoryType !== "note"}
                  />
                  {file ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-4 text-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        {file.type.startsWith("video/") ? (
                          <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9 5 3-5 3V9z"/></>
                        ) : (
                          <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>
                        )}
                      </svg>
                      <p className="text-sm font-medium text-[#242424] max-w-[200px] truncate">{file.name}</p>
                      <p className="text-xs text-[#8b8b8b]">{(file.size / 1024 / 1024).toFixed(1)} MB · clique para trocar</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c0b5ae" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:stroke-[#ff6b6b] transition-colors">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <p className="text-sm text-[#8b8b8b] group-hover:text-[#242424] transition-colors">
                        Clique para selecionar <span className="font-medium text-[#ff6b6b]">foto ou vídeo</span>
                      </p>
                      <p className="text-xs text-[#c0b5ae]">JPG, PNG, GIF, MP4, MOV…</p>
                    </div>
                  )}
                </label>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              className="w-full sm:w-auto rounded-lg bg-[#ff6b6b] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "Enviando..." : "Enviar memória"}
            </button>
          </form>
        </section>

        {/* Memories list */}
        <section>
          <h2 className="text-lg font-semibold text-[#242424] mb-4">
            {memories.length > 0 ? `${memories.length} memórias` : "Memórias"}
          </h2>
          {memories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgba(0,0,0,0.15)] p-8 sm:p-12 text-center">
              <p className="text-[#8b8b8b] text-sm">Nenhuma memória registrada ainda.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {memories.map((memory) => (
                <article
                  key={memory.id}
                  className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-[#ff6b6b] capitalize bg-[#f3ece8] px-2 py-0.5 rounded-full">
                      {memory.memory_type}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8b8b8b]">
                        {new Date(memory.created_at).toLocaleDateString("pt-BR")}
                      </span>
                      <button
                        type="button"
                        disabled={deletingId === memory.id}
                        className="text-[#c0b5ae] hover:text-red-500 transition-colors disabled:opacity-40"
                        aria-label="Excluir memória"
                        onClick={async () => {
                          if (!confirm("Excluir esta memória?")) return;
                          setDeletingId(memory.id);
                          try {
                            await deleteMemory(memory.id);
                            await loadData();
                          } catch {
                            setError("Não foi possível excluir a memória.");
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                      >
                        {deletingId === memory.id ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-[#242424] mt-2">
                    {memory.caption ?? "Sem legenda"}
                  </p>
                  {renderMemoryPreview(memory)}
                  <p className="text-xs text-[#8b8b8b] mt-1 break-all">{memory.storage_key}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
    </>
  );
}
