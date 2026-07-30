// 1차 출시 범위 (2026-07-30 확정)
//
// **해외 리그(ABL·JBL)는 1차 출시에서 뺀다.** 나중에 확장팩으로 붙인다.
//
// 코드도 데이터도 **지우지 않는다.** refs.json에 팀이 그대로 있고, Rust 로스터
// 규칙·포스트시즌 브래킷·커리어 단계(pro_abl/pro_jbl)도 그대로다. 여기서
// **노출과 진행만 막는다.** 확장팩을 열 때 이 파일의 Set을 비우면 되돌아온다.
//
// 왜 이렇게 하나: 해외를 지우면 되살릴 때 그 코드를 다시 짜야 한다. 반대로
// 켜둔 채 두면 선수 없는 리그가 화면에 뜨고(순위표만 드리프트로 돌고 로스터는
// 비어 있다) 그게 더 이상해 보인다. 게이트 하나로 막는 게 양쪽을 다 피한다.

/** 1차 출시에서 제외된 리그 — 확장팩에서 이 Set을 비우면 전부 살아난다 */
export const OUT_OF_SCOPE_LEAGUES: ReadonlySet<string> = new Set([
  "LEAGUE_ABL",
  "LEAGUE_ABL_FARM",
  "LEAGUE_JBL",
  "LEAGUE_JBL_FARM",
]);

/** 1차 출시에서 도달할 수 없는 커리어 단계 (해외 진출) */
export const OUT_OF_SCOPE_STAGES: ReadonlySet<string> = new Set([
  "pro_abl",
  "pro_jbl",
]);

export function isLeagueInScope(leagueId: string): boolean {
  return !OUT_OF_SCOPE_LEAGUES.has(leagueId);
}

export function isStageInScope(careerStage: string): boolean {
  return !OUT_OF_SCOPE_STAGES.has(careerStage);
}

/** 리그 ID를 가진 무엇이든 범위 밖을 걸러낸다 (팀·순위·거래기록 목록 공통) */
export function inScope<T extends { leagueId: string }>(items: readonly T[]): T[] {
  return items.filter((x) => isLeagueInScope(x.leagueId));
}

/** 리그 ID 배열에서 범위 밖을 걸러낸다 */
export function scopedLeagueIds(ids: readonly string[]): string[] {
  return ids.filter(isLeagueInScope);
}

/**
 * 확장팩이 열려 있는가 (해외 리그가 하나라도 범위 안인가).
 *
 * 화면에서 "해외 진출" 같은 문구를 통째로 감출 때 쓴다 — 리그별로 묻는 것보다
 * 의도가 드러난다.
 */
export const OVERSEAS_ENABLED = OUT_OF_SCOPE_LEAGUES.size === 0;
