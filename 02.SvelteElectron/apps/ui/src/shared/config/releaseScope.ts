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
 *  ✅ 해외 팜 로스터 0명 → 해결(O-2a). `_2` 접미사로 파생한다
 *  ✅ KBL 오염 → 해결(O-2c). `ids.leagueOfTeam`으로 팀에서 리그를 파생.
 *     **원인은 국내 코드에 있었다** — 팀만 바꾸고 리그를 안 바꾸는 자리들.
 *     해외를 켜야 드러났을 뿐이다
 *
 *  ✅ 팜 고갈 → 해결(F-0). 해외는 하부 파이프라인이 없으므로 매년 W1에
 *     리그별 부족분을 직접 배정한다(`generateOverseasIntakeV3`).
 *     ABL_FARM 544 → 184로 말라붙던 것이 544 → 445로 순환한다.
 *     해외 팜에 `rosterMin`(26)·`nationality`도 없어서 같이 채웠다.
 *
 *  ⚠ **남은 것: 1군 로스터 캡이 해외에 안 걸린다.**
 *
 *     실측 2시즌 (`npm run diag:roster`, 2026-08-06). 표는 팀당 인원이다:
 *
 *                    생성직후  26시즌끝  27W1   27시즌끝  28W1   상한
 *       ABL             없음    7~20    32~41   28~37   32~41   34
 *       ABL_FARM        없음    34      17~24   34      24~31   34
 *       JBL             없음    2~17    26~45   27~43   30~46   32
 *       KBL             30      34~38   31~36   36~37   30~34   34
 *
 *  ⚠ **국내도 시즌 중엔 넘는다** (KBL 38) — 캡은 오프시즌에만 걸리기
 *  때문이고, 롤오버 뒤엔 34로 잡힌다. **해외는 롤오버 뒤에도 안 잡힌다.**
 *  그게 국내와 다른 유일한 점이다.
 *
 *  ⚠ **새 게임은 해외를 아예 안 만든다** — 생성 직후 ABL·JBL이 0팀이다.
 *  첫 W1에 `generateOverseasIntakeV3`가 **팜만 가득 채우고**(34/34) 1군은
 *  거의 비운다(ABL 최소 7 · JBL 최소 2). 그 다음 롤오버에서 1군이 갑자기
 *  차오르며 상한을 넘는다 — ABL_FARM 544→325, ABL 231→574.
 *
 *  즉 **캡이 안 걸리는 게 아니라, 캡이 도는 시점과 채우는 시점이 어긋난다.**
 *  다음 할 일: 롤오버 안을 단계별로 쪼개 어느 단계가 1군을 채우는지 잰다
 *  (`fill_first_teams` / FA 재배치 / `generateOverseasIntakeV3` 셋 중).
 *
 * 정원 조정이 붙기 전에는 열지 않는다 — 국내는 이제 깨끗하다(KBL 10팀).
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
