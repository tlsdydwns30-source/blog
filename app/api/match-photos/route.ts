import { NextResponse } from "next/server";
import { readSupabaseEnv } from "@/lib/supabase";

// [스캐폴드 — 미배포]
// 글 문단 ↔ 사진 벡터 검색.
//
// 흐름(설계):
//   1) 요청으로 받은 문단 텍스트를 임베딩 API로 벡터화 (OpenAI text-embedding-3-small = 1536차원)
//   2) Supabase RPC match_photos(query_embedding, match_count, filter_location) 호출
//      → pgvector 코사인 유사도 상위 N개 사진 반환
//   3) storage_path → 공개 URL 로 변환해 응답
//
// 활성화 전제:
//   - Supabase 프로젝트 + supabase/schema.sql 적용 (photos 테이블, match_photos RPC)
//   - scripts/index-photos.ts 로 사진 라이브러리 사전 색인
//   - OPENAI_API_KEY (또는 COHERE_API_KEY) 설정
//   - vector(1536) 차원을 사용 임베딩 모델과 일치시킬 것

export const runtime = "nodejs";

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
  if (!body.text || !body.text.trim()) {
    return NextResponse.json(
      { error: "text(문단) 필드는 필수입니다." },
      { status: 400 }
    );
  }

  // TODO(활성화):
  //   const embedding = await embed(body.text);
  //   const client = getServiceClient();
  //   const { data, error } = await client.rpc("match_photos", {
  //     query_embedding: embedding,
  //     match_count: body.matchCount ?? 3,
  //     filter_location: body.filterLocation ?? null,
  //   });
  //   ...storage 공개 URL 매핑 후 반환
  return NextResponse.json(
    { error: "아직 구현되지 않음(스캐폴드). README 다음 단계 참고." },
    { status: 501 }
  );
}
