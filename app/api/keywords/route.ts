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

/** 경쟁정도를 가중치로 (낮을수록 유리). 경쟁 낮은 키워드를 강하게 우대. */
function compWeight(idx: string): number {
  if (idx === "낮음") return 1;
  if (idx === "중간") return 0.3;
  if (idx === "높음") return 0.1;
  return 0.5;
}

// 추천 대상에서 제외할 최소 월 검색량(노이즈 컷). 이보다 적으면 Top 추천 제외.
const MIN_SEARCH_FOR_TOP = 500;

/**
 * 추천 점수 = 월 검색량 × 경쟁 가중치.
 *  - 검색량을 그대로(선형) 반영해 "검색 거의 없는" 키워드가 올라오지 않게 함.
 *  - 경쟁 낮음은 크게, 높음은 작게 → "검색 많고 경쟁 낮은" 황금 키워드가 상위.
 */
function score(r: RelKeyword): number {
  return Math.round(r.totalSearch * compWeight(r.compIdx));
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
      .map((r) => ({ ...r, score: score(r) }))
      .sort((a, b) => b.score - a.score);

    // Top 추천: 검색량이 너무 적은 키워드는 제외(쓸모 없는 추천 방지)
    const top = scored
      .filter((r) => r.totalSearch >= MIN_SEARCH_FOR_TOP)
      .slice(0, 5);

    return NextResponse.json({
      seed,
      top: top.length > 0 ? top : scored.slice(0, 5),
      all: scored.slice(0, 50),
      note: "검색량↑·경쟁↓ 순 추천. 상위노출은 네이버 랭킹(비공개) 특성상 보장이 아닌 참고용 추정입니다.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "키워드 조회 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
