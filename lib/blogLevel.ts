// 블로그 지수(레벨)별 "상위노출 현실성" 기준 — 클라이언트/서버 공용.
//
// 배경(도메인):
//  - 네이버 블로그는 지수(최적화 정도)에 따라 이길 수 있는 키워드 규모가 다르다.
//  - 지수가 낮은 블로그는 "검색량 대비 문서수(경쟁지수)"가 낮아도, 절대 문서수가
//    크면 1페이지 노출이 사실상 불가능하다. → 절대 문서수 상한이 핵심.
//  - 아래 문서수 상한/최소검색량은 네이버 랭킹이 비공개이므로 "추정 기준"이며,
//    UI에서 지수를 바꿔 조정할 수 있게 한다.

export interface BlogLevel {
  key: string;
  label: string;
  /** 추천 대상 최대 문서수(경쟁 글 수). 이보다 많으면 이 지수로 상위노출 어렵다고 봄. */
  maxDoc: number;
  /** 추천 대상 최소 월 검색량(노이즈 컷). */
  minSearch: number;
}

// 신생 → 준최1~6 → 최적. 준최6은 준최 중 가장 강함.
export const BLOG_LEVELS: BlogLevel[] = [
  { key: "new", label: "신생·일반", maxDoc: 3000, minSearch: 100 },
  { key: "j1", label: "준최 1", maxDoc: 5000, minSearch: 100 },
  { key: "j2", label: "준최 2", maxDoc: 8000, minSearch: 100 },
  { key: "j3", label: "준최 3", maxDoc: 12000, minSearch: 150 },
  { key: "j4", label: "준최 4", maxDoc: 17000, minSearch: 150 },
  { key: "j5", label: "준최 5", maxDoc: 23000, minSearch: 200 },
  { key: "j6", label: "준최 6", maxDoc: 30000, minSearch: 200 },
  { key: "opt", label: "최적", maxDoc: 80000, minSearch: 300 },
];

export const DEFAULT_LEVEL = "j6";

export function getLevel(key?: string | null): BlogLevel {
  return (
    BLOG_LEVELS.find((l) => l.key === key) ??
    BLOG_LEVELS.find((l) => l.key === DEFAULT_LEVEL)!
  );
}
