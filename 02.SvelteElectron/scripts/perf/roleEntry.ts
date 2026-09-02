// 보직 배정 계측 전용 진입점 (2026-09-03).
//
// **규칙을 여기 다시 적지 않는다.** 세계는 `perfEntry.boot`(= App.svelte
// onMount + NewGamePage.doStartGame 과 같은 순서)가 만들고, 보직은
// `shared/utils/pitcherRoleEngine.assignHighschoolPosition` 을 그대로 부른다
// (그 안에서 Rust `assignHighschoolPositionNative` 가 판정한다).
//
// 헤드리스가 `perfEntry.ts` 하나만 번들하므로, 그 모듈 그래프를 공유하려고
// `boot` 을 여기서 다시 export 한다 — 스토어 인스턴스가 갈리면 세계가 둘이 된다.

import { get } from "svelte/store";
import { masterStore } from "../../apps/ui/src/shared/stores/master";
import { assignHighschoolPosition } from "../../apps/ui/src/shared/utils/pitcherRoleEngine";
import { HS_REGIONS } from "../../apps/ui/src/shared/utils/leagueTeams.generated";
import { hsRegionMeta } from "../../apps/ui/src/shared/utils/hsRegionLabel";

export { boot } from "./perfEntry";

const HS = "LEAGUE_HIGHSCHOOL";

/**
 * 세계를 만들기 **전**의 상태. `NewGamePage.doStartGame` 이 보직을 정하는
 * 시점이 정확히 여기다 — `masterStore.load()` 는 끝났지만 슬롯은 아직 없다.
 */
export async function preWorldProbe(sampleTeamId: string, ovr: number) {
  await masterStore.load();
  const ents = get(masterStore).entities;
  const players = ents.filter((e) => e.role === "player");
  const hsPitchers = players.filter(
    (e) => e.teamId === sampleTeamId
      && (e.details as any)?.player?.playerType === "pitcher");
  const position = await assignHighschoolPosition(
    { teamId: sampleTeamId, pitching: { ovr } as any }, ents);
  return { entities: ents.length, players: players.length,
           teamPitchers: hsPitchers.length, position };
}

const regionOf = (teamId: string): string => {
  for (const [rid, ids] of Object.entries(HS_REGIONS as Record<string, readonly string[]>)) {
    if (ids.includes(teamId)) return rid;
  }
  return "?";
};

export interface TeamRoleRow {
  teamId: string;
  name: string;
  power: number | null;
  region: string;
  roster: number;
  pitchers: number;
  /** 팀 투수 OVR 상위 셋 — 판정 문턱(나보다 높은 투수 3명)이 걸리는 자리 */
  top3: number[];
  /** ovr → { position, higher } */
  byOvr: Record<string, { position: string; higher: number }>;
}

/**
 * 고교 102팀 × 주어진 OVR 들에 대해 `assignHighschoolPosition` 을 그대로 부른다.
 * `higher` 는 보고용 부수 집계일 뿐 판정에 쓰지 않는다.
 */
export async function hsRoleTable(ovrs: number[]): Promise<TeamRoleRow[]> {
  const m = get(masterStore);
  const ents = m.entities;
  const teams = (m.teams ?? []).filter((t) => t.leagueId === HS);
  const rows: TeamRoleRow[] = [];
  for (const t of teams) {
    const roster = ents.filter((e) => e.teamId === t.id && e.role === "player").length;
    const teamPitcherOvrs = ents
      .filter((e) => e.teamId === t.id && e.role === "player"
        && (e.details as any)?.player?.playerType === "pitcher")
      .map((e) => Number((e.details as any)?.player?.pitching?.ovr ?? 0))
      .sort((a, b) => b - a);
    const byOvr: TeamRoleRow["byOvr"] = {};
    for (const ovr of ovrs) {
      const position = await assignHighschoolPosition(
        { teamId: t.id, pitching: { ovr } as any }, ents);
      byOvr[String(ovr)] = {
        position,
        higher: teamPitcherOvrs.filter((o) => o > ovr).length,
      };
    }
    rows.push({
      teamId: t.id, name: t.name, power: (t as any).power ?? null,
      region: hsRegionMeta(regionOf(t.id)).label,
      roster,
      pitchers: teamPitcherOvrs.length,
      top3: teamPitcherOvrs.slice(0, 3),
      byOvr,
    });
  }
  return rows;
}

// ── W1 재배정이 실제로 도는가 ─────────────────────────────────
import { gameStore } from "../../apps/ui/src/shared/stores/game";
import { seasonStore } from "../../apps/ui/src/shared/stores/season";
export { oneWeek } from "./perfEntry";

export function heroProbe() {
  const p = get(gameStore).protagonist;
  const ents = get(masterStore).entities;
  const teamPitcherOvrs = ents
    .filter((e) => e.teamId === p.teamId && e.role === "player"
      && (e.details as any)?.player?.playerType === "pitcher")
    .map((e) => Number((e.details as any)?.player?.pitching?.ovr ?? 0))
    .sort((a, b) => b - a);
  return {
    week: get(seasonStore).currentWeek,
    teamId: p.teamId, ovr: p.pitching.ovr,
    position: p.position, currentRole: (p as any).currentRole ?? null,
    teamPitcherOvrs,
  };
}
