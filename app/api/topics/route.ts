import { NextResponse } from "next/server";
import { chat, isConfigured } from "@/lib/llm";
import { readNaverSearchEnv, fetchNaverNews, type NewsItem } from "@/lib/naver";

// 키워드 하나로 글쓰기에 필요한 것 묶음:
//  - 제목 아이디어 5개 (LLM)
//  - 후속질문 5개 (사람들이 이어서 궁금해하는 것 = 소제목/롱테일) (LLM)
//  - 관련 네이버 뉴스 3건 (검색 API)
// 분야 무관(여행·맛집·뷰티·IT 등 모두).
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
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, ""))
    .filter((l) => l.includes("|"))
    .map((l) => {
      const [title, ...rest] = l.split("|");
      return { title: title.trim(), desc: rest.join("|").trim() };
    })
    .filter((i) => i.title)
    .slice(0, 5);
}

function parseQuestions(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
    .filter((l) => l.length >= 2 && !/^(질문|후속)/.test(l))
    .slice(0, 5);
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "LLM API 키 미설정." }, { status: 503 });
  }

  let body: TopicRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패." }, { status: 400 });
  }

  const keyword = (body.keyword ?? "").trim();
  if (!keyword) {
    return NextResponse.json({ error: "키워드가 필요합니다." }, { status: 400 });
  }

  const context =
    (body.totalSearch ? `월 검색량 약 ${body.totalSearch}회. ` : "") +
    (body.ratio != null ? `경쟁지수 ${body.ratio}. ` : "");

  const searchEnv = readNaverSearchEnv();

  try {
    const [ideasRaw, followRaw, news] = await Promise.all([
      chat({
        system:
          "당신은 네이버 블로그 편집자입니다. 분야(여행·맛집·뷰티·IT·육아 등)에 상관없이 클릭을 부르면서도 낚시가 아닌, 실제 도움이 되는 제목을 만듭니다.",
        user: [
          `키워드: "${keyword}"`,
          context ? `참고: ${context}` : "",
          "",
          "이 키워드로 블로그 글을 쓴다면 어떤 주제로 쓰면 좋을지 제목 5개를 제안해줘.",
          '각 줄을 반드시 "제목 | 한줄설명" 형식으로, 번호·기호 없이 정확히 5줄로.',
          "한국어로, 검색 의도에 맞고 구체적으로.",
        ]
          .filter(Boolean)
          .join("\n"),
        maxTokens: 700,
        temperature: 0.8,
      }),
      chat({
        system:
          "당신은 검색 사용자의 의도를 잘 아는 분석가입니다. 한국어로만 답합니다.",
        user: [
          `키워드: "${keyword}"`,
          "이 키워드를 검색한 사람이 이어서 궁금해할 질문 5개를 뽑아줘.",
          "(블로그 소제목으로 바로 쓸 수 있게 구체적인 질문형으로)",
          "번호·기호 없이 한 줄에 하나씩, 정확히 5줄로만.",
        ].join("\n"),
        maxTokens: 400,
        temperature: 0.7,
      }),
      searchEnv
        ? fetchNaverNews(keyword, searchEnv, 3)
        : Promise.resolve([] as NewsItem[]),
    ]);

    const ideas = parseIdeas(ideasRaw);
    const followups = parseQuestions(followRaw);

    return NextResponse.json({ keyword, ideas, followups, news });
  } catch (e) {
    const message = e instanceof Error ? e.message : "글감 생성 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
