import type { EventRule, EventPool, MessageTemplate, DecisionTemplate, EventContext } from "../types/event";
import type { PendingAction, EventChoice } from "../types/season";
import type { MessageItem } from "../types/main";
import { evaluateConditions } from "./conditionEvaluator";

// ── oncePolicy 통과 여부 ───────────────────────────────────────
function checkOncePolicy(
  rule: EventRule,
  ctx: EventContext,
  seasonYear: number,
  careerStageYear: number,
): boolean {
  const lastWeek = ctx.triggeredEvents[rule.id];
  if (lastWeek === undefined) return true;

  switch (rule.oncePolicy) {
    case "repeatable":
      if (rule.cooldownWeeks !== undefined) {
        return ctx.currentWeek - lastWeek >= rule.cooldownWeeks;
      }
      return true;

    case "once_per_season":
      // seasonYear가 바뀌면 triggeredEvents가 초기화되므로 이미 기록 있으면 차단
      return false;

    case "once_per_stage_year":
      // careerStageYear 당 1회: 같은 스테이지-연도 내에 발생했으면 차단
      return careerStageYear !== Math.floor(lastWeek / 52);

    case "once_per_career":
      return false;
  }
}

// ── 이벤트 → PendingAction 또는 MessageItem 변환 ─────────────
function ruleToOutput(
  rule: EventRule,
  msgTmpl: MessageTemplate | undefined,
  decTmpl: DecisionTemplate | undefined,
  week: number,
): { action?: PendingAction; message?: MessageItem } {
  const title = msgTmpl?.subject ?? rule.title;
  const body  = msgTmpl?.body   ?? "";

  if (decTmpl) {
    const choices: EventChoice[] = decTmpl.options.map((o) => ({
      id:         o.id,
      label:      o.label,
      effectHint: o.effectHint,
      effects:    o.effects,
    }));
    const action: PendingAction = {
      type:        "event",
      eventId:     rule.id,
      title,
      description: body,
      choices,
    };
    return { action };
  }

  const message: MessageItem = {
    id:        `evt-${rule.id}-w${week}-${Date.now()}`,
    category:  msgTmpl?.category ?? "system",
    sender:    "이벤트 시스템",
    subject:   title,
    preview:   body.slice(0, 60),
    body,
    createdAt: `W${week}`,
    readAt:    null,
  };
  return { message };
}

// ── 가중치 기반 랜덤 선택 ─────────────────────────────────────
function weightedPick<T extends { weight?: number }>(items: T[]): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((s, x) => s + (x.weight ?? 1), 0);
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.weight ?? 1;
    if (rand <= 0) return item;
  }
  return items[items.length - 1];
}

// ── 이벤트 엔진 메인 ──────────────────────────────────────────
export interface EventEngineResult {
  pendingActions: PendingAction[];
  newMessages: MessageItem[];
  updatedTriggers: Record<string, number>; // 이번 주에 발생한 eventId → week
}

export function runEventEngine(
  rules: EventRule[],
  pools: EventPool[],
  msgTmplMap: Map<string, MessageTemplate>,
  decTmplMap: Map<string, DecisionTemplate>,
  ctx: EventContext,
  seasonYear: number,
  careerStageYear: number,
): EventEngineResult {
  const pendingActions: PendingAction[] = [];
  const newMessages: MessageItem[] = [];
  const updatedTriggers: Record<string, number> = {};
  const week = ctx.currentWeek;

  function tryEmit(rule: EventRule) {
    if (!checkOncePolicy(rule, ctx, seasonYear, careerStageYear)) return;
    const msgTmpl = rule.messageTemplateId ? msgTmplMap.get(rule.messageTemplateId) : undefined;
    const decTmpl = rule.decisionTemplateId ? decTmplMap.get(rule.decisionTemplateId) : undefined;
    const { action, message } = ruleToOutput(rule, msgTmpl, decTmpl, week);
    if (action)  pendingActions.push(action);
    if (message) newMessages.push(message);
    updatedTriggers[rule.id] = week;
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
    // 풀 발동 확률 롤
    if (Math.random() * 100 > pool.baseRoll.value) continue;

    const poolRules = poolRuleMap.get(pool.id) ?? [];
    // 이번 주에 이미 고른 수 확인
    let picksThisWeek = 0;

    for (let i = 0; i < pool.maxPicksPerWeek; i++) {
      const eligible = poolRules.filter((r) =>
        evaluateConditions(r.conditions ?? [], ctx) &&
        checkOncePolicy(r, ctx, seasonYear, careerStageYear) &&
        !updatedTriggers[r.id] // 이번 엔진 호출에서 이미 발생시키지 않은 것
      );
      const picked = weightedPick(eligible);
      if (!picked) break;
      tryEmit(picked);
      picksThisWeek++;
    }
    void picksThisWeek;
  }

  return { pendingActions, newMessages, updatedTriggers };
}
