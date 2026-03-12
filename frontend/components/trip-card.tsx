import Link from "next/link";

import { Trip } from "@/lib/api";

export function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block rounded-lg border border-neutral-200 p-4 hover:border-neutral-400"
    >
      <h2 className="text-lg font-semibold">{trip.name}</h2>
      <p className="text-sm text-neutral-600">{trip.destination}</p>
      <p className="mt-2 text-sm text-neutral-500">
        {trip.start_date} → {trip.end_date}
      </p>
    </Link>
  );
}
