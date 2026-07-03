// ── R3a: 새 게임 생성 파이프라인 v3 (DESIGN.md §8.3) ─────────────────────
// 흐름: 생성 규칙(master 콘텐츠) → Rust 로스터 생성(worldSeed 결정적) → slot.db 생성
// 사전 생성 데이터(people_*.json, entities/players/*) 를 전혀 읽지 않는다.

import { slotRepo, type RepoNpc } from "./slotRepo";
import { HS_ACTIVE_TEAMS_V3 } from "../utils/leagueScheduler";

// Rust RosterRules와 1:1 (generation_rules.json rosterRules[leagueId])
export interface RosterRulesData {
  rosterSize: number;
  pitchingOvrMin: number; pitchingOvrMax: number;
  battingOvrMin: number; battingOvrMax: number;
  devRateMin: number; devRateMax: number;
  gradeMax?: number; ageBase?: number;
  ageMin?: number; ageMax?: number;
  pitcherRatio?: number;
  withContract?: boolean;
  nationality?: string;
}

export interface GenerationRulesFile {
  version: number;
  rosterRules: Record<string, RosterRulesData>;
}

export interface NewGameV3Options {
  slotId: string;
  slotName?: string;
  seasonYear: number;
  /** ProtagonistSave — 그대로 저장 (스키마는 gameStore 소관) */
  protagonist: unknown;
  /** 초기 시즌 상태 (슬림 — npcs/npcLiveStats 없음) */
  season: unknown;
  worldSeed?: number;
  /** 활성화할 시작 리그 팀 목록 (기본: 고교 10팀) */
  teams?: { teamId: string; schoolId?: string }[];
  /** 시나리오 Named NPC — 콘텐츠 정의에서 변환해 전달 (없으면 배경만) */
  namedNpcs?: Partial<RepoNpc>[];
}

export interface NewGameV3Result {
  slotId: string;
  worldSeed: number;
  npcCount: number;
}

/** 리그 로스터 생성 파라미터 조립 (Rust generateLeagueRosterNative 입력) */
export function buildRosterParams(
  leagueId: string,
  seasonYear: number,
  worldSeed: number,
  teams: { teamId: string; schoolId?: string }[],
  rules: RosterRulesData,
  namePool?: { surnames: string[]; givenA: string[]; givenB: string[]; western?: boolean },
) {
  return {
    leagueId,
    seasonYear,
    worldSeed: worldSeed >>> 0,
    teams: teams.map((t) => ({ teamId: t.teamId, schoolId: t.schoolId ?? "" })),
    rules,
    ...(namePool ? { namePool } : {}),
  };
}

export async function loadRosterRules(): Promise<GenerationRulesFile> {
  const raw = (await window.projectB!.masterFetch("players/generation_rules.json")) as GenerationRulesFile | null;
  if (!raw?.rosterRules) throw new Error("[newGameV3] generation_rules.json rosterRules 없음 — v2 데이터 필요");
  return raw;
}

/**
 * 새 게임 슬롯 생성 (클린 브레이크 — v3 전용).
 * 시작 리그(고교)만 활성화. 타 리그는 진출 시점에 activateLeagueV3로 Lazy 생성.
 */
export async function createNewGameV3(opts: NewGameV3Options): Promise<NewGameV3Result> {
  const worldSeed = (opts.worldSeed ?? Date.now()) >>> 0;
  const rulesFile = await loadRosterRules();
  const hsRules = rulesFile.rosterRules["LEAGUE_HIGHSCHOOL"];
  if (!hsRules) throw new Error("[newGameV3] LEAGUE_HIGHSCHOOL rosterRules 없음");

  const teams = opts.teams ?? HS_ACTIVE_TEAMS_V3.map((teamId) => ({ teamId }));

  const params = buildRosterParams("LEAGUE_HIGHSCHOOL", opts.seasonYear, worldSeed, teams, hsRules);
  const gen = JSON.parse(
    await window.projectB!.engine("generateLeagueRosterNative", JSON.stringify(params))
  ) as { npcs?: Partial<RepoNpc>[]; error?: string };
  if (!Array.isArray(gen.npcs)) throw new Error(`[newGameV3] 로스터 생성 실패: ${gen.error ?? "unknown"}`);

  const npcs = [...gen.npcs, ...(opts.namedNpcs ?? [])];

  await slotRepo.createSlot({
    slotId: opts.slotId,
    worldSeed,
    name: opts.slotName,
    protagonist: opts.protagonist,
    season: opts.season,
    npcs,
  });
  await slotRepo.setMeta(opts.slotId, {
    career_stage: "highschool",
    season_year: opts.seasonYear,
    current_week: 0,
  });

  return { slotId: opts.slotId, worldSeed, npcCount: npcs.length };
}

/**
 * 리그 Lazy 활성화 — KBL 진입·해외 진출 확정 시점에 호출 (DESIGN.md §2.2).
 * 같은 worldSeed면 언제 호출해도 동일 로스터.
 */
export async function activateLeagueV3(
  slotId: string,
  leagueId: string,
  seasonYear: number,
  teams: { teamId: string; schoolId?: string }[],
  namePool?: { surnames: string[]; givenA: string[]; givenB: string[]; western?: boolean },
): Promise<{ inserted: number }> {
  const meta = await slotRepo.getMeta(slotId);
  const worldSeed = Number(meta.world_seed ?? 0) >>> 0;
  const rulesFile = await loadRosterRules();
  const rules = rulesFile.rosterRules[leagueId];
  if (!rules) throw new Error(`[activateLeagueV3] rosterRules 없음: ${leagueId}`);

  // 이미 활성화된 리그면 스킵 (재호출 안전)
  const existing = await slotRepo.getByLeague(slotId, leagueId);
  if (existing.length > 0) return { inserted: 0 };

  const params = buildRosterParams(leagueId, seasonYear, worldSeed, teams, rules, namePool);
  const gen = JSON.parse(
    await window.projectB!.engine("generateLeagueRosterNative", JSON.stringify(params))
  ) as { npcs?: Partial<RepoNpc>[]; error?: string };
  if (!Array.isArray(gen.npcs)) throw new Error(`[activateLeagueV3] 생성 실패: ${gen.error ?? "unknown"}`);

  const r = await slotRepo.insertNpcs(slotId, gen.npcs);
  return { inserted: r.inserted };
}
