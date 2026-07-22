// ─────────────────────────────────────────────────────────────
// D직원 — "내가 가진 사진(약 1만장) 중 맞는 사진을 붙인다."
//
//   초안의 [사진: 설명] 슬롯마다 → 설명을 임베딩 → Supabase match_photos RPC로
//   유사 사진 상위 N개 추천. 사진 색인(scripts/index-photos)이 선행돼야 한다.
//   Supabase/사진이 아직 없으면 매칭은 건너뛰고 '채울 슬롯' 목록만 남긴다.
//
// 실행: npm run crew:d   (가장 최근 초안 대상)
// ─────────────────────────────────────────────────────────────

import path from "path";
import { readdirSync } from "fs";
import { loadConfig, blogIdOf } from "./lib/config";
import { blogDir, readJson, writeJson } from "./lib/store";
import type { Draft } from "./c-write";
import { readSupabaseEnv, getServiceClient } from "../lib/supabase";
import { embed } from "../lib/embed";

export interface PhotoMatch {
  slot: string; // 사진 슬롯 설명(쿼리)
  candidates: {
    id: number;
    storage_path: string;
    caption: string | null;
    location: string | null;
    similarity: number;
  }[];
}

export interface PhotoPlan {
  ready: boolean; // Supabase 사진 매칭이 실제로 됐는지
  matches: PhotoMatch[];
  note?: string;
}

function latestDraftPath(dir: string): string | null {
  const d = path.join(dir, "drafts");
  try {
    const files = readdirSync(d)
      .filter((f) => f.endsWith(".json"))
      .sort();
    return files.length ? path.join(d, files[files.length - 1]) : null;
  } catch {
    return null;
  }
}

export async function runPhotos(draft?: Draft): Promise<PhotoPlan> {
  const cfg = loadConfig();
  const blogId = blogIdOf(cfg);
  const dir = blogDir(blogId);

  let d = draft;
  if (!d) {
    const p = latestDraftPath(dir);
    if (!p) throw new Error("초안이 없습니다. 먼저 C직원(npm run crew:c)을 돌리세요.");
    d = readJson<Draft>(p, null as unknown as Draft);
  }
  const queries = d.photoQueries ?? [];
  console.log(`[D직원] 사진 슬롯 ${queries.length}개 매칭 시도.`);

  const env = readSupabaseEnv();
  if (!env) {
    const plan: PhotoPlan = {
      ready: false,
      note:
        "Supabase 미설정 — 사진 매칭 건너뜀. 아래 슬롯 설명에 맞는 사진을 직접 넣으세요. " +
        "(사진 색인: scripts/index-photos 실행 후 자동 매칭됨)",
      matches: queries.map((slot) => ({ slot, candidates: [] })),
    };
    writeJson(path.join(dir, "photo-plan.json"), plan);
    console.log("  " + plan.note);
    return plan;
  }

  const client = getServiceClient();
  const matches: PhotoMatch[] = [];
  for (const slot of queries) {
    try {
      const queryEmbedding = await embed(slot);
      const { data, error } = await client.rpc("match_photos", {
        query_embedding: queryEmbedding,
        match_count: 3,
        filter_location: cfg.location,
      });
      if (error) throw new Error(error.message);
      matches.push({ slot, candidates: (data ?? []) as PhotoMatch["candidates"] });
      console.log(`  [사진: ${slot}] → 후보 ${(data ?? []).length}장`);
    } catch (e) {
      console.warn(`  슬롯 매칭 실패("${slot}"): ${(e as Error).message}`);
      matches.push({ slot, candidates: [] });
    }
  }

  const plan: PhotoPlan = { ready: true, matches };
  writeJson(path.join(dir, "photo-plan.json"), plan);
  console.log(`[D직원] 완료 → photo-plan.json`);
  return plan;
}

if (require.main === module) {
  runPhotos().catch((e) => {
    console.error("[D직원] 실패:", e.message);
    process.exit(1);
  });
}
