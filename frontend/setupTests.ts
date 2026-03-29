import "@testing-library/jest-dom/vitest";

// jsdom does not implement URL.createObjectURL
if (typeof URL.createObjectURL === "undefined") {
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: () => "blob:mock-url",
  });
}
if (typeof URL.revokeObjectURL === "undefined") {
  Object.defineProperty(URL, "revokeObjectURL", {
    writable: true,
    value: () => {},
  });
}
