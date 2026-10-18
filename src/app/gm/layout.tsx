import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/gm" },
  title: "Franchise Lab",
  description: "Basketball front-office GM simulation.",
};

export default function GmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
