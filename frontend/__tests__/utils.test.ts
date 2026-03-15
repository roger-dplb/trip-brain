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
