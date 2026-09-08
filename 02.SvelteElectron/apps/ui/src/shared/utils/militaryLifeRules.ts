/**
 * 현역 병영생활 — 순수 규칙 (docs/PLAN_MILITARY_LIFE.md 4부 §25~§28 · §38).
 *
 * 여기는 store 도 IPC 도 모른다. 주간 루프(`usecases/militaryLife.ts`)와 검사가 같은 함수를 쓴다.
 * 수치는 `rules.json` 에서 받는다 — 코드에 숫자를 두 번 적지 않는다.
 * 부대원 id 를 코드에 적지 않는다 — 동작 훅은 `members[].tags` 로 찾는다 (§37).
 */
import type {
  MilitaryCalendarEntry, MilitaryCondition, MilitaryLifeEvent, MilitaryLifeRules,
  MilitaryLifeState, MilitaryMember, MilitaryRoleId,
} from "../types/militaryLife";
import type { DecisionEffect } from "../types/main";
import type { CareerStage } from "../types/save";

export function presentMembers(members: readonly MilitaryMember[], week: number): MilitaryMember[] {
  return members.filter((m) => m.joinWeek <= week && week < m.leaveWeek);
}

/** 그 주의 캘린더 사건 — 보직 전용(role)이면 내 보직만 · 한 주 한 사건 */
export function calendarEntryFor(
  calendar: readonly MilitaryCalendarEntry[], week: number, roleId: MilitaryRoleId | null,
): MilitaryCalendarEntry | null {
  return calendar.find((c) => c.week === week && (c.role === undefined || c.role === null || c.role === roleId)) ?? null;
}

/** 입대 시 야구 감각 — 프로 출신 70 · 학생 55 · 그 밖 60 (§9 · rules 가 정본) */
export function senseStartFor(rules: MilitaryLifeRules, hiatusStage: CareerStage | null): number {
  if (hiatusStage === "pro_kbl" || hiatusStage === "pro_abl" || hiatusStage === "pro_jbl" || hiatusStage === "pro" || hiatusStage === "independent") {
    return rules.ballSense.startPro;
  }
  if (hiatusStage === "highschool" || hiatusStage === "university") return rules.ballSense.startStudent;
  return rules.ballSense.start;
}

/** 보직 반반 — 씨앗 하나로 (사용자 확정 §35 · Math.random 금지) */
export function roleFromSeed(seed: number): MilitaryRoleId {
  return Math.abs(Math.trunc(seed)) % 2 === 0 ? "signal" : "mortar";
}

export function memberWithTag(members: readonly MilitaryMember[], tag: string): MilitaryMember | null {
  return members.find((m) => m.tags.includes(tag)) ?? null;
}

export interface EligibilityCtx {
  week: number;
  band: number;
  roleId: MilitaryRoleId | null;
  state: MilitaryLifeState;
  present: ReadonlySet<string>;
  fatigue: number;
  morale: number;
  /** 시즌 주차에서 환산한 달 (1~12) */
  month: number;
  defaultCooldown: number;
}

export function conditionPasses(c: MilitaryCondition, ctx: EligibilityCtx): boolean {
  const rel = (id?: string) => (id ? ctx.state.relations[id] : undefined);
  const num = typeof c.value === "number" ? c.value : Number(c.value);
  switch (c.type) {
    case "week_between":  return ctx.week >= (c.from ?? 1) && ctx.week <= (c.to ?? 100);
    case "rank":          return ctx.band === num;
    case "role":          return ctx.roleId === c.value;
    case "relation_gte":  { const r = rel(c.member); return r !== undefined && r >= num; }
    case "relation_lte":  { const r = rel(c.member); return r !== undefined && r <= num; }
    case "ballSense_gte": return ctx.state.ballSense >= num;
    case "ballSense_lte": return ctx.state.ballSense <= num;
    case "fatigue_gte":   return ctx.fatigue >= num;
    case "fatigue_lte":   return ctx.fatigue <= num;
    case "morale_gte":    return ctx.morale >= num;
    case "morale_lte":    return ctx.morale <= num;
    case "member_present": return c.member !== undefined && ctx.present.has(c.member);
    case "season_month":  return ctx.month === num;
    case "leave_recent": {
      // 최근 n 주 안에 휴가가 있었는가 — choiceLog 에 null(선택 없음) 로 남은 휴가 주를 쓴다
      const n = num;
      return ctx.state.choiceLog.some((l) => l.choice === null && ctx.week - l.week <= n && l.week < ctx.week);
    }
    default: return false;
  }
}

/**
 * 랜덤 뽑기 후보인가 (§28) — 캘린더 이벤트는 제외 · once · 쿨다운 · 보직 · 계급 띠 · 부대원 재적 · 조건 전부.
 *
 * ⚠ 쿨다운은 `state.cooldown[id]`(마지막으로 뜬 복무 주) 하나로 본다. 예전 군 풀은 복원추출이라
 *   같은 이벤트가 2년에 여러 번 떴다 — 거르는 자리는 여기 하나다.
 */
export function isEligible(e: MilitaryLifeEvent, ctx: EligibilityCtx): boolean {
  if (e.calendar) return false;
  const last = ctx.state.cooldown[e.id];
  if (e.once && last !== undefined) return false;
  if (last !== undefined && ctx.week - last < (e.cooldownWeeks ?? ctx.defaultCooldown)) return false;
  if (e.roleTag && e.roleTag !== ctx.roleId) return false;
  if ((e.minRank ?? 0) > ctx.band) return false;
  if (e.maxRank !== undefined && ctx.band > e.maxRank) return false;
  if (e.member && !ctx.present.has(e.member)) return false;
  for (const c of e.conditions ?? []) if (!conditionPasses(c, ctx)) return false;
  return true;
}

export function eligibleEvents(events: readonly MilitaryLifeEvent[], ctx: EligibilityCtx): MilitaryLifeEvent[] {
  return events.filter((e) => isEligible(e, ctx));
}

/**
 * **옛 현역 풀(`military_general` 20종)을 병영생활 후보로 옮긴다** (2026-09-08).
 *
 * 🔴 왜 필요했나 (B 제보 · 실측으로 확인). `advanceWeek` 은 `militaryLife` 가
 *   있으면 새 경로로 빠지고, 그 경로는 `militaryLifeEvents` 만 읽는다.
 *   그런데 **새 게임의 현역 입대는 반드시 `militaryLife` 를 만든다**
 *   (`militaryDecision.enlistProtagonist` — `unit === "general"` 이면 무조건).
 *   그래서 `military_general` 20종이 **새 게임에서 한 번도 안 뜬다.**
 *   두 풀은 id 가 하나도 안 겹친다(실측 0/20) — 다른 이야기가 통째로 죽은 것이다.
 *
 * ⚠ **`relationDelta` 는 이름이 같은데 뜻이 다르다.** 병영생활은 부대원 관계
 *   (숫자), 옛 풀은 관계도(객체 `{kind,delta}`). 그대로 캐스팅하면
 *   `memberRelationDelta` 에 객체가 들어가 조용히 망가진다 — 그래서 옛 풀의
 *   `DecisionEffect` 몫은 `extraEffects` 로 **따로** 담는다.
 *
 * ⚠ **옛 세이브는 안 건드린다.** `militaryLife` 가 없는 세이브는 예전 갈래를
 *   그대로 타고, 거기서 이 풀을 원래대로 읽는다.
 * ⚠ **상무는 안 온다.** 새 경로 자체가 `!isSportsUnit` 일 때만이다.
 * ⚠ 이 풀이 정말 필요 없다고 판단되면 **파일을 지우면 된다** — 빈 풀이면
 *   여기서 빈 배열이 나오고 아무 일도 안 일어난다. 내용의 주인은 B 다.
 */
export function toLifeEvent(e: {
  id: string; title: string; description: string;
  minRank?: number; maxRank?: number; once?: boolean; cooldownWeeks?: number;
  choices?: Array<{ id: string; label: string; effectHint?: string } & DecisionEffect>;
}): MilitaryLifeEvent | null {
  if (!e.choices || e.choices.length === 0) return null;
  return {
    id: e.id, title: e.title, description: e.description,
    minRank: e.minRank, maxRank: e.maxRank, once: e.once, cooldownWeeks: e.cooldownWeeks,
    choices: e.choices.map((c) => {
      const {
        id, label, effectHint,
        fatigueDelta, moraleDelta, ballDelta, award, penalty, leaveDays, perfTierDelta,
        ...rest
      } = c as Record<string, unknown> & { id: string; label: string; effectHint?: string };
      return {
        id, label, effectHint,
        fatigueDelta: fatigueDelta as number | undefined,
        moraleDelta:  moraleDelta  as number | undefined,
        ballDelta:    ballDelta    as number | undefined,
        award:        award        as string | undefined,
        penalty:      penalty      as string | undefined,
        leaveDays:    leaveDays    as number | undefined,
        perfTierDelta: perfTierDelta as number | undefined,
        // 나머지(관계도 객체 · 돈 · XP · 성실 · 컨디션)는 그대로 둔다 —
        // `applyEventEffect`·`applySideEffects` 가 읽는 이름 그대로다
        ...(Object.keys(rest).length > 0
          ? { extraEffects: rest as import("../types/main").DecisionEffect }
          : {}),
      };
    }),
  };
}

export function weightOf(e: MilitaryLifeEvent): number {
  return e.weight !== undefined && e.weight > 0 ? e.weight : 1;
}

/** 성과 tier 1(최고)~6 — §28 · 표창·징계 이력은 안 들어간다(순환 방지). seedRoll 은 0·1·2 */
export function perfTier(rules: MilitaryLifeRules, band: number, graderRelation: number, fatigue: number, seedRoll: number): number {
  const raw = 3.5
    - rules.perf.bandCoef * (band - 1)
    - rules.perf.relationCoef * graderRelation
    + (fatigue > rules.perf.fatigueThreshold ? 1 : 0)
    + ((Math.abs(Math.trunc(seedRoll)) % 3) - 1);
  return Math.max(1, Math.min(6, Math.round(raw)));
}

export interface ChoiceCtx {
  week: number;
  event: MilitaryLifeEvent | null;
  present: readonly MilitaryMember[];
  mySubunit: string;
  ballCap: number;
}

/** 선택지 효과 중 병영생활 몫을 상태에 적는다 (§28 · 능력치·피로·사기는 기존 applyEffectToProtagonist 가 맡는다) */
export function applyChoiceToState(state: MilitaryLifeState, fx: DecisionEffect, ctx: ChoiceCtx): MilitaryLifeState {
  const next: MilitaryLifeState = {
    ...state,
    relations: { ...state.relations },
    awards: [...state.awards], penalties: [...state.penalties], perf: [...state.perf],
  };
  if (fx.memberRelationDelta) {
    const target = fx.relationTarget ?? ctx.event?.member ?? "all";
    const ids = target === "all"     ? ctx.present.map((m) => m.id)
              : target === "subunit" ? ctx.present.filter((m) => m.subunit === ctx.mySubunit).map((m) => m.id)
              : target === "junior"  ? ctx.present.filter((m) => m.role === "junior").map((m) => m.id)
              : ctx.present.some((m) => m.id === target) ? [target] : [];
    for (const id of ids) {
      next.relations[id] = Math.max(-100, Math.min(100, (next.relations[id] ?? 0) + fx.memberRelationDelta));
    }
  }
  if (fx.ballDelta) {
    const cap = Math.max(ctx.ballCap, Math.min(100, state.ballSense));
    next.ballSense = Math.max(0, Math.min(cap, state.ballSense + fx.ballDelta));
  }
  if (fx.award)   next.awards.push({ week: ctx.week, id: fx.award });
  if (fx.penalty) next.penalties.push({ week: ctx.week, id: fx.penalty });
  if (fx.leaveDays) next.leaveDays = state.leaveDays + fx.leaveDays;
  if (fx.perfTierDelta && ctx.event) {
    for (let i = next.perf.length - 1; i >= 0; i--) {
      if (next.perf[i].id === ctx.event.id) {
        next.perf[i] = { ...next.perf[i], tier: Math.max(1, Math.min(6, next.perf[i].tier + fx.perfTierDelta)) };
        break;
      }
    }
  }
  return next;
}

export interface ArcCtx {
  roleId: MilitaryRoleId | null;
  week: number;
  current: number;
  present: readonly MilitaryMember[];
  /** 보직의 판정 간부(grades_perf:<role>)와의 관계 */
  graderRelation: number;
  /** 지금까지 성과 최고(작을수록 좋다) · 없으면 null */
  bestPerfTier: number | null;
  mySubunit: string;
}

/**
 * 보직 아크 0~3 (§38-1) — 단조 증가. 조건이 안 맞아도 늦은 주에는 열린다(막히지 않는다).
 *   ㉡ 박격포병  0 탄약수 → 1 부사수(W35+ · 사수 자리(mentor:mortar) 빔 & 관계 ≥10 · 늦어도 W45)
 *                → 2 사수(W61+ · perf ≤4 or 관계 ≥20 · 늦어도 W75) → 3 포반장 대행(W85+ · 소단위 후임 재적)
 *   ㉠ 통신병    0 → 1 상황실 근무자(W35) → 2 중대 통신 담당(W61 · 관계 ≥10 · 늦어도 W75) · 3 없음
 */
export function arcStageFor(ctx: ArcCtx): number {
  let stage = ctx.current;
  if (ctx.roleId === "mortar") {
    const gunnerPresent = ctx.present.some((m) => m.tags.includes("mentor:mortar"));
    if (stage < 1 && ((ctx.week >= 35 && !gunnerPresent && ctx.graderRelation >= 10) || ctx.week >= 45)) stage = 1;
    if (stage === 1 && ((ctx.week >= 61 && ((ctx.bestPerfTier !== null && ctx.bestPerfTier <= 4) || ctx.graderRelation >= 20)) || ctx.week >= 75)) stage = 2;
    if (stage === 2 && ctx.week >= 85 && ctx.present.some((m) => m.role === "junior" && m.subunit === ctx.mySubunit)) stage = 3;
  } else if (ctx.roleId === "signal") {
    if (stage < 1 && ctx.week >= 35) stage = 1;
    if (stage === 1 && ((ctx.week >= 61 && ctx.graderRelation >= 10) || ctx.week >= 75)) stage = 2;
  }
  return stage;
}

export const ARC_LABELS: Record<MilitaryRoleId, string[]> = {
  mortar: ["탄약수", "부사수", "사수", "포반장 대행"],
  signal: ["통신병", "상황실 근무자", "중대 통신 담당", "중대 통신 담당"],
};

/** 전역 환산 (§9 · §30) — rules.discharge 를 위에서부터 첫 일치 · 감각이 높을수록 덜 깎이고 빨리 돌아온다 */
export function dischargeConversion(rules: MilitaryLifeRules, ballSense: number): { statDelta: number; velocityDelta: number; recoveryWeeks: number } {
  const row = rules.discharge.find((d) => ballSense >= d.minSense) ?? rules.discharge[rules.discharge.length - 1];
  return { statDelta: row.statDelta, velocityDelta: row.velocityDelta ?? 0, recoveryWeeks: row.recoveryWeeks };
}

/** 군 경력 한 장 (§30) — 상태를 접는다. 관계 상위 셋은 재적·전역(frozen) 을 합쳐 고른다 */
export function buildMilitaryRecord(
  state: MilitaryLifeState,
  unit: { id: string; name: string; roles: Array<{ id: MilitaryRoleId; label: string }> },
  members: readonly MilitaryMember[],
  conversion: { statDelta: number; velocityDelta: number; recoveryWeeks: number },
): import("../types/militaryLife").MilitaryRecord {
  const role = unit.roles.find((r) => r.id === state.roleId) ?? null;
  const all = { ...state.frozen, ...state.relations };
  const topRelations = Object.entries(all)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([memberId, value]) => {
      const m = members.find((x) => x.id === memberId);
      return { memberId, name: m?.name || m?.rank || memberId, value: Math.round(value) };
    });
  return {
    unitId: unit.id, unitName: unit.name,
    roleId: state.roleId, roleLabel: role?.label ?? "",
    arcLabel: state.roleId ? ARC_LABELS[state.roleId][Math.min(state.arcStage, 3)] : "",
    finalBallSense: Math.round(state.ballSense),
    leaveDays: state.leaveDays,
    awards: [...state.awards], penalties: [...state.penalties], perf: [...state.perf],
    topRelations, senseCurve: [...state.senseCurve],
    conversion,
  };
}

/** 문안 자리표시자 — {unit.name} {unit.location} {role.label} {member.name} {tier} */
export function fillText(text: string, vars: Record<string, string | number | undefined>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) continue;
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}
