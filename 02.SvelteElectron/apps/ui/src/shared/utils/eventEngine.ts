import type { EventRule, EventPool, MessageTemplate, DecisionTemplate, EventContext } from "../types/event";
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

    case "once_per_stage_year": {
      const lastWeek = ctx.triggeredEvents[rule.id];
      if (lastWeek === undefined) return true;
      // careerStageYear 당 1회: 같은 스테이지-연도 내에 발생했으면 차단
      return careerStageYear !== Math.floor(lastWeek / 52);
    }

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
): { message: MessageItem } {
  const title = msgTmpl?.subject ?? rule.title;
  const body  = msgTmpl?.body   ?? "";

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
  const newMessages: MessageItem[] = [];
  const updatedTriggers: Record<string, number> = {};
  const careerUpdatedTriggers: Record<string, number> = {};
  const week = ctx.currentWeek;
  let ri = 0;
  const nextRand = () => randoms[ri++] ?? Math.random();

  function tryEmit(rule: EventRule) {
    if (!checkOncePolicy(rule, ctx, seasonYear, careerStageYear)) return;
    const msgTmpl = rule.messageTemplateId ? msgTmplMap.get(rule.messageTemplateId) : undefined;
    const decTmpl = rule.decisionTemplateId ? decTmplMap.get(rule.decisionTemplateId) : undefined;
    const { message } = ruleToOutput(rule, msgTmpl, decTmpl, week);
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

  for (const rule of mandatory) {
    tryEmit(rule);
  }

  // ── 2. conditional 이벤트 (조건 통과, priority 내림차순, 1개만) ─
  const conditional = rules
    .filter((r) => r.type === "conditional")
    .filter((r) => evaluateConditions(r.conditions ?? [], ctx))
    .sort((a, b) => b.priority - a.priority);

  if (conditional.length > 0) {
    // oncePolicy 통과하는 첫 번째
    const picked = conditional.find((r) =>
      checkOncePolicy(r, ctx, seasonYear, careerStageYear)
    );
    if (picked) tryEmit(picked);
  }

  // ── 3. random 이벤트 (풀 단위 확률 롤) ───────────────────────
  const poolRuleMap = new Map<string, EventRule[]>();
  for (const rule of rules.filter((r) => r.type === "random" && r.poolId)) {
    const poolId = rule.poolId!;
    if (!poolRuleMap.has(poolId)) poolRuleMap.set(poolId, []);
    poolRuleMap.get(poolId)!.push(rule);
  }

  for (const pool of pools) {
    if (nextRand() * 100 > pool.baseRoll.value) continue;

    const poolRules = poolRuleMap.get(pool.id) ?? [];

    for (let i = 0; i < pool.maxPicksPerWeek; i++) {
      const eligible = poolRules.filter((r) =>
        evaluateConditions(r.conditions ?? [], ctx) &&
        checkOncePolicy(r, ctx, seasonYear, careerStageYear) &&
        !updatedTriggers[r.id]
      );
      const picked = weightedPick(eligible, nextRand());
      if (!picked) break;
      tryEmit(picked);
    }
  }

  return { newMessages, updatedTriggers, careerUpdatedTriggers };
}
