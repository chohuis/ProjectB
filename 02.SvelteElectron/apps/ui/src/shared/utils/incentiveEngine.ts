/**
 * 인센티브 시즌 끝 정산 (PLAN_CONTRACT_TERMS §5 · §5-3 · §7 ⑤).
 *
 * 🔴 **여기는 판정만 한다.** 세계를 바꾸는 것(돈·`paidSeasons`·소식)은
 * `usecases/incentiveSettlement.ts` 가 한다. 나눠 둔 이유는 늘 같다 —
 * 이 저장소의 vitest 는 `environment: "node"` 라 스토어를 태우면 식을 못 잰다.
 * `contractTerms.ts`(협상 계산)와 같은 선이다.
 *
 * ## 규칙 셋 (사용자 확정)
 *
 * ```
 * 시점    시즌 종료 처리에서 한 번  (§5 ✅ 확정 3)
 * 축      그 시즌 보직의 축으로 잰다 (§5-3 ✅)
 * 못 잴 축 **미달**로 친다          (§5-3 ✅ ① · 보직은 주인공이 골랐다)
 * ```
 *
 * ⚠ **NPC 는 안 한다** (§4-2 ✅ 확정 5). `ProContract.incentives` 는
 *   주인공 계약에만 붙는다.
 * ⚠ 문턱·금액은 **전부 제안값**이다 (§7-1 계측 전). 이 파일엔 숫자가 없다 —
 *   문턱은 계약서(`ContractIncentive.threshold`)에 이미 박혀 있고 축 목록은
 *   `contractRules.incentives.byRole` 에서 온다.
 */

import { ipLabel, eraLabel } from "./baseballFormat";
import { contractRules, incentiveKey, incentiveLabel } from "./contractTerms";
import { fillContractCopy, type ContractTermsCopy } from "./contractCopy";
import type { ContractIncentive, PitcherSeasonStats } from "../types/save";

/** 한 축의 결말. `unmeasurable` 도 **돈은 안 나간다** — 미달과 같은 취급이다 */
export type IncentiveOutcome = "met" | "missed" | "unmeasurable";

export interface IncentiveSettlementRow {
  /** `incentiveKey` — `paidSeasons` 를 찍을 때 계약서의 그 줄을 다시 찾는 열쇠 */
  key: string;
  /** 「25등판」·「ERA 3.00 이하」·「골든글러브」 — `incentiveLabel` 정본 */
  label: string;
  outcome: IncentiveOutcome;
  /**
   * 괄호 안에 들어가는 실측값.
   *
   * ⚠ **수상은 1/0 이다.** 「(수상)」·「(미수상)」 같은 말을 코드가 지으면
   *   문안 정본이 둘이 된다 — 문장은 `messages/contract_terms.json` 에만 있다.
   * ⚠ 못 잰 축은 빈 문자열이다. 그 줄은 `unmeasurable` 문안이 따로 있고
   *   자리표(`{actual}`)를 안 쓴다.
   */
  actual: string;
  /** 실제 나가는 돈. 달성일 때만 `bonus`, 아니면 0 */
  paid: number;
}

export interface IncentiveSettlement {
  rows: IncentiveSettlementRow[];
  /** 그 해 지급 합계 (만원) */
  total: number;
  /** 이번에 정산한 줄의 열쇠 — 호출부가 `paidSeasons` 에 시즌을 찍는다 */
  settledKeys: string[];
}

export interface IncentiveSettleInput {
  seasonYear: number;
  /** 계약서의 인센티브. 구 세이브는 `undefined` 다 — 그때는 정산 자체가 없다 */
  incentives: readonly ContractIncentive[] | undefined;
  /** 그 시즌 보직 (`protagonist.position`) — "SP" | "RP" | "CP". 그 밖은 못 잰다 */
  role: string;
  /** 그 시즌 주인공 성적. 없으면 안 던진 해다 */
  stats: PitcherSeasonStats | undefined;
  /** 그 해 받은 수상 id (`CareerAward.id`) */
  awardIds: readonly string[];
}

/**
 * 수상 판정 — **접두로도 맞춘다.**
 *
 * 계약서의 `awardId` 는 `awardRules` 의 id(`golden`·`mvp`)인데,
 * 골든글러브 수상 기록은 부문까지 붙어 `golden_골든글러브 (투수)` 로 남는다
 * (`seasonAwards.ts` 의 `defId`). 정확히 같은 문자열만 보면 골든글러브
 * 인센티브는 **영원히 미달**이다.
 */
function wonAward(awardIds: readonly string[], awardId: string): boolean {
  if (!awardId) return false;
  return awardIds.some((id) => id === awardId || id.startsWith(`${awardId}_`));
}

/**
 * 그 보직으로 잴 수 있는 축인가 (§5-3).
 *
 * 수상은 보직과 무관하다(`awardAxisAllRoles`). 나머지는
 * `contractRules.incentives.byRole` 에 그 축이 있어야 한다 — 3년 계약
 * 2년차에 선발에서 마무리로 가면 「이닝 150」이 여기서 걸린다.
 */
export function axisMeasurable(kind: ContractIncentive["kind"], role: string): boolean {
  const r = contractRules().incentives;
  if (kind === "award") return r.awardAxisAllRoles;
  return (r.byRole[role] ?? []).includes(kind);
}

/** 축 하나의 실측값과 달성 여부. 성적이 없으면 0 취급이다 */
function measure(
  inc: ContractIncentive, stats: PitcherSeasonStats | undefined, awardIds: readonly string[],
): { met: boolean; actual: string } {
  if (inc.kind === "award") {
    const w = wonAward(awardIds, inc.awardId ?? "");
    return { met: w, actual: w ? "1" : "0" };
  }
  const g  = stats?.g  ?? 0;
  const ip = stats?.ip ?? 0;
  switch (inc.kind) {
    case "games":   return { met: g  >= inc.threshold, actual: String(g) };
    case "innings": return { met: ip >= inc.threshold, actual: ipLabel(ip) };
    case "wins":    return { met: (stats?.w  ?? 0) >= inc.threshold, actual: String(stats?.w  ?? 0) };
    case "saves":   return { met: (stats?.sv ?? 0) >= inc.threshold, actual: String(stats?.sv ?? 0) };
    case "holds":   return { met: (stats?.hd ?? 0) >= inc.threshold, actual: String(stats?.hd ?? 0) };
    case "era": {
      // 🔴 **한 이닝도 안 던지면 ERA 는 0 이다.** 그대로 재면 「ERA 3.00 이하」가
      //    공짜가 된다 — 안 던진 해에 보너스가 나가는 건 규칙이 아니라 결함이다.
      if (ip <= 0) return { met: false, actual: eraLabel(null) };
      const era = stats?.era ?? 0;
      return { met: era <= inc.threshold, actual: eraLabel(era) };
    }
    default: return { met: false, actual: "0" };
  }
}

/**
 * 한 시즌치 정산.
 *
 * ⚠ **이미 그 해를 정산한 줄은 건너뛴다** (`paidSeasons`). 시즌 종료 경로가
 *   둘(롤오버·진로 결정)이라 같은 해에 두 번 불릴 수 있다 — `runWorldSeasonEnd`
 *   의 연도 가드가 대개 막지만, 계약서에도 자물쇠를 둔다. 다년 계약에서
 *   **두 번 주는 걸 막는 게 이 필드의 목적**이다(`save.ts`).
 *
 * ⚠ 미달한 해도 `paidSeasons` 에 찍는다 — 안 그러면 재실행이 미달 소식을
 *   한 통 더 만든다. 다음 해는 그 해 번호가 없으니 다시 잰다.
 */
export function settleIncentives(input: IncentiveSettleInput): IncentiveSettlement {
  const rows: IncentiveSettlementRow[] = [];
  const settledKeys: string[] = [];
  let total = 0;

  for (const inc of input.incentives ?? []) {
    if ((inc.paidSeasons ?? []).includes(input.seasonYear)) continue;
    const key = incentiveKey(inc);
    const label = incentiveLabel(inc);
    settledKeys.push(key);

    if (!axisMeasurable(inc.kind, input.role)) {
      rows.push({ key, label, outcome: "unmeasurable", actual: "", paid: 0 });
      continue;
    }
    const { met, actual } = measure(inc, input.stats, input.awardIds);
    const paid = met ? Math.max(0, Math.round(inc.bonus)) : 0;
    total += paid;
    rows.push({ key, label, outcome: met ? "met" : "missed", actual, paid });
  }

  return { rows, total, settledKeys };
}

/**
 * 정산 소식 본문 — **문안 한 통에서만** 만든다.
 *
 * ```
 * 달성       met          {incentive} 달성 ({actual})  +{bonus}만원
 * 미달       missed       {incentive} 미달 ({actual})
 * 못 잰 축   unmeasurable {incentive} 미달 (보직이 바뀌었습니다)   ← §5-3 ①
 * 합계       total        지급이 있을 때만
 * 하나도 없음 none         한 줄도 못 채운 해
 * ```
 *
 * 🔴 **여기서 문장을 짓지 않는다.** 정본은 `messages/contract_terms.json` 이고
 *   이 함수는 자리표만 채운다. 조사도 안 붙인다 — `{incentive}` 는 받침이
 *   제각각이라(「25등판」/「ERA 3.00 이하」) 파일이 줄 끝에 두게 짜여 있다.
 */
export function incentiveMessageBody(
  copy: ContractTermsCopy["incentive"], st: IncentiveSettlement,
): string {
  const lines: string[] = [];
  for (const r of st.rows) {
    if (r.outcome === "met") {
      lines.push(fillContractCopy(copy.met, { incentive: r.label, actual: r.actual, bonus: r.paid }));
    } else if (r.outcome === "missed") {
      lines.push(fillContractCopy(copy.missed, { incentive: r.label, actual: r.actual }));
    } else {
      lines.push(fillContractCopy(copy.unmeasurable, { incentive: r.label }));
    }
  }
  lines.push("", st.total > 0 ? fillContractCopy(copy.total, { total: st.total }) : copy.none);
  return lines.join("\n");
}
