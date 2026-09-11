// ── 내 위치 계산 (순수 함수) ────────────────────────────────────
//
// **메시지를 만들지 않는다.** 여기 있던 뉴스 두 종(`buildMyRankMessage`
// `buildNeighborDigest`)은 2026-08-08에 `digest.ts`의 통합 다이제스트로
// 흡수됐다 — 같은 성격의 소식이 네 갈래로 각자 주기를 들고 오고 있었고,
// 그중 `msg-neighbor`가 **고교 시즌당 50.3통**으로 메일함의 16%였다
// (실측 `measure:messagekinds`).
//
// 남은 것은 조립기가 가져다 쓰는 계산·표기뿐이다:
//   `calcMyRank`  권역 순위 + 전국 순위 (권역마다 팀 수가 달라 둘 다 필요하다)
//   `pctStr`      승률 표기 — **1.000의 앞자리를 살린다**
//   `RegionNamer` 권역 표시명 조회 함수 타입
//
// ⚠ 새 시뮬을 돌리지 않는다. 이미 있는 `standings`·`HS_REGIONS`만 다시 읽는다.

import { regionRankings } from "../../utils/tournament";
import { HS_REGIONS } from "../../utils/leagueScheduler";
import type { LeagueSeasonState, Standing } from "../../types/season";
import type { MessageItem } from "../../types/main";

/**
 * 권역 표시명.
 *
 * ⚠ **손으로 표를 만들지 않는다.** 처음엔 구장ID→지역명 맵을 적었는데
 * 8개 중 하나를 빠뜨려 화면에 `YEONGSAN권역`이 그대로 찍혔다. 권역 키는
 * 구장 ID이고 이름은 `refs.json`의 `stadiums`에 있으니 거기서 읽는다.
 *
 * 호출부가 조회 함수를 넘긴다 — 이 모듈이 masterStore를 직접 보면
 * 순수 함수가 아니게 되고 회귀에서 못 쓴다.
 */
export type RegionNamer = (stadiumId: string) => string;

/**
 * 승률 표기 — `.526` 형식. **1.000은 앞자리를 살린다.**
 * (`.1000`으로 찍혀서 열 자리가 밀리는 걸 실측에서 봤다)
 */
export const pctStr = (v: number) =>
  v >= 1 ? "1.000" : `.${String(Math.round(v * 1000)).padStart(3, "0")}`;

// ── #3. 내 팀 순위 정기 요약 ─────────────────────────────────────

/** 월 1회 보낸다 — 4주마다가 아니라 "달이 바뀌는 주"에 맞춘다 */

export interface MyRankResult {
  regionId: string;
  regionRank: number;
  regionTotal: number;
  nationalRank: number;
  nationalTotal: number;
}

/**
 * 내 팀이 권역에서 몇 위, 전국에서 몇 위인가.
 *
 * 전국 순위는 **권역과 무관하게 승률로 줄 세운 것**이다. 권역마다 팀 수가
 * 달라(제주 2팀 ~ 충청 12팀) 권역 순위만으로는 전국 위치를 알 수 없다.
 */
export function calcMyRank(
  standings: Standing[],
  myTeamId: string,
  regions: Record<string, string[]> = HS_REGIONS,
): MyRankResult | null {
  if (!myTeamId || standings.length === 0) return null;

  const regs = regionRankings(standings, regions);
  const mine = regs.find((r) => r.rankedTeams.includes(myTeamId));
  if (!mine) return null;

  // 전국 순위 — 정렬 기준을 권역 순위와 같게 둔다. 다르면 "권역 1위인데
  // 전국 30위" 같은 설명 불가능한 조합이 나온다
  const national = [...standings].sort(
    (a, b) =>
      b.winPct - a.winPct ||
      b.runsFor - a.runsFor ||
      a.runsAgainst - b.runsAgainst ||
      a.teamId.localeCompare(b.teamId),
  );
  const nIdx = national.findIndex((s) => s.teamId === myTeamId);
  if (nIdx < 0) return null;

  return {
    regionId: mine.regionId,
    regionRank: mine.rankedTeams.indexOf(myTeamId) + 1,
    regionTotal: mine.rankedTeams.length,
    nationalRank: nIdx + 1,
    nationalTotal: national.length,
  };
}
