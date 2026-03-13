import Link from "next/link";

import { Trip } from "@/lib/api";

export function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#242424] truncate">{trip.name}</h2>
          <p className="text-sm text-[#8b8b8b] mt-0.5">{trip.destination}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#f3ece8] px-3 py-1 text-xs font-medium text-[#ff6b6b] capitalize">
          {trip.status}
        </span>
      </div>
      {(trip.start_date || trip.end_date) && (
        <p className="mt-3 text-sm text-[#8b8b8b] flex items-center gap-1.5">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {[trip.start_date, trip.end_date].filter(Boolean).join(" → ")}
        </p>
      )}
    </Link>
  );
}
