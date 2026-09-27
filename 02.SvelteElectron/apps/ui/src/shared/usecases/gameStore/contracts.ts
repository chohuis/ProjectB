// ── 계약·FA·트레이드 (스토어 덩이 3) ──────────────────────────
//
// 이 열한 함수는 `stores/game.ts` 의 store 메서드였다(253줄). 계약은 **세 곳이
// 같은 값을 적는** 자리다 — 체결 · 다음 계약 예약 · 그 예약을 실제로 적용.
// 그걸 store 안에 두면 「연차를 어디서 0 으로 만드는가」를 찾으려고 4,800줄을
// 훑어야 한다(`proServiceYearReset` 검사가 그 자리다).
//
// **옮긴 본문은 한 글자도 안 바뀌었다** — `this.` 호출이 **원래 0자리**고
// `_getSeasonData` 도 안 쓴다. 바뀐 것은 머리 두 줄뿐이다:
//   `name(…) {` → `export function name({ update }: ContractCtx, …) {`
//   닫는 `},` → `}`
// 첫 인자를 **풀어서 받는** 이유가 그것이다 — 그러면 본문의 `update(…)` 가
// 손댈 필요 없이 그대로 돈다.
//
// ⚠ 검사는 `gamePathSrc()` 가 이 파일을 `game.ts` 와 한 덩이로 읽는다.

import type { GameStoreState } from "../../stores/game";
import { shiftContract, type ContractStamp } from "../../utils/contractHistory";
import { incentiveKey } from "../../utils/contractTerms";
import type { ProContract, ProtagonistSave } from "../../types/save";
// 계약이 바뀌면 호환 객체 둘을 다시 만든다 — 정본은 game.ts 하나다
import { toPlayerCompat, toSchoolCompat } from "../../stores/game";

/**
 * 스토어가 건네는 손잡이.
 *
 * ⚠ 이 덩이는 store 메서드를 **하나도 안 부른다**(옮기기 전 `this.` 0자리) —
 *   그래서 `store` 칸이 없다. 부르게 되면 여기서 막힌다.
 */
export interface ContractCtx {
  update: (fn: (s: GameStoreState) => GameStoreState) => void;
}

export function signContract(
  { update }: ContractCtx,
  contract: ProContract,
  stamp: ContractStamp = {},
) {
  update((s) => {
    const shift = shiftContract(
      s.protagonist.contract,
      contract,
      stamp,
      s.protagonist.contractHistory,
    );
    const leagueStage =
      contract.leagueId === "LEAGUE_ABL"
        ? "pro_abl"
        : contract.leagueId === "LEAGUE_JBL"
          ? "pro_jbl"
          : contract.leagueId === "LEAGUE_INDEPENDENT"
            ? "independent"
            : "pro_kbl";
    const protagonist: ProtagonistSave = {
      ...s.protagonist,
      contract: { ...shift.contract, status: "active" },
      // 지나간 계약은 기록 탭 「계약 이력」이 읽는다 (§7-4). 소식은 밀려나도
      // 여기는 남는다 — 그게 이 필드가 있는 이유다
      contractHistory: shift.history,
      money: Math.max(0, s.protagonist.money + contract.signingBonus),
      careerStage: leagueStage,
      // 학년은 고교에서만 의미가 있다. `applyDraftDecision`은 이미 이렇게
      // 지우는데 여기만 빠져 있어서, 드래프트로 프로에 간 선수가
      // `grade: 3`을 달고 다녔다 — 시즌 종료 화면 헤더가 `p.grade`를 먼저
      // 보므로 프로 선수에게 "3학년"이 찍혔다
      grade: undefined,
      teamId: contract.teamId,
      leagueId: contract.leagueId,
      faNegotiationRound: 0,
      faUnsignedWeeks: 0,
      tradeAdaptationWeeks: 0,
      // 🔴 **팀을 옮겼다고 연차를 0으로 되돌리지 않는다.**
      //
      // 예전엔 `isNewTeam ? 0 : ...`이었다. 그런데 `isNewTeam`은 "프로에 처음
      // 들어왔다"가 아니라 **"팀이 바뀜다"**다 — FA 이적·트레이드·
      // 2군 이동으로 `teamId`가 바뀔 때마다 연차가 사라졌다.
      // 실측(씨앗 424242 · 12시즌): 연차 **4 → 0**으로 리셋됐다.
      // 그러면 FA 자격(5년)에 영영 못 닿고 은퇴 판정도 어긋난다.
      //
      // ⚠ 프로 등록일수는 리그 전체 기준이다. 신인은 어차피 이 값이 0이라
      //   따로 리셋할 이유가 없다.
      proServiceYears: s.protagonist.proServiceYears,
    };
    return {
      ...s,
      protagonist,
      player: toPlayerCompat(protagonist),
      school: toSchoolCompat(protagonist.careerStage, s.schoolState),
    };
  });
}

export function setPendingNextContract(
  { update }: ContractCtx,
  contract: ProContract,
  stamp: ContractStamp = {},
) {
  update((s) => {
    // 🔴 **여기서 옛 계약을 밀지 않는다.** 서명은 오프시즌이고 옛 계약은
    //    W52 까지 살아 있다 — 지금 밀면 「계약 정보」가 빈 채로 한 달이
    //    지나간다. 이력은 `applyPendingNextContract` 가 넘길 때 쌓는다.
    //    찍는 것(연도·종류)은 지금 해야 한다 — 그때는 몇 년에 서명했는지
    //    모른다.
    const shift = shiftContract(undefined, contract, stamp);
    const leagueStage =
      contract.leagueId === "LEAGUE_ABL"
        ? "pro_abl"
        : contract.leagueId === "LEAGUE_JBL"
          ? "pro_jbl"
          : contract.leagueId === "LEAGUE_INDEPENDENT"
            ? "independent"
            : "pro_kbl";
    const protagonist: ProtagonistSave = {
      ...s.protagonist,
      pendingNextContract: { ...shift.contract, status: "active" },
      careerStage: leagueStage,
      teamId: contract.teamId,
      leagueId: contract.leagueId,
      money: Math.max(0, s.protagonist.money + contract.signingBonus),
      faNegotiationRound: 0,
      faUnsignedWeeks: 0,
      // 🔴 **팀을 옮겼다고 연차를 0으로 되돌리지 않는다.**
      //
      // 예전엔 `isNewTeam ? 0 : ...`이었다. 그런데 `isNewTeam`은 "프로에 처음
      // 들어왔다"가 아니라 **"팀이 바뀜다"**다 — FA 이적·트레이드·
      // 2군 이동으로 `teamId`가 바뀔 때마다 연차가 사라졌다.
      // 실측(씨앗 424242 · 12시즌): 연차 **4 → 0**으로 리셋됐다.
      // 그러면 FA 자격(5년)에 영영 못 닿고 은퇴 판정도 어긋난다.
      //
      // ⚠ 프로 등록일수는 리그 전체 기준이다. 신인은 어차피 이 값이 0이라
      //   따로 리셋할 이유가 없다.
      proServiceYears: s.protagonist.proServiceYears,
    };
    return {
      ...s,
      protagonist,
      player: toPlayerCompat(protagonist),
      school: toSchoolCompat(protagonist.careerStage, s.schoolState),
    };
  });
}

export function applyPendingNextContract({ update }: ContractCtx) {
  update((s) => {
    const pending = s.protagonist.pendingNextContract;
    if (!pending) return s;
    // 옛 계약이 자리를 내주는 순간이 여기다 — 재계약·FA 가 이 길로 온다
    const shift = shiftContract(s.protagonist.contract, pending, {}, s.protagonist.contractHistory);
    const protagonist: ProtagonistSave = {
      ...s.protagonist,
      contract: shift.contract,
      contractHistory: shift.history,
      pendingNextContract: undefined,
    };
    return { ...s, protagonist, player: toPlayerCompat(protagonist) };
  });
}

export function applyTradeTransfer({ update }: ContractCtx, toTeamId: string, toLeagueId?: string) {
  update((s) => {
    const current = s.protagonist.contract;
    const newLeagueId = toLeagueId ?? s.protagonist.leagueId;
    const leagueStage: import("../../types/save").CareerStage =
      newLeagueId === "LEAGUE_ABL"
        ? "pro_abl"
        : newLeagueId === "LEAGUE_JBL"
          ? "pro_jbl"
          : newLeagueId === "LEAGUE_INDEPENDENT"
            ? "independent"
            : "pro_kbl";
    const protagonist: ProtagonistSave = {
      ...s.protagonist,
      teamId: toTeamId,
      leagueId: newLeagueId,
      careerStage: leagueStage,
      tradeAdaptationWeeks: 3,
      contract: current ? { ...current, teamId: toTeamId, leagueId: newLeagueId } : current,
    };
    return {
      ...s,
      protagonist,
      player: toPlayerCompat(protagonist),
      logs: [`트레이드 이적: ${toTeamId}`, ...s.logs].slice(0, 30),
    };
  });
}

export function markIncentivesSettled(
  { update }: ContractCtx,
  seasonYear: number,
  keys: readonly string[],
) {
  if (keys.length === 0) return;
  const set = new Set(keys);
  update((s) => {
    const c = s.protagonist.contract;
    if (!c?.incentives?.length) return s;
    return {
      ...s,
      protagonist: {
        ...s.protagonist,
        contract: {
          ...c,
          incentives: c.incentives.map((i) => {
            if (!set.has(incentiveKey(i))) return i;
            const paid = i.paidSeasons ?? [];
            if (paid.includes(seasonYear)) return i;
            return { ...i, paidSeasons: [...paid, seasonYear] };
          }),
        },
      },
    };
  });
}

export function applySeasonContractProgress({ update }: ContractCtx) {
  update((s) => {
    const current = s.protagonist.contract;
    if (!current) return s;
    const remainingYears = Math.max(0, current.remainingYears - 1);
    const status = remainingYears > 0 ? "active" : "expired";
    return {
      ...s,
      protagonist: {
        ...s.protagonist,
        contract: {
          ...current,
          remainingYears,
          status,
        },
      },
    };
  });
}

export function incrementFaNegotiationRound({ update }: ContractCtx) {
  update((s) => ({
    ...s,
    protagonist: {
      ...s.protagonist,
      faNegotiationRound: Math.min(2, (s.protagonist.faNegotiationRound ?? 0) + 1),
    },
  }));
}

export function incrementFaUnsignedWeek({ update }: ContractCtx) {
  update((s) => ({
    ...s,
    protagonist: {
      ...s.protagonist,
      faUnsignedWeeks: (s.protagonist.faUnsignedWeeks ?? 0) + 1,
    },
  }));
}

export function resetFaProgress({ update }: ContractCtx) {
  update((s) => ({
    ...s,
    protagonist: {
      ...s.protagonist,
      faNegotiationRound: 0,
      faUnsignedWeeks: 0,
    },
  }));
}

export function advanceTradeAdaptationWeek({ update }: ContractCtx) {
  update((s) => ({
    ...s,
    protagonist: {
      ...s.protagonist,
      tradeAdaptationWeeks: Math.max(0, (s.protagonist.tradeAdaptationWeeks ?? 0) - 1),
    },
  }));
}

export function applyOptionResult(
  { update }: ContractCtx,
  payload: {
    exercised: boolean;
    nextSalary: number;
    optionType: "team" | "player";
  },
) {
  update((s) => {
    const current = s.protagonist.contract;
    if (!current) return s;
    if (!payload.exercised) {
      return {
        ...s,
        protagonist: {
          ...s.protagonist,
          contract: {
            ...current,
            status: "expired",
          },
        },
      };
    }
    return {
      ...s,
      protagonist: {
        ...s.protagonist,
        contract: {
          ...current,
          salary: payload.nextSalary,
          remainingYears: 1,
          status: "active",
          teamOptionYears:
            payload.optionType === "team"
              ? Math.max(0, current.teamOptionYears - 1)
              : current.teamOptionYears,
          playerOptionYears:
            payload.optionType === "player"
              ? Math.max(0, current.playerOptionYears - 1)
              : current.playerOptionYears,
        },
      },
    };
  });
}
