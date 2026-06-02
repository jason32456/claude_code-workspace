import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Dashboard",
  description: "Track spending, set budgets, visualize trends, and split bills.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
