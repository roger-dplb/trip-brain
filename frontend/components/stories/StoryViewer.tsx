"use client";

import { useEffect, useCallback, useState } from "react";
import type { Timeline } from "@/lib/api";
import { StoryProgress } from "./StoryProgress";
import { StorySlide, type Slide } from "./StorySlide";

type Props = {
  timeline: Timeline;
  onClose: () => void;
};

/** Build an ordered flat list of slides from the timeline data. */
function buildSlides(timeline: Timeline): Slide[] {
  const slides: Slide[] = [];

  for (const day of timeline.days) {
    // Cover
    slides.push({ type: "cover", day });

    const dayPhotos = day.memories.filter((m) => m.memory_type === "photo");

    // Activity slides for activities; show day photos as backdrop
    for (const activity of day.activities) {
      if (dayPhotos.length > 0) {
        slides.push({ type: "activity", day, activity, photos: dayPhotos });
      }
    }

    // Summary slide for days with no photos (activities then become text-only)
    const activitiesWithoutPhotos = day.activities.filter(
      () => dayPhotos.length === 0
    );
    if (activitiesWithoutPhotos.length > 0) {
      slides.push({ type: "summary", day, activities: activitiesWithoutPhotos });
    }
  }

  return slides;
}

export function StoryViewer({ timeline, onClose }: Props) {
  const slides = buildSlides(timeline);
  const [current, setCurrent] = useState(0);

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

  const slide = slides[current];

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Story container — 9:16 aspect ratio, max height */}
      <div className="relative w-full max-w-sm h-full max-h-[calc(100vw*16/9)] sm:max-h-screen overflow-hidden bg-black">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 z-20">
          <StoryProgress total={slides.length} current={current} />
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
          <StorySlide slide={slide} />
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
