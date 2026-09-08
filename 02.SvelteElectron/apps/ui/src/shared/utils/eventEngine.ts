import type { EventRule, EventPool, MessageTemplate, DecisionTemplate, EventContext, EventTier } from "../types/event";
import { pickSentence, bodyBankOf, type SentenceMemory } from "./sentenceBank";
import type { DecisionEffect, MessageCategory, MessageItem } from "../types/main";
import { evaluateConditions } from "./conditionEvaluator";
import { resolveNumber } from "./eventPaths";
import { GRADES, gradeBelow, type EventGrade, type TierRules } from "./tierRules";

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
  /** 소식 id 에 들어간다 — 같은 규칙이 다음 시즌 같은 주에 또 뜰 수 있다 */
  seasonYear: number,
  /** 선택지 조건을 재는 데 쓴다 — 조건 없는 선택지만 있으면 안 봐도 된다 */
  ctx: EventContext,
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

  // ── 선택지 조건 (2026-08-23) ─────────────────────────────────
  // 조건 없는 선택지는 항상 열려 있다. 조건이 붙은 것만 지금 상태로 잰다.
  //
  // 🔴 **다 닫히면 선택지를 통째로 뗀다.** `trimMailbox`가 미결 선택지를
  // 상한 위로 보존하므로, 0개짜리 선택지가 생기면 화면에 버튼이 하나도 없는
  // **영원히 못 지우는 메시지**가 된다. 그때는 소식만 남긴다.
  const allOptions = decTmpl?.options ?? [];
  const openOptions = allOptions.filter(
    (o) => !o.conditions || evaluateConditions(o.conditions, ctx),
  );
  if (decTmpl) {
    eventFunnelStats.optionsOffered += allOptions.length;
    eventFunnelStats.optionsOpen    += openOptions.length;
    if (allOptions.length > 0 && openOptions.length === 0) {
      eventFunnelStats.decisionsClosedOut++;
      eventFunnelStats.closedOutByRule[rule.id] = (eventFunnelStats.closedOutByRule[rule.id] ?? 0) + 1;
    }
  }

  const message: MessageItem = {
    // 🔴 **연도+주차+규칙**이다. 한 규칙은 한 주에 한 번만 발동한다
    //   (`oncePolicy`) — 그래도 두 번 나면 `check:msgdupid` 가 잡는다.
    //   `Date.now()` 를 쓰던 시절엔 그 사본이 보이지 않았다
    id:        `evt-${rule.id}-${seasonYear}-w${week}`,
    category:  EVENT_DISPLAY_CATEGORY[msgTmpl?.category ?? ""] ?? "system",
    sender:    "이벤트 시스템",
    subject:   title,
    preview:   body.slice(0, 60),
    body,
    createdAt: `W${week}`,
    readAt:    null,
    // 등급 칩(§9)의 근거 — **여기서 싣는다.** 화면이 나중에 규칙 id 로 되짚으면
    // 옛 소식이 지금 데이터의 등급으로 보인다(소식은 스냅샷이다)
    ...(gradeOf(rule) ? { eventGrade: gradeOf(rule)! } : {}),
    // 결·대가도 같은 이유로 여기서 싱는다(C 4-5). 위기 표시(§9)와 「대가가
    // 따른다」 한 줄의 입력이고, **효과를 내는 것은 `costs` 배열 하나만**이다
    ...(rule.theme ? { eventTheme: rule.theme } : {}),
    ...(rule.cost  ? { eventCost:  rule.cost  } : {}),
    decision: openOptions.length > 0 ? {
      prompt: decTmpl!.prompt ?? title,
      options: openOptions.map((o) => ({
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
                 freshPicked: 0, repeatPicked: 0, scarcePicked: 0, urgentPicked: 0 },
  // policyBlocked는 random에선 0이어야 한다 — 후보를 고르기 전에 이미 걸러서 넘긴다.
  // 그래도 갈래마다 모양을 맞춰 둔다: 0이 아니면 두 곳의 판정이 어긋났다는 신호다
  //
  // 🔴 **`random` 갈래는 더 이상 안 돈다** (2026-09-08). 랜덤 풀 다섯이 노말
  //    등급으로 흡수됐다(§1) — 전부 `grade` 갈래로 간다. 칸은 남겨 둔다:
  //    0이 아니면 어딘가 옛 경로가 살아 있다는 뜻이라 그 자체가 신호다.
  random:      { poolRolls: 0, poolPassed: 0, eligible: 0, policyBlocked: 0, emptyDropped: 0, emitted: 0 },
  /** 등급 줄기 — 한 주에 하나. `urgent`·필수·시스템은 여기 안 든다 */
  grade:       { condPass: 0, policyBlocked: 0, emptyDropped: 0, emitted: 0, crowdedOut: 0 },
  /**
   * 등급 추첨 계측 (§10 `check:tiercoverage` 의 입력).
   *
   * 🔴 **`fallback` 이 0 이 아니면 데이터가 모자란다는 뜻이다.** 어느 무대의
   *   어느 등급이 비었는지가 `fallbackBy`(「무대/등급」)에 남는다 — 총합만
   *   보면 「몇 번 났나」는 알아도 「무엇을 써야 하나」는 못 답한다.
   */
  tier: {
    /** 추첨으로 뽑힌 등급 */
    drawn:      {} as Record<string, number>,
    /** 실제로 발동한 등급 */
    emitted:    {} as Record<string, number>,
    /** 시즌 상한에 닿아 가중 0 이 된 횟수 */
    capBlocked: {} as Record<string, number>,
    /** 추첨은 됐는데 후보가 0 이던 횟수 */
    empty:      {} as Record<string, number>,
    /** 폴백 발동 총수 */
    fallback: 0,
    /** 「무대/등급」 → 그 자리에서 폴백이 난 횟수 */
    fallbackBy: {} as Record<string, number>,
    /** 무대별 주 수 — 빈도를 나눌 분모다 */
    weeksByStage: {} as Record<string, number>,
    /** 「무대/등급」 → 발동 수 */
    emittedByStage: {} as Record<string, number>,
    /**
     * 🔴 **둘 다 늘 0 이어야 한다** (§10). 코드가 「막는다」고 적어 놓은 것을
     *   실제로 재는 자리다 — 적어 놓기만 하고 안 재면 그게 바로 이 저장소가
     *   반복해 겪은 형태다.
     *
     * `capViolation` 은 **폴백이 상한에 닿은 등급으로 내려간 경우**를 잡는다.
     * 처음엔 실제로 그 구멍이 있었다: 추첨은 상한을 봤는데 폴백은 안 봤다.
     */
    capViolation: 0,
    /** 히든 종당 커리어 상한을 넘겨 발동한 수 */
    hiddenCareerViolation: 0,
  },
  /** 자리를 못 잡아 밀린 규칙 — 어떤 이야기가 못 뜨는지 */
  /**
   * **후보에 올랐다** — 조건도 정책도 통과해 뽑기 대상이 된 횟수.
   *
   * 🔴 이게 없으면 "안 뜬 규칙"을 두 부류로 못 가른다:
   *   후보엔 올랐는데 안 뽑힘  →  다시 돌리면 다른 게 안 뜬다. **정상이다**
   *   후보에 아예 못 오름      →  몇 번을 돌려도 영원히 안 뜬다. **결함이다**
   *
   * 예전엔 랜덤 갈래가 `random.eligible` 총합만 셌다. 총합으로는 어느
   * 규칙이 한 번도 후보가 못 됐는지 알 수 없다. (2026-08-25)
   */
  candidateByRule: {} as Record<string, number>,
  crowdedByRule: {} as Record<string, number>,
  /** 선택지가 제시된 총수 / 그중 조건을 통과해 열린 수 */
  optionsOffered: 0,
  optionsOpen: 0,
  /** 조건 때문에 선택지가 **전부** 닫혀 소식만 나간 횟수 */
  decisionsClosedOut: 0,
  closedOutByRule: {} as Record<string, number>,
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
                 freshPicked: 0, repeatPicked: 0, scarcePicked: 0, urgentPicked: 0 };
  eventFunnelStats.random      = { poolRolls: 0, poolPassed: 0, eligible: 0, policyBlocked: 0, emptyDropped: 0, emitted: 0 };
  eventFunnelStats.grade       = { condPass: 0, policyBlocked: 0, emptyDropped: 0, emitted: 0, crowdedOut: 0 };
  eventFunnelStats.tier        = {
    drawn: {}, emitted: {}, capBlocked: {}, empty: {},
    fallback: 0, fallbackBy: {}, weeksByStage: {}, emittedByStage: {},
    capViolation: 0, hiddenCareerViolation: 0,
  };
  eventFunnelStats.optionsOffered = 0;
  eventFunnelStats.optionsOpen = 0;
  eventFunnelStats.decisionsClosedOut = 0;
  eventFunnelStats.closedOutByRule = {};
  eventFunnelStats.candidateByRule = {};
  eventFunnelStats.crowdedByRule = {};
  eventFunnelStats.emptyByRule   = {};
  eventFunnelStats.emittedByRule = {};
}

/**
 * 규칙의 **중요도 등급** — 지금은 `urgent` 하나만 뜻이 있다.
 *
 * 🔴 **`oncePolicy` 추론을 지웠다** (2026-09-08). 「발동 정책 = 중요도」는 틀린
 *   전제였고(그 주석이 스스로 임시방편이라 적어 뒀다), B 4-2 가 606종에 등급을
 *   달아 갈아타기가 끝났다. 지금 추론을 남겨 두면 **등급을 빠뜨린 새 이벤트가
 *   조용히 `important` 가 되어** 등급 줄기 밖에서 돈다 — 그게 이 저장소가
 *   반복해 겪은 「아무 일도 안 일어남」의 형태다.
 *
 * 등급을 안 적은 규칙은 `null` 이고, 등급 줄기도 `urgent` 줄기도 안 탄다.
 */
export function tierOf(rule: EventRule): EventTier | null {
  return rule.tier === "urgent" ? "urgent" : null;
}

/** 등급 넷 중 하나면 그것, 아니면 `null`(`urgent`·미기재) */
export function gradeOf(rule: EventRule): EventGrade | null {
  return GRADES.includes(rule.tier as EventGrade) ? (rule.tier as EventGrade) : null;
}

/**
 * 이벤트 엔진이 한 주에 쓰는 난수 개수.
 *
 * 🔴 **풀 수로 세던 걸 상수로 바꿨다** (2026-09-08). 예전엔
 * `pools.length + Σ maxPicksPerWeek` 였는데 풀이 자리를 안 배분하므로 뜻이 없다.
 * 지금 쓰는 곳은 등급 추첨 1 + 등급 안 뽑기 최대 4(폴백 셋까지) + 문장 뱅크다.
 *
 * ⚠ **넉넉해야 한다.** 모자라면 `nextRand()` 가 0.5로 떨어져 **같은 것만 뽑힌다** —
 *   오류도 로그도 없이 다양성만 사라지는 부류다. 주간 리포트 은행이 꼬리에서
 *   6칸을 떼어 가므로(`advanceWeek` REPORT_RANDS) 그만큼 여유를 둔다.
 */
export const EVENT_LANE_RANDS = 12;

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

  // ── 등급 줄기가 남기는 것 (2026-09-08 · §1·§3) ─────────────────

  /** 이번 주에 실제로 발동한 등급. 없으면 `null` — 시즌 상한을 이걸로 센다 */
  gradeFired: EventGrade | null;
  /**
   * 폴백이 났으면 **처음 뽑힌 등급**. `gradeFired` 와 다르면 내려온 것이다.
   * 🔴 한 번이라도 나면 `check:tiercoverage` 가 빨강이다(데이터 부족 신호).
   */
  fallbackFrom: EventGrade | null;
  /**
   * 규칙별 밀린 주 수 갱신. **뽑힌 규칙은 0** 으로 온다 —
   * 안 되돌리면 한 번 뜬 이야기가 계속 큰 가중을 들고 다닌다.
   */
  starveUpdates: Record<string, number>;
  /**
   * 이벤트에 붙은 **대가**(§4 `cost`). 어느 갈래를 골라도 내므로 발동 즉시 낸다.
   * ⚠ 여기서 적용하지 않는다 — 관계·돈은 비동기라 `advanceWeek` 가 낸다.
   */
  costs: DecisionEffect[];
}

/** 등급별 가중 — 시즌 상한·마른 시즌·상태 보정을 다 먹인 값 */
function gradeWeights(rules: TierRules, ctx: EventContext, week: number): Record<EventGrade, number> {
  const out = { ...rules.weights };
  for (const g of GRADES) {
    const cap = rules.seasonCap[g];
    if (cap !== undefined && (ctx.tierCounts?.[g] ?? 0) >= cap) {
      out[g] = 0;
      eventFunnelStats.tier.capBlocked[g] = (eventFunnelStats.tier.capBlocked[g] ?? 0) + 1;
      continue;
    }
    // 마른 시즌 방지 — 「마지막으로 뜬 주」에서 얼마나 지났나.
    // ⚠ 한 번도 안 떴으면 0 이라 시즌 첫 주부터 센다(그게 「마르다」의 뜻이다)
    const dry = rules.dryBoost[g];
    if (!dry) continue;
    const dryWeeks = Math.max(0, week - (ctx.tierLastWeek?.[g] ?? 0));
    if (dryWeeks > dry.afterWeeks) {
      out[g] += Math.min(dry.max, (dryWeeks - dry.afterWeeks) * dry.perWeek);
    }
  }
  // 상태 보정 — 성실·컨디션이 레어를 민다. **상한에 닿아 0 이 된 등급은 안 민다**
  for (const [metric, m] of Object.entries(rules.stateMod)) {
    if (out[m.tier] <= 0) continue;
    const v = resolveNumber(ctx, metric);
    if (v === undefined || v <= m.from) continue;
    out[m.tier] += Math.min(m.max, (v - m.from) * m.perPoint);
  }
  return out;
}

export function runEventEngine(
  rules: EventRule[],
  /**
   * 🔴 **더 이상 안 읽는다** (2026-09-08 · §1). 랜덤 풀 다섯이 노말 등급으로
   * 흡수돼 풀이 자리를 배분하지 않는다 — 규칙을 묶는 `poolId` 는 규칙 파일에
   * 남아 있고, 그것이 결(`theme`)의 이름표다.
   *
   * ⚠ **인자는 남긴다.** 지우면 호출부 넷과 검사 넷을 같이 고쳐야 하고,
   *   풀이 다시 뜻을 갖는 날(예: 결별 빈도)에 다시 넣게 된다. 안 읽는다는
   *   것을 여기 적어 두는 편이 조용히 사라지는 것보다 낫다.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pools: EventPool[],
  msgTmplMap: Map<string, MessageTemplate>,
  decTmplMap: Map<string, DecisionTemplate>,
  ctx: EventContext,
  seasonYear: number,
  careerStageYear: number,
  randoms: number[],
  /** 등급 추첨 규칙 (§3). 정본은 `events/tier_rules.json` 이고 마스터가 읽어 준다 */
  tierRules: TierRules,
  /** 지금 무대(`stageGroupOf`). 폴백 표를 무대별로 내려고 받는다 */
  stageGroup = "공용",
): EventEngineResult {
  const _t0 = performance.now();
  const newMessages: MessageItem[] = [];
  const updatedTriggers: Record<string, number> = {};
  const careerUpdatedTriggers: Record<string, number> = {};
  const costs: DecisionEffect[] = [];
  const starveUpdates: Record<string, number> = {};
  let gradeFired: EventGrade | null = null;
  let fallbackFrom: EventGrade | null = null;
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

  type Lane = "mandatory" | "conditional" | "random" | "grade";
  /** 실제로 소식이 나갔으면 `true`. 등급 줄기가 「이번 주 등급」을 이걸로 정한다 */
  function tryEmit(rule: EventRule, lane: Lane): boolean {
    if (!checkOncePolicy(rule, ctx, seasonYear, careerStageYear)) {
      eventFunnelStats[lane].policyBlocked++;
      return false;
    }
    const msgTmpl = rule.messageTemplateId ? msgTmplMap.get(rule.messageTemplateId) : undefined;
    const decTmpl = rule.decisionTemplateId ? decTmplMap.get(rule.decisionTemplateId) : undefined;
    const { message } = ruleToOutput(rule, msgTmpl, decTmpl, week, seasonYear, ctx, bank);

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
      return false;
    }

    eventFunnelStats[lane].emitted++;
    eventFunnelStats.emittedByRule[rule.id] = (eventFunnelStats.emittedByRule[rule.id] ?? 0) + 1;
    newMessages.push(message);
    updatedTriggers[rule.id] = week;
    // 🔴 **히든은 종당 커리어 한 번이다** (§3 `hidden.careerCapPerEvent`).
    //   `oncePolicy` 가 뭐라 적혔든 커리어 기록을 남긴다 — 데이터가 실수로
    //   `once_per_season` 을 달아도 히든이 두 번 나면 안 된다.
    if (rule.oncePolicy === "once_per_career" || gradeOf(rule) === "hidden") {
      careerUpdatedTriggers[rule.id] = week;
    }
    // 유니크·히든의 대가 — 어느 갈래를 골라도 낸다(§4). 여기서 적용하지 않고
    // 넘긴다: 관계·돈은 비동기라 `advanceWeek` 가 store 를 지나 낸다
    if (rule.cost) costs.push(rule.cost);
    return true;
  }

  // ── 1. mandatory 이벤트 ───────────────────────────────────────
  const mandatory = rules
    .filter((r) => r.type === "mandatory")
    .filter((r) => evaluateConditions(r.conditions ?? [], ctx))
    .sort((a, b) => b.priority - a.priority);

  eventFunnelStats.weeks++;
  eventFunnelStats.mandatory.condPass += mandatory.length;
  for (const r of mandatory) {
    eventFunnelStats.candidateByRule[r.id] = (eventFunnelStats.candidateByRule[r.id] ?? 0) + 1;
  }
  for (const rule of mandatory) {
    tryEmit(rule, "mandatory");
  }

  // ── 2. urgent — 등급 줄기 **밖**이다 (2026-08-23) ──────────────
  //
  // 🔴 다쳤는데 다음 주에 알려주면 안 된다. 주당 한 칸 상한을 안 탄다.
  //    긴급·주차 고정 필수(mandatory)·시스템 소식 셋이 등급 밖이고(§1),
  //    나머지 전부가 아래 등급 줄기 하나로 모인다.
  {
    const urgent = rules
      // ⚠ **필수는 위에서 이미 나갔다.** 필수에 `urgent` 를 달면 두 번 뜨는데,
      //   지금 데이터엔 없다(필수 101종 전부 등급이 없다) — 없다고 안 막으면
      //   달리는 날 사본이 난다
      .filter((r) => r.type !== "mandatory" && tierOf(r) === "urgent")
      .filter((r) => evaluateConditions(r.conditions ?? [], ctx))
      .sort((a, b) => b.priority - a.priority);
    eventFunnelStats.conditional.condPass += urgent.length;
    for (const r of urgent) {
      eventFunnelStats.candidateByRule[r.id] = (eventFunnelStats.candidateByRule[r.id] ?? 0) + 1;
      eventFunnelStats.conditional.urgentPicked++;
      tryEmit(r, "conditional");
    }
  }

  // ── 3. 등급 줄기 — 한 주에 **하나** (2026-09-08 · §1) ──────────
  //
  // 예전엔 여기가 둘이었다: conditional 이 「이번 시즌 안 뜬 것 우선 → priority」로
  // 한 칸을 주고, random 이 풀 다섯을 확률로 굴려 또 다섯 칸까지 줬다. 그래서
  // **한 주에 뜨는 이벤트 수가 풀 운에 달려 있었고**(0~6), 등급이라는 축이
  // 아무 데도 없었다.
  //
  // 지금은 **등급이 먼저다**:
  //   ① 등급 추첨(노말·레어·유니크·히든) — 시즌 상한에 닿은 등급은 가중 0
  //   ② 그 등급 안에서 — 조건·정책 통과 · 이번 시즌 안 뜬 것 우선 · 밀린 주 가중
  //   ③ 비었으면 한 등급 아래로 + **폴백 카운터**(데이터 부족 신호)
  //
  // ⚠ 랜덤 풀 다섯은 노말로 흡수됐다 — `poolId` 는 남아 결(`theme`)의 이름표다.
  {
    /** 등급별 후보. 조건·숨은 조건·정책·히든 커리어 상한을 다 통과한 것만 */
    const byGrade = new Map<EventGrade, EventRule[]>();
    for (const g of GRADES) byGrade.set(g, []);

    let condPass = 0;
    for (const rule of rules) {
      // 필수는 달력이 정하는 자리라 등급 줄기를 안 탄다(§1) — 등급이 달려
      // 있어도 여기 안 든다
      if (rule.type === "mandatory") continue;
      const g = gradeOf(rule);
      if (!g) continue;                                   // urgent · 미기재
      if (!evaluateConditions(rule.conditions ?? [], ctx)) continue;
      // 히든의 숨은 조건 — 화면엔 안 보이지만 평가는 똑같다(§4)
      if (rule.hiddenCondition && !evaluateConditions(rule.hiddenCondition, ctx)) continue;
      condPass++;
      if (!checkOncePolicy(rule, ctx, seasonYear, careerStageYear)) {
        eventFunnelStats.grade.policyBlocked++;
        continue;
      }
      // 🔴 **히든은 종당 커리어 `careerCapPerEvent` 번**(§3). `oncePolicy` 와
      //    따로 본다 — 데이터가 실수로 `once_per_season` 을 달아도 안 새게
      if (g === "hidden") {
        const fired = (ctx.protagonist.careerTriggeredEvents ?? {})[rule.id];
        if (fired !== undefined && tierRules.hidden.careerCapPerEvent <= 1) {
          eventFunnelStats.grade.policyBlocked++;
          continue;
        }
      }
      byGrade.get(g)!.push(rule);
    }
    eventFunnelStats.grade.condPass += condPass;
    for (const list of byGrade.values()) {
      for (const r of list) {
        eventFunnelStats.candidateByRule[r.id] = (eventFunnelStats.candidateByRule[r.id] ?? 0) + 1;
      }
    }

    // ① 등급 추첨
    const w = gradeWeights(tierRules, ctx, week);
    const drawn = weightedPick(
      GRADES.map((g) => ({ g, weight: w[g] })).filter((x) => x.weight > 0),
      nextRand(),
    )?.g ?? null;

    // ②·③ 등급 안에서 고르고, 비면 한 단계 아래로
    let picked: EventRule | null = null;
    let at: EventGrade | null = drawn;
    if (drawn) eventFunnelStats.tier.drawn[drawn] = (eventFunnelStats.tier.drawn[drawn] ?? 0) + 1;
    /** 이번 시즌 상한에 닿은 등급인가 — 추첨도 폴백도 같은 자를 쓴다 */
    const capped = (g: EventGrade) => {
      const cap = tierRules.seasonCap[g];
      return cap !== undefined && (ctx.tierCounts?.[g] ?? 0) >= cap;
    };
    while (at) {
      const cands = capped(at) ? [] : (byGrade.get(at) ?? []);
      // 🔴 **폴백도 상한을 봐야 한다.** 처음엔 추첨만 봤다 — 유니크에서
      //    내려온 폴백이 상한을 채운 레어로 떨어지면 시즌 상한이 새는데,
      //    그 새는 자리를 `tier.capViolation` 이 재고 있었다(늘 0 이어야 한다).
      if (cands.length > 0) {
        // 「이번 시즌 안 뜬 것」이 먼저다 — 한 바퀴 돌기 전엔 아무도 두 번 안 뜬다.
        // ⚠ 띠가 비면 예전 것으로 떨어진다(상태 경고가 그렇게 지연된다)
        const fresh = cands.filter((r) => ctx.triggeredEvents[r.id] === undefined);
        const pool = fresh.length > 0 ? fresh : cands;
        // 밀린 주 가중 — 후보였는데 안 뽑힌 주마다 붙는다. 안 쌓으면
        // 가중이 낮은 이야기가 한 시즌 내내 뒤에 선다
        const weighted = pool.map((r) => ({
          r,
          weight: (r.weight ?? 1)
            + Math.min(tierRules.starve.max, tierRules.starve.perWeek * (ctx.eventStarve?.[r.id] ?? 0)),
        }));
        picked = weightedPick(weighted, nextRand())?.r ?? null;
      }
      if (picked) break;
      eventFunnelStats.tier.empty[at] = (eventFunnelStats.tier.empty[at] ?? 0) + 1;
      const below = gradeBelow(at);
      if (!below) break;
      // 🔴 폴백 — 한 번이라도 나면 `check:tiercoverage` 가 빨강이다
      if (!fallbackFrom) fallbackFrom = drawn;
      eventFunnelStats.tier.fallback++;
      const key = `${stageGroup}/${at}`;
      eventFunnelStats.tier.fallbackBy[key] = (eventFunnelStats.tier.fallbackBy[key] ?? 0) + 1;
      at = below;
    }

    if (picked && at) {
      if (tryEmit(picked, "grade")) {
        gradeFired = at;
        // 코드가 「막는다」고 적은 것을 실제로 잰다 — 늘 0 이어야 한다(§10)
        if (capped(at)) eventFunnelStats.tier.capViolation++;
        if (at === "hidden" && (ctx.protagonist.careerTriggeredEvents ?? {})[picked.id] !== undefined) {
          eventFunnelStats.tier.hiddenCareerViolation++;
        }
        eventFunnelStats.tier.emitted[at] = (eventFunnelStats.tier.emitted[at] ?? 0) + 1;
        const k = `${stageGroup}/${at}`;
        eventFunnelStats.tier.emittedByStage[k] = (eventFunnelStats.tier.emittedByStage[k] ?? 0) + 1;
      }
    }

    // 밀린 주 — 뽑힌 것은 0, 나머지 후보는 +1.
    // ⚠ **뽑힌 것을 안 되돌리면** 한 번 뜬 이야기가 큰 가중을 계속 들고 다닌다
    for (const list of byGrade.values()) {
      for (const r of list) {
        if (r === picked) { starveUpdates[r.id] = 0; continue; }
        starveUpdates[r.id] = (ctx.eventStarve?.[r.id] ?? 0) + 1;
        eventFunnelStats.grade.crowdedOut++;
        eventFunnelStats.crowdedByRule[r.id] = (eventFunnelStats.crowdedByRule[r.id] ?? 0) + 1;
      }
    }
    eventFunnelStats.tier.weeksByStage[stageGroup] =
      (eventFunnelStats.tier.weeksByStage[stageGroup] ?? 0) + 1;
  }

  eventFunnelStats.elapsedMs += performance.now() - _t0;
  return {
    newMessages, updatedTriggers, careerUpdatedTriggers, sentencePicks: bank.picked,
    gradeFired, fallbackFrom, starveUpdates, costs,
  };
}
