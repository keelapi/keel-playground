import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Keel Playground",
  description: "Test Keel API requests interactively.",
};

const themeBootstrapScript = `
  (() => {
    try {
      const stored = window.localStorage.getItem("keel-theme");
      const isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", isDark);
    } catch {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        {children}
      </body>
    </html>
  );
}
