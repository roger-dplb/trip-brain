"use client";

import { useEffect, useState } from "react";
import { fetchTripTimeline, type Timeline, getStoredAccessToken } from "@/lib/api";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { ExportPanel } from "@/components/stories/ExportPanel";

type Props = {
  params: { tripId: string };
};

export default function StoriesPage({ params }: Props) {
  const { tripId } = params;
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!getStoredAccessToken()) return;
    fetchTripTimeline(tripId)
      .then(setTimeline)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tripId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#ff6b6b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasMemories = timeline?.days.some((d) =>
    d.memories.some((m) => m.memory_type === "photo")
  );

  return (
    <div className="p-6 max-w-lg mx-auto flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-[#242424]">Stories</h1>
        <p className="text-sm text-[#8b8b8b] mt-1">
          Reviva a viagem ou exporte para o Instagram.
        </p>
      </div>

      {/* Viewer section */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-5 flex flex-col gap-4 shadow-sm">
        <h2 className="text-base font-semibold text-[#242424]">Ver Stories</h2>
        {hasMemories ? (
          <button
            onClick={() => setViewerOpen(true)}
            className="w-full rounded-xl bg-[#ff6b6b] text-white py-3 text-sm font-semibold hover:bg-[#e05555] transition-colors flex items-center justify-center gap-2"
          >
            <span>▶</span> Assistir Stories
          </button>
        ) : (
          <p className="text-sm text-[#8b8b8b]">
            Adicione fotos à viagem para ver os Stories.
          </p>
        )}
      </div>

      {/* Export section */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-5 flex flex-col gap-4 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-[#242424]">Exportar</h2>
          <p className="text-xs text-[#8b8b8b] mt-0.5">
            Gera slides PNG + vídeo MP4 com legendas criadas por IA.
          </p>
        </div>
        <ExportPanel tripId={tripId} />
      </div>

      {/* Fullscreen viewer modal */}
      {viewerOpen && timeline && (
        <StoryViewer
          timeline={timeline}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
