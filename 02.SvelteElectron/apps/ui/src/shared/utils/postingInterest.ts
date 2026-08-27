// ── 해외 구단이 주인공에게 관심을 갖는가 ──────────────────────
//
// 🔴 **1단계에서 후보 풀만 열었더니 OVR 75~77에게 해외 제안이 84%였다**
//    (8시즌 × 3회 실측). 조건이 없으면 KBL에 남을 이유가 사라진다.
//
// ⚠ **새 축을 만들지 않는다.** 드래프트 판정(`determine_protagonist_draft`)이
//   이미 **또래 백분위 + OVR 정규화 + 보정**으로 돈다. 같은 모양을 쓴다 —
//   그래야 "잘 키우면 진로가 열린다"는 관계가 두 자리에서 같게 읽힌다.
//
// ⚠ **팀 상대로 본다.** 실측(2026-08-27, 투수 OVR):
//       ABL 1군 평균 80 · 최강 85 · 최약 73   격차 12
//       JBL 1군 평균 78 · 최강 84 · 최약 69   격차 15
//       KBL 1군 평균 73 · 최강 77 · 최약 66   격차 11
//   **리그 차이(7)보다 팀 간 격차(11~15)가 크다.** 단일 문턱은 뜻이 없다 —
//   OVR 78이 ABL 최약체엔 에이스급인데 최강팀엔 하위권이다.

/** 관심도가 이 값을 넘어야 제안이 온다 */
export const POSTING_INTEREST_MIN = 50;

/**
 * **리그별 최소선** — 관심도 위에 얹는 바닥이다.
 *
 * 🔴 이 값은 새로 지은 게 아니다. `player_engine.rs`의 `OVERSEAS_ROUTES`에
 *   있던 것을 **옮겨 왔다**(2026-08-27). 그쪽은 후보 풀과 별개로 해외 팀을
 *   무작위로 더 얹는 **두 번째 문**이었고, 관심도 판정·정원·외국인 한도를
 *   전부 우회했다. 1단계가 풀을 열면서 같은 일을 하는 길이 둘이 됐다.
 *
 * ⚠ **문턱 차이가 위계다. ABL이 위다** — `league_salary_mult`가 ABL 3.5 /
 *   JBL 2.0이고 로스터 OVR도 62~92 vs 60~90이다.
 *   (한 번 거꾸로 잡은 적이 있다 — JBL 문턱을 더 높게 뒀는데 연봉은 ABL이
 *   1.75배였다.)
 *
 * ⚠ 값을 바꾸지 않았다. 옮기기만 했다 — 여기서 수치를 손대면 이동 전후를 못 잰다.
 */
export const OVERSEAS_FLOOR: Record<string, { ovr: number; fame: number }> = {
  LEAGUE_ABL: { ovr: 70, fame: 30 },
  LEAGUE_JBL: { ovr: 62, fame: 15 },
};

export interface PostingInput {
  /** 그 팀 로스터 투수들의 OVR — 팀 상대 판정의 근거 */
  teamPitcherOvrs: readonly number[];
  pitchingOvr: number;
  /** 종합 평가 — 훈련·순위·성적이 쌓인다 */
  scoutScore: number;
  fame: number;
  proServiceYears: number;
  /** 수상 횟수 */
  awardCount: number;
  /** 최근 시즌 평균자책점. 없으면 판단 재료가 없다는 뜻이다 */
  recentEra?: number;
}

/**
 * 관심도 0~100.
 *
 * ⚠ **팀 로스터가 안 넘어오면 OVR을 백분위처럼 본다.** 드래프트 판정이
 *   같은 폴백을 쓴다 — 조용히 0을 쓰면 전 구단이 관심 없음이 되어,
 *   배선이 빠졌을 때 "아무도 안 부른다"로 나타나 원인을 못 찾는다.
 */
export function postingInterest(p: PostingInput): number {
  // ① 그 팀에서 몇 퍼센타일인가 — 팀 전력★이 여기 자동으로 반영된다
  const pool = p.teamPitcherOvrs;
  const pct = pool.length === 0
    ? p.pitchingOvr
    : pool.filter((o) => o < p.pitchingOvr).length / pool.length * 100;

  // ② 순수 실력 — 팀운과 무관한 축. 백분위만 쓰면 약체 팀이 너무 쉬워진다
  //   ⚠ 척도는 프로 띠(55~95)다. 드래프트는 고졸 띠(40~85)라 다르다
  const ovrNorm = Math.min(100, Math.max(0, (p.pitchingOvr - 55) / 40 * 100));

  const base = pct * 0.6 + ovrNorm * 0.4;

  // ③ 종합 평가 — 훈련·순위·성적이 쌓인 값
  const scoutAdj = (p.scoutScore - 30) * 0.20;

  // ④ 성적 — **최근 한 시즌**. 없으면 0(중립)이다.
  //   ⚠ 없는 것을 나쁨으로 보면 안 된다 — 부상·2군 체류로 표본이 없을 수 있다
  const eraAdj = p.recentEra === undefined ? 0
    : Math.max(-12, Math.min(12, (4.20 - p.recentEra) * 4));

  // ⑤ 명성·수상 — 시장이 아는 이름인가
  const fameAdj = (p.fame - 40) * 0.12;
  const awardAdj = p.awardCount * 5;

  // ⑥ 연차 — **어릴수록 산다.** 서른 넘어 나가는 건 드물다
  //   ⚠ KBL FA가 5년차라 그 근처를 중립으로 둔다
  const yearAdj = p.proServiceYears <= 2 ? -8
    : p.proServiceYears <= 7 ? 0 : -(p.proServiceYears - 7) * 2.5;

  return Math.max(0, Math.min(100,
    base + scoutAdj + eraAdj + fameAdj + awardAdj + yearAdj));
}
