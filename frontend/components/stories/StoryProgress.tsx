"use client";

type Props = {
  total: number;
  current: number; // 0-based index of the current slide
};

export function StoryProgress({ total, current }: Props) {
  return (
    <div className="flex gap-[3px] px-4 pt-3">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/30"
        >
          <div
            className="h-full bg-white rounded-full transition-none"
            style={{ width: i <= current ? "100%" : "0%" }}
          />
        </div>
      ))}
    </div>
  );
}
