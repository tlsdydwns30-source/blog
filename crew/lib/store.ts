// 로컬 JSON 저장소 — 크루의 중간 산출물을 crew/data/<blogId>/ 아래 보관한다.
//
// Supabase 없이도 A~C가 돌아가도록 파일 기반을 기본으로 한다.
// (D직원의 사진 매칭만 Supabase pgvector가 필요.)

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

export const CREW_ROOT = path.join(process.cwd(), "crew");
export const DATA_ROOT = path.join(CREW_ROOT, "data");
export const OUTPUT_ROOT = path.join(CREW_ROOT, "output");

export function blogDir(blogId: string): string {
  return path.join(DATA_ROOT, sanitize(blogId));
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

export function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeText(file: string, text: string): void {
  ensureDir(path.dirname(file));
  writeFileSync(file, text, "utf8");
}

export function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, "_");
}

/** 파일명용 슬러그(한글 허용, 공백/특수문자만 정리) */
export function slug(s: string, max = 40): string {
  return (
    s
      .replace(/\s+/g, "-")
      .replace(/[\/\\?%*:|"<>.]/g, "")
      .slice(0, max) || "post"
  );
}
