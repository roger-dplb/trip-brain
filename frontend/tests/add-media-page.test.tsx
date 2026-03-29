// frontend/tests/add-media-page.test.tsx
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ tripId: "trip-123" }),
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock API functions
vi.mock("@/lib/api", () => ({
  createImportPresign: vi.fn(),
  addMediaToTrip: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import AddMediaPage from "@/app/trips/[tripId]/add-media/page";
import { createImportPresign, addMediaToTrip } from "@/lib/api";

describe("AddMediaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the drop zone and import button", () => {
    render(<AddMediaPage />);
    expect(
      screen.getByText(/arraste suas fotos e vídeos/i),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /adicionar à viagem/i }),
    ).toBeDefined();
  });

  it("import button is disabled when no files selected", () => {
    render(<AddMediaPage />);
    const btn = screen.getByRole("button", {
      name: /adicionar à viagem/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("shows error when API call fails", async () => {
    const { createImportPresign: mockPresign } = await import("@/lib/api");
    (mockPresign as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Ocorreu um erro ao conectar"),
    );

    render(<AddMediaPage />);

    // Simulate file selection via file input
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.upload(input, file);

    const btn = screen.getByRole("button", { name: /adicionar à viagem/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/ocorreu um erro/i)).toBeDefined();
    });
  });
});
