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

/**
 * 1차 출시에서 제외된 리그 — 확장팩에서 이 Set을 비우면 전부 살아난다.
 *
 * ## 확장팩 복원 진행 상황 (2026-08-02, O-1·O-2)
 *
 * **게이트를 여는 것만으로는 아무것도 살아나지 않는다**(실측). 열었더니
 * 선수 0명인 리그에 일정만 1,740경기 깔리고 2시즌을 굴려도 결과가 0이었다.
 *
 * 붙여 둔 배선 — 전부 `isLeagueInScope` 뒤에 있어 **닫혀 있으면 안 돈다**:
 *  · `advanceWeek` W1에서 해외 로스터 활성화 → ABL 290명·JBL 175명 생성 확인
 *  · `growth.ts`가 반경 2(드리프트) 리그도 성장시킴 → 진출 시 수준 어긋남 방지
 *  · `leagueScheduler`에 해외 팜 일정 추가 (없어서 0경기였다)
 *  · `player_engine`의 해외 오퍼를 ABL·JBL 공통 경로로 (ABL 경로가 없었다)
 *  · `generation_rules.json`에 해외 팜 로스터 규칙 추가
 *
 * **아직 남은 것 — 그래서 다시 닫아 뒀다:**
 *  1. 해외 팜 로스터가 0명. refs에 `LEAGUE_*_FARM` leagueId가 **없고**
 *     `_2` 접미사로 파생하는 구조인데 `ensureLeagueActivatedV3`는
 *     `leagueId` 일치로만 팀을 찾는다
 *  2. **KBL이 오염된다** — 기준선 10팀 307명 → 게이트 연 뒤 34팀 447명.
 *     refs의 KBL 팀은 20개뿐인데 34개가 나온다. FA 재배치가 해외 선수를
 *     KBL로 보내는 것으로 보이며 원인 추적이 더 필요하다
 *
 * 2번이 국내를 망가뜨리므로 해결 전에는 열지 않는다.
 */
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
