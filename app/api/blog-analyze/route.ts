import { NextResponse } from "next/server";
import { chat, isConfigured } from "@/lib/llm";
import {
  parseBlogId,
  fetchNaverBlogRss,
  searchBlogRank,
  readNaverSearchEnv,
} from "@/lib/naver";

// 내 블로그 분석 → 수준 맞춤 글감 추천
//  1) 블로그 RSS 로 최근 글 제목 수집 → 니치/대표키워드 파악
//  2) 검색 API 로 대표키워드 상위노출 여부 확인 → 블로그 강도 "추정"
//  3) 강도에 맞춰 공략할 글감 5개 추천 (약한 블로그=경쟁 낮은 것 위주)
export const runtime = "nodejs";
export const maxDuration = 45;

interface Idea {
  title: string;
  desc: string;
}

function parseLines(text: string): Idea[] {
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

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "LLM API 키 미설정." }, { status: 503 });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패." }, { status: 400 });
  }

  const blogId = parseBlogId(body.url ?? "");
  if (!blogId) {
    return NextResponse.json(
      { error: "네이버 블로그 주소를 확인해주세요. 예: blog.naver.com/아이디" },
      { status: 400 }
    );
  }

  const rss = await fetchNaverBlogRss(blogId);
  if (!rss || rss.titles.length === 0) {
    return NextResponse.json(
      {
        error:
          "블로그 글을 불러오지 못했어요. 공개 네이버 블로그 주소인지 확인해주세요.",
      },
      { status: 404 }
    );
  }
  const titles = rss.titles.slice(0, 15);

  try {
    // 1) 니치 + 대표키워드 파악 (두 줄 형식으로 명확히)
    const nicheRaw = await chat({
      system: "당신은 블로그 분석가입니다. 간결하게 한국어로만 답합니다.",
      user: [
        "다음은 어떤 네이버 블로그의 최근 글 제목들이다.",
        "이 블로그가 주로 다루는 주제(니치)와, 대표 검색 키워드 1개를 뽑아줘.",
        "정확히 아래 두 줄 형식으로만 답해:",
        "니치: (예: 국내여행·맛집)",
        "대표키워드: (예: 부산맛집)",
        "",
        ...titles.map((t) => `- ${t}`),
      ].join("\n"),
      maxTokens: 150,
      temperature: 0.3,
    });
    const nicheM = nicheRaw.match(/니치\s*[:：]\s*(.+)/);
    const kwM = nicheRaw.match(/대표\s*키워드\s*[:：]\s*(.+)/);
    const niche = (nicheM?.[1] ?? "").trim() || "여행·일상";
    const mainKeyword = (kwM?.[1] ?? "").replace(/[^가-힣A-Za-z0-9 ]/g, "").trim();

    // 2) 강도 추정 (대표키워드로 이 블로그가 상위노출 되는지)
    const searchEnv = readNaverSearchEnv();
    let rank: number | null = null;
    if (searchEnv && mainKeyword) {
      rank = await searchBlogRank(mainKeyword, blogId, searchEnv);
    }
    let strength: "강함" | "보통" | "성장 중" = "성장 중";
    if (rank != null && rank <= 5) strength = "강함";
    else if (rank != null && rank <= 20) strength = "보통";

    const strategy =
      strength === "강함"
        ? "경쟁 중간~높은 키워드도 공략 가능. 검색량 큰 주제 위주."
        : strength === "보통"
          ? "경쟁 낮음~중간 키워드 위주로. 검색량 적당한 주제."
          : "경쟁 낮은(문서 적은) 키워드 위주로 차곡차곡 쌓기. 롱테일·구체 주제.";

    // 3) 수준 맞춤 글감 5개
    const ideasRaw = await chat({
      system:
        "당신은 네이버 블로그 성장 코치입니다. 블로그가 이미 다루는 분야와 톤에 맞춰, 수준에 맞는(상위노출 가능한) 글감을 제안합니다.",
      user: [
        `블로그 주제(니치): ${niche}`,
        `블로그 강도(추정): ${strength}`,
        `추천 전략: ${strategy}`,
        "",
        "이 블로그가 실제로 써온 최근 글 제목:",
        ...titles.slice(0, 8).map((t) => `- ${t}`),
        "",
        "위 블로그의 분야·톤·결에 맞춰, 지금 쓰면 좋은 글 5개를 제안해줘.",
        "블로그가 이미 다루는 분야(예: 국내여행·맛집·일상)를 벗어나 엉뚱한 주제로 튀지 말 것.",
        '각 줄을 반드시 "제목 | 한줄이유" 형식으로, 번호·기호 없이 정확히 5줄로만.',
        "제목은 구체적이고 검색 의도에 맞게 한국어로.",
      ].join("\n"),
      maxTokens: 800,
      temperature: 0.8,
    });
    const ideas = parseLines(ideasRaw);

    return NextResponse.json({
      blogId,
      niche,
      mainKeyword,
      strength,
      rank,
      recentTitles: titles.slice(0, 5),
      ideas,
      note: "블로그 강도는 네이버 랭킹(비공개) 특성상 대표키워드 노출 여부로 추정한 값입니다.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "블로그 분석 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
