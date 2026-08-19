import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { FirebaseAnalytics } from "@/components/FirebaseAnalytics";
import { AnonAuthBoot } from "@/components/AnonAuthBoot";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Ledger — Poker Bank Tracker",
  description:
    "Digital poker ledger: live bank rebuys, instant Splitwise-style settlements, full session history.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Ledger",
  },
  openGraph: {
    type: "website",
    title: "The Ledger — Poker Bank Tracker",
    description:
      "Digital poker ledger: live bank rebuys, instant Splitwise-style settlements, full session history.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#121212",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        <AnonAuthBoot />
        {children}
        <RegisterServiceWorker />
        <FirebaseAnalytics />
      </body>
    </html>
  );
}
