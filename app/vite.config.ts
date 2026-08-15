/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The app is served from a project page, so assets cannot be looked for at the
  // domain root (dev-plan §5).
  base: "./",
  build: {
    // pdfmake and its fonts are a megabyte, and they are deliberately split out
    // and fetched only when a quote is downloaded.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
});
