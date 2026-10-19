import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { documentTheme } from "@/lib/theme";
import { canonicalAddress } from "@/lib/church-address";
import { TooltipProvider } from "@connectapp/ui";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { PRELOAD_FONTS } from "./fonts-preload";
import { EMOJI_HREF } from "./fonts-emoji";
import { SandboxBanner, sandbox } from "@/components/sandbox-banner";

export const metadata: Metadata = {
  title: "ConnectApp",
  description: "Church management software.",
};

export const viewport: Viewport = {
  /*
   * R17.5, R24.6. The member portal installs to a home screen and runs
   * without browser chrome, so the page has to say it will handle the
   * notch and the home indicator itself. Without this every
   * env(safe-area-inset-*) in the product resolves to zero and the tab
   * bar sits under the bar iOS draws at the bottom of the screen.
   */
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1d2d" },
  ],
};

/**
 * R24.x. Light, dark, or whatever the device is set to.
 *
 * Read from a cookie on the server, so the first paint is already the right
 * one and nobody gets a white flash at 7am in a dark building. A church that
 * has chosen nothing works in light: an office is lit, and a working screen
 * that arrives dark because somebody's laptop is set that way is a surprise.
 * ConnectApp's own website follows the device instead, which `lib/theme.ts`
 * holds: somebody meeting the product has already told their computer how
 * they like to read.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /* R1.1, R17.1. A church that picked a name is reached at it. The slug it
     started with sends people on rather than serving a second copy. */
  const elsewhere = await canonicalAddress();
  if (elsewhere) redirect(elsewhere);

  const { attr } = await documentTheme();

  return (
    <html
      lang="en"
      data-density="office"
      {...(attr ? { "data-theme": attr } : {})}
      suppressHydrationWarning
    >
      <head>
        {/*
         * The faces every screen sets, asked for before the stylesheet that
         * names them is parsed. `crossOrigin` is required even same-origin:
         * a font is fetched in CORS mode, and a preload without it is
         * fetched a second time rather than reused.
         */}
        {PRELOAD_FONTS.map((href) => (
          <link key={href} rel="preload" as="font" type="font/woff2" href={href} crossOrigin="anonymous" />
        ))}
        {/* R16.9. See app/fonts-emoji.ts for why this one is not local. */}
        <link rel="stylesheet" href={EMOJI_HREF} />
      </head>
      <body
        /* HRT-402. Outside production, the bar below is drawn and the
           viewport-height utilities give its height back. */
        data-env-bar={sandbox() ? "" : undefined}
        className="font-sans"
      >
        {/* HRT-402. Outside production, every screen says so. */}
        <SandboxBanner />
        <TooltipProvider>{children}</TooltipProvider>
        {/*
         * How many people reach a page, and nothing about who they are.
         *
         * It sets no cookie, keeps no identifier across visits and sends the
         * route rather than the address, so a member's own page is counted as
         * /members/[id] and the id never leaves the browser. A church's data
         * is its own, and a visitor count is the most we take.
         */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
