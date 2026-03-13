"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { Trip, Timeline, fetchTrip, fetchTripTimeline, createUploadPresign, completeUpload } from "@/lib/api";

type PageProps = {
  params: { tripId: string };
};

export default function TripTimelinePage({ params }: PageProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; caption?: string | null } | null>(null);
  const [uploadingDayId, setUploadingDayId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [openUploadDayId, setOpenUploadDayId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      try {
        const [tripData, timelineData] = await Promise.all([
          fetchTrip(params.tripId),
          fetchTripTimeline(params.tripId),
        ]);
        setTrip(tripData);
        setTimeline(timelineData);
      } catch {
        setError("Falha ao carregar a timeline.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.tripId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#8b8b8b] text-sm">Carregando timeline...</p>
      </div>
    );
  }

  if (error || !trip || !timeline) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500 text-sm">{error ?? "Erro ao carregar."}</p>
      </div>
    );
  }

  async function handleDayUpload(dayId: string, activityId: string | undefined, file: File) {
    setUploadingDayId(dayId);
    setUploadError(null);
    try {
      const memoryType = file.type.startsWith("video/") ? "video" : "photo";
      const presign = await createUploadPresign({
        trip_id: params.tripId,
        day_id: dayId,
        activity_id: activityId || undefined,
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
        day_id: dayId,
        activity_id: activityId || undefined,
        memory_type: memoryType,
        object_key: presign.object_key,
      });
      const updated = await fetchTripTimeline(params.tripId);
      setTimeline(updated);
      setOpenUploadDayId(null);
      setSelectedActivityId((prev) => { const next = { ...prev }; delete next[dayId]; return next; });
    } catch {
      setUploadError("Não foi possível fazer upload.");
    } finally {
      setUploadingDayId(null);
    }
  }

  function renderMemoryPreview(memory: Timeline["days"][number]["memories"][number]) {
    if (!memory.public_url) {
      return null;
    }

    if (memory.memory_type === "photo") {
      return (
        <button
          type="button"
          className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)] bg-white cursor-zoom-in"
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
      <div className="bg-[#f3ece8] border-b border-[rgba(0,0,0,0.08)] px-12 py-8">
        <h1 className="text-3xl font-bold text-[#242424]">Timeline</h1>
        {(trip.start_date || trip.end_date) && (
          <p className="text-sm text-[#8b8b8b] mt-1">
            {[trip.start_date, trip.end_date].filter(Boolean).join(" → ")}
          </p>
        )}
      </div>

      <div className="px-12 py-8">
        {timeline.days.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgba(0,0,0,0.15)] p-12 text-center">
            <p className="text-[#8b8b8b] text-sm">Nenhum item na timeline ainda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {timeline.days.map((day) => (
              <article
                key={day.id}
                className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] overflow-hidden"
              >
                {/* Day header */}
                <div className="bg-[#f3ece8] border-b border-[rgba(0,0,0,0.08)] px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#ff6b6b] rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {day.day_number}
                    </div>
                    <h2 className="font-semibold text-[#242424] text-lg">Dia {day.day_number}</h2>
                  </div>
                  {day.date && <span className="text-sm text-[#8b8b8b]">{day.date}</span>}
                </div>

                <div className="p-6 grid sm:grid-cols-2 gap-6">
                  {/* Activities */}
                  <div>
                    <p className="text-xs font-semibold text-[#8b8b8b] uppercase tracking-wide mb-3">
                      Atividades
                    </p>
                    <ul className="space-y-2">
                      {day.activities.length === 0 ? (
                        <li className="text-sm text-[#8b8b8b]">Sem atividades</li>
                      ) : (
                        day.activities.map((activity) => (
                          <li
                            key={activity.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-[#fff9f6] px-3 py-2 text-sm"
                          >
                            <span className="font-medium text-[#242424]">{activity.title}</span>
                            <span className="text-xs text-[#8b8b8b] capitalize px-2 py-0.5 bg-white rounded-full border border-[rgba(0,0,0,0.08)]">
                              {activity.status}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>

                  {/* Memories */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-[#8b8b8b] uppercase tracking-wide">
                        Memórias
                      </p>
                      <button
                        type="button"
                        disabled={uploadingDayId !== null}
                        onClick={() => setOpenUploadDayId(openUploadDayId === day.id ? null : day.id)}
                        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                          uploadingDayId === day.id
                            ? "border-[rgba(0,0,0,0.08)] text-[#8b8b8b] cursor-not-allowed"
                            : openUploadDayId === day.id
                            ? "border-[#ff6b6b] bg-[#ff6b6b] text-white"
                            : "border-[#ff6b6b] text-[#ff6b6b] hover:bg-[#ff6b6b] hover:text-white"
                        }`}
                      >
                        {uploadingDayId === day.id ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                            </svg>
                            Enviando…
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              {openUploadDayId === day.id
                                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                                : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>
                              }
                            </svg>
                            Foto / Vídeo
                          </>
                        )}
                      </button>
                    </div>

                    {/* Inline upload panel */}
                    {openUploadDayId === day.id && (
                      <div className="mb-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#fafafa] p-3 space-y-2">
                        {day.activities.length > 0 && (
                          <div>
                            <label className="block text-xs text-[#8b8b8b] mb-1">Atividade (opcional)</label>
                            <select
                              className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-2.5 py-2 text-xs text-[#242424] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors"
                              value={selectedActivityId[day.id] ?? ""}
                              onChange={(e) =>
                                setSelectedActivityId((prev) => ({ ...prev, [day.id]: e.target.value }))
                              }
                            >
                              <option value="">Sem atividade específica</option>
                              {day.activities.map((activity) => (
                                <option key={activity.id} value={activity.id}>
                                  {activity.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <label className="flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed border-[rgba(0,0,0,0.15)] bg-white hover:border-[#ff6b6b] hover:bg-[#fff9f6] transition-colors cursor-pointer py-3 text-xs text-[#8b8b8b] hover:text-[#ff6b6b]">
                          <input
                            type="file"
                            accept="image/*,video/*"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleDayUpload(day.id, selectedActivityId[day.id] || undefined, f);
                              e.target.value = "";
                            }}
                          />
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          Selecionar foto ou vídeo
                        </label>
                        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
                      </div>
                    )}

                    <ul className="space-y-2">
                      {day.memories.length === 0 ? (
                        <li className="text-sm text-[#8b8b8b]">Sem memórias</li>
                      ) : (
                        day.memories.map((memory) => (
                          <li key={memory.id} className="rounded-lg bg-[#fff9f6] px-3 py-2 text-sm">
                            <span className="font-medium text-[#242424] capitalize">
                              {memory.memory_type}
                            </span>
                            {memory.caption && (
                              <p className="text-[#8b8b8b] text-xs mt-0.5">{memory.caption}</p>
                            )}
                            {renderMemoryPreview(memory)}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
