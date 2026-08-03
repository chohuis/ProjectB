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
}

/**
 * 체육부대 연간 선발 규모 — **정본은 `generation_rules.json`의 `militaryRules`다.**
 *
 * 상무 선수는 `career_status: "military"`인데 오프시즌 로스터 캡은 `active`만
 * 세므로 **캡이 아예 안 걸린다.** 연간 입대 인원이 유일한 제어다.
 */
export async function sportsUnitLimits(): Promise<SportsUnitLimits> {
  const mil = (await loadRosterRules()).militaryRules as {
    rosterSize?: number; serviceMonths?: number; maxPerTeam?: number;
  } | undefined;
  const serviceYears = Math.max(1, Math.round((mil?.serviceMonths ?? 24) / 12));
  return {
    annualIntake: Math.max(1, Math.round((mil?.rosterSize ?? 26) / serviceYears)),
    maxPerTeam: mil?.maxPerTeam ?? 3,
  };
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
