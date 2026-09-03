/**
 * 현역 병영생활 — 주간 루프 (docs/PLAN_MILITARY_LIFE.md 4부 §25).
 *
 * 순서가 곧 명세다:
 *   ① 전입·전출·진급 → ② 캘린더(확률 밖) → ③ 선택(탭에서 미리 고른 것 · 없으면 쉰다)
 *   → ④ Rust 자원 계산 → ⑤ 이벤트(캘린더가 떴으면 건너뜀 · 아니면 40% 한 건)
 *   → ⑥ 소식(이벤트 · 4주마다 부대 소식) → ⑦ 상태 갱신 (senseCurve · 아크 · choiceLog)
 *
 * 상무와 `militaryLife` 가 없는 옛 세이브는 이 루프를 안 탄다 — advanceWeek 의 옛 갈래가 그대로 받는다.
 * 규칙(순수 함수)은 `utils/militaryLifeRules.ts` · 수치는 `military/rules.json`.
 */
import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { seedOf } from "../utils/seedOf";
import type { DecisionEffect, MessageItem } from "../types/main";
import type { ProtagonistSave } from "../types/save";
import type { MilitaryLifeEvent, MilitaryLifeState, MilitaryMember } from "../types/militaryLife";
import { emptyMilitaryLife, rankBandOf } from "../types/militaryLife";
import {
  ARC_LABELS, applyChoiceToState, arcStageFor, calendarEntryFor, eligibleEvents, fillText,
  memberWithTag, perfTier, presentMembers, roleFromSeed, senseStartFor, weightOf,
} from "../utils/militaryLifeRules";

/** 입대 주에 만든다 — 현역만. 데이터가 없으면 null (옛 갈래로 간다 · check:militarydata 가 알린다) */
export function startMilitaryLife(p: ProtagonistSave): MilitaryLifeState | null {
  const m = get(masterStore);
  if (!m.militaryUnit || !m.militaryLifeRules) return null;
  const state = emptyMilitaryLife(m.militaryUnit.id, senseStartFor(m.militaryLifeRules, p.militaryHiatusStage));
  for (const mem of presentMembers(m.militaryMembers, 0)) state.relations[mem.id] = mem.relationStart;
  return state;
}

interface MilitaryLifeWeekOut {
  patch: Partial<ProtagonistSave>;
  logs: string[];
  messages: MessageItem[];
}

interface RustResult {
  fatigue: number; morale: number; ballSense: number; ballSenseCap: number;
  relationDeltas: Array<{ id: string; delta: number }>;
  peopleTargets: string[];
  eventIndex: number | null;
  error?: string;
}

const CHOICE_LABEL = { ball: "공을 만졌다", people: "사람과 지냈다", rest: "쉬었다" } as const;

export async function runMilitaryLifeWeek(args: { nextWeek: number; seasonYear: number }): Promise<MilitaryLifeWeekOut | null> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);
  const p = g.protagonist;
  const rules = m.militaryLifeRules;
  const unit = m.militaryUnit;
  if (!p.militaryLife || !rules || !unit) return null;

  const state: MilitaryLifeState = {
    ...p.militaryLife,
    relations: { ...p.militaryLife.relations }, frozen: { ...p.militaryLife.frozen },
    calendarDone: [...p.militaryLife.calendarDone], cooldown: { ...p.militaryLife.cooldown },
    choiceLog: [...p.militaryLife.choiceLog], awards: [...p.militaryLife.awards],
    penalties: [...p.militaryLife.penalties], perf: [...p.militaryLife.perf], senseCurve: [...p.militaryLife.senseCurve],
  };
  const week = p.militaryServiceWeeks;           // advanceMilitaryWeek 가 이미 +1 했다
  const band = rankBandOf(week, rules.rankBandWeeks);
  const prevBand = rankBandOf(week - 1, rules.rankBandWeeks);
  const members = m.militaryMembers;
  const worldSeed = s.worldSeed ?? 0;
  const logs: string[] = [];
  const messages: MessageItem[] = [];
  const msg = (id: string, subject: string, body: string): MessageItem => ({
    id, category: "system", sender: "군 복무", subject,
    preview: body.split("\n")[0] ?? "", body, createdAt: `W${args.nextWeek}`, readAt: null,
  });

  // ① 전입·전출·진급
  for (const mem of members) {
    // leaveWeek 100 은 "복무 끝까지" 다 — 전역 주(W100)에 전원을 얼리면 부대원 탭이 모두 "전역" 으로 보인다 (실측 09-02: frozen 15)
    if (mem.leaveWeek === week && week < rules.serviceWeeks && state.relations[mem.id] !== undefined) {
      state.frozen[mem.id] = state.relations[mem.id];
      delete state.relations[mem.id];
      messages.push(msg(`msg-mil-unit-leave-${mem.id}-${args.seasonYear}-w${args.nextWeek}`, `${mem.name || mem.rank} 전역`,
        `${mem.name || mem.rank}(${mem.rank})이 전역했다. 관계는 그대로 남는다 — 전역 뒤 다시 만날 수 있다.`));
    }
    if (mem.joinWeek === week && mem.joinWeek > 0 && state.relations[mem.id] === undefined) {
      state.relations[mem.id] = mem.relationStart;
      messages.push(msg(`msg-mil-unit-join-${mem.id}-${args.seasonYear}-w${args.nextWeek}`, `후임 도착 — ${mem.name || mem.rank}`,
        `${mem.name || mem.rank}(${mem.rank})이 ${mem.subunit}에 왔다.`));
    }
  }
  if (band !== prevBand && band === 1) {
    messages.push(msg(`msg-mil-unit-rank-${args.seasonYear}-w${args.nextWeek}`, "일병 진급", "이병 딱지를 뗐다. 이제 주간 선택이 조금 더 넓어진다."));
  }

  // ② 보직 — W6 · 반반 랜덤 (사용자 확정) · 씨앗 하나
  if (state.roleId === null && week >= 6) {
    state.roleId = unit.roleAssign === "random" ? roleFromSeed(seedOf(worldSeed, "military-role")) : unit.roleAssign;
    logs.push(`[군] 보직 확정 — ${unit.roles.find((r) => r.id === state.roleId)?.label ?? state.roleId}`);
  }
  const role = unit.roles.find((r) => r.id === state.roleId) ?? null;
  const bootCamp = week <= rules.bootCampWeeks;
  const mySubunit = role?.subunit ?? "";

  // ③ 캘린더 · 선택
  const cal = calendarEntryFor(m.militaryCalendar, week, state.roleId);
  const calEvent = cal ? m.militaryLifeEvents.find((e) => e.id === cal.event) ?? null : null;
  const onLeave = !!cal?.leaveDays;
  const noChoice = bootCamp || onLeave || !!cal?.noChoice;
  // 헤드리스 정책 — 계측(probe:paths · probe:military)이 `globalThis.__PB_MIL_CHOICE` 로 준다.
  // 실제 플레이는 탭에서 미리 고른 nextChoice 뿐이고, 없으면 "쉰다"(§35). 여기 말고 다른 자리에 정책을 두지 않는다.
  const policy = (globalThis as Record<string, unknown>).__PB_MIL_CHOICE;
  const policyChoice = policy === "ball" || policy === "people" || policy === "rest" ? policy
    : policy === "mix" ? (["ball", "people", "rest"] as const)[week % 3] : null;
  const choice = noChoice ? "none" : (state.nextChoice ?? policyChoice ?? "rest");

  // ④ Rust — 자원 셋 · 관계 감쇠/가산 · 이벤트 굴림 (씨앗)
  const present = presentMembers(members, week);
  const presentIds = new Set(present.map((x) => x.id));
  const month = Math.max(1, Math.min(12, Math.ceil(((args.nextWeek - 1) % 52 + 1) / 4.34)));
  const ctx = { week, band, roleId: state.roleId, state, present: presentIds, fatigue: p.fatigue, morale: p.morale, month, defaultCooldown: rules.event.defaultCooldown };
  const candidates = calEvent ? [] : eligibleEvents(m.militaryLifeEvents, ctx);
  const payload = {
    seed: seedOf(worldSeed, args.seasonYear, args.nextWeek, "military-life"),
    dutyIntensity: role?.dutyIntensity ?? 5,
    ballAccess: bootCamp ? 0 : (role?.ballAccess ?? 0),
    rankBand: band,
    choice,
    fatigue: p.fatigue, morale: p.morale, ballSense: state.ballSense,
    calendarFatigue: cal?.fatigue ?? 0,
    calendarBall: cal?.ballDelta ?? 0,
    onLeave, bootCamp,
    members: present.map((x) => ({ id: x.id, relation: state.relations[x.id] ?? x.relationStart, sameSubunit: x.subunit === mySubunit })),
    candidateWeights: candidates.map(weightOf),
    fatigueBaseByIntensity: rules.fatigue.baseByIntensity,
    fatigueChoiceBall: rules.fatigue.choice.ball, fatigueChoicePeople: rules.fatigue.choice.people, fatigueChoiceRest: rules.fatigue.choice.rest,
    fatigueNatural: rules.fatigue.natural, fatigueLeave: rules.fatigue.leave,
    moraleChoicePeople: rules.morale.choice.people ?? 0, moraleChoiceRest: rules.morale.choice.rest ?? 0, moraleLeave: rules.morale.leave,
    senseWeeklyDecay: rules.ballSense.weeklyDecay, senseGainByAccess: rules.ballSense.gainByAccess,
    senseCapPerAccessGap: rules.ballSense.capPerAccessGap, senseLeaveGain: rules.ballSense.leaveGain,
    relationWeeklyDecay: rules.relation.weeklyDecay, relationPeopleByBand: rules.relation.peopleByBand,
    relationSameSubunitWeight: rules.relation.sameSubunitWeight,
    eventWeeklyChance: rules.event.weeklyChance,
  };
  const res = JSON.parse(await window.projectB!.engine("weekCalcMilitaryLifeNative", JSON.stringify(payload))) as RustResult;
  // ⚠ 오류를 삼키지 않는다 — 옛 군 갈래가 `{error}` 를 그대로 읽어 피로가 NaN 이 된 적이 있다
  if (!res || res.error || typeof res.fatigue !== "number") {
    throw new Error(`[병영] 주간 계산 실패: ${res?.error ?? JSON.stringify(res).slice(0, 200)}`);
  }
  state.ballSense = res.ballSense;
  for (const d of res.relationDeltas) {
    if (state.relations[d.id] === undefined) continue;
    state.relations[d.id] = Math.max(-100, Math.min(100, state.relations[d.id] + d.delta));
  }
  if (onLeave && cal?.leaveDays) state.leaveDays += cal.leaveDays;

  // ⑤ 이벤트 — 캘린더가 먼저 · 없으면 Rust 가 고른 후보
  const grader = state.roleId ? memberWithTag(members, `grades_perf:${state.roleId}`) : null;
  const graderRelation = grader ? (state.relations[grader.id] ?? 0) : 0;
  let fired: MilitaryLifeEvent | null = null;
  if (calEvent && !state.calendarDone.includes(calEvent.id)) {
    state.calendarDone.push(calEvent.id);
    fired = calEvent;
  } else if (!calEvent && res.eventIndex !== null && candidates[res.eventIndex]) {
    fired = candidates[res.eventIndex];
    state.cooldown[fired.id] = week;
  }
  if (fired) {
    let tier: number | undefined;
    if (fired.perf) {
      tier = perfTier(rules, band, graderRelation, p.fatigue, seedOf(worldSeed, args.seasonYear, args.nextWeek, "military-perf") % 3);
      state.perf.push({ week, id: fired.id, tier, note: `${fired.title} ${tier}등급` });
    }
    const memberOf = fired.member ? members.find((x) => x.id === fired!.member) : null;
    const vars = {
      "unit.name": unit.name, "unit.location": unit.location,
      "role.label": role?.label ?? "", "member.name": memberOf?.name || memberOf?.rank, tier,
    };
    const description = fillText(fired.description, vars);
    seasonStore.pushPendingAction({
      type: "event", eventId: fired.id, title: fired.title, description,
      choices: fired.choices.map((c) => ({
        id: c.id, label: c.label, effectHint: c.effectHint,
        effects: {
          fatigueDelta: c.fatigueDelta, moraleDelta: c.moraleDelta,
          memberRelationDelta: c.relationDelta, ballDelta: c.ballDelta,
          award: c.award, penalty: c.penalty, leaveDays: c.leaveDays, perfTierDelta: c.perfTierDelta,
        } satisfies DecisionEffect,
      })),
    });
    logs.push(`[군] ${fired.title}`);
    messages.push(msg(`msg-mil-ev-${fired.id}-${args.seasonYear}-w${args.nextWeek}`, fired.title, description));
  }

  // ⑥ 4주마다 부대 소식
  if (week % 4 === 0) {
    const next = m.militaryCalendar
      .filter((c) => c.week > week && (c.role === undefined || c.role === null || c.role === state.roleId))
      .sort((a, b) => a.week - b.week)[0];
    const targets = res.peopleTargets.map((id) => members.find((x) => x.id === id)?.name || members.find((x) => x.id === id)?.rank || id);
    const top = Object.entries(state.relations).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id, v]) => `${members.find((x) => x.id === id)?.name || members.find((x) => x.id === id)?.rank || id} ${Math.round(v)}`);
    const body = [
      `복무 ${week}/${rules.serviceWeeks}주 · ${role?.label ?? "훈련병"}${state.roleId ? ` · ${ARC_LABELS[state.roleId][state.arcStage]}` : ""}`,
      `야구 감각 ${Math.round(state.ballSense)} (상한 ${Math.round(res.ballSenseCap)}) · 피로 ${Math.round(res.fatigue)} · 사기 ${Math.round(res.morale)}`,
      targets.length ? `이번 주 함께한 사람: ${targets.join(", ")}` : "",
      top.length ? `관계 상위: ${top.join(" · ")}` : "",
      `휴가 누계 ${state.leaveDays}일 · 표창 ${state.awards.length} · 징계 ${state.penalties.length}`,
      next ? `다음 사건: W${next.week} ${next.label} (${next.week - week}주 뒤)` : "",
    ].filter(Boolean).join("\n");
    messages.push(msg(`msg-mil-digest-${args.seasonYear}-w${args.nextWeek}`, "이번 달 부대 소식", body));
    state.senseCurve.push(Math.round(state.ballSense));
  }

  // ⑦ 상태
  state.choiceLog.push({ week, choice: choice === "none" ? null : choice });
  if (state.choiceLog.length > rules.serviceWeeks) state.choiceLog.splice(0, state.choiceLog.length - rules.serviceWeeks);
  state.nextChoice = null;
  const bestPerf = state.perf.length ? Math.min(...state.perf.map((x) => x.tier)) : null;
  const arc = arcStageFor({ roleId: state.roleId, week, current: state.arcStage, present, graderRelation, bestPerfTier: bestPerf, mySubunit });
  if (arc !== state.arcStage && state.roleId) {
    state.arcStage = arc;
    // 🔴 **조사를 붙이지 않는다** (B-28 — 보직 이름 일곱 중 넷이 받침이라
    //    「이 됐다」가 네 자리에서 틀렸다). 체언 종지다
    messages.push(msg(`msg-mil-unit-arc-${args.seasonYear}-w${args.nextWeek}`,
      `보직 변화 ${ARC_LABELS[state.roleId][arc]}`,
      `보직: ${ARC_LABELS[state.roleId][arc]}`));
    logs.push(`[군] ${ARC_LABELS[state.roleId][arc]}`);
  }
  logs.unshift(`군 복무(현역) — ${week}주차${choice === "none" ? (onLeave ? " · 휴가" : bootCamp ? " · 훈련소" : "") : ` · ${CHOICE_LABEL[choice]}`}`);

  // 정수로 저장한다 — 옛 군 갈래(Rust u32)와 같다. 소수로 두면 이벤트 조건·소식이 "68.628…" 을 본다 (C 회신 09-02)
  return { patch: { fatigue: Math.round(res.fatigue), morale: Math.round(res.morale), militaryLife: state }, logs, messages };
}

/** 이벤트 선택지 중 병영생활 몫 — 관계·감각·상벌·휴가·성과 보정 (§28). 옛 군 풀 이벤트면 아무것도 안 한다 */
export function applyMilitaryEventChoice(eventId: string, fx: DecisionEffect): void {
  const g = get(gameStore);
  const m = get(masterStore);
  const p = g.protagonist;
  if (!p.militaryLife || !m.militaryUnit) return;
  const event = m.militaryLifeEvents.find((e) => e.id === eventId) ?? null;
  if (!event) return;
  const week = p.militaryServiceWeeks;
  const role = m.militaryUnit.roles.find((r) => r.id === p.militaryLife!.roleId) ?? null;
  const rules = m.militaryLifeRules;
  const cap = rules ? 100 - rules.ballSense.capPerAccessGap * (3 - (role?.ballAccess ?? 0)) : 100;
  const present: MilitaryMember[] = presentMembers(m.militaryMembers, week);
  gameStore.setMilitaryLife(applyChoiceToState(p.militaryLife, fx, { week, event, present, mySubunit: role?.subunit ?? "", ballCap: cap }));
}
