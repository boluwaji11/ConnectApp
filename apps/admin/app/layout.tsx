import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@connectapp/ui";
import "./globals.css";
import { PRELOAD_FONTS } from "./fonts-preload";

export const metadata: Metadata = {
  title: "ConnectApp Admin",
  description: "The platform's own portal.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fbfaf9" }],
};

/**
 * R21.x. The team's portal.
 *
 * Light only and office density: this is a desk screen for the people running
 * ConnectApp, read on a laptop rather than on a phone in a foyer.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-density="office" data-theme="light" suppressHydrationWarning>
      <head>
        {/* A font is fetched in CORS mode, so a preload without `crossOrigin`
            is fetched a second time rather than reused. */}
        {PRELOAD_FONTS.map((href) => (
          <link key={href} rel="preload" as="font" type="font/woff2" href={href} crossOrigin="anonymous" />
        ))}
      </head>
      <body className="font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
