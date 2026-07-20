"use client";

import { useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";

interface Trend {
  term: string;
  traffic: string;
  newsTitle: string;
  newsUrl: string;
}

interface Idea {
  title: string;
  desc: string;
}

export default function TrendToday() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ideaFor, setIdeaFor] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [ideaLoading, setIdeaLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trends");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
      setTrends(data.trends ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const showIdeas = async (term: string) => {
    setIdeaFor(term);
    setIdeas(null);
    setIdeaLoading(true);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: term }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
      setIdeas(data.ideas ?? []);
    } catch {
      setIdeas([]);
    } finally {
      setIdeaLoading(false);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">오늘의 트렌드</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:border-brand-500 hover:text-brand-600 disabled:opacity-40"
        >
          {loading ? "..." : "새로고침"}
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        지금 한국에서 급상승 중인 검색어예요. <b>글감</b> 버튼으로 그 주제의 블로그
        제목 아이디어를 바로 받아보세요.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
          {error}
        </p>
      )}

      {loading && (
        <p className="mt-4 text-sm text-slate-400">불러오는 중...</p>
      )}

      {!loading && trends.length > 0 && (
        <ol className="mt-4 space-y-2">
          {trends.map((t, i) => (
            <li
              key={t.term}
              className="rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-bold text-brand-600">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-900">
                    {t.term}
                  </span>
                  {t.traffic && (
                    <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {t.traffic}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => showIdeas(t.term)}
                  className="flex-shrink-0 rounded-md border border-brand-300 bg-white px-2 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                >
                  글감
                </button>
              </div>
              {t.newsTitle && (
                <p className="mt-1 truncate text-xs text-slate-400">
                  📰 {t.newsTitle}
                </p>
              )}

              {ideaFor === t.term && (
                <div className="mt-2 rounded-md bg-slate-50 p-2">
                  {ideaLoading && (
                    <p className="text-xs text-slate-400">글감 생성 중...</p>
                  )}
                  {ideas && ideas.length > 0 && (
                    <ul className="space-y-1">
                      {ideas.map((idea, k) => (
                        <li
                          key={k}
                          className="flex items-start justify-between gap-2"
                        >
                          <span className="text-xs text-slate-700">
                            • {idea.title}
                          </span>
                          <CopyButton text={idea.title} label="복사" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {ideas && ideas.length === 0 && !ideaLoading && (
                    <p className="text-xs text-slate-400">
                      글감을 만들지 못했어요.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="mt-3 text-xs text-slate-400">
        ※ 구글 급상승은 뉴스·연예 등 전 분야예요. 여행·일상과 연결되는 주제만
        골라 글감으로 활용하세요.
      </p>
    </section>
  );
}
