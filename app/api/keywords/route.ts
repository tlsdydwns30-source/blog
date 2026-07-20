import { NextResponse } from "next/server";
import {
  readNaverAdEnv,
  fetchRelatedKeywords,
  readNaverSearchEnv,
  fetchBlogDocCount,
  type RelKeyword,
} from "@/lib/naver";

// 키워드 추천 API — 네이버 검색광고 데이터 기반
//  - 주제(seed) 입력 → 연관 키워드 + 월 검색량 + 경쟁정도
//  - "검색량 많고 경쟁 낮은" 황금 키워드 순으로 Top 5 추천
export const runtime = "nodejs";
export const maxDuration = 30;

// 추천 대상에서 제외할 최소 월 검색량(노이즈 컷).
const MIN_SEARCH_FOR_TOP = 500;

/** 경쟁정도 순위 (낮을수록 블로거가 상위노출 유리) */
function tierRank(idx: string): number {
  if (idx === "낮음") return 0;
  if (idx === "중간") return 1;
  if (idx === "높음") return 2;
  return 1.5;
}

/**
 * 황금 점수: "경쟁 낮은 것 먼저, 그 안에서 검색량 많은 순".
 *  - 경쟁 티어를 큰 자릿수로 분리 → 낮음 > 중간 > 높음 순서 보장
 *  - 같은 티어 안에서는 월 검색량이 큰 순
 * (작은 블로그가 실제로 이길 수 있는 키워드를 우선 추천)
 */
function score(r: RelKeyword): number {
  return (3 - tierRank(r.compIdx)) * 1_000_000_000 + r.totalSearch;
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
    const withScore = rows
      .filter((r) => r.keyword && r.totalSearch > 0)
      .map((r) => ({
        ...r,
        score: score(r),
        docCount: null as number | null,
        ratio: null as number | null,
      }));

    // 표시 대상: 검색량 많은 순 상위 50.
    let all = [...withScore]
      .sort((a, b) => b.totalSearch - a.totalSearch)
      .slice(0, 50);

    // 네이버 검색 API 키가 있으면 문서수 + 경쟁지수(문서수÷검색량) 채우기.
    // (호출량/지연 고려해 검색량 상위 30개만 조회, 나머지는 null)
    const searchEnv = readNaverSearchEnv();
    if (searchEnv) {
      const N = Math.min(all.length, 30);
      const counts = await Promise.all(
        all.slice(0, N).map((r) => fetchBlogDocCount(r.keyword, searchEnv))
      );
      all = all.map((r, i) => {
        const docCount = i < N ? counts[i] : null;
        const ratio =
          docCount != null && r.totalSearch > 0
            ? Number((docCount / r.totalSearch).toFixed(2))
            : null;
        return { ...r, docCount, ratio };
      });
    }

    // Top 추천: 경쟁 낮은 것 우선(황금 점수), 검색량 최소치 이상만.
    const golden = [...all].sort((a, b) => b.score - a.score);
    const eligible = golden.filter((r) => r.totalSearch >= MIN_SEARCH_FOR_TOP);
    const top = (eligible.length > 0 ? eligible : golden).slice(0, 5);

    return NextResponse.json({
      seed,
      top,
      all,
      hasDocCount: !!searchEnv,
      note: searchEnv
        ? "추천 Top은 경쟁 낮은 것 우선. 문서수·경쟁지수(문서수÷검색량)는 낮을수록 유리. 상위노출은 네이버 랭킹(비공개) 특성상 참고용 추정입니다."
        : "추천 Top은 경쟁 낮은 것 우선, 검색량 순. 문서수를 보려면 NAVER_CLIENT_ID/SECRET 설정이 필요합니다.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "키워드 조회 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
