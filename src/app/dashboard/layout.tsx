import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { internalPagesEnabled } from "@/lib/internal-pages";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  if (!internalPagesEnabled()) notFound();
  return children;
}
