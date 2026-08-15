import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SportsShell } from "@/components/sports/sports-shell";
import { DataProviderDevBadge } from "@/components/sports/data-provider-dev-badge";
import { SmoothScroll } from "@/components/smooth-scroll";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <SmoothScroll />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background"
        >
          Skip to content
        </a>
        <div id="main-content" className="flex min-h-screen flex-col">
          <DataProviderDevBadge />
          <SportsShell>{children}</SportsShell>
        </div>
      </body>
    </html>
  );
}
