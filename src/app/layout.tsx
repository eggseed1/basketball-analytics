import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";

import { OwnerThemeProvider } from "@/components/design-system/theme-provider";
import { SportsShell } from "@/components/sports/sports-shell";
import { DataProviderDevBadge } from "@/components/sports/data-provider-dev-badge";
import { SmoothScroll } from "@/components/smooth-scroll";
import { WebVitalsReporter } from "@/components/system/web-vitals-reporter";
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

/**
 * RootLayout remains a Server Component.
 * Theme is a thin client island; WebVitals instrumentation is preserved.
 */
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
      <body className="min-h-full bg-background font-sans text-base text-foreground">
        <Script
          id="owner-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: OWNER_THEME_BOOT_SCRIPT }}
        />
        <OwnerThemeProvider>
          <SmoothScroll />
          <WebVitalsReporter />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background"
          >
            Skip to content
          </a>
          <div id="main-content" className="relative z-[1] flex min-h-screen flex-col">
            <DataProviderDevBadge />
            <SportsShell>{children}</SportsShell>
          </div>
        </OwnerThemeProvider>
      </body>
    </html>
  );
}
