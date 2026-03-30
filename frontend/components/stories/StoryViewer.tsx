"use client";

import type { Timeline } from "@/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoryProgress } from "./StoryProgress";
import { StorySlide, type Slide } from "./StorySlide";

type Props = {
  timeline: Timeline;
  onClose: () => void;
};

/** Build an ordered flat list of slides from the timeline data. */
function buildSlides(timeline: Timeline): Slide[] {
  const slides: Slide[] = [];

  // First slide: trip cover
  slides.push({ type: "cover", day: null, tripName: timeline.trip_name });

  for (const day of timeline.days) {
    // Day cover
    slides.push({ type: "cover", day, tripName: timeline.trip_name });

    // Activity slides — one per photo per activity
    const activitiesWithoutPhotos: typeof day.activities = [];
    for (const activity of day.activities) {
      const activityPhotos = day.memories.filter(
        (m) => m.activity_id === activity.id && m.memory_type === "photo"
      );
      if (activityPhotos.length > 0) {
        for (const photo of activityPhotos) {
          slides.push({ type: "activity", day, activity, photos: [photo] });
        }
      } else {
        activitiesWithoutPhotos.push(activity);
      }
    }

    // Media slides — one per unlinked photo or video (no activity_id)
    for (const media of day.memories.filter((m) => !m.activity_id)) {
      slides.push({ type: "media", day, media });
    }

    // Summary slide for activities with no photos
    if (activitiesWithoutPhotos.length > 0) {
      slides.push({ type: "summary", day, activities: activitiesWithoutPhotos });
    }
  }

  return slides;
}

export function StoryViewer({ timeline, onClose }: Props) {
  const slides = useMemo(() => buildSlides(timeline), [timeline]);
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goNext = useCallback(() => {
    setCurrent((c) => {
      if (c >= slides.length - 1) {
        onClose();
        return c;
      }
      return c + 1;
    });
  }, [slides.length, onClose]);

  const goPrev = useCallback(() => {
    setCurrent((c) => Math.max(0, c - 1));
  }, []);

  // Auto-advance: 4s for non-video slides; videos advance via onEnded
  const slide = slides[current];
  const isVideoSlide = slide?.type === "media" && slide.media.memory_type === "video";

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!isVideoSlide) {
      timerRef.current = setTimeout(goNext, 4000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, isVideoSlide, goNext]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onClose]);

  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-8">
        <p className="text-white opacity-60 text-center">
          Nenhuma memória encontrada nesta viagem.
        </p>
        <button onClick={onClose} className="absolute top-4 right-4 text-white text-2xl">✕</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Story container — 9:16 aspect ratio, max height */}
      <div className="relative w-full max-w-sm h-full max-h-[calc(100vw*16/9)] sm:max-h-screen overflow-hidden bg-black">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 z-20">
          <StoryProgress
            total={slides.length}
            current={current}
            duration={isVideoSlide ? undefined : 4000}
          />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-8 right-4 z-30 text-white/70 hover:text-white text-2xl leading-none"
          aria-label="Fechar Stories"
        >
          ✕
        </button>

        {/* Current slide */}
        <div className="absolute inset-0">
          <StorySlide slide={slide} onVideoEnded={goNext} />
        </div>

        {/* Tap zones */}
        <button
          className="absolute left-0 top-0 bottom-0 w-2/5 z-10"
          onClick={goPrev}
          aria-label="Slide anterior"
        />
        <button
          className="absolute right-0 top-0 bottom-0 w-3/5 z-10"
          onClick={goNext}
          aria-label="Próximo slide"
        />
      </div>

      {/* Click outside to close on desktop */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
