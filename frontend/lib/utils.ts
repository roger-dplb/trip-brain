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
