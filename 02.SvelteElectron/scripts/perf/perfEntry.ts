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
import { runDevScenarios } from "../../apps/ui/src/shared/usecases/devScenarios";
import { runCampusEventsWeek } from "../../apps/ui/src/shared/usecases/campusEvents";
import {
  submitCareerApplications, confirmCareerResults, chooseDraft,
  chooseSchoolOrIndependent, acceptDraftOffer, continueCurrentStage,
} from "../../apps/ui/src/shared/usecases/careerDecision";
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

/**
 * 리그별 실태 — 일정·결과·순위가 실제로 도는가.
 *
 * "이 리그는 구현됐다"를 코드 읽기로 판단하면 틀린다. 실제로 경기가 돌고
 * 순위가 쌓이는지는 돌려봐야 안다.
 */
export function leagueSummary(): Record<string, {
  schedule: number; played: number; standings: number; wins: number; statPlayers: number;
}> {
  const s = get(seasonStore);
  const out: Record<string, { schedule: number; played: number; standings: number; wins: number; statPlayers: number }> = {};
  const bump = (lid: string, sched: number, played: number) => {
    out[lid] ??= { schedule: 0, played: 0, standings: 0, wins: 0, statPlayers: 0 };
    out[lid].schedule += sched;
    out[lid].played += played;
  };
  // 주인공 리그는 `schedule`, 나머지는 `leagueSchedules`에 있다
  bump(s.leagueId, s.schedule.length, s.schedule.filter((e) => e.result).length);
  for (const [lid, sch] of Object.entries(s.leagueSchedules)) {
    if (!Array.isArray(sch)) continue;
    bump(lid, sch.length, sch.filter((e) => e.result).length);
  }
  for (const [lid, ls] of Object.entries(s.leagueState)) {
    out[lid] ??= { schedule: 0, played: 0, standings: 0, wins: 0, statPlayers: 0 };
    const st = ls?.standings ?? [];
    out[lid].standings = st.length;
    out[lid].wins = st.reduce((a, r) => a + (r.wins ?? 0), 0);
    // 리더보드가 쓰는 자리 — 비어 있으면 탭을 열어도 빈 표만 나온다
    out[lid].statPlayers = Object.keys(ls?.stats ?? {}).length;
  }
  return out;
}

/** 메시지 본문 들여다보기 — 문구가 읽을 만한지 눈으로 볼 때 쓴다 */
export function dumpMessages(pattern: string, limit = 3): string[] {
  const re = new RegExp(pattern);
  return (get(gameStore).mailbox ?? [])
    .filter((m) => re.test(m.subject ?? "") || re.test(m.id))
    .slice(0, limit)
    .map((m) => `[${m.category}/${m.sender}] ${m.subject}
${m.body}`);
}

/** 일정에 들어간 대회 경기와 그 결과 — 넣었는데 안 치러지는지 본다 */
export function tourScheduleState(): Record<string, { entries: number; played: number }> {
  const s = get(seasonStore);
  const out: Record<string, { entries: number; played: number }> = {};
  const all = [...s.schedule, ...Object.values(s.leagueSchedules).flat()];
  for (const e of all) {
    const m = /^(TOUR_[A-Z_]+)/.exec(e.id);
    if (!m) continue;
    out[m[1]] ??= { entries: 0, played: 0 };
    out[m[1]].entries++;
    if (e.result) out[m[1]].played++;
  }
  return out;
}

/** 특정 대회의 일정 상세 — 라운드·주차·결과를 그대로 본다 */
export function tourDetail(tourId: string): string[] {
  const s = get(seasonStore);
  const b = (s.tournaments ?? {})[tourId];
  const out: string[] = [];
  if (b) {
    for (let r = 1; r <= b.totalRounds; r++) {
      const ms = b.matches.filter((m) => m.round === r);
      const withTeams = ms.filter((m) => m.homeTeamId && m.awayTeamId && !m.isBye);
      const won = ms.filter((m) => m.winnerTeamId);
      out.push(`  R${r}: 경기${ms.length} 대진확정${withTeams.length} 승자${won.length} week=${ms[0]?.week}`);
    }
  } else out.push("  (브래킷 없음)");
  const inSched = s.schedule.filter((e) => e.id.startsWith(tourId));
  out.push(`  일정 ${inSched.length}건 · 결과 ${inSched.filter((e) => e.result).length}건`);
  for (const e of inSched) {
    out.push(`    ${e.id} w${e.week} ${e.gameDate} ${e.result ? "OK" : "미처리"}`);
  }
  return out;
}

/** 대회 상태 — 브래킷이 생겼는지, 결승 승자가 나왔는지 */
export function tournamentState(): { id: string; rounds: number; done: number; champ: string | null }[] {
  const s = get(seasonStore);
  return Object.values(s.tournaments ?? {}).map((b) => ({
    id: b.tournamentId,
    rounds: b.totalRounds,
    done: b.matches.filter((m) => m.winnerTeamId).length,
    champ: b.matches.find((m) => m.round === b.totalRounds)?.winnerTeamId ?? null,
  }));
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

/**
 * 진로 pending을 "눌러준다" — 드래프트 지원 → 결과 확인 → 지명 수락.
 *
 * 각 단계는 `usecases/careerDecision.ts`를 그대로 부른다. 여기서 하는 건
 * **사용자가 어느 버튼을 눌렀는지 고르는 것**뿐이다.
 *
 * 왜 필요한가: 고교 졸업 이후 경로가 자동 검증에서 통째로 비어 있었다.
 * 시나리오의 "투자 3택"이 영영 SKIP이었고, **프로 단계 트레이드 윈도우도
 * 한 번도 안 돌아봤다** — 거기가 P8-2a의 낡은 읽기를 고친 자리다.
 *
 * @returns 처리한 pending 종류. null이면 아는 진로 pending이 아니다
 */
export async function pushCareerForward(): Promise<string | null> {
  const pa = get(nextPendingAction);
  if (!pa) return null;

  switch (pa.type) {
    case "careerChoiceHub": {
      // 드래프트 + 폴백(대학·독립)을 같이 넣는다.
      //
      // 드래프트만 넣으면 미지명 시 갈 곳이 없어 **현역 입대로 빠지고**
      // 프로 경로 계측이 거기서 끝난다 (실제로 그렇게 막혔다).
      // 실제 플레이어도 보통 폴백을 같이 넣는다.
      const teams = get(masterStore).teams;
      const pick = (leagueId: string) =>
        teams.filter((t) => t.leagueId === leagueId).map((t) => t.id).sort().slice(0, 3);
      await submitCareerApplications({
        draft: true,
        universityChoices: pick("LEAGUE_UNIVERSITY"),
        independentChoices: pick("LEAGUE_INDEPENDENT"),
      });
      return "careerChoiceHub";
    }

    case "careerResults":
      await confirmCareerResults();
      return "careerResults";

    case "careerChoice": {
      const r = get(gameStore).schoolState.careerResults;
      if (r?.draftDrafted) { await chooseDraft(); return "careerChoice(draft)"; }
      // 미지명이면 대학 → 독립 순으로 받는다. 아무 데도 안 되면 못 민다
      const uni = r?.universityPassed?.[0];
      const ind = r?.independentPassed?.[0];
      if (uni) { await chooseSchoolOrIndependent("university", uni); return "careerChoice(university)"; }
      if (ind) { await chooseSchoolOrIndependent("independent", ind); return "careerChoice(independent)"; }

      // 갈 곳이 없으면 지금 무대를 계속한다 — 화면의 "독립리그 계속" /
      // "다음 학년 진급"과 같은 버튼이다. 이게 없으면 미지명 선수가
      // 여기서 막혀 프로 경로를 영영 못 잰다
      const stage2 = get(gameStore).protagonist.careerStage;
      if (stage2 === "independent" || stage2 === "university") {
        await continueCurrentStage();
        return `careerChoice(continue:${stage2})`;
      }
      return null;
    }

    case "draftNotification":
      await acceptDraftOffer({
        teamId: pa.teamId, leagueId: pa.leagueId,
        salary: pa.salary, durationYears: pa.durationYears, signingBonus: pa.signingBonus,
      });
      return "draftNotification";

    default:
      return null;
  }
}

export function careerStage(): string { return get(gameStore).protagonist.careerStage; }

/** `SeasonEndModal.handleNewSeason`의 세계 처리분 — 시즌 롤오버 */
export async function seasonRollover(): Promise<number> {
  const year = get(seasonStore).seasonYear;
  await runSeasonRollover({ seasonYear: year, gradeBeforeAdvance: get(gameStore).protagonist.grade });
  return year;
}

export function isSeasonEnded(): boolean { return get(seasonEnded); }

/**
 * 테스트 시나리오를 헤드리스로 돌린다.
 *
 * 인게임 버튼(Ctrl+Q → 테스트 시나리오)과 **같은 함수**를 부른다.
 * 버튼이 도는지 확인하려고 사람이 눌러볼 필요가 없게 하려는 것이고,
 * 시나리오가 예외로 죽는지도 여기서 먼저 걸린다.
 */
export async function runScenarios(): Promise<string> {
  const r = await runDevScenarios();
  return r.text;
}

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

/**
 * 고교 스카우트 데이가 실제로 발동하는가 (W32).
 *
 * 인게임 시나리오는 메일함을 뒤져서 판정하는데, 메일함이 50건 상한이라
 * **"안 왔다"와 "밀려났다"를 구분 못 한다.** 여기서는 usecase를 직접 불러
 * 확정한다 — 세계를 바꾸므로 인게임 시나리오에는 넣지 않는다.
 */
export async function probeScoutDay(): Promise<{ logs: string[]; message: boolean; scoutGain: number }> {
  const before = get(gameStore).protagonist.scoutScore ?? 0;
  const logs = await runCampusEventsWeek(999, 32);
  const box = get(gameStore).mailbox ?? [];
  return {
    logs,
    message: box.some((m) => (m.subject ?? "").includes("스카우트 데이")),
    scoutGain: (get(gameStore).protagonist.scoutScore ?? 0) - before,
  };
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

/** `SportsUnitApplicationModal.apply` — 신청한다 */
export async function applySportsUnit(): Promise<void> {
  gameStore.setSportsUnitApplied(true);
  seasonStore.resolvePendingAction("sportsUnitApplication");
  await gameStore.save();
}

/** `SportsUnitApplicationModal.decline` — 신청하지 않는다 */
export async function declineSportsUnit(): Promise<void> {
  seasonStore.resolvePendingAction("sportsUnitApplication");
  await gameStore.save();
}

/** `advanceWeek`이 무엇을 돌려주는지 그대로 본다 — 진행이 막혔을 때 진단용 */
export async function probeWeek(): Promise<Record<string, unknown>> {
  const before = get(seasonStore).currentWeek;
  const r = await advanceWeek();
  return {
    before,
    after: get(seasonStore).currentWeek,
    processedWeek: r?.processedWeek,
    stoppedBy: r?.stoppedBy?.type ?? null,
    logs: r?.logs ?? [],
    pending: get(seasonStore).pendingActions.map((a) => a.type),
    seasonLeague: get(seasonStore).leagueId,
    stage: get(gameStore).protagonist.careerStage,
    scheduleLen: get(seasonStore).schedule.length,
    totalWeeks: get(seasonStore).totalWeeks,
  };
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
