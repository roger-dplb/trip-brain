import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merge class names and resolves tailwind conflicts", () => {
    expect(cn("px-2", "px-4", "font-bold", undefined, false && "hidden")).toBe(
      "px-4 font-bold",
    );
  });
});
