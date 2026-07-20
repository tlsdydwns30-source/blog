// Supabase 서버 클라이언트 헬퍼 (서버 전용, service_role 키 사용)
//
// 주의: SUPABASE_SERVICE_KEY 는 service_role 키로, 절대 클라이언트에 노출 금지.
//       이 파일은 서버 컴포넌트/서버리스 함수에서만 import 해야 한다.
//
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

let cached: SupabaseClient | null = null;

/** service_role 클라이언트 (서버 전용). 미설정 시 예외. */
export function getServiceClient(): SupabaseClient {
  const env = readSupabaseEnv();
  if (!env) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY 미설정");
  if (!cached) {
    cached = createClient(env.url, env.serviceKey, {
      auth: { persistSession: false },
    });
  }
  return cached;
}
