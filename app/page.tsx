"use client";

import { useState } from "react";
import KeywordRecommend from "@/components/KeywordRecommend";
import BlogCoach from "@/components/BlogCoach";
import GoldenKeyword from "@/components/GoldenKeyword";
import PriceCompare from "@/components/PriceCompare";
import DraftGenerator from "@/components/DraftGenerator";

type TabKey = "recommend" | "coach" | "keyword" | "price" | "draft";

const TABS: { key: TabKey; label: string; emoji: string }[] = [
  { key: "recommend", label: "키워드 추천", emoji: "🔥" },
  { key: "coach", label: "내 블로그 코칭", emoji: "🧑‍🏫" },
  { key: "keyword", label: "골든키워드", emoji: "🔑" },
  { key: "price", label: "가격비교표", emoji: "💰" },
  { key: "draft", label: "초안 생성", emoji: "✍️" },
];

export default function Home() {
  const [tab, setTab] = useState<TabKey>("recommend");

  return (
    <main className="min-h-screen bg-white">
      {/* 헤더 */}
      <header className="border-b border-slate-200">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧭</span>
            <h1 className="text-xl font-bold text-slate-900">
              다용블
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            키워드 조사 → 가격비교 → 초안 생성까지 한 곳에서.
          </p>
        </div>
      </header>

      {/* 탭 */}
      <nav className="border-b border-slate-200">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex gap-1">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={
                    "relative px-4 py-3 text-sm font-medium transition-colors " +
                    (active
                      ? "text-brand-600"
                      : "text-slate-500 hover:text-slate-800")
                  }
                  aria-current={active ? "page" : undefined}
                >
                  <span className="mr-1">{t.emoji}</span>
                  {t.label}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* 콘텐츠 */}
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {tab === "recommend" && <KeywordRecommend />}
        {tab === "coach" && <BlogCoach />}
        {tab === "keyword" && <GoldenKeyword />}
        {tab === "price" && <PriceCompare />}
        {tab === "draft" && <DraftGenerator />}
      </div>

      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-4 text-xs text-slate-400 sm:px-6">
        blog-workflow-tool · Next.js 14 · 골든키워드/가격비교는 100% 클라이언트에서
        동작합니다.
      </footer>
    </main>
  );
}
