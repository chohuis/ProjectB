import type { EntityRow } from "../stores/master";
import type { MatchBatterStats, MatchFielderStats } from "../types/projectb";

export interface StarterStats {
  name?: string;
  command: number; velocity: number; staminaCap: number; mentalResil: number;
  control: number; movement: number; clutch: number; holdRunners: number;
}

const PITCHER_POS = ["SP", "RP", "CP"];
const FIELD_ORDER = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];

function playerOf(e: EntityRow) {
  return (e.details as any)?.player ?? {};
}

// ── 타자 라인업 9명 빌드 ──────────────────────────────────────
export function buildBatterLineup(teamId: string, entities: EntityRow[]): MatchBatterStats[] {
  const inTeam = entities.filter(
    (e) => e.teamId === teamId && e.role === "player" &&
      !PITCHER_POS.includes(String(playerOf(e).position ?? "")),
  );
  const pool = inTeam.length >= 9
    ? inTeam
    : entities.filter(
        (e) => e.role === "player" &&
          !PITCHER_POS.includes(String(playerOf(e).position ?? "")),
      );
  if (pool.length < 9) return [];

  const sorted = [...pool].sort(
    (a, b) => (playerOf(b).batting?.ovr ?? 0) - (playerOf(a).batting?.ovr ?? 0),
  );
  const picked: EntityRow[] = [];
  const used = new Set<string>();
  for (const pos of FIELD_ORDER) {
    const found = sorted.find((e) => !used.has(e.id) && playerOf(e).position === pos);
    if (found) { used.add(found.id); picked.push(found); }
  }
  for (const e of sorted) {
    if (picked.length >= 9) break;
    if (!used.has(e.id)) { used.add(e.id); picked.push(e); }
  }
  return picked.slice(0, 9).map((e) => {
    const bat = playerOf(e).batting ?? {};
    return {
      id: e.id, name: e.name ?? undefined,
      contact: bat.contact ?? 50, power: bat.power ?? 50,
      eye: bat.eye ?? 50, discipline: bat.discipline ?? 50,
      battingClutch: bat.battingClutch ?? 50, platoon: bat.platoon ?? 50,
      speed: bat.speed ?? 50, baseInstinct: bat.baseInstinct ?? 50,
      fielding: bat.fielding ?? 50, arm: bat.arm ?? 50,
    };
  });
}

// ── 선발 투수 스탯 빌드 ──────────────────────────────────────
export function buildStarterStats(teamId: string, entities: EntityRow[]): StarterStats | undefined {
  const pitchers = entities.filter(
    (e) => e.teamId === teamId && e.role === "player" &&
      PITCHER_POS.includes(String(playerOf(e).position ?? "")),
  );
  if (pitchers.length === 0) return undefined;
  const sorted = [...pitchers].sort((a, b) => {
    const ORDER: Record<string, number> = { SP: 0, RP: 1, CP: 2 };
    const da = ORDER[String(playerOf(a).position ?? "RP")] ?? 1;
    const db = ORDER[String(playerOf(b).position ?? "RP")] ?? 1;
    if (da !== db) return da - db;
    return (playerOf(b).pitching?.ovr ?? 0) - (playerOf(a).pitching?.ovr ?? 0);
  });
  const pit = playerOf(sorted[0]).pitching ?? {};
  return {
    name:        sorted[0].name ?? undefined,
    command:     pit.command    ?? 50,
    velocity:    pit.velocity   ?? 50,
    staminaCap:  pit.stamina    ?? 50,
    mentalResil: pit.mentality  ?? 50,
    control:     pit.control    ?? 50,
    movement:    pit.movement   ?? 50,
    clutch:      pit.clutch     ?? 50,
    holdRunners: pit.holdRunners ?? 50,
  };
}

// ── 수비진 빌드 ──────────────────────────────────────────────
const FIELDER_POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
const FIELDER_XY: Record<string, { x: number; y: number }> = {
  P: { x: 50, y: 62 }, C: { x: 50, y: 90 }, "1B": { x: 78, y: 70 },
  "2B": { x: 63, y: 55 }, "3B": { x: 22, y: 70 }, SS: { x: 37, y: 55 },
  LF: { x: 18, y: 28 }, CF: { x: 50, y: 16 }, RF: { x: 82, y: 28 },
};

// ── 경기 전 날씨·구장 결정 (scheduleId·homeTeamId 해시 기반, 저장 불필요) ──
export type PreGameWeather = "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
export type PreGamePark    = "neutral" | "pitcher_park" | "hitter_park" | "dome";

function strHash(s: string): number {
  return [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0x7fffffff, 0);
}

export function derivePreGameWeather(scheduleId: string): PreGameWeather {
  const pool: PreGameWeather[] = ["sunny", "sunny", "sunny", "cloudy", "cloudy", "rainy", "windy_in", "windy_out"];
  return pool[strHash(scheduleId) % pool.length];
}

export function derivePreGamePark(homeTeamId: string): PreGamePark {
  const pool: PreGamePark[] = ["neutral", "neutral", "neutral", "pitcher_park", "hitter_park", "dome"];
  return pool[strHash(homeTeamId) % pool.length];
}

export function buildFielders(teamId: string, entities: EntityRow[]): MatchFielderStats[] {
  const pool = entities.filter((e) => e.teamId === teamId && e.role === "player");
  const byPos = (pos: string) => pool.find((e) => String(playerOf(e).position ?? "") === pos);
  const pitcher = byPos("SP") ?? byPos("RP") ?? byPos("CP") ?? pool[0];
  return FIELDER_POSITIONS.map((pos) => {
    const src = pos === "P" ? pitcher : byPos(pos);
    const bat = playerOf(src!).batting ?? {};
    return {
      position: pos as MatchFielderStats["position"],
      name: src?.name ?? pos,
      fielding: bat.fielding ?? 50,
      arm: bat.arm ?? 50,
      speed: bat.speed ?? 50,
      x: FIELDER_XY[pos].x,
      y: FIELDER_XY[pos].y,
    };
  });
}
