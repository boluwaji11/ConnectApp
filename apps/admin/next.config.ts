import type { NextConfig } from "next";
import { loadAndCheck } from "@connectapp/env/load";

/**
 * Secrets live in one file at the repo root. Next only reads its own, so the
 * root one is loaded here, and HRT-397 checks what is in it against the
 * environment this process says it is. See docs/environments.md.
 */
loadAndCheck(import.meta.dirname);

const config: NextConfig = {
  distDir: process.env["NEXT_DIST_DIR"] || ".next",
  transpilePackages: ["@connectapp/ui", "@connectapp/db", "@connectapp/env"],
  // postgres.js is a server driver. Keep it out of the bundle entirely.
  serverExternalPackages: ["postgres"],
  /**
   * The faces in public/fonts are named by content and never change, so a
   * browser is told to keep them. Next only does this for what it builds into
   * _next/static, and the default for anything in public is no caching at all,
   * which would have every screen revalidate a font that cannot have moved.
   */
  async headers() {
    return [
      {
        source: "/fonts/:file*",
        headers: [
          { key: "cache-control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default config;
