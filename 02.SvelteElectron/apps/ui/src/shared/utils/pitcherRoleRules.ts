/**
 * 투수 보직 추천 규칙 — 규칙 파일(`pitcherRoleRules` · `rosterOpsRules.bullpenSize`)을 싣고
 * Rust `recommend_pitcher_role` 에 넘길 재료를 만든다 (PLAN_ROLE_RECOMMEND §2·§3 · 1.1 A①).
 *
 * 🔴 **가중치는 여기에도 코드에도 없다** — 규칙 파일이 정본이고 Rust 는 받은 값으로만 계산한다.
 *   안 실리면 `isPitcherRoleRulesPrimed()` 가 false 라 `recommendRole()` 이 옛 엔진(OVR 순위)으로 간다.
 * ⚠ 동료 능력치는 **라이브 스탯 우선**(`npcLiveStatsStore[id].pitching`), 없으면 생성값
 *   (`details.player.pitching`). 라이브만 보면 시즌 초 동료가 통째로 빠져 경쟁이 거짓이 된다.
 * ⚠ 구종 계열(`group`)은 카탈로그에서 붙인다 — Rust 는 카탈로그를 모른다.
 * ⚠ 시즌아웃 부상(`npcInjuries[id]` 가 있고 `isPlayingThrough` 가 false)은 후보에서 뺀다 —
 *   자리를 차지하지 않는 사람을 세면 `ahead` 가 부풀어 "N명 있다" 가 거짓이 된다.
 */
import type { EntityRow, NpcLiveStat, PitchEntry as CatalogPitch } from "../stores/master";
import type {
  NpcInjuryEntry,
  PitchEntry,
  PitchingAttributes,
  ProtagonistSave,
} from "../types/save";
import { rotationSizeForLeague } from "./rosterEngine";

export interface PitcherRoleRules {
  weights: Record<string, Record<string, number>>;
  arsenal: Record<
    string,
    {
      count?: number;
      countCap?: number;
      gradeAvg?: number;
      gradeBest2?: number;
      gradeBest?: number;
      groups?: number;
      developingWeight?: number;
    }
  >;
  closerSize?: number;
  offRecommendation?: { perSeatOver: number; floor: number };
}

let _rules: PitcherRoleRules | null = null;
let _bullpen: Record<string, number> = {};

export function primePitcherRoleRules(rulesFile: {
  pitcherRoleRules?: PitcherRoleRules;
  rosterOpsRules?: { bullpenSize?: Record<string, number> };
}): void {
  const r = rulesFile.pitcherRoleRules;
  if (r && r.weights && r.arsenal) {
    // `_note` 같은 설명 키는 뺀다 — Rust 가 역할 이름으로만 읽는다
    const clean = (o: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_"))) as Record<
        string,
        never
      >;
    _rules = {
      weights: clean(r.weights as Record<string, unknown>),
      arsenal: clean(r.arsenal as Record<string, unknown>),
      closerSize: r.closerSize,
      offRecommendation: r.offRecommendation,
    };
  }
  const b = rulesFile.rosterOpsRules?.bullpenSize;
  if (b)
    _bullpen = Object.fromEntries(Object.entries(b).filter(([k]) => !k.startsWith("_"))) as Record<
      string,
      number
    >;
}

/** 검사용 — 실린 규칙을 되돌린다 */
export function resetPitcherRoleRulesForTest(): void {
  _rules = null;
  _bullpen = {};
}
export function isPitcherRoleRulesPrimed(): boolean {
  return _rules !== null;
}
export function pitcherRoleRules(): PitcherRoleRules | null {
  return _rules;
}

export function bullpenSizeForLeague(leagueId: string): number {
  return _bullpen[leagueId] ?? _bullpen.default ?? 0;
}

/**
 * 추천 밖 깊이 재료 한 벌 (§5 · 1.1 A④) — 세 호출부(선발 건너뛰기 · 불펜 확률 · 경기 진입)가 같이 쓴다.
 *
 * 🔴 **계수 자체는 Rust 가 계산한다.** 여기서 `1 − k × over` 를 다시 적으면 두 벌이 되고
 *   한쪽만 고쳐진 채 남는다. 이 함수는 `over` 와 규칙만 꺼내 넘긴다.
 * ⚠ 규칙이 안 실렸으면 `offRecommendation` 이 undefined 다 — Rust 가 계수 1.0 으로 떨어뜨린다.
 */
export function roleDepthOf(
  roleFit: { rank: number; seats: number } | undefined | null,
  /**
   * 남은 선발 보장 경기 수 (2026-09-08 · §5 `startGuarantee`).
   *
   * 🔴 **보장 중에는 깊이가 0 이다.** 「선발을 보장한다」는 보상이 자리 깊이를
   *   그대로 두면 아무 일도 안 한다 — 깊이가 미는 것이 바로 선발 등판
   *   건너뛰기다. 0 으로 보는 것이 곧 「자리 안」이다.
   * ⚠ 새 계수를 만들지 않는다 — 이미 있는 `over` 를 0 으로 볼 뿐이다.
   */
  startGuaranteeGames?: number,
): { roleDepth: number; offRecommendation?: { perSeatOver: number; floor: number } } {
  if ((startGuaranteeGames ?? 0) > 0) {
    const off0 = _rules?.offRecommendation;
    return off0 ? { roleDepth: 0, offRecommendation: off0 } : { roleDepth: 0 };
  }
  const over = roleFit ? Math.max(0, Math.round(roleFit.rank) - Math.round(roleFit.seats)) : 0;
  const off = _rules?.offRecommendation;
  return off ? { roleDepth: over, offRecommendation: off } : { roleDepth: over };
}

// ── Rust 재료 ─────────────────────────────────────────────

export interface RolePitcherRef {
  id: string;
  stamina?: number;
  velocity?: number;
  command?: number;
  control?: number;
  movement?: number;
  mentality?: number;
  recovery?: number;
  clutch?: number;
  holdRunners?: number;
  pitches?: { grade: number; group: string }[];
}

export interface RecommendParams {
  me: RolePitcherRef;
  teammates: RolePitcherRef[];
  rules: PitcherRoleRules;
  rotationSize: number;
  bullpenSize: number;
  closerSize: number;
  roleOvrBias: number;
}

export interface RecommendResult {
  recommended: "sp" | "rp" | "cp";
  fits: { sp: number; rp: number; cp: number };
  ranks: { sp: number; rp: number; cp: number };
  seats: { sp: number; rp: number; cp: number };
  ahead: { sp: number; rp: number; cp: number };
  noSeat: boolean;
  error?: string;
}

function pitchRefs(
  pitches: PitchEntry[] | undefined,
  catalog: readonly CatalogPitch[],
): { grade: number; group: string }[] | undefined {
  if (!pitches || pitches.length === 0) return undefined;
  const groupOf = new Map(catalog.map((c) => [c.id, c.group] as const));
  return pitches.map((p) => ({ grade: p.grade, group: groupOf.get(p.id) ?? "" }));
}

function attrs(p: Partial<PitchingAttributes> | undefined): Omit<RolePitcherRef, "id" | "pitches"> {
  if (!p) return {};
  return {
    stamina: p.stamina,
    velocity: p.velocity,
    command: p.command,
    control: p.control,
    movement: p.movement,
    mentality: p.mentality,
    recovery: p.recovery,
    clutch: p.clutch,
    holdRunners: p.holdRunners,
  };
}

/** 시즌아웃 부상인가 — 등판 못 하는 사람은 자리를 차지하지 않는다 */
export function isSeasonOut(inj: NpcInjuryEntry | undefined): boolean {
  return !!inj && !inj.isPlayingThrough;
}

export function buildRecommendParams(args: {
  protagonist: Pick<ProtagonistSave, "id" | "teamId" | "leagueId" | "pitching" | "pitches">;
  entities: readonly EntityRow[];
  live: Record<string, NpcLiveStat | undefined>;
  catalog: readonly CatalogPitch[];
  injuries: Record<string, NpcInjuryEntry | undefined>;
  rules: PitcherRoleRules;
  roleOvrBias?: number;
}): RecommendParams {
  const { protagonist: p, entities, live, catalog, injuries, rules } = args;
  const teammates: RolePitcherRef[] = [];
  for (const e of entities) {
    if (e.teamId !== p.teamId || e.role !== "player" || e.id === p.id) continue;
    if (e.status && e.status !== "active") continue;
    const pl = e.details?.player;
    if (pl?.playerType !== "pitcher") continue;
    if (isSeasonOut(injuries[e.id])) continue;
    const a = live[e.id]?.pitching ?? pl.pitching;
    teammates.push({ id: e.id, ...attrs(a), pitches: pitchRefs(pl.pitches, catalog) });
  }
  return {
    me: { id: p.id, ...attrs(p.pitching), pitches: pitchRefs(p.pitches, catalog) },
    teammates,
    rules,
    rotationSize: rotationSizeForLeague(p.leagueId),
    bullpenSize: bullpenSizeForLeague(p.leagueId),
    closerSize: rules.closerSize ?? 1,
    roleOvrBias: args.roleOvrBias ?? 0,
  };
}

/** Rust `recommend_pitcher_role` 호출 — 오류면 `error` 가 든 채 돌아온다(호출부가 폴백) */
export async function recommendPitcherRoleNative(
  params: RecommendParams,
): Promise<RecommendResult> {
  const raw = await window.projectB!.engine("recommendPitcherRoleNative", JSON.stringify(params));
  return JSON.parse(raw) as RecommendResult;
}
