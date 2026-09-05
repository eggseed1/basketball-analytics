import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";

import { OwnerThemeProvider } from "@/components/design-system/theme-provider";
import { SportsShell } from "@/components/sports/sports-shell";
import { SmoothScroll } from "@/components/smooth-scroll";
import { OWNER_THEME_BOOT_SCRIPT } from "@/lib/owner-theme";

import "./globals.css";
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Basketball Analytics",
    template: "%s | Basketball Analytics",
  },
  description: "NBA impact, efficiency, and advanced stats.",
};

/** Device-width + safe-area for notched iPhones; zoom allowed for a11y. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
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
