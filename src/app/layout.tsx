import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { GlobalPlayerSearch } from "@/components/layout/global-player-search";

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
  description:
    "Modern basketball analytics with a canonical data layer and clear visualizations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <header className="border-b border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-2.5 sm:px-6 md:h-14 md:flex-row md:items-center md:gap-4 md:py-0">
            <Link
              href="/"
              className="shrink-0 font-semibold tracking-tight"
            >
              Basketball Analytics
            </Link>

            <GlobalPlayerSearch className="w-full md:max-w-md md:flex-1" />

            <nav
              aria-label="Primary"
              className="flex flex-wrap items-center gap-3 md:gap-4"
            >
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Dashboard
              </Link>
              <Link
                href="/explore/players"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Players
              </Link>
              <Link
                href="/explore/teams"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Teams
              </Link>
              <Link
                href="/explore/games"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Games
              </Link>
            </nav>
          </div>
        </header>
        <div id="main-content" className="flex flex-1 flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
