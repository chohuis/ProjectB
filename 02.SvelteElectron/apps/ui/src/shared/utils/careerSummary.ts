import type { CareerSeasonRecord } from "../types/save";

/** 슬롯 목록·인트로가 쓰는 통산 요약 */
export interface CareerSummary {
  /** 통산 승 */
  w: number;
  /** 통산 패 */
  l: number;
  /** 통산 평균자책점. 이닝이 0이면 빈 문자열 */
  era: string;
  /** 뛴 시즌 수 */
  seasons: number;
}

/**
 * 시즌 기록을 통산으로 합친다.
 *
 * ⚠ **ERA는 시즌 ERA의 평균이 아니다.** 자책점 합 × 9 ÷ 이닝 합이다.
 * 평균으로 내면 5이닝만 던진 시즌과 180이닝 시즌이 같은 무게를 갖는다 —
 * 데뷔 시즌이나 부상 시즌 하나가 통산 기록을 통째로 흔든다.
 *
 * ⚠ 이닝은 야구식 표기(0.1 = 1아웃)라 그냥 더하면 안 된다. 아웃으로
 * 환산해 더한 뒤 되돌린다 — `92.2 + 0.2`는 `92.4`가 아니라 `93.1`이다.
 */
export function careerSummaryOf(records: readonly CareerSeasonRecord[]): CareerSummary {
  let w = 0, l = 0, outs = 0, er = 0, seasons = 0;

  for (const r of records) {
    const st = r.stats;
    if (!st || st.type !== "pitcher") continue;
    seasons++;
    w += st.w ?? 0;
    l += st.l ?? 0;
    er += st.er ?? 0;
    outs += inningsToOuts(st.ip ?? 0);
  }

  const ip = outs / 3;
  return {
    w, l, seasons,
    era: ip > 0 ? (Math.round((er * 9 / ip) * 100) / 100).toFixed(2) : "",
  };
}

/** 야구식 이닝(6.2 = 6과 2/3)을 아웃 수로 */
export function inningsToOuts(ip: number): number {
  const whole = Math.floor(ip);
  // 소수부는 0·1·2만 유효하다. 부동소수 오차를 반올림으로 흡수한다
  const frac = Math.round((ip - whole) * 10);
  return whole * 3 + (frac >= 1 && frac <= 2 ? frac : 0);
}
