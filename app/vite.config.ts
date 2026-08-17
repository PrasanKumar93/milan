/// <reference types="vitest/config" />
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

/**
 * The parsed sample quotations are the customers' own documents, so they are
 * kept out of the repository (see `.gitignore`). Three test files read them —
 * they are where the arithmetic and the printed page are held against the real
 * thing — and away from a machine that has the samples, a CI runner publishing
 * the site, those files are left out rather than failing on a missing file.
 *
 * So the full suite runs where the evidence is, which is where the engine gets
 * changed, and the deploy still runs everything that stands on its own.
 */
const samples = fileURLToPath(new URL("../scripts/parsed.json", import.meta.url));

const needSamples = [
  "src/core/engine.test.ts",
  "src/export/layout.test.ts",
  "src/export/renderings.test.tsx",
];

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
    exclude: [...configDefaults.exclude, ...(existsSync(samples) ? [] : needSamples)],
  },
});
