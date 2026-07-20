import { NextResponse } from "next/server";
import {
  readNaverAdEnv,
  fetchRelatedKeywords,
  readNaverSearchEnv,
  fetchBlogDocCount,
  type RelKeyword,
} from "@/lib/naver";
import { getLevel } from "@/lib/blogLevel";

// 키워드 추천 API — 네이버 검색광고 데이터 기반
//  - 주제(seed) + 블로그 지수(level) 입력
//  - 지수별 "문서수 상한" 이내의 세부 키워드를 경쟁지수(문서수÷검색량) 낮은 순으로 추천
export const runtime = "nodejs";
export const maxDuration = 60;

// 대형 키워드 컷: 이 이상 검색량은 문서수 조회/추천에서 제외(어차피 저지수 블로그는 못 이김).
const MEGA_SEARCH = 100_000;
// 문서수 조회 상한(네이버 검색 API 호출량 절약). 세부 키워드 우선으로 채운다.
const DOC_LOOKUP_MAX = 40;
// 추천 개수.
const TOP_N = 8;

/** 경쟁정도 순위 (낮을수록 블로거가 상위노출 유리) */
function tierRank(idx: string): number {
  if (idx === "낮음") return 0;
  if (idx === "중간") return 1;
  if (idx === "높음") return 2;
  return 1.5;
}

/**
 * 광고경쟁 점수(문서수 키가 없을 때의 폴백): 경쟁 낮은 것 먼저, 그 안에서 검색량 순.
 */
function score(r: RelKeyword): number {
  return (3 - tierRank(r.compIdx)) * 1_000_000_000 + r.totalSearch;
}

/** 경쟁지수(ratio) 오름차순 정렬. null(문서수 미조회)은 항상 맨 뒤. 동률이면 검색량 큰 순. */
function byRatioAsc<T extends { ratio: number | null; totalSearch: number }>(
  a: T,
  b: T
): number {
  if (a.ratio === null && b.ratio === null) return b.totalSearch - a.totalSearch;
  if (a.ratio === null) return 1;
  if (b.ratio === null) return -1;
  if (a.ratio !== b.ratio) return a.ratio - b.ratio;
  return b.totalSearch - a.totalSearch;
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

  let body: { seed?: string; level?: string };
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
  const level = getLevel(body.level);

  type Row = RelKeyword & {
    score: number;
    docCount: number | null;
    ratio: number | null;
  };

  try {
    const rows = await fetchRelatedKeywords(seed, env);
    const base: Row[] = rows
      .filter((r) => r.keyword && r.totalSearch > 0)
      .map((r) => ({
        ...r,
        score: score(r),
        docCount: null,
        ratio: null,
      }));

    const searchEnv = readNaverSearchEnv();
    let all: Row[];

    if (searchEnv) {
      // 문서수 조회 대상: 최소검색량 이상 & 대형(MEGA) 미만 →
      // 검색량 낮은(=세부/롱테일) 쪽부터 우선 평가해 준최6이 이길 키워드를 발굴.
      const evalPool = base
        .filter(
          (r) => r.totalSearch >= level.minSearch && r.totalSearch < MEGA_SEARCH
        )
        .sort((a, b) => a.totalSearch - b.totalSearch)
        .slice(0, DOC_LOOKUP_MAX);

      // 네이버 검색 API 초당 제한을 피하려 5개씩 나눠 순차 조회.
      for (let i = 0; i < evalPool.length; i += 5) {
        const chunk = evalPool.slice(i, i + 5);
        const part = await Promise.all(
          chunk.map((r) => fetchBlogDocCount(r.keyword, searchEnv))
        );
        chunk.forEach((r, j) => {
          r.docCount = part[j];
          r.ratio =
            r.docCount != null && r.totalSearch > 0
              ? Number((r.docCount / r.totalSearch).toFixed(2))
              : null;
        });
      }

      // 표(all): 평가된 세부 키워드 + 참고용 대형 키워드(문서수 미조회) → 경쟁지수 낮은 순.
      const evaluatedKeys = new Set(evalPool.map((r) => r.keyword));
      const context = base
        .filter((r) => !evaluatedKeys.has(r.keyword))
        .sort((a, b) => b.totalSearch - a.totalSearch)
        .slice(0, 25);
      all = [...evalPool, ...context].sort(byRatioAsc).slice(0, 60);
    } else {
      // 문서수 키가 없으면 표시만: 검색량 상위 50.
      all = [...base].sort((a, b) => b.totalSearch - a.totalSearch).slice(0, 50);
    }

    // ── 추천 Top ─────────────────────────────────────────────
    let top: Row[];
    let relaxed = false;
    if (searchEnv) {
      // 1순위: 문서수 ≤ 지수 상한(=이 블로그가 이길 만한) 세부 키워드를 경쟁지수 낮은 순.
      top = all
        .filter(
          (r) =>
            r.docCount != null &&
            r.docCount > 0 &&
            r.docCount <= level.maxDoc &&
            r.totalSearch >= level.minSearch
        )
        .sort(byRatioAsc)
        .slice(0, TOP_N);

      // 상한 통과가 너무 적으면(3개 미만) 문서수 낮은 순으로 보완.
      if (top.length < 3) {
        relaxed = true;
        const fill = all
          .filter((r) => r.docCount != null && !top.includes(r))
          .sort((a, b) => (a.docCount ?? 0) - (b.docCount ?? 0))
          .slice(0, TOP_N - top.length);
        top = [...top, ...fill];
      }
    } else {
      // 문서수 키 없음 → 광고경쟁도(낮음>중간>높음) 폴백.
      top = [...all]
        .filter((r) => r.totalSearch >= level.minSearch)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_N);
    }

    const cap = level.maxDoc.toLocaleString("ko-KR");
    const note = searchEnv
      ? relaxed
        ? `‘${level.label}’ 기준(문서수 ${cap} 이하)을 만족하는 키워드가 적어, 문서수가 낮은 순으로 보완했습니다. 경쟁지수(문서수÷검색량)는 낮을수록 유리. 상위노출은 네이버 랭킹(비공개) 특성상 참고용 추정입니다.`
        : `‘${level.label}’ 기준: 문서수 ${cap} 이하 세부 키워드를 경쟁지수(문서수÷검색량) 낮은 순으로 추천합니다. 상위 지수를 고르면 더 큰 키워드까지 포함됩니다. 상위노출은 네이버 랭킹(비공개) 특성상 참고용 추정입니다.`
      : "문서수를 조회하려면 NAVER_CLIENT_ID/SECRET 설정이 필요합니다. 지금은 광고경쟁도(낮음>중간>높음) 기준으로만 추천합니다.";

    return NextResponse.json({
      seed,
      level: level.key,
      levelLabel: level.label,
      maxDoc: level.maxDoc,
      top,
      all,
      hasDocCount: !!searchEnv,
      note,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "키워드 조회 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
