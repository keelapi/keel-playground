import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Keel Playground",
  description: "Test Keel API requests interactively.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
