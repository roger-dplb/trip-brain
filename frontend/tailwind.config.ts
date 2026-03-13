import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#ff6b6b",
          bg: "#fff9f6",
          card: "#f3ece8",
          text: "#242424",
          muted: "#8b8b8b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
