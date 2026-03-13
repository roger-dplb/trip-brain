import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createUploadPresign } from "@/lib/api";

describe("API client auth headers", () => {
  const fetchMock = vi.fn();
  const localStorageMock = {
    getItem: vi.fn(() => "session-token"),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        object_key: "memories/test.jpg",
        upload_url: "http://localhost:9000/upload",
        expires_in: 900,
      }),
    });
    localStorageMock.getItem.mockReturnValue("session-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps Authorization when request includes custom headers", async () => {
    await createUploadPresign({
      trip_id: "trip-1",
      filename: "photo.jpg",
      content_type: "image/jpeg",
      file_size_bytes: 1234,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const headers = requestInit.headers as Headers;

    expect(headers.get("Authorization")).toBe("Bearer session-token");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
