import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type { NpcInjuryEntry } from "../types/save";
import type { MatchResult, PlayerCondition } from "../types/season";
import { buildTeamRoster } from "./rosterEngine";

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

function toSimPitcher(id: string, entityMap: Map<string, EntityRow>): SimPitcher | null {
  const e = entityMap.get(id);
  if (!e) return null;
  const p = (e.details.player as EntityPlayerDetails).pitching;
  return {
    id,
    velocity:  p?.velocity  ?? 50,
    movement:  p?.movement  ?? 50,
    command:   p?.command   ?? 50,
    control:   p?.control   ?? 50,
    stamina:   p?.stamina   ?? 50,
  };
}

function toSimBatter(id: string, entityMap: Map<string, EntityRow>): SimBatter | null {
  const e = entityMap.get(id);
  if (!e) return null;
  const b = (e.details.player as EntityPlayerDetails).batting;
  return {
    id,
    contact:    b?.contact    ?? 50,
    power:      b?.power      ?? 50,
    eye:        b?.eye        ?? 50,
    discipline: b?.discipline ?? 50,
  };
}

// ── 풀게임 시뮬레이션 (Rust DLL 위임) ──────────────────────
export async function simulateGame(
  homeTeamId: string,
  awayTeamId: string,
  entities:   EntityRow[],
  options?: {
    conditions?:   Record<string, PlayerCondition>;
    homeRotIdx?:   number;
    awayRotIdx?:   number;
    week?:         number;
    npcInjuries?:  Record<string, NpcInjuryEntry>;
    rotationSize?: number;
  },
): Promise<SimGameResult> {
  const { conditions = {}, homeRotIdx = 0, awayRotIdx = 0, week = 0, npcInjuries, rotationSize = 5 } = options ?? {};
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const homeRoster = buildTeamRoster(homeTeamId, entities, npcInjuries, rotationSize);
  const awayRoster = buildTeamRoster(awayTeamId, entities, npcInjuries, rotationSize);

  const toSimPitchers = (ids: string[]) => ids.map(id => toSimPitcher(id, entityMap)).filter(Boolean) as SimPitcher[];
  const toSimBatters  = (ids: string[]) => ids.map(id => toSimBatter(id, entityMap)).filter(Boolean)  as SimBatter[];

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
  return parseResult<SimGameResult>(json);
}
