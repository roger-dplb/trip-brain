"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createTrip } from "@/lib/api";

export default function NewTripPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const trip = await createTrip({
        name,
        destination,
        start_date: startDate,
        end_date: endDate,
        summary,
        status: "planned",
      });
      router.push(`/trips/${trip.id}`);
    } catch {
      setError("Não foi possível criar a viagem.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Nova viagem</h1>

      <form className="space-y-4" onSubmit={onSubmit}>
        <input
          className="w-full rounded-md border border-neutral-300 px-3 py-2"
          placeholder="Nome da viagem"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <input
          className="w-full rounded-md border border-neutral-300 px-3 py-2"
          placeholder="Destino"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          required
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
          />
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            required
          />
        </div>

        <textarea
          className="w-full rounded-md border border-neutral-300 px-3 py-2"
          placeholder="Resumo (opcional)"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={4}
        />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "Criando..." : "Criar viagem"}
        </button>
      </form>
    </main>
  );
}
