// 골든키워드 계산 로직
//
// 배경(도메인):
//  - 키워드마스터에서 복사한 표를 붙여넣으면, 각 키워드의 월 검색량과 문서수를 받는다.
//  - 경쟁지수 = 문서수 / 검색량. 낮을수록 "검색은 많은데 경쟁 글은 적은" 황금 키워드.
//  - 100% 클라이언트에서 동작 (외부 API/키 불필요).

export interface KeywordRow {
  keyword: string;
  /** 월 검색량 (PC + 모바일 합산) */
  searchVol: number;
  /** 네이버 통합검색 문서수 */
  docCount: number;
  /** 경쟁지수 = docCount / searchVol (낮을수록 좋음). searchVol=0 이면 null */
  ratio: number | null;
}

/** 문자열에서 숫자만 추출 (쉼표/공백/화폐기호 제거). 실패 시 NaN */
export function parseNumber(raw: string): number {
  if (raw == null) return NaN;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return NaN;
  return Number(cleaned);
}

/**
 * 키워드마스터에서 복사한 텍스트를 파싱한다.
 * 지원 포맷 (행 단위, 탭 또는 2칸 이상 공백으로 컬럼 구분):
 *   키워드 <탭> 검색량 <탭> 문서수
 *   여행키워드   12,000   3,400
 * 헤더 행("키워드", "검색량" 등 텍스트만 있는 행)은 자동으로 건너뛴다.
 */
export function parseKeywordMaster(text: string): KeywordRow[] {
  const rows: KeywordRow[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 탭 우선, 없으면 2칸 이상 공백으로 분리
    const cols = trimmed.includes("\t")
      ? trimmed.split("\t")
      : trimmed.split(/\s{2,}/);

    if (cols.length < 3) continue;

    // 뒤에서부터 문서수, 검색량을 집는다(키워드에 공백이 있어도 안전).
    const docCount = parseNumber(cols[cols.length - 1]);
    const searchVol = parseNumber(cols[cols.length - 2]);
    const keyword = cols.slice(0, cols.length - 2).join(" ").trim();

    // 헤더/불완전 행 스킵
    if (!keyword) continue;
    if (Number.isNaN(searchVol) || Number.isNaN(docCount)) continue;

    rows.push({
      keyword,
      searchVol,
      docCount,
      ratio: computeRatio(searchVol, docCount),
    });
  }

  return rows;
}

/** 경쟁지수 계산. 검색량 0 이면 계산 불가(null). */
export function computeRatio(searchVol: number, docCount: number): number | null {
  if (!Number.isFinite(searchVol) || searchVol <= 0) return null;
  if (!Number.isFinite(docCount) || docCount < 0) return null;
  return docCount / searchVol;
}

/**
 * 경쟁지수 오름차순 정렬 (낮은 = 황금 키워드가 위로).
 * ratio가 null 인 행은 항상 맨 뒤로 보낸다.
 */
export function sortByRatio(rows: KeywordRow[]): KeywordRow[] {
  return [...rows].sort((a, b) => {
    if (a.ratio === null && b.ratio === null) return 0;
    if (a.ratio === null) return 1;
    if (b.ratio === null) return -1;
    return a.ratio - b.ratio;
  });
}

/** 경쟁지수 표시용 포맷. null 이면 "-", 그 외 소수 2자리. */
export function formatRatio(ratio: number | null): string {
  if (ratio === null) return "-";
  if (ratio < 0.01) return ratio.toFixed(4);
  return ratio.toFixed(2);
}

/** 경쟁지수 등급: 낮을수록 황금. UI 배지용. */
export type Grade = "golden" | "good" | "normal" | "hard" | "unknown";

export function grade(ratio: number | null): Grade {
  if (ratio === null) return "unknown";
  if (ratio < 0.1) return "golden";
  if (ratio < 1) return "good";
  if (ratio < 5) return "normal";
  return "hard";
}
