// ── P8-0 계측 하네스: 렌더러측 진입점 ────────────────────────────
//
// **이 파일은 게임 로직을 재현하지 않는다.** 실제 `advanceWeek`·`runAutoAdvance`를
// 그대로 import해서 부른다. 기존 `scripts/harness.cjs`는 slot.db와 Rust만 돌아
// 주간 경로(TS)를 못 쟀다 — 그게 이 파일이 있는 이유다.
//
// esbuild가 이걸 CJS 한 덩어리로 묶고, `scripts/measure-perf.cjs`가
// `window.projectB`를 계측 래퍼로 심어둔 뒤 require한다.

import { get } from "svelte/store";
import { masterStore } from "../../apps/ui/src/shared/stores/master";
import { gameStore } from "../../apps/ui/src/shared/stores/game";
import { seasonStore } from "../../apps/ui/src/shared/stores/season";
import { npcLiveStatsStore } from "../../apps/ui/src/shared/stores/npcLiveStats";
import { autoAdvanceStore } from "../../apps/ui/src/shared/stores/autoAdvance";
import { startNewGameV3 } from "../../apps/ui/src/shared/repo/slotLifecycleV3";
import { assignHighschoolPosition } from "../../apps/ui/src/shared/utils/pitcherRoleEngine";
import { runAutoAdvance } from "../../apps/ui/src/shared/usecases/runAutoAdvance";
import { advanceWeek } from "../../apps/ui/src/shared/usecases/advanceWeek";
import { nextPendingAction } from "../../apps/ui/src/shared/stores/season";
import type { ProtagonistSave } from "../../apps/ui/src/shared/types/save";

// ── 주인공 픽스처 ────────────────────────────────────────────────
// NewGamePage의 "균형형" 프리셋과 같은 값이지만 **정의가 아니라 픽스처**다.
// 그 페이지는 Math.random()으로 잠재·성장률을 뽑는다 — 계측은 결정적이어야
// 하므로 여기서는 고정한다. 프리셋 수치가 바뀌어도 이 파일은 안 따라간다
// (따라갈 필요가 없다 — 성능은 프리셋 선택에 좌우되지 않는다).
const PITCHING = {
  ovr: 49, velocity: 52, command: 52, control: 50, movement: 48,
  mentality: 50, stamina: 50, recovery: 48, clutch: 45, holdRunners: 46,
};

export interface BootResult {
  npcCount: number;
  worldSeed: number;
  teamId: string;
  entityCount: number;
}

/** App.svelte onMount + NewGamePage.doStartGame 과 같은 순서 */
export async function boot(opts: { slotId: string; worldSeed: number; seasonYear: number }): Promise<BootResult> {
  await masterStore.load();
  // setupContentWatcher는 dev 전용(onContentChanged 없으면 no-op)이라 건너뛴다
  masterStore.connectToGameStore(
    (fn) => gameStore.subscribe((s) => fn({ npcs: s.npcs })),
    npcLiveStatsStore.subscribe,
  );
  gameStore.initProTeamProfiles(get(masterStore).teams ?? []);

  // 팀은 refs에서 고른다 — 하드코딩하면 refs 교체 때 조용히 어긋난다
  const hsTeams = get(masterStore).teams.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL");
  if (hsTeams.length === 0) throw new Error("[perfEntry] 고교 팀이 없다 — refs.json 로드 실패");
  const teamId = hsTeams.map((t) => t.id).sort()[0];

  const protagonist: ProtagonistSave = {
    id: "PLY_HERO",
    name: "계측용",
    careerStage: "highschool",
    leagueId: "LEAGUE_HIGHSCHOOL",
    teamId,
    schoolId: teamId.replace("TEAM_HS_", "SCHOOL_HS_"),
    grade: 1,
    age: 17,
    playerType: "pitcher",
    position: await assignHighschoolPosition({ teamId, pitching: PITCHING }, get(masterStore).entities),
    handedness: "R",
    pitchingForm: "overhand",
    jerseyNumber: 18,
    condition: 80,
    fatigue: 10,
    morale: 70,
    pitching: PITCHING,
    batting: {
      ovr: 30, contact: 30, power: 25, eye: 28, discipline: 28,
      speed: 48, baseInstinct: 48, bunting: 45, platoon: 50,
      fielding: 40, arm: 50, battingClutch: 25,
    },
    primaryPosition: "SP",
    positionRatings: { SP: PITCHING.ovr },
    diligence: 60,
    popularity: 10,
    developmentRate: 62,
    potentialHidden: 75,
    growthPoints: 0,
    tags: ["정통파", "균형형"],
    pitchingXP: {},
    battingXP: {},
    pitches: [{ id: "PITCH_FASTBALL", grade: 1 }],
    birthday: "2010-04-01",
    money: 1200,
    fame: 5,
    scoutScore: 15,
    proServiceYears: 0,
    militaryUnit: null,
    militaryServiceWeeks: 0,
    militaryRecoveryWeeks: 0,
    militaryStatus: "미필",
    militaryEnlistYear: null,
    militaryDischargeYear: null,
    militaryEnlistWeek: null,
    sportsUnitSelected: false,
    sportsUnitApplied: false,
    militaryHiatusStage: null,
    militaryHiatusUniversityWeek: null,
    militaryDeferPenalty: 0,
    consecutiveLowMoraleWeeks: 0,
    consecutiveHighFatigueWeeks: 0,
    tradeAdaptationWeeks: 0,
    faNegotiationRound: 0,
    faUnsignedWeeks: 0,
  };

  const r = await startNewGameV3({ slotId: opts.slotId, slotName: "perf", seasonYear: opts.seasonYear, protagonist });
  await gameStore.save();

  return {
    npcCount: r.npcCount,
    worldSeed: r.worldSeed,
    teamId,
    entityCount: get(masterStore).entities.length,
  };
}

// ── 주차별 타임라인 ──────────────────────────────────────────────
// `runAutoAdvance`는 한 번 부르면 40주를 내리 돈다 — 밖에서는 총시간밖에 못 잰다.
// 총시간만 재면 "어느 주가 느린가"를 못 본다. 그래서 store 구독으로
// **주가 바뀌는 순간**을 찍는다. 게임 코드는 건드리지 않는다.
const timeline: { week: number; at: number }[] = [];
let timelineOn = false;

seasonStore.subscribe((s) => {
  if (!timelineOn) return;
  const last = timeline[timeline.length - 1];
  if (!last || last.week !== s.currentWeek) {
    timeline.push({ week: s.currentWeek, at: performance.now() });
  }
});

export function startTimeline(): void {
  timelineOn = true;
  timeline.length = 0;
  timeline.push({ week: get(seasonStore).currentWeek, at: performance.now() });
}

/** [주차, 그 주에 쓴 ms] — 마지막 항목은 아직 안 끝난 주라 제외된다 */
export function weekTimings(): { week: number; ms: number }[] {
  const out: { week: number; ms: number }[] = [];
  for (let i = 1; i < timeline.length; i++) {
    out.push({ week: timeline[i - 1].week, ms: timeline[i].at - timeline[i - 1].at });
  }
  return out;
}

export function currentWeek(): number { return get(seasonStore).currentWeek; }
export function currentSeason(): number { return get(seasonStore).seasonYear; }
export function pendingKind(): string | null { return get(nextPendingAction)?.type ?? null; }
export function stopReason(): string | null { return get(autoAdvanceStore).stopReason; }
export function npcCount(): number { return get(gameStore).npcs.length; }
export function entityCount(): number { return get(masterStore).entities.length; }

/**
 * 자동 진행을 한 번 돌린다. `runAutoAdvance`는 W40·W51에서 스스로 멈추므로
 * 호출부가 반복한다 — 그 정지가 실제 게임 동작이라 우회하지 않는다.
 */
export async function autoRun(): Promise<void> {
  await runAutoAdvance();
}

/** 주 1회 진행만 (pending 처리 없음) — 순수 `advanceWeek` 비용 측정용 */
export async function oneWeek(): Promise<void> {
  await advanceWeek();
}

/**
 * 세계 상태 지문 — **최적화가 결과를 바꿨는지 판정하는 유일한 근거**다.
 *
 * 성능 작업은 난수 소비 순서를 바꾸기 쉽다 (7-7의 `HashMap` 순회가 실제로 그랬다).
 * 같은 시드로 두 번 돌려 이 문자열이 다르면 그 최적화는 세계를 바꾼 것이다.
 *
 * 시간·경과시간처럼 실행마다 달라지는 값은 넣지 않는다 — 넣으면 매번 다르다.
 */
export function fingerprint(): string {
  const g = get(gameStore);
  const parts: string[] = [];
  const p = g.protagonist;
  parts.push(`P|${p.pitching.ovr}|${p.fatigue}|${p.morale}|${p.money}|${p.fame}|${p.scoutScore}|${p.teamId}`);
  for (const n of [...g.npcs].sort((a, b) => (a.npcId < b.npcId ? -1 : 1))) {
    parts.push(`${n.npcId}|${n.currentTeam ?? ""}|${n.careerStatus}|${n.age}|${n.pitching?.ovr ?? ""}|${n.batting?.ovr ?? ""}|${n.currentSalary ?? 0}`);
  }
  const s = get(seasonStore);
  for (const [lid, ls] of Object.entries(s.leagueState).sort()) {
    // standings는 배열이다 — 순서 자체가 결과의 일부라 정렬하지 않고 그대로 읽는다
    for (const row of ls.standings ?? []) {
      parts.push(`S|${lid}|${row.teamId}|${row.wins}-${row.losses}-${row.draws}`);
    }
  }
  // djb2 — 암호학적 강도가 필요 없다. "달라졌는가"만 보면 된다
  let h = 5381;
  const joined = parts.join("\n");
  for (let i = 0; i < joined.length; i++) h = ((h * 33) ^ joined.charCodeAt(i)) >>> 0;
  return `${h.toString(16)}:${parts.length}`;
}
