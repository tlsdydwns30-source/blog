"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";

interface Idea {
  title: string;
  desc: string;
}

interface Result {
  blogId: string;
  niche: string;
  mainKeyword: string;
  strength: "노출 좋음" | "노출 보통" | "노출 약함";
  rank: number | null;
  recentTitles: string[];
  ideas: Idea[];
  note: string;
}

const STRENGTH_STYLE: Record<string, string> = {
  "노출 좋음": "bg-brand-100 text-brand-700",
  "노출 보통": "bg-amber-100 text-amber-700",
  "노출 약함": "bg-slate-100 text-slate-600",
};

export default function BlogCoach() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/blog-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900">내 블로그 코칭</h2>
      <p className="mt-1 text-sm text-slate-500">
        내 네이버 블로그 주소를 넣으면, 블로그 주제와 <b>강도(추정)</b>를 분석해
        <b> 지금 쓰면 좋은 글감 5개</b>를 수준에 맞춰 추천합니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="예: blog.naver.com/내아이디"
          className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          onClick={run}
          disabled={loading || !url.trim()}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "분석 중..." : "블로그 분석"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
          {error}
        </p>
      )}

      {result && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div>
              <span className="text-slate-500">주제(니치)</span>{" "}
              <b className="text-slate-900">{result.niche}</b>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">강도</span>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-xs font-medium " +
                  (STRENGTH_STYLE[result.strength] ?? "bg-slate-100")
                }
              >
                {result.strength}
              </span>
              <span className="text-xs text-slate-400">
                {result.rank != null
                  ? `(최근 글이 자기 제목 검색 ${result.rank}위)`
                  : "(자기 글도 상위 미노출)"}
              </span>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-700">
              ✍️ 지금 쓰면 좋은 글감 5개 ({result.strength} 블로그 맞춤)
            </h3>
            <ul className="mt-2 space-y-2">
              {result.ideas.map((t, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {i + 1}. {t.title}
                    </p>
                    {t.desc && (
                      <p className="mt-0.5 text-xs text-slate-500">{t.desc}</p>
                    )}
                  </div>
                  <CopyButton text={t.title} label="제목 복사" />
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            ※ {result.note} 제목을 복사해 &lsquo;초안 생성&rsquo; 탭에 넣으면 바로
            글을 쓸 수 있어요.
          </p>
        </>
      )}
    </section>
  );
}
