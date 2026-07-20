/**
 * 사진 배치 색인 스크립트
 *
 * 폴더 안 이미지들을 → 캡션 생성(Vision) → 임베딩 → Supabase photos 테이블에 저장.
 * 이미 색인된 사진(storage_path 중복)은 건너뜀 → 재실행 안전(idempotent).
 *
 * 실행:
 *   PHOTOS_DIR=/path/to/photos npm run index-photos
 *   또는  npm run index-photos -- /path/to/photos [지역명]
 *
 * 필요 환경변수(.env.local):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   VISION_API_KEY / VISION_BASE_URL / VISION_MODEL  (캡션)
 *   EMBED_API_KEY  / EMBED_BASE_URL  / EMBED_MODEL   (임베딩, 1536차원)
 *
 * 사전: supabase/schema.sql 을 Supabase 에 적용해둘 것.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { getServiceClient } from "../lib/supabase";
import { captionImage } from "../lib/vision";
import { embed } from "../lib/embed";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function listImages(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listImages(full));
    else if (IMAGE_EXT.has(path.extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

function toDataUrl(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] ?? "image/jpeg";
  const b64 = readFileSync(file).toString("base64");
  return `data:${mime};base64,${b64}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dir = process.env.PHOTOS_DIR || process.argv[2];
  const location = process.argv[3] || null;
  if (!dir) {
    console.error("사용법: npm run index-photos -- <사진폴더> [지역명]");
    process.exit(1);
  }

  const client = getServiceClient();
  const files = listImages(dir);
  console.log(`이미지 ${files.length}장 발견. 색인 시작...`);

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const storagePath = path.relative(dir, file) || path.basename(file);

    // 이미 색인됐는지 확인
    const { data: exists } = await client
      .from("photos")
      .select("id")
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (exists) {
      skipped++;
      continue;
    }

    try {
      const caption = await captionImage(toDataUrl(file));
      const embedding = await embed(caption);
      const { error } = await client.from("photos").insert({
        storage_path: storagePath,
        caption,
        location,
        embedding,
      });
      if (error) throw new Error(error.message);
      done++;
      if (done % 20 === 0) console.log(`  ...${done}장 완료`);
      // 무료 티어 rate limit 여유
      await sleep(400);
    } catch (e) {
      failed++;
      console.warn(`  실패: ${storagePath} — ${(e as Error).message}`);
      await sleep(1000);
    }
  }

  console.log(
    `완료. 신규 ${done} · 건너뜀 ${skipped} · 실패 ${failed} (총 ${files.length})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
