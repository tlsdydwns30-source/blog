// 시기(계절/월/주차) 헬퍼 — B직원이 "지금 시기에 맞는" 주제를 고를 때 사용.

export interface SeasonNow {
  year: number;
  month: number; // 1~12
  day: number;
  isoWeek: number; // 1~53
  monthLabel: string; // "7월"
  seasonLabel: string; // "한여름/휴가철"
}

export function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// 월 → 한국 감성 계절 라벨(글감 분위기용). 단순 매핑.
const SEASON: Record<number, string> = {
  1: "한겨울/새해",
  2: "늦겨울/졸업·설",
  3: "초봄/개학·꽃샘추위",
  4: "봄/벚꽃·나들이",
  5: "늦봄/가정의달·여행",
  6: "초여름/장마 전",
  7: "한여름/휴가철",
  8: "늦여름/휴가·막바지",
  9: "초가을/추석·단풍 시작",
  10: "가을/단풍·축제",
  11: "늦가을/겨울 채비",
  12: "겨울/연말·크리스마스",
};

/** 기준 시각(기본 now, KST)의 시기 정보 */
export function seasonNow(base?: Date): SeasonNow {
  // KST(UTC+9) 기준으로 월/주차 계산
  const now = base ?? new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const month = kst.getUTCMonth() + 1;
  return {
    year: kst.getUTCFullYear(),
    month,
    day: kst.getUTCDate(),
    isoWeek: isoWeek(kst),
    monthLabel: `${month}월`,
    seasonLabel: SEASON[month] ?? "",
  };
}

/** 대상 월 목록: 이번 달 + 다음 달(선점을 위해 조금 앞선 시기 포함) */
export function targetMonths(now: SeasonNow): number[] {
  const next = (now.month % 12) + 1;
  return [now.month, next];
}
