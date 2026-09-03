// ── 인센티브 시즌 끝 정산 (PLAN_CONTRACT_TERMS §5 · §5-3 · §7 ⑤⑥) ──────
//
// **판정은 `utils/incentiveEngine.ts` 가 한다.** 여기는 재료를 모아 넘기고
// 결과를 세계에 반영하는 자리다 — 돈 · `paidSeasons` · 소식 한 통.
//
// 🔴 **문장을 짓지 않는다.** 정본은 `messages/contract_terms.json` 의
//   `incentive` 통이고, 못 읽으면 **소식을 안 만든다**(돈은 그래도 나간다).
//   `pitcherRole.ts` 가 보직 문안에 두고 있는 규칙과 같다.
//
// ⚠ **`runWorldSeasonEnd` 가 부른다** — 수상(`applySeasonAwards`) 뒤여야 한다.
//   수상 인센티브는 그 해 `careerRecords[].awards` 를 읽는데 그걸 방금 얹었다.

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { fillContractCopy } from "../utils/contractCopy";
import { settleIncentives, incentiveMessageBody } from "../utils/incentiveEngine";
import type { PitcherSeasonStats } from "../types/save";

/**
 * 그 시즌 인센티브를 정산한다.
 *
 * @returns 자동 진행 로그 줄 (없으면 빈 배열)
 */
export function settleSeasonIncentives(seasonYear: number): string[] {
  const g = get(gameStore);
  const p = g.protagonist;
  const contract = p.contract;
  // 계약이 없거나 인센티브가 안 걸린 계약 — **구 세이브가 여기로 온다.**
  // `incentives` 는 옵셔널이고 예전 세이브엔 아예 없다.
  if (!contract || (contract.incentives ?? []).length === 0) return [];

  const s = get(seasonStore);
  const raw = s.stats?.[p.id];
  const stats = raw?.type === "pitcher" ? (raw as PitcherSeasonStats) : undefined;
  const awardIds = (p.careerRecords ?? [])
    .find((r) => r.year === seasonYear)?.awards?.map((a) => a.id) ?? [];

  const st = settleIncentives({
    seasonYear,
    incentives: contract.incentives,
    // 「그 시즌 보직」 — 시즌 시작 전 주에 확정돼 시즌 내내 안 바뀐다(§5-3)
    role: String(p.position ?? ""),
    stats,
    awardIds,
  });
  if (st.settledKeys.length === 0) return [];

  // 🔴 **돈보다 자물쇠를 먼저**는 아니다 — 둘 다 같은 턴에 돌고 실패할 자리가
  //   없다. 다만 순서를 바꾸면 안 된다: 자물쇠를 먼저 찍고 예외가 나면
  //   돈만 사라진다.
  if (st.total > 0) gameStore.applyMoneyChange(st.total);
  gameStore.markIncentivesSettled(seasonYear, st.settledKeys);

  const copy = get(masterStore).contractCopy?.incentive;
  if (copy) {
    gameStore.addMessage({
      id: `msg-contract-incentive-${seasonYear}-w${s.currentWeek}`,
      category: "system",
      // 계약 갈래의 보낸이는 「에이전트」다 (§5 — 사람이 아니라 말투다)
      sender: "에이전트",
      subject: fillContractCopy(copy.subject, { year: seasonYear }),
      preview: st.total > 0
        ? fillContractCopy(copy.total, { total: st.total })
        : copy.none,
      body: incentiveMessageBody(copy, st),
      createdAt: `W${s.currentWeek}`,
      readAt: null,
    });
  } else {
    console.error("[incentive] 정산 문안(messages/contract_terms.json)을 못 읽었다 — 소식을 안 만든다");
  }

  const met = st.rows.filter((r) => r.outcome === "met").length;
  return [`[인센티브] ${seasonYear} 달성 ${met}/${st.rows.length} · 지급 ${st.total}만원`];
}
