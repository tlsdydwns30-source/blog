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
    // 1) 니치 + 대표키워드 파악 ("주제, 키워드" 콤마 형식 — 파싱 견고)
    const nicheRaw = await chat({
      system: "당신은 블로그 분석가입니다. 요청한 형식으로만, 다른 말 없이 답합니다.",
      user: [
        "다음은 어떤 네이버 블로그의 최근 글 제목들이다.",
        "이 블로그의 주제와 대표 검색 키워드 1개를,",
        "다른 설명 없이 딱 한 줄 '주제, 대표키워드' 형식으로만 답해.",
        "예시: 국내여행·맛집, 부산맛집",
        "",
        ...titles.map((t) => `- ${t}`),
      ].join("\n"),
      maxTokens: 60,
      temperature: 0.2,
    });
    const line =
      nicheRaw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s.includes(",")) ?? nicheRaw.trim();
    const [nichePart, kwPart] = line.split(",");
    const niche =
      (nichePart ?? "").replace(/^(주제|니치)\s*[:：]?\s*/, "").trim() ||
      "여행·일상";
    let mainKeyword = (kwPart ?? "")
      .replace(/[^가-힣A-Za-z0-9 ]/g, "")
      .trim();
    // 키워드 추출 실패 시 니치의 첫 토큰으로 대체(강도 추정용).
    if (!mainKeyword) mainKeyword = niche.split(/[·,\s/]/)[0] ?? "";

    // 2) 강도(노출) 추정 — 이 블로그의 최근 글이 '자기 제목'으로 검색 시 상위에 뜨는지.
    //    자기 글도 상위에 안 뜨면 신규/저품질(성장 필요) 신호.
    const searchEnv = readNaverSearchEnv();
    let rank: number | null = null;
    if (searchEnv) {
      // 방금 올린 최신 글은 색인 전일 수 있어 2~4번째 글로 확인.
      for (const t of titles.slice(1, 4)) {
        const r = await searchBlogRank(t, blogId, searchEnv);
        if (r != null) rank = rank == null ? r : Math.min(rank, r);
      }
    }
    let strength: "노출 좋음" | "노출 보통" | "노출 약함" = "노출 약함";
    if (rank != null && rank <= 3) strength = "노출 좋음";
    else if (rank != null && rank <= 10) strength = "노출 보통";

    const strategy =
      strength === "노출 좋음"
        ? "노출이 잘 되는 편. 검색량 큰 키워드도 도전해볼 만함."
        : strength === "노출 보통"
          ? "경쟁 낮음~중간 키워드 위주로 꾸준히 쌓기."
          : "아직 상위노출이 약함. 경쟁 낮은(문서 적은) 롱테일·구체 주제부터 차곡차곡.";
    void mainKeyword;

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
