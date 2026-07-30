// 관계도 배선 (Phase 6C) — 설계 정본 docs/design/people.md §4
//
// 규칙·계산은 전부 Rust `relationship.rs`에 있다. 여기는 배선만 한다:
//   slot.db 읽기 → Rust 호출 → slot.db 쓰기.
//
// 이 모듈이 store가 아니라 usecase인 이유: 관계 갱신은 slot.db·스태프·NPC·리그
// 순위를 동시에 읽는다. CLAUDE.md가 store에 금지한 바로 그 종류의 로직이다.

import { get } from "svelte/store";

import { slotRepo } from "../repo/slotRepo";
import { masterStore } from "../stores/master";
import type {
  RelationContact,
  RelationKind,
  RelationMemory,
  Relationship,
} from "../types/relationship";

// ── 규칙 로드 ──────────────────────────────────────────────────
// staff_rules와 같은 경로. 규칙만 git에 있고 결과물은 런타임 생성이다.

interface RelationRulesFile {
  init: unknown;
  decay: unknown;
  weekly: unknown;
  season: unknown;
  /** 훈련 focus → 코치 전문 영역. Rust는 안 쓰고 TS가 해석한다 */
  training_area?: Record<string, string>;
}

let cachedRules: RelationRulesFile | null = null;

export async function loadRelationRules(): Promise<RelationRulesFile> {
  if (cachedRules) return cachedRules;
  const raw = (await window.projectB!.masterFetch(
    "players/relationship_rules.json",
  )) as RelationRulesFile | null;
  if (!raw?.init || !raw.weekly) {
    throw new Error(
      "[relationships] relationship_rules.json 없음 — python scripts/build_refs_from_seeds.py 실행 필요",
    );
  }
  cachedRules = raw;
  return cachedRules;
}

/**
 * 이번 주 훈련 프로그램 → 담당 코치의 전문 영역.
 *
 * 두 어휘를 잇는 매핑은 **TOML에 있다**(`[training_area]`) — 코드에 박으면
 * 어느 한쪽 어휘를 고쳐도 조용히 어긋난다. 감독 능력치가 3중 이름 드리프트로
 * 전달되지 않던 P6-2가 정확히 그 사고였다.
 *
 * @returns 매핑에 없는 focus면 `""` — 그 주는 어느 코치도 오르지 않는다
 */
export async function trainingAreaOf(programFocus: string | null | undefined): Promise<string> {
  if (!programFocus) return "";
  const rules = await loadRelationRules();
  return rules.training_area?.[programFocus] ?? "";
}

// ── Rust 입출력 ────────────────────────────────────────────────

/**
 * 변화 1건. 라벨 변화가 메시지를 띄울 유일한 근거다.
 *
 * `kind`는 Rust가 안 준다 — 이쪽에서 기존 행을 보고 붙인다. 메시지 문구가
 * "감독과의 관계"인지 "코치와의 관계"인지 갈리는 데 필요하다.
 */
export interface RelationDelta {
  personId: string;
  delta: number;
  value: number;
  prevValue: number;
  label: string;
  prevLabel: string;
  labelChanged: boolean;
  kind?: RelationKind;
}

interface DeltaResult { deltas: RelationDelta[]; changed: number }

/** Rust 델타에 kind를 붙인다 (메시지 문구용) */
function withKind(deltas: RelationDelta[], rows: Relationship[]): RelationDelta[] {
  const kindOf = new Map(rows.map((r) => [r.personId, r.kind]));
  return deltas.map((d) => ({ ...d, kind: kindOf.get(d.personId) }));
}

export interface WeeklyRelationContext {
  /** 주인공이 이번 주 등판했는가 */
  pitched?: boolean;
  won?: boolean;
  era?: number;
  completeShutout?: boolean;
  /** 소속팀이 이번 주 경기를 했는가 / 이겼는가 (등판과 별개) */
  teamPlayed?: boolean;
  teamWon?: boolean;
  ovrDelta?: number;
  trainingDone?: boolean;
  trainingSkipped?: boolean;
  /** 이번 주 훈련 영역 — 코치 specialty와 일치할 때만 그 코치에게 가산된다 */
  trainingArea?: string;
  /** 이번 주 맞대결한 라이벌 personId */
  facedRivals?: string[];
}

async function callEngine<T>(fn: string, payload: unknown): Promise<T | null> {
  const raw = await window.projectB!.engine(fn, JSON.stringify(payload));
  const parsed = JSON.parse(raw) as T & { error?: string };
  if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error) {
    console.error(`[relationships] ${fn} 실패:`, parsed.error);
    return null;
  }
  return parsed as T;
}

/** Rust에 넘길 최소 형태로 접는다 — 이름·기억은 계산에 쓰이지 않는다 */
function toEngineRows(rows: Relationship[], specialtyOf: Map<string, string>) {
  return rows.map((r) => ({
    personId: r.personId,
    kind: r.kind,
    value: r.value,
    contact: r.contact,
    specialty: specialtyOf.get(r.personId) ?? "",
  }));
}

/** Rust 델타를 기존 행에 얹어 저장 형태로 만든다 */
function applyDeltas(
  rows: Relationship[],
  deltas: RelationDelta[],
  week: number,
): Relationship[] {
  const byId = new Map(deltas.map((d) => [d.personId, d]));
  const out: Relationship[] = [];
  for (const r of rows) {
    const d = byId.get(r.personId);
    if (!d) continue;
    out.push({ ...r, value: d.value, updatedWeek: week });
  }
  return out;
}

// ── 소속팀 인원 동기화 ─────────────────────────────────────────

/**
 * 지금 소속팀의 **스태프 전원 + 팀동료**에 관계 행이 있도록 맞춘다.
 *
 * - 없던 사람은 Rust `initRelations`로 초기값(중립 0 + 성향 편차)을 받아 새로 만든다
 * - `apart`였던 사람이 같은 팀에 있으면 `together`로 되돌린다 (**재회** — 감쇠된
 *   값에서 재개된다. 이게 "옛 감독을 프로에서 다시 만나는" 서사를 살리는 지점이다)
 * - 팀을 떠난 사람은 여기서 건드리지 않는다 — 이동 훅이 처리한다
 *
 * @returns 새로 만난 사람들 (첫 만남 메시지 소재)
 */
export async function syncTeamRelationships(p: {
  slotId: string;
  worldSeed: number;
  teamId: string;
  season: number;
  week: number;
  /** 같은 팀 선수 ID (주인공 제외) */
  teammateIds: string[];
  /** 주인공 지명 라운드 — 감독 초기값 보정. 0이면 미지명 */
  draftRound?: number;
  /** 지명 절차를 거친 맥락인가 (고교 입학 등은 false) */
  draftedContext?: boolean;
}): Promise<{ created: Relationship[]; reunited: Relationship[] }> {
  const staff = await slotRepo.getStaff(p.slotId, { teamId: p.teamId, status: "active" });
  const existing = await slotRepo.getRelationships(p.slotId);
  const byId = new Map(existing.map((r) => [r.personId, r]));

  // 지금 팀에 함께 있는 사람 = 스태프 + 팀동료
  const present: Array<{ personId: string; kind: RelationKind }> = [
    ...staff.map((s) => ({ personId: s.staffId, kind: s.role as RelationKind })),
    ...p.teammateIds.map((id) => ({ personId: id, kind: "teammate" as RelationKind })),
  ];

  const unknown = present.filter((x) => !byId.has(x.personId));
  const reunitedSrc = present.filter((x) => byId.get(x.personId)?.contact === "apart");

  const writes: Relationship[] = [];
  const created: Relationship[] = [];

  if (unknown.length > 0) {
    const rules = await loadRelationRules();
    const res = await callEngine<{ rows: Array<{ personId: string; kind: string; value: number }> }>(
      "initRelationsNative",
      {
        worldSeed: p.worldSeed >>> 0,
        rules,
        people: unknown,
        draftRound: p.draftRound ?? 0,
        draftedContext: p.draftedContext ?? false,
      },
    );
    for (const row of res?.rows ?? []) {
      const rel: Relationship = {
        personId: row.personId,
        kind: row.kind as RelationKind,
        value: row.value,
        contact: "together",
        metSeason: p.season,
        metTeam: p.teamId,
        lastTeam: p.teamId,
        memories: [],
        updatedWeek: p.week,
      };
      writes.push(rel);
      created.push(rel);
    }
  }

  const reunited: Relationship[] = [];
  for (const x of reunitedSrc) {
    const prev = byId.get(x.personId)!;
    // 값은 손대지 않는다 — 감쇠는 이동·오프시즌에 이미 적용됐다
    const rel: Relationship = { ...prev, contact: "together", lastTeam: p.teamId, updatedWeek: p.week };
    writes.push(rel);
    reunited.push(rel);
  }

  if (writes.length > 0) await slotRepo.upsertRelationships(p.slotId, writes);
  return { created, reunited };
}

// ── 주간 갱신 ──────────────────────────────────────────────────

/**
 * 주간 관계 갱신. `contact === "together"`인 상대만 움직인다.
 *
 * 맞대결한 라이벌 중 관계 행이 없는 사람은 여기서 만든다 — 라이벌은 소속팀
 * 인원이 아니라 사건으로 관계가 시작되므로 `syncTeamRelationships`가 못 잡는다.
 */
export async function applyWeeklyRelations(p: {
  slotId: string;
  worldSeed: number;
  week: number;
  season: number;
  ctx: WeeklyRelationContext;
  /** 코치 소통력 계수 (§7-5 F-1). 없으면 중립 */
  relationMod?: number;
}): Promise<RelationDelta[]> {
  const rules = await loadRelationRules();
  const rows = await slotRepo.getRelationships(p.slotId, { contact: "together" });

  // 새로 만난 라이벌 — 사건이 관계의 시작이다
  const facedRivals = p.ctx.facedRivals ?? [];
  const knownIds = new Set(rows.map((r) => r.personId));
  const newRivals = facedRivals.filter((id) => !knownIds.has(id));
  if (newRivals.length > 0) {
    const res = await callEngine<{ rows: Array<{ personId: string; kind: string; value: number }> }>(
      "initRelationsNative",
      {
        worldSeed: p.worldSeed >>> 0,
        rules,
        people: newRivals.map((id) => ({ personId: id, kind: "rival" })),
        draftRound: 0,
        draftedContext: false,
      },
    );
    for (const r of res?.rows ?? []) {
      const rel: Relationship = {
        personId: r.personId,
        kind: "rival",
        value: r.value,
        contact: "together",
        metSeason: p.season,
        metTeam: "",
        lastTeam: "",
        memories: [],
        updatedWeek: p.week,
      };
      rows.push(rel);
    }
    await slotRepo.upsertRelationships(p.slotId, rows.filter((r) => newRivals.includes(r.personId)));
  }

  if (rows.length === 0) return [];

  // 코치 담당 영역 판정용 — 스태프 style이 곧 전문 영역이다 (6A)
  const specialtyOf = new Map<string, string>();
  if (p.ctx.trainingDone && p.ctx.trainingArea) {
    for (const e of get(masterStore).staffEntities) {
      if (e.role !== "coach") continue;
      const sp = (e.details as { coach?: { specialty?: string } } | undefined)?.coach?.specialty;
      if (sp) specialtyOf.set(e.id, sp);
    }
  }

  const res = await callEngine<DeltaResult>("weeklyRelationsNative", {
    worldSeed: p.worldSeed >>> 0,
    week: p.week,
    rules,
    rows: toEngineRows(rows, specialtyOf),
    ctx: p.ctx,
    relationMod: p.relationMod ?? 1.0,
  });
  const deltas = res?.deltas ?? [];
  if (deltas.length === 0) return [];

  await slotRepo.upsertRelationships(p.slotId, applyDeltas(rows, deltas, p.week));
  return withKind(deltas, rows);
}

// ── 시즌 종료 ──────────────────────────────────────────────────

/**
 * 시즌 종료 — `together`는 총평 가산, `apart`는 감쇠, `ended`는 동결.
 *
 * 주간과 분리한 이유: "이번 시즌 어땠나"를 주 단위로 쪼개면 판정이 흐려진다.
 */
export async function applySeasonRelations(p: {
  slotId: string;
  week: number;
  /** 주인공의 이번 시즌 ERA */
  era: number;
  /** 소속팀 리그 순위 백분위 (0.0 = 1위, 1.0 = 꼴찌) */
  teamRankPct: number;
  pitchedAny: boolean;
}): Promise<RelationDelta[]> {
  const rules = await loadRelationRules();
  const rows = await slotRepo.getRelationships(p.slotId);
  if (rows.length === 0) return [];

  const res = await callEngine<DeltaResult>("seasonRelationsNative", {
    rules,
    rows: toEngineRows(rows, new Map()),
    era: p.era,
    teamRankPct: p.teamRankPct,
    pitchedAny: p.pitchedAny,
  });
  const deltas = res?.deltas ?? [];
  if (deltas.length === 0) return [];

  await slotRepo.upsertRelationships(p.slotId, applyDeltas(rows, deltas, p.week));
  return withKind(deltas, rows);
}

// ── 팀 이동 ────────────────────────────────────────────────────

/**
 * 주인공이 팀을 옮겼다 (졸업·드래프트·이적·입대).
 *
 * 사용자 확정 **감쇠 후 보존**: 값을 0쪽으로 당기고 행은 남긴다.
 * 순서가 중요하다 — 감쇠를 먼저 하고 그 다음에 `apart`로 표시한다.
 * 뒤집으면 upsert가 contact를 `together`로 되돌려 감쇠가 두 번 걸린다.
 */
export async function onProtagonistTeamChange(p: {
  slotId: string;
  fromTeamId: string;
  week: number;
}): Promise<{ decayed: number }> {
  if (!p.fromTeamId) return { decayed: 0 };
  const rules = await loadRelationRules();
  const all = await slotRepo.getRelationships(p.slotId, { contact: "together" });
  // 그 팀에서 함께 있던 사람만 — 라이벌(lastTeam 없음)과 새 팀 사람은 제외
  const rows = all.filter((r) => r.lastTeam === p.fromTeamId);
  if (rows.length === 0) return { decayed: 0 };

  const res = await callEngine<DeltaResult>("relationMoveDecayNative", {
    rules,
    rows: toEngineRows(rows, new Map()),
  });
  const deltas = res?.deltas ?? [];
  if (deltas.length > 0) {
    await slotRepo.upsertRelationships(p.slotId, applyDeltas(rows, deltas, p.week));
  }
  await slotRepo.setRelationshipContact(p.slotId, { contact: "apart", fromTeam: p.fromTeamId });
  return { decayed: deltas.length };
}

/**
 * 관계도를 현재 소속과 맞춘다 — **주간 루프에서 매주 호출한다.**
 *
 * 팀 변경 지점마다 훅을 박지 않는 이유: 주인공 teamId를 바꾸는 곳이 졸업·드래프트·
 * 재계약·이적·입대로 최소 5곳이고, 하나만 빠뜨려도 관계가 옛 팀에 남는다.
 * 그리고 그 누락은 **조용하다** — 정확히 B1(졸업 반영 누락)이 생긴 방식이다.
 *
 * 여기서는 "together인데 lastTeam이 지금 팀이 아니다"를 팀 변경의 증거로 읽는다.
 * 어느 경로로 팀이 바뀌었든 다음 주에 스스로 복구된다.
 */
export async function reconcileRelationships(p: {
  slotId: string;
  worldSeed: number;
  teamId: string;
  season: number;
  week: number;
  teammateIds: string[];
  draftRound?: number;
  draftedContext?: boolean;
}): Promise<{ created: number; reunited: number; leftBehind: number }> {
  const together = await slotRepo.getRelationships(p.slotId, { contact: "together" });

  // lastTeam이 있고 지금 팀이 아닌 사람 = 두고 온 사람. 라이벌은 lastTeam이 비어 있다
  const staleTeams = new Set(
    together.filter((r) => r.lastTeam && r.lastTeam !== p.teamId).map((r) => r.lastTeam),
  );
  let leftBehind = 0;
  for (const from of staleTeams) {
    const { decayed } = await onProtagonistTeamChange({ slotId: p.slotId, fromTeamId: from, week: p.week });
    leftBehind += decayed;
  }

  const { created, reunited } = await syncTeamRelationships(p);
  return { created: created.length, reunited: reunited.length, leftBehind };
}

/** 상대가 은퇴·소멸했다 — 값을 동결하고 기록으로 남긴다 */
export async function endRelationships(slotId: string, personIds: string[]): Promise<void> {
  if (personIds.length === 0) return;
  await slotRepo.setRelationshipContact(slotId, { contact: "ended", personIds });
}

// ── 기억 ───────────────────────────────────────────────────────

const MAX_MEMORIES = 10;

/**
 * 사건을 관계에 각인한다. 값과 별개로 서사 문구의 근거가 된다.
 * 10건을 넘으면 **약한 것부터** 버린다 — 오래된 것부터 버리면 데뷔전 완봉승 같은
 * 인생 사건이 평범한 최근 경기에 밀린다.
 */
export async function addRelationMemory(
  slotId: string,
  personId: string,
  memory: RelationMemory,
): Promise<void> {
  const [row] = await slotRepo.getRelationships(slotId, { personIds: [personId] });
  if (!row) return;
  const merged = [...row.memories, memory];
  if (merged.length > MAX_MEMORIES) {
    merged.sort((a, b) =>
      a.intensity !== b.intensity ? a.intensity - b.intensity
        : a.season !== b.season ? a.season - b.season
        : a.week - b.week);
    merged.splice(0, merged.length - MAX_MEMORIES);
  }
  await slotRepo.upsertRelationships(slotId, [{ ...row, memories: merged }]);
}

// ── 조회 (효과 배선·화면용) ────────────────────────────────────

/** 관계값 맵. 없는 상대는 0(중립)으로 읽는다 — 판정이 undefined에 걸리지 않게 */
export async function relationValueMap(
  slotId: string,
  kind?: RelationKind,
  contact: RelationContact = "together",
): Promise<Map<string, number>> {
  const rows = await slotRepo.getRelationships(slotId, { kind, contact });
  return new Map(rows.map((r) => [r.personId, r.value]));
}

// ── 효과 (6C-5) ────────────────────────────────────────────────

export interface RelationEffects {
  /** 보직 배정 시 OVR에 더할 값 — 감독이 나를 어떻게 보는가 */
  roleOvrBias: number;
  /** 훈련 효율 배율에 더할 값 (0.04 = +4%p) */
  trainingBonus: number;
  managerLabel: string;
  coachLabel: string;
}

const NEUTRAL_EFFECTS: RelationEffects = {
  roleOvrBias: 0, trainingBonus: 0, managerLabel: "중립", coachLabel: "중립",
};

/**
 * 관계가 실제 판정을 얼마나 바꾸는가.
 *
 * 계산은 Rust가 한다 — 규칙 파일을 읽는 곳을 한 군데로 묶고, 보정을 **라벨 단계**로
 * 세기 때문이다(값이 아니라). 관계값은 플레이어에게 안 보이니 판정도 라벨로 해야
 * "각별인데 왜 안 써주지"가 생기지 않는다.
 *
 * @param coachSpecialty 이번 주 훈련 영역. 그 영역 담당 코치의 관계만 본다
 */
export async function relationEffects(p: {
  slotId: string;
  teamId: string;
  /** 담당 영역 코치 조회용 — masterStore.staffEntities */
  coachSpecialty?: string;
}): Promise<RelationEffects> {
  try {
    const rules = await loadRelationRules();
    const rows = await slotRepo.getRelationships(p.slotId, { contact: "together" });
    if (rows.length === 0) return NEUTRAL_EFFECTS;

    const managerValue = rows.find((r) => r.kind === "manager")?.value ?? 0;

    let coachValue = 0;
    if (p.coachSpecialty) {
      const staffById = new Map(
        get(masterStore).staffEntities.map((e) => [
          e.id,
          (e.details as { coach?: { specialty?: string } } | undefined)?.coach?.specialty,
        ]),
      );
      coachValue = rows.find(
        (r) => r.kind === "coach" && staffById.get(r.personId) === p.coachSpecialty,
      )?.value ?? 0;
    }

    const res = await callEngine<{
      roleOvrBias: number; trainingBonus: number;
      managerLabel: string; coachLabel: string;
    }>("relationEffectsNative", { rules, managerValue, coachValue });
    return res ?? NEUTRAL_EFFECTS;
  } catch (e) {
    // 관계를 못 읽으면 중립으로 돈다 — 보정이 없는 게 임의 보정보다 낫다
    console.warn("[relationships] 효과 조회 실패 — 중립으로 진행", e);
    return NEUTRAL_EFFECTS;
  }
}
