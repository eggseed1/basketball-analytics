import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";

import { OwnerThemeProvider } from "@/components/design-system/theme-provider";
import { SportsShell } from "@/components/sports/sports-shell";
import { SmoothScroll } from "@/components/smooth-scroll";
import { ChartHoverTip } from "@/components/charts/chart-hover-tip";
import { ScrollHoverGuard } from "@/components/continuity/scroll-hover-guard";
import { OWNER_THEME_BOOT_SCRIPT } from "@/lib/owner-theme";
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
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
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
        <Script
          id="owner-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: OWNER_THEME_BOOT_SCRIPT }}
        />
        <OwnerThemeProvider>
          <SmoothScroll />
          <ChartHoverTip />
          <ScrollHoverGuard />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background"
          >
            Skip to content
          </a>
          <div
            id="main-content"
            className="flex min-h-dvh min-w-0 flex-col overflow-x-clip"
          >
            <SportsShell>{children}</SportsShell>
          </div>
        </OwnerThemeProvider>
      </body>
    </html>
  );
}
