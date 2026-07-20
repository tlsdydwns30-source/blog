"use client";

import { useMemo, useState } from "react";

// 초안(마크다운)을 문단으로 쪼개, 문단별로 어울리는 사진을 추천받는 패널.
//  - 각 문단 텍스트를 /api/match-photos 로 보내 코사인 유사도 상위 N장을 가져온다.
//  - 사진 원본 표시는 NEXT_PUBLIC_PHOTO_BASE_URL 이 있으면 `${base}/${storage_path}` 로,
//    storage_path 가 http(s) 절대경로면 그대로 사용. 둘 다 아니면 캡션 카드만 표시.

interface Photo {
  id: number;
  storage_path: string;
  caption: string | null;
  location: string | null;
  similarity: number;
}

// 마크다운 초안 → 사진 붙일 만한 "문단"들만 추출.
function extractParagraphs(draft: string): string[] {
  return draft
    .split(/\n{2,}/)
    .map((block) =>
      block
        // 소제목 마크다운(#, ##, ###) 표시는 제거하고 텍스트만 남김
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/\n+/g, " ")
        .trim()
    )
    .filter((p) => p.replace(/\s/g, "").length >= 20);
}

function photoUrl(storagePath: string): string | null {
  if (/^https?:\/\//.test(storagePath)) return storagePath;
  const base = process.env.NEXT_PUBLIC_PHOTO_BASE_URL;
  if (base) return `${base.replace(/\/$/, "")}/${storagePath}`;
  return null;
}

export default function PhotoSuggest({ draft }: { draft: string }) {
  const paragraphs = useMemo(() => extractParagraphs(draft), [draft]);

  const [location, setLocation] = useState("");
  const [matchCount, setMatchCount] = useState(3);

  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, Photo[]>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  const suggest = async (idx: number, text: string) => {
    setLoadingIdx(idx);
    setErrors((e) => ({ ...e, [idx]: "" }));
    try {
      const res = await fetch("/api/match-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          matchCount,
          filterLocation: location.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
      setResults((r) => ({ ...r, [idx]: (data.photos ?? []) as Photo[] }));
    } catch (e) {
      setErrors((er) => ({
        ...er,
        [idx]: e instanceof Error ? e.message : "사진 추천 실패",
      }));
    } finally {
      setLoadingIdx(null);
    }
  };

  if (paragraphs.length === 0) return null;

  return (
    <div className="mt-8 border-t border-slate-200 pt-6">
      <h3 className="text-base font-bold text-slate-900">
        🖼 문단별 추천 사진
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        문단마다 “사진 추천”을 누르면, 색인된 사진 중 내용이 가장 가까운 사진을
        찾아줍니다. (Supabase 연결 + 사진 색인이 준비돼 있어야 결과가 나옵니다.)
      </p>

      {/* 옵션 */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600">
            지역 필터 (선택)
          </label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="예: 오사카"
            className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">
            문단당 사진 수
          </label>
          <select
            value={matchCount}
            onChange={(e) => setMatchCount(Number(e.target.value))}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}장
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 문단 목록 */}
      <ol className="mt-4 space-y-4">
        {paragraphs.map((p, idx) => {
          const photos = results[idx];
          const err = errors[idx];
          const isLoading = loadingIdx === idx;
          return (
            <li
              key={idx}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm leading-relaxed text-slate-700">
                  {p.length > 160 ? p.slice(0, 160) + "…" : p}
                </p>
                <button
                  onClick={() => suggest(idx, p)}
                  disabled={isLoading}
                  className="shrink-0 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-40"
                >
                  {isLoading ? "찾는 중…" : "사진 추천"}
                </button>
              </div>

              {err && (
                <p className="mt-3 rounded-md bg-rose-50 p-2 text-xs text-rose-600">
                  {err}
                </p>
              )}

              {photos && photos.length === 0 && (
                <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                  색인된 사진이 없습니다. 사진을 클라우드 폴더에 모은 뒤{" "}
                  <code className="rounded bg-amber-100 px-1">
                    npm run index-photos
                  </code>{" "}
                  로 등록하세요.
                </p>
              )}

              {photos && photos.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {photos.map((ph) => {
                    const url = photoUrl(ph.storage_path);
                    return (
                      <figure
                        key={ph.id}
                        className="overflow-hidden rounded-lg border border-slate-200"
                      >
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={ph.caption ?? ph.storage_path}
                            className="h-28 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-28 w-full items-center justify-center bg-slate-100 px-2 text-center text-[11px] text-slate-400">
                            {ph.storage_path}
                          </div>
                        )}
                        <figcaption className="p-2">
                          <p className="line-clamp-2 text-[11px] text-slate-600">
                            {ph.caption ?? "(캡션 없음)"}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {ph.location ? ph.location + " · " : ""}
                            유사도 {(ph.similarity * 100).toFixed(0)}%
                          </p>
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
