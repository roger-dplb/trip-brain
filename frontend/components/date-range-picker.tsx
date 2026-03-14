"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

function toDate(str: string): Date | undefined {
  if (!str) return undefined;
  const d = new Date(str + "T00:00:00");
  return isNaN(d.getTime()) ? undefined : d;
}

function toStr(date: Date | undefined): string {
  if (!date) return "";
  return format(date, "yyyy-MM-dd");
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const range: DateRange = {
    from: toDate(startDate),
    to: toDate(endDate),
  };

  function handleSelect(selected: DateRange | undefined) {
    onStartDateChange(toStr(selected?.from));
    onEndDateChange(toStr(selected?.to));
    if (selected?.from && selected?.to) setOpen(false);
  }

  const label =
    range.from && range.to
      ? `${format(range.from, "dd 'de' MMM", { locale: ptBR })} → ${format(range.to, "dd 'de' MMM", { locale: ptBR })}`
      : range.from
        ? format(range.from, "dd 'de' MMM", { locale: ptBR })
        : "Selecionar datas";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2.5 text-sm transition-colors focus:outline-none focus:border-[#ff6b6b] focus:ring-1 focus:ring-[#ff6b6b]",
            range.from ? "text-[#242424]" : "text-[#8b8b8b]",
          )}
        >
          <CalendarIcon size={15} className="shrink-0 text-[#8b8b8b]" />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          onSelect={handleSelect}
          locale={ptBR}
          numberOfMonths={2}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
