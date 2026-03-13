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

  if (loading) {
    return <main className="mx-auto max-w-4xl p-6 text-sm">Carregando viagens...</main>;
  }

  if (error) {
    return <main className="mx-auto max-w-4xl p-6 text-sm text-red-600">{error}</main>;
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Viagens</h1>
        <div className="flex items-center gap-2">
          <Link href="/trips/new">
            <Button>Nova viagem</Button>
          </Link>
          <button
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            onClick={onLogout}
            type="button"
          >
            Sair
          </button>
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-neutral-600">
          Nenhuma viagem cadastrada ainda.
        </div>
      ) : (
        <div className="grid gap-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}

      <div className="mt-8 text-sm text-neutral-500">
        Endpoint base: <Link href="http://localhost:8000/docs">API Docs</Link>
      </div>
    </main>
  );
}
