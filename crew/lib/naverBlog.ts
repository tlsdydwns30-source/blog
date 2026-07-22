// ─────────────────────────────────────────────────────────────
// 네이버 블로그 "전체 글" 수집 (공개 데이터, 키 불필요)
//
// A직원의 데이터 backbone. 공개 엔드포인트만 사용한다:
//   1) PostTitleListAsync.naver  → 글 목록(제목·logNo·작성일) 전체 페이지네이션
//   2) PostView.naver            → 본문 HTML → 텍스트
//
// ⚠️ 네이버 HTML/응답 구조는 수시로 바뀐다. 이 파서는 "깨질 것"을 전제로
//    작성됐다. 파싱 실패는 예외가 아니라 정상 케이스로 취급하고(parseStatus),
//    수집을 멈추지 않는다.
//
// ⚠️ 이용약관: 자동 대량 수집은 금지 대상. 본 코드는 "내(또는 내가 지정한)
//    블로그"의 개인 분석 용도로만 사용한다. 요청 간 랜덤 딜레이 + User-Agent 필수.
// ─────────────────────────────────────────────────────────────

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** 요청 간 사람 흉내 랜덤 딜레이 (기본 2~5초) */
export function humanDelay(minMs = 2000, maxMs = 5000): Promise<void> {
  const span = Math.max(0, maxMs - minMs);
  return sleep(minMs + Math.floor(Math.random() * (span + 1)));
}

/** URL 또는 아이디에서 네이버 블로그 ID 추출 */
export function parseBlogId(input: string): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = s.match(/blog\.naver\.com\/([^/?#\s]+)/i);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
  return null;
}

export interface PostMeta {
  logNo: string;
  title: string;
  /** ISO 날짜 문자열(YYYY-MM-DD) 또는 null(파싱 실패) */
  date: string | null;
  /** 1~12 또는 null */
  month: number | null;
  year: number | null;
}

export interface PostBody {
  logNo: string;
  bodyText: string;
  imageCount: number;
  /** ok | partial | failed */
  parseStatus: "ok" | "partial" | "failed";
}

// ── 날짜 파싱 ─────────────────────────────────────────────────
// PostTitleListAsync 의 addDate 는 "2018. 3. 5." / "2024. 11. 30." 형태가 많고,
// 아주 최근 글은 시각/상대표기로 오기도 한다. 방어적으로 YYYY. M. D 를 뽑는다.
function parseAddDate(raw: unknown): {
  date: string | null;
  month: number | null;
  year: number | null;
} {
  const s = String(raw ?? "").trim();
  const m = s.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (y >= 2000 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(
        2,
        "0"
      )}`;
      return { date: iso, month: mo, year: y };
    }
  }
  return { date: null, month: null, year: null };
}

interface RawPost {
  logNo?: unknown;
  title?: unknown;
  addDate?: unknown;
}

/**
 * 블로그 전체 글 목록을 페이지네이션으로 모두 수집.
 *  - maxPages 로 상한을 둔다(안전장치). countPerPage=30.
 *  - 실패/빈 페이지가 나오면 중단.
 */
export async function fetchAllPostMeta(
  blogId: string,
  opts: { maxPages?: number; countPerPage?: number; onProgress?: (n: number) => void } = {}
): Promise<PostMeta[]> {
  const countPerPage = opts.countPerPage ?? 30;
  const maxPages = opts.maxPages ?? 200; // 30*200 = 6000글 상한
  const out: PostMeta[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const url =
      `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(
        blogId
      )}&viewdate=&currentPage=${page}&categoryNo=0&parentCategoryNo=&countPerPage=${countPerPage}`;

    let list: RawPost[] = [];
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": UA,
          referer: `https://blog.naver.com/${blogId}`,
          accept: "application/json, text/plain, */*",
        },
      });
      if (!res.ok) break;
      const text = await res.text();
      const data = safeJson(text);
      const raw = (data?.postList ?? data?.PostList ?? []) as RawPost[];
      if (!Array.isArray(raw) || raw.length === 0) break;
      list = raw;
    } catch {
      break; // 네트워크/파싱 실패 → 지금까지 모은 것으로 진행
    }

    let added = 0;
    for (const p of list) {
      const logNo = String(p.logNo ?? "").trim();
      if (!logNo || seen.has(logNo)) continue;
      seen.add(logNo);
      const title = decodeTitle(p.title);
      const { date, month, year } = parseAddDate(p.addDate);
      out.push({ logNo, title, date, month, year });
      added++;
    }
    opts.onProgress?.(out.length);
    if (added === 0) break;

    await humanDelay(1500, 3500);
  }

  return out;
}

/** 본문 1건 수집: PostView.naver → 텍스트 + 이미지 수 */
export async function fetchPostBody(
  blogId: string,
  logNo: string
): Promise<PostBody> {
  const url = `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(
    blogId
  )}&logNo=${encodeURIComponent(logNo)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        referer: `https://blog.naver.com/${blogId}`,
      },
    });
    if (!res.ok) return { logNo, bodyText: "", imageCount: 0, parseStatus: "failed" };
    const html = await res.text();
    return extractBody(logNo, html);
  } catch {
    return { logNo, bodyText: "", imageCount: 0, parseStatus: "failed" };
  }
}

// ── HTML → 본문 텍스트 (SmartEditor ONE / 구버전 모두 방어적으로) ──
function extractBody(logNo: string, html: string): PostBody {
  // 1) SmartEditor ONE: <div class="se-main-container"> ... </div>
  // 2) 구버전:          <div id="postViewArea"> ... </div>
  const container =
    sliceByClass(html, "se-main-container") ?? sliceById(html, "postViewArea");

  const imageCount = countImages(container ?? html);

  if (!container) {
    // 컨테이너를 못 찾음 → 실패로 기록하되 전체에서라도 텍스트를 긁어 partial 제공
    const fallback = htmlToText(stripNoise(html));
    return {
      logNo,
      bodyText: fallback.slice(0, 20000),
      imageCount,
      parseStatus: fallback.length > 200 ? "partial" : "failed",
    };
  }

  const text = htmlToText(stripNoise(container));
  return {
    logNo,
    bodyText: text.slice(0, 20000),
    imageCount,
    parseStatus: text.length > 50 ? "ok" : "partial",
  };
}

function sliceByClass(html: string, cls: string): string | null {
  const start = html.search(new RegExp(`<div[^>]*class="[^"]*${cls}[^"]*"`, "i"));
  if (start < 0) return null;
  return balancedDiv(html, start);
}
function sliceById(html: string, id: string): string | null {
  const start = html.search(new RegExp(`<div[^>]*id="${id}"`, "i"));
  if (start < 0) return null;
  return balancedDiv(html, start);
}

/** 여는 <div> 부터 짝이 맞는 </div> 까지 대략적으로 잘라낸다(중첩 카운팅). */
function balancedDiv(html: string, start: number): string {
  let depth = 0;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  let end = html.length;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("</")) depth--;
    else depth++;
    if (depth === 0) {
      end = m.index + m[0].length;
      break;
    }
  }
  return html.slice(start, end);
}

function countImages(fragment: string): number {
  const imgs = fragment.match(/<img\b[^>]*>/gi) ?? [];
  // 네이버 UI 아이콘 등 제외: se-image 이거나 blogfiles/postfiles 도메인 위주로 카운트
  const real = imgs.filter((t) =>
    /se-image|postfiles|blogfiles|storep-phinf|mblogthumb|pstatic\.net/i.test(t)
  );
  return real.length || imgs.length;
}

function stripNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t​]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function decodeTitle(raw: unknown): string {
  let s = String(raw ?? "");
  try {
    s = decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    /* 이미 디코드됐거나 잘못된 인코딩 → 원문 유지 */
  }
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJson(text: string): { postList?: unknown; PostList?: unknown } | null {
  // 응답이 순수 JSON이 아닐 때(앞뒤 잡음)도 { ... } 구간만 뽑아 파싱 시도
  try {
    return JSON.parse(text);
  } catch {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(text.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
