"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import {
  Activity,
  completeUpload,
  createUploadPresign,
  fetchActivitiesByDay,
  fetchDaysByTrip,
  fetchMemoriesByTrip,
} from "@/lib/api";

type PageProps = {
  params: {
    tripId: string;
  };
};

export default function TripMemoriesPage({ params }: PageProps) {
  const [memories, setMemories] = useState<
    Array<{
      id: string;
      memory_type: string;
      caption?: string | null;
      storage_key: string;
      created_at: string;
      day_id?: string | null;
      activity_id?: string | null;
    }>
  >([]);
  const [days, setDays] = useState<Array<{ id: string; day_number: number }>>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedDayId, setSelectedDayId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [caption, setCaption] = useState("");
  const [memoryType, setMemoryType] = useState("photo");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    const [tripMemories, tripDays] = await Promise.all([
      fetchMemoriesByTrip(params.tripId),
      fetchDaysByTrip(params.tripId),
    ]);
    setMemories(tripMemories);
    setDays(tripDays.map((day) => ({ id: day.id, day_number: day.day_number })));
  }

  useEffect(() => {
    loadData().catch(() => setError("Falha ao carregar memórias."));
  }, [params.tripId]);

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
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("upload_failed");
      }

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

  return (
    <main className="mx-auto max-w-5xl p-4 pb-24 sm:p-6 sm:pb-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Memórias da viagem</h1>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:flex sm:gap-3">
          <Link
            className="rounded-md border border-neutral-300 px-3 py-2 text-center text-blue-700 underline"
            href="#upload-memory"
          >
            Upload rápido
          </Link>
          <Link
            className="rounded-md border border-neutral-300 px-3 py-2 text-center text-blue-700 underline"
            href={`/trips/${params.tripId}`}
          >
            Voltar para viagem
          </Link>
        </div>
      </header>

      <section className="mb-8 rounded-lg border border-neutral-200 p-4" id="upload-memory">
        <h2 className="mb-3 text-lg font-semibold">Upload de memória</h2>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={memoryType}
              onChange={(event) => setMemoryType(event.target.value)}
            >
              <option value="photo">photo</option>
              <option value="video">video</option>
              <option value="note">note</option>
            </select>

            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={selectedDayId}
              onChange={(event) => setSelectedDayId(event.target.value)}
            >
              <option value="">Sem dia específico</option>
              {days.map((day) => (
                <option key={day.id} value={day.id}>
                  Dia {day.day_number}
                </option>
              ))}
            </select>

            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={selectedActivityId}
              onChange={(event) => setSelectedActivityId(event.target.value)}
              disabled={!selectedDayId}
            >
              <option value="">Sem atividade específica</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.title}
                </option>
              ))}
            </select>
          </div>

          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            placeholder="Legenda"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />

          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
          />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "Enviando..." : "Enviar memória"}
          </button>
        </form>
      </section>

      <section className="space-y-2">
        {memories.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-neutral-600">
            Nenhuma memória registrada ainda.
          </div>
        ) : (
          memories.map((memory) => (
            <article key={memory.id} className="rounded border border-neutral-200 p-3 text-sm">
              <p className="font-medium">{memory.memory_type}</p>
              <p className="text-neutral-600">{memory.caption ?? "Sem legenda"}</p>
              <p className="break-all text-xs text-neutral-500">{memory.storage_key}</p>
            </article>
          ))
        )}
      </section>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white p-3 sm:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-2 text-sm">
          <Link
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-center text-blue-700 underline"
            href="#upload-memory"
          >
            Upload
          </Link>
          <Link
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-center text-blue-700 underline"
            href={`/trips/${params.tripId}`}
          >
            Voltar
          </Link>
        </div>
      </nav>
    </main>
  );
}
