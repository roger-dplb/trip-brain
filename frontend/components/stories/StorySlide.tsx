"use client";

import type { Timeline } from "@/lib/api";
import { formatDate } from "@/lib/utils";

type DayData = Timeline["days"][number];
type ActivityData = DayData["activities"][number];
type MemoryData = DayData["memories"][number];

export type Slide =
  | { type: "cover"; day: DayData | null; tripName: string; coverImageUrl?: string | null }
  | { type: "activity"; day: DayData; activity: ActivityData; photos: MemoryData[] }
  | { type: "media"; day: DayData; media: MemoryData }
  | { type: "summary"; day: DayData; activities: ActivityData[] };

type Props = {
  slide: Slide;
  onVideoEnded?: () => void;
};

export function StorySlide({ slide, onVideoEnded }: Props) {
  if (slide.type === "cover") {
    return <CoverSlide day={slide.day} tripName={slide.tripName} coverImageUrl={slide.coverImageUrl} />;
  }
  if (slide.type === "activity") {
    return <ActivitySlide day={slide.day} activity={slide.activity} photos={slide.photos} />;
  }
  if (slide.type === "media") {
    return <MediaSlide day={slide.day} media={slide.media} onVideoEnded={onVideoEnded} />;
  }
  return <SummarySlide day={slide.day} activities={slide.activities} />;
}

function CoverSlide({ day, tripName, coverImageUrl }: { day: DayData | null; tripName: string; coverImageUrl?: string | null }) {
  if (!day) {
    // Trip-level cover
    return (
      <div className="w-full h-full relative overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex flex-col justify-between p-8 text-white select-none">
        {/* Trip cover image as background */}
        {coverImageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${coverImageUrl})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/50" />
        <span className="relative text-[10px] opacity-30 tracking-widest uppercase">trip-brain</span>
        <div className="relative flex flex-col gap-4 pb-2">
          <div className="w-16 h-[3px] bg-[#ff6b6b] rounded-full" />
          <h1 className="text-6xl font-extrabold leading-none tracking-tight drop-shadow-lg">
            {tripName}
          </h1>
          <p className="text-sm opacity-60 tracking-widest uppercase">sua viagem</p>
        </div>
      </div>
    );
  }

  // Day-level cover — use first photo of the day as background
  const heroPhoto = day.memories.find((m) => m.memory_type === "photo" && m.public_url);
  const locationLabel = day.location
    ? `${day.location.city}, ${day.location.country}`
    : null;
  const dateLabel = day.date ? formatDate(day.date) : `Dia ${day.day_number}`;
  const photoCount = day.memories.filter((m) => m.memory_type === "photo").length;

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#0f3460] flex flex-col justify-between p-8 text-white select-none">
      {/* Hero background */}
      {heroPhoto?.public_url && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroPhoto.public_url})` }}
        />
      )}
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/50" />

      {/* Top-left: small trip label */}
      <div className="relative">
        <span className="text-[10px] opacity-50 tracking-widest uppercase">{tripName}</span>
      </div>

      {/* Bottom: all day info anchored at bottom like activity slides */}
      <div className="relative flex flex-col gap-2 pb-2">
        <span className="text-xs tracking-[3px] opacity-60 uppercase font-medium">
          Dia {day.day_number}
        </span>
        <div className="w-10 h-[3px] bg-[#ff6b6b] rounded-full" />
        <h2 className="text-5xl font-extrabold leading-none tracking-tight drop-shadow-lg">
          {dateLabel}
        </h2>
        {locationLabel && (
          <p className="text-base font-semibold opacity-90 flex items-center gap-1.5 mt-0.5">
            <span className="text-base">📍</span>{locationLabel}
          </p>
        )}
        <p className="text-xs opacity-40 tracking-widest uppercase mt-0.5">
          {day.activities.length} atividades · {photoCount} fotos
        </p>
      </div>
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

function MediaSlide({
  day,
  media,
  onVideoEnded,
}: {
  day: DayData;
  media: MemoryData;
  onVideoEnded?: () => void;
}) {
  const isVideo = media.memory_type === "video";
  return (
    <div className="w-full h-full relative overflow-hidden select-none bg-black">
      {isVideo ? (
        <video
          src={media.public_url ?? undefined}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          playsInline
          onEnded={onVideoEnded}
        />
      ) : (
        media.public_url && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${media.public_url})` }}
          />
        )
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
      <div className="absolute top-10 left-6 text-white text-[11px] tracking-[3px] opacity-70 uppercase font-medium">
        Dia {day.day_number} · {day.date}
      </div>
      {media.caption && (
        <div className="absolute bottom-8 left-6 right-6">
          <p className="text-white text-lg font-medium leading-snug">{media.caption}</p>
        </div>
      )}
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
