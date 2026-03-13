"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createTrip } from "@/lib/api";

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

const inputClass =
  "w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2.5 text-sm text-[#242424] placeholder-[#8b8b8b] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors";

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
    <div className="min-h-screen bg-[#fff9f6]">
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
          <h1 className="text-xl sm:text-2xl font-bold text-[#242424]">Nova viagem</h1>
          <p className="text-sm text-[#8b8b8b] mt-1">Planeje mais uma aventura juntos</p>
        </div>

        <section className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] shadow-sm p-5 sm:p-6">
          <form className="space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-medium text-[#242424] mb-1.5">
                Nome da viagem
              </label>
              <input
                className={inputClass}
                placeholder="Ex: Aventura Ibérica a Dois"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#242424] mb-1.5">Destino</label>
              <input
                className={inputClass}
                placeholder="Ex: Portugal e Espanha"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[#242424] mb-1.5">
                  Data de início
                </label>
                <input
                  className={inputClass}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#242424] mb-1.5">
                  Data de fim
                </label>
                <input
                  className={inputClass}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#242424] mb-1.5">
                Resumo{" "}
                <span className="text-[#8b8b8b] font-normal">(opcional)</span>
              </label>
              <textarea
                className={inputClass}
                placeholder="Uma breve descrição da viagem..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              className="w-full rounded-lg bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "Criando viagem..." : "Criar viagem"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
