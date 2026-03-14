"use client";

import { useState, useEffect, useRef } from "react";
import {
  triggerStoriesExport,
  fetchStoriesExportJob,
  type StoryExportJob,
} from "@/lib/api";

type Props = {
  tripId: string;
};

const POLL_INTERVAL_MS = 5000;

export function ExportPanel({ tripId }: Props) {
  const [job, setJob] = useState<StoryExportJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "processing")) {
      stopPolling();
      return;
    }
    if (pollRef.current) return;

    pollRef.current = setInterval(async () => {
      try {
        const updated = await fetchStoriesExportJob(tripId, job.job_id);
        setJob(updated);
        if (updated.status === "done" || updated.status === "failed") {
          stopPolling();
        }
      } catch {
        // silently ignore transient errors during polling
      }
    }, POLL_INTERVAL_MS);

    return stopPolling;
  }, [job, tripId]);

  const handleTrigger = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await triggerStoriesExport(tripId);
      setJob(result);
    } catch (e: any) {
      if (e?.status === 422) {
        setError("Adicione fotos à viagem antes de exportar Stories.");
      } else {
        setError("Erro ao iniciar o export. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!job) {
    return (
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          onClick={handleTrigger}
          disabled={loading}
          className="rounded-xl bg-[#ff6b6b] text-white px-5 py-3 text-sm font-semibold hover:bg-[#e05555] transition-colors disabled:opacity-50"
        >
          {loading ? "Iniciando…" : "Gerar export"}
        </button>
      </div>
    );
  }

  if (job.status === "queued" || job.status === "processing") {
    return (
      <div className="flex items-center gap-3 text-[#8b8b8b] text-sm">
        <div className="w-4 h-4 border-2 border-[#ff6b6b] border-t-transparent rounded-full animate-spin shrink-0" />
        <span>Gerando… pode levar alguns minutos para começar.</span>
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-red-500">
          {job.error_msg || "Ocorreu um erro no export."}
        </p>
        <button
          onClick={handleTrigger}
          disabled={loading}
          className="rounded-xl bg-[#ff6b6b] text-white px-5 py-3 text-sm font-semibold hover:bg-[#e05555] transition-colors disabled:opacity-50"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Done
  const isStale = !job.cached && job.status === "done";
  return (
    <div className="flex flex-col gap-3">
      {isStale && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          Viagem atualizada desde o último export.
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        {job.zip_url && (
          <a
            href={job.zip_url}
            download
            className="rounded-xl border border-[rgba(0,0,0,0.12)] px-4 py-2 text-sm font-medium text-[#242424] hover:bg-[#f3ece8] transition-colors"
          >
            ↓ Baixar PNGs
          </a>
        )}
        {job.mp4_url && (
          <a
            href={job.mp4_url}
            download
            className="rounded-xl bg-[#ff6b6b] text-white px-4 py-2 text-sm font-medium hover:bg-[#e05555] transition-colors"
          >
            ↓ Baixar MP4
          </a>
        )}
        <button
          onClick={handleTrigger}
          disabled={loading}
          className="rounded-xl border border-[rgba(0,0,0,0.12)] px-4 py-2 text-sm text-[#8b8b8b] hover:text-[#242424] transition-colors disabled:opacity-50"
        >
          ↺ Regenerar
        </button>
      </div>
    </div>
  );
}
