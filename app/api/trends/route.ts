import { NextResponse } from "next/server";
import { fetchGoogleTrendsKR } from "@/lib/trends";

// 오늘의 급상승 검색어 (구글 트렌드, 한국) — 키 불필요
export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET() {
  try {
    const trends = await fetchGoogleTrendsKR();
    return NextResponse.json({ trends });
  } catch (e) {
    const message = e instanceof Error ? e.message : "트렌드 조회 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
