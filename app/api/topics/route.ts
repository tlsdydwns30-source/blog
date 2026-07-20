import { NextResponse } from "next/server";
import { chat, isConfigured } from "@/lib/llm";

// 글감(제목) 추천 API — 키워드 하나로 블로그 제목 아이디어 5개
export const runtime = "nodejs";
export const maxDuration = 30;

interface TopicRequest {
  keyword?: string;
  totalSearch?: number;
  ratio?: number | null;
}

export interface TopicIdea {
  title: string;
  desc: string;
}

function parseIdeas(text: string): TopicIdea[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    // "1. ", "- ", "• " 같은 머리표 제거
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, ""))
    .filter((line) => line.includes("|"))
    .map((line) => {
      const [title, ...rest] = line.split("|");
      return { title: title.trim(), desc: rest.join("|").trim() };
    })
    .filter((idea) => idea.title)
    .slice(0, 5);
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "LLM API 키 미설정." },
      { status: 503 }
    );
  }

  let body: TopicRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패." }, { status: 400 });
  }

  const keyword = (body.keyword ?? "").trim();
  if (!keyword) {
    return NextResponse.json(
      { error: "키워드가 필요합니다." },
      { status: 400 }
    );
  }

  const context =
    (body.totalSearch ? `월 검색량 약 ${body.totalSearch}회. ` : "") +
    (body.ratio != null ? `경쟁지수(문서수/검색량) ${body.ratio}. ` : "");

  try {
    const raw = await chat({
      system:
        "당신은 네이버 여행 블로그 상위노출에 능한 편집자입니다. 클릭을 부르면서도 과장·낚시가 아닌, 실제 도움이 되는 제목을 만듭니다.",
      user: [
        `키워드: "${keyword}"`,
        context ? `참고: ${context}` : "",
        "",
        `이 키워드로 네이버 블로그 글을 쓴다면, 어떤 주제로 쓰면 좋을지 제목 5개를 제안해줘.`,
        `각 줄을 반드시 "제목 | 한줄설명" 형식으로만, 번호·기호 없이 정확히 5줄로 출력해줘.`,
        `제목은 한국어로, 검색 의도에 맞고 구체적으로.`,
      ]
        .filter(Boolean)
        .join("\n"),
      maxTokens: 800,
      temperature: 0.8,
    });

    const ideas = parseIdeas(raw);
    if (ideas.length === 0) {
      return NextResponse.json(
        { error: "글감을 생성하지 못했습니다. 다시 시도해주세요." },
        { status: 502 }
      );
    }
    return NextResponse.json({ keyword, ideas });
  } catch (e) {
    const message = e instanceof Error ? e.message : "글감 생성 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
