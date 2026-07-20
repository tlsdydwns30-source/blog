// Supabase 서버 클라이언트 헬퍼 (서버 전용, service_role 키 사용)
//
// 주의: SUPABASE_SERVICE_KEY 는 service_role 키로, 절대 클라이언트에 노출 금지.
//       이 파일은 서버 컴포넌트/서버리스 함수에서만 import 해야 한다.
//
// @supabase/supabase-js 는 아직 package.json 의존성에 없다(스캐폴드 단계).
// Supabase 기능을 실제로 켤 때 아래를 실행:
//   npm i @supabase/supabase-js
// 그리고 이 파일의 createClient 주석을 해제한다.

export interface SupabaseEnv {
  url: string;
  serviceKey: string;
}

export function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

// 실제 활성화 시 사용할 클라이언트 팩토리 (의존성 설치 후 주석 해제):
//
// import { createClient, SupabaseClient } from "@supabase/supabase-js";
//
// let cached: SupabaseClient | null = null;
// export function getServiceClient(): SupabaseClient {
//   const env = readSupabaseEnv();
//   if (!env) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY 미설정");
//   if (!cached) {
//     cached = createClient(env.url, env.serviceKey, {
//       auth: { persistSession: false },
//     });
//   }
//   return cached;
// }
