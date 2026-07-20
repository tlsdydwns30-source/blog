"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";

interface Rec {
  keyword: string;
  monthlyPc: number;
  monthlyMobile: number;
  totalSearch: number;
  compIdx: string;
  score: number;
  docCount?: number | null;
  ratio?: number | null;
}

interface TopicIdea {
  title: string;
  desc: string;
}

interface NewsItem {
  title: string;
  link: string;
  desc: string;
}

interface TopicData {
  ideas: TopicIdea[];
  followups: string[];
  news: NewsItem[];
}

const COMP_STYLE: Record<string, string> = {
  낮음: "bg-brand-100 text-brand-700",
  중간: "bg-amber-100 text-amber-700",
  높음: "bg-rose-100 text-rose-700",
};

function compBadge(idx: string) {
  return (
    <span
      className={
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium " +
        (COMP_STYLE[idx] ?? "bg-slate-100 text-slate-500")
      }
    >
      {idx}
    </span>
  );
}

/** 경쟁지수(문서수÷검색량) 등급 — 낮을수록 황금 */
function ratioBadge(ratio: number | null | undefined) {
  if (ratio == null) return <span className="text-slate-300">-</span>;
  let label = "황금";
  let cls = "bg-amber-100 text-amber-700";
  if (ratio >= 5) {
    label = "높음";
    cls = "bg-rose-100 text-rose-700";
  } else if (ratio >= 1) {
    label = "보통";
    cls = "bg-slate-100 text-slate-600";
  } else if (ratio >= 0.1) {
    label = "좋음";
    cls = "bg-brand-100 text-brand-700";
  }
  return (
    <span className="whitespace-nowrap tabular-nums">
      {ratio.toLocaleString("ko-KR")}{" "}
      <span className={"rounded-full px-1.5 py-0.5 text-xs font-medium " + cls}>
        {label}
      </span>
    </span>
  );
}

export default function KeywordRecommend() {
  const [seed, setSeed] = useState("");
  const [path, setPath] = useState<string[]>([]); // 드릴다운 경로
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [top, setTop] = useState<Rec[]>([]);
  const [all, setAll] = useState<Rec[]>([]);
  const [note, setNote] = useState("");

  // 글감(제목) 상태
  const [topicsFor, setTopicsFor] = useState<string | null>(null);
  const [topics, setTopics] = useState<TopicData | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(false);

  const run = async (term?: string) => {
    const q = (term ?? seed).trim();
    if (!q) return;
    setSeed(q);
    // 드릴다운 경로 갱신
    setPath((prev) => (term && prev[prev.length - 1] !== term ? [...prev, term] : term ? prev : [q]));
    setLoading(true);
    setError(null);
    setTop([]);
    setAll([]);
    setTopicsFor(null);
    setTopics(null);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: q }),
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

  const showTopics = async (r: Rec) => {
    setTopicsFor(r.keyword);
    setTopics(null);
    setTopicsLoading(true);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: r.keyword,
          totalSearch: r.totalSearch,
          ratio: r.ratio ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
      setTopics({
        ideas: data.ideas ?? [],
        followups: data.followups ?? [],
        news: data.news ?? [],
      });
    } catch (e) {
      setTopics({ ideas: [], followups: [], news: [] });
      setError(e instanceof Error ? e.message : "글감 생성 실패");
    } finally {
      setTopicsLoading(false);
    }
  };

  // 클릭하면 그 키워드로 더 세부 조회 (드릴다운)
  const drillButton = (kw: string, cls: string) => (
    <button
      onClick={() => run(kw)}
      title="클릭하면 이 키워드로 더 세부 키워드를 조회합니다"
      className={"text-left hover:text-brand-600 hover:underline " + cls}
    >
      {kw}
    </button>
  );

  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900">키워드 추천</h2>
      <p className="mt-1 text-sm text-slate-500">
        주제를 입력하면 연관 키워드의 검색량·문서수·경쟁지수를 조회해{" "}
        <b>황금 키워드 Top 5</b>를 추천합니다. 키워드를 <b>클릭하면 더 세부</b>로
        파고들 수 있어요.
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
          onClick={() => run()}
          disabled={loading || !seed.trim()}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "조회 중..." : "키워드 추천"}
        </button>
      </div>

      {/* 드릴다운 경로 */}
      {path.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-400">
          {path.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span>›</span>}
              <button
                onClick={() => {
                  setPath(path.slice(0, i + 1));
                  run(p);
                }}
                className="hover:text-brand-600 hover:underline"
              >
                {p}
              </button>
            </span>
          ))}
        </div>
      )}

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
                  className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-sm font-bold text-brand-600">
                        {i + 1}
                      </span>
                      {drillButton(
                        r.keyword,
                        "truncate text-sm font-medium text-slate-900"
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5 text-xs text-slate-500">
                      <span>{r.totalSearch.toLocaleString("ko-KR")}회</span>
                      {r.ratio != null ? ratioBadge(r.ratio) : compBadge(r.compIdx)}
                      <button
                        onClick={() => showTopics(r)}
                        className="rounded-md border border-brand-300 bg-white px-2 py-0.5 font-medium text-brand-600 hover:bg-brand-100"
                      >
                        글감
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 글감(제목) 패널 */}
          {topicsFor && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  ✍️ &ldquo;{topicsFor}&rdquo; 글감 제안
                </h3>
                <button
                  onClick={() => setTopicsFor(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  닫기 ✕
                </button>
              </div>
              {topicsLoading && (
                <p className="mt-2 text-sm text-slate-400">생성 중...</p>
              )}
              {topics && (
                <div className="mt-2 space-y-4">
                  {/* 제목 아이디어 */}
                  {topics.ideas.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        📝 제목 아이디어
                      </p>
                      <ul className="mt-1 space-y-1.5">
                        {topics.ideas.map((t, i) => (
                          <li
                            key={i}
                            className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900">
                                {t.title}
                              </p>
                              {t.desc && (
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {t.desc}
                                </p>
                              )}
                            </div>
                            <CopyButton text={t.title} label="복사" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 후속질문 (소제목) */}
                  {topics.followups.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        🔎 사람들이 이어서 묻는 질문 (소제목으로 활용)
                      </p>
                      <ul className="mt-1 space-y-1">
                        {topics.followups.map((q, i) => (
                          <li
                            key={i}
                            className="flex items-start justify-between gap-2 text-sm text-slate-700"
                          >
                            <span>• {q}</span>
                            <CopyButton text={q} label="복사" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 관련 뉴스 */}
                  {topics.news.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        📰 관련 뉴스
                      </p>
                      <ul className="mt-1 space-y-1">
                        {topics.news.map((n, i) => (
                          <li key={i} className="text-xs text-slate-500">
                            <a
                              href={n.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-brand-600 hover:underline"
                            >
                              {n.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {topics.ideas.length === 0 &&
                    topics.followups.length === 0 &&
                    !topicsLoading && (
                      <p className="text-sm text-slate-400">
                        글감을 생성하지 못했어요. 다시 시도해주세요.
                      </p>
                    )}
                </div>
              )}
              <p className="mt-3 text-xs text-slate-400">
                제목을 복사해 &lsquo;초안 생성&rsquo; 탭 메인 키워드에 넣으면 바로
                글을 쓸 수 있어요.
              </p>
            </div>
          )}

          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">키워드</th>
                  <th className="px-3 py-2 text-right font-medium">월 검색량</th>
                  <th className="px-3 py-2 text-right font-medium">문서수</th>
                  <th className="px-3 py-2 font-medium">경쟁지수</th>
                  <th className="px-3 py-2 font-medium">광고경쟁</th>
                  <th className="px-3 py-2 font-medium">글감</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {all.map((r) => (
                  <tr key={r.keyword} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {drillButton(r.keyword, "")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                      {r.totalSearch.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {r.docCount != null
                        ? r.docCount.toLocaleString("ko-KR")
                        : "-"}
                    </td>
                    <td className="px-3 py-2">{ratioBadge(r.ratio)}</td>
                    <td className="px-3 py-2">{compBadge(r.compIdx)}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => showTopics(r)}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        글감
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {note && <p className="mt-3 text-xs text-slate-400">※ {note}</p>}
        </>
      )}
    </section>
  );
}
