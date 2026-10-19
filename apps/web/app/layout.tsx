import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const uiFont = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-ui",
  weight: "100 900",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const metadata: Metadata = {
  title: "SlabTrak · Your Collection, Simplified.",
  description: "Your private sports card collection workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={uiFont.variable}>{children}</body></html>;
}
