"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";

const TONES = ["친근한 반말", "정중한 존댓말", "정보전달 위주", "감성 에세이"];

export default function DraftGenerator() {
  const [mainKeyword, setMainKeyword] = useState("");
  const [subKeywords, setSubKeywords] = useState("");
  const [material, setMaterial] = useState("");
  const [tone, setTone] = useState(TONES[1]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const generate = async () => {
    setLoading(true);
    setError(null);
    setDraft("");
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainKeyword,
          subKeywords: subKeywords
            .split(/[,\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          material,
          tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
      setDraft(data.draft ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900">초안 생성</h2>
      <p className="mt-1 text-sm text-slate-500">
        메인 키워드·자료·문체를 입력하면 첫인사 → 목차 → 본문 → 마무리 구조의
        약 2,000자 초안을 만듭니다. (서버에 LLM API 키 필요)
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            메인 키워드 *
          </label>
          <input
            value={mainKeyword}
            onChange={(e) => setMainKeyword(e.target.value)}
            placeholder="예: 오사카 유니버설 입장권"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            문체
          </label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            {TONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-slate-700">
          서브 키워드 (쉼표 또는 줄바꿈 구분)
        </label>
        <input
          value={subKeywords}
          onChange={(e) => setSubKeywords(e.target.value)}
          placeholder="예: 오사카 여행, 유니버설 익스프레스, 오사카 자유여행"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-slate-700">
          자료 / 메모 (경험·팁·가격 등)
        </label>
        <textarea
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          rows={5}
          placeholder="글에 반영할 사실·경험·수치를 자유롭게 적어주세요."
          className="mt-1 w-full resize-y rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div className="mt-4">
        <button
          onClick={generate}
          disabled={loading || !mainKeyword.trim()}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "생성 중..." : "초안 생성"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
          {error}
        </p>
      )}

      {draft && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">
              생성된 초안 ({draft.length.toLocaleString("ko-KR")}자)
            </label>
            <CopyButton text={draft} />
          </div>
          <div className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
            {draft}
          </div>
        </div>
      )}
    </section>
  );
}
