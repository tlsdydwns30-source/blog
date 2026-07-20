"use client";

import { useState } from "react";

interface Rec {
  keyword: string;
  monthlyPc: number;
  monthlyMobile: number;
  totalSearch: number;
  compIdx: string;
  score: number;
}

const COMP_STYLE: Record<string, string> = {
  낮음: "bg-brand-100 text-brand-700",
  중간: "bg-amber-100 text-amber-700",
  높음: "bg-rose-100 text-rose-700",
};

export default function KeywordRecommend() {
  const [seed, setSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [top, setTop] = useState<Rec[]>([]);
  const [all, setAll] = useState<Rec[]>([]);
  const [note, setNote] = useState("");

  const run = async () => {
    if (!seed.trim()) return;
    setLoading(true);
    setError(null);
    setTop([]);
    setAll([]);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
      setTop(data.top ?? []);
      setAll(data.all ?? []);
      setNote(data.note ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  const compBadge = (idx: string) => (
    <span
      className={
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium " +
        (COMP_STYLE[idx] ?? "bg-slate-100 text-slate-500")
      }
    >
      {idx}
    </span>
  );

  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900">키워드 추천</h2>
      <p className="mt-1 text-sm text-slate-500">
        주제를 입력하면 네이버 검색광고 데이터로 연관 키워드의 월 검색량·경쟁도를
        조회해, 검색은 많고 경쟁은 낮은 <b>황금 키워드 Top 5</b>를 추천합니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="예: 여행, 오사카, 제주도 맛집"
          className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          onClick={run}
          disabled={loading || !seed.trim()}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "조회 중..." : "키워드 추천"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
          {error}
        </p>
      )}

      {top.length > 0 && (
        <>
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-700">
              🏆 오늘의 추천 Top 5
            </h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {top.map((r, i) => (
                <div
                  key={r.keyword}
                  className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-brand-600">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-900">
                      {r.keyword}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{r.totalSearch.toLocaleString("ko-KR")}회</span>
                    {compBadge(r.compIdx)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">키워드</th>
                  <th className="px-3 py-2 text-right font-medium">월 검색량</th>
                  <th className="px-3 py-2 text-right font-medium">PC</th>
                  <th className="px-3 py-2 text-right font-medium">모바일</th>
                  <th className="px-3 py-2 font-medium">경쟁</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {all.map((r) => (
                  <tr key={r.keyword} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {r.keyword}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                      {r.totalSearch.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {r.monthlyPc.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {r.monthlyMobile.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2">{compBadge(r.compIdx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {note && (
            <p className="mt-3 text-xs text-slate-400">※ {note}</p>
          )}
        </>
      )}
    </section>
  );
}
