import Link from "next/link";

import { TripCard } from "@/components/trip-card";
import { Button } from "@/components/ui/button";
import { fetchTrips } from "@/lib/api";

export default async function TripsPage() {
  const trips = await fetchTrips();

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Viagens</h1>
        <Button>Novo viagem</Button>
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
