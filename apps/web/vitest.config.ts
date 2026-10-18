import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      /* So a `server-only` module can be exercised. See the stub's own note. */
      "server-only": resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
      "@": resolve(import.meta.dirname),
    },
  },
});
