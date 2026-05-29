import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type { NpcInjuryEntry } from "../types/save";

export interface TeamRoster {
  rotation: string[];   // SP ID 순서 (최대 5명)
  bullpen: string[];    // RP/CP ID 목록
  closer: string;       // CP ID
  lineup: string[];     // 타자 출전 순서 (1번~9번)
}

const PLAY_THROUGH_OVR_MULT: Record<string, number> = { light: 0.88, moderate: 0.70 };

// ── 부상 필터링 + OVR 패널티 적용 ─────────────────────────────
function applyNpcInjuries(entities: EntityRow[], npcInjuries: Record<string, NpcInjuryEntry>): EntityRow[] {
  return entities.flatMap((e) => {
    const inj = npcInjuries[e.id];
    if (!inj) return [e];
    if (!inj.isPlayingThrough) return []; // benched
    const mult = PLAY_THROUGH_OVR_MULT[inj.severity] ?? 1.0;
    if (mult === 1.0) return [e];
    const pd = e.details.player as EntityPlayerDetails | undefined;
    if (!pd) return [e];
    const patchedPlayer: EntityPlayerDetails = {
      ...pd,
      pitching: pd.pitching ? { ...pd.pitching, ovr: Math.round((pd.pitching.ovr ?? 50) * mult) } : pd.pitching,
      batting:  pd.batting  ? { ...pd.batting,  ovr: Math.round((pd.batting.ovr  ?? 50) * mult) } : pd.batting,
    };
    return [{ ...e, details: { ...e.details, player: patchedPlayer } }];
  });
}

// ── 팀 엔티티 분류 ────────────────────────────────────────────
function getTeamPlayers(teamId: string, entities: EntityRow[], npcInjuries?: Record<string, NpcInjuryEntry>): EntityRow[] {
  const active = entities.filter(
    (e) => e.role === "player" && e.teamId === teamId && e.status === "active",
  );
  return npcInjuries ? applyNpcInjuries(active, npcInjuries) : active;
}

function playerDetails(e: EntityRow): EntityPlayerDetails {
  return e.details.player as EntityPlayerDetails;
}

// ── 선발 로테이션 자동 배정 ──────────────────────────────────
export function getTeamRotation(teamId: string, entities: EntityRow[], npcInjuries?: Record<string, NpcInjuryEntry>): string[] {
  const players = getTeamPlayers(teamId, entities, npcInjuries);
  const pitchers = players.filter((e) => playerDetails(e).playerType === "pitcher");

  // SP 우선 (positionRatings.SP 또는 position === "SP")
  const starters = pitchers
    .filter((e) => {
      const pos = playerDetails(e).position;
      return pos === "SP";
    })
    .sort((a, b) => (playerDetails(b).pitching?.ovr ?? 0) - (playerDetails(a).pitching?.ovr ?? 0))
    .slice(0, 5)
    .map((e) => e.id);

  // SP 5명 미만이면 RP 중 OVR 높은 순으로 보충
  if (starters.length < 5) {
    const rpFill = pitchers
      .filter((e) => !starters.includes(e.id))
      .sort((a, b) => (playerDetails(b).pitching?.ovr ?? 0) - (playerDetails(a).pitching?.ovr ?? 0))
      .slice(0, 5 - starters.length)
      .map((e) => e.id);
    starters.push(...rpFill);
  }

  return starters;
}

// ── 불펜 편성 ────────────────────────────────────────────────
export function getTeamBullpen(
  teamId: string,
  entities: EntityRow[],
  rotation: string[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
): { bullpen: string[]; closer: string } {
  const players = getTeamPlayers(teamId, entities, npcInjuries);
  const rotSet = new Set(rotation);
  const reliefs = players
    .filter(
      (e) =>
        playerDetails(e).playerType === "pitcher" &&
        !rotSet.has(e.id) &&
        (playerDetails(e).position === "RP" || playerDetails(e).position === "CP"),
    )
    .sort((a, b) => (playerDetails(b).pitching?.ovr ?? 0) - (playerDetails(a).pitching?.ovr ?? 0));

  // 마무리: CP 포지션 중 OVR 가장 높은 선수
  const cpCandidate = reliefs.find((e) => playerDetails(e).position === "CP");
  const closer = cpCandidate?.id ?? reliefs[0]?.id ?? "";

  const bullpen = reliefs.map((e) => e.id);
  return { bullpen, closer };
}

// ── 라인업(타순) 자동 배정 ──────────────────────────────────
const POSITION_PRIORITY = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "UT"];

export function getTeamLineup(teamId: string, entities: EntityRow[], npcInjuries?: Record<string, NpcInjuryEntry>): string[] {
  const players = getTeamPlayers(teamId, entities, npcInjuries);
  let batters = players.filter(
    (e) =>
      playerDetails(e).playerType === "batter" ||
      playerDetails(e).playerType === "twoWay",
  );
  // If a league/team has no batter-typed players, fall back to all active players
  // so simulations can still emit player lines instead of empty stat sheets.
  if (batters.length === 0) batters = players;

  // 포지션별 1명씩 최고 OVR 선택
  const used = new Set<string>();
  const positionPick: Record<string, string> = {};

  for (const pos of POSITION_PRIORITY) {
    const best = batters
      .filter((e) => !used.has(e.id) && playerDetails(e).position === pos)
      .sort((a, b) => (playerDetails(b).batting?.ovr ?? 0) - (playerDetails(a).batting?.ovr ?? 0))[0];
    if (best) {
      positionPick[pos] = best.id;
      used.add(best.id);
    }
  }

  // 포지션 미충족 시 남은 타자로 보충
  let remaining = batters
    .filter((e) => !used.has(e.id))
    .sort((a, b) => (playerDetails(b).batting?.ovr ?? 0) - (playerDetails(a).batting?.ovr ?? 0));

  const lineup9: string[] = [];
  for (const pos of POSITION_PRIORITY) {
    if (positionPick[pos]) lineup9.push(positionPick[pos]);
    if (lineup9.length >= 9) break;
  }
  while (lineup9.length < 9 && remaining.length > 0) {
    const next = remaining.shift()!;
    lineup9.push(next.id);
  }

  // 타순 정렬: 1번(출루율 높음) → 3·4번(파워·컨택) → 나머지
  return sortBattingOrder(lineup9, entities);
}

function sortBattingOrder(ids: string[], entities: EntityRow[]): string[] {
  if (ids.length === 0) return [];

  const map = new Map(entities.map((e) => [e.id, e]));
  const scored = ids.map((id) => {
    const e = map.get(id);
    if (!e) return { id, lead: 0, power: 0, contact: 0 };
    const b = playerDetails(e).batting;
    const lead    = (b?.eye ?? 50) + (b?.speed ?? 50);
    const power   = (b?.power ?? 50) + (b?.contact ?? 50);
    const contact = b?.contact ?? 50;
    return { id, lead, power, contact };
  });

  if (scored.length < 3) return scored.map((s) => s.id);

  // 리드오프: lead 최고, 클린업: power 최고 (3·4번)
  scored.sort((a, b) => b.lead - a.lead);
  const leadoff = scored.shift()!;
  scored.sort((a, b) => b.power - a.power);
  const cleanup = [scored.shift(), scored.shift()].filter((s): s is typeof scored[0] => !!s);
  const rest = scored.map((s) => s.id);

  return [leadoff.id, rest[0] ?? "", ...cleanup.map((c) => c.id), ...rest.slice(1)].filter(Boolean);
}

// ── 팀 전체 로스터 한 번에 생성 ─────────────────────────────
export function buildTeamRoster(teamId: string, entities: EntityRow[], npcInjuries?: Record<string, NpcInjuryEntry>): TeamRoster {
  const rotation = getTeamRotation(teamId, entities, npcInjuries);
  const { bullpen, closer } = getTeamBullpen(teamId, entities, rotation, npcInjuries);
  const lineup = getTeamLineup(teamId, entities, npcInjuries);
  return { rotation, bullpen, closer, lineup };
}
