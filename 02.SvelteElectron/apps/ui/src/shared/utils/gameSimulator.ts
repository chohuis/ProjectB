import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type { NpcInjuryEntry } from "../types/save";
import type { MatchResult, NpcLiveStat, PlayerCondition } from "../types/season";
import { buildTeamRoster, getTeamBullpen, getTeamRotation, rotationRestGames, rotationSizeForLeague } from "./rosterEngine";

// ── 반환 타입 ─────────────────────────────────────────────────
export interface SimGameResult {
  result: MatchResult;
  nextHomeRotIdx: number;
  nextAwayRotIdx: number;
  pitcherConditions: Record<string, PlayerCondition>;
}

// ── IPC 헬퍼 ─────────────────────────────────────────────────
const api = () => (window as unknown as { projectB: Record<string, (p: string) => Promise<string>> }).projectB;

function parseResult<T>(json: string): T {
  const v = JSON.parse(json) as { error?: string } & T;
  if (v && typeof v === "object" && "error" in v) throw new Error(String((v as { error: string }).error));
  return v as T;
}

// ── EntityRow → SimPitcher / SimBatter 변환 ──────────────────
interface SimPitcher { id: string; velocity: number; movement: number; command: number; control: number; stamina: number }
interface SimBatter  { id: string; contact: number;  power: number;    eye: number;    discipline: number }

function toSimPitcher(
  id: string,
  entityMap: Map<string, EntityRow>,
  npcLiveStats?: Record<string, NpcLiveStat>,
  adaptFactor?: number,
): SimPitcher | null {
  const e = entityMap.get(id);
  if (!e) return null;
  const live = npcLiveStats?.[id];
  const p = live?.pitching ?? (e.details.player as EntityPlayerDetails).pitching;
  const f = adaptFactor ?? 1;
  return {
    id,
    velocity:  Math.round((p?.velocity  ?? 50) * f),
    movement:  Math.round((p?.movement  ?? 50) * f),
    command:   Math.round((p?.command   ?? 50) * f),
    control:   Math.round((p?.control   ?? 50) * f),
    stamina:   Math.round((p?.stamina   ?? 50) * f),
  };
}

function toSimBatter(
  id: string,
  entityMap: Map<string, EntityRow>,
  npcLiveStats?: Record<string, NpcLiveStat>,
): SimBatter | null {
  const e = entityMap.get(id);
  if (!e) return null;
  const live = npcLiveStats?.[id];
  const b = live?.batting ?? (e.details.player as EntityPlayerDetails).batting;
  return {
    id,
    contact:    b?.contact    ?? 50,
    power:      b?.power      ?? 50,
    eye:        b?.eye        ?? 50,
    discipline: b?.discipline ?? 50,
  };
}

// ── Rust 반환 컨디션과 TS 추적 필드 머지 ──────────────────────
// Rust는 fatigue/lastPitchedWeek/pitchOutsLast만 반환.
// TS 전용 필드(lastStartGameCount, lastAppearanceGameCount, consecutiveAppearances)는
// 여기서 머지해서 완성된 PlayerCondition을 만든다.
function mergeConditions(
  rustConditions: Record<string, { fatigue: number; lastPitchedWeek: number; pitchOutsLast: number }>,
  prevConditions: Record<string, PlayerCondition>,
  homeRotation: string[],
  awayRotation: string[],
  homeBullpen: string[],
  awayBullpen: string[],
  homeRotIdx: number,
  awayRotIdx: number,
  leagueId: string,
): Record<string, PlayerCondition> {
  const result: Record<string, PlayerCondition> = {};
  const homeSpId = homeRotation[homeRotIdx % Math.max(1, homeRotation.length)];
  const awaySpId = awayRotation[awayRotIdx % Math.max(1, awayRotation.length)];
  const appearedIds = new Set(Object.keys(rustConditions));

  for (const [id, rustCond] of Object.entries(rustConditions)) {
    const prev = prevConditions[id];
    const isSp = id === homeSpId || id === awaySpId;
    const currentGameCount = id === homeSpId || homeBullpen.includes(id)
      ? homeRotIdx
      : awayRotIdx;

    if (isSp) {
      // SP: lastStartGameCount 업데이트, consecutiveAppearances 리셋
      result[id] = {
        fatigue:            rustCond.fatigue,
        lastPitchedWeek:    rustCond.lastPitchedWeek,
        pitchOutsLast:      rustCond.pitchOutsLast,
        lastStartGameCount: currentGameCount,
        lastAppearanceGameCount: prev?.lastAppearanceGameCount,
        consecutiveAppearances:  0,
      };
    } else {
      // RP/CP: consecutiveAppearances 증가
      const prevCount = prev?.lastAppearanceGameCount ?? -99;
      const wasConsecutive = prevCount === currentGameCount - 1;
      result[id] = {
        fatigue:                 rustCond.fatigue,
        lastPitchedWeek:         rustCond.lastPitchedWeek,
        pitchOutsLast:           rustCond.pitchOutsLast,
        lastStartGameCount:      prev?.lastStartGameCount,
        lastAppearanceGameCount: currentGameCount,
        consecutiveAppearances:  wasConsecutive
          ? (prev?.consecutiveAppearances ?? 0) + 1
          : 1,
      };
    }
  }

  // 미출전 불펜 → consecutiveAppearances 리셋
  const allBullpenIds = [...homeBullpen, ...awayBullpen];
  for (const id of allBullpenIds) {
    if (appearedIds.has(id)) continue;
    const prev = prevConditions[id];
    if (!prev) continue;
    result[id] = { ...prev, consecutiveAppearances: 0 };
  }

  // 리그별 SP 휴식 검증 (미등판 SP 컨디션은 건드리지 않음)
  void leagueId;  // 현재 참조용, 추후 제한 로직에 활용 가능

  return result;
}

// ── 풀게임 시뮬레이션 (Rust DLL 위임) ──────────────────────
export async function simulateGame(
  homeTeamId: string,
  awayTeamId: string,
  entities:   EntityRow[],
  options?: {
    conditions?:     Record<string, PlayerCondition>;
    homeRotIdx?:     number;
    awayRotIdx?:     number;
    week?:           number;
    npcInjuries?:    Record<string, NpcInjuryEntry>;
    rotationSize?:   number;
    npcLiveStats?:   Record<string, NpcLiveStat>;
    leagueId?:       string;
    homeHandlePersonnel?: number;
    awayHandlePersonnel?: number;
    tradeAdaptationPenalty?: { playerId: string; factor: number };
  },
): Promise<SimGameResult> {
  const {
    conditions = {},
    homeRotIdx = 0,
    awayRotIdx = 0,
    week = 0,
    npcInjuries,
    rotationSize = 5,
    npcLiveStats,
    leagueId = "",
    homeHandlePersonnel = 50,
    awayHandlePersonnel = 50,
    tradeAdaptationPenalty,
  } = options ?? {};

  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const homeRoster = buildTeamRoster(homeTeamId, entities, npcInjuries, rotationSize, conditions, week, homeRotIdx, leagueId, homeHandlePersonnel);
  const awayRoster = buildTeamRoster(awayTeamId, entities, npcInjuries, rotationSize, conditions, week, awayRotIdx, leagueId, awayHandlePersonnel);

  const toSimPitchers = (ids: string[]) => ids.map(id => {
    const factor = tradeAdaptationPenalty && id === tradeAdaptationPenalty.playerId
      ? tradeAdaptationPenalty.factor : undefined;
    return toSimPitcher(id, entityMap, npcLiveStats, factor);
  }).filter(Boolean) as SimPitcher[];
  const toSimBatters  = (ids: string[]) => ids.map(id => toSimBatter(id, entityMap, npcLiveStats)).filter(Boolean)  as SimBatter[];

  const params = {
    homeRotation: toSimPitchers(homeRoster.rotation),
    awayRotation: toSimPitchers(awayRoster.rotation),
    homeBullpen:  toSimPitchers(homeRoster.bullpen),
    awayBullpen:  toSimPitchers(awayRoster.bullpen),
    homeCloser:   homeRoster.closer ? toSimPitcher(homeRoster.closer, entityMap) : null,
    awayCloser:   awayRoster.closer ? toSimPitcher(awayRoster.closer, entityMap) : null,
    homeLineup:   toSimBatters(homeRoster.lineup),
    awayLineup:   toSimBatters(awayRoster.lineup),
    homeRotIdx,
    awayRotIdx,
    conditions,
    week,
    homeTeamId,
    awayTeamId,
  };

  const json = await api().npcSimGame(JSON.stringify(params));
  const raw  = parseResult<{
    result: MatchResult;
    nextHomeRotIdx: number;
    nextAwayRotIdx: number;
    pitcherConditions: Record<string, { fatigue: number; lastPitchedWeek: number; pitchOutsLast: number }>;
  }>(json);

  // Rust 반환 컨디션에 TS 추적 필드 머지
  const pitcherConditions = mergeConditions(
    raw.pitcherConditions,
    conditions,
    homeRoster.rotation,
    awayRoster.rotation,
    homeRoster.bullpen,
    awayRoster.bullpen,
    homeRotIdx,
    awayRotIdx,
    leagueId,
  );

  return {
    result:            raw.result,
    nextHomeRotIdx:    raw.nextHomeRotIdx,
    nextAwayRotIdx:    raw.nextAwayRotIdx,
    pitcherConditions,
  };
}
