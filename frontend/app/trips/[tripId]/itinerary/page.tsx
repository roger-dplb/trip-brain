"use client";

import { FormEvent, useEffect, useState } from "react";

import { ItineraryResponse, Trip, fetchTrip, generateItinerary } from "@/lib/api";

function tripDurationDays(trip: Trip): number {
  if (!trip.start_date || !trip.end_date) return 7;
  const start = new Date(trip.start_date);
  const end = new Date(trip.end_date);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, Math.min(diff, 21));
}

type PageProps = {
  params: { tripId: string };
};

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z" />
      <path d="M5 18l.75 2.25L8 21l-2.25.75L5 24l-.75-2.25L2 21l2.25-.75z" />
    </svg>
  );
}

const textareaClass =
  "w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2.5 text-sm text-[#242424] placeholder-[#8b8b8b] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors resize-none";

function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="text-lg font-bold text-[#242424] mt-6 first:mt-0">
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <h3 key={i} className="text-base font-semibold text-[#242424] mt-4">
              {line.slice(4)}
            </h3>
          );
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <p key={i} className="text-sm font-semibold text-[#242424]">
              {line.slice(2, -2)}
            </p>
          );
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2 text-sm text-[#242424]">
              <span className="text-[#ff6b6b] shrink-0 mt-0.5">•</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (line.trim() === "") {
          return <div key={i} className="h-1" />;
        }
        return (
          <p key={i} className="text-sm text-[#242424] leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

export default function ItineraryPage({ params }: PageProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [preferences, setPreferences] = useState("");
  const [maxDays, setMaxDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ItineraryResponse | null>(null);

  useEffect(() => {
    fetchTrip(params.tripId).then((t) => {
      setTrip(t);
      setMaxDays(tripDurationDays(t));
    }).catch(() => {});
  }, [params.tripId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setStep("A enviar dados da viagem para a IA...");
    try {
      const timer = setTimeout(() => setStep("A aguardar resposta da IA (pode demorar 10–30s)..."), 4000);
      const response = await generateItinerary({
        trip_id: params.tripId,
        preferences: preferences.trim() || undefined,
        max_days: maxDays,
      });
      clearTimeout(timer);
      setStep("A guardar dias e atividades...");
      setResult(response);
    } catch {
      setError("Não foi possível gerar o roteiro. Verifique se a chave de API está configurada.");
    } finally {
      setLoading(false);
      setStep("");
    }
  }

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="bg-[#f3ece8] border-b border-[rgba(0,0,0,0.08)] px-12 py-8">
        <h1 className="text-3xl font-bold text-[#242424]">Roteiro com IA</h1>
        <p className="text-sm text-[#8b8b8b] mt-1">Gere um roteiro personalizado automaticamente</p>
      </div>

      <div className="px-12 py-8 space-y-8 max-w-3xl">
        {/* Form */}
        <section className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-6">
          <form className="space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-medium text-[#242424] mb-1.5">
                Preferências <span className="text-[#8b8b8b] font-normal">(opcional)</span>
              </label>
              <textarea
                className={textareaClass}
                rows={4}
                placeholder="Ex: gostamos de museus, comida local, evitar turismo de massa, prefiro manhãs tranquilas..."
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#242424] mb-1.5">
                Número de dias
                {trip?.start_date && trip?.end_date && (
                  <span className="text-[#8b8b8b] font-normal ml-1">
                    ({trip.start_date} → {trip.end_date})
                  </span>
                )}
              </label>
              <input
                type="number"
                min={1}
                max={21}
                className="w-28 rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2.5 text-sm text-[#242424] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors"
                value={maxDays}
                onChange={(e) => setMaxDays(Number(e.target.value))}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#ff6b6b] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <SparkleIcon />
              {loading ? "Gerando roteiro..." : "Gerar roteiro"}
            </button>
          </form>
        </section>

        {/* Loading */}
        {loading && (
          <section className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-6">
            <div className="flex items-center gap-3 mb-4">
              <svg className="animate-spin text-[#ff6b6b] shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <p className="text-sm text-[#242424] font-medium">{step || "A processar..."}</p>
            </div>
            <div className="space-y-3 animate-pulse">
              {[80, 60, 90, 50, 70].map((w, i) => (
                <div key={i} className="h-3 bg-[#f3ece8] rounded" style={{ width: `${w}%` }} />
              ))}
            </div>
          </section>
        )}

        {result && !loading && (
          <>
            {/* Success banner */}
            {result.days_created > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                <p className="text-sm text-green-700 font-medium">
                  ✓ {result.days_created} {result.days_created === 1 ? "dia criado" : "dias criados"} com {result.activities_created} {result.activities_created === 1 ? "atividade" : "atividades"} na Visão Geral.
                </p>
                <a
                  href={`/trips/${params.tripId}`}
                  className="shrink-0 text-sm font-semibold text-green-700 underline hover:no-underline"
                >
                  Ver roteiro →
                </a>
              </div>
            )}

            <section className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-[#242424]">Roteiro gerado</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#8b8b8b] bg-[#f3ece8] px-2.5 py-1 rounded-full">
                    {result.model}
                  </span>
                  {result.used_summary && (
                    <span className="text-xs text-[#ff6b6b] bg-[#f3ece8] px-2.5 py-1 rounded-full">
                      Com contexto da viagem
                    </span>
                  )}
                </div>
              </div>
              <div className="border-t border-[rgba(0,0,0,0.06)] pt-5">
                <MarkdownBlock text={result.itinerary_markdown} />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
