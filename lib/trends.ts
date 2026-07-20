// 구글 트렌드 (오늘의 급상승 검색어, 한국) — 서버 전용, 키 불필요
//   RSS: https://trends.google.com/trending/rss?geo=KR

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").trim();
}

export interface TrendItem {
  term: string;
  traffic: string;
  newsTitle: string;
  newsUrl: string;
}

export async function fetchGoogleTrendsKR(): Promise<TrendItem[]> {
  const res = await fetch("https://trends.google.com/trending/rss?geo=KR", {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!res.ok) {
    throw new Error(`구글 트렌드 오류 (${res.status})`);
  }
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((it) => ({
      term: tag(it, "title"),
      traffic: tag(it, "ht:approx_traffic"),
      newsTitle: tag(it, "ht:news_item_title"),
      newsUrl: tag(it, "ht:news_item_url"),
    }))
    .filter((x) => x.term);
}
