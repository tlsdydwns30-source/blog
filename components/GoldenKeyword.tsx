"use client";

import { useMemo, useState } from "react";
import {
  parseKeywordMaster,
  sortByRatio,
  grade,
  formatRatio,
  type Grade,
} from "@/lib/keyword";

const SAMPLE = `키워드\t검색량\t문서수
오사카 자유여행\t74,000\t53,200
오사카 유니버설 입장권\t18,000\t1,240
교토 기모노 대여\t9,900\t610
오사카 3박4일 코스\t5,400\t210`;

const GRADE_STYLE: Record<Grade, { label: string; cls: string }> = {
  golden: { label: "황금", cls: "bg-amber-100 text-amber-700" },
  good: { label: "좋음", cls: "bg-brand-100 text-brand-700" },
  normal: { label: "보통", cls: "bg-slate-100 text-slate-600" },
  hard: { label: "경쟁↑", cls: "bg-rose-100 text-rose-700" },
  unknown: { label: "-", cls: "bg-slate-100 text-slate-400" },
};

export default function GoldenKeyword() {
  const [raw, setRaw] = useState("");

  const rows = useMemo(() => sortByRatio(parseKeywordMaster(raw)), [raw]);

  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900">골든키워드 분석</h2>
      <p className="mt-1 text-sm text-slate-500">
        키워드마스터 표를 복사해 그대로 붙여넣으세요. 경쟁지수(문서수÷검색량)를
        계산해 낮은 순으로 정렬합니다.
      </p>

      <div className="mt-4">
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"키워드마스터 표를 여기에 붙여넣기...\n(탭 또는 공백으로 구분된 3개 컬럼: 키워드 / 검색량 / 문서수)"}
          rows={7}
          className="w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <div className="mt-2 flex items-center gap-3 text-sm">
          <button
            onClick={() => setRaw(SAMPLE)}
            className="text-brand-600 hover:underline"
          >
            샘플 채우기
          </button>
          {raw && (
            <button
              onClick={() => setRaw("")}
              className="text-slate-400 hover:underline"
            >
              지우기
            </button>
          )}
          <span className="ml-auto text-slate-400">{rows.length}개 인식됨</span>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">키워드</th>
                <th className="px-3 py-2 text-right font-medium">검색량</th>
                <th className="px-3 py-2 text-right font-medium">문서수</th>
                <th className="px-3 py-2 text-right font-medium">경쟁지수</th>
                <th className="px-3 py-2 font-medium">등급</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => {
                const g = grade(r.ratio);
                const style = GRADE_STYLE[g];
                return (
                  <tr key={`${r.keyword}-${i}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {r.keyword}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {r.searchVol.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {r.docCount.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                      {formatRatio(r.ratio)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium " +
                          style.cls
                        }
                      >
                        {style.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {raw && rows.length === 0 && (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
          인식된 행이 없습니다. 각 행이 <b>키워드 · 검색량 · 문서수</b> 3개
          컬럼(탭 또는 2칸 이상 공백 구분)인지 확인하세요.
        </p>
      )}
    </section>
  );
}
