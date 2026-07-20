// 네이버 검색광고 API (키워드 도구) 연동 — 서버 전용
//
// 공식 API: GET https://api.searchad.naver.com/keywordstool
//  - 연관 키워드 + 월간 검색량(PC/모바일) + 광고 경쟁정도(compIdx)를 반환.
//  - 인증: HMAC-SHA256 서명 (timestamp.method.path 를 secret 으로 서명, base64).
//
// 환경변수(서버 전용, 절대 클라이언트 노출 금지):
//   NAVER_AD_API_KEY      = 액세스라이선스 (Access License)
//   NAVER_AD_SECRET_KEY   = 비밀키 (Secret Key)
//   NAVER_AD_CUSTOMER_ID  = 고객 ID (Customer ID)

import crypto from "crypto";

export interface NaverAdEnv {
  apiKey: string;
  secretKey: string;
  customerId: string;
}

export function readNaverAdEnv(): NaverAdEnv | null {
  const apiKey = process.env.NAVER_AD_API_KEY;
  const secretKey = process.env.NAVER_AD_SECRET_KEY;
  const customerId = process.env.NAVER_AD_CUSTOMER_ID;
  if (!apiKey || !secretKey || !customerId) return null;
  return { apiKey, secretKey, customerId };
}

function sign(
  timestamp: string,
  method: string,
  path: string,
  secret: string
): string {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

/** 네이버가 "< 10" 처럼 문자열로 주기도 해서 안전하게 숫자화 */
function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// ── 네이버 검색 API (developers.naver.com) — 문서수 조회용 ──────────
//   NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
export interface NaverSearchEnv {
  clientId: string;
  clientSecret: string;
}

export function readNaverSearchEnv(): NaverSearchEnv | null {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * 키워드의 네이버 블로그 문서수(total)를 조회.
 *  - 검색 API 블로그 검색의 total 값 = 해당 키워드로 존재하는 블로그 문서수(근사).
 *  - 경쟁지수(문서수 ÷ 검색량) 계산의 분자로 사용.
 */
export async function fetchBlogDocCount(
  keyword: string,
  env: NaverSearchEnv
): Promise<number | null> {
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(
    keyword
  )}&display=1`;

  // 초당 제한(429) 등 일시적 실패 시 1회 재시도.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": env.clientId,
        "X-Naver-Client-Secret": env.clientSecret,
      },
    });
    if (res.ok) {
      const data = (await res.json()) as { total?: unknown };
      return toNum(data.total);
    }
    if (res.status !== 429 && res.status !== 500) return null;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/** URL 또는 아이디에서 네이버 블로그 ID 추출 */
export function parseBlogId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/blog\.naver\.com\/([^/?#\s]+)/i);
  if (m) return m[1];
  // URL 이 아니면 아이디 자체로 간주 (영문/숫자/언더스코어/하이픈)
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
  return null;
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").trim();
}

export interface BlogRss {
  titles: string[];
  dates: string[];
}

/** 네이버 블로그 RSS 로 최근 글 제목/날짜 수집 (공개 데이터) */
export async function fetchNaverBlogRss(
  blogId: string
): Promise<BlogRss | null> {
  const res = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const titles: string[] = [];
  const dates: string[] = [];
  for (const it of items) {
    const t = extractTag(it, "title");
    const d = extractTag(it, "pubDate");
    if (t) titles.push(t);
    if (d) dates.push(d);
  }
  return { titles, dates };
}

/**
 * 특정 키워드로 블로그 검색 시, 이 블로그가 상위 몇 위에 노출되는지.
 *  - 블로그 강도(최적화 여부) 추정용 신호. (없으면 null)
 */
export async function searchBlogRank(
  query: string,
  blogId: string,
  env: NaverSearchEnv
): Promise<number | null> {
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(
    query
  )}&display=30`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": env.clientId,
      "X-Naver-Client-Secret": env.clientSecret,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: Array<{ link?: string; bloggerlink?: string }>;
  };
  const items = data.items ?? [];
  for (let i = 0; i < items.length; i++) {
    const link = `${items[i].link ?? ""}${items[i].bloggerlink ?? ""}`;
    if (link.includes(blogId)) return i + 1;
  }
  return null;
}

export interface RelKeyword {
  keyword: string;
  /** 월 PC 검색수 */
  monthlyPc: number;
  /** 월 모바일 검색수 */
  monthlyMobile: number;
  /** 월 검색수 합계 (PC + 모바일) */
  totalSearch: number;
  /** 광고 경쟁정도: "낮음" | "중간" | "높음" */
  compIdx: string;
}

/**
 * 시드(주제) 키워드로 연관 키워드 목록을 가져온다.
 * 예: seed="여행" → 여행 관련 연관 키워드들의 월 검색량 + 경쟁정도.
 */
export async function fetchRelatedKeywords(
  seed: string,
  env: NaverAdEnv
): Promise<RelKeyword[]> {
  const method = "GET";
  const path = "/keywordstool";
  const timestamp = String(Date.now());
  const signature = sign(timestamp, method, path, env.secretKey);

  // hintKeywords 는 공백 제거 필요 (네이버 규칙)
  const hint = seed.replace(/\s+/g, "");
  const url = `https://api.searchad.naver.com${path}?hintKeywords=${encodeURIComponent(
    hint
  )}&showDetail=1`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": env.apiKey,
      "X-Customer": env.customerId,
      "X-Signature": signature,
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(
      `네이버 검색광고 API 오류 (${res.status}): ${detail.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as {
    keywordList?: Array<Record<string, unknown>>;
  };
  const list = Array.isArray(data.keywordList) ? data.keywordList : [];

  return list.map((k) => {
    const monthlyPc = toNum(k.monthlyPcQcCnt);
    const monthlyMobile = toNum(k.monthlyMobileQcCnt);
    return {
      keyword: String(k.relKeyword ?? ""),
      monthlyPc,
      monthlyMobile,
      totalSearch: monthlyPc + monthlyMobile,
      compIdx: String(k.compIdx ?? "-"),
    };
  });
}
