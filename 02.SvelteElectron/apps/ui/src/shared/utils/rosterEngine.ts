import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type { NpcInjuryEntry } from "../types/save";
import type { PlayerCondition } from "../types/season";

export interface TeamRoster {
  rotation: string[];   // SP ID 순서 (리그별 최대 2~5명)
  bullpen: string[];    // RP/CP ID 목록
  closer: string;       // CP ID
  lineup: string[];     // 타자 출전 순서 (1번~9번)
}

// ── 리그별 SP 의무 휴식 경기 수 ────────────────────────────────
export function rotationRestGames(leagueId: string): number {
  if (leagueId === "LEAGUE_HIGHSCHOOL")  return 2;
  if (leagueId === "LEAGUE_UNIVERSITY")  return 2;
  if (leagueId === "LEAGUE_INDEPENDENT") return 2;
  return 4;  // 프로 (KBL, ABL, JBL)
}

// ── 유효 OVR 계산 (피로·휴식·부상 반영) ───────────────────────
function calcEffectiveOvr(
  baseOvr: number,
  condition: PlayerCondition | undefined,
  currentWeek: number,
): number {
  if (!condition) return baseOvr;

  // fatigue: 100=완전회복, 낮을수록 피로
  const fatF = condition.fatigue >= 70 ? 1.00
             : condition.fatigue >= 50 ? 0.90
             : condition.fatigue >= 30 ? 0.80
             : 0.65;

  // 마지막 등판 이후 경과 주 수
  const weeksRested = condition.lastPitchedWeek > 0
    ? currentWeek - condition.lastPitchedWeek : 99;
  const restF = weeksRested >= 2 ? 1.00
              : weeksRested === 1 ? 0.85
              : 0.55;  // 직전 주 등판 → 로테이션 후순위로 밀림

  return Math.round(baseOvr * fatF * restF);
}

// ── handlePersonnel 기반 선도 점수 ────────────────────────────
// handlePersonnel > 50: 최근 쉰 선수 선호 → 자연스러운 로테이션
// handlePersonnel < 50: OVR 위주 → 같은 선수 반복 기용
function freshnessBonus(
  lastAppearanceGameCount: number | undefined,
  teamGameCount: number,
  handlePersonnel: number,
): number {
  const gamesSince = lastAppearanceGameCount !== undefined
    ? teamGameCount - lastAppearanceGameCount
    : 99;  // 한 번도 안 나온 선수 → 가장 신선
  return gamesSince * (handlePersonnel - 50) * 0.3;
}

// 리그(careerStage)별 로테이션 크기
export function rotationSizeForStage(careerStage: string): number {
  if (careerStage === "highschool")  return 3;
  if (careerStage === "university")  return 3;
  if (careerStage === "independent") return 4;
  return 5; // pro_kbl, pro_abl, pro_jbl
}

// 리그 ID 기반 로테이션 크기 (UI 표시용)
export function rotationSizeForLeague(leagueId: string): number {
  if (leagueId === "LEAGUE_HIGHSCHOOL")  return 3;
  if (leagueId === "LEAGUE_UNIVERSITY")  return 3;
  if (leagueId === "LEAGUE_INDEPENDENT") return 4;
  return 5;
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
function getTeamPlayers(teamId: string, entities: EntityRow[], npcInjuries?: Record<string, NpcInjuryEntry>, npcRetired?: string[]): EntityRow[] {
  const retiredSet = new Set(npcRetired ?? []);
  const active = entities.filter(
    (e) => e.role === "player" && e.teamId === teamId && e.status === "active" && !retiredSet.has(e.id),
  );
  return npcInjuries ? applyNpcInjuries(active, npcInjuries) : active;
}

function playerDetails(e: EntityRow): EntityPlayerDetails {
  return e.details.player as EntityPlayerDetails;
}

// ── SP 가용 여부 판단 ─────────────────────────────────────────
function isSpAvailable(
  condition: PlayerCondition | undefined,
  teamGameCount: number,
  restRequired: number,
): boolean {
  if (!condition?.lastStartGameCount) return true;  // 첫 등판 or 기록 없음
  return (teamGameCount - condition.lastStartGameCount) > restRequired;
}

// ── 선발 로테이션 자동 배정 ──────────────────────────────────
export function getTeamRotation(
  teamId: string,
  entities: EntityRow[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
  maxRotation = 5,
  conditions?: Record<string, PlayerCondition>,
  currentWeek = 0,
  teamGameCount?: number,
  leagueId?: string,
  npcRetired?: string[],
): string[] {
  const players = getTeamPlayers(teamId, entities, npcInjuries, npcRetired);
  const pitchers = players.filter((e) => playerDetails(e).playerType === "pitcher");

  const restRequired = leagueId ? rotationRestGames(leagueId) : 4;
  const gameCount = teamGameCount ?? 0;

  const effOvr = (e: EntityRow) =>
    calcEffectiveOvr(playerDetails(e).pitching?.ovr ?? 0, conditions?.[e.id], currentWeek);

  const allSp = pitchers.filter((e) => playerDetails(e).position === "SP");

  // 1순위: 휴식 완료된 SP → effectiveOvr 내림차순
  const availableSp = allSp
    .filter((e) => isSpAvailable(conditions?.[e.id], gameCount, restRequired))
    .sort((a, b) => effOvr(b) - effOvr(a))
    .slice(0, maxRotation)
    .map((e) => e.id);

  // 2순위: 부족하면 휴식 중인 SP 중 lastStartGameCount 가장 작은 순 (가장 오래 쉰 순)
  if (availableSp.length < maxRotation) {
    const restingSp = allSp
      .filter((e) => !availableSp.includes(e.id))
      .sort((a, b) => {
        const ga = conditions?.[a.id]?.lastStartGameCount ?? 0;
        const gb = conditions?.[b.id]?.lastStartGameCount ?? 0;
        return ga - gb;
      })
      .slice(0, maxRotation - availableSp.length)
      .map((e) => e.id);
    availableSp.push(...restingSp);
  }

  // SP 부족 시 RP 중 effectiveOvr 높은 순으로 보충
  if (availableSp.length < maxRotation) {
    const rpFill = pitchers
      .filter((e) => !availableSp.includes(e.id))
      .sort((a, b) => effOvr(b) - effOvr(a))
      .slice(0, maxRotation - availableSp.length)
      .map((e) => e.id);
    availableSp.push(...rpFill);
  }

  return availableSp;
}

// ── 불펜 편성 ────────────────────────────────────────────────
export function getTeamBullpen(
  teamId: string,
  entities: EntityRow[],
  rotation: string[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
  conditions?: Record<string, PlayerCondition>,
  teamGameCount = 0,
  handlePersonnel = 50,
  npcRetired?: string[],
): { bullpen: string[]; closer: string } {
  const players = getTeamPlayers(teamId, entities, npcInjuries, npcRetired);
  const rotSet = new Set(rotation);

  const reliefs = players.filter(
    (e) =>
      playerDetails(e).playerType === "pitcher" &&
      !rotSet.has(e.id) &&
      (playerDetails(e).position === "RP" || playerDetails(e).position === "CP"),
  );

  // RP: consecutiveAppearances >= 2 → 의무 휴식
  const availableRp = reliefs.filter((e) => {
    const pos = playerDetails(e).position;
    if (pos === "CP") return true;  // CP는 별도 처리
    const consec = conditions?.[e.id]?.consecutiveAppearances ?? 0;
    return consec < 2;
  });

  // CP: consecutiveAppearances >= 3 → 의무 휴식
  const availableCp = reliefs.filter((e) => {
    const pos = playerDetails(e).position;
    if (pos !== "CP") return false;
    const consec = conditions?.[e.id]?.consecutiveAppearances ?? 0;
    return consec < 3;
  });

  // 선택 점수 = effectiveOvr + freshnessBonus
  const score = (e: EntityRow) => {
    const ovr = playerDetails(e).pitching?.ovr ?? 0;
    return ovr + freshnessBonus(conditions?.[e.id]?.lastAppearanceGameCount, teamGameCount, handlePersonnel);
  };

  // CP: 가용 CP 중 점수 최고, 없으면 전체 CP 중 최고 (fallback)
  const cpPool = availableCp.length > 0 ? availableCp
    : reliefs.filter((e) => playerDetails(e).position === "CP");
  const cpSorted = [...cpPool].sort((a, b) => score(b) - score(a));
  const closer = cpSorted[0]?.id ?? "";

  // RP 불펜: 가용 RP + 가용 CP → 점수 내림차순 (CP는 마무리 제외 후 포함 가능)
  const bullpenPool = [
    ...availableRp.filter((e) => playerDetails(e).position === "RP"),
    ...availableCp,
  ].sort((a, b) => score(b) - score(a));

  const bullpen = bullpenPool.map((e) => e.id);
  return { bullpen, closer };
}

// ── 라인업(타순) 자동 배정 ──────────────────────────────────
const POSITION_PRIORITY = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "UT"];

export function getTeamLineup(
  teamId: string,
  entities: EntityRow[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
  conditions?: Record<string, PlayerCondition>,
  currentWeek = 0,
  teamGameCount = 0,
  handlePersonnel = 50,
  npcRetired?: string[],
): string[] {
  const players = getTeamPlayers(teamId, entities, npcInjuries, npcRetired);
  let batters = players.filter(
    (e) =>
      playerDetails(e).playerType === "batter" ||
      playerDetails(e).playerType === "twoWay",
  );
  if (batters.length === 0) batters = players;

  // 타자 선택 점수: 피로 반영 OVR + freshnessBonus
  const batScore = (e: EntityRow) => {
    const base = playerDetails(e).batting?.ovr ?? 0;
    const cond = conditions?.[e.id];
    const fatF = !cond ? 1.0
      : cond.fatigue >= 70 ? 1.00
      : cond.fatigue >= 50 ? 0.90
      : 0.78;
    const effOvr = Math.round(base * fatF);
    return effOvr + freshnessBonus(cond?.lastAppearanceGameCount, teamGameCount, handlePersonnel);
  };

  // 포지션별 1명씩 최고 점수 선택
  const used = new Set<string>();
  const positionPick: Record<string, string> = {};

  for (const pos of POSITION_PRIORITY) {
    const best = batters
      .filter((e) => !used.has(e.id) && playerDetails(e).position === pos)
      .sort((a, b) => batScore(b) - batScore(a))[0];
    if (best) {
      positionPick[pos] = best.id;
      used.add(best.id);
    }
  }

  // 포지션 미충족 시 남은 타자로 보충
  let remaining = batters
    .filter((e) => !used.has(e.id))
    .sort((a, b) => batScore(b) - batScore(a));

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
export function buildTeamRoster(
  teamId: string,
  entities: EntityRow[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
  maxRotation = 5,
  conditions?: Record<string, PlayerCondition>,
  currentWeek = 0,
  teamGameCount = 0,
  leagueId = "",
  handlePersonnel = 50,
  npcRetired?: string[],
): TeamRoster {
  const rotation = getTeamRotation(teamId, entities, npcInjuries, maxRotation, conditions, currentWeek, teamGameCount, leagueId, npcRetired);
  const { bullpen, closer } = getTeamBullpen(teamId, entities, rotation, npcInjuries, conditions, teamGameCount, handlePersonnel, npcRetired);
  const lineup = getTeamLineup(teamId, entities, npcInjuries, conditions, currentWeek, teamGameCount, handlePersonnel, npcRetired);
  return { rotation, bullpen, closer, lineup };
}
