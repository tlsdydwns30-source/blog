import { NextResponse } from "next/server";
import { chat, isConfigured } from "@/lib/llm";

// Vercel Serverless Function (Node 런타임). 초안 생성은 시간이 걸릴 수 있어 여유를 준다.
export const runtime = "nodejs";
export const maxDuration = 60;

interface DraftRequest {
  mainKeyword?: string;
  subKeywords?: string[];
  material?: string;
  tone?: string;
}

function buildSystemPrompt(): string {
  return [
    "당신은 네이버 여행 블로그 상위노출에 능한 한국어 카피라이터입니다.",
    "독자에게 실질적으로 도움이 되는, 자연스럽고 진솔한 여행 후기 글을 씁니다.",
    "과장·거짓 정보 없이, 주어진 자료 범위 안에서만 사실을 서술합니다.",
    "키워드를 억지로 반복해 어색해지지 않도록, 문맥에 녹여 자연스럽게 배치합니다.",
  ].join(" ");
}

function buildUserPrompt(req: DraftRequest): string {
  const subs = (req.subKeywords ?? []).filter(Boolean);
  return [
    `아래 조건으로 네이버 블로그 글 초안을 작성해줘.`,
    ``,
    `[메인 키워드] ${req.mainKeyword}`,
    subs.length ? `[서브 키워드] ${subs.join(", ")}` : ``,
    req.tone ? `[문체] ${req.tone}` : ``,
    req.material ? `[반영할 자료/경험]\n${req.material}` : ``,
    ``,
    `[작성 규칙]`,
    `1) 구조: 첫인사(도입) → 목차 → 본문(소제목 여러 개) → 마무리(요약+행동유도).`,
    `2) 분량: 공백(띄어쓰기) 포함 반드시 1,500자 이상 2,000자 이하. 1,500자 미만은 절대 금지. 짧으면 각 소제목의 설명·팁·예시를 더 풍부하게 늘려 반드시 1,500자를 넘길 것.`,
    `3) 메인 키워드는 글 전체에서 5~7회, 자연스럽게 배치.`,
    `4) 목차는 본문 소제목과 일치시킬 것.`,
    `5) 마크다운(##, ### 소제목)으로 작성.`,
    `6) 제공된 자료에 없는 구체 수치(가격/시간 등)는 지어내지 말 것.`,
    `7) 영어 단어나 외국어를 섞지 말고 자연스러운 한국어로만 작성할 것.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  let body: DraftRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청 본문(JSON 파싱 실패)." },
      { status: 400 }
    );
  }

  if (!body.mainKeyword || !body.mainKeyword.trim()) {
    return NextResponse.json(
      { error: "메인 키워드는 필수입니다." },
      { status: 400 }
    );
  }

  if (!isConfigured()) {
    return NextResponse.json(
      {
        error:
          "LLM API 키가 서버에 설정되지 않았습니다. Vercel 환경변수(ANTHROPIC_API_KEY 또는 OPENAI_API_KEY)를 확인하세요.",
      },
      { status: 503 }
    );
  }

  try {
    const system = buildSystemPrompt();
    let draft = await chat({
      system,
      user: buildUserPrompt(body),
      maxTokens: 8192,
      temperature: 0.7,
    });

    // 분량이 1,500자(공백 포함) 미만이면 한 번 더 확장 요청.
    if (cleanKorean(draft).length < 1500) {
      const expanded = await chat({
        system,
        user: [
          "다음 블로그 글이 너무 짧다. 내용(설명·팁·예시·후기)을 더 풍부하게 보강해서",
          "공백 포함 1,500~2,000자로 다시 작성해줘. 구조(첫인사→목차→본문→마무리)는 유지하고",
          "영어·한자 없이 자연스러운 한국어로만 써줘.",
          "",
          draft,
        ].join("\n"),
        maxTokens: 8192,
        temperature: 0.7,
      });
      if (cleanKorean(expanded).length > cleanKorean(draft).length) {
        draft = expanded;
      }
    }

    return NextResponse.json({ draft: cleanKorean(draft) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "초안 생성 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// 무료 모델이 가끔 섞는 한자(중국어) 등 CJK 표의문자를 제거해 한국어를 깔끔하게 유지.
function cleanKorean(text: string): string {
  return text
    .replace(/[一-鿿㐀-䶿]/g, "")
    .replace(/[ \t]{2,}/g, " ");
}
