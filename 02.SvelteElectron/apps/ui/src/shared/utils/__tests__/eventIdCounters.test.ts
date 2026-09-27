import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eventIdCounters, resetEventIdCounters, runEventEngine } from "../eventEngine";
import { parseTierRules, type TierRules } from "../tierRules";
import type { EventRule, MessageTemplate, EventContext } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";
import RAW_TIER_RULES from "../../../../../../resource/data/master/events/tier_rules.json";

/**
 * **뜬 이벤트 id 계수기 — 계측 모드 배선** (2026-09-27 · A · Ⅳ 폴백).
 *
 * 🔴 왜 만들었나. 판 JSON 의 「해마다」 줄에 등급별 **건수**만 있어서 「B 가
 *   넣은 레어 일곱이 실제로 뽑혔나」를 못 쟀다. 레어가 12건 떴다는 것과 그
 *   일곱 중 무엇이 떴는지는 다른 물음이다.
 *
 * 이 검사가 보는 것 넷 — `militaryLifeCounters.test` 와 같은 틀이다:
 *   ① 늘리는 자리가 `isMeasureMode()` 가드 뒤에 있다 — **실제 플레이가 안 바뀐다**
 *   ② 네 레인이 전부 지나는 한 자리(`tryEmit`)에 달렸다 — 등급 줄기에만 달면
 *      통지·필수가 빠지고, 판에서는 그게 「안 떴다」로 보인다
 *   ③ 헤드리스 프로브(`perfEntry.ts`)가 **같은 객체**를 읽는다 — 사본을 만들면
 *      판 JSON 은 늘 비었는데 아무도 모른다
 *   ④ 쪼개는 규칙이 한 곳이다 — 등급별 표를 워커가 다시 만들면 정본이 둘이다
 *
 * ⚠ **워커(`probe-a-simrun-worker.cjs`)는 아직 안 부른다.** D 가 잇는다 —
 *   부를 이름과 반환 꼴은 `docs/PLAN_103_2026-09-27.md` Ⅳ 폴백 줄에 적었다.
 *   그래서 여기서 워커를 보지 않는다(안 잰 것을 초록으로 적지 않는다).
 *
 * 검사에 정규식을 쓰지 않는다 — 문자열 비교만.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const ENGINE_SRC = readFileSync(resolve(__dirname, "../eventEngine.ts"), "utf8");
const PERF_SRC = readFileSync(resolve(ROOT, "scripts/perf/perfEntry.ts"), "utf8");

const MEASURE = globalThis as { __PB_MEASURE__?: boolean };

afterEach(() => {
  resetEventIdCounters();
  delete MEASURE.__PB_MEASURE__;
});

// ── 엔진을 실제로 한 주 돌린다 (배선을 글자로만 안 본다) ────────
const TIER_RULES: TierRules = parseTierRules(RAW_TIER_RULES);

const MSG: MessageTemplate = {
  id: "MSG_T",
  category: "system",
  subject: "제목",
  body: "본문",
} as MessageTemplate;

const RULE: EventRule = {
  id: "EVT_MEASURE_PROBE",
  title: "검사",
  type: "mandatory",
  category: "career",
  priority: 100,
  oncePolicy: "repeatable",
  conditions: [],
  messageTemplateId: "MSG_T",
  decisionTemplateId: null,
} as unknown as EventRule;

const CTX: EventContext = {
  protagonist: {
    id: "PLY_HERO",
    careerStage: "highschool",
    leagueId: "LEAGUE_HIGHSCHOOL",
    teamId: "TEAM_HS_A",
    playerType: "pitcher",
    grade: 1,
    pitching: { ovr: 50 },
    batting: { ovr: 30 },
  } as unknown as ProtagonistSave,
  currentWeek: 10,
  seasonPhase: "season",
  standings: [],
  stats: {},
  triggeredEvents: {},
} as EventContext;

/** 한 주 돌린다 — 무대는 「고교」 */
const runOneWeek = () =>
  runEventEngine(
    [RULE],
    [],
    new Map([["MSG_T", MSG]]),
    new Map(),
    CTX,
    2026,
    0,
    new Array(12).fill(0.5),
    TIER_RULES,
    "고교",
  );

describe("뜬 이벤트 id 계수기 — 실제 플레이 불변", () => {
  it("🔴 계측 모드 밖에서는 내내 비어 있다", () => {
    // vitest 는 `__PB_MEASURE__` 를 안 심는다 — 그게 실제 플레이와 같은 조건이다
    expect((globalThis as Record<string, unknown>).__PB_MEASURE__).toBeUndefined();
    expect(Object.keys(eventIdCounters.뽑힘)).toHaveLength(0);
  });

  it("초기화가 객체를 비운다 — 회차 사이에 안 섞인다", () => {
    eventIdCounters.뽑힘["고교/레어/EVT_X"] = 3;
    resetEventIdCounters();
    expect(Object.keys(eventIdCounters.뽑힘)).toHaveLength(0);
  });

  /**
   * 🔴 **배선을 뺀 대조군** — 글자 검사만 두면 「가드가 늘 거짓이라 아무 일도
   *   안 일어나는」 배선도 초록이다. 엔진을 실제로 한 주 돌려 **켰을 때만**
   *   차오르는지 본다.
   */
  it("🔴 엔진을 한 주 돌린다 — 계측 모드에서만 차오른다", () => {
    // ① 꺼진 채 — 소식은 나가는데 계수기는 안 는다(실제 플레이가 안 바뀐다)
    const off = runOneWeek();
    expect(off.newMessages.length, "이벤트가 아예 안 떴다 — 하네스가 틀렸다").toBeGreaterThan(0);
    expect(Object.keys(eventIdCounters.뽑힘)).toHaveLength(0);

    // ② 켠 채 — 무대·등급·id 가 키에 그대로 들어간다
    MEASURE.__PB_MEASURE__ = true;
    runOneWeek();
    const keys = Object.keys(eventIdCounters.뽑힘);
    expect(keys).toHaveLength(1);
    // 필수(mandatory)는 등급 밖이라 `무등급` 으로 적힌다 — 등급 줄기에만
    // 훅을 달았으면 이 줄이 빨강이다
    expect(keys[0]).toBe("고교/무등급/EVT_MEASURE_PROBE");
    expect(eventIdCounters.뽑힘[keys[0]]).toBe(1);

    // ③ 두 번 뜨면 두 번 센다
    runOneWeek();
    expect(eventIdCounters.뽑힘[keys[0]]).toBe(2);
  });
});

describe("뜬 이벤트 id 계수기 — 배선", () => {
  it("① 늘리는 자리가 isMeasureMode() 가드 뒤에 있다", () => {
    expect(ENGINE_SRC).toContain("if (isMeasureMode()) {");
    expect(ENGINE_SRC).toContain(
      "eventIdCounters.뽑힘[key] = (eventIdCounters.뽑힘[key] ?? 0) + 1;",
    );
    expect(ENGINE_SRC).toContain('import { isMeasureMode } from "./measureMode";');
  });

  it("🔴 대조군 — 가드 없이 늘어나는 자리가 새로 생기면 잡는다", () => {
    // ⚠ 위 검사는 문자열이 「어딘가에 있다」만 본다. 늘어나는 문장을 전수로
    //   훑어 **전부 가드 안**에 있는지 본다. 정규식을 안 쓰므로 줄 단위로.
    const lines = ENGINE_SRC.split("\n");
    const bumps: number[] = [];
    lines.forEach((l, i) => {
      if (l.includes("eventIdCounters.뽑힘[") && l.includes("+ 1")) bumps.push(i);
    });
    expect(bumps.length, "늘리는 자리가 없다 — 훅이 빠졌다").toBeGreaterThan(0);
    for (const i of bumps) {
      // 바로 위 다섯 줄 안에 가드가 있어야 한다
      const near = lines.slice(Math.max(0, i - 5), i).join("\n");
      expect(near, `가드 밖에서 늘어난다: ${lines[i].trim()}`).toContain("isMeasureMode()");
    }
  });

  it("② 네 레인이 전부 지나는 한 자리에 달렸다 — 등급 줄기에만 달지 않는다", () => {
    const hook = ENGINE_SRC.indexOf("eventIdCounters.뽑힘[key]");
    const emit = ENGINE_SRC.indexOf("function tryEmit(rule: EventRule, lane: Lane): boolean {");
    const gradeBranch = ENGINE_SRC.indexOf('if (tryEmit(picked, "grade")) {');
    expect(emit).toBeGreaterThan(0);
    expect(hook).toBeGreaterThan(emit);
    // 등급 줄기의 호출부보다 **앞**이면 `tryEmit` 안이다
    expect(hook).toBeLessThan(gradeBranch);
    // 무대와 등급이 키에 같이 들어간다 — 하나라도 빠지면 판에서 못 가른다
    expect(ENGINE_SRC).toContain("const key = `${stageGroup}/${g}/${rule.id}`;");
  });

  it("③ 헤드리스 프로브가 같은 객체를 읽는다 — 사본을 따로 만들지 않는다", () => {
    expect(PERF_SRC).toContain("eventIdCounters,");
    expect(PERF_SRC).toContain("resetEventIdCounters,");
    expect(PERF_SRC).toContain("export function eventIdCounts(): Record<string, number> {");
    expect(PERF_SRC).toContain("return { ...eventIdCounters.뽑힘 };");
    expect(PERF_SRC).toContain("export function resetEventIdCounts(): void {");
  });

  it("④ 등급별로 쪼개는 규칙이 한 곳이다 — 워커가 다시 만들지 않게", () => {
    expect(PERF_SRC).toContain(
      "export function eventIdRow(delta: Record<string, number>): Record<string, string[]> {",
    );
  });

  it("계수기가 판 JSON 에 실릴 이름이 계획 문서에 적혀 있다 — D 가 이어받는다", () => {
    const plan = readFileSync(resolve(ROOT, "docs/PLAN_103_2026-09-27.md"), "utf8");
    expect(plan).toContain("app.eventIdCounts()");
    expect(plan).toContain("app.resetEventIdCounts()");
    expect(plan).toContain("app.eventIdRow(");
  });
});
