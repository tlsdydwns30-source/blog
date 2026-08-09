/**
 * 사진 배치 색인 스크립트
 *
 * 폴더 안 이미지들을 → (EXIF GPS로 지역 자동 태깅) → 캡션 생성(Vision) → 임베딩
 * → Supabase photos 테이블에 저장.
 * 이미 색인된 사진(storage_path 중복)은 건너뜀 → 재실행 안전(idempotent).
 *
 * 실행:
 *   PHOTOS_DIR=/path/to/photos npm run index-photos
 *   또는  npm run index-photos -- /path/to/photos [기본지역명]
 *   (기본지역명은 GPS가 없는 사진의 폴백 지역으로 사용)
 *
 * 필요 환경변수(.env.local):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   VISION_API_KEY / VISION_BASE_URL / VISION_MODEL  (캡션)
 *   EMBED_API_KEY  / EMBED_BASE_URL  / EMBED_MODEL   (임베딩, 1536차원)
 *   NOMINATIM_EMAIL (선택) — 역지오코딩 예의용 연락처(정책 권장)
 *
 * 사전: supabase/schema.sql 을 Supabase 에 적용해둘 것(lat/lng 컬럼 포함).
 *
 * ⚠️ GPS 태깅 주의: 카카오톡 등으로 전송한 사진은 EXIF(GPS)가 제거되는 경우가 많습니다.
 *    원본을 유지한 채(구글포토/드라이브 '원본') 옮겨야 위치가 살아있습니다.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import exifr from "exifr";
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

// ── GPS → 지역 자동 태깅 ────────────────────────────────────────
interface Gps {
  lat: number;
  lng: number;
}

/** 사진 EXIF 에서 GPS 좌표 추출. 없으면 null. */
async function extractGps(file: string): Promise<Gps | null> {
  try {
    const g = await exifr.gps(file);
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude)) {
      return { lat: g.latitude, lng: g.longitude };
    }
  } catch {
    // EXIF 없음/파싱 실패 → GPS 없음으로 처리
  }
  return null;
}

// 근처 좌표는 같은 지역 → 소수 2자리(≈1km)로 캐시해 역지오코딩 호출 최소화.
const geoCache = new Map<string, string | null>();

/** 좌표 → 지명(도시 수준). Nominatim(무료·키 불필요·해외 포함). 실패 시 null. */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (geoCache.has(key)) return geoCache.get(key) ?? null;

  const email = process.env.NOMINATIM_EMAIL || "";
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${lat}&lon=${lng}&accept-language=ko&zoom=12` +
    (email ? `&email=${encodeURIComponent(email)}` : "");

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": `blog-workflow-tool/1.0 photo-indexer${
          email ? ` (${email})` : ""
        }`,
      },
    });
    if (!res.ok) {
      geoCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address ?? {};
    const raw =
      a.city || a.town || a.village || a.county || a.state || a.province || null;
    // "오사카시"/"제주시" → "오사카"/"제주" 로 접미어 정리(필터 일관성).
    const label = raw ? raw.replace(/(시|군|구)$/u, "").trim() || raw : null;
    geoCache.set(key, label);
    // Nominatim 사용 정책: 최대 1req/s.
    await sleep(1100);
    return label;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

async function main() {
  const dir = process.env.PHOTOS_DIR || process.argv[2];
  const fallbackLocation = process.argv[3] || null; // GPS 없을 때 폴백 지역
  if (!dir) {
    console.error("사용법: npm run index-photos -- <사진폴더> [기본지역명]");
    process.exit(1);
  }

  const client = getServiceClient();
  const files = listImages(dir);
  console.log(`이미지 ${files.length}장 발견. 색인 시작...`);

  let done = 0;
  let skipped = 0;
  let failed = 0;
  let geoTagged = 0;

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
      // 1) GPS → 지역 (있으면 자동, 없으면 폴백 지역)
      const gps = await extractGps(file);
      let location = fallbackLocation;
      if (gps) {
        const geo = await reverseGeocode(gps.lat, gps.lng);
        if (geo) {
          location = geo;
          geoTagged++;
        }
      }

      // 2) 캡션 → 임베딩
      const caption = await captionImage(toDataUrl(file));
      const embedding = await embed(caption);

      const { error } = await client.from("photos").insert({
        storage_path: storagePath,
        caption,
        location,
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
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
    `완료. 신규 ${done}(GPS지역 ${geoTagged}) · 건너뜀 ${skipped} · 실패 ${failed} (총 ${files.length})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
