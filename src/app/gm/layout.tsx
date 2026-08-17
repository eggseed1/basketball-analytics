import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Franchise Lab",
  description: "In-depth basketball front-office GM simulation.",
};

export default function GmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
