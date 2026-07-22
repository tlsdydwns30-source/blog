// ─────────────────────────────────────────────────────────────
// 크루 오케스트레이터 — A → B → C → D 를 순서대로 실행하고
// "바로 붙여넣을 세트"(PASTE.md)를 crew/output/ 에 만든다.
//
//   기본: 이번 시기 주제 1번으로 초안 1개 생성.
//   옵션(env):
//     CREW_FORCE_ANALYZE=1   A직원 강제 재수집(캐시 무시)
//     CREW_TOPIC=2           2번 주제로 작성
//     CREW_TOPIC=all         주제 전부(topicCount개) 각각 초안 생성
//
// 실행: npm run crew
// F직원(네이버 임시저장)은 아직 미결정 → PASTE.md 로 수동 붙여넣기 안내까지.
// ─────────────────────────────────────────────────────────────

import path from "path";
import { existsSync, statSync } from "fs";
import { loadConfig, blogIdOf } from "./lib/config";
import { blogDir, readJson, writeText, slug, OUTPUT_ROOT } from "./lib/store";
import { runAnalyze } from "./a-analyze";
import { runTopics, type TopicIdea } from "./b-topics";
import { runWrite, type Draft } from "./c-write";
import { runPhotos, type PhotoPlan } from "./d-photos";

const STALE_DAYS = 7;

function analysisStale(dir: string): boolean {
  const f = path.join(dir, "analysis.json");
  if (!existsSync(f)) return true;
  const ageMs = Date.now() - statSync(f).mtimeMs;
  return ageMs > STALE_DAYS * 86400 * 1000;
}

function buildPaste(draft: Draft, plan: PhotoPlan): string {
  const base = process.env.NEXT_PUBLIC_PHOTO_BASE_URL?.replace(/\/$/, "") ?? "";
  const lines: string[] = [];
  lines.push(`# ${draft.title}`);
  lines.push("");
  lines.push(`> 핵심 키워드: **${draft.targetKeyword}**`);
  lines.push(`> 참고한 내 과거글: ${draft.sourceLogNos.join(", ") || "-"}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## ✍️ 본문 (네이버에 그대로 붙여넣기)");
  lines.push("");
  lines.push(draft.body);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 사진 배치 가이드
  lines.push("## 📸 사진 배치 가이드 (D직원)");
  if (!plan.ready) {
    lines.push("");
    lines.push(`> ${plan.note ?? "사진 매칭이 아직 준비되지 않았습니다."}`);
  }
  lines.push("");
  for (const m of plan.matches) {
    lines.push(`### [사진: ${m.slot}]`);
    if (m.candidates.length === 0) {
      lines.push("- (추천 없음 — 이 설명에 맞는 사진을 직접 넣으세요)");
    } else {
      for (const c of m.candidates) {
        const url = base ? `${base}/${c.storage_path}` : c.storage_path;
        lines.push(
          `- ${url}  · ${c.caption ?? ""} (유사도 ${(c.similarity * 100).toFixed(0)}%)`
        );
      }
    }
    lines.push("");
  }

  // 경험 슬롯 체크리스트
  const exp = [...draft.body.matchAll(/\[내 경험:\s*([^\]]+)\]/g)].map((x) => x[1].trim());
  lines.push("## 🙋 내가 직접 채울 경험 슬롯 (필수 — 안 채우면 발행 금지)");
  if (exp.length === 0) lines.push("- (없음)");
  else exp.forEach((e, i) => lines.push(`- [ ] ${i + 1}. ${e}`));
  lines.push("");

  // F직원 안내
  lines.push("## 🚧 F직원(네이버 임시저장)");
  lines.push(
    "- 현재는 수동 붙여넣기 단계입니다. 위 본문을 복사 → 네이버 스마트에디터에 붙이고, 사진 슬롯 위치에 추천 사진을 넣으세요."
  );
  lines.push("- 브라우저 자동 임시저장은 별도 결정 후 붙입니다.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cfg = loadConfig();
  const blogId = blogIdOf(cfg);
  const dir = blogDir(blogId);

  // A직원
  if (process.env.CREW_FORCE_ANALYZE === "1" || analysisStale(dir)) {
    await runAnalyze();
  } else {
    console.log("[A직원] 분석 데이터가 최신(7일 이내) — 건너뜀. (CREW_FORCE_ANALYZE=1 로 강제)");
  }

  // B직원
  const ideas = await runTopics();

  // C+D직원 (주제 선택)
  const which = process.env.CREW_TOPIC ?? "1";
  const indices =
    which === "all"
      ? ideas.map((_: TopicIdea, i: number) => i)
      : [Math.max(0, Number(which) - 1) || 0];

  const stamp = new Date().toISOString().slice(0, 10);
  for (const idx of indices) {
    const draft = await runWrite(idx);
    const plan = await runPhotos(draft);
    const outDir = path.join(OUTPUT_ROOT, `${stamp}-${slug(draft.title)}`);
    const paste = buildPaste(draft, plan);
    writeText(path.join(outDir, "PASTE.md"), paste);
    console.log(
      `\n✅ 완성 세트 → ${path.relative(process.cwd(), path.join(outDir, "PASTE.md"))}`
    );
  }

  // 요약
  const topicsFile = readJson<{ ideas: TopicIdea[] }>(
    path.join(dir, "topics.json"),
    { ideas: [] }
  );
  console.log(`\n[크루 완료] 이번 시기 주제 ${topicsFile.ideas.length}개 중 ${indices.length}개 초안 생성.`);
}

main().catch((e) => {
  console.error("[크루] 실패:", e.message);
  process.exit(1);
});
