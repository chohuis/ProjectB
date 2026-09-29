import type { ProtagonistSave } from "../types/save";

/**
 * 주인공이 엔진에 넘어가는 투수 페이로드 — **정본은 여기 하나다.**
 *
 * 🔴 **왜 만들었나** (2026-09-30 · `SIM_103_CLUTCH_PLATOON_2026-09-28.md §4-1`).
 *   같은 표가 **세 자리에 손으로** 적혀 있었다 — `runAutoAdvance.ts`(자동
 *   진행) · `MainPage.svelte`(수동 경기의 진입 전 시뮬) ·
 *   `MatchPage.svelte`(한 구씩 던지는 경기 · 두 자리). 결정 ⑫ 로 `handedness`
 *   가 늘었을 때 **세 자리 모두 안 받았고**, NPC 쪽만 이어졌다. 그러면
 *   주인공만 늘 우투로 판정된다 — 좌완 주인공에게 좌우 상성이 아예 안 걸리고,
 *   자동과 수동이 **같은 경기에서 다른 값**을 넘길 수 있다.
 *
 * ⚠ 이 저장소가 「배선이 반만」으로 여러 번 겪은 모양이다. 전에도 같은 표에서
 *   났다 — 넷만 넘겨 `control`·`movement`·`clutch`·`holdRunners` 가 통째로
 *   빠졌고(OVR 의 33%), 전부 `Option<f64>` 라 **오류 없이 조용히** 기본값으로
 *   떨어졌다(2026-08-10 실측 · 주인공 ERA 7.45 대 같은 OVR 중앙 3.35).
 *   그래서 칸을 늘릴 때 **호출부를 세 군데 고치게 두지 않는다.**
 *
 * ⚠ **구종(`arsenal`)·폼(`developingDifficulty`)은 여기 안 넣는다.** 넘기는
 *   자리가 갈린다 — 자동 진행은 넘기고 `MainPage` 의 진입 전 시뮬은 안
 *   넘긴다. 여기 넣으면 「정본 하나」를 만들면서 **동작을 같이 바꾸는** 셈이라
 *   호출부에 그대로 둔다(`MainPage` 쪽은 별 건 · `BALANCE_BACKLOG` 안건).
 */
export interface EngineProtagonistPitcher {
  name: string;
  command: number;
  velocity: number;
  staminaCap: number;
  mentalResil: number;
  control: number;
  movement: number;
  clutch: number;
  holdRunners: number;
  /** 던지는 손 — 결정 ⑫ 좌우 상성. 안 넘기면 엔진이 우투로 본다 */
  handedness: string;
}

export function toEngineProtagonistPitcher(p: ProtagonistSave): EngineProtagonistPitcher {
  return {
    name: p.name,
    command: p.pitching.command,
    velocity: p.pitching.velocity,
    staminaCap: p.pitching.stamina,
    mentalResil: p.pitching.mentality,
    control: p.pitching.control,
    movement: p.pitching.movement,
    clutch: p.pitching.clutch,
    holdRunners: p.pitching.holdRunners,
    // ⚠ 옛 세이브에는 칸이 없다 — 없으면 "R" 이다(slot.db 의 `DEFAULT 'R'` ·
    //   Rust `serde(default)` 와 같은 값이라 마이그레이션이 필요 없다)
    handedness: p.handedness ?? "R",
  };
}
