import { NextResponse } from "next/server";
import { readSupabaseEnv, getServiceClient } from "@/lib/supabase";
import { embed } from "@/lib/embed";

// 글 문단 ↔ 사진 벡터 매칭
//  - 문단 텍스트를 임베딩 → Supabase RPC match_photos 로 유사 사진 상위 N개
//  - 사전 준비: supabase/schema.sql 적용 + scripts/index-photos 로 사진 색인
export const runtime = "nodejs";
export const maxDuration = 30;

interface MatchRequest {
  text?: string;
  matchCount?: number;
  filterLocation?: string | null;
}

export async function POST(request: Request) {
  const env = readSupabaseEnv();
  if (!env) {
    return NextResponse.json(
      { error: "Supabase 미설정. SUPABASE_URL / SUPABASE_SERVICE_KEY 필요." },
      { status: 503 }
    );
  }

  let body: MatchRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패." }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json(
      { error: "text(문단) 필드는 필수입니다." },
      { status: 400 }
    );
  }

  try {
    const queryEmbedding = await embed(text);
    const client = getServiceClient();
    const { data, error } = await client.rpc("match_photos", {
      query_embedding: queryEmbedding,
      match_count: body.matchCount ?? 3,
      filter_location: body.filterLocation ?? null,
    });
    if (error) {
      return NextResponse.json(
        { error: `match_photos RPC 오류: ${error.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ photos: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "사진 매칭 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
