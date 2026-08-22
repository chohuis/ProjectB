import type { EventRule, EventPool, MessageTemplate, DecisionTemplate, EventContext } from "../types/event";
import { pickSentence, bodyBankOf, type SentenceMemory } from "./sentenceBank";
import type { MessageCategory, MessageItem } from "../types/main";
import { evaluateConditions } from "./conditionEvaluator";

// 이벤트 내부 카테고리 → UI 표시 카테고리 매핑
// JSON 템플릿의 category 필드는 내부 분류용이며 여기서 표시용으로 변환된다
const EVENT_DISPLAY_CATEGORY: Record<string, MessageCategory> = {
  media:       "news",
  social:      "news",
  training:    "coach",
  hs_training: "coach",
  health:      "coach",
  mental:      "coach",
};

// ── oncePolicy 통과 여부 ───────────────────────────────────────
function checkOncePolicy(
  rule: EventRule,
  ctx: EventContext,
  seasonYear: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  careerStageYear: number,
): boolean {
  switch (rule.oncePolicy) {
    case "repeatable": {
      const lastWeek = ctx.triggeredEvents[rule.id];
      if (lastWeek === undefined) return true;
      if (rule.cooldownWeeks !== undefined) {
        return ctx.currentWeek - lastWeek >= rule.cooldownWeeks;
      }
      return true;
    }

    case "once_per_season":
      // triggeredEvents는 startNewSeason()에서 초기화됨 → 이미 기록 있으면 이번 시즌 차단
      return ctx.triggeredEvents[rule.id] === undefined;

    case "once_per_stage_year":
      // 🔴 **첫 스테이지-연도에서만 동작했다.** 예전엔
      // `careerStageYear !== Math.floor(lastWeek / 52)`로 판정했는데,
      // `lastWeek`는 `ctx.currentWeek`이고 **주차는 시즌마다 1로 리셋된다** —
      // 1~51주는 `Math.floor(lastWeek/52)`가 항상 0이다. 그래서
      // 고교 1학년(careerStageYear 0)은 `0 !== 0`으로 막혔지만
      // 2·3학년(1·2)은 `1 !== 0`으로 **매주 통과**했다. 대학 2~4학년도 같다.
      //
      // 실측: 연 1회여야 할 `EVT_HS_Y2_COACH_TRAIN`이 6시즌 14번 떴고,
      // 그만큼 주당 1칸을 먹어 다른 2학년 이야기를 밀어냈다.
      //
      // `triggeredEvents`는 `startNewSeason()`이 `makeEmptySeason`으로
      // 통째로 갈아서 **시즌마다 비워진다**(`season.ts:487`). 스테이지-연도는
      // 시즌마다 오르므로 "시즌에 한 번"이 곧 "스테이지-연도에 한 번"이다.
      // `once_per_season`과 판정이 같아지는 건 그래서다 — 이름은 데이터
      // 쪽 표기라 남긴다.
      return ctx.triggeredEvents[rule.id] === undefined;

    case "once_per_career":
      // careerTriggeredEvents는 시즌을 넘어 유지됨 → 한 번이라도 기록 있으면 영구 차단
      return (ctx.protagonist.careerTriggeredEvents ?? {})[rule.id] === undefined;
  }
}

// ── 이벤트 → MessageItem 변환 ────────────────────────────────
function ruleToOutput(
  rule: EventRule,
  msgTmpl: MessageTemplate | undefined,
  decTmpl: DecisionTemplate | undefined,
  week: number,
  /** 문장 뱅크 선택용. 뱅크가 없는 템플릿이면 안 쓴다 */
  bank?: {
    memory: SentenceMemory;
    picked: SentenceMemory;
    rand: () => number;
  },
): { message: MessageItem } {
  // 문장 뱅크 — 직전에 쓴 문장을 빼고 뽑는다 (Phase 7-6, DESIGN §7.3).
  // 뱅크가 없으면 예전처럼 `body` 한 줄이다
  let title = msgTmpl?.subject ?? rule.title;
  let body  = msgTmpl?.body   ?? "";

  if (bank && msgTmpl) {
    const bodyBank = bodyBankOf(msgTmpl);
    if (bodyBank.length > 1) {
      const key = `${msgTmpl.id}#body`;
      const got = pickSentence(bodyBank, bank.rand(), bank.memory[key] ?? -1);
      if (got) { body = got.text; bank.picked[key] = got.index; }
    }
    const subjBank = msgTmpl.subjects ?? [];
    if (subjBank.length > 1) {
      const key = `${msgTmpl.id}#subject`;
      const got = pickSentence(subjBank, bank.rand(), bank.memory[key] ?? -1);
      if (got) { title = got.text; bank.picked[key] = got.index; }
    }
  }

  const message: MessageItem = {
    id:        `evt-${rule.id}-w${week}-${Date.now()}`,
    category:  EVENT_DISPLAY_CATEGORY[msgTmpl?.category ?? ""] ?? "system",
    sender:    "이벤트 시스템",
    subject:   title,
    preview:   body.slice(0, 60),
    body,
    createdAt: `W${week}`,
    readAt:    null,
    decision: decTmpl ? {
      prompt: decTmpl.prompt ?? title,
      options: decTmpl.options.map((o) => ({
        id:         o.id,
        label:      o.label,
        effectHint: o.effectHint ?? "",
        effects:    o.effects,
      })),
      selectedOptionId: null,
    } : undefined,
  };
  return { message };
}

/**
 * **깔때기 계측** — 소식함에 닿기 전에 몇 건이 걸러지는가.
 *
 * `mailboxTrimStats`(game.ts)는 **생산된 뒤** 상한에 밀려난 것을 센다. 그 앞
 * 단계, 즉 "조건은 통과했는데 엔진이 안 내보낸 것"은 아무도 안 세고 있었다.
 * 둘을 못 가르면 "이벤트가 안 뜬다"가 **안 뽑힌 건지 밀려난 건지** 알 수 없다 —
 * 육성선수·메일함에서 이미 두 번 밟은 함정이다.
 *
 * 특히 conditional은 조건을 통과해도 **주당 1건만** 나간다(정의 260건). 나머지가
 * `crowdedOut`이다 — 정책으로 막힌 것(`policyBlocked`)과 성격이 다르다.
 */
export const eventFunnelStats = {
  weeks: 0,
  /** 엔진이 쓴 시간 누계(ms) — 구조 판단용 */
  elapsedMs: 0,
  mandatory:   { condPass: 0, policyBlocked: 0, emptyDropped: 0, emitted: 0 },
  conditional: { condPass: 0, policyBlocked: 0, emptyDropped: 0, emitted: 0, crowdedOut: 0,
                 freshPicked: 0, repeatPicked: 0 },
  // policyBlocked는 random에선 0이어야 한다 — 후보를 고르기 전에 이미 걸러서 넘긴다.
  // 그래도 갈래마다 모양을 맞춰 둔다: 0이 아니면 두 곳의 판정이 어긋났다는 신호다
  random:      { poolRolls: 0, poolPassed: 0, eligible: 0, policyBlocked: 0, emptyDropped: 0, emitted: 0 },
  /** 자리를 못 잡아 밀린 규칙 — 어떤 이야기가 못 뜨는지 */
  crowdedByRule: {} as Record<string, number>,
  /** 본문도 선택지도 없어 버려진 규칙 */
  emptyByRule:   {} as Record<string, number>,
  /**
   * 실제로 뜬 규칙 — **종수**가 핵심이다. 정의는 537건인데 커리어 내내 몇 종이
   * 화면에 닿는가. 발동 "건수"만 보면 같은 이야기를 반복해 뽑아도 커 보인다
   */
  emittedByRule: {} as Record<string, number>,
};

export function resetEventFunnelStats(): void {
  eventFunnelStats.weeks = 0;
  eventFunnelStats.elapsedMs = 0;
  eventFunnelStats.mandatory   = { condPass: 0, policyBlocked: 0, emptyDropped: 0, emitted: 0 };
  eventFunnelStats.conditional = { condPass: 0, policyBlocked: 0, emptyDropped: 0, emitted: 0, crowdedOut: 0,
                 freshPicked: 0, repeatPicked: 0 };
  eventFunnelStats.random      = { poolRolls: 0, poolPassed: 0, eligible: 0, policyBlocked: 0, emptyDropped: 0, emitted: 0 };
  eventFunnelStats.crowdedByRule = {};
  eventFunnelStats.emptyByRule   = {};
  eventFunnelStats.emittedByRule = {};
}

// ── 가중치 기반 랜덤 선택 ─────────────────────────────────────
function weightedPick<T extends { weight?: number }>(items: T[], rand01: number): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((s, x) => s + (x.weight ?? 1), 0);
  let rand = rand01 * total;
  for (const item of items) {
    rand -= item.weight ?? 1;
    if (rand <= 0) return item;
  }
  return items[items.length - 1];
}

// ── 이벤트 엔진 메인 ──────────────────────────────────────────
export interface EventEngineResult {
  newMessages: MessageItem[];
  updatedTriggers: Record<string, number>;        // 시즌 트리거 (startNewSeason으로 초기화)
  careerUpdatedTriggers: Record<string, number>;  // 커리어 트리거 (once_per_career 전용, 영구 유지)
  /**
   * 이번 주에 뽑은 문장 인덱스 (Phase 7-6). 다음 주에 "직전 것 제외"의 입력이
   * 되므로 **세이브에 남아야 한다** — 안 남기면 로드할 때마다 같은 문장이 나온다
   */
  sentencePicks: SentenceMemory;
}

export function runEventEngine(
  rules: EventRule[],
  pools: EventPool[],
  msgTmplMap: Map<string, MessageTemplate>,
  decTmplMap: Map<string, DecisionTemplate>,
  ctx: EventContext,
  seasonYear: number,
  careerStageYear: number,
  randoms: number[],
): EventEngineResult {
  const _t0 = performance.now();
  const newMessages: MessageItem[] = [];
  const updatedTriggers: Record<string, number> = {};
  const careerUpdatedTriggers: Record<string, number> = {};
  const week = ctx.currentWeek;
  let ri = 0;
  // 난수는 Rust가 뽑아 넘긴 것을 쓴다 (TS 게임 로직에서 Math.random 금지).
  // 다 쓰면 0.5로 떨어진다 — 예전엔 Math.random()으로 새어나갔다
  const nextRand = () => randoms[ri++] ?? 0.5;

  // 문장 뱅크 메모리. 이번 주에 뽑은 것만 `picked`에 모아 결과로 돌려준다
  const bank = {
    memory: ctx.sentenceMemory ?? {},
    picked: {} as SentenceMemory,
    rand: nextRand,
  };

  type Lane = "mandatory" | "conditional" | "random";
  function tryEmit(rule: EventRule, lane: Lane) {
    if (!checkOncePolicy(rule, ctx, seasonYear, careerStageYear)) {
      eventFunnelStats[lane].policyBlocked++;
      return;
    }
    const msgTmpl = rule.messageTemplateId ? msgTmplMap.get(rule.messageTemplateId) : undefined;
    const decTmpl = rule.decisionTemplateId ? decTmplMap.get(rule.decisionTemplateId) : undefined;
    const { message } = ruleToOutput(rule, msgTmpl, decTmpl, week, bank);

    // 본문도 선택지도 없는 이벤트는 **메시지함에 빈 칸으로 보인다.**
    // `EVT_TRADE_RUMOR`·`EVT_TRADE_CONFIRMED`가 실제로 그랬다 — 그 둘은
    // 트레이드 코드가 pendingAction으로 직접 띄우는 이벤트인데
    // `conditional.json`에도 등록돼 있어 엔진이 무작위로 또 발동시켰고,
    // 템플릿(`messageTemplateId`)이 없어 빈 메시지가 됐다.
    //
    // 트리거는 그대로 소비한다 — 조건·쿨다운 판정을 바꾸면 그게 밸런스 변경이다.
    if (!message.body?.trim() && !message.decision) {
      eventFunnelStats[lane].emptyDropped++;
      eventFunnelStats.emptyByRule[rule.id] = (eventFunnelStats.emptyByRule[rule.id] ?? 0) + 1;
      updatedTriggers[rule.id] = week;
      if (rule.oncePolicy === "once_per_career") careerUpdatedTriggers[rule.id] = week;
      return;
    }

    eventFunnelStats[lane].emitted++;
    eventFunnelStats.emittedByRule[rule.id] = (eventFunnelStats.emittedByRule[rule.id] ?? 0) + 1;
    newMessages.push(message);
    updatedTriggers[rule.id] = week;
    if (rule.oncePolicy === "once_per_career") {
      careerUpdatedTriggers[rule.id] = week;
    }
  }

  // ── 1. mandatory 이벤트 ───────────────────────────────────────
  const mandatory = rules
    .filter((r) => r.type === "mandatory")
    .filter((r) => evaluateConditions(r.conditions ?? [], ctx))
    .sort((a, b) => b.priority - a.priority);

  eventFunnelStats.weeks++;
  eventFunnelStats.mandatory.condPass += mandatory.length;
  for (const rule of mandatory) {
    tryEmit(rule, "mandatory");
  }

  // ── 2. conditional 이벤트 (조건 통과, priority 내림차순, 1개만) ─
  const conditional = rules
    .filter((r) => r.type === "conditional")
    .filter((r) => evaluateConditions(r.conditions ?? [], ctx))
    .sort((a, b) => b.priority - a.priority);

  eventFunnelStats.conditional.condPass += conditional.length;

  if (conditional.length > 0) {
    // `conditional`은 이미 priority 내림차순이다 — 아래 두 고르기가 그 순서를 탄다
    const eligible = conditional.filter((r) =>
      checkOncePolicy(r, ctx, seasonYear, careerStageYear)
    );

    // ── 두 띠로 고른다 (2026-08-22) ─────────────────────────────
    // 예전엔 그냥 priority 최대 하나였다. 그러면 **높고 반복되는 것이 영원히
    // 이긴다** — 실측에서 `repeatable` 89건이 priority 700 이상에 몰려 있고
    // `once_per_*` 60건이 100 미만이라 6시즌 내내 한 번도 못 떴다.
    // `EVT_COND_PEAK_FORM` 하나가 전체 발동의 16%(82건)를 먹었다.
    //
    // 그래서 **"이번 시즌 아직 안 뜬 것"을 먼저 준다.** 한 바퀴 다 돌기 전에는
    // 아무도 두 번 못 뜬다는 뜻이고, 띠 안에서는 예전처럼 priority가 정한다.
    //
    // ⚠ **총량은 안 바뀐다 — 여전히 주당 1건이다.** 배분만 바꾼다. 상한을
    //   올리는 건 별개 결정이고(밸런스), 그건 아직 동결이다.
    //
    // ⚠ 상태 경고(피로·부진)는 시즌 초엔 아직 안 뜬 상태라 **첫 번은 그대로
    //   즉시 뜬다.** 두 번째부터가 새 이야기 뒤로 밀린다 — 억제가 아니라
    //   지연이고, `repeatPicked`로 얼마나 밀리는지 잰다.
    const fresh  = eligible.find((r) => ctx.triggeredEvents[r.id] === undefined);
    const picked = fresh ?? eligible[0];

    if (picked) {
      if (fresh) eventFunnelStats.conditional.freshPicked++;
      else       eventFunnelStats.conditional.repeatPicked++;
      tryEmit(picked, "conditional");
    }

    // 뽑히지 못한 나머지 — 조건도 정책도 통과했는데 자리가 없어 밀린 것
    for (const r of eligible) {
      if (r === picked) continue;
      eventFunnelStats.conditional.crowdedOut++;
      eventFunnelStats.crowdedByRule[r.id] = (eventFunnelStats.crowdedByRule[r.id] ?? 0) + 1;
    }
  }

  // ── 3. random 이벤트 (풀 단위 확률 롤) ───────────────────────
  const poolRuleMap = new Map<string, EventRule[]>();
  for (const rule of rules.filter((r) => r.type === "random" && r.poolId)) {
    const poolId = rule.poolId!;
    if (!poolRuleMap.has(poolId)) poolRuleMap.set(poolId, []);
    poolRuleMap.get(poolId)!.push(rule);
  }

  for (const pool of pools) {
    eventFunnelStats.random.poolRolls++;
    if (nextRand() * 100 > pool.baseRoll.value) continue;
    eventFunnelStats.random.poolPassed++;

    const poolRules = poolRuleMap.get(pool.id) ?? [];

    for (let i = 0; i < pool.maxPicksPerWeek; i++) {
      const eligible = poolRules.filter((r) =>
        evaluateConditions(r.conditions ?? [], ctx) &&
        checkOncePolicy(r, ctx, seasonYear, careerStageYear) &&
        !updatedTriggers[r.id]
      );
      eventFunnelStats.random.eligible += eligible.length;
      const picked = weightedPick(eligible, nextRand());
      if (!picked) break;
      tryEmit(picked, "random");
    }
  }

  eventFunnelStats.elapsedMs += performance.now() - _t0;
  return { newMessages, updatedTriggers, careerUpdatedTriggers, sentencePicks: bank.picked };
}
