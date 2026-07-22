// ─────────────────────────────────────────────────────────────
// C직원 — "블로그 글들을 짜깁기하여 글을 작성한다."
//
//   선택한 주제 + 관련 과거 글(내 블로그)을 근거로 새 초안을 쓴다.
//   원칙(스펙): 문장 단위 모방 금지(네이버 유사문서 필터). 골격·정보만 빌리고
//   문장은 새로. 경험 슬롯([내 경험:...])과 사진 슬롯([사진:...])을 반드시 넣어
//   사람이 채우게 한다(경험은 AI가 지어내지 않음).
//
// 실행: npm run crew:c        (기본: topics.json 의 1번 주제)
//       tsx crew/c-write.ts 2 (2번 주제로)
// ─────────────────────────────────────────────────────────────

import path from "path";
import { loadConfig, blogIdOf } from "./lib/config";
import { blogDir, readJson, writeJson, writeText, slug } from "./lib/store";
import type { StoredPost } from "./a-analyze";
import type { TopicIdea } from "./b-topics";
import { chat, isConfigured } from "../lib/llm";

export interface Draft {
  title: string;
  targetKeyword: string;
  body: string; // 마크다운
  photoQueries: string[]; // [사진:...] 슬롯 설명들 (D직원 입력)
  sourceLogNos: string[];
}

function tokens(s: string): string[] {
  return s
    .split(/[\s,·\/\[\]()!?~"'“”‘’|+#]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/** 주제와 관련 있는 과거 글을 고른다: basedOn 우선 + 키워드 매칭 보강 */
function pickSources(posts: StoredPost[], topic: TopicIdea, want: number): StoredPost[] {
  const withBody = posts.filter((p) => p.bodyText && p.bodyText.length > 100);
  const byLog = new Map(withBody.map((p) => [p.logNo, p]));

  const chosen: StoredPost[] = [];
  for (const id of topic.basedOn) {
    const p = byLog.get(id);
    if (p && !chosen.includes(p)) chosen.push(p);
  }

  const kw = new Set([...tokens(topic.targetKeyword), ...tokens(topic.title)]);
  const scored = withBody
    .filter((p) => !chosen.includes(p))
    .map((p) => {
      const hay = `${p.title} ${p.bodyText}`;
      let score = 0;
      for (const k of kw) if (hay.includes(k)) score++;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { p } of scored) {
    if (chosen.length >= want) break;
    chosen.push(p);
  }
  // 그래도 부족하면 최신 글로 채움
  if (chosen.length === 0) chosen.push(...withBody.slice(0, want));
  return chosen.slice(0, want);
}

function extractPhotoQueries(body: string): string[] {
  const out: string[] = [];
  const re = /\[사진:\s*([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push(m[1].trim());
  return out;
}

export async function runWrite(topicIndex = 0): Promise<Draft> {
  const cfg = loadConfig();
  const blogId = blogIdOf(cfg);
  const dir = blogDir(blogId);

  const topicsFile = readJson<{ ideas: TopicIdea[] } | null>(
    path.join(dir, "topics.json"),
    null
  );
  if (!topicsFile || !topicsFile.ideas.length) {
    throw new Error("먼저 B직원(npm run crew:b)으로 주제를 만드세요.");
  }
  const topic = topicsFile.ideas[topicIndex];
  if (!topic) throw new Error(`주제 인덱스 ${topicIndex} 가 없습니다.`);

  const posts = readJson<StoredPost[]>(path.join(dir, "posts.json"), []);
  const sources = pickSources(posts, topic, cfg.weaveCount);
  console.log(
    `[C직원] 주제 "${topic.title}" · 참고 과거 글 ${sources.length}개: ` +
      sources.map((s) => s.logNo).join(", ")
  );

  if (!isConfigured()) {
    throw new Error(
      "LLM 키가 없어 글을 쓸 수 없습니다. .env.local 에 ANTHROPIC_API_KEY 또는 OPENAI_API_KEY 설정."
    );
  }

  const material = sources
    .map(
      (s, i) =>
        `# 과거글 ${i + 1} (${s.date ?? "?"}) ${s.title}\n${(s.bodyText ?? "").slice(0, 2500)}`
    )
    .join("\n\n---\n\n");

  const system = [
    "당신은 특정 네이버 블로거의 글쓰기를 돕는 조수입니다.",
    "제공된 '과거글'은 블로거 본인이 직접 쓴 글입니다. 여기서 정보·구조·경험의 뼈대만 가져오고,",
    "문장은 절대 그대로 베끼지 말고 완전히 새로 쓰세요(네이버 유사문서 필터 회피).",
    "블로거의 말투(반말/존댓말, 자주 쓰는 표현)를 과거글에서 감지해 그대로 유지하세요.",
    "겪지 않은 일을 사실처럼 지어내지 마세요. 확인 안 되는 최신 정보(가격·일정)는 비워두세요.",
  ].join(" ");

  const user = [
    `[새 글 주제] ${topic.title}`,
    `[핵심 키워드] ${topic.targetKeyword}`,
    topic.angle ? `[차별화 각도] ${topic.angle}` : "",
    ``,
    `[참고할 내 과거글들]`,
    material,
    ``,
    `[작성 규칙]`,
    `1) 구조: 첫인사 → 목차 → 본문(소제목 3~5개) → 마무리(요약+한마디). 마크다운(##/###).`,
    `2) 분량: 공백 포함 1,500~2,000자. 핵심 키워드는 자연스럽게 5~7회.`,
    `3) 과거글의 문장을 복사하지 말 것. 정보와 순서만 참고해 새 문장으로.`,
    `4) 내가 직접 채울 자리는 반드시 표시:`,
    `   - 실제 경험이 들어갈 곳 → [내 경험: 무엇을 쓸지 한 줄 힌트]  (최소 2곳)`,
    `   - 사진이 들어갈 곳 → [사진: 어떤 사진인지 한 줄 설명]  (최소 3곳)`,
    `5) 한자·불필요한 외국어 없이 자연스러운 한국어로만.`,
  ]
    .filter(Boolean)
    .join("\n");

  let body = await chat({ system, user, maxTokens: 4000, temperature: 0.75 });
  body = body.replace(/[一-鿿㐀-䶿]/g, "").trim();

  const photoQueries = extractPhotoQueries(body);

  const draft: Draft = {
    title: topic.title,
    targetKeyword: topic.targetKeyword,
    body,
    photoQueries,
    sourceLogNos: sources.map((s) => s.logNo),
  };

  const base = `${new Date().toISOString().slice(0, 10)}-${slug(topic.title)}`;
  writeJson(path.join(dir, "drafts", `${base}.json`), draft);
  writeText(path.join(dir, "drafts", `${base}.md`), body);

  console.log(
    `[C직원] 초안 완성 (${body.length}자, 사진 슬롯 ${photoQueries.length}개) → drafts/${base}.md`
  );
  return draft;
}

if (require.main === module) {
  const idx = Number(process.argv[2] ?? "0") || 0;
  runWrite(idx).catch((e) => {
    console.error("[C직원] 실패:", e.message);
    process.exit(1);
  });
}
