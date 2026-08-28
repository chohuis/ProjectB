import type { EntityRow } from "../stores/master";
import { toEngineArsenal } from "./arsenal";
import type { MatchBatterStats, MatchFielderStats } from "../types/projectb";
import type { PlayerCondition } from "../types/season";
import type { NpcInjuryEntry } from "../types/save";
import { getTeamRotation, rotationSizeForLeague, starterOfRotation } from "./rosterEngine";

export interface StarterStats {
  name?: string;
  command: number; velocity: number; staminaCap: number; mentalResil: number;
  control: number; movement: number; clutch: number; holdRunners: number;
  /** 보유 구종 — 안 넘기면 엔진이 패스트볼 하나로 던진다 */
  arsenal: import("./arsenal").EngineArsenalPitch[];
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
      // 🔴 번트를 안 넘기면 희생번트가 다시 죽는다 — 성장 엔진에만 있던 값이다
      bunting: bat.bunting ?? 50,
      fielding: bat.fielding ?? 50, arm: bat.arm ?? 50,
    };
  });
}

// ── 상대 요약 (소식·브리핑 공용) ──────────────────────────────
//
// **표시용 상대 정보의 정본이다.** 경기 전 브리핑과 월간 경기 편성 소식이
// 같은 상대를 설명하는데, 각자 계산하면 "브리핑은 66인데 예고는 61"처럼
// 갈린다. 이 프로젝트가 반복해 겪은 "정본이 둘"이라 한 곳에 둔다.
//
// ⚠ 순위·성적은 **호출부가 넘긴다.** 순위표는 시즌 상태(`standings`)에 있고
// 그건 store라 이 모듈이 직접 보면 순수 함수가 아니게 된다.

export interface OpponentBrief {
  teamId: string;
  /** 리그(권역) 안 순위. 못 구하면 null */
  rank: number | null;
  total: number | null;
  /** "8승 14패" — 못 구하면 null */
  record: string | null;
  /** 타선 9명 OVR 평균. 라인업을 못 만들면 null */
  teamOvr: number | null;
  starter: { name: string; position: string; ovr: number } | null;
}

/**
 * 상대 팀 한 줄 요약.
 *
 * `starter`는 `buildStarterStats`와 **같은 선발 판정**(`pickStarterEntity`)을
 * 쓴다 — 정본은 `rosterEngine`의 고정 로테이션 + 리그 상태의 슬롯이다.
 * 화면이 따로 "OVR 제일 높은 투수"를 고르면 실제 등판할 투수와 달라진다.
 *
 * ⚠ 예고 시점(월초)엔 로테이션이 확정이 아닐 수 있다. 부르는 쪽이
 * **"선발 예상"**으로 표기해야 한다 — 확정처럼 적으면 브리핑과 어긋난다.
 */
export function buildOpponentBrief(
  teamId: string,
  entities: EntityRow[],
  opts: {
    rank?: number | null; total?: number | null; record?: string | null;
    conditions?: Record<string, PlayerCondition>;
    /** 그 팀의 로테이션 슬롯 — `rotIdxOf()`로 꺼낸다 */
    rotIdx?: number;
    leagueId?: string;
    npcInjuries?: Record<string, NpcInjuryEntry>;
  } = {},
): OpponentBrief {
  // 타선 OVR 평균 — `MatchBatterStats`엔 ovr이 없어서 엔티티에서 직접 낸다.
  // 상위 9명을 쓴다(라인업과 같은 기준)
  const batters = entities
    .filter((e) => e.teamId === teamId && e.role === "player"
      && !PITCHER_POS.includes(String(playerOf(e).position ?? "")))
    .map((e) => Number(playerOf(e).batting?.ovr ?? 0))
    .sort((a, b) => b - a)
    .slice(0, 9);
  const teamOvr = batters.length > 0
    ? Math.round(batters.reduce((s, v) => s + v, 0) / batters.length)
    : null;

  const sp = pickStarterEntity(teamId, entities, opts.conditions, opts.rotIdx ?? 0, opts.leagueId ?? "", opts.npcInjuries);
  const p = sp ? playerOf(sp) : null;

  return {
    teamId,
    rank:   opts.rank   ?? null,
    total:  opts.total  ?? null,
    record: opts.record ?? null,
    teamOvr,
    starter: sp && p
      ? {
          name: String(sp.name ?? p.name ?? sp.id),
          position: String(p.position ?? "SP"),
          ovr: Number(p.pitching?.ovr ?? 0),
        }
      : null,
  };
}

/**
 * 그 팀의 로테이션 슬롯을 리그 상태에서 꺼낸다.
 *
 * 🔴 **부르는 쪽마다 손으로 파고들지 마라.** 예전엔 아무도 안 넘겨서
 *   전부 기본값 0이었고, 그래서 예고가 늘 1번 투수였다.
 */
export function rotIdxOf(
  leagueState: Record<string, { teamRotationIndex?: Record<string, number> }> | undefined,
  leagueId: string | undefined,
  teamId: string,
): number {
  if (!leagueState || !leagueId) return 0;
  return leagueState[leagueId]?.teamRotationIndex?.[teamId] ?? 0;
}

/**
 * 그 팀이 이번 경기에 낼 **선발 투수 한 명**을 고른다.
 *
 * ⚠ **판정을 다른 데서 다시 짜지 말 것.** 경기 브리핑·월간 편성 소식·
 * 주인공이 상대할 투수가 전부 이 함수 하나를 쓴다. 정본은
 * `rosterEngine.getTeamRotation` + 리그 상태의 로테이션 슬롯이다.
 */
export function pickStarterEntity(
  teamId: string,
  entities: EntityRow[],
  conditions?: Record<string, PlayerCondition>,
  /** 그 팀의 로테이션 인덱스 — `leagueState.teamRotationIndex[teamId]` */
  rotIdx = 0,
  leagueId = "",
  /** ⚠ 안 넘기면 **부상으로 빠진 선발을 예고한다** (실측 1%) */
  npcInjuries?: Record<string, NpcInjuryEntry>,
): EntityRow | undefined {
  // 🔴 **여기서 따로 고르지 않는다** (2026-08-28). 예전엔 "쉰 SP 중 OVR 최고"를
  //   자체로 뽑았는데, 실제 경기는 `getTeamRotation`의 **고정 로테이션을
  //   `rotIdx`로 순번대로** 낸다. 두 규칙이 갈라져 있었다.
  //
  //   실측 3회(40,000 · 40,000 · 24,000 표본): **예고와 실제가 44.0% · 44.8% ·
  //   44.1%만 일치**했다. 절반 넘게 다른 투수를 예고했다.
  //
  // 🔴 표시만의 문제가 아니었다 — `MainPage`가 이 함수로 고른 투수를
  //   `matchSimulateToEntry`에 **상대 선발로 그대로 넘긴다.** 주인공은
  //   리그가 아는 그 팀 선발이 아닌 다른 투수를 상대하고 있었다.
  //
  // ⚠ `getTeamRotation`이 휴식 기준을 버린 건 **의도다** — 컨디션 섞인 값으로
  //   매 경기 다시 뽑으면 로테이션 5명이 계속 바뀌어 표본이 흩어진다(그쪽
  //   주석 참고). 고친 곳이 둘인데 한 곳만 고쳐져 있었다.
  const rotation = getTeamRotation(
    teamId, entities, npcInjuries, rotationSizeForLeague(leagueId),
    conditions, 0, leagueId,
  );
  const id = starterOfRotation(rotation, rotIdx);
  return id ? entities.find((e) => e.id === id) : undefined;
}

// ── 선발 투수 스탯 빌드 ──────────────────────────────────────
export function buildStarterStats(
  teamId: string,
  entities: EntityRow[],
  conditions?: Record<string, PlayerCondition>,
  rotIdx = 0,
  leagueId = "",
  npcInjuries?: Record<string, NpcInjuryEntry>,
): StarterStats | undefined {
  const candidate = pickStarterEntity(teamId, entities, conditions, rotIdx, leagueId, npcInjuries);
  if (!candidate) return undefined;
  const pit = playerOf(candidate).pitching ?? {};
  return {
    name:        candidate.name ?? undefined,
    command:     pit.command    ?? 50,
    velocity:    pit.velocity   ?? 50,
    staminaCap:  pit.stamina    ?? 50,
    mentalResil: pit.mentality  ?? 50,
    control:     pit.control    ?? 50,
    movement:    pit.movement   ?? 50,
    clutch:      pit.clutch     ?? 50,
    holdRunners: pit.holdRunners ?? 50,
    // ⚠ NPC 투수도 구종을 갖고 있다(roster_gen이 만든다). 안 넘기면 상대
    // 에이스가 전부 패스트볼만 던지는 세계가 된다
    arsenal:     toEngineArsenal(playerOf(candidate).pitches),
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
      // ⚠ **id를 함께 싣는다.** 이름만으론 동명이인을 못 가려 실책이
      //   엉뚱한 선수에게 붙는다
      playerId: src?.id ?? "",
      name: src?.name ?? pos,
      fielding: bat.fielding ?? 50,
      arm: bat.arm ?? 50,
      speed: bat.speed ?? 50,
      x: FIELDER_XY[pos].x,
      y: FIELDER_XY[pos].y,
    };
  });
}
