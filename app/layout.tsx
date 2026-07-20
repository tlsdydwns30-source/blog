import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "다용블",
  description:
    "네이버 여행 블로그 + CPA 제휴 마케팅 워크플로우 반자동화 — 골든키워드 · 가격비교 · 초안 생성",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
