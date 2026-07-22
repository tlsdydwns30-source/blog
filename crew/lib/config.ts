// 크루 설정 로더. crew/config.json 을 읽는다(없으면 config.example.json → 안내).
import path from "path";
import { existsSync, readFileSync } from "fs";
import { CREW_ROOT } from "./store";
import { parseBlogId } from "./naverBlog";

export interface CrewConfig {
  /** 분석 대상 블로그 URL 또는 아이디 (A직원) */
  blog: string;
  /** 분야 라벨 (여행/맛집 등) — 키워드·글감 힌트 */
  category: string;
  /** 사진 지역 필터(선택). 예: "오사카". 없으면 전체에서 매칭 */
  location: string | null;
  /** B직원이 뽑을 주제 개수 (기본 5) */
  topicCount: number;
  /** 본문까지 수집·분석할 최대 글 수 (요청 절약용, 기본 120) */
  bodySampleLimit: number;
  /** C직원이 참고로 짜깁을 과거 글 수 (기본 4) */
  weaveCount: number;
}

const DEFAULTS: Omit<CrewConfig, "blog"> = {
  category: "여행",
  location: null,
  topicCount: 5,
  bodySampleLimit: 120,
  weaveCount: 4,
};

export function loadConfig(): CrewConfig {
  const file = path.join(CREW_ROOT, "config.json");
  if (!existsSync(file)) {
    throw new Error(
      "crew/config.json 이 없습니다. crew/config.example.json 을 복사해 blog(내 블로그 URL)만 채우세요:\n" +
        "  cp crew/config.example.json crew/config.json"
    );
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<CrewConfig>;
  if (!raw.blog || !parseBlogId(raw.blog)) {
    throw new Error("config.json 의 blog 값(네이버 블로그 URL/아이디)이 유효하지 않습니다.");
  }
  return { ...DEFAULTS, ...raw, blog: raw.blog } as CrewConfig;
}

export function blogIdOf(cfg: CrewConfig): string {
  const id = parseBlogId(cfg.blog);
  if (!id) throw new Error("blog 값에서 블로그 아이디를 추출하지 못했습니다.");
  return id;
}
