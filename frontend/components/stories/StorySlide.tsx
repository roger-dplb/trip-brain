"use client";

import type { Timeline } from "@/lib/api";

type DayData = Timeline["days"][number];
type ActivityData = DayData["activities"][number];
type MemoryData = DayData["memories"][number];

export type Slide =
  | { type: "cover"; day: DayData }
  | { type: "activity"; day: DayData; activity: ActivityData; photos: MemoryData[] }
  | { type: "summary"; day: DayData; activities: ActivityData[] };

type Props = {
  slide: Slide;
};

export function StorySlide({ slide }: Props) {
  if (slide.type === "cover") {
    return <CoverSlide day={slide.day} />;
  }
  if (slide.type === "activity") {
    return <ActivitySlide day={slide.day} activity={slide.activity} photos={slide.photos} />;
  }
  return <SummarySlide day={slide.day} activities={slide.activities} />;
}

function CoverSlide({ day }: { day: DayData }) {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex flex-col justify-between p-8 text-white select-none">
      <span className="text-xs tracking-[4px] opacity-50 uppercase font-medium">
        Dia {day.day_number}
      </span>
      <div className="flex flex-col gap-3">
        <div className="w-12 h-1 bg-[#ff6b6b] rounded-full" />
        <h2 className="text-5xl font-extrabold leading-none tracking-tight">
          {day.date ?? `Dia ${day.day_number}`}
        </h2>
        <p className="text-sm opacity-40 tracking-widest uppercase">
          {day.activities.length} atividades · {day.memories.length} fotos
        </p>
      </div>
      <span className="text-[10px] opacity-20 tracking-widest uppercase">trip-brain</span>
    </div>
  );
}

function ActivitySlide({
  day,
  activity,
  photos,
}: {
  day: DayData;
  activity: ActivityData;
  photos: MemoryData[];
}) {
  const mainPhoto = photos[0];
  const extraPhotos = photos.slice(1, 4);
  const extraCount = photos.length > 4 ? photos.length - 4 : 0;

  return (
    <div className="w-full h-full relative overflow-hidden select-none">
      {/* Background photo */}
      {mainPhoto?.public_url && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${mainPhoto.public_url})` }}
        />
      )}
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90" />

      {/* Top label */}
      <div className="absolute top-10 left-6 text-white text-[11px] tracking-[3px] opacity-70 uppercase font-medium">
        Dia {day.day_number} · {day.date}
      </div>

      {/* Bottom content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pb-8">
        <h3 className="text-white text-3xl font-extrabold leading-tight mb-2">
          {activity.title}
        </h3>
        <div className="flex gap-4 text-white/60 text-sm mb-3">
          {activity.location && <span>📍 {activity.location}</span>}
          {activity.scheduled_time && <span>🕐 {activity.scheduled_time}</span>}
        </div>
        {/* Thumbnail strip for extra photos */}
        {extraPhotos.length > 0 && (
          <div className="flex gap-2">
            {extraPhotos.map((photo, i) => (
              <div
                key={i}
                className="w-12 h-12 rounded-lg bg-cover bg-center border border-white/30 shrink-0"
                style={{ backgroundImage: photo.public_url ? `url(${photo.public_url})` : undefined }}
              />
            ))}
            {extraCount > 0 && (
              <div className="w-12 h-12 rounded-lg border border-white/30 bg-white/10 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                +{extraCount}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummarySlide({
  day,
  activities,
}: {
  day: DayData;
  activities: ActivityData[];
}) {
  return (
    <div className="w-full h-full bg-gradient-to-b from-[#0f0f0f] to-[#1a1a2e] flex flex-col p-8 gap-6 text-white select-none">
      <div>
        <span className="text-[10px] tracking-[4px] opacity-40 uppercase">
          Dia {day.day_number} · {day.date}
        </span>
        <h3 className="text-2xl font-bold mt-2 opacity-70">+ outras atividades</h3>
      </div>

      <div className="flex flex-col gap-3 flex-1 overflow-hidden">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4"
          >
            <p className="text-lg font-semibold">{activity.title}</p>
            <p className="text-xs opacity-30 tracking-widest uppercase mt-1">sem foto</p>
          </div>
        ))}
      </div>

      <span className="text-xs opacity-20 tracking-widest uppercase">
        {activities.length} atividade{activities.length !== 1 ? "s" : ""} sem foto
      </span>
    </div>
  );
}
