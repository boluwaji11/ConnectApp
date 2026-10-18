/**
 * HRT-306, SEC-020. Which pages may be framed, and which may not.
 *
 * The backlog asks for a test that walks the routes and fails when a new page
 * lands in neither case, because the cost of getting this wrong runs both ways:
 * `frame-ancestors 'none'` on an embeddable page breaks a church's own site,
 * and its absence on sign-in is a password typed into somebody else's chrome.
 *
 * The route list is written out rather than discovered, so adding a screen does
 * not quietly adopt whichever answer the pattern happens to give it.
 */
import { describe, it, expect } from "vitest";
import { mayBeFramed, securityHeaders } from "../lib/security-headers";

/** The pages a church is handed an embed snippet for. */
const EMBEDDABLE = [
  "/g/embed",
  "/g/riverside/embed",
  "/g/riverside",
  "/g/riverside/abc123",
  "/e/embed",
  "/e/riverside/embed",
  "/e/riverside",
  "/e/riverside/harvest-supper",
  "/f/riverside/embed",
  "/f/riverside/connection-card/embed",
  "/f/riverside/connection-card",
];

/** Everything else, which is most of it. */
const PRIVATE = [
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot",
  "/reset",
  "/dashboard",
  "/home",
  "/members",
  "/members/abc123",
  "/giving",
  "/giving/statements",
  "/checkin",
  "/checkin/station",
  "/settings/church",
  "/settings/online",
  "/settings/manage-accesses",
  "/messages",
  "/reports",
  "/website/builder",
  "/choose-church",
  "/create-church",
  "/join/riverside",
  "/serving",
  "/u/some-token",
  "/give/riverside",
  "/trust",
  "/offline",
  "/auth/callback",
  "/demo/go",
  "/dev-gate",
  /* The church's own public website, which is served from the root. */
  "/about-us",
  "/what-we-believe",
];

describe("who may frame a page", () => {
  it("lets anybody frame the pages a church embeds", () => {
    for (const path of EMBEDDABLE) {
      expect(mayBeFramed(path), path).toBe(true);
      expect(securityHeaders(path)["Content-Security-Policy"]).toContain("frame-ancestors *");
      expect(securityHeaders(path)["X-Frame-Options"]).toBeUndefined();
    }
  });

  it("lets nobody frame anything else", () => {
    for (const path of PRIVATE) {
      expect(mayBeFramed(path), path).toBe(false);
      expect(securityHeaders(path)["Content-Security-Policy"], path)
        .toContain("frame-ancestors 'none'");
      expect(securityHeaders(path)["X-Frame-Options"], path).toBe("DENY");
    }
  });

  it("refuses a path it has never seen, rather than allowing it", () => {
    for (const path of ["/something-new", "/settings/whatever-lands-here", "/gx", "/embed"]) {
      expect(mayBeFramed(path), path).toBe(false);
    }
  });
});

describe("the rest of the headers", () => {
  const head = securityHeaders("/dashboard");

  it("declares no default-src, so nothing undeclared is restricted", () => {
    /* A default-src would restrict script, connect, img and frame sources at
       once, which breaks Stripe, Supabase, church media and Next's own
       hydration. That is how a CSP gets reverted and never comes back. */
    expect(head["Content-Security-Policy"]).not.toContain("default-src");
    expect(head["Content-Security-Policy"]).not.toContain("script-src");
  });

  it("closes the injection routes that need no script", () => {
    expect(head["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(head["Content-Security-Policy"]).toContain("base-uri 'self'");
    expect(head["Content-Security-Policy"]).toContain("form-action 'self'");
  });

  it("stops a browser guessing the type of a file a church uploaded", () => {
    expect(head["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("keeps a path carrying a token out of a Referer", () => {
    expect(head["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("asks for HTTPS without claiming a church's other subdomains", () => {
    expect(head["Strict-Transport-Security"]).toBe("max-age=63072000");
    expect(head["Strict-Transport-Security"]).not.toContain("includeSubDomains");
  });
});
