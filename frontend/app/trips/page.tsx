"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { TripCard } from "@/components/trip-card";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  Trip,
  clearStoredAccessToken,
  fetchTrips,
  getStoredAccessToken,
} from "@/lib/api";

function HeartSolid() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
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

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredAccessToken()) {
      router.replace("/login");
      return;
    }

    async function loadTrips() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchTrips();
        setTrips(response);
      } catch (rawError) {
        if (rawError instanceof ApiError && rawError.status === 401) {
          clearStoredAccessToken();
          router.replace("/login");
          return;
        }
        setError("Não foi possível carregar as viagens.");
      } finally {
        setLoading(false);
      }
    }

    loadTrips();
  }, [router]);

  function onLogout() {
    clearStoredAccessToken();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[#fff9f6]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-[rgba(0,0,0,0.08)]">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-[#ff6b6b]">
              <HeartSolid />
            </span>
            <span className="text-xl font-bold text-[#ff6b6b]">Roger e Ana</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/trips/new">
              <Button>
                <PlusIcon />
                Nova viagem
              </Button>
            </Link>
            <button
              className="rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-sm text-[#8b8b8b] hover:text-[#242424] transition-colors"
              onClick={onLogout}
              type="button"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#242424]">Nossas Viagens</h1>
          <p className="text-sm text-[#8b8b8b] mt-1">Todas as aventuras do casal</p>
        </div>

        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-5 h-24 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-sm text-red-600">
            {error}
          </div>
        ) : trips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgba(0,0,0,0.15)] p-12 text-center">
            <p className="text-[#8b8b8b] text-sm mb-4">Nenhuma viagem cadastrada ainda.</p>
            <Link href="/trips/new">
              <Button>Criar primeira viagem</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
