import { NextResponse } from "next/server";
import { chat, isConfigured } from "@/lib/llm";

// [스캐폴드 — 미배포]
// 상위노출 글 구조 분석.
//
// 흐름(설계):
//   - 초기 버전은 크롤링 없이, 사용자가 상위 5개 글 본문을 붙여넣는 입력을 받는다.
//   - LLM으로 각 글의 (소제목 구조 / 반복 단어 / 공통 키워드)를 추출해 요약.
//   - 주의: 네이버 랭킹 알고리즘은 비공개. 결과는 상관관계 기반 "추정"이지 인과가 아님.
//
// 향후:
//   - top_posts(keyword, rank, title, url, analysis jsonb) 테이블에 결과 누적.

export const runtime = "nodejs";
export const maxDuration = 60;

interface AnalyzeRequest {
  keyword?: string;
  /** 상위 글 본문들 (붙여넣기). 초기 버전은 크롤링 대신 수동 입력. */
  posts?: string[];
}

export async function POST(request: Request) {
  let body: AnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패." }, { status: 400 });
  }

  const posts = (body.posts ?? []).filter((p) => p && p.trim());
  if (posts.length === 0) {
    return NextResponse.json(
      { error: "분석할 상위 글 본문(posts)이 필요합니다." },
      { status: 400 }
    );
  }
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "LLM API 키 미설정." },
      { status: 503 }
    );
  }

  try {
    const analysis = await chat({
      system:
        "당신은 SEO 분석가입니다. 네이버 랭킹 알고리즘은 비공개이므로, 결과는 반드시 '상관관계 기반 추정'임을 전제로 서술합니다.",
      user: [
        `키워드: ${body.keyword ?? "(미지정)"}`,
        `다음은 상위 노출 글 ${posts.length}개의 본문이다. 공통 소제목 구조, 자주 반복되는 단어/문구, 함께 등장하는 연관 키워드를 뽑아 JSON으로 요약해줘.`,
        ``,
        ...posts.map((p, i) => `--- 글 ${i + 1} ---\n${p}`),
      ].join("\n"),
      maxTokens: 2048,
      temperature: 0.3,
    });
    return NextResponse.json({ analysis, disclaimer: "상관관계 기반 추정" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "분석 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
