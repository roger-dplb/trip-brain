import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";

import HomePage from "@/app/page";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("HomePage", () => {
  it("redirects user to /trips", () => {
    render(<HomePage />);

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/trips");
  });
});
