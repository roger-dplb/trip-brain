"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Trip, fetchTrip, generateItinerary } from "@/lib/api";

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

export default function ItineraryPage({ params }: PageProps) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [preferences, setPreferences] = useState("");
  const [maxDays, setMaxDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enqueued, setEnqueued] = useState(false);

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
    try {
      await generateItinerary({
        trip_id: params.tripId,
        preferences: preferences.trim() || undefined,
        max_days: maxDays,
      });
      setEnqueued(true);
      setTimeout(() => router.push("/trips"), 2500);
    } catch {
      setError("Não foi possível agendar a geração do roteiro. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="bg-[#f3ece8] border-b border-[rgba(0,0,0,0.08)] px-4 sm:px-8 lg:px-12 py-6 sm:py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#242424]">Roteiro com IA</h1>
        <p className="text-sm text-[#8b8b8b] mt-1">Gere um roteiro personalizado automaticamente</p>
      </div>

      <div className="px-4 sm:px-8 lg:px-12 py-6 sm:py-8 space-y-8 max-w-3xl">
        {enqueued ? (
          <section className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-6 flex flex-col items-center gap-4 text-center">
            <svg className="animate-spin text-[#ff6b6b]" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <p className="text-base font-semibold text-[#242424]">Gerando o melhor roteiro da sua vida...</p>
            <p className="text-sm text-[#8b8b8b]">Você será redirecionado em instantes.</p>
          </section>
        ) : (
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
                {loading ? (
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <SparkleIcon />
                )}
                {loading ? "Agendando..." : "Gerar roteiro"}
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
