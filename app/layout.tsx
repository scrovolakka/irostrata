import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://scrovolakka.github.io/irostrata";
const title = "IROSTRATA — Riso-style Image Generator";
const description = "Separate photos into up to six ink plates, tune halftones, paper texture and registration, then export locally.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: { title, description, images: [{ url: `${siteUrl}/og.png`, width: 1254, height: 627, alt: "IROSTRATA — RISO-LIKE IMAGE LAB" }] },
  twitter: { card: "summary_large_image", title, description, images: [`${siteUrl}/og.png`] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
