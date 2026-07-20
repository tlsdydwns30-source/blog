"use client";

import { useMemo, useState } from "react";
import { findLowest, formatKRW, toMarkdown, type PriceEntry } from "@/lib/price";
import CopyButton from "@/components/CopyButton";

const DEFAULT_SITES = ["클룩", "마이리얼트립", "케이케이데이"];

interface Row {
  site: string;
  price: string; // 입력은 문자열로 보관
  url: string;
}

function toEntries(rows: Row[]): PriceEntry[] {
  return rows
    .filter((r) => r.site.trim())
    .map((r) => {
      const n = Number(r.price.replace(/[^0-9.]/g, ""));
      return {
        site: r.site.trim(),
        price: r.price.trim() && Number.isFinite(n) && n > 0 ? n : null,
        url: r.url.trim() || undefined,
      };
    });
}

export default function PriceCompare() {
  const [product, setProduct] = useState("");
  const [rows, setRows] = useState<Row[]>(
    DEFAULT_SITES.map((site) => ({ site, price: "", url: "" }))
  );

  const entries = useMemo(() => toEntries(rows), [rows]);
  const lowest = useMemo(() => findLowest(entries), [entries]);
  const markdown = useMemo(
    () => toMarkdown({ product, entries }),
    [product, entries]
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((rs) => [...rs, { site: "", price: "", url: "" }]);

  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900">가격비교표</h2>
      <p className="mt-1 text-sm text-slate-500">
        사이트별 가격을 입력하면 최저가를 판별하고, 블로그에 붙여넣을 마크다운을
        생성합니다.
      </p>

      <div className="mt-4">
        <label className="block text-sm font-medium text-slate-700">
          상품명
        </label>
        <input
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="예: 오사카 유니버설 스튜디오 입장권"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((r, i) => {
          const isLowest =
            lowest &&
            r.site.trim() === lowest.site &&
            Number(r.price.replace(/[^0-9.]/g, "")) === lowest.price;
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={r.site}
                onChange={(e) => update(i, { site: e.target.value })}
                placeholder="판매처"
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <input
                value={r.price}
                onChange={(e) => update(i, { price: e.target.value })}
                placeholder="가격(원)"
                inputMode="numeric"
                className={
                  "w-32 rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand-500 " +
                  (isLowest ? "border-brand-500 bg-brand-50" : "border-slate-300")
                }
              />
              <input
                value={r.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="제휴 링크 (선택)"
                className="min-w-40 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              {isLowest && (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                  최저가
                </span>
              )}
              <button
                onClick={() => removeRow(i)}
                className="px-2 text-slate-400 hover:text-rose-500"
                aria-label="행 삭제"
              >
                ✕
              </button>
            </div>
          );
        })}
        <button
          onClick={addRow}
          className="text-sm text-brand-600 hover:underline"
        >
          + 사이트 추가
        </button>
      </div>

      {lowest && (
        <div className="mt-5 rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
          💰 최저가는 <b>{lowest.site}</b>에서{" "}
          <b>{formatKRW(lowest.price)}</b>
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700">
            마크다운 (블로그 붙여넣기용)
          </label>
          <CopyButton text={markdown} />
        </div>
        <pre className="mt-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {markdown}
        </pre>
      </div>
    </section>
  );
}
