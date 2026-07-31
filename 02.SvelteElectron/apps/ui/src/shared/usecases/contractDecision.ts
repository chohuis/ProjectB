// ── 계약 협상 결정 ───────────────────────────────────────────────
//
// `ContractNegotiationModal` 안에 있던 로직이다. 프로 커리어 **매년** 도는
// 경로인데 한 번도 헤드리스로 안 돌아봤다 — 바로 옆 코드(`seasonRollover`의
// 프로 분기)에서 "계약 기간 중이면 다음 시즌 경기가 0건"(#21)이 나왔다.
//
// 모달에는 표시와 사용자 선택만 남는다.

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { isFaEligible } from "../utils/faEngine";
import { openProSeason } from "./proSeason";
import type { ProContract } from "../types/save";
import type { PendingAction } from "../types/season";

export type NegotiationAction = Extract<PendingAction, { type: "salaryNegotiation" }>;

/** 즉시 발효되는 계약인가 — 입단·전역 복귀는 그 자리에서 시즌이 열린다 */
export function isImmediateContract(context: NegotiationAction["context"]): boolean {
  return context === "military_return" || context === "initial";
}

/**
 * 계약에 서명한다.
 *
 * **즉시 계약**(입단·전역 복귀)은 그 자리에서 다음 시즌을 연다.
 * **재계약**은 `pendingNextContract`에 넣어두고 시즌 롤오버가 적용한다 —
 * 시즌 도중에 소속이 바뀌면 그해 성적이 두 팀에 걸친다.
 */
export async function signNegotiatedContract(
  action: NegotiationAction,
  contract: ProContract,
  teamName: string,
): Promise<void> {
  if (isImmediateContract(action.context)) {
    gameStore.signContract(contract);
    await openProSeason(action.leagueId, contract.teamId);
  } else {
    gameStore.setPendingNextContract(contract);
    gameStore.addMessage({
      id: `msg-contract-signed-${get(seasonStore).seasonYear}-w${get(seasonStore).currentWeek}`,
      category: "system", sender: "에이전트",
      subject: "계약 서명 완료",
      preview: `${teamName}와 계약이 완료되었습니다. W52 새 시즌부터 적용됩니다.`,
      body: [
        `${teamName}와의 계약이 완료되었습니다.`,
        `연봉: ${contract.salary}만원 / ${contract.durationYears}년`,
        `계약금: ${contract.signingBonus}만원`,
        ``,
        `W52 새 시즌 시작 시 정식 적용됩니다.`,
      ].join("\n"),
      createdAt: `W${get(seasonStore).currentWeek}`, readAt: null,
    });
  }
  seasonStore.resolvePendingAction("salaryNegotiation");
  await gameStore.save();
  await seasonStore.save();
}

/**
 * 계약을 거절한다.
 *
 * ⚠ FA 자격이 있으면 FA 시장으로 간다. **없으면 갈 곳이 없다** —
 * 예전엔 그냥 pending만 해소하고 끝나서, 소속팀도 계약도 없는 채로
 * 다음 주가 왔다. 지금은 그 상태를 메시지로 알리고 남는다
 * (미계약 주차가 쌓이면 `faUnsignedWeeks`가 진로를 정한다).
 *
 * @returns 다음에 무슨 일이 일어나는지 — 호출부가 화면 문구에 쓴다
 */
export async function rejectNegotiatedContract(
  action: NegotiationAction, teamName: string,
): Promise<"faMarket" | "unsigned"> {
  const g = get(gameStore);
  seasonStore.resolvePendingAction("salaryNegotiation");

  const eligible = isFaEligible(g.protagonist, g.schoolState.attendsUniversity);
  if (eligible) {
    seasonStore.pushPendingAction({ type: "faMarket" });
    await seasonStore.save();
    return "faMarket";
  }

  gameStore.addMessage({
    id: `msg-contract-rejected-${get(seasonStore).seasonYear}-w${get(seasonStore).currentWeek}`,
    category: "system", sender: "에이전트",
    subject: "계약 거절 — 미계약 상태",
    preview: "FA 자격이 없어 다른 팀과 협상할 수 없습니다.",
    body: [
      `${teamName}의 제안을 거절했습니다.`,
      "",
      "아직 FA 자격이 없어 다른 구단과 협상할 수 없습니다.",
      "구단이 다시 제안해 올 때까지 미계약 상태로 남습니다.",
    ].join("\n"),
    createdAt: `W${get(seasonStore).currentWeek}`, readAt: null,
  });
  await gameStore.save();
  await seasonStore.save();
  return "unsigned";
}
