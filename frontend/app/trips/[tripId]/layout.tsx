"use client";

import { useEffect, useState } from "react";

import { TripSidebar } from "@/components/trip-sidebar";
import { Trip, fetchTrip, getStoredAccessToken } from "@/lib/api";

type LayoutProps = {
  children: React.ReactNode;
  params: { tripId: string };
};

export default function TripLayout({ children, params }: LayoutProps) {
  const [trip, setTrip] = useState<Trip | null>(null);

  useEffect(() => {
    if (!getStoredAccessToken()) return;
    fetchTrip(params.tripId)
      .then(setTrip)
      .catch(() => {});
  }, [params.tripId]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#fff9f6]">
      <TripSidebar trip={trip} tripId={params.tripId} />
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
