# Trip Countdown Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a time-status badge to trip cards showing countdown ("X dias para a viagem"), "Em andamento", or "Finalizada" depending on the trip's dates relative to today.

**Architecture:** Pure frontend change across two files. A new utility function `getTripTimeStatus` in `utils.ts` encapsulates all date logic. `TripCard` calls this function and renders the appropriate badge in the card's bottom row.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Vitest + jsdom for tests

---

## Chunk 1: Utility function

### Task 1: Add `getTripTimeStatus` to `frontend/lib/utils.ts`

**Files:**
- Modify: `frontend/lib/utils.ts`
- Test: `frontend/__tests__/utils.test.ts` (new file)

- [ ] **Step 1: Create the test file with failing tests**

Create `frontend/__tests__/utils.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { getTripTimeStatus } from "@/lib/utils";

// Helper to mock "today" as a specific UTC date
function mockToday(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const fakeNow = Date.UTC(y, m - 1, d, 12, 0, 0); // noon UTC — toISOString strips time, giving clean YYYY-MM-DD
  vi.useFakeTimers();
  vi.setSystemTime(new Date(fakeNow));
}

describe("getTripTimeStatus", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when startDate is absent", () => {
    mockToday("2026-03-15");
    expect(getTripTimeStatus(null, null)).toBeNull();
    expect(getTripTimeStatus(undefined, undefined)).toBeNull();
    expect(getTripTimeStatus("", "")).toBeNull();
  });

  it("returns upcoming with correct daysUntil for a future trip", () => {
    mockToday("2026-03-15");
    expect(getTripTimeStatus("2026-03-20", "2026-03-25")).toEqual({
      type: "upcoming",
      daysUntil: 5,
    });
  });

  it("returns upcoming with daysUntil = 1 when trip is tomorrow", () => {
    mockToday("2026-03-15");
    expect(getTripTimeStatus("2026-03-16", "2026-03-18")).toEqual({
      type: "upcoming",
      daysUntil: 1,
    });
  });

  it("returns ongoing when today equals startDate", () => {
    mockToday("2026-03-15");
    expect(getTripTimeStatus("2026-03-15", "2026-03-20")).toEqual({
      type: "ongoing",
    });
  });

  it("returns ongoing when today is between startDate and endDate", () => {
    mockToday("2026-03-17");
    expect(getTripTimeStatus("2026-03-15", "2026-03-20")).toEqual({
      type: "ongoing",
    });
  });

  it("returns ongoing when today equals endDate", () => {
    mockToday("2026-03-20");
    expect(getTripTimeStatus("2026-03-15", "2026-03-20")).toEqual({
      type: "ongoing",
    });
  });

  it("returns past when today is after endDate", () => {
    mockToday("2026-03-21");
    expect(getTripTimeStatus("2026-03-15", "2026-03-20")).toEqual({
      type: "past",
    });
  });

  it("returns past when endDate is absent and startDate <= today", () => {
    mockToday("2026-03-16");
    expect(getTripTimeStatus("2026-03-15", null)).toEqual({ type: "past" });
    expect(getTripTimeStatus("2026-03-15", undefined)).toEqual({ type: "past" });
  });

  it("treats empty-string endDate as absent (past)", () => {
    mockToday("2026-03-16");
    expect(getTripTimeStatus("2026-03-15", "")).toEqual({ type: "past" });
  });

  it("handles same-day trip (startDate === endDate === today)", () => {
    mockToday("2026-03-15");
    expect(getTripTimeStatus("2026-03-15", "2026-03-15")).toEqual({
      type: "ongoing",
    });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail (function not yet defined)**

```bash
cd frontend && npx vitest run __tests__/utils.test.ts
```

Expected: multiple failures — `getTripTimeStatus is not a function` or similar.

- [ ] **Step 3: Add `getTripTimeStatus` to `frontend/lib/utils.ts`**

Append after the existing `getDayLabel` function:

```ts
export type TripTimeStatus =
  | { type: "upcoming"; daysUntil: number }
  | { type: "ongoing" }
  | { type: "past" }
  | null;

function parseUtcMidnight(dateStr: string): Date {
  const parts = dateStr.split("-");
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
}

export function getTripTimeStatus(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): TripTimeStatus {
  if (!startDate) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = parseUtcMidnight(todayStr);
  const start = parseUtcMidnight(startDate);
  const end = endDate ? parseUtcMidnight(endDate) : null;

  if (start > today) {
    const daysUntil = (start.getTime() - today.getTime()) / 86_400_000;
    return { type: "upcoming", daysUntil };
  }

  if (end && today <= end) {
    return { type: "ongoing" };
  }

  return { type: "past" };
}
```

- [ ] **Step 4: Run the tests and confirm they all pass**

```bash
cd frontend && npx vitest run __tests__/utils.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/utils.ts frontend/__tests__/utils.test.ts
git commit -m "feat: add getTripTimeStatus utility for trip countdown"
```

---

## Chunk 2: UI badge in TripCard

### Task 2: Render the time-status badge in `frontend/components/trip-card.tsx`

**Files:**
- Modify: `frontend/components/trip-card.tsx`

- [ ] **Step 1: Import `getTripTimeStatus` and add the badge logic**

At the top of `trip-card.tsx`, add the import:

```ts
import { formatDate, getTripTimeStatus } from "@/lib/utils";
```

Inside the `TripCard` component body (after the `isGenerating` declaration), compute the status:

```ts
const timeStatus = isGenerating ? null : getTripTimeStatus(trip.start_date, trip.end_date);
```

- [ ] **Step 2: Replace the bottom row with the badge + Stories layout**

Find the existing bottom row (currently `flex justify-end`):

```tsx
      <div className="mt-3 flex justify-end">
        <Link
          href={`/trips/${trip.id}/stories`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs font-semibold text-[#ff6b6b] hover:text-[#e05555] transition-colors"
        >
          <span>▶</span> Stories
        </Link>
      </div>
```

Replace it with:

```tsx
      <div className={`mt-3 flex items-center ${timeStatus ? "justify-between" : "justify-end"}`}>
        {timeStatus?.type === "upcoming" && (
          <span className="flex items-center gap-1 rounded-full bg-[#fff0ed] px-2.5 py-1 text-xs font-medium text-[#ff6b6b]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {timeStatus.daysUntil === 1 ? "1 dia para a viagem" : `${timeStatus.daysUntil} dias para a viagem`}
          </span>
        )}
        {timeStatus?.type === "ongoing" && (
          <span className="flex items-center gap-1 rounded-full bg-[#f0fdf4] px-2.5 py-1 text-xs font-medium text-[#16a34a]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 2c-2-2-4-2-5.5-.5L10 5 1.8 6.2l5 5-1.9 1.9 3 3 1.9-1.9 5 5z" />
            </svg>
            Em andamento
          </span>
        )}
        {timeStatus?.type === "past" && (
          <span className="flex items-center gap-1 rounded-full bg-[#f5f5f5] px-2.5 py-1 text-xs font-medium text-[#8b8b8b]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Finalizada
          </span>
        )}
        <Link
          href={`/trips/${trip.id}/stories`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs font-semibold text-[#ff6b6b] hover:text-[#e05555] transition-colors"
        >
          <span>▶</span> Stories
        </Link>
      </div>
```

- [ ] **Step 3: Verify the app builds without TypeScript errors**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run all tests to confirm nothing broke**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/trip-card.tsx
git commit -m "feat: show trip time-status badge on trip cards"
```
