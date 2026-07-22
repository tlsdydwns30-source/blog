// ─────────────────────────────────────────────────────────────
// A직원 — "내가 말한 블로그의 모든 글을 분석한다. (1~12월 월별 저장)"
//
//   1) 블로그 전체 글 목록 수집(공개 엔드포인트)
//   2) 1~12월 월별로 분류
//   3) 표본 본문 수집 + 가벼운 골격 피처 추출
//   4) crew/data/<blogId>/ 에 저장 (posts.json / by-month.json / analysis.json)
//
// 실행: npm run crew:a      (또는 tsx crew/a-analyze.ts)
// ─────────────────────────────────────────────────────────────

import path from "path";
import { loadConfig, blogIdOf } from "./lib/config";
import {
  fetchAllPostMeta,
  fetchPostBody,
  humanDelay,
  type PostMeta,
} from "./lib/naverBlog";
import { blogDir, writeJson, readJson } from "./lib/store";

export interface StoredPost extends PostMeta {
  bodyText?: string;
  charCount?: number;
  imageCount?: number;
  parseStatus?: "ok" | "partial" | "failed";
}

export interface MonthSummary {
  month: number;
  postCount: number;
  years: number[];
  sampleTitles: string[];
  topWords: { word: string; n: number }[];
}

const STOP = new Set([
  "그리고","하지만","그래서","정말","진짜","너무","이번","오늘","우리","저는","제가",
  "여기","거기","이건","저건","있는","없는","하는","했던","이런","그런","다녀온","다녀왔어요",
  "네이버","블로그","후기","추천","방문","다녀","위치","가격","정보","리뷰","브이로그","일상",
]);

function topWords(titles: string[], k = 12): { word: string; n: number }[] {
  const freq = new Map<string, number>();
  for (const t of titles) {
    for (const tok of t.split(/[\s,·\/\[\]()!?~"'“”‘’|+#-]+/)) {
      const w = tok.trim();
      if (w.length < 2 || w.length > 12) continue;
      if (STOP.has(w)) continue;
      if (/^\d+$/.test(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .map(([word, n]) => ({ word, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, k);
}

/** 본문을 수집할 표본을 월별로 고르게 뽑는다(각 월에서 최신 위주). */
function pickSample(posts: PostMeta[], limit: number): PostMeta[] {
  const byMonth = new Map<number, PostMeta[]>();
  for (const p of posts) {
    if (!p.month) continue;
    if (!byMonth.has(p.month)) byMonth.set(p.month, []);
    byMonth.get(p.month)!.push(p);
  }
  const perMonth = Math.max(2, Math.ceil(limit / 12));
  const picked: PostMeta[] = [];
  for (const [, arr] of byMonth) {
    arr.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    picked.push(...arr.slice(0, perMonth));
  }
  // 월 정보 없는 글도 최신 몇 개 포함
  const noMonth = posts.filter((p) => !p.month).slice(0, 10);
  picked.push(...noMonth);
  return picked.slice(0, limit);
}

export async function runAnalyze(): Promise<void> {
  const cfg = loadConfig();
  const blogId = blogIdOf(cfg);
  const dir = blogDir(blogId);

  console.log(`[A직원] 블로그 "${blogId}" 전체 글 목록 수집 중...`);
  const meta = await fetchAllPostMeta(blogId, {
    onProgress: (n) => process.stdout.write(`\r  수집: ${n}건`),
  });
  process.stdout.write("\n");
  if (meta.length === 0) {
    throw new Error(
      "글 목록을 하나도 못 가져왔습니다. blog 아이디가 맞는지, 공개 블로그인지 확인하세요."
    );
  }
  console.log(`[A직원] 총 ${meta.length}건. 본문 표본 수집 시작(사람 속도).`);

  // 기존 본문 캐시(재실행 시 이미 받은 본문은 건너뜀)
  const prev = readJson<StoredPost[]>(path.join(dir, "posts.json"), []);
  const cachedBody = new Map(
    prev.filter((p) => p.bodyText).map((p) => [p.logNo, p])
  );

  const sample = pickSample(meta, cfg.bodySampleLimit);
  const sampleSet = new Set(sample.map((s) => s.logNo));

  const stored: StoredPost[] = [];
  let fetched = 0;
  let failed = 0;

  for (const p of meta) {
    const base: StoredPost = { ...p };
    if (sampleSet.has(p.logNo)) {
      const cache = cachedBody.get(p.logNo);
      if (cache?.bodyText) {
        Object.assign(base, {
          bodyText: cache.bodyText,
          charCount: cache.charCount,
          imageCount: cache.imageCount,
          parseStatus: cache.parseStatus,
        });
      } else {
        const body = await fetchPostBody(blogId, p.logNo);
        base.bodyText = body.bodyText;
        base.charCount = body.bodyText.length;
        base.imageCount = body.imageCount;
        base.parseStatus = body.parseStatus;
        if (body.parseStatus === "failed") failed++;
        fetched++;
        if (fetched % 10 === 0)
          console.log(`  본문 ${fetched}/${sample.length} (실패 ${failed})`);
        await humanDelay(); // 2~5초
      }
    }
    stored.push(base);
  }

  // 월별 분류
  const byMonth: Record<number, StoredPost[]> = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = [];
  const noMonth: StoredPost[] = [];
  for (const p of stored) {
    if (p.month) byMonth[p.month].push(p);
    else noMonth.push(p);
  }

  // 월별 요약
  const analysis: MonthSummary[] = [];
  for (let m = 1; m <= 12; m++) {
    const arr = byMonth[m];
    analysis.push({
      month: m,
      postCount: arr.length,
      years: [...new Set(arr.map((p) => p.year).filter(Boolean))].sort() as number[],
      sampleTitles: arr.slice(0, 8).map((p) => p.title),
      topWords: topWords(arr.map((p) => p.title)),
    });
  }

  writeJson(path.join(dir, "posts.json"), stored);
  writeJson(path.join(dir, "by-month.json"), byMonth);
  writeJson(path.join(dir, "analysis.json"), {
    blogId,
    totalPosts: meta.length,
    bodiesFetched: stored.filter((p) => p.bodyText).length,
    parseFailed: failed,
    updatedAt: new Date().toISOString(),
    months: analysis,
    noMonthCount: noMonth.length,
  });

  console.log(
    `[A직원] 완료 → ${path.relative(process.cwd(), dir)} (본문 ${
      stored.filter((p) => p.bodyText).length
    }건, 파싱실패 ${failed})`
  );
  console.log("  월별 글 수: " + analysis.map((a) => `${a.month}월:${a.postCount}`).join("  "));
}

// 단독 실행
if (require.main === module) {
  runAnalyze().catch((e) => {
    console.error("[A직원] 실패:", e.message);
    process.exit(1);
  });
}
