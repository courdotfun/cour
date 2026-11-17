import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { Header } from "@/components/shell/Header";
import { ThemeScript } from "@/components/shell/ThemeScript";
import { StageFit } from "@/components/shell/StageFit";
import { BottomNav } from "@/components/shell/BottomNav";
import { RiskGate } from "@/components/shell/RiskGate";
import { HashRedirect } from "@/components/shell/HashRedirect";
import { WalletModal } from "@/components/wallet/WalletModal";
import { ScanModal } from "@/components/wallet/ScanModal";

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
        {/* Exact fonts v8 uses — required for pixel-identical text metrics. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fredoka:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        {/* v8 design CSS, served verbatim (see styles/globals.css note). */}
        <link rel="stylesheet" href="/v8.css" />
      </head>
      <body>
        <ThemeScript />
        <div id="stage">
          <Header />
          <main>{children}</main>
          <BottomNav />
        </div>
        <StageFit />
        <RiskGate />
        <WalletModal />
        <ScanModal />
        <HashRedirect />
      </body>
    </html>
  );
}
