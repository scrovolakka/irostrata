import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://scrovolakka.github.io/irostrata";
const title = "IROSTRATA — リソグラフ風画像ジェネレーター";
const description = "写真を最大6色のインク版へ分解し、網点・紙目・版ズレを細かく調整できるリソグラフ風画像ジェネレーター。";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: { title, description, images: [{ url: `${siteUrl}/og.png`, width: 1254, height: 627, alt: "IROSTRATA — RISO-LIKE IMAGE LAB" }] },
  twitter: { card: "summary_large_image", title, description, images: [`${siteUrl}/og.png`] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
