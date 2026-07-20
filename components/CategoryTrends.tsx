"use client";

import { useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";

const CATEGORIES = ["여행", "경제", "IT", "맛집", "뷰티", "건강", "육아"];

interface Kw {
  keyword: string;
  totalSearch: number;
  compIdx: string;
}

interface Idea {
  title: string;
  desc: string;
}

const COMP_STYLE: Record<string, string> = {
  낮음: "bg-brand-100 text-brand-700",
  중간: "bg-amber-100 text-amber-700",
  높음: "bg-rose-100 text-rose-700",
};

export default function CategoryTrends() {
  const [category, setCategory] = useState("여행");
  const [keywords, setKeywords] = useState<Kw[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ideaFor, setIdeaFor] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [followups, setFollowups] = useState<string[]>([]);
  const [ideaLoading, setIdeaLoading] = useState(false);

  const load = async (cat: string) => {
    setLoading(true);
    setError(null);
    setKeywords([]);
    setIdeaFor(null);
    try {
      const res = await fetch("/api/category-trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
      setKeywords(data.keywords ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const showIdeas = async (keyword: string) => {
    setIdeaFor(keyword);
    setIdeas(null);
    setFollowups([]);
    setIdeaLoading(true);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setIdeas(data.ideas ?? []);
      setFollowups(data.followups ?? []);
    } catch {
      setIdeas([]);
    } finally {
      setIdeaLoading(false);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900">
        분야별 인기 키워드{" "}
        <span className="align-middle text-xs font-normal text-slate-400">
          (월간 검색량 기준)
        </span>
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        분야별로 <b>지난 한 달간 꾸준히 많이 검색된</b> 키워드 Top 10이에요
        (네이버 검색량 기준 · 실시간 아님). 실시간 급상승은{" "}
        <b>‘오늘의 트렌드’</b> 탭을 보세요. 키워드 <b>글감</b>으로 제목·소제목까지
        바로 받으세요.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={
              "rounded-full px-3 py-1 text-sm font-medium transition-colors " +
              (category === c
                ? "bg-brand-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            {c}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
          {error}
        </p>
      )}
      {loading && <p className="mt-4 text-sm text-slate-400">불러오는 중...</p>}

      {!loading && keywords.length > 0 && (
        <ol className="mt-4 space-y-1.5">
          {keywords.map((k, i) => (
            <li
              key={k.keyword}
              className="rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-5 text-sm font-bold text-brand-600">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-900">
                    {k.keyword}
                  </span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5 text-xs text-slate-500">
                  <span className="tabular-nums">
                    {k.totalSearch.toLocaleString("ko-KR")}회
                  </span>
                  <span
                    className={
                      "rounded-full px-1.5 py-0.5 font-medium " +
                      (COMP_STYLE[k.compIdx] ?? "bg-slate-100 text-slate-500")
                    }
                  >
                    {k.compIdx}
                  </span>
                  <button
                    onClick={() => showIdeas(k.keyword)}
                    className="rounded-md border border-brand-300 bg-white px-2 py-0.5 font-medium text-brand-600 hover:bg-brand-50"
                  >
                    글감
                  </button>
                </div>
              </div>

              {ideaFor === k.keyword && (
                <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-2">
                  {ideaLoading && (
                    <p className="text-xs text-slate-400">글감 생성 중...</p>
                  )}
                  {ideas && ideas.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        📝 제목
                      </p>
                      <ul className="mt-1 space-y-1">
                        {ideas.map((t, j) => (
                          <li
                            key={j}
                            className="flex items-start justify-between gap-2"
                          >
                            <span className="text-xs text-slate-700">
                              • {t.title}
                            </span>
                            <CopyButton text={t.title} label="복사" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {followups.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        🔎 소제목(후속질문)
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {followups.map((q, j) => (
                          <li key={j} className="text-xs text-slate-600">
                            • {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
