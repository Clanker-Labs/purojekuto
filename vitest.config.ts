import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { PUROJEKUTO_DB_PATH: ":memory:", TZ: "UTC", PUROJEKUTO_TIMEZONE: "Europe/Paris", PUROJEKUTO_JOBS: "0", PUROJEKUTO_AI_PROVIDER: "none" },
  },
});
