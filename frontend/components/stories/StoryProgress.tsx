"use client";

type Props = {
  total: number;
  current: number;
  duration?: number; // ms for the current slide, default 4000
};

export function StoryProgress({ total, current, duration = 2500 }: Props) {
  return (
    <div className="flex gap-[3px] px-4 pt-3">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/30"
        >
          {i < current ? (
            // Already seen — instantly full
            <div className="h-full w-full bg-white rounded-full" />
          ) : i === current ? (
            // Active — animate from 0 to 100% over `duration`; pulse if video (no duration)
            <div
              key={current}
              className="h-full bg-white rounded-full"
              style={
                duration != null
                  ? {
                      width: "100%",
                      transform: "scaleX(0)",
                      transformOrigin: "left",
                      animation: `story-fill ${duration}ms linear forwards`,
                    }
                  : {
                      width: "100%",
                      opacity: 0.5,
                      animation: "story-pulse 1.2s ease-in-out infinite",
                    }
              }
            />
          ) : (
            // Future — empty
            <div className="h-full w-0 bg-white rounded-full" />
          )}
        </div>
      ))}
      <style>{`
        @keyframes story-fill {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes story-pulse {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
