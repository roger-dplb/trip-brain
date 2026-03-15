import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    // If it's YYYY-MM-DD
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  // Fallback if the format is different
  return new Date(dateStr).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function getDayLabel(dayNumber: number, tripStartDate?: string | null, dayDate?: string | null) {
  if (dayDate) return formatDate(dayDate);
  if (tripStartDate) {
    const parts = tripStartDate.split("-");
    if (parts.length === 3) {
      const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      date.setUTCDate(date.getUTCDate() + (dayNumber - 1));
      return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    }
  }
  return `Dia ${dayNumber}`;
}

export type TripTimeStatus =
  | { type: "upcoming"; daysUntil: number }
  | { type: "ongoing" }
  | { type: "past" }
  | null;

function parseUtcMidnight(dateStr: string): Date {
  const parts = dateStr.split("-");
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
}

export function getTripTimeStatus(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): TripTimeStatus {
  if (!startDate) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = parseUtcMidnight(todayStr);
  const start = parseUtcMidnight(startDate);
  const end = endDate ? parseUtcMidnight(endDate) : null;

  if (start > today) {
    const daysUntil = (start.getTime() - today.getTime()) / 86_400_000;
    return { type: "upcoming", daysUntil };
  }

  if (end && today <= end) {
    return { type: "ongoing" };
  }

  return { type: "past" };
}
