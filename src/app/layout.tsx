import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { BouncingBasketball } from "@/components/brand/bouncing-basketball";
import { OwnerThemeProvider } from "@/components/design-system/theme-provider";
import { SportsShell } from "@/components/sports/sports-shell";
import { SmoothScroll } from "@/components/smooth-scroll";
import { ChartHoverTip } from "@/components/charts/chart-hover-tip";
import { ScrollHoverGuard } from "@/components/continuity/scroll-hover-guard";
import { SortableTables } from "@/components/continuity/sortable-tables";
import { APP_BOOT_SCRIPT } from "@/lib/app-boot";
import { APPLE_STARTUP_SCREENS, appleStartupHref } from "@/lib/apple-startup";
import { OWNER_THEME_BOOT_SCRIPT } from "@/lib/owner-theme";
import { SCORE_DELAY_BOOT_SCRIPT } from "@/lib/score-delay";
import { SITE_NAME, SITE_URL } from "@/lib/site-url";

import "./globals.css";
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  "NBA scores, shot charts, impact and efficiency stats, and fan sentiment.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} Analytics: NBA Stats and Advanced Metrics`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: "DRBL",
  appleWebApp: {
    capable: true,
    title: "DRBL",
    statusBarStyle: "black-translucent",
    startupImage: APPLE_STARTUP_SCREENS.flatMap((screen) => [
      {
        url: appleStartupHref(screen.width, screen.height, false),
        media: `${screen.media} and (prefers-color-scheme: light)`,
      },
      {
        url: appleStartupHref(screen.width, screen.height, true),
        media: `${screen.media} and (prefers-color-scheme: dark)`,
      },
    ]),
  },
  formatDetection: { telephone: false },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};

/** Device-width + safe-area for notched iPhones; zoom allowed for a11y. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d11" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-dvh min-w-0 overflow-x-clip bg-background font-sans text-base text-foreground">
        {/* Plain <script> so it runs before first paint; next/script's
            beforeInteractive holds inline code until the runtime loads. */}
        <script
          id="owner-theme-boot"
          dangerouslySetInnerHTML={{ __html: OWNER_THEME_BOOT_SCRIPT }}
        />
        <script
          id="score-delay-boot"
          dangerouslySetInnerHTML={{ __html: SCORE_DELAY_BOOT_SCRIPT }}
        />
        <div
          id="app-boot"
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            alignItems: "center",
            justifyContent: "center",
            background: "#f2f2f7",
            transition: "opacity 0.4s ease",
          }}
        >
          <BouncingBasketball size={88} />
          <p
            data-boot-word=""
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: "#1d1d1f",
              fontFamily: "var(--font-sans), system-ui, sans-serif",
            }}
          >
            DRBL
          </p>
          <div className="bb-meter" />
        </div>
        <script id="app-boot-script" dangerouslySetInnerHTML={{ __html: APP_BOOT_SCRIPT }} />
        <OwnerThemeProvider>
          <SmoothScroll />
          <ChartHoverTip />
          <ScrollHoverGuard />
          <SortableTables />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background"
          >
            Skip to content
          </a>
          <div
            id="main-content"
            data-sortable-tables
            className="flex min-h-dvh min-w-0 flex-col overflow-x-clip"
          >
            <SportsShell>{children}</SportsShell>
          </div>
        </OwnerThemeProvider>
      </body>
    </html>
  );
}
