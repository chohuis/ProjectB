import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyChoiceToState, arcStageFor, buildMilitaryRecord, calendarEntryFor, dischargeConversion,
  eligibleEvents, fillText, isEligible, perfTier, presentMembers, roleFromSeed, senseStartFor,
} from "../militaryLifeRules";
import { emptyMilitaryLife, MILITARY_CONDITION_TYPES } from "../../types/militaryLife";
import type { MilitaryLifeEvent, MilitaryLifeRules, MilitaryMember } from "../../types/militaryLife";

// 실제 규칙 파일을 읽는다 — 코드에 숫자를 다시 적지 않는다
const ROOT = resolve(__dirname, "../../../../../../");
const rules = JSON.parse(readFileSync(resolve(ROOT, "resource/data/master/military/rules.json"), "utf8")) as MilitaryLifeRules;
const members = JSON.parse(readFileSync(resolve(ROOT, "resource/data/master/military/members.json"), "utf8")) as MilitaryMember[];
const calendar = JSON.parse(readFileSync(resolve(ROOT, "resource/data/master/military/calendar.json"), "utf8"));

const ev = (over: Partial<MilitaryLifeEvent>): MilitaryLifeEvent => ({
  id: "E", title: "t", description: "d", choices: [{ id: "ok", label: "ok" }], ...over,
});
const ctxOf = (week: number, over: Partial<Parameters<typeof isEligible>[1]> = {}) => ({
  week, band: week <= 8 ? 0 : week <= 34 ? 1 : week <= 60 ? 2 : 3, roleId: "mortar" as const,
  state: emptyMilitaryLife("U", 60), present: new Set(presentMembers(members, week).map((m) => m.id)),
  fatigue: 50, morale: 60, month: 6, defaultCooldown: rules.event.defaultCooldown, ...over,
});

describe("부대원 재적 · 캘린더", () => {
  it("joinWeek ≤ W < leaveWeek 만 재적 — 후임은 W36 부터, 사수는 W30 에 빠진다", () => {
    const at29 = presentMembers(members, 29).map((m) => m.id);
    const at36 = presentMembers(members, 36).map((m) => m.id);
    expect(at29).toContain("MEM_GUNNER");
    expect(at36).not.toContain("MEM_GUNNER");
    expect(at29).not.toContain("MEM_JR_1");
    expect(at36).toContain("MEM_JR_1");
  });

  it("캘린더는 한 주 한 사건이고 보직 전용은 내 보직만 온다", () => {
    expect(calendarEntryFor(calendar, 44, "signal")?.event).toBe("MIL_CAL_WINTER");
    expect(calendarEntryFor(calendar, 45, "signal")).toBeNull();
    const roleOnly = [{ week: 3, event: "X", label: "x", role: "mortar" as const }];
    expect(calendarEntryFor(roleOnly, 3, "signal")).toBeNull();
    expect(calendarEntryFor(roleOnly, 3, "mortar")?.event).toBe("X");
  });

  it("야구 감각 시작값 — 프로 출신 70 · 학생 55 · 그 밖 60 (rules 가 정본)", () => {
    expect(senseStartFor(rules, "pro_kbl")).toBe(rules.ballSense.startPro);
    expect(senseStartFor(rules, "highschool")).toBe(rules.ballSense.startStudent);
    expect(senseStartFor(rules, null)).toBe(rules.ballSense.start);
  });

  it("보직은 씨앗 하나로 반반이다", () => {
    let signal = 0;
    for (let s = 0; s < 1000; s++) if (roleFromSeed(s) === "signal") signal++;
    expect(signal).toBe(500);
    expect(roleFromSeed(12345)).toBe(roleFromSeed(12345));
  });
});

describe("이벤트 후보 거르기 (§28)", () => {
  it("캘린더 이벤트는 랜덤 후보가 아니다", () => {
    expect(isEligible(ev({ calendar: true }), ctxOf(10))).toBe(false);
    expect(isEligible(ev({}), ctxOf(10))).toBe(true);
  });

  it("쿨다운 — 마지막으로 뜬 주에서 cooldownWeeks 안이면 안 뜬다 · 지나면 뜬다 · once 는 영영", () => {
    const c = ctxOf(20);
    c.state.cooldown = { E: 18 };
    expect(isEligible(ev({ cooldownWeeks: 4 }), c)).toBe(false);
    expect(isEligible(ev({ cooldownWeeks: 2 }), c)).toBe(true);
    expect(isEligible(ev({}), c)).toBe(false);                 // 기본 쿨다운 4
    expect(isEligible(ev({ once: true, cooldownWeeks: 1 }), c)).toBe(false);
  });

  it("보직 · 계급 띠 · 부대원 재적", () => {
    expect(isEligible(ev({ roleTag: "signal" }), ctxOf(10))).toBe(false);
    expect(isEligible(ev({ roleTag: "mortar" }), ctxOf(10))).toBe(true);
    expect(isEligible(ev({ minRank: 2 }), ctxOf(10))).toBe(false);
    expect(isEligible(ev({ maxRank: 0 }), ctxOf(10))).toBe(false);
    expect(isEligible(ev({ member: "MEM_GUNNER" }), ctxOf(29))).toBe(true);
    expect(isEligible(ev({ member: "MEM_GUNNER" }), ctxOf(31))).toBe(false);
  });

  it("조건 어휘 전부 — 관계·감각·피로·사기·주·달·재적·역할", () => {
    const c = ctxOf(40);
    c.state.relations = { MEM_1SG: -30 };
    c.state.ballSense = 25;
    expect(isEligible(ev({ conditions: [{ type: "relation_lte", member: "MEM_1SG", value: -25 }] }), c)).toBe(true);
    expect(isEligible(ev({ conditions: [{ type: "relation_gte", member: "MEM_1SG", value: 0 }] }), c)).toBe(false);
    expect(isEligible(ev({ conditions: [{ type: "ballSense_lte", value: 30 }] }), c)).toBe(true);
    expect(isEligible(ev({ conditions: [{ type: "fatigue_gte", value: 85 }] }), c)).toBe(false);
    expect(isEligible(ev({ conditions: [{ type: "morale_lte", value: 60 }] }), c)).toBe(true);
    expect(isEligible(ev({ conditions: [{ type: "week_between", from: 40, to: 48 }] }), c)).toBe(true);
    expect(isEligible(ev({ conditions: [{ type: "week_between", from: 41, to: 48 }] }), c)).toBe(false);
    expect(isEligible(ev({ conditions: [{ type: "season_month", value: 6 }] }), c)).toBe(true);
    expect(isEligible(ev({ conditions: [{ type: "member_present", member: "MEM_JR_1" }] }), c)).toBe(true);
    expect(isEligible(ev({ conditions: [{ type: "role", value: "signal" }] }), c)).toBe(false);
    // 어휘 밖은 통과시키지 않는다 — 검사와 같은 규칙
    expect(isEligible(ev({ conditions: [{ type: "weather" as never }] }), c)).toBe(false);
  });

  it("조건 어휘 목록은 검사 스크립트와 같다", () => {
    const src = readFileSync(resolve(ROOT, "scripts/check-militarydata.cjs"), "utf8");
    for (const t of MILITARY_CONDITION_TYPES) expect(src).toContain(`"${t}"`);
  });

  it("eligibleEvents 는 순서를 지킨다 (가중 인덱스가 Rust 와 맞물린다)", () => {
    const list = [ev({ id: "a", calendar: true }), ev({ id: "b" }), ev({ id: "c", roleTag: "signal" }), ev({ id: "d" })];
    expect(eligibleEvents(list, ctxOf(10)).map((e) => e.id)).toEqual(["b", "d"]);
  });
});

describe("선택지 효과 → 상태 (§28)", () => {
  const present = presentMembers(members, 10);
  const base = () => { const s = emptyMilitaryLife("U", 60); for (const m of present) s.relations[m.id] = 0; return s; };

  it("relationDelta 대상 — 이벤트의 member 가 기본 · all · subunit · junior", () => {
    const s = base();
    const a = applyChoiceToState(s, { memberRelationDelta:8 }, { week: 10, event: ev({ member: "MEM_SQ_LDR" }), present, mySubunit: "SQ1", ballCap: 80 });
    expect(a.relations.MEM_SQ_LDR).toBe(8);
    expect(a.relations.MEM_CO).toBe(0);
    const b = applyChoiceToState(s, { memberRelationDelta:2, relationTarget: "all" }, { week: 10, event: null, present, mySubunit: "SQ1", ballCap: 80 });
    expect(Object.values(b.relations).every((v) => v === 2)).toBe(true);
    const c = applyChoiceToState(s, { memberRelationDelta:3, relationTarget: "subunit" }, { week: 10, event: null, present, mySubunit: "SQ1", ballCap: 80 });
    expect(c.relations.MEM_SQ_LDR).toBe(3);
    expect(c.relations.MEM_CO).toBe(0);
  });

  it("ballDelta 는 상한을 넘지 않고 · 상벌·휴가는 쌓이고 · perfTierDelta 는 그 이벤트의 마지막 성과에만", () => {
    const s = base();
    s.ballSense = 78; s.perf = [{ week: 5, id: "X", tier: 3, note: "" }, { week: 9, id: "Y", tier: 4, note: "" }];
    const n = applyChoiceToState(s, { ballDelta: 6, award: "A1", leaveDays: 4, perfTierDelta: -1 },
      { week: 10, event: ev({ id: "Y" }), present, mySubunit: "SQ1", ballCap: 80 });
    expect(n.ballSense).toBe(80);
    expect(n.awards).toEqual([{ week: 10, id: "A1" }]);
    expect(n.leaveDays).toBe(4);
    expect(n.perf.map((p) => p.tier)).toEqual([3, 3]);
    expect(s.perf[1].tier).toBe(4);   // 원본 불변
  });
});

describe("성과 tier · 보직 아크 (§28 · §38)", () => {
  it("tier 는 1~6 · 계급이 오르고 관계가 좋으면 내려간다(좋아진다) · 피로 70 넘으면 +1", () => {
    expect(perfTier(rules, 0, -40, 90, 2)).toBe(6);
    expect(perfTier(rules, 3, 60, 30, 0)).toBe(1);
    const mid = perfTier(rules, 1, 0, 50, 1);
    expect(perfTier(rules, 1, 0, 80, 1)).toBe(mid + 1);
    expect(perfTier(rules, 2, 0, 50, 1)).toBeLessThan(mid);
  });

  it("박격포병 아크 — 사수 자리가 비고 관계가 있으면 W35 부사수 · 늦어도 W45 · 사수는 W61/W75 · 대행은 후임 있어야", () => {
    const at = (week: number, current: number, rel: number, best: number | null) =>
      arcStageFor({ roleId: "mortar", week, current, present: presentMembers(members, week), graderRelation: rel, bestPerfTier: best, mySubunit: "SQ1" });
    expect(at(29, 0, 50, null)).toBe(0);          // 사수 아직 있다
    expect(at(35, 0, 12, null)).toBe(1);
    expect(at(35, 0, 0, null)).toBe(0);
    expect(at(45, 0, 0, null)).toBe(1);
    expect(at(61, 1, 0, 4)).toBe(2);
    expect(at(61, 1, 0, 5)).toBe(1);
    expect(at(75, 1, 0, null)).toBe(2);
    expect(at(85, 2, 0, null)).toBe(3);           // MEM_JR_1 (SQ1 · W36 입대) 재적
    expect(at(90, 3, 0, null)).toBe(3);
  });

  it("통신병 아크는 셋까지 · 단조", () => {
    const at = (week: number, current: number, rel: number) =>
      arcStageFor({ roleId: "signal", week, current, present: presentMembers(members, week), graderRelation: rel, bestPerfTier: null, mySubunit: "HQ" });
    expect(at(35, 0, 0)).toBe(1);
    expect(at(61, 1, 0)).toBe(1);
    expect(at(61, 1, 10)).toBe(2);
    expect(at(75, 1, 0)).toBe(2);
    expect(at(90, 2, 0)).toBe(2);
  });

  it("문안 자리표시자", () => {
    expect(fillText("{unit.name} — {role.label} {tier}등급", { "unit.name": "중대", "role.label": "통신병", tier: 2 })).toBe("중대 — 통신병 2등급");
    expect(fillText("{member.name}", { "member.name": undefined })).toBe("{member.name}");
  });
});

describe("전역 (§30)", () => {
  it("환산은 감각 구간으로 — 80 이상 손실 0 · 회복 2주 · 20 미만 −4 에 구속 −1 · 회복 10주 (rules 정본)", () => {
    expect(dischargeConversion(rules, 92)).toEqual({ statDelta: 0, velocityDelta: 0, recoveryWeeks: 2 });
    expect(dischargeConversion(rules, 80)).toEqual({ statDelta: 0, velocityDelta: 0, recoveryWeeks: 2 });
    expect(dischargeConversion(rules, 79.9).statDelta).toBe(-1);
    expect(dischargeConversion(rules, 47)).toEqual({ statDelta: -2, velocityDelta: 0, recoveryWeeks: 6 });
    expect(dischargeConversion(rules, 5)).toEqual({ statDelta: -4, velocityDelta: -1, recoveryWeeks: 10 });
  });

  it("군 경력 한 장 — 관계 상위 셋은 전역한 부대원(frozen)도 센다 · 원본 불변", () => {
    const st = emptyMilitaryLife("U", 47);
    st.roleId = "mortar"; st.arcStage = 2; st.leaveDays = 14;
    st.relations = { MEM_AMMO_PR: 25, MEM_SQ_LDR: 5 };
    st.frozen = { MEM_GUNNER: 22 };
    st.awards.push({ week: 70, id: "A" });
    st.perf.push({ week: 16, id: "MIL_CAL_FIRE_1", tier: 3, note: "" });
    const unit = { id: "U", name: "중대", roles: [{ id: "mortar" as const, label: "박격포병" }, { id: "signal" as const, label: "통신병" }] };
    const rec = buildMilitaryRecord(st, unit, members, dischargeConversion(rules, st.ballSense));
    expect(rec.roleLabel).toBe("박격포병");
    expect(rec.arcLabel).toBe("사수");
    expect(rec.topRelations.map((r) => r.memberId)).toEqual(["MEM_AMMO_PR", "MEM_GUNNER", "MEM_SQ_LDR"]);
    expect(rec.conversion.recoveryWeeks).toBe(6);
    expect(rec.awards).toHaveLength(1);
    rec.awards.push({ week: 1, id: "X" });
    expect(st.awards).toHaveLength(1);
  });
});
