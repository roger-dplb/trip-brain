// frontend/tests/api-add-media.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { addMediaToTrip } from "@/lib/api";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

describe("addMediaToTrip", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
    localStorageMock.setItem("trip_archive_access_token", "test-token");
  });

  it("sends POST to /trips/{tripId}/add-media with object_keys", async () => {
    const mockResponse = { trip_id: "trip-123", job_id: "job-456" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve(mockResponse),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await addMediaToTrip("trip-123", ["imports/s/a.jpg", "imports/s/b.mp4"]);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/trips/trip-123/add-media");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.object_keys).toEqual(["imports/s/a.jpg", "imports/s/b.mp4"]);
    expect(result.job_id).toBe("job-456");
    expect(result.trip_id).toBe("trip-123");
  });

  it("includes Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ trip_id: "t", job_id: "j" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await addMediaToTrip("trip-123", ["imports/s/a.jpg"]);

    const [, options] = fetchMock.mock.calls[0];
    const headers = new Headers(options.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });
});
