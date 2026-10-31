import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain vitest config (not getViteConfig) so tests don't boot the Cloudflare adapter.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
