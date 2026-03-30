"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { Timeline, Trip, completeUpload, createUploadPresign, fetchTrip, fetchTripTimeline } from "@/lib/api";
import { formatDate, getDayLabel } from "@/lib/utils";

type PageProps = {
  params: { tripId: string };
};

type LocationGroup = {
  location: Timeline["days"][number]["location"];
  days: Timeline["days"];
};

function groupDaysByLocation(days: Timeline["days"]): LocationGroup[] {
  const groups: LocationGroup[] = [];
  for (const day of days) {
    const loc = day.location ?? null;
    const key = loc ? `${loc.country}|${loc.city}` : null;
    const last = groups[groups.length - 1];
    const lastKey = last?.location ? `${last.location.country}|${last.location.city}` : null;
    if (last && key !== null && key === lastKey) {
      last.days.push(day);
    } else {
      groups.push({ location: loc, days: [day] });
    }
  }
  return groups;
}

export default function TripTimelinePage({ params }: PageProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ items: { url: string; caption?: string | null; type: "photo" | "video" }[]; index: number } | null>(null);
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

  const openLightbox = useCallback((items: { url: string; caption?: string | null; type: "photo" | "video" }[], index: number) => {
    setLightbox({ items, index });
  }, []);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  const lightboxPrev = useCallback(() => {
    setLightbox((lb) => lb && lb.index > 0 ? { ...lb, index: lb.index - 1 } : lb);
  }, []);

  const lightboxNext = useCallback(() => {
    setLightbox((lb) => lb && lb.index < lb.items.length - 1 ? { ...lb, index: lb.index + 1 } : lb);
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") lightboxPrev();
      else if (e.key === "ArrowRight") lightboxNext();
      else if (e.key === "Escape") closeLightbox();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, lightboxPrev, lightboxNext, closeLightbox]);

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

  function renderMemoryCell(
    memory: Timeline["days"][number]["memories"][number],
    index: number,
    allMemories: Timeline["days"][number]["memories"],
    totalCount: number
  ) {
    const isLastVisible = totalCount > 4 && index === 3;
    const hiddenCount = totalCount - 4;
    const mediaList = allMemories
      .filter((m) => m.public_url)
      .map((m) => ({ url: m.public_url!, caption: m.caption, type: m.memory_type as "photo" | "video" }));
    const mediaIndex = mediaList.findIndex((p) => p.url === memory.public_url);

    if (memory.memory_type === "video" && memory.public_url) {
      return (
        <button
          key={memory.id}
          type="button"
          className="relative aspect-square overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)] bg-black cursor-pointer"
          onClick={() => openLightbox(mediaList, mediaIndex >= 0 ? mediaIndex : 0)}
        >
          <video
            className="w-full h-full object-cover pointer-events-none"
            preload="metadata"
            src={memory.public_url}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
          </div>
          {isLastVisible && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xl font-bold rounded-lg">
              +{hiddenCount}
            </span>
          )}
        </button>
      );
    }

    if (memory.memory_type === "photo" && memory.public_url) {
      return (
        <button
          key={memory.id}
          type="button"
          className="relative aspect-square overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)] bg-white cursor-zoom-in"
          onClick={() => openLightbox(mediaList, mediaIndex >= 0 ? mediaIndex : 0)}
        >
          <Image
            src={memory.public_url}
            alt={memory.caption ?? "Memória da viagem"}
            fill
            sizes="(max-width: 768px) 50vw, 20vw"
            className="object-cover hover:scale-105 transition-transform duration-300"
            unoptimized
          />
          {isLastVisible && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xl font-bold rounded-lg">
              +{hiddenCount}
            </span>
          )}
        </button>
      );
    }

    return null;
  }

  function renderMemoriesGrid(memories: Timeline["days"][number]["memories"]) {
    const visible = memories.filter((m) => m.public_url);
    if (visible.length === 0) return null;

    const shown = visible.slice(0, 4);
    const total = visible.length;

    if (total === 1) {
      const m = shown[0];
      const singleItem = [{ url: m.public_url!, caption: m.caption, type: m.memory_type as "photo" | "video" }];
      if (m.memory_type === "video") {
        return (
          <button
            type="button"
            className="relative mt-2 aspect-[4/3] w-full overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)] bg-black cursor-pointer"
            onClick={() => openLightbox(singleItem, 0)}
          >
            <video className="w-full h-full object-cover pointer-events-none" preload="metadata" src={m.public_url ?? undefined} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            </div>
          </button>
        );
      }
      return (
        <button
          type="button"
          className="relative mt-2 aspect-[4/3] w-full overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)] bg-white cursor-zoom-in"
          onClick={() => openLightbox(singleItem, 0)}
        >
          <Image src={m.public_url!} alt={m.caption ?? "Memória da viagem"} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover hover:scale-105 transition-transform duration-300" unoptimized />
        </button>
      );
    }

    if (total === 3) {
      return (
        <div className="mt-2 space-y-1">
          <div className="w-full">{renderMemoryCell(shown[0], 0, visible, total)}</div>
          <div className="grid grid-cols-2 gap-1">
            {shown.slice(1).map((m, i) => renderMemoryCell(m, i + 1, visible, total))}
          </div>
        </div>
      );
    }

    return (
      <div className="mt-2 grid grid-cols-2 gap-1">
        {shown.map((m, i) => renderMemoryCell(m, i, visible, total))}
      </div>
    );
  }

  return (
    <>
    {lightbox && (() => {
      const current = lightbox.items[lightbox.index];
      const hasPrev = lightbox.index > 0;
      const hasNext = lightbox.index < lightbox.items.length - 1;
      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            onClick={closeLightbox}
            aria-label="Fechar"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {hasPrev && (
            <button
              type="button"
              className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors bg-black/30 hover:bg-black/50 rounded-full p-2"
              onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
              aria-label="Anterior"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          {hasNext && (
            <button
              type="button"
              className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors bg-black/30 hover:bg-black/50 rounded-full p-2"
              onClick={(e) => { e.stopPropagation(); lightboxNext(); }}
              aria-label="Próxima"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {current.type === "video" ? (
              <video
                key={current.url}
                src={current.url}
                controls
                autoPlay
                className="max-h-[85vh] max-w-[90vw] rounded-xl shadow-2xl"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.url}
                alt={current.caption ?? "Memória da viagem"}
                className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
              />
            )}
            {lightbox.items.length > 1 && (
              <p className="mt-2 text-center text-xs text-white/50">{lightbox.index + 1} / {lightbox.items.length}</p>
            )}
            {current.caption && (
              <p className="mt-1 text-center text-sm text-white/80">{current.caption}</p>
            )}
          </div>
        </div>
      );
    })()}
    <div className="min-h-screen">
      {/* Page header */}
      <div className="bg-[#f3ece8] border-b border-[rgba(0,0,0,0.08)] px-4 sm:px-8 lg:px-12 py-6 sm:py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#242424]">Timeline</h1>
        {(trip.start_date || trip.end_date) && (
          <p className="text-sm text-[#8b8b8b] mt-1">
            {[trip.start_date ? formatDate(trip.start_date) : null, trip.end_date ? formatDate(trip.end_date) : null].filter(Boolean).join(" → ")}
          </p>
        )}
      </div>

      <div className="px-4 sm:px-8 lg:px-12 py-6 sm:py-8">
        {timeline.days.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgba(0,0,0,0.15)] p-8 sm:p-12 text-center">
            <p className="text-[#8b8b8b] text-sm">Nenhum item na timeline ainda.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupDaysByLocation(timeline.days).map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-4">
                {group.location && (
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-base">📍</span>
                    <span className="text-sm font-semibold text-[#242424]">
                      {group.location.city}, {group.location.country}
                    </span>
                    <span className="text-xs text-[#8b8b8b]">
                      — {group.days.length === 1
                        ? `Dia ${group.days[0].day_number}`
                        : `Dias ${group.days[0].day_number}–${group.days[group.days.length - 1].day_number}`}
                    </span>
                  </div>
                )}
                {group.days.map((day) => (
              <article
                key={day.id}
                className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] overflow-hidden"
              >
                {/* Day header */}
                <div className="bg-[#fafafa] border-b border-[rgba(0,0,0,0.08)] px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-[#ff6b6b] uppercase tracking-wider bg-[#fff0f0] px-2 py-0.5 rounded-md">
                        Dia {day.day_number}
                      </span>
                      {(() => {
                        const label = day.location
                          ? `${day.location.city}, ${day.location.country}`
                          : Array.from(new Set(day.activities.map(a => a.location).filter((l): l is string => !!l))).slice(0, 3).join(" · ");
                      
                        return label ? (
                          <span className="text-xs font-medium text-[#8b8b8b] flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-[rgba(0,0,0,0.15)] mx-1"></span>
                            {label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <h2 className="font-semibold text-[#242424] text-lg">{getDayLabel(day.day_number, trip?.start_date, day.date)}</h2>
                  </div>
                </div>

                <div className="p-4 sm:p-6 grid sm:grid-cols-2 gap-6">
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
                            <div className="flex items-center gap-2 shrink-0">
                              {activity.location_detail ? (
                                <span className="text-xs text-[#8b8b8b] flex items-center gap-0.5">
                                  📍 {activity.location_detail.place_name || activity.location_detail.city}
                                </span>
                              ) : activity.location ? (
                                <span className="text-xs text-[#8b8b8b] truncate max-w-[120px]">
                                  {activity.location}
                                </span>
                              ) : null}
                            </div>
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
                        [(
                          <li key="memories-grid" className="rounded-lg bg-[#fff9f6] px-3 py-2 text-sm">
                            {renderMemoriesGrid(day.memories)}
                          </li>
                        )]
                      )}
                    </ul>
                  </div>
                </div>
              </article>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
