"use client";

import { Trip } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { TrashIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function TripCard({ trip, onDelete }: { trip: Trip; onDelete?: (id: string | number) => void }) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <Link
        href={`/trips/${trip.id}`}
        className="block bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-5 shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#242424] truncate">{trip.name}</h2>
            <p className="text-sm text-[#8b8b8b] mt-0.5">{trip.destinations.join(" · ")}</p>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowConfirm(true);
            }}
            className="p-1.5 hover:bg-red-50 rounded-full transition-colors shrink-0"
            aria-label="Excluir viagem"
          >
            <TrashIcon className="text-[#ff6b6b]" size={18} />
          </button>
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
            {[trip.start_date ? formatDate(trip.start_date) : null, trip.end_date ? formatDate(trip.end_date) : null].filter(Boolean).join(" → ")}
          </p>
        )}
      </Link>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-red-50 shrink-0">
                <TrashIcon className="text-[#ff6b6b]" size={20} />
              </span>
              <h2 className="text-base font-semibold text-[#242424]">Excluir viagem?</h2>
            </div>
            <p className="text-sm text-[#8b8b8b] mb-1">
              Isso removerá permanentemente <span className="font-medium text-[#242424]">{trip.name}</span> e todas as:
            </p>
            <ul className="text-sm text-[#8b8b8b] list-disc list-inside mb-5 space-y-0.5">
              <li>Histórias e registros da viagem</li>
              <li>Memórias e fotos</li>
              <li>Lembranças e anotações</li>
            </ul>
            <p className="text-xs text-red-500 mb-5 font-medium">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-[rgba(0,0,0,0.12)] px-4 py-2 text-sm text-[#8b8b8b] hover:text-[#242424] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  if (onDelete) onDelete(trip.id);
                }}
                className="flex-1 rounded-lg bg-[#ff6b6b] px-4 py-2 text-sm font-medium text-white hover:bg-[#e05555] transition-colors"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
