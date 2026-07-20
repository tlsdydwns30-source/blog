import { NextResponse } from "next/server";
import {
  readNaverAdEnv,
  fetchRelatedKeywords,
  type RelKeyword,
} from "@/lib/naver";

// 키워드 추천 API — 네이버 검색광고 데이터 기반
//  - 주제(seed) 입력 → 연관 키워드 + 월 검색량 + 경쟁정도
//  - "검색량 많고 경쟁 낮은" 황금 키워드 순으로 Top 5 추천
export const runtime = "nodejs";
export const maxDuration = 30;

/** 경쟁정도를 가중치로 (낮을수록 유리) */
function compWeight(idx: string): number {
  if (idx === "낮음") return 1;
  if (idx === "중간") return 0.5;
  if (idx === "높음") return 0.2;
  return 0.4;
}

/** 추천 점수: 검색량(로그 스케일) × 경쟁 가중치 */
function score(r: RelKeyword): number {
  return Math.log10(r.totalSearch + 1) * compWeight(r.compIdx);
}

export async function POST(request: Request) {
  const env = readNaverAdEnv();
  if (!env) {
    return NextResponse.json(
      {
        error:
          "네이버 검색광고 API 키가 설정되지 않았습니다. Vercel 환경변수(NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID)를 확인하세요.",
      },
      { status: 503 }
    );
  }

  let body: { seed?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패." }, { status: 400 });
  }

  const seed = (body.seed ?? "").trim();
  if (!seed) {
    return NextResponse.json(
      { error: "주제(seed) 키워드가 필요합니다. 예: 여행" },
      { status: 400 }
    );
  }

  try {
    const rows = await fetchRelatedKeywords(seed, env);
    const scored = rows
      .filter((r) => r.keyword && r.totalSearch > 0)
      .map((r) => ({ ...r, score: Number(score(r).toFixed(3)) }))
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      seed,
      top: scored.slice(0, 5),
      all: scored.slice(0, 50),
      note: "검색량↑·경쟁↓ 순 추천. 상위노출은 네이버 랭킹(비공개) 특성상 보장이 아닌 참고용 추정입니다.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "키워드 조회 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
