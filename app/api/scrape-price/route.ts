import { NextResponse } from "next/server";

// [스캐폴드 — 미배포]
// 경쟁사(클룩/마이리얼트립/케이케이데이) 가격 스크래핑.
//
// ⚠️ 주의:
//   - 대상 3사 모두 JS 렌더 SPA + 봇 차단. 단순 fetch 는 실패 가능성이 높다.
//   - 각 사이트 이용약관 위반 소지가 있으므로, 상업적 반복 수집 전 약관 검토 필수.
//
// 권장 우선순위(설계):
//   ① 제휴사 공식 피드/API (가능하면 항상 이 방법)
//   ② 내부 JSON 엔드포인트 (브라우저 Network 탭에서 확인한 XHR)
//   ③ 헤드리스 브라우저 (playwright-core + @sparticuz/chromium) — 서버리스에서 무겁고 느림
//
// 성공 시: prices(product, site, price, scraped_at) 테이블에 매일 스냅샷 누적.

export const runtime = "nodejs";
export const maxDuration = 60;

interface ScrapeRequest {
  product?: string;
  /** 사이트별 상품 URL 또는 식별자 */
  targets?: { site: string; url: string }[];
}

export async function POST(request: Request) {
  let body: ScrapeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패." }, { status: 400 });
  }

  if (!body.targets || body.targets.length === 0) {
    return NextResponse.json(
      { error: "targets(사이트/URL 목록)가 필요합니다." },
      { status: 400 }
    );
  }

  // TODO(활성화): 위 우선순위에 따라 사이트별 가격 파서를 구현.
  //   - 공식 API 우선. 없으면 내부 JSON 엔드포인트.
  //   - 최후에만 @sparticuz/chromium 헤드리스.
  //   - 약관/robots 검토 결과를 함께 문서화할 것.
  return NextResponse.json(
    {
      error:
        "아직 구현되지 않음(스캐폴드). 약관 검토 + 수집 방식 확정 후 활성화. README 참고.",
    },
    { status: 501 }
  );
}
