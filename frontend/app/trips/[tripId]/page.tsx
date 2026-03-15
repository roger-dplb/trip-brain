"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  Activity,
  Day,
  Trip,
  createActivity,
  createDay,
  deleteActivity,
  deleteDay,
  fetchActivitiesByDay,
  fetchDaysByTrip,
  fetchTrip,
  updateActivity,
  updateDay,
  updateTrip,
} from "@/lib/api";
import { CoverImageModal } from "@/components/CoverImageModal";
import { getDayLabel, formatDate } from "@/lib/utils";

// ─── Icons ────────────────────────────────────────────────────────────────────

function CalendarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PinIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDaysBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const diff = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24),
  );
  return diff >= 0 ? diff + 1 : null;
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function getTripDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function getCoveredDates(days: Day[], tripStartDate?: string | null): Set<string> {
  const covered = new Set<string>();
  for (const day of days) {
    if (day.date) {
      covered.add(day.date);
    } else if (tripStartDate) {
      const [y, m, d] = tripStartDate.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      date.setUTCDate(date.getUTCDate() + (day.day_number - 1));
      covered.add(date.toISOString().split("T")[0]);
    }
  }
  return covered;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  params: { tripId: string };
};

const inputClass =
  "rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2.5 text-sm text-[#242424] placeholder-[#8b8b8b] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors";

export default function TripDetailsPage({ params }: PageProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [activitiesByDay, setActivitiesByDay] = useState<Record<string, Activity[]>>({});
  const [dayNumber, setDayNumber] = useState(1);
  const [dayDate, setDayDate] = useState("");
  const [activityTitles, setActivityTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDay, setShowAddDay] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [addDayMode, setAddDayMode] = useState<"simple" | "select-date" | "extend">("simple");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedAvailableDate, setSelectedAvailableDate] = useState("");
  const [showCoverModal, setShowCoverModal] = useState(false);

  const orderedDays = useMemo(
    () => [...days].sort((a, b) => a.day_number - b.day_number),
    [days],
  );

  async function loadTripData() {
    setLoading(true);
    setError(null);
    try {
      const tripData = await fetchTrip(params.tripId);
      const tripDays = await fetchDaysByTrip(params.tripId);
      const mappedActivities = await Promise.all(
        tripDays.map(async (day) => [day.id, await fetchActivitiesByDay(day.id)] as const),
      );
      setTrip(tripData);
      setDays(tripDays);
      setActivitiesByDay(Object.fromEntries(mappedActivities));
    } catch {
      setError("Falha ao carregar a viagem.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTripData();
  }, [params.tripId]);

  function handleAddDayClick() {
    if (!trip?.start_date || !trip?.end_date) {
      setAddDayMode("simple");
      setShowAddDay((v) => !v);
      return;
    }
    const range = getTripDateRange(trip.start_date, trip.end_date);
    const covered = getCoveredDates(orderedDays, trip.start_date);
    const missing = range.filter((d) => !covered.has(d));
    if (missing.length === 0) {
      setAddDayMode("extend");
    } else {
      setAddDayMode("select-date");
      setAvailableDates(missing);
      setSelectedAvailableDate(missing[0]);
    }
    setShowAddDay((v) => !v);
  }

  async function onCreateDayExtend(direction: "before" | "after") {
    if (!trip?.start_date || !trip?.end_date) return;
    try {
      if (direction === "before") {
        await Promise.all(orderedDays.map((d) => updateDay(d.id, { day_number: d.day_number + 1 })));
        const [y, m, dd] = trip.start_date.split("-").map(Number);
        const newDate = new Date(Date.UTC(y, m - 1, dd));
        newDate.setUTCDate(newDate.getUTCDate() - 1);
        await createDay({
          trip_id: params.tripId,
          day_number: 1,
          date: newDate.toISOString().split("T")[0],
        });
      } else {
        const covered = getCoveredDates(orderedDays, trip.start_date);
        const sorted = Array.from(covered).sort();
        const lastDate = sorted[sorted.length - 1];
        const [y, m, dd] = lastDate.split("-").map(Number);
        const newDate = new Date(Date.UTC(y, m - 1, dd));
        newDate.setUTCDate(newDate.getUTCDate() + 1);
        const maxDayNum = Math.max(...orderedDays.map((d) => d.day_number));
        await createDay({
          trip_id: params.tripId,
          day_number: maxDayNum + 1,
          date: newDate.toISOString().split("T")[0],
        });
      }
      setShowAddDay(false);
      await loadTripData();
    } catch {
      setError("Não foi possível criar o dia.");
    }
  }

  async function onCreateDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (addDayMode === "select-date" && trip?.start_date && trip?.end_date) {
        const range = getTripDateRange(trip.start_date, trip.end_date);
        const pos = range.indexOf(selectedAvailableDate);
        await createDay({ trip_id: params.tripId, day_number: pos + 1, date: selectedAvailableDate });
      } else {
        await createDay({ trip_id: params.tripId, day_number: dayNumber, date: dayDate || undefined });
        setDayDate("");
        setDayNumber((v) => v + 1);
      }
      setShowAddDay(false);
      await loadTripData();
    } catch {
      setError("Não foi possível criar o dia.");
    }
  }

  async function onCreateActivity(dayId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = activityTitles[dayId];
    if (!title?.trim()) return;
    try {
      await createActivity({ day_id: dayId, title, status: "planned" });
      setActivityTitles((prev) => ({ ...prev, [dayId]: "" }));
      await loadTripData();
    } catch {
      setError("Não foi possível criar a atividade.");
    }
  }

  async function onUpdateDayNotes(day: Day, notes: string) {
    try {
      await updateDay(day.id, { notes });
      await loadTripData();
    } catch {
      setError("Não foi possível atualizar o dia.");
    }
  }

  async function onUpdateActivityStatus(activity: Activity, status: string) {
    try {
      await updateActivity(activity.id, { status });
      await loadTripData();
    } catch {
      setError("Não foi possível atualizar a atividade.");
    }
  }

  async function onDeleteActivity(activityId: string) {
    try {
      await deleteActivity(activityId);
      await loadTripData();
    } catch {
      setError("Não foi possível remover a atividade.");
    }
  }

  async function onDeleteDay(dayId: string) {
    try {
      await deleteDay(dayId);
      await loadTripData();
    } catch {
      setError("Não foi possível remover o dia.");
    }
  }

  async function onSaveActivityTitle(activityId: string) {
    const trimmed = editingTitle.trim();
    if (trimmed) {
      try {
        await updateActivity(activityId, { title: trimmed });
        await loadTripData();
      } catch {
        setError("Não foi possível atualizar a atividade.");
      }
    }
    setEditingActivityId(null);
    setEditingTitle("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#8b8b8b] text-sm">Carregando viagem...</p>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#8b8b8b] text-sm">Viagem não encontrada.</p>
      </div>
    );
  }

  const duration = getDaysBetween(trip.start_date, trip.end_date);

  return (
    <div className="min-h-screen">
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
          ✏️
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

      {/* Stats cards — overlap the hero bottom */}
      <div className="px-4 sm:px-8 lg:px-12 -mt-4 sm:-mt-6 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] shadow-md p-4 sm:p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-[#ff6b6b] rounded-2xl flex items-center justify-center text-white shrink-0">
              <ClockIcon />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-[#242424]">
                {duration ? `${duration} dias` : "—"}
              </p>
              <p className="text-sm text-[#8b8b8b]">Duração da viagem</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] shadow-md p-4 sm:p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-[#ff6b6b] rounded-2xl flex items-center justify-center text-white shrink-0">
              <PinIcon />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold text-[#242424] truncate">
                {trip.destinations.length > 0 ? trip.destinations.join(" · ") : "—"}
              </p>
              <p className="text-sm text-[#8b8b8b]">Destinos</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] shadow-md p-4 sm:p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-[#ff6b6b] rounded-2xl flex items-center justify-center text-white shrink-0">
              <CalendarIcon />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-[#242424]">
                {orderedDays.length} {orderedDays.length === 1 ? "dia" : "dias"}
              </p>
              <p className="text-sm text-[#8b8b8b]">Dias planejados</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-8 lg:px-12 py-6 sm:py-8 space-y-8">
        {/* Summary */}
        {trip.summary && (
          <div className="bg-[#f3ece8] rounded-xl p-6">
            <p className="text-[#242424] text-sm leading-relaxed">{trip.summary}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Days */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[#242424]">Roteiro dia a dia</h2>
              <p className="text-sm text-[#8b8b8b] mt-0.5">
                {orderedDays.length} {orderedDays.length === 1 ? "dia planejado" : "dias planejados"}
              </p>
            </div>
            <button
              onClick={handleAddDayClick}
              className="inline-flex items-center justify-center gap-2 bg-[#ff6b6b] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <PlusIcon />
              Adicionar dia
            </button>
          </div>

          {/* Add day form */}
          {showAddDay && (
            <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-6 mb-6">
              {/* Mode: simple — no trip dates set */}
              {addDayMode === "simple" && (
                <>
                  <h3 className="text-base font-semibold text-[#242424] mb-4">Novo dia</h3>
                  <form className="grid gap-3 sm:grid-cols-3" onSubmit={onCreateDay}>
                    <input
                      className={inputClass}
                      min={1}
                      placeholder="Número do dia"
                      type="number"
                      value={dayNumber}
                      onChange={(e) => setDayNumber(Number(e.target.value))}
                      required
                    />
                    <input
                      className={inputClass}
                      type="date"
                      value={dayDate}
                      onChange={(e) => setDayDate(e.target.value)}
                    />
                    <button
                      className="rounded-lg bg-[#ff6b6b] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                      type="submit"
                    >
                      Criar dia
                    </button>
                  </form>
                </>
              )}

              {/* Mode: select-date — there are gaps in the trip range */}
              {addDayMode === "select-date" && (
                <>
                  <h3 className="text-base font-semibold text-[#242424] mb-1">Adicionar dia ao roteiro</h3>
                  <p className="text-sm text-[#8b8b8b] mb-4">
                    Selecione uma das datas disponíveis dentro do período da viagem.
                  </p>
                  <form className="flex flex-col sm:flex-row gap-3" onSubmit={onCreateDay}>
                    <select
                      className={cn(inputClass, "flex-1")}
                      value={selectedAvailableDate}
                      onChange={(e) => setSelectedAvailableDate(e.target.value)}
                    >
                      {availableDates.map((date) => (
                        <option key={date} value={date}>
                          {formatDate(date)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-lg bg-[#ff6b6b] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity shrink-0"
                      type="submit"
                    >
                      Adicionar dia
                    </button>
                  </form>
                </>
              )}

              {/* Mode: extend — all days in the range are planned */}
              {addDayMode === "extend" && (
                <>
                  <h3 className="text-base font-semibold text-[#242424] mb-1">Todos os dias já planejados</h3>
                  <p className="text-sm text-[#8b8b8b] mb-4">
                    Deseja estender a viagem?
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      className="flex-1 rounded-lg border-2 border-[#ff6b6b] px-4 py-3 text-sm font-medium text-[#ff6b6b] hover:bg-[#fff0f0] transition-colors text-left"
                      type="button"
                      onClick={() => onCreateDayExtend("before")}
                    >
                      <span className="block font-semibold">← Antes do início</span>
                      <span className="text-xs text-[#8b8b8b]">
                        Adiciona um dia antes de{" "}
                        {trip?.start_date ? formatDate(trip.start_date) : "—"}
                      </span>
                    </button>
                    <button
                      className="flex-1 rounded-lg border-2 border-[#ff6b6b] px-4 py-3 text-sm font-medium text-[#ff6b6b] hover:bg-[#fff0f0] transition-colors text-left"
                      type="button"
                      onClick={() => onCreateDayExtend("after")}
                    >
                      <span className="block font-semibold">Após o final →</span>
                      <span className="text-xs text-[#8b8b8b]">
                        Adiciona um dia depois de{" "}
                        {trip?.end_date ? formatDate(trip.end_date) : "—"}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Days list */}
          {orderedDays.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgba(0,0,0,0.15)] p-8 sm:p-12 text-center">
              <p className="text-[#8b8b8b] text-sm mb-3">Nenhum dia planejado ainda.</p>
              <button
                onClick={() => setShowAddDay(true)}
                className="text-[#ff6b6b] text-sm font-medium hover:underline"
              >
                Adicionar o primeiro dia
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {orderedDays.map((day) => (
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
                            : Array.from(new Set((activitiesByDay[day.id] || []).map(a => a.location).filter((l): l is string => !!l))).slice(0, 3).join(" · ");
                        
                          return label ? (
                            <span className="text-xs font-medium text-[#8b8b8b] flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-[rgba(0,0,0,0.15)] mx-1"></span>
                              {label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <h3 className="font-semibold text-[#242424] text-lg">
                        {getDayLabel(day.day_number, trip?.start_date, day.date)}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        className="rounded-lg border border-red-200 p-1.5 text-red-400 hover:text-red-600 hover:border-red-400 transition-colors bg-white"
                        onClick={() => onDeleteDay(day.id)}
                        type="button"
                        aria-label="Remover dia"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  {/* Day body */}
                  <div className="p-4 sm:p-6 space-y-5">
                    {/* Notes */}
                    <div>
                      <span className="block text-xs font-semibold text-[#8b8b8b] mb-1.5 uppercase tracking-wide">
                        Notas do dia
                      </span>
                      <textarea
                        className={cn(inputClass, "w-full resize-none")}
                        defaultValue={day.notes ?? ""}
                        onBlur={(e) => onUpdateDayNotes(day, e.target.value)}
                        placeholder="Notas sobre este dia..."
                        rows={2}
                      />
                    </div>

                    {/* Activities */}
                    <div>
                      <span className="block text-xs font-semibold text-[#8b8b8b] mb-3 uppercase tracking-wide">
                        Atividades
                      </span>
                      <form
                        className="flex flex-col sm:flex-row gap-2 mb-3"
                        onSubmit={(e) => onCreateActivity(day.id, e)}
                      >
                        <input
                          className={cn(inputClass, "flex-1")}
                          placeholder="Nova atividade..."
                          value={activityTitles[day.id] ?? ""}
                          onChange={(e) =>
                            setActivityTitles((prev) => ({ ...prev, [day.id]: e.target.value }))
                          }
                        />
                        <button
                          className="rounded-lg bg-[#ff6b6b] px-4 py-2 text-sm text-white hover:opacity-90 transition-opacity shrink-0"
                          type="submit"
                        >
                          Adicionar
                        </button>
                      </form>

                      <ul className="space-y-2">
                        {(activitiesByDay[day.id] ?? []).length === 0 ? (
                          <li className="text-sm text-[#8b8b8b]">Nenhuma atividade ainda.</li>
                        ) : (
                          (activitiesByDay[day.id] ?? []).map((activity) => (
                            <li
                              key={activity.id}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg bg-[#fff9f6] border border-[rgba(0,0,0,0.06)] px-4 py-2.5"
                            >
                              {editingActivityId === activity.id ? (
                                <input
                                  autoFocus
                                  className={cn(inputClass, "flex-1 py-1")}
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  onBlur={() => onSaveActivityTitle(activity.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      onSaveActivityTitle(activity.id);
                                    } else if (e.key === "Escape") {
                                      setEditingActivityId(null);
                                      setEditingTitle("");
                                    }
                                  }}
                                />
                              ) : (
                                <span
                                  className={cn(
                                    "text-sm font-medium cursor-pointer hover:text-[#ff6b6b] transition-colors",
                                    activity.status === "done"
                                      ? "line-through text-[#8b8b8b]"
                                      : "text-[#242424]",
                                    activity.status === "skipped" ? "opacity-50" : "",
                                  )}
                                  onClick={() => {
                                    setEditingActivityId(activity.id);
                                    setEditingTitle(activity.title);
                                  }}
                                  title="Clique para editar"
                                >
                                  {activity.title}
                                </span>
                              )}
                              <div className="flex items-center gap-2">
                                <button
                                  className="rounded-lg border border-red-200 p-1.5 text-red-400 hover:text-red-600 hover:border-red-400 transition-colors"
                                  onClick={() => onDeleteActivity(activity.id)}
                                  type="button"
                                  aria-label="Remover atividade"
                                >
                                  <TrashIcon />
                                </button>
                              </div>
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
      {showCoverModal && (
        <CoverImageModal
          tripId={params.tripId}
          onClose={() => setShowCoverModal(false)}
          onCoverUpdated={(url: string) => {
            setTrip((prev) => prev ? { ...prev, cover_image_url: url } : prev);
            setShowCoverModal(false);
          }}
        />
      )}
    </div>
  );
}
