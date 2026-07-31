// ── 화면에 보일 리그 고르기 ──────────────────────────────────────
//
// 이 판단이 `LeaguePage.svelte` 안에 있었고, 거기 박힌 전제가 낡아서
// **한 시즌 465경기가 도는 2군 리그가 화면에서 통째로 사라져 있었다.**
// 주석은 "팜리그는 경기 시뮬을 하지 않아(R5) 순위표가 항상 0-0"이었는데
// 그 시뮬은 되살아난 지 오래였다.
//
// 화면 안에 있으면 아무도 검사하지 못한다. 여기로 빼서 회귀가 조건으로
// 확인한다 — "경기가 도는 리그는 보여야 한다", "주인공 리그는 항상 보여야 한다".

import { isLeagueInScope } from "../config/releaseScope";
import type { LeagueSeasonState } from "../types/season";

/** 순위표에 고정으로 쓰는 표시 순서 */
export const LEAGUE_ORDER = [
  "LEAGUE_HIGHSCHOOL",
  "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL",     "LEAGUE_KBL_FARM",
  "LEAGUE_ABL",     "LEAGUE_ABL_FARM",
  "LEAGUE_JBL",     "LEAGUE_JBL_FARM",
];

export interface VisibilityInput {
  leagueState: Record<string, LeagueSeasonState>;
  /** 주인공 소속 리그 — **항상 보여야 한다.** 2군으로 강등돼도 마찬가지다 */
  myLeagueId: string;
  /** 아직 못 여는 리그 (진행도 잠금) */
  locked?: ReadonlySet<string>;
}

/**
 * 순위표 탭에 띄울 리그.
 *
 * 거르는 기준은 **출시 범위**와 **잠금** 둘뿐이다. "팜이라서", "배경이라서"처럼
 * 리그 성격으로 거르지 않는다 — 그런 조건은 전제가 바뀌어도 안 따라온다.
 */
export function visibleLeagueIds(inp: VisibilityInput): string[] {
  const locked = inp.locked ?? new Set<string>();
  const keys = new Set([...Object.keys(inp.leagueState).filter(Boolean), inp.myLeagueId].filter(Boolean));
  const ok = (lid: string) => isLeagueInScope(lid) && !locked.has(lid);

  const ordered = LEAGUE_ORDER.filter((lid) => keys.has(lid) && ok(lid));
  const extra   = [...keys].filter((lid) => !LEAGUE_ORDER.includes(lid) && ok(lid));
  const lockedV = [...keys].filter((lid) => locked.has(lid));
  return [...ordered, ...extra, ...lockedV];
}

/**
 * 리더보드(개인 기록) 탭에 띄울 리그.
 *
 * 팜리그도 넣는다 — 배경 시뮬이지만 기록은 실제로 쌓인다(2군 286명 실측).
 * 주인공 리그를 맨 앞에 둔다.
 */
export function leaderboardLeagueIds(inp: VisibilityInput): string[] {
  const locked = inp.locked ?? new Set<string>();
  const others = Object.keys(inp.leagueState).filter(
    (lid) => lid !== inp.myLeagueId && !locked.has(lid) && isLeagueInScope(lid),
  );
  return [inp.myLeagueId, ...others].filter(Boolean);
}

/**
 * 경기가 실제로 소화된 리그인가 — 회귀가 "이건 보여야 한다"를 판정하는 기준.
 *
 * 순위표의 승·패 합이 0보다 크면 그 리그는 돌고 있다는 뜻이다.
 */
export function hasPlayedGames(ls: LeagueSeasonState | undefined): boolean {
  const st = ls?.standings ?? [];
  return st.reduce((a, r) => a + (r.wins ?? 0) + (r.losses ?? 0) + (r.draws ?? 0), 0) > 0;
}
