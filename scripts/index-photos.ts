/**
 * [스캐폴드] 사진 배치 색인 스크립트
 *
 * 목적: 수만 장 사진에 대해 (1) 캡션 생성 → (2) 캡션 임베딩 → (3) photos 테이블 저장.
 *
 * 실행(활성화 후):
 *   npm i @supabase/supabase-js
 *   npm run index-photos
 *
 * 필요 환경변수(.env.local):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   OPENAI_API_KEY            (캡션 생성 + 임베딩. 또는 COHERE_API_KEY)
 *
 * 비용 절감:
 *   - 수만 장은 반드시 배치로. 임베딩은 Batch API 사용 시 비용 대폭 절감.
 *   - 이미 색인된 storage_path 는 건너뛰어 재실행 안전(idempotent)하게 만들 것.
 *
 * 차원 주의:
 *   - vector(1536) = OpenAI text-embedding-3-small. 모델 바꾸면 schema.sql 도 함께 수정.
 */

const EMBED_DIM = 1536;

interface PhotoJob {
  storagePath: string;
  location?: string;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다.");
    process.exit(1);
  }

  // TODO(활성화 순서):
  // 1) Supabase Storage 버킷에서 사진 목록 나열 → PhotoJob[] 구성
  //    (이미 photos 에 있는 storage_path 제외 → 재실행 안전)
  // 2) 배치 단위로 각 사진 캡션 생성 (Vision 모델). 지역(location) 메타 함께.
  // 3) 캡션을 임베딩 (가능하면 Batch API). 차원 = EMBED_DIM 확인.
  // 4) photos upsert (storage_path unique).
  //
  //   const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  //   const jobs = await listUnindexedPhotos(client);
  //   for (const batch of chunk(jobs, 100)) { ...캡션→임베딩→upsert... }

  console.log(
    `[index-photos] 스캐폴드 상태입니다. 임베딩 차원=${EMBED_DIM}. ` +
      `@supabase/supabase-js 설치 + TODO 구현 후 사용하세요.`
  );
  void ({} as PhotoJob); // 타입 참조 유지 (미사용 경고 방지)
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
