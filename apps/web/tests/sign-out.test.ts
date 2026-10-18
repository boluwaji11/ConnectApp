/**
 * HRT-437, R17.1, HRT-306. Where signing out lands.
 *
 * `form-action 'self'` is checked against a redirect as well as against the
 * form's own target, so a sign-out that answers with another origin is
 * refused by the browser and the press does nothing. The sign-out route built
 * its answer from `new URL(request.url).origin`, which is the host Next
 * resolved the handler at rather than the one the person is on, so signing
 * out of a church's own address was blocked outright.
 */
import { describe, it, expect } from "vitest";
import { afterSignOut, DEMO_HOST, productSite } from "@/lib/demo-host";

const headers = (list: Record<string, string>) => new Headers(list);

describe("signing out stays on the address it was pressed on", () => {
  it("returns a church on our own name to that name", () => {
    expect(afterSignOut(headers({ host: "riverside.connectapp.church" })))
      .toBe("https://riverside.connectapp.church/");
  });

  it("returns a church on its own domain to that domain", () => {
    expect(afterSignOut(headers({ host: "stmarys.example" })))
      .toBe("https://stmarys.example/");
  });

  it("keeps the port a laptop carries, and stays on http there", () => {
    expect(afterSignOut(headers({ host: "riverside.localhost:4488" })))
      .toBe("http://riverside.localhost:4488/");
  });

  it("prefers the host the browser sent over the one we were reached at", () => {
    expect(afterSignOut(headers({
      "x-forwarded-host": "riverside.connectapp.church",
      host: "connectapp.church",
    }))).toBe("https://riverside.connectapp.church/");
  });

  it("answers the same origin it was asked on, which is what the CSP requires", () => {
    for (const host of [
      "connectapp.church",
      "riverside.connectapp.church",
      "dev.connectapp.church",
      "stmarys.example",
    ]) {
      const landed = new URL(afterSignOut(headers({ host })));
      expect(landed.host).toBe(host);
    }
  });
});

describe("the demo is the one place another host is right", () => {
  /* Leaving the demo on its own address hands the next request a fresh demo
     church, which is a sign-out that signs you straight back in. */
  /* One deployment has one demo address, named in the environment, so this
     reads it rather than writing a second one down beside it. */
  it("leaves the demo for the product it belongs to", () => {
    expect(afterSignOut(headers({ host: DEMO_HOST }))).toBe(productSite(DEMO_HOST));
  });

  it("does not answer the demo's own address, which would sign them back in", () => {
    const landed = new URL(afterSignOut(headers({ host: DEMO_HOST })));
    expect(landed.host).not.toBe(DEMO_HOST);
  });
});
