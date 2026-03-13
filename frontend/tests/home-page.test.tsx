import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";

import HomePage from "@/app/page";

const replaceMock = vi.hoisted(() => vi.fn());
const tokenMock = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/lib/api", () => ({
  getStoredAccessToken: () => tokenMock.value,
}));

describe("HomePage", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    tokenMock.value = "";
  });

  it("redirects user to /login when there is no session token", () => {
    render(<HomePage />);

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("redirects user to /trips when a session token exists", () => {
    tokenMock.value = "test-token";

    render(<HomePage />);

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/trips");
  });
});
