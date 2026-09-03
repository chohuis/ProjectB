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
import { masterStore } from "../stores/master";
import { isFaEligible, toContract, type FaOffer } from "../utils/faEngine";
import { openProSeason } from "./proSeason";
import { runWorldSeasonEnd } from "./seasonRollover";
import { TRADE_REASON_LABEL } from "./weekPhases/market";
// 계약 조건 표 (PLAN_MESSAGE_DASHBOARDS §1-1) — 본문은 그대로 두고 값만 더한다
import { contractTableMeta } from "../utils/dashboardMeta";
import type { ProContract } from "../types/save";
import type { PendingAction } from "../types/season";

export type NegotiationAction = Extract<PendingAction, { type: "salaryNegotiation" }>;
export type OptionAction = Extract<PendingAction, { type: "optionClause" }>;

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
    // 연도·종류를 찍는다 — 기록 탭 「계약 이력」이 연도 행이라 이게 없으면
    // 표가 안 선다 (§7-4). 입단·전역 복귀는 새로 맺는 계약이라 `new` 다
    gameStore.signContract(contract, { year: get(seasonStore).seasonYear, kind: "new" });
    // 🔴 **다음 시즌을 열기 전에 이번 시즌의 세계를 닫는다.**
    //
    // `openProSeason`은 현재 연도 +1로 새 시즌을 직접 여는데, 그러면
    // `runSeasonRollover`를 안 타므로 **그 해 세계 처리가 통째로 사라진다** —
    // 순위·수상·오프시즌(은퇴·방출·FA·드래프트)·구단 성향 갱신이 전부.
    //
    // 실측(씨앗 31337 · 6시즌): `salaryNegotiation`으로 시즌을 넘긴 해만
    //   훅·오프시즌 연도에서 2029가 통째로 빠졌다. `draftNotification`으로
    //   넘긴 해는 멀지하다 — `careerDecision`은 이미 이걸 부른다.
    //
    // ⚠ 같은 함정을 `careerDecision.ts`가 먼저 만나 고쳤고 주석까지 적어 둔다.
    //   **그런데 이 파일은 그대로였다** — 즉시 계약(입단·전역 복귀)도
    //   시즌을 직접 여는 경로라 똑같이 필요했다.
    // ⚠ 연도 가드(`_lastWorldSeasonEndYear`)가 있어 롤오버가 이미 돌았으면
    //   그냥 지나간다 — 두 번 돌 걱정은 없다.
    await runWorldSeasonEnd(get(seasonStore).seasonYear);
    await openProSeason(action.leagueId, contract.teamId);
  } else {
    // 재계약·연장이 이 길로 온다. `renewal` 이 아닌 갈래(트레이드 뒤 재협상
    // 등)도 원소속과 다시 맺는 것이라 같은 종류로 본다
    gameStore.setPendingNextContract(contract, { year: get(seasonStore).seasonYear, kind: "resign" });
    gameStore.addMessage({
      id: `msg-contract-signed-${get(seasonStore).seasonYear}-w${get(seasonStore).currentWeek}`,
      category: "system", sender: "에이전트",
      subject: "계약 서명 완료",
      // 🔴 **자리표시자 뒤에 조사를 두지 않는다** (B-28 · B-31 이 문안 쪽을 같은 꼴로
      //    고쳤다 — `contract_terms.json` `signed.head` 와 **같은 문장**이라 꼴을 맞춘다).
      //    팀 238개 중 38종이 「(2군)」 으로 끝나 「… (2군)와의」 가 됐다
      preview: `${teamName} 계약이 완료되었습니다. W52 새 시즌부터 적용됩니다.`,
      body: [
        `${teamName} 계약이 완료되었습니다.`,
        `연봉: ${contract.salary}만원 / ${contract.durationYears}년`,
        `계약금: ${contract.signingBonus}만원`,
        ``,
        `W52 새 시즌 시작 시 정식 적용됩니다.`,
      ].join("\n"),
      createdAt: `W${get(seasonStore).currentWeek}`, readAt: null,
      // 계약 조건을 표로도 싣는다 (PLAN_MESSAGE_DASHBOARDS §1-1 · 묶음 1).
      // 본문 줄은 그대로다 — 표를 못 그리는 자리에서 텍스트가 폴백이다
      metadata: contractTableMeta("contractSigned", {
        teamName,
        salary: contract.salary,
        years: contract.durationYears,
        signingBonus: contract.signingBonus,
        teamOptionYears: contract.teamOptionYears,
        playerOptionYears: contract.playerOptionYears,
        noTrade: contract.noTrade,
        incentives: contract.incentives,
      }),
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

// ── 옵션 조항 ────────────────────────────────────────────────────
//
// `OptionClauseModal`이 구단 옵션·선수 옵션 두 갈래에 **같은 15줄을 두 번**
// 적고 있었다(옵션 적용 → 해소 → FA 자격이면 FA, 아니면 재계약 오퍼).
// 한쪽만 고치면 "구단 옵션으로 들어온 해만 FA가 안 열린다"가 된다.

/**
 * 옵션 결과를 적용하고 **다음 단계를 잇는다**.
 *
 * 옵션이 안 걸리면(미행사) 계약은 만료 상태가 되고, FA 자격이 있으면
 * 시장으로, 없으면 원소속 재계약 협상으로 넘어간다. 여기서 다음을
 * 안 밀어주면 계약이 만료된 채 아무 일도 안 일어난다.
 */
export async function applyOptionClause(action: OptionAction, exercised: boolean): Promise<"faMarket" | "salaryNegotiation"> {
  gameStore.applyOptionResult({ exercised, nextSalary: action.nextSalary, optionType: action.optionType });
  seasonStore.resolvePendingAction("optionClause");

  const g = get(gameStore);
  const next: "faMarket" | "salaryNegotiation" =
    !exercised && isFaEligible(g.protagonist, g.schoolState.attendsUniversity) ? "faMarket" : "salaryNegotiation";

  if (next === "faMarket") {
    seasonStore.pushPendingAction({ type: "faMarket" });
  } else {
    seasonStore.pushPendingAction({
      type: "salaryNegotiation",
      teamId: g.protagonist.contract?.teamId ?? g.protagonist.teamId,
      leagueId: g.protagonist.contract?.leagueId ?? g.protagonist.leagueId,
      offeredSalary: action.nextSalary,
      durationYears: 1, minDurationYears: 1, maxDurationYears: 3,
      signingBonus: 0, context: "renewal",
    });
  }
  await gameStore.save();
  await seasonStore.save();
  return next;
}

// ── FA 시장 ──────────────────────────────────────────────────────

/** FA 계약 체결 — 재계약과 같이 `pendingNextContract`에 넣고 롤오버가 적용한다 */
export async function signFaOffer(offer: FaOffer, salary: number): Promise<void> {
  const s = get(seasonStore);
  const contract = toContract({ ...offer, salary });
  const teamName = get(masterStore).teams.find((t) => t.id === contract.teamId)?.name ?? contract.teamId;

  gameStore.setPendingNextContract(contract, { year: s.seasonYear, kind: "fa" });
  gameStore.addCareerEvent({
    year: s.seasonYear, eventType: "fa_signed",
    toTeamId: contract.teamId, toLeagueId: contract.leagueId,
  });
  gameStore.addMessage({
    // ⚠ 예전엔 `Date.now()`를 썼다 — 같은 세이브를 다시 열면 id가 달라져
    // 중복 메시지가 생긴다. 게임 시간(연·주)으로 만든다.
    id: `msg-fa-signed-${s.seasonYear}-w${s.currentWeek}`,
    category: "system", sender: "에이전트",
    subject: "FA 계약 서명 완료",
    // 🔴 조사를 안 붙인다 — 위 계약 완료와 같은 이유다 (B-28)
    preview: `${teamName} FA 계약이 완료되었습니다.`,
    body: [
      `${teamName} FA 계약이 완료되었습니다.`,
      `연봉: ${salary.toLocaleString()}만원 / ${offer.durationYears}년`,
      `계약금: ${offer.signingBonus.toLocaleString()}만원`,
      ``,
      `W52 새 시즌 시작 시 정식 적용됩니다.`,
    ].join("\n"),
    createdAt: `W${s.currentWeek}`, readAt: null,
    // 재계약과 **같은 조립**이다 — 종류(`kind`)만 다르다
    metadata: contractTableMeta("faSigned", {
      teamName,
      salary,
      years: offer.durationYears,
      signingBonus: offer.signingBonus,
      teamOptionYears: contract.teamOptionYears,
      playerOptionYears: contract.playerOptionYears,
      noTrade: contract.noTrade,
      incentives: contract.incentives,
    }),
  });
  gameStore.resetFaProgress();
  seasonStore.resolvePendingAction("faMarket");
  await gameStore.save();
  await seasonStore.save();
}

/** 계약하지 않고 기다린다 — 미계약 주차가 쌓이면 제시 조건이 내려간다 */
export async function waitFaMarket(): Promise<void> {
  gameStore.incrementFaUnsignedWeek();
  gameStore.resetFaProgress();
  seasonStore.resolvePendingAction("faMarket");
  await gameStore.save();
  await seasonStore.save();
}

// ── 트레이드 통보 ────────────────────────────────────────────────
//
// ⚠ **이 로직은 `TradeModal.svelte` 안에 있었다.** 그래서 두 가지가 깨졌다.
//
//  1. `runAutoAdvance`가 `trade` pending을 "결과가 상태에 남지 않는 알림성"으로
//     분류해 **그냥 resolve했다.** 자동 진행 중 트레이드되면 통보만 사라지고
//     **팀은 그대로 남는다.** 계약 관련 pending들이 `STOP_PENDING`에 없어
//     조용히 버려지던 것과 같은 계열이다.
//  2. 화면 안에 있으면 회귀를 걸 수 없다 — 이번 조사에서 결함이 쏟아진
//     자리가 전부 "코드는 있는데 한 번도 안 돈 곳"이었다.
//
// 모달에는 표시와 버튼만 남는다.

export interface TradePendingAction {
  fromTeamId: string;
  toTeamId: string;
  toLeagueId?: string;
  receivedNpcId: string;
  receivedNpcName: string;
  tradeReason: string;
}

/** 트레이드 수락 — 팀 이동 + 경력 기록 + 리그 거래 기록 */
export async function acceptTrade(action: TradePendingAction): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const seasonYear = s.seasonYear;
  const slotId = g.currentSlotId;
  const leagueId = g.protagonist.leagueId;
  const toLeagueId = action.toLeagueId ?? leagueId;

  gameStore.applyTradeTransfer(action.toTeamId, toLeagueId);
  gameStore.addCareerEvent({
    year: seasonYear, eventType: "trade",
    fromTeamId: action.fromTeamId, fromLeagueId: leagueId,
    toTeamId: action.toTeamId, toLeagueId,
  });
  seasonStore.resolvePendingAction("trade");

  if (slotId) {
    const label = TRADE_REASON_LABEL[action.tradeReason] ?? action.tradeReason;
    const groupId = `trade-pro-${action.fromTeamId}-${action.toTeamId}-${seasonYear}`;
    await window.projectB!.leagueAddTransactions(JSON.stringify({
      slotId,
      rows: [
        {
          seasonYear, category: "trade",
          playerId: g.protagonist.id, playerName: g.protagonist.name,
          fromTeamId: action.fromTeamId, fromLeagueId: leagueId,
          toTeamId: action.toTeamId, toLeagueId: leagueId,
          detail: label, groupId,
        },
        {
          seasonYear, category: "trade",
          playerId: action.receivedNpcId, playerName: action.receivedNpcName,
          fromTeamId: action.toTeamId, fromLeagueId: leagueId,
          toTeamId: action.fromTeamId, toLeagueId: leagueId,
          detail: label, groupId,
        },
      ],
    }));
  }

  await gameStore.save();
  await seasonStore.save();
}

/** 트레이드 거부 — **노트레이드 조항이 있을 때만** 가능하다 */
export async function rejectTrade(): Promise<boolean> {
  if (!(get(gameStore).protagonist.contract?.noTrade ?? false)) return false;
  seasonStore.resolvePendingAction("trade");
  await seasonStore.save();
  return true;
}
