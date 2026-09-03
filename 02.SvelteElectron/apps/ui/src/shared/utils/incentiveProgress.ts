// ── 계약 정보 카드의 「올해 인센티브」 한 줄 ─────────────────────
//
// 시즌 끝 정산(`incentiveEngine`)은 **한 번 지나가면 소식함에만 남는다.**
// 다년 계약이면 그 뒤로도 같은 조건을 안고 사는데, 지금 몇 개를 채웠는지
// 보이는 자리가 화면에 없었다 — 계약 정보 카드가 그 자리다.
//
// 🔴 **판정을 다시 하지 않는다.** `settleIncentives` 를 그대로 부른다.
//    문턱을 여기서 한 번 더 재면 카드와 정산 소식이 **다른 답**을 낼 수 있고,
//    그게 이 저장소가 반복해 겪은 형태다(문서·코드가 둘이면 한쪽만 고쳐진다).
//
// 🔴 **말을 짓지 않는다.** 「달성」은 정산 표 문안
//    (`dashboard_labels.json` `table.incentiveSettlement.outcomeLabel`)이
//    이미 갖는다 — 카드가 한 벌 더 두면 한쪽만 고쳐진 채 남는다.

import { settleIncentives, type IncentiveSettleInput } from "./incentiveEngine";

export interface IncentiveProgress {
  /** 계약에 걸린 줄 수. **0 이면 카드에 줄을 안 그린다** */
  count: number;
  /** 그중 지금까지 채운 것 */
  met: number;
  /** 채운 것의 합 (만원). 시즌 중이면 아직 안 받은 돈이다 */
  amount: number;
}

/**
 * 지금 시즌의 진행 상황.
 *
 * ⚠ **`paidSeasons` 를 비워서 넘긴다.** 엔진은 이미 정산한 해를 건너뛰는데
 *   (두 번 주는 걸 막는 자물쇠다) 카드는 **정산이 끝난 뒤에도** 그 해 결과를
 *   보여야 한다. 안 비우면 시즌 종료 처리 뒤에 줄이 통째로 사라진다.
 *
 * ⚠ **여기서 돈을 주지 않는다.** 판정만 부르고 세계는 안 건드린다 —
 *   지급·자물쇠·소식은 `usecases/incentiveSettlement.ts` 하나가 한다.
 */
export function incentiveProgress(input: IncentiveSettleInput): IncentiveProgress {
  const incentives = (input.incentives ?? []).map((i) => ({ ...i, paidSeasons: [] }));
  if (incentives.length === 0) return { count: 0, met: 0, amount: 0 };

  const st = settleIncentives({ ...input, incentives });
  return {
    count: st.rows.length,
    met: st.rows.filter((r) => r.outcome === "met").length,
    amount: st.total,
  };
}

/**
 * 카드에 찍을 글자 — 「달성 2/4 · +3,000만원」.
 *
 * @param metWord 정산 표 문안의 `outcomeLabel.met`. 없으면 숫자만 그린다
 * @param moneyText 카드가 이미 쓰는 돈 표기(`formatSalary`) — 두 벌을 안 만든다
 *
 * ⚠ **지급이 0 이면 금액을 안 붙인다.** 「+0만 원」은 채운 게 없다는 말을
 *   두 번 하는 것이고, 달성 수가 이미 0 이라고 적혀 있다.
 */
export function incentiveProgressText(
  pr: IncentiveProgress, metWord: string, moneyText: (v: number) => string,
): string {
  const head = metWord ? `${metWord} ${pr.met}/${pr.count}` : `${pr.met}/${pr.count}`;
  return pr.amount > 0 ? `${head} · +${moneyText(pr.amount)}` : head;
}
