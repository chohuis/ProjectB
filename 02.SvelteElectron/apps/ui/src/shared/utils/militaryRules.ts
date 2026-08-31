// ── 병역 규칙 파생값 ─────────────────────────────────────────────
//
// ⚠ **같은 계산이 두 곳에 있었고 서로 달랐다.**
//
// NPC 경로(`stores/game.ts`)는 규칙 파일에서 `rosterSize / 복무연수`
// (26/2 = 13)를 뽑는데, **주인공 경로(`usecases/advanceWeek.ts`)는
// `maxTotal: 10`이 박혀 있었다.** 같은 해에 주인공은 30명 중 10명(33%),
// NPC는 70명 중 13명(19%)을 놓고 겨뤘다.
//
// ⚠ `test:military`에 "연간 입대 인원을 코드에 박지 않는다"는 검사가
// **있었는데** `stores/game.ts`만 스캔해서 주인공 경로를 못 봤다.
// 검사가 있어도 보는 파일이 하나면 다른 경로는 그대로 샌다.
//
// **스토어를 import하지 않는다.** `stores/game.ts`와 `usecases/*`가 둘 다
// 이걸 읽어야 하는데, `usecases/militaryDecision`에 두면 game.ts → usecases →
// stores/game 순환이 된다.

import { loadRosterRules } from "../repo/newGameV3";
import type { ProtagonistSave } from "../types/save";

export interface SportsUnitLimits {
  /** 연간 선발 인원 = 정원 / 복무연수 */
  annualIntake: number;
  /** 한 구단이 상무를 독식하지 않게 하는 상한 */
  maxPerTeam: number;
  /**
   * 군인 봉급(만원) — 입대하면 연봉이 이걸로 바뀜다.
   *
   * 🔴 예전엔 원 소속 연봉을 그대로 들고 왔다 — `militaryRules.salary`(300)가
   *   **생성된 26명에게만** 걸렸고 선발로 들어온 사람은 안 걸렸다.
   *   실측(2026-08-31): 상무 최고연봉 **9.97억** · 상위 6명이 전부 상무였다.
   */
  salary: number;
  /**
   * Phase 1(전역 공백 포지션 채우기)이 정원에서 가져갈 몫.
   *
   * 🔴 이게 없으면 Phase 1이 **정원을 전부 먹고 Phase 2가 안 돈다.**
   *   상무 정원 26 / 복무 2년이라 매년 전역자가 정원(13)과 같다 —
   *   실측(8시즌) 전역자 포지션이 1 → 17 → 21 → 13 → 13건이었다.
   */
  phase1Max: number;
}

/**
 * 체육부대 연간 선발 규모 — **정본은 `generation_rules.json`의 `militaryRules`다.**
 *
 * 상무 선수는 `career_status: "military"`인데 오프시즌 로스터 캡은 `active`만
 * 세므로 **캡이 아예 안 걸린다.** 연간 입대 인원이 유일한 제어다.
 */
export async function sportsUnitLimits(): Promise<SportsUnitLimits> {
  const mil = (await loadRosterRules()).militaryRules as {
    rosterSize?: number; serviceMonths?: number; maxPerTeam?: number; phase1Ratio?: number;
    salary?: number;
  } | undefined;
  const serviceYears = Math.max(1, Math.round((mil?.serviceMonths ?? 24) / 12));
  const annualIntake = Math.max(1, Math.round((mil?.rosterSize ?? 26) / serviceYears));
  return {
    annualIntake,
    maxPerTeam: mil?.maxPerTeam ?? 3,
    // 🔴 **군인 봉급** — 입대하면 연봉이 이걸로 바뀜다(2026-08-31).
    //   예전엔 원 소속 연봉을 그대로 들고 왔고, 실측에서 상무 최고연봉이
    //   **9.97억**이었다 — 연봉 10억짜리 군인이있었다.
    salary: mil?.salary ?? 300,
    // ⚠ 최소 1 — 0이면 Phase 1이 죽고 포지션 균형을 통째로 포기한다
    phase1Max: Math.max(1, Math.round(annualIntake * (mil?.phase1Ratio ?? 0.5))),
  };
}

/**
 * 그해 **상무** 전역자의 포지션 — Phase 1이 그 자리를 먼저 채운다.
 *
 * 🔴 **`militaryUnit === "sports"`로 걸러야 한다.** `military` 상태엔
 *   체육부대와 **일반병이 같이** 들어 있다 — 실측 86명 중 상무 정원은 26이다.
 *   안 거르면 일반병 전역자 포지션까지 상무 공백으로 읽힌다.
 *   일반병은 상무 소속이 아니니 그 자리가 빈 게 아니다.
 *
 * ⚠ **이 규칙을 호출부에 인라인으로 적지 않는다.** `stores/game.ts`에만 있었고
 *   `usecases/advanceWeek.ts`(주인공 경로)는 아예 안 넘겨서 **주인공만 Phase 1
 *   없이 순수 OVR로 판정**받았다. 바로 위 주석의 `maxTotal: 10`과 같은 형태다 —
 *   같은 함수의 다음 인자에서 같은 일이 또 일어났다.
 */
export function sportsVacatingPositions(
  discharging: ReadonlyArray<{ details?: { player?: { militaryUnit?: string; position?: string } } }>,
): string[] {
  return discharging
    .filter((e) => e.details?.player?.militaryUnit === "sports")
    .map((e) => e.details?.player?.position ?? "")
    .filter((pos) => pos !== "");
}

/**
 * 같은 것을 **NPC 세이브에서** 뽑는다 — 주인공 선발(W52)용.
 *
 * ⚠ NPC 경로는 오프시즌에 Rust가 **이미 전역시킨 사람**(`rustDischargedIds`)을
 *   쓰는데, 주인공 선발은 그보다 앞선 주에 돌아서 그 목록이 없다.
 *   그래서 "올해 전역 예정"으로 같은 집합을 만든다.
 *
 * 🔴 **`enlistYear + 2`로 다시 계산하지 않는다.** 예전에 NPC 경로가 그렇게
 *   했다가 Rust와 조건이 갈려 **같은 사람이 해마다 다시 전역자로 잡혔다**
 *   (43명 · 정원 26). 저장된 `militaryDischargeYear`를 그대로 본다.
 */
export function sportsVacatingFromNpcs(
  npcs: ReadonlyArray<{
    militaryStatus?: string; militaryUnit?: string;
    militaryDischargeYear?: number | null; position?: string;
  }>,
  seasonYear: number,
): string[] {
  return npcs
    .filter((n) => n.militaryUnit === "sports"
      && n.militaryStatus === "현역"
      && n.militaryDischargeYear === seasonYear)
    .map((n) => n.position ?? "")
    .filter((pos) => pos !== "");
}

/**
 * 올해 주인공이 체육부대로 갔는가 — NPC 선발이 정원에서 한 자리를 빼야 한다.
 *
 * ⚠ 두 선발이 **별개 추첨**이다. 주인공은 W52에(`advanceWeek`), NPC는
 * 오프시즌에(`stores/game.ts`) 뽑는다. 둘 다 뽑히면 그 해 입대가 정원 + 1이고,
 * 로스터 캡이 안 걸리니 이 누수가 해마다 쌓인다.
 */
export function protagonistTookSportsSlot(p: ProtagonistSave, seasonYear: number): boolean {
  return p.militaryUnit === "sports" && p.militaryEnlistYear === seasonYear;
}
