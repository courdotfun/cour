import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "COUR — launch stock-backed tokens",
  description:
    "COUR is a token launchpad on Robinhood Chain. Launch, trade and graduate stock-backed tokens.",
  metadataBase: new URL("https://cour.fun"),
  openGraph: { title: "COUR", url: "https://cour.fun", type: "website" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* v8 design CSS, served verbatim (see styles/globals.css note). */}
        <link rel="stylesheet" href="/v8.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
