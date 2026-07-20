import { NextResponse } from "next/server";
import {
  readNaverAdEnv,
  fetchRelatedKeywords,
  type RelKeyword,
} from "@/lib/naver";

// 분야별 인기 키워드 Top10 — 분야 씨앗 키워드의 연관어를 네이버 검색량으로 랭킹
export const runtime = "nodejs";
export const maxDuration = 30;

// 분야 → 씨앗 키워드 (수정 쉽게 이 표만 고치면 됨)
export const CATEGORY_SEEDS: Record<string, string[]> = {
  여행: ["여행", "국내여행", "해외여행"],
  경제: ["주식", "부동산", "재테크"],
  IT: ["아이폰", "챗gpt", "노트북추천"],
  맛집: ["맛집", "서울맛집", "카페"],
  뷰티: ["화장품", "스킨케어", "다이어트"],
  건강: ["건강", "영양제", "홈트레이닝"],
  육아: ["육아", "이유식", "유아교육"],
};

export const CATEGORIES = Object.keys(CATEGORY_SEEDS);

export async function POST(request: Request) {
  const env = readNaverAdEnv();
  if (!env) {
    return NextResponse.json(
      { error: "네이버 검색광고 API 키 미설정." },
      { status: 503 }
    );
  }

  let body: { category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패." }, { status: 400 });
  }

  const category = (body.category ?? "").trim();
  const seeds = CATEGORY_SEEDS[category];
  if (!seeds) {
    return NextResponse.json(
      { error: `지원하지 않는 분야입니다. (${CATEGORIES.join(", ")})` },
      { status: 400 }
    );
  }

  try {
    const lists = await Promise.all(
      seeds.map((s) => fetchRelatedKeywords(s, env).catch(() => [] as RelKeyword[]))
    );
    // 키워드 중복 제거(가장 큰 검색량으로) 후 검색량 순 Top 10
    const map = new Map<string, RelKeyword>();
    for (const list of lists) {
      for (const r of list) {
        if (!r.keyword || r.totalSearch <= 0) continue;
        const cur = map.get(r.keyword);
        if (!cur || r.totalSearch > cur.totalSearch) map.set(r.keyword, r);
      }
    }
    const keywords = [...map.values()]
      .sort((a, b) => b.totalSearch - a.totalSearch)
      .slice(0, 10);

    return NextResponse.json({ category, keywords });
  } catch (e) {
    const message = e instanceof Error ? e.message : "조회 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
