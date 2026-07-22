// ─────────────────────────────────────────────────────────────
// 브라우저 기반 네이버 수집기 (내 PC에서 실행 — 실제 크롬을 띄워 긁는다)
//
// 왜 브라우저인가:
//   - 네이버 블로그 본문은 iframe + JS 렌더라 raw fetch 파싱이 자주 깨진다.
//   - 실제 크롬으로 열면 사람이 보는 그대로의 DOM에서 텍스트를 뽑을 수 있다.
//   - (클라우드 실행 환경은 네이버 egress가 막혀 있어 못 씀 → 내 PC 전용.)
//
// 준비물(내 PC):
//   npm i -D playwright-core   (이미 devDependency에 있음)
//   시스템 크롬이 있으면 channel:"chrome" 로 그걸 그대로 씀(설치 불필요).
//   없으면  npx playwright install chromium  후 자동 사용.
//
// ⚠️ 로그인 없이 공개 글만. 요청 사이 사람 속도 딜레이. 개인 분석 용도.
// ─────────────────────────────────────────────────────────────

import type { Browser, Page } from "playwright-core";
import { humanDelay, type PostMeta, type PostBody } from "./naverBlog";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** 시스템 크롬 → 실패 시 playwright 내장 크로미움 순으로 실행 */
export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const tries: Array<() => Promise<Browser>> = [
    // 1) 내 PC에 설치된 크롬(가장 자연스러움 — "내 크롬")
    () => chromium.launch({ channel: "chrome", headless: true }),
    // 2) PLAYWRIGHT_BROWSERS_PATH 등에서 자동 탐색되는 크로미움
    () => chromium.launch({ headless: true }),
  ];
  let lastErr: unknown;
  for (const t of tries) {
    try {
      return await t();
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    "크롬을 못 띄웠습니다. 시스템 크롬이 없으면 `npx playwright install chromium` 후 다시 시도하세요.\n" +
      `원인: ${(lastErr as Error)?.message ?? lastErr}`
  );
}

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ userAgent: UA, locale: "ko-KR" });
  return ctx.newPage();
}

interface RawPost {
  logNo?: unknown;
  title?: unknown;
  addDate?: unknown;
}

function parseAddDate(raw: unknown) {
  const s = String(raw ?? "").trim();
  const m = s.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y >= 2000 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return {
        date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        month: mo,
        year: y,
      };
    }
  }
  return { date: null, month: null, year: null };
}

function decodeTitle(raw: unknown): string {
  let s = String(raw ?? "");
  try {
    s = decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    /* keep */
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

/** 브라우저로 전체 글 목록 수집 (PostTitleListAsync JSON을 페이지에서 읽음) */
export async function fetchAllPostMetaBrowser(
  browser: Browser,
  blogId: string,
  opts: { maxPages?: number; countPerPage?: number; onProgress?: (n: number) => void } = {}
): Promise<PostMeta[]> {
  const countPerPage = opts.countPerPage ?? 30;
  const maxPages = opts.maxPages ?? 200;
  const page = await newPage(browser);
  const out: PostMeta[] = [];
  const seen = new Set<string>();

  // 블로그 메인을 한 번 열어 세션/쿠키를 자연스럽게 확보
  await page.goto(`https://blog.naver.com/${blogId}`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await humanDelay(1500, 3000);

  for (let p = 1; p <= maxPages; p++) {
    const url = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(
      blogId
    )}&viewdate=&currentPage=${p}&categoryNo=0&parentCategoryNo=&countPerPage=${countPerPage}`;
    let list: RawPost[] = [];
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      if (!resp || !resp.ok()) break;
      const body = await page.evaluate(() => document.body.innerText);
      const data = JSON.parse(body);
      list = (data?.postList ?? []) as RawPost[];
    } catch {
      break;
    }
    if (!Array.isArray(list) || list.length === 0) break;

    let added = 0;
    for (const it of list) {
      const logNo = String(it.logNo ?? "").trim();
      if (!logNo || seen.has(logNo)) continue;
      seen.add(logNo);
      const { date, month, year } = parseAddDate(it.addDate);
      out.push({ logNo, title: decodeTitle(it.title), date, month, year });
      added++;
    }
    opts.onProgress?.(out.length);
    if (added === 0) break;
    await humanDelay(1500, 3500);
  }

  await page.context().close();
  return out;
}

/** 브라우저로 본문 1건 수집 — 실제 렌더된 DOM에서 텍스트/이미지 추출 */
export async function fetchPostBodyBrowser(
  browser: Browser,
  blogId: string,
  logNo: string
): Promise<PostBody> {
  const page = await newPage(browser);
  try {
    await page.goto(
      `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(
        blogId
      )}&logNo=${encodeURIComponent(logNo)}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );
    // 본문 컨테이너 등장 대기(둘 중 하나)
    await page
      .waitForSelector(".se-main-container, #postViewArea", { timeout: 8000 })
      .catch(() => {});

    const result = await page.evaluate(() => {
      const el =
        document.querySelector(".se-main-container") ||
        document.querySelector("#postViewArea");
      const imgs = el ? el.querySelectorAll("img") : document.querySelectorAll("img");
      const text = (el as HTMLElement | null)?.innerText ?? "";
      return { text: text.trim(), imageCount: imgs.length, found: !!el };
    });

    const bodyText = result.text.slice(0, 20000);
    return {
      logNo,
      bodyText,
      imageCount: result.imageCount,
      parseStatus: result.found && bodyText.length > 50 ? "ok" : bodyText.length > 200 ? "partial" : "failed",
    };
  } catch {
    return { logNo, bodyText: "", imageCount: 0, parseStatus: "failed" };
  } finally {
    await page.context().close();
  }
}
