"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  Activity,
  Day,
  Trip,
  createActivity,
  createDay,
  fetchActivitiesByDay,
  fetchDaysByTrip,
  fetchTrip,
  updateActivity,
  updateDay,
} from "@/lib/api";

type PageProps = {
  params: {
    tripId: string;
  };
};

export default function TripDetailsPage({ params }: PageProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [activitiesByDay, setActivitiesByDay] = useState<Record<string, Activity[]>>({});
  const [dayNumber, setDayNumber] = useState(1);
  const [dayDate, setDayDate] = useState("");
  const [activityTitles, setActivityTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orderedDays = useMemo(
    () => [...days].sort((left, right) => left.day_number - right.day_number),
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

  async function onCreateDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createDay({
        trip_id: params.tripId,
        day_number: dayNumber,
        date: dayDate || undefined,
      });
      setDayDate("");
      setDayNumber((value) => value + 1);
      await loadTripData();
    } catch {
      setError("Não foi possível criar o dia.");
    }
  }

  async function onCreateActivity(dayId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = activityTitles[dayId];
    if (!title?.trim()) {
      return;
    }

    try {
      await createActivity({
        day_id: dayId,
        title,
        status: "planned",
      });
      setActivityTitles((previous) => ({ ...previous, [dayId]: "" }));
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

  if (loading) {
    return <main className="mx-auto max-w-5xl p-6 text-sm">Carregando viagem...</main>;
  }

  if (!trip) {
    return <main className="mx-auto max-w-5xl p-6 text-sm">Viagem não encontrada.</main>;
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{trip.name}</h1>
        <p className="text-sm text-neutral-600">{trip.destination}</p>
        <p className="text-sm text-neutral-500">
          {trip.start_date} → {trip.end_date}
        </p>
        <div className="mt-3 flex gap-3 text-sm">
          <Link className="text-blue-700 underline" href={`/trips/${trip.id}/timeline`}>
            Ver timeline
          </Link>
          <Link className="text-blue-700 underline" href={`/trips/${trip.id}/memories`}>
            Ver memórias
          </Link>
        </div>
      </header>

      <section className="mb-8 rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 text-lg font-semibold">Adicionar dia</h2>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={onCreateDay}>
          <input
            className="rounded-md border border-neutral-300 px-3 py-2"
            min={1}
            placeholder="Número do dia"
            type="number"
            value={dayNumber}
            onChange={(event) => setDayNumber(Number(event.target.value))}
            required
          />
          <input
            className="rounded-md border border-neutral-300 px-3 py-2"
            type="date"
            value={dayDate}
            onChange={(event) => setDayDate(event.target.value)}
          />
          <button className="rounded-md bg-black px-3 py-2 text-sm text-white" type="submit">
            Criar dia
          </button>
        </form>
      </section>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <section className="space-y-4">
        {orderedDays.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-neutral-600">
            Nenhum dia planejado para esta viagem.
          </div>
        ) : (
          orderedDays.map((day) => (
            <article key={day.id} className="rounded-lg border border-neutral-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Dia {day.day_number}</h2>
                <span className="text-xs text-neutral-500">{day.date ?? "Sem data"}</span>
              </div>

              <label className="mb-3 block text-sm">
                <span className="mb-1 block text-xs text-neutral-600">Notas do dia</span>
                <textarea
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                  defaultValue={day.notes ?? ""}
                  onBlur={(event) => onUpdateDayNotes(day, event.target.value)}
                  rows={2}
                />
              </label>

              <form className="mb-3 flex gap-2" onSubmit={(event) => onCreateActivity(day.id, event)}>
                <input
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="Nova atividade"
                  value={activityTitles[day.id] ?? ""}
                  onChange={(event) =>
                    setActivityTitles((previous) => ({
                      ...previous,
                      [day.id]: event.target.value,
                    }))
                  }
                />
                <button className="rounded-md bg-black px-3 py-2 text-sm text-white" type="submit">
                  Adicionar
                </button>
              </form>

              <ul className="space-y-2 text-sm">
                {(activitiesByDay[day.id] ?? []).length === 0 ? (
                  <li className="text-neutral-500">Sem atividades.</li>
                ) : (
                  (activitiesByDay[day.id] ?? []).map((activity) => (
                    <li key={activity.id} className="flex items-center justify-between rounded bg-neutral-50 p-2">
                      <span className="font-medium">{activity.title}</span>
                      <select
                        className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
                        value={activity.status}
                        onChange={(event) => onUpdateActivityStatus(activity, event.target.value)}
                      >
                        <option value="planned">planned</option>
                        <option value="done">done</option>
                        <option value="skipped">skipped</option>
                      </select>
                    </li>
                  ))
                )}
              </ul>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
