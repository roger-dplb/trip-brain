import React from "react";
import { render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders text and merges custom className", () => {
    render(<Button className="w-full">Salvar</Button>);

    const button = screen.getByRole("button", { name: "Salvar" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("w-full");
    expect(button).toHaveClass("inline-flex");
  });
});
