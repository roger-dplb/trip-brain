"use client";

import { useEffect, useState } from "react";

import { TripSidebar } from "@/components/trip-sidebar";
import { Trip, fetchTrip, getStoredAccessToken } from "@/lib/api";

type LayoutProps = {
  children: React.ReactNode;
  params: { tripId: string };
};

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export default function TripLayout({ children, params }: LayoutProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!getStoredAccessToken()) return;
    fetchTrip(params.tripId)
      .then(setTrip)
      .catch(() => {});
  }, [params.tripId]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#fff9f6]">
      <TripSidebar
        trip={trip}
        tripId={params.tripId}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden sticky top-0 z-20 bg-white border-b border-[rgba(0,0,0,0.08)] px-4 py-3 flex items-center justify-between gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-2 text-sm text-[#242424]"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <MenuIcon />
            Menu
          </button>
          <p className="text-sm font-medium text-[#242424] truncate">{trip?.name ?? "Viagem"}</p>
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
