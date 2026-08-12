import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:5173";
  const protocol = host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const title = "INKLOOM — リソグラフ風画像ジェネレーター";
  const description = "写真を最大6色のインク版へ分解し、網点・紙目・版ズレを細かく調整できるリソグラフ風画像ジェネレーター。";

  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title,
    description,
    openGraph: { title, description, images: [{ url: "/og.png", width: 1730, height: 909, alt: "INKLOOM — 2-COLOR IMAGE LAB" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
