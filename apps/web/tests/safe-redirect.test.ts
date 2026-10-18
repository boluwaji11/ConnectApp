/**
 * SEC-008. The addresses this product is willing to send somebody to.
 *
 * `safePath` is the pure half and is what six call sites now use in place of a
 * bare `startsWith("/")` or of nothing at all. The cases below are the shapes
 * that get past the obvious check: a protocol-relative URL is not a path, and
 * some URL parsers read a backslash as a slash.
 *
 * `ourOrigin` and `safeDestination` reach the database to ask whether a host
 * is a church's own domain, so they are exercised in the data layer's own
 * suite rather than here.
 */
import { describe, it, expect } from "vitest";
import { safePath } from "../lib/safe-path";

describe("safePath", () => {
  it("keeps a path inside the product", () => {
    expect(safePath("/dashboard")).toBe("/dashboard");
    expect(safePath("/members?page=2")).toBe("/members?page=2");
    expect(safePath("/settings/church#portal-address")).toBe("/settings/church#portal-address");
  });

  it("refuses an address that leaves the product", () => {
    for (const away of [
      "https://evil.example/",
      "http://evil.example/",
      "//evil.example",
      "//evil.example/dashboard",
      "/\\evil.example",
      "javascript:alert(1)",
      "data:text/html,x",
      "mailto:someone@example.org",
    ]) {
      expect(safePath(away), away).toBeNull();
    }
  });

  it("refuses nothing at all", () => {
    expect(safePath(null)).toBeNull();
    expect(safePath(undefined)).toBeNull();
    expect(safePath("")).toBeNull();
  });
});
