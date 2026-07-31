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
import { nextPendingAction, seasonEnded } from "../../apps/ui/src/shared/stores/season";
import { runDraftBoardBackground } from "../../apps/ui/src/shared/usecases/runDraftBoardBackground";
import { runSeasonRollover } from "../../apps/ui/src/shared/usecases/seasonRollover";
import { processTradeWindow } from "../../apps/ui/src/shared/usecases/weekPhases/market";
import { slotRepo } from "../../apps/ui/src/shared/repo/slotRepo";
import { dehydrateToRepo } from "../../apps/ui/src/shared/repo/npcAdapter";
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

// ── 사용자 입력 대체 ─────────────────────────────────────────────
// 아래 둘은 **모달이 사용자 클릭에 반응해 하는 일**과 같다. 게임 로직을
// 재현하는 게 아니라 "사용자가 건너뛰기를 눌렀다"를 대신 눌러주는 것뿐이다.
// 로직 자체는 전부 usecase에 있고 그걸 그대로 부른다.

/** `DraftObserveModal.handleSkip` — 관전을 건너뛴다 */
export async function skipDraftObserve(): Promise<void> {
  const slotId = get(gameStore).currentSlotId;
  if (!slotId) throw new Error("[perfEntry] 슬롯이 없다");
  await runDraftBoardBackground(slotId, get(seasonStore).seasonYear);
  seasonStore.resolvePendingAction("draftObserve");
  await seasonStore.save();
}

/** `SeasonEndModal.handleNewSeason`의 세계 처리분 — 시즌 롤오버 */
export async function seasonRollover(): Promise<number> {
  const year = get(seasonStore).seasonYear;
  await runSeasonRollover({ seasonYear: year, gradeBeforeAdvance: get(gameStore).protagonist.grade });
  return year;
}

export function isSeasonEnded(): boolean { return get(seasonEnded); }

/** 아직 slot.db에 안 쓴 변경이 있는가 — 낡은 읽기 회귀용 */
export function isSaveDirty(): boolean { return gameStore.hasUnsavedChanges(); }

// ── 회귀용 프로브 (test-savebatch.cjs 전용) ──────────────────────
// 게임 로직이 아니라 **불변식을 때려보는 손잡이**다. 실제 코드 경로를
// 그대로 부르고, 여기서 상황만 만든다.

/** 일부러 낡은 읽기를 만든다 — 감시기가 죽었는지 확인용 */
export async function probeStaleRead(): Promise<void> {
  const slotId = get(gameStore).currentSlotId!;
  gameStore.beginSaveBatch();
  gameStore.applyFameChange(1);          // 메모리만 바뀐다
  await gameStore.save();                // 배치 안이라 표시만
  await slotRepo.getAllNpcs(slotId);     // ← 이 시점에 slot.db는 낡았다
  await gameStore.endSaveBatch();
}

/** 배치 안에서 예외가 나도 저장이 확정되는가 (`runAutoAdvance`의 try/finally) */
export async function probeBatchException(): Promise<boolean> {
  gameStore.beginSaveBatch();
  try {
    gameStore.applyFameChange(1);
    await gameStore.save();
    throw new Error("의도된 예외");
  } catch {
    return true;
  } finally {
    await gameStore.endSaveBatch();
  }
}

/** 저장이 밀린 상태에서 트레이드 윈도우를 돌린다 — 낡은 값을 읽으면 안 된다 */
export async function probeTradeWindow(): Promise<void> {
  gameStore.beginSaveBatch();
  gameStore.applyFameChange(1);
  await gameStore.save();                // 배치 안 — 밀린다
  // 프로 리그 트레이드 윈도우. 로스터가 비어 있어도 slot.db 조회는 실제로 나간다
  await processTradeWindow(20, "LEAGUE_KBL");
  await gameStore.endSaveBatch();
}

/** 배치 밖 save()는 즉시 영속되는가 (모달·페이지 55곳의 의미) */
export async function probeImmediateSave(): Promise<void> {
  gameStore.applyFameChange(1);
  await gameStore.save();
}

/** 주 1회 진행만 (pending 처리 없음) — 순수 `advanceWeek` 비용 측정용 */
export async function oneWeek(): Promise<void> {
  await advanceWeek();
}

// ── 세계 상태 지문 ──────────────────────────────────────────────
// 메모리와 slot.db 양쪽을 **같은 함수로** 찍는다. 따로 적으면 두 지문이
// 서로 다른 이유로 달라져도 구분이 안 된다.

interface FpInput {
  protagonist: { pitchingOvr: number; fatigue: number; morale: number; money: number; fame: number; scoutScore: number; teamId: string };
  npcs: { npcId: string; currentTeam?: string | null; careerStatus?: string; age?: number; pitchOvr?: number; batOvr?: number; salary?: number }[];
  standings: { leagueId: string; teamId: string; wins: number; losses: number; draws: number }[];
}

function fpOf(inp: FpInput): string {
  const parts: string[] = [];
  const p = inp.protagonist;
  parts.push(`P|${p.pitchingOvr}|${p.fatigue}|${p.morale}|${p.money}|${p.fame}|${p.scoutScore}|${p.teamId}`);
  for (const n of [...inp.npcs].sort((a, b) => (a.npcId < b.npcId ? -1 : 1))) {
    parts.push(`${n.npcId}|${n.currentTeam ?? ""}|${n.careerStatus ?? ""}|${n.age ?? ""}|${n.pitchOvr ?? ""}|${n.batOvr ?? ""}|${n.salary ?? 0}`);
  }
  for (const r of inp.standings) parts.push(`S|${r.leagueId}|${r.teamId}|${r.wins}-${r.losses}-${r.draws}`);
  // djb2 — 암호학적 강도가 필요 없다. "달라졌는가"만 보면 된다
  let h = 5381;
  const joined = parts.join("\n");
  for (let i = 0; i < joined.length; i++) h = ((h * 33) ^ joined.charCodeAt(i)) >>> 0;
  return `${h.toString(16)}:${parts.length}`;
}

type StandingsMap = Record<string, { standings?: { teamId: string; wins: number; losses: number; draws: number }[] }>;

function standingsRows(leagueState: StandingsMap): FpInput["standings"] {
  const out: FpInput["standings"] = [];
  for (const [leagueId, ls] of Object.entries(leagueState).sort()) {
    // standings는 배열이다 — 순서 자체가 결과의 일부라 정렬하지 않고 그대로 읽는다
    for (const row of ls.standings ?? []) {
      out.push({ leagueId, teamId: row.teamId, wins: row.wins, losses: row.losses, draws: row.draws });
    }
  }
  return out;
}

/**
 * 메모리 상의 세계 지문.
 *
 * ⚠ **동치 판정에는 못 쓴다.** 주간 시뮬이 `thread_rng()`라 같은 시드로도
 * 매번 달라진다 (PHASE8_PLAN §P8-4). 지금 쓰이는 곳은 아래 `dbFingerprint`와의
 * **비교**다 — 그건 같은 실행 안이라 난수와 무관하게 일치해야 한다.
 */
export function fingerprint(): string {
  const g = get(gameStore);
  const p = g.protagonist;
  return fpOf({
    protagonist: {
      pitchingOvr: p.pitching.ovr, fatigue: p.fatigue, morale: p.morale,
      money: p.money, fame: p.fame, scoutScore: p.scoutScore, teamId: p.teamId,
    },
    // ⚠ `g.npcs`를 그대로 읽으면 안 된다. 저장 경로는 `dehydrateToRepo`로
    // **라이브 스탯을 병합해서** 쓴다 — 메모리의 `n.pitching.ovr`는 시즌 시작값이라
    // 디스크와 다른 게 정상이다. 여기서 비교하려는 건 "쓰였어야 할 것 vs 쓰인 것"이라
    // 저장 경로와 **같은 변환**을 태워야 한다.
    npcs: dehydrateToRepo(g.npcs, get(npcLiveStatsStore)).map((r) => ({
      npcId: r.npcId, currentTeam: r.currentTeam, careerStatus: r.careerStatus,
      age: r.age, pitchOvr: r.abilities?.pitching?.ovr, batOvr: r.abilities?.batting?.ovr, salary: r.salary,
    })),
    standings: standingsRows(get(seasonStore).leagueState as unknown as StandingsMap),
  });
}

/**
 * **slot.db에 실제로 남은** 세계의 지문.
 *
 * `fingerprint()`와 다르면 = 메모리엔 있는데 디스크엔 없다 = **조용한 유실**.
 * P8-2a가 저장을 배치로 미루면서 생긴 위험이 정확히 이거라, 이 비교가
 * 그 변경의 안전망이다. v1의 "미저장 종료 유실" 계열을 여기서 잡는다.
 */
export async function dbFingerprint(slotId: string): Promise<string> {
  const rows = await slotRepo.getAllNpcs(slotId);
  const game = await slotRepo.getProtagonist<{ protagonist?: ProtagonistSave }>(slotId);
  const season = await slotRepo.getSeason<{ leagueState?: StandingsMap }>(slotId);
  const p = game?.protagonist;
  if (!p) throw new Error("[perfEntry] slot.db에 주인공이 없다");
  return fpOf({
    protagonist: {
      pitchingOvr: p.pitching.ovr, fatigue: p.fatigue, morale: p.morale,
      money: p.money, fame: p.fame, scoutScore: p.scoutScore, teamId: p.teamId,
    },
    npcs: rows.map((r) => ({
      npcId: r.npcId, currentTeam: r.currentTeam, careerStatus: r.careerStatus,
      age: r.age, pitchOvr: r.abilities?.pitching?.ovr, batOvr: r.abilities?.batting?.ovr, salary: r.salary,
    })),
    standings: standingsRows(season?.leagueState ?? {}),
  });
}
