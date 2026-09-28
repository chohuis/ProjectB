// ── 병역 (스토어 덩이 4) ──────────────────────────────────────
//
// 이 열한 함수는 `stores/game.ts` 의 store 메서드였다(206줄). 병역은 **입대 ·
// 복무 · 전역 · 면제 · 회복**이 서로 다른 칸을 적으면서도 순서가 묶여 있는
// 자리다 — 그걸 store 안에 두면 「전역이 어느 칸을 되돌리는가」를 찾으려고
// 파일 하나를 통째로 훑어야 한다(`militaryOnce`·`militaryLeagueId` 검사가 그 자리다).
//
// **옮긴 본문은 한 글자도 안 바뀌었다** — `this.` 호출이 열한 함수 모두
// **0자리**고 `get(…)`·`_getSeasonData` 도 안 쓴다. 바뀐 것은 머리·꼬리 두 줄뿐:
//   `name(…) {` → `export function name({ update }: MilitaryStoreCtx, …) {`
//   닫는 `},` → `}`
// 첫 인자를 **풀어서 받는** 이유가 그것이다 — 본문의 `update(…)` 가 그대로 돈다.
//
// ⚠ 이름이 `militaryLife.ts`(주간 진행)·`militaryDecision.ts`(진로)와 겹치지
//   않게 파일을 `gameStore/` 아래 뒀다. 이 파일은 **상태를 적는 몫만** 진다.
// ⚠ 검사는 `gamePathSrc()` 가 이 파일을 `game.ts` 와 한 덩이로 읽는다.

import type { GameStoreState } from "../../stores/game";
import { MILITARY_RESULT_WEEK } from "../../utils/seasonWeeks";
import type { ProtagonistSave } from "../../types/save";
// 병역이 바뀌면 호환 객체 둘을 다시 만든다 — 정본은 game.ts 하나다
import { toPlayerCompat, toSchoolCompat } from "../../stores/game";

/**
 * 스토어가 건네는 손잡이.
 *
 * ⚠ 이 덩이는 store 메서드를 **하나도 안 부른다**(옮기기 전 `this.` 0자리) —
 *   그래서 `store` 칸이 없다. 부르게 되면 여기서 막힌다.
 */
export interface MilitaryStoreCtx {
  update: (fn: (s: GameStoreState) => GameStoreState) => void;
}

export function grantMilitaryExemption(
  { update }: MilitaryStoreCtx,
  npcIds: string[],
  seasonYear: number,
  tournamentName: string,
) {
  const target = new Set(npcIds);
  update((s) => {
    const npcs = s.npcs.map((n) => {
      if (!target.has(n.npcId) || n.militaryStatus !== "미필") return n;
      return {
        ...n,
        militaryStatus: "면제" as const,
        careerEvents: [
          ...(n.careerEvents ?? []),
          {
            year: seasonYear,
            eventType: "military_exempt" as const,
            detail: `${tournamentName} 입상`,
          },
        ],
      };
    });
    // ⚠ **주인공만 커리어 이벤트가 없었다.** NPC는 `military_exempt`를
    // 남기는데 주인공은 `militaryStatus`만 바뀌어서, 연도별 인생 기록에
    // "아시안게임 우승 → 병역 면제"가 **한 줄도 안 떴다.**
    // 국제대회 입상은 병역을 벗어나는 두 길 중 하나다 — 커리어의 분기점인데
    // 기록에 없으면 플레이어가 무슨 일이 있었는지 되짚을 수 없다.
    const protoExempt = target.has(s.protagonist.id) && s.protagonist.militaryStatus === "미필";
    const proto = protoExempt
      ? {
          ...s.protagonist,
          militaryStatus: "면제" as const,
          careerEvents: [
            ...(s.protagonist.careerEvents ?? []),
            {
              year: seasonYear,
              eventType: "military_exempt" as const,
              detail: `${tournamentName} 입상`,
            },
          ],
        }
      : s.protagonist;
    return { ...s, npcs, protagonist: proto };
  });
}

export function addMilitaryDeferPenalty({ update }: MilitaryStoreCtx, points: number) {
  update((s) => ({
    ...s,
    protagonist: {
      ...s.protagonist,
      militaryDeferPenalty: (s.protagonist.militaryDeferPenalty ?? 0) + points,
    },
  }));
}

export function setSportsUnitApplied({ update }: MilitaryStoreCtx, flag: boolean) {
  update((s) => ({
    ...s,
    protagonist: { ...s.protagonist, sportsUnitApplied: flag },
  }));
}

export function markSportsUnitPrompted({ update }: MilitaryStoreCtx, seasonYear: number) {
  update((s) => ({
    ...s,
    protagonist: { ...s.protagonist, sportsUnitPromptedYear: seasonYear },
  }));
}

export function markMilitaryAsked({ update }: MilitaryStoreCtx, seasonYear: number) {
  update((s) => ({
    ...s,
    protagonist: { ...s.protagonist, militaryAskedYear: seasonYear },
  }));
}

export function enlistMilitary(
  { update }: MilitaryStoreCtx,
  unit: "sports" | "general",
  enlistWeek = MILITARY_RESULT_WEEK,
  sportsUnitSelected = false,
  enlistYear?: number,
) {
  update((s) => {
    const now = s.protagonist;
    const isPro =
      now.careerStage === "pro_kbl" ||
      now.careerStage === "pro_abl" ||
      now.careerStage === "pro_jbl" ||
      now.careerStage === "independent";
    // 유효한 계약(잔여 > 0)만 군 복무 기간만큼 연장; 만료된 계약은 연장 없이 전역 후 FA/재계약
    const extendedContract =
      isPro && now.contract && now.contract.remainingYears > 0
        ? { ...now.contract, remainingYears: now.contract.remainingYears + 2 }
        : now.contract;
    // ⚠ **미필만 입대한다.** 화면 가드만 두면 다른 호출부(헤드리스·
    // 이벤트)가 그대로 통과한다 — 실제로 조사에서 군 복무를 세 번 하는
    // 커리어가 나왔다. 되돌릴 수 없는 상태 전이라 여기서도 막는다.
    if (now.militaryStatus !== "미필") return s;

    const protagonist: ProtagonistSave = {
      ...now,
      careerStage: "military",
      // 🔴 **소속 리그도 군으로 옮긴다** (2026-09-02).
      //
      // 예전엔 단계만 바꾸고 `leagueId` 는 입대 전 것을 그대로 뒀다.
      // 배경 시뮬은 `lid === 주인공.leagueId` 를 건너뛰므로, 학생 입대자는
      // 복무 2년 내내 **고교 리그가 통째로 멈췄고**(실측 `HIGHSCHOOL 1020/0`),
      // 프로 입대자면 **그 프로 리그가 멈춘다.** 소속은 NPC 처럼
      // `LEAGUE_MILITARY` 다(AUDIT_STAGES §8). 원래 리그는 전역 때
      // 복구 단계(`militaryHiatusStage`)에서 되돌린다.
      leagueId: "LEAGUE_MILITARY",
      militaryUnit: unit,
      militaryServiceWeeks: 0,
      militaryRecoveryWeeks: 0,
      militaryStatus: "현역",
      militaryEnlistWeek: enlistWeek,
      militaryEnlistYear: enlistYear ?? null,
      militaryDischargeYear: enlistYear != null ? enlistYear + 2 : null,
      militaryHiatusStage: now.careerStage,
      sportsUnitSelected,
      contract: extendedContract,
    };
    return {
      ...s,
      protagonist,
      player: toPlayerCompat(protagonist),
      school: toSchoolCompat(protagonist.careerStage, s.schoolState),
    };
  });
}

export function applyMilitaryDischarge(
  { update }: MilitaryStoreCtx,
  args: {
    statDelta: number;
    velocityDelta: number;
    recoveryWeeks: number;
    record: import("../../types/militaryLife").MilitaryRecord;
  },
) {
  update((s) => {
    const p = s.protagonist;
    const c99 = (v: number) => Math.max(1, Math.min(99, v));
    const pitching = {
      ...p.pitching,
      command: c99(p.pitching.command + args.statDelta),
      control: c99(p.pitching.control + args.statDelta),
      recovery: c99(p.pitching.recovery + args.statDelta),
      velocity: c99(p.pitching.velocity + args.velocityDelta),
    };
    const protagonist: ProtagonistSave = {
      ...p,
      pitching,
      militaryRecoveryWeeks: args.recoveryWeeks,
      militaryLife: null,
      militaryRecord: args.record,
    };
    return { ...s, protagonist, player: toPlayerCompat(protagonist) };
  });
}

export function setMilitaryLife(
  { update }: MilitaryStoreCtx,
  next: import("../../types/militaryLife").MilitaryLifeState | null,
) {
  update((s) => {
    const protagonist = { ...s.protagonist, militaryLife: next };
    return { ...s, protagonist, player: toPlayerCompat(protagonist) };
  });
}

export function advanceMilitaryWeek({ update }: MilitaryStoreCtx) {
  update((s) => ({
    ...s,
    protagonist: {
      ...s.protagonist,
      militaryServiceWeeks: s.protagonist.militaryServiceWeeks + 1,
    },
  }));
}

export function completeMilitaryService(
  { update }: MilitaryStoreCtx,
  at?: { season: number; week: number },
) {
  update((s) => {
    const p = s.protagonist;
    // 휴학 단계 복구: militaryHiatusStage 우선, 없으면 leagueId 기반.
    //
    // ⚠ **학교로는 돌아가지 않는다.** 고교·대학에서 입대하면 hiatusStage가
    // 그 학적이라 그대로 복구했는데, 그러면 2년 복무한 21세가 고등학교로
    // 돌아간다(실측). `careerTransition`이 "고교 재입학 불가"를 이미
    // 명시하고 있고, 전이표에서도 학교로 가는 화살표는 없다.
    // 학생 신분에서 입대했으면 갈 곳은 독립리그다.
    const hiatus = p.militaryHiatusStage as import("../../types/save").CareerStage | null;
    const restored = hiatus === "highschool" || hiatus === "university" ? null : hiatus;
    const stage: import("../../types/save").CareerStage =
      restored ??
      (p.leagueId === "LEAGUE_ABL"
        ? "pro_abl"
        : p.leagueId === "LEAGUE_JBL"
          ? "pro_jbl"
          : p.leagueId === "LEAGUE_KBL"
            ? "pro_kbl"
            : "independent");
    const protagonist: ProtagonistSave = {
      ...p,
      careerStage: stage,
      // 입대 때 `LEAGUE_MILITARY` 로 옮겼으니 여기서 되돌린다 — 단계가
      // 정본이고 리그는 그 파생이다. 학생 출신은 독립으로 간다(위 주석).
      // ⚠ 독립의 **팀**은 `dischargeProtagonist` 가 정한다 — 여기는 리그만.
      leagueId:
        stage === "pro_abl"
          ? "LEAGUE_ABL"
          : stage === "pro_jbl"
            ? "LEAGUE_JBL"
            : stage === "pro_kbl"
              ? "LEAGUE_KBL"
              : "LEAGUE_INDEPENDENT",
      // ⚠ **다녀온 부대는 남긴다.** 지우면 전역 후 상무/현역 구분이 사라져
      // 선수 상세·인생 기록에 표시할 수 없다 (NPC 쪽도 같이 고쳤다)
      militaryServedUnit: p.militaryUnit ?? p.militaryServedUnit,
      militaryUnit: null,
      militaryServiceWeeks: 0,
      militaryRecoveryWeeks: p.militaryUnit === "sports" ? 2 : 6,
      militaryStatus: "군필",
      // 전역 뒤 경과를 재는 유일한 기준점 (B-20 §30). `militaryRecoveryWeeks` 는
      // 0에서 멈춰 그 뒤를 못 센다
      dischargedSeason: at?.season ?? p.dischargedSeason,
      dischargedWeek: at?.week ?? p.dischargedWeek,
      militaryHiatusStage: null,
      // 학년은 학생일 때만 의미가 있다. 전역자는 학교로 안 돌아가므로
      // 지운다 — 안 그러면 독립리그 선수가 `grade: 3`을 달고 다니고
      // 시즌 종료 화면 헤더가 그걸 먼저 읽어 "3학년"이 찍힌다
      // (`signContract`·`applyDraftDecision`이 이미 같은 이유로 지운다)
      grade: undefined,
    };
    return {
      ...s,
      protagonist,
      player: toPlayerCompat(protagonist),
      school: toSchoolCompat(protagonist.careerStage, s.schoolState),
    };
  });
}

export function advanceMilitaryRecoveryWeek({ update }: MilitaryStoreCtx) {
  update((s) => ({
    ...s,
    protagonist: {
      ...s.protagonist,
      militaryRecoveryWeeks: Math.max(0, (s.protagonist.militaryRecoveryWeeks ?? 0) - 1),
    },
  }));
}
