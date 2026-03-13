"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { Trip } from "@/lib/api";

function HeartSolid() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function MapPin() {
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
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function BarChart() {
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
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function Camera() {
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
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function Sparkle() {
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
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z" />
    </svg>
  );
}

function ArrowLeft() {
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
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

type Props = {
  trip: Trip | null;
  tripId: string;
};

export function TripSidebar({ trip, tripId }: Props) {
  const pathname = usePathname();

  const navItems = [
    { href: `/trips/${tripId}`, label: "Visão Geral", icon: <MapPin /> },
    { href: `/trips/${tripId}/itinerary`, label: "Roteiro IA", icon: <Sparkle /> },
    { href: `/trips/${tripId}/timeline`, label: "Timeline", icon: <BarChart /> },
    { href: `/trips/${tripId}/memories`, label: "Memórias", icon: <Camera /> },
  ];

  return (
    <aside className="w-[280px] shrink-0 h-full overflow-y-auto bg-white border-r border-[rgba(0,0,0,0.08)] flex flex-col px-6 py-6 gap-8">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <span className="text-[#ff6b6b]">
          <HeartSolid />
        </span>
        <span className="text-[20px] font-bold text-[#ff6b6b]">Roger e Ana</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {navItems.map(({ href, label, icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-medium transition-colors",
                isActive
                  ? "bg-[#ff6b6b] text-white"
                  : "text-[#8b8b8b] hover:bg-[#f3ece8] hover:text-[#242424]",
              )}
            >
              {icon}
              <span>{label}</span>
            </Link>
          );
        })}
        <div className="border-t border-[rgba(0,0,0,0.06)] my-2" />
        <Link
          href="/trips"
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-medium text-[#8b8b8b] hover:bg-[#f3ece8] hover:text-[#242424] transition-colors"
        >
          <ArrowLeft />
          <span>Todas as viagens</span>
        </Link>
      </nav>

      <div className="flex-1" />

      {/* Trip info card */}
      {trip && (
        <div className="bg-[#f3ece8] rounded-xl p-4">
          <p className="font-semibold text-[#242424] text-sm">{trip.name}</p>
          {trip.destination && (
            <p className="text-xs text-[#8b8b8b] mt-1">{trip.destination}</p>
          )}
          {trip.start_date && trip.end_date && (
            <p className="text-xs text-[#8b8b8b] mt-0.5">
              {trip.start_date} → {trip.end_date}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
