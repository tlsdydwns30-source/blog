// 가격비교표 로직
//
// 배경(도메인):
//  - 클룩/마이리얼트립/케이케이데이 등 여행 액티비티 판매 사이트의 가격을 입력.
//  - 최저가를 판별하고, 블로그에 붙여넣을 마크다운 표 + "최저가 ○○에서 구매" 문구를 생성.
//  - 100% 클라이언트에서 동작 (외부 API/키 불필요).

export interface PriceEntry {
  /** 판매 사이트명 (예: 클룩, 마이리얼트립) */
  site: string;
  /** 가격(원). 미입력/비교불가면 null */
  price: number | null;
  /** 제휴 링크 (선택) */
  url?: string;
}

export interface PriceTable {
  /** 상품명 */
  product: string;
  entries: PriceEntry[];
}

/** 유효 가격이 있는 항목 중 최저가 항목을 반환. 없으면 null */
export function findLowest(entries: PriceEntry[]): PriceEntry | null {
  const valid = entries.filter(
    (e) => e.price !== null && Number.isFinite(e.price) && (e.price as number) > 0
  );
  if (valid.length === 0) return null;
  return valid.reduce((min, e) =>
    (e.price as number) < (min.price as number) ? e : min
  );
}

/** 1,234원 형태로 포맷 */
export function formatKRW(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "-";
  return `${price.toLocaleString("ko-KR")}원`;
}

function siteCell(entry: PriceEntry): string {
  return entry.url ? `[${entry.site}](${entry.url})` : entry.site;
}

/**
 * 블로그용 마크다운 생성:
 *   - 가격 비교 표 (최저가 행에 ✅ 표시)
 *   - "💰 최저가는 ○○에서 XX원" 요약 문구
 */
export function toMarkdown(table: PriceTable): string {
  const { product, entries } = table;
  const lowest = findLowest(entries);

  const lines: string[] = [];
  if (product.trim()) {
    lines.push(`### ${product.trim()} 가격 비교`, "");
  }
  lines.push("| 판매처 | 가격 | 비고 |", "| --- | --- | --- |");

  for (const e of entries) {
    const isLowest =
      lowest !== null &&
      e.site === lowest.site &&
      e.price === lowest.price &&
      e.price !== null;
    const note = isLowest ? "✅ 최저가" : "";
    lines.push(`| ${siteCell(e)} | ${formatKRW(e.price)} | ${note} |`);
  }

  lines.push("");
  if (lowest) {
    const where = lowest.url ? `[${lowest.site}](${lowest.url})` : lowest.site;
    lines.push(
      `> 💰 **최저가는 ${where}에서 ${formatKRW(lowest.price)}**`
    );
  }

  return lines.join("\n");
}
