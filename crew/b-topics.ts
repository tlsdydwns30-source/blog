// ─────────────────────────────────────────────────────────────
// B직원 — "이 시기에 맞는 글 주제 5개를 찾는다."
//
//   근거 = ① 내 블로그가 예년 이맘때 쓴 글(by-month) + ② 네이버 연관키워드
//          (경쟁 낮은 롱테일 우선) + ③ 관련 뉴스 신호 → LLM으로 5개 종합.
//   LLM 키가 없으면 과거 시즌 키워드 기반 휴리스틱으로 대체(품질은 낮음).
//
// 실행: npm run crew:b
// ─────────────────────────────────────────────────────────────

import path from "path";
import { loadConfig, blogIdOf } from "./lib/config";
import { blogDir, readJson, writeJson } from "./lib/store";
import { seasonNow, targetMonths } from "./lib/season";
import type { StoredPost, MonthSummary } from "./a-analyze";
import { chat, isConfigured } from "../lib/llm";
import {
  readNaverAdEnv,
  fetchRelatedKeywords,
  readNaverSearchEnv,
  fetchNaverNews,
  type RelKeyword,
} from "../lib/naver";

export interface TopicIdea {
  title: string; // 블로그 글 제목 후보
  targetKeyword: string; // 노리는 검색 키워드
  angle: string; // 차별화 각도(롱테일/경험)
  why: string; // 지금 이 시기에 왜 맞는지
  basedOn: string[]; // 짜깁기에 쓸 과거 글 logNo
}

function parseJsonArray(text: string): unknown[] {
  let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("[");
  const b = s.lastIndexOf("]");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function runTopics(): Promise<TopicIdea[]> {
  const cfg = loadConfig();
  const blogId = blogIdOf(cfg);
  const dir = blogDir(blogId);

  const analysis = readJson<{ months: MonthSummary[] } | null>(
    path.join(dir, "analysis.json"),
    null
  );
  const byMonth = readJson<Record<number, StoredPost[]>>(
    path.join(dir, "by-month.json"),
    {} as Record<number, StoredPost[]>
  );
  if (!analysis) {
    throw new Error("먼저 A직원(npm run crew:a)을 돌려 분석 데이터를 만드세요.");
  }

  const now = seasonNow();
  const months = targetMonths(now);
  console.log(
    `[B직원] 기준 시기: ${now.year}년 ${now.monthLabel}(${now.seasonLabel}) · 대상 월 ${months.join(
      ", "
    )}월`
  );

  // ① 내 블로그의 예년 이맘때 글
  const seasonPosts: StoredPost[] = [];
  const seasonWords = new Set<string>();
  for (const m of months) {
    const ms = analysis.months.find((x) => x.month === m);
    ms?.topWords.forEach((w) => seasonWords.add(w.word));
    (byMonth[m] ?? []).forEach((p) => seasonPosts.push(p));
  }
  const pastTitles = seasonPosts.slice(0, 30).map((p) => `- (${p.date ?? "?"}) ${p.title} [${p.logNo}]`);

  // ② 네이버 연관키워드 (경쟁 낮은 순) — 키 있으면
  let relLines = "(네이버 검색광고 키 미설정 — 키워드 신호 없음)";
  const adEnv = readNaverAdEnv();
  if (adEnv) {
    try {
      const seed = seasonWords.size
        ? [...seasonWords][0]
        : cfg.category;
      const rel = await fetchRelatedKeywords(seed, adEnv);
      const low = rel
        .filter((r: RelKeyword) => r.totalSearch >= 100)
        .sort((a, b) => rankComp(a.compIdx) - rankComp(b.compIdx) || b.totalSearch - a.totalSearch)
        .slice(0, 15);
      relLines = low
        .map((r) => `- ${r.keyword} (월${r.totalSearch}, 경쟁 ${r.compIdx})`)
        .join("\n");
    } catch (e) {
      relLines = `(연관키워드 조회 실패: ${(e as Error).message.slice(0, 80)})`;
    }
  }

  // ③ 관련 뉴스 — 키 있으면
  let newsLines = "";
  const searchEnv = readNaverSearchEnv();
  if (searchEnv && seasonWords.size) {
    try {
      const news = await fetchNaverNews([...seasonWords][0], searchEnv, 3);
      newsLines = news.map((n) => `- ${n.title}`).join("\n");
    } catch {
      /* 무시 */
    }
  }

  // ── LLM 종합 ──
  let ideas: TopicIdea[] = [];
  if (isConfigured()) {
    const system =
      "당신은 네이버 블로그 상위노출·시즌 키워드 선점 전략가입니다. " +
      "블로거 본인이 실제로 다녀오거나 경험한 것을 바탕으로 쓸 수 있는, " +
      "지금 시기에 검색이 오를 주제를 제안합니다. 상위 10개를 그대로 베끼지 말고 " +
      "아무도 깊게 안 다룬 롱테일 각도를 우선합니다.";
    const user = [
      `[블로그 분야] ${cfg.category}`,
      `[기준 시기] ${now.year}년 ${now.monthLabel} (${now.seasonLabel}), 대상 월 ${months.join(", ")}월`,
      ``,
      `[이 블로그가 예년 이맘때 쓴 글]`,
      pastTitles.length ? pastTitles.join("\n") : "(해당 월 과거 글 없음)",
      ``,
      `[네이버 연관 키워드 — 경쟁 낮은 순]`,
      relLines,
      newsLines ? `\n[관련 뉴스 신호]\n${newsLines}` : "",
      ``,
      `[요구]`,
      `${cfg.topicCount}개의 블로그 글 주제를 제안하라. 각 주제는 이 블로그의 과거 글을 짜깁기해 새로 쓸 수 있어야 한다.`,
      `반드시 아래 JSON 배열 형식으로만 답하라. 마크다운·설명·서문 금지.`,
      `[{"title":"제목","targetKeyword":"핵심키워드","angle":"차별화 각도","why":"지금 시기에 맞는 이유","basedOn":["활용할 과거 글 logNo 0~3개"]}]`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const out = await chat({ system, user, maxTokens: 1500, temperature: 0.8 });
      ideas = parseJsonArray(out)
        .map((x) => normalizeIdea(x))
        .filter((x): x is TopicIdea => !!x)
        .slice(0, cfg.topicCount);
    } catch (e) {
      console.warn("[B직원] LLM 실패, 휴리스틱으로 대체:", (e as Error).message);
    }
  } else {
    console.warn("[B직원] LLM 키 미설정 — 과거 시즌 키워드 기반 휴리스틱 사용.");
  }

  // 폴백: 과거 시즌 글 제목/키워드로 간단 생성
  if (ideas.length === 0) {
    const words = [...seasonWords].slice(0, cfg.topicCount);
    ideas = words.map((w) => ({
      title: `${now.monthLabel} ${w} 총정리`,
      targetKeyword: w,
      angle: "예년 이맘때 내가 쓴 글 재구성",
      why: `${now.monthLabel} 시즌 검색 수요`,
      basedOn: seasonPosts.filter((p) => p.title.includes(w)).slice(0, 3).map((p) => p.logNo),
    }));
  }

  writeJson(path.join(dir, "topics.json"), {
    generatedAt: new Date().toISOString(),
    season: now,
    ideas,
  });

  console.log(`[B직원] 주제 ${ideas.length}개:`);
  ideas.forEach((t, i) => console.log(`  ${i + 1}. ${t.title}  (키워드: ${t.targetKeyword})`));
  return ideas;
}

function rankComp(c: string): number {
  if (c.includes("낮")) return 0;
  if (c.includes("중")) return 1;
  if (c.includes("높")) return 2;
  return 1;
}

function normalizeIdea(x: unknown): TopicIdea | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const title = String(o.title ?? "").trim();
  if (!title) return null;
  return {
    title,
    targetKeyword: String(o.targetKeyword ?? o.keyword ?? title).trim(),
    angle: String(o.angle ?? "").trim(),
    why: String(o.why ?? "").trim(),
    basedOn: Array.isArray(o.basedOn) ? o.basedOn.map(String) : [],
  };
}

if (require.main === module) {
  runTopics().catch((e) => {
    console.error("[B직원] 실패:", e.message);
    process.exit(1);
  });
}
