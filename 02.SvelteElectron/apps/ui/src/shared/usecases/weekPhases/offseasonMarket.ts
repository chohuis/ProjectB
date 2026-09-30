/**
 * **계약·시장 — 트레이드 윈도우 · 오프시즌 · 연봉협상 · FA** (2026-09-30 · Ⅱ-1).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `advanceWeek.ts` 의
 *   `processWeekBoundary` 안에 있던 「프로 트레이드 윈도우」와 「오프시즌
 *   이벤트」 두 절이 그대로 나왔다. 블록 경계는 옮기기 전 파일의 주석 절을
 *   그대로 따랐다.
 *
 * 🔴 **끝내는 신호가 하나 있다.** 은퇴 권고가 뜨면 옮기기 전에는 그 자리에서
 *   `return logs` 로 주간 진행을 끝냈다. 함수로 나오면서 그걸 **참(true)** 으로
 *   돌려주고, 부르는 자리가 `return logs` 한다 — 안 받으면 은퇴 권고가 떠도
 *   주가 그대로 흘러간다. 그래서 대조군이 그 줄을 글자로 본다
 *   (`__tests__/offseasonMarketWeekBlock.test.ts`).
 *
 * ⚠ **바깥에서 받는 것은 넷뿐이다** — 주차 둘 · 마스터 스냅샷 · 로그 배열.
 *   `gOff`·`sOff` 는 옮기기 전에도 이 자리에서 새로 읽었다(`get(gameStore)`).
 *   `logs` 는 **참조로** 받아 같은 배열에 쌓인다.
 *
 * ⚠ 검사는 주간 진행 경로를 **한 덩이로** 읽으므로(`__tests__/weekPathSrc.ts`)
 *   검사 문장은 한 글자도 안 바뀌었다.
 */
import { get } from "svelte/store";
import { gameStore } from "../../stores/game";
import { seasonStore } from "../../stores/season";
import type { MasterState } from "../../stores/master";
import { autoLog } from "../../stores/autoAdvance";
import {
  TRADE_DEADLINE_WEEK,
  INDIE_SEASON_REVIEW_WEEK,
  OFFSEASON_START_WEEK,
  STOVE_LEAGUE_WEEK,
  FA_RETRY_START_WEEK,
  FA_RETRY_END_WEEK,
  SPORTS_UNIT_CANDIDATES_WEEK,
  WEEKS_PER_SEASON,
} from "../../utils/seasonWeeks";
import { activeProLeagues } from "../../utils/ids";
import { staffModsOf } from "../../utils/staffEffects";
import { calcOfferedSalaryForProtagonist, calcSeasonRating } from "../../utils/salaryEngine";
import { isFaEligible } from "../../utils/faEngine";
import { evalRetirementPressure, ovrTrendOf, calcMarketValueForProtagonist } from "../retirement";
import { pitcherSeasonTableMeta } from "../../utils/dashboardMeta";
import {
  processTradeWindow,
  processWinNowPressureUpdate,
  processOffseasonNpcDecisions,
  getTeamProfile,
  DEFAULT_TEAM_PROFILE,
} from "./market";
import type { PendingAction } from "../../types/season";

/** 옮기기 전 지역 변수를 그대로 담은 인자 묶음 — 이름이 본문과 같아야 한다 */
export interface OffseasonMarketArgs {
  weekNum: number;
  weekInYear: number;
  m: MasterState;
  /** 주간 로그 — **참조로 받는다.** 옮기기 전과 같은 배열에 쌓여야 한다 */
  logs: string[];
}

/**
 * @returns 참이면 **이 주에서 주간 진행을 끝낸다**(은퇴 권고). 옮기기 전
 *   `return logs` 가 있던 자리 하나에 대응한다.
 */
export async function runOffseasonMarketWeek({
  weekNum,
  weekInYear,
  m,
  logs,
}: OffseasonMarketArgs): Promise<boolean> {
  // 프로 트레이드 윈도우 — 연 2회(시즌 중 데드라인 + 스토브리그)
  //
  // 🔴 **예전엔 주인공 리그에서만 돌았다.** 리그 셋을 손으로 적고
  // `proLeagueIds.includes(myLeague)`로 걸러서, 주인공이 고교·대학에 있는
  // 동안(최대 7년) **프로 트레이드가 한 건도 안 났다.**
  //
  // 실측(고교 주인공 3시즌): 진행 중 트레이드 0건 · 같은 기간 FA 115건.
  // "트레이드 5건"으로 보이던 건 전부 **FA 보상선수**였다(W39·detail이 증거).
  // 로스터가 FA로만 움직이고 트레이드로는 안 움직이는 한쪽만 도는 상태였다.
  //
  // ⚠ **리그를 손으로 적지 않는다** — CLAUDE.md: "프로 운영에 리그를 직접
  // 적지 말 것". `activeProLeagues()`가 정본이라 `releaseScope`로 해외를
  // 닫으면 여기서도 자동으로 빠진다.
  if (weekInYear === TRADE_DEADLINE_WEEK || weekInYear === STOVE_LEAGUE_WEEK) {
    // 리그별로 돈다 — `processTradeWindow`가 리그 하나를 받는다.
    // 순차로 부르는 건 안쪽이 gameStore를 읽고 쓰기 때문이다(동시에 돌리면 덮어쓴다)
    for (const lid of activeProLeagues()) {
      await processTradeWindow(weekInYear, lid);
    }
  }

  // ── 오프시즌 이벤트 ─────────────────────────────────────────────
  {
    const gOff = get(gameStore);
    const sOff = get(seasonStore);
    const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(gOff.protagonist.careerStage);

    // 독립리그 시즌 종료 총평 메시지
    if (gOff.protagonist.careerStage === "independent" && weekInYear === INDIE_SEASON_REVIEW_WEEK) {
      gameStore.addMessage({
        id: `msg-indie-season-end-${sOff.seasonYear}`,
        category: "system",
        sender: "리그 사무국",
        subject: `${sOff.seasonYear} 독립리그 시즌 종료`,
        preview: "시즌이 종료되었습니다. 진로 신청을 진행하세요.",
        body: "독립리그 시즌이 종료되었습니다.\n드래프트 신청, 독립리그 재계약, 군입대 중 진로를 선택할 수 있습니다.\nW47에 최종 결과가 발표됩니다.",
        createdAt: `W${weekNum}`,
        readAt: null,
        // 시즌 성적을 표로도 싣는다 (PLAN_MESSAGE_DASHBOARDS §1-1).
        // ⚠ 본문엔 성적이 아예 없었다 — 표가 새로 보여주는 자리다
        metadata: pitcherSeasonTableMeta(
          "seasonEndIndie",
          sOff.stats[gOff.protagonist.id]?.type === "pitcher"
            ? (sOff.stats[gOff.protagonist.id] as import("../../types/save").PitcherSeasonStats)
            : undefined,
        ),
      });
    }

    // 팀 Win-Now 압박 업데이트 (오프시즌 시작)
    if (isProStage && weekInYear === OFFSEASON_START_WEEK) {
      processWinNowPressureUpdate(weekNum).catch((e) => autoLog(`[WinNow압박오류] ${e}`));
    }

    // 프로 시즌 총평 메시지
    if (isProStage && weekInYear === OFFSEASON_START_WEEK) {
      // ⚠ 여기는 **투수 전용**이다 — 바로 아래가 era·w·l 을 읽는다.
      //   타자를 넓히면 그 줄이 깨진다. 계약 쪽(1160·1245)만 넓혔다.
      const myStats =
        (sOff.stats[gOff.protagonist.id] as import("../../types/save").PitcherSeasonStats | null) ??
        null;
      const statSummary = myStats
        ? `ERA ${myStats.era?.toFixed(2) ?? "-"} / ${myStats.w ?? 0}승 ${myStats.l ?? 0}패 / ${myStats.k ?? 0}K`
        : "시즌 기록 없음";
      gameStore.addMessage({
        id: `msg-pro-season-end-${sOff.seasonYear}`,
        category: "system",
        sender: "코칭스태프",
        subject: `${sOff.seasonYear} 시즌 종료 — 오프시즌 시작`,
        preview: `시즌 성적: ${statSummary}`,
        body: [
          `${sOff.seasonYear} 시즌이 종료되었습니다.`,
          `시즌 성적: ${statSummary}`,
          "",
          // 같은 형태 — 주차를 글자로 적어 상수가 옮겨진 뒤 문안만 옛 값에 남아 있었다
          // (W43 → STOVE_LEAGUE_WEEK 39 · W50 → SPORTS_UNIT_CANDIDATES_WEEK 46)
          `W${STOVE_LEAGUE_WEEK}부터 연봉협상 및 FA 시장이 열립니다.`,
          `W${SPORTS_UNIT_CANDIDATES_WEEK} 체육부대 신청, W${WEEKS_PER_SEASON} 새 시즌 시작.`,
        ].join("\n"),
        createdAt: `W${weekNum}`,
        readAt: null,
        // 한 줄에 여섯 값이 뭉쳐 있던 자리를 표로 갈라 싣는다
        // (PLAN_MESSAGE_DASHBOARDS §1-1). 본문 줄은 그대로 둔다.
        // ⚠ **지난해 열은 안 보낸다.** `CareerRecord.statLine` 이 이미 굳은
        //   문자열이라 숫자로 못 쪼갠다 — 없으면 그 열을 아예 안 그린다
        metadata: pitcherSeasonTableMeta("seasonEndPro", myStats ?? undefined),
      });
    }

    // NPC 은퇴/FA 결정 — 플레이어 단계 무관하게 배경 프로리그 NPC 처리
    if (weekInYear === STOVE_LEAGUE_WEEK) {
      const offseasonLogs = await processOffseasonNpcDecisions(weekNum);
      logs.push(...offseasonLogs);
    }

    // 프로 연봉협상 1차 + FA 시장 오픈
    if (isProStage && weekInYear === STOVE_LEAGUE_WEEK) {
      const contract = gOff.protagonist.contract;
      const hasPending = sOff.pendingActions.some(
        (a) => a.type === "salaryNegotiation" || a.type === "faMarket" || a.type === "optionClause",
      );
      const hasPendingNext = !!gOff.protagonist.pendingNextContract;
      // 지갑을 여는 구단주면 오퍼가 후하다 (§7-5 F-1). 주인공 소속팀 기준
      const offSeasonBudgetMod = (): number =>
        staffModsOf(gOff.protagonist.teamId ?? "", m.entities).budget;

      // applySeasonContractProgress()는 W52(SeasonEndModal)에서 호출 — 여기서는 미리 체크만
      // 이번 시즌 종료 후 계약이 만료되는지 확인 (remainingYears === 1 → 감산 후 0)
      if (!hasPending && !hasPendingNext && contract) {
        const myStats = (sOff.stats[gOff.protagonist.id] ?? null) as
          | import("../../types/save").PitcherSeasonStats
          | import("../../types/save").BatterSeasonStats
          | null;

        // ── 노쇠·방출 압박 판정 ──────────────────────────────────
        //
        // ⚠ **계약이 끝나는 해마다 여기를 지난다.** 예전엔 이 판정이
        // `remainingYears <= 0` 가지에만 있었는데, 바로 위 `=== 1` 가지가
        // 나이·성적과 무관하게 **매번 재계약 오퍼를 만들어서** 거기 도달할
        // 일이 없었다. 실측: 25시즌(2026→2051, 42세)을 완주하고도 은퇴 0건.
        //
        // 판정은 NPC와 같은 엔진이다 — 주인공 전용 기준을 만들면 "NPC는 38세에
        // 은퇴하는데 나는 45세까지 뛴다"가 되고, 그걸 맞추려고 표를 두 번 관리하게 된다.
        // 결과를 강제하지는 않는다: 제안하고 선택은 플레이어가 한다.
        if (contract.remainingYears <= 1) {
          const trend = ovrTrendOf(gOff.protagonist);
          const mv = await calcMarketValueForProtagonist(gOff.protagonist);
          const pressure = await evalRetirementPressure(trend, mv);
          // 계측 — 은퇴 판정이 실제로 무엇을 돌려주는지 본다(C-1).
          // ⚠ 지우지 마라: "매번 재계약 오퍼를 만들어 거기 도달할 일이 없었다"가
          //   고쳐졌다고 적혀 있는데 증상이 그대로다. 값을 봐야 갈린다.
          if (
            typeof globalThis !== "undefined" &&
            (globalThis as Record<string, unknown>).__PB_RETIRE_LOG
          ) {
            console.log(
              "[은퇴판정] " +
                gOff.protagonist.age +
                "세 trend=" +
                trend.toFixed(2) +
                " mv=" +
                mv +
                " remain=" +
                contract.remainingYears +
                " suggest=" +
                pressure.suggest +
                " urgency=" +
                pressure.urgency,
            );
          }
          if (pressure.suggest) {
            seasonStore.pushPendingAction({
              type: "retirementAsk",
              urgency: pressure.urgency,
              reason: "decline",
            });
            logs.push("은퇴 권고 — 계약이 끝났고 구단이 다시 부르지 않는다");
            return true;
          }
        }

        if (contract.remainingYears === 1) {
          // 이번 시즌 마지막 계약 연도 — 만료 예정
          const offeredSalary = await calcOfferedSalaryForProtagonist(
            gOff.protagonist,
            myStats,
            offSeasonBudgetMod(),
          );
          if (contract.teamOptionYears > 0) {
            const seasonRating = await calcSeasonRating(myStats);
            const profile = getTeamProfile(gOff.protagonist.teamId, gOff) ?? DEFAULT_TEAM_PROFILE;
            // winNowPressure: 0→기준75, 50→63, 100→50 (공격적 팀은 낮은 기준에도 행사)
            const threshold = 75 - Math.round((profile.winNowPressure / 100) * 25);
            const exercised = seasonRating >= threshold;
            const action: PendingAction = {
              type: "optionClause",
              optionType: "team",
              exercised,
              nextSalary: offeredSalary,
            };
            seasonStore.pushPendingAction(action);
          } else if (contract.playerOptionYears > 0) {
            const action: PendingAction = {
              type: "optionClause",
              optionType: "player",
              exercised: false,
              nextSalary: offeredSalary,
            };
            seasonStore.pushPendingAction(action);
          } else if (isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)) {
            seasonStore.pushPendingAction({ type: "faMarket" });
          } else {
            seasonStore.pushPendingAction({
              type: "salaryNegotiation",
              teamId: contract.teamId,
              leagueId: contract.leagueId,
              offeredSalary,
              durationYears: 1,
              minDurationYears: 1,
              maxDurationYears: 3,
              signingBonus: 0,
              context: "renewal",
            });
          }
        } else if (contract.remainingYears <= 0) {
          // 계약이 이미 끝나 있다 (이례적 — 위 압박 판정을 이미 지났다).
          // 갈 곳을 찾아준다
          if (isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)) {
            seasonStore.pushPendingAction({ type: "faMarket" });
          } else {
            const offeredSalary = await calcOfferedSalaryForProtagonist(
              gOff.protagonist,
              myStats,
              offSeasonBudgetMod(),
            );
            seasonStore.pushPendingAction({
              type: "salaryNegotiation",
              teamId: gOff.protagonist.teamId,
              leagueId: gOff.protagonist.leagueId,
              offeredSalary,
              durationYears: 1,
              minDurationYears: 1,
              maxDurationYears: 3,
              signingBonus: 0,
              context: "renewal",
            });
          }
        }
        // remainingYears > 1: 계약 기간 중 — 아무것도 하지 않음
      } else if (!contract && !hasPending && !hasPendingNext) {
        // 계약 자체 없음 (이례적)
        const myStats = (sOff.stats[gOff.protagonist.id] ?? null) as
          | import("../../types/save").PitcherSeasonStats
          | import("../../types/save").BatterSeasonStats
          | null;
        if (isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)) {
          seasonStore.pushPendingAction({ type: "faMarket" });
        } else {
          const offeredSalary = await calcOfferedSalaryForProtagonist(
            gOff.protagonist,
            myStats,
            offSeasonBudgetMod(),
          );
          seasonStore.pushPendingAction({
            type: "salaryNegotiation",
            teamId: gOff.protagonist.teamId,
            leagueId: gOff.protagonist.leagueId,
            offeredSalary,
            durationYears: 1,
            minDurationYears: 1,
            maxDurationYears: 3,
            signingBonus: 0,
            context: "renewal",
          });
        }
      }
    }

    // FA 미계약자 매주 재트리거
    if (isProStage && weekInYear >= FA_RETRY_START_WEEK && weekInYear <= FA_RETRY_END_WEEK) {
      const hasFaPending = sOff.pendingActions.some((a) => a.type === "faMarket");
      const hasPendingNext = !!gOff.protagonist.pendingNextContract;
      const isUnsignedFa =
        !gOff.protagonist.contract &&
        !hasPendingNext &&
        !hasFaPending &&
        isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity);
      if (isUnsignedFa) {
        gameStore.incrementFaUnsignedWeek();
        seasonStore.pushPendingAction({ type: "faMarket" });
      }
    }
  }

  return false;
}
