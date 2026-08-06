// 출시 범위 — **해외(ABL·JBL)가 열려 있다** (2026-08-06)
//
// 2026-07-30엔 확장팩으로 미뤄 뒀었다. 그때 남은 문제가 하나였고
// ("1군 로스터 캡이 해외에 안 걸린다 — 왜 안 잘리는지 아직 모른다"),
// 그게 풀려서 연다.
//
// ## 원인은 캡이 아니라 **운영이 KBL 전용**이었던 것
//
// Rust 캡은 정상이다 — 떼어 재보면 1군 14명 → 26명으로 정확히 자른다.
// 문제는 `market.ts`의 승강·FA·트레이드가 전부 `leagueId === "LEAGUE_KBL"`로
// 걸러져 있었다는 것이다. 열면 ABL·JBL은 **채우는 경로(Rust 오프시즌)는
// 있는데 정리하는 경로가 없는 리그**가 된다.
//
// 실측 (`npm run diag:roster`, 팀당 인원, 롤오버 직후):
//
//                일반화 전        일반화 후    상한
//     ABL          32~41           26~32       34
//     JBL          30~46           27~31       32
//     ABL_FARM     17~24           22~31       34
//     JBL_FARM     10~26           27~34       34
//     KBL          31~36           25~33       34
//
// ⚠ **시즌 중엔 국내도 넘는다** (KBL 36). 캡이 오프시즌에만 걸리기 때문이고
// 롤오버 뒤 잡힌다 — 결함이 아니다.
//
// ⚠ KBL이 유출로 마르지 않았다: 총원 301/10팀 = 팀당 30명(하한 26).
//
// ## 앞서 풀어 둔 것들 (게이트를 열어야 드러났던 것들)
//
//  ✅ 해외 팜 로스터 0명 (O-2a). `_2` 접미사로 파생한다
//  ✅ KBL 오염 (O-2c). `ids.leagueOfTeam`으로 팀에서 리그를 파생.
//     **원인은 국내 코드에 있었다** — 팀만 바꾸고 리그를 안 바꾸는 자리들
//  ✅ 팜 고갈 (F-0). 해외는 하부 파이프라인이 없으므로 매년 W1에 리그별
//     부족분을 직접 배정한다(`generateOverseasIntakeV3`)
//
// ## 되돌리려면
//
// `OUT_OF_SCOPE_LEAGUES`에 네 리그를 다시 넣으면 전부 닫힌다. 운영 코드는
// `activeProLeagues()`(`utils/ids.ts`)를 통해 이 Set을 보므로 **이 파일
// 하나가 스위치다** — 닫으면 예전과 완전히 같게 돈다.

/**
 * 지금 닫혀 있는 리그. **비어 있으면 전부 열려 있다.**
 *
 * ⚠ 여기 넣으면 그 리그는 화면에서도 사라지고 시뮬도 안 돈다(반경 3).
 * 드리프트만 돌려두면 **선수 없는 리그의 순위표가 화면에 뜬다.**
 */
export const OUT_OF_SCOPE_LEAGUES: ReadonlySet<string> = new Set([]);

/**
 * 도달할 수 없는 커리어 단계.
 *
 * ⚠ 리그를 열고 단계를 막으면 **NPC만 해외에 가고 주인공은 못 간다.**
 * 둘은 같이 열고 같이 닫는다.
 */
export const OUT_OF_SCOPE_STAGES: ReadonlySet<string> = new Set([]);

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
