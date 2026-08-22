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
import {
  gameStore, MAX_MAILBOX, mailboxTrimStats, mailboxProduceStats, messageKindOf,
} from "../../apps/ui/src/shared/stores/game";
import { eventFunnelStats, resetEventFunnelStats } from "../../apps/ui/src/shared/utils/eventEngine";
import { seasonStore } from "../../apps/ui/src/shared/stores/season";
import { toEngineArsenal } from "../../apps/ui/src/shared/utils/arsenal";
import { leagueStatsOf } from "../../apps/ui/src/shared/utils/season-helpers";
import { npcLiveStatsStore, livePitchingOvrOf } from "../../apps/ui/src/shared/stores/npcLiveStats";
import { autoAdvanceStore, setAutoLogFile } from "../../apps/ui/src/shared/stores/autoAdvance";
import { startNewGameV3, getFarmDevLog } from "../../apps/ui/src/shared/repo/slotLifecycleV3";
import { assignHighschoolPosition } from "../../apps/ui/src/shared/utils/pitcherRoleEngine";
import { runAutoAdvance, lastAutoAdvanceError } from "../../apps/ui/src/shared/usecases/runAutoAdvance";
import { advanceWeek } from "../../apps/ui/src/shared/usecases/advanceWeek";
import { nextPendingAction, seasonEnded } from "../../apps/ui/src/shared/stores/season";
import { runDraftBoardBackground } from "../../apps/ui/src/shared/usecases/runDraftBoardBackground";
import { runSeasonRollover, setBeforeSeasonEndHook } from "../../apps/ui/src/shared/usecases/seasonRollover";
import { processTradeWindow } from "../../apps/ui/src/shared/usecases/weekPhases/market";
import { runDevScenarios } from "../../apps/ui/src/shared/usecases/devScenarios";
import {
  signNegotiatedContract, applyOptionClause, signFaOffer, waitFaMarket,
  acceptTrade, rejectTrade,
} from "../../apps/ui/src/shared/usecases/contractDecision";
import { generateFaOffers } from "../../apps/ui/src/shared/utils/faEngine";
import { loadAwardRules } from "../../apps/ui/src/shared/usecases/seasonAwards";
import {
  retireProtagonist, isRetired, evalRetirementPressure, calcMarketValueForProtagonist,
} from "../../apps/ui/src/shared/usecases/retirement";
import { runCampusEventsWeek } from "../../apps/ui/src/shared/usecases/campusEvents";
import { foreignRules, isForeignPlayer } from "../../apps/ui/src/shared/utils/foreignSlots";
import { enlistProtagonist } from "../../apps/ui/src/shared/usecases/militaryDecision";
import {
  submitCareerApplications, confirmCareerResults, chooseDraft,
  chooseSchoolOrIndependent, acceptDraftOffer, rejectDraftOffer, continueCurrentStage,
} from "../../apps/ui/src/shared/usecases/careerDecision";
import { facilityFactorOf, SANGMU_TEAM_IDS } from "../../apps/ui/src/shared/utils/ids";
import { slotRepo } from "../../apps/ui/src/shared/repo/slotRepo";
import { relationLabel } from "../../apps/ui/src/shared/types/relationship";
import { dehydrateToRepo } from "../../apps/ui/src/shared/repo/npcAdapter";
import type { ProtagonistSave } from "../../apps/ui/src/shared/types/save";

// ── 주인공 픽스처 ────────────────────────────────────────────────
// NewGamePage의 "균형형" 프리셋과 같은 값이지만 **정의가 아니라 픽스처**다.
// 그 페이지는 Math.random()으로 잠재·성장률을 뽑는다 — 계측은 결정적이어야
// 하므로 여기서는 고정한다. 프리셋 수치가 바뀌어도 이 파일은 안 따라간다
// (따라갈 필요가 없다 — 성능은 프리셋 선택에 좌우되지 않는다).
const PITCHING = {
  ovr: 68, velocity: 70, command: 70, control: 68, movement: 66,
  mentality: 68, stamina: 68, recovery: 66, clutch: 63, holdRunners: 64,
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
    // ⚠ **게임의 중앙값이어야 한다.** `NewGamePage`가 `random(0..15)+73` ·
    // `random(0..19)+80`으로 굴리므로 각각 80 · 89가 중앙이다. 하네스는
    // 결정적이어야 해서 고정값을 쓰지만, 그 값이 게임과 어긋나면 **계측이
    // 다른 주인공을 잰다** — `startPresets.test.ts`가 둘의 일치를 잠근다.
    //
    // 실제로 여기가 75(옛 중앙)로 남아 있었고, 그 시절 잠재력 범위가
    // 60~90이라 시작부터 성장이 0.35배로 깎이는 상태를 계측이 그대로 재고
    // 있었다. 그 위에 쌓은 "고교말 OVR 71"이 결론의 출발점이었다
    developmentRate: 80,
    potentialHidden: 89,
    growthPoints: 0,
    tags: ["정통파", "균형형"],
    pitchingXP: {},
    battingXP: {},
    // ⚠ NewGamePage 균형형과 같아야 한다 — 어긋나면 계측이 게임과 다른
    // 주인공을 잰다(이번 세션에 프리셋·능력치로 두 번 겪었다)
    pitches: [{ id: "PITCH_FASTBALL", grade: 1 }, { id: "PITCH_SINKER", grade: 1 }],
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

  // 🔴 **씨앗을 넘긴다.** 예전엔 인자로 받아 놓고 안 넘겨서 새 게임이 매번
  // 자기 씨앗을 만들었다 — 계측이 같은 씨앗을 줘도 **프로 로스터가 실행마다
  // 달랐다**(연차·나이·연봉을 난수로 정하는 `withContract` 갈래다).
  // 아마추어는 그 갈래를 안 타서 결정적으로 보였고, 그래서 오래 안 보였다.
  const r = await startNewGameV3({
    slotId: opts.slotId, slotName: "perf", seasonYear: opts.seasonYear,
    protagonist, worldSeed: opts.worldSeed >>> 0,
  });
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
  // ⚠ `runAutoAdvance`는 예외를 **삼키고** `stopReason`에만 남긴다. 헤드리스가
  // 그걸 안 보면 "주는 넘어갔으니 정상"으로 읽혀서, 매년 같은 자리에서
  // 터지는 결함이 25시즌 내내 안 보인다. 여기서 던져 드러낸다.
  const reason = get(autoAdvanceStore).stopReason;
  if (reason && reason.startsWith("오류:")) {
    throw new Error(`[autoRun] ${reason}\n${lastAutoAdvanceError() ?? "(스택 없음)"}`);
  }
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
/**
 * 진로 선택 정책 — **어느 버튼을 누를지**를 밖에서 정한다.
 *
 * 기본값(드래프트+폴백 전부)만 있으면 헤드리스가 항상 같은 한 갈래로만 간다.
 * 실제로 그랬다: 프로 경로만 25시즌을 돌았고 **대학 4학년 졸업·군 복무
 * 왕복·독립 재지명은 한 번도 안 밟혔다.** 결함 26건이 전부 그런 자리에서 나왔다.
 */
export interface CareerPolicy {
  draft: boolean;
  university: boolean;
  independent: boolean;
  /** 허브에서 즉시 입대를 고른다 — 다른 신청을 무시한다 */
  enlistNow: boolean;
  /** 지명 통보를 거부한다 (폴백 경로 확인용) */
  rejectDraft: boolean;
  /** 트레이드를 거부한다 — 노트레이드 조항이 있어야 실제로 먹힌다 */
  rejectTrade: boolean;
}
const DEFAULT_POLICY: CareerPolicy = {
  draft: true, university: true, independent: true, enlistNow: false,
  rejectDraft: false, rejectTrade: false,
};
let _policy: CareerPolicy = { ...DEFAULT_POLICY };

export function setCareerPolicy(p: Partial<CareerPolicy>): void {
  _policy = { ...DEFAULT_POLICY, ...p };
}

export async function pushCareerForward(): Promise<string | null> {
  const pa = get(nextPendingAction);
  if (!pa) return null;

  switch (pa.type) {
    case "careerChoiceHub": {
      // 드래프트 + 폴백(대학·독립)을 같이 넣는 게 기본이다.
      //
      // 드래프트만 넣으면 미지명 시 갈 곳이 없어 **현역 입대로 빠지고**
      // 프로 경로 계측이 거기서 끝난다 (실제로 그렇게 막혔다).
      // 실제 플레이어도 보통 폴백을 같이 넣는다.
      if (_policy.enlistNow) {
        await enlistProtagonist("general", get(seasonStore).currentWeek);
        gameStore.setCareerApplicationsSubmitted(false);
        gameStore.clearCareerResults();
        seasonStore.resolvePendingAction("careerChoiceHub");
        await seasonStore.save();
        return "careerChoiceHub(enlist)";
      }
      const teams = get(masterStore).teams;
      const pick = (leagueId: string) =>
        teams.filter((t) => t.leagueId === leagueId).map((t) => t.id).sort().slice(0, 3);
      await submitCareerApplications({
        draft: _policy.draft,
        universityChoices: _policy.university ? pick("LEAGUE_UNIVERSITY") : [],
        independentChoices: _policy.independent ? pick("LEAGUE_INDEPENDENT") : [],
      });
      return "careerChoiceHub";
    }

    case "careerResults":
      await confirmCareerResults();
      return "careerResults";

    case "careerChoice": {
      const r = get(gameStore).schoolState.careerResults;
      // ⚠ `rejectDraft`는 **지명 통보에서** 거부한다는 뜻이다. 여기서 막으면
      // 통보 자체가 안 뜨고 대학으로 새서 거부 경로를 영영 못 밟는다
      // (T4가 실제로 그렇게 "거부 경로를 안 탔다"로 실패했다)
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
        if (await continueCurrentStage()) return `careerChoice(continue:${stage2})`;
        // 계속할 수 없다 = 대학 4학년인데 갈 곳이 없다.
        // 화면의 "전원 탈락: 현역 입대"와 같은 결말이다 —
        // 예전엔 여기서 그냥 계속 눌러 **7년째 대학생**이 됐다
        await enlistProtagonist("general");
        gameStore.setCareerFinalChoice("general");
        gameStore.clearCareerResults();
        seasonStore.resolvePendingAction("careerChoice");
        await gameStore.save();
        await seasonStore.save();
        return "careerChoice(졸업→현역)";
      }

      // ⚠ **고3인데 전원 탈락한 경우가 빠져 있었다.** 미지명 + 대학 불합격 +
      // 독립 미신청이면 여기서 `null`을 돌려 조사가 영영 멈췄다 — 화면에는
      // `CareerResultModal`의 **"전원 탈락: 현역 입대"** 버튼이 있는데
      // 헤드리스만 그 길을 몰랐다. 앱 결함으로 오해할 뻔했다.
      if (stage2 === "highschool") {
        await enlistProtagonist("general");
        gameStore.setCareerApplicationsSubmitted(false);
        gameStore.clearCareerResults();
        gameStore.setCareerFinalChoice("general");
        seasonStore.resolvePendingAction("careerChoice");
        await gameStore.save();
        await seasonStore.save();
        return "careerChoice(전원탈락→현역)";
      }
      return null;
    }

    case "salaryNegotiation":
      await acceptNegotiation();
      return "salaryNegotiation(accept)";

    case "optionClause":
      // 구단 옵션은 결과가 이미 정해져 있고(확인만), 선수 옵션은 행사한다.
      // 어느 쪽이든 다음 단계(FA 또는 재계약)가 이어져야 한다
      await applyOptionClause(pa, pa.optionType === "team" ? pa.exercised : true);
      return `optionClause(${pa.optionType})`;

    case "faMarket": {
      // 제시 중 연봉이 가장 높은 곳과 계약한다 — 플레이어의 기본 선택
      const offers = await generateFaOffers(get(gameStore).protagonist, get(masterStore).teams);
      const best = offers.slice().sort((a, b) => b.salary - a.salary)[0];
      if (!best) { await waitFaMarket(); return "faMarket(wait)"; }
      await signFaOffer(best, best.salary);
      return "faMarket(sign)";
    }

    case "retirementAsk": {
      // 은퇴 권고를 **수락**한다 — 헤드리스는 커리어가 끝나는지 보는 게 목적이다.
      // 실제 게임에서는 플레이어가 "더 뛴다"를 고를 수 있다(부상 강제는 제외).
      //
      // ⚠ 사유를 `decline`으로 고정하면 **부상 은퇴가 기록에 안 남는다.**
      // 인생 기록·경력 이벤트가 그 값을 그대로 보여준다.
      const why = pa.reason ?? "decline";
      await retireProtagonist(why);
      return `retirementAsk(${why})`;
    }

    case "draftNotification": {
      if (_policy.rejectDraft) {
        const went = await rejectDraftOffer(pa);
        return `draftNotification(reject→${went})`;
      }
      await acceptDraftOffer({
        teamId: pa.teamId, leagueId: pa.leagueId,
        salary: pa.salary, durationYears: pa.durationYears, signingBonus: pa.signingBonus,
      });
      return "draftNotification";
    }

    case "trade": {
      // 트레이드는 `STOP_PENDING`이라 여기서 눌러주지 않으면 자동 진행이 멈춘다.
      // 기본은 수락 — 거부는 노트레이드 조항이 있어야 가능하다.
      if (_policy.rejectTrade && await rejectTrade()) return "trade(reject)";
      await acceptTrade({
        fromTeamId: pa.fromTeamId,
        toTeamId: pa.toTeamId,
        toLeagueId: pa.toLeagueId,
        receivedNpcId: pa.receivedNpcId,
        receivedNpcName: pa.receivedNpcName,
        tradeReason: pa.tradeReason,
      });
      return `trade(accept→${pa.toTeamId})`;
    }

    default:
      return null;
  }
}

export function careerStage(): string { return get(gameStore).protagonist.careerStage; }

/**
 * 이벤트가 **실제로 뜨는가** — 메시지함에 쌓인 것을 무대·이벤트별로 센다.
 *
 * ⚠ 파일 개수는 근거가 못 된다. 조건이 빡빡하면 171개를 넣어도 한 번도 안 뜬다 —
 * Phase 8 결함 26건이 전부 "코드는 있는데 안 돈다"였다. 판정은 발생 빈도로 한다.
 *
 * 메일함 상한(`MAX_MAILBOX`)에 밀려 사라지므로 **누적 집계는 주간 훅이 필요**하다.
 * 여기서는 지금 남아 있는 것만 본다 — 0인지 아닌지를 가리는 데는 충분하다.
 */
export function eventTally(): Record<string, unknown> {
  const msgs = get(gameStore).mailbox ?? [];
  const byPrefix: Record<string, number> = {};
  for (const m of msgs) {
    const src = (m as { templateId?: string; id?: string }).templateId ?? m.id ?? "";
    const p = /MSG_(PRO|HS|UNIV|IND|COND|RAND)/.exec(src)?.[1]
      ?? /msg-([a-z]+)/.exec(src)?.[1] ?? "기타";
    byPrefix[p] = (byPrefix[p] ?? 0) + 1;
  }
  return { 메시지수: msgs.length, 출처별: byPrefix };
}

/** 메일함 원본 — 이벤트 발생 빈도 계측이 templateId를 본다 */
export function mailboxRaw(): { id: string; subject: string }[] {
  return (get(gameStore).mailbox ?? []).map((m) => ({ id: m.id, subject: m.subject }));
}

// ── 이벤트 발생 계측 ─────────────────────────────────────────────
//
// ⚠ **메일함을 나중에 훑으면 안 된다.** `MAX_MAILBOX = 50`이라 `autoRun`이
// 30주를 한 번에 도는 사이 초반 메시지가 밀려 사라진다 — 실측에서 프로
// 전반기(W1~W28) 달력 이벤트가 통째로 "한 번도 안 뜸"으로 나왔는데
// 실제로는 뜬 뒤 밀려난 것이었다. (스카우트 데이·W40 총평도 같은 함정이었다)
// store 구독으로 **추가되는 순간** 잡는다.
const _evSeen = new Set<string>();
const _evTally: Record<string, number> = {};
let _evOn = false;

gameStore.subscribe((s) => {
  if (!_evOn) return;
  for (const m of s.mailbox ?? []) {
    if (_evSeen.has(m.id)) continue;
    _evSeen.add(m.id);
    // 이벤트 메시지 id는 `evt-<이벤트id>-w<주차>-<ts>` 형식이다
    const mm = /^evt-(EVT_[A-Z0-9_]+)-w\d+/.exec(m.id);
    if (mm) _evTally[mm[1]] = (_evTally[mm[1]] ?? 0) + 1;
  }
});

export function startEventTally(): void {
  _evOn = true; _evSeen.clear();
  for (const k of Object.keys(_evTally)) delete _evTally[k];
}

/** 이벤트 id → 발생 횟수 */
export function eventTallyDump(): Record<string, number> {
  return { ..._evTally };
}

/** 대학 학업 현황 — 학점·경고·유급이 실제로 도는지 본다 (Phase 9-C) */
export function academicsState(): Record<string, unknown> {
  const sc = get(gameStore).schoolState;
  return {
    major: sc.universityMajor,
    gpa: sc.universityGpa ?? null,
    semesters: sc.semesterGpaHistory?.length ?? 0,
    warn: sc.academicWarningLevel ?? 0,
    repeated: sc.repeatedYears ?? 0,
    graduated: !!sc.graduated,
    blocked: sc.eligibilityBlocked,
    univWeek: sc.universityWeek,
  };
}

/** 드래프트 보드 후보 명단 — 미지명이 실제로 남는지 본다 (Phase 9-E) */
export function draftBoardState(): Record<string, unknown> {
  const sc = get(gameStore).schoolState;
  const cands = sc.careerDraftCandidates ?? [];
  const picked = new Set((sc.careerDraftPickLog ?? []).map((p) => p.playerId));
  const byRoute: Record<string, number> = {};
  for (const c of cands) byRoute[c.route] = (byRoute[c.route] ?? 0) + 1;
  return {
    후보: cands.length,
    지명: picked.size,
    미지명: cands.filter((c) => !picked.has(c.playerId)).length,
    경로별: byRoute,
    상위OVR: cands.slice(0, 3).map((c) => `${c.playerName}:${c.ovr}`),
    하위OVR: cands.slice(-3).map((c) => `${c.playerName}:${c.ovr}`),
  };
}

/**
 * 드래프트 지명자·미지명자의 **원시 능력치**를 그대로 찍는다.
 *
 * "지명 1순위가 미지명 최하위보다 OVR이 낮다"가 실측으로 나왔다. 원인이
 * ①투수·타자 블록 오독 ②엔진이 잠재력을 우선 ③정렬 오류 중 무엇인지
 * 추측으로 못 가른다 — 두 블록을 다 찍어서 본다.
 */
export function draftOvrProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const sc = g.schoolState;
  const picked = new Set((sc.careerDraftPickLog ?? []).map((p) => p.playerId));
  const byId = new Map(g.npcs.map((n) => [n.npcId, n]));
  const row = (id: string) => {
    const n = byId.get(id);
    if (!n) return { id, 없음: true };
    return {
      이름: n.name, 유형: n.playerType, 나이: n.age,
      투수ovr: n.pitching?.ovr ?? null, 타자ovr: n.batting?.ovr ?? null,
      성장률: n.developmentRate, 리그: n.currentLeague,
    };
  };
  const cands = sc.careerDraftCandidates ?? [];
  return {
    지명_상위5: cands.filter((c) => picked.has(c.playerId)).slice(0, 5).map((c) => row(c.playerId)),
    미지명_상위3: cands.filter((c) => !picked.has(c.playerId)).slice(0, 3).map((c) => row(c.playerId)),
    미지명_하위3: cands.filter((c) => !picked.has(c.playerId)).slice(-3).map((c) => row(c.playerId)),
  };
}

/**
 * 고교 학년 분포 + 팀별 1학년 보유 — 신입생이 왜 덜 생기는지 가른다.
 *
 * `generateFreshmenV3`는 **1학년이 하나라도 있는 팀은 건너뛴다**
 * (`hasGrade1` → `continue`). 진급 후에도 1학년이 남아 있으면 그 팀은
 * 신입생을 못 받고 매년 인원이 준다 — 실측에서 고교가
 * 3,060 → 2,533 → 1,749 → 945로 무너졌다.
 */
/**
 * **slot.db를 직접 센다** — `gameStore.npcs`는 메모리 작업 세트지 정본이 아니다.
 *
 * 스토어 기준 측정에서 고교 인원이 시즌 중 1,000명쯤 줄었다가 롤오버에
 * 되돌아왔다. 그게 실제 데이터인지 스토어 적재 방식의 문제인지는
 * **정본(slot.db)을 봐야** 안다. 이번 세션에서 "측정기가 무엇을 안 보는지"를
 * 확인 안 해 틀린 판단을 세 번 했다.
 */
export async function hsDbCount(): Promise<Record<string, unknown>> {
  const slotId = get(gameStore).currentSlotId;
  if (!slotId) return { 오류: "슬롯 없음" };
  const rows = await slotRepo.getByLeague(slotId, "LEAGUE_HIGHSCHOOL", true);
  // 필터 없이도 세서 **어떤 상태로 빠지는지** 본다.
  // 시즌 중 고교가 2,527 → 1,514로 줄었다가 롤오버에 돌아온다 —
  // `activeOnly`가 거르는 상태가 무엇인지가 답이다
  const allRows = await slotRepo.getByLeague(slotId, "LEAGUE_HIGHSCHOOL", false);
  const byStatus: Record<string, number> = {};
  for (const r of allRows as { careerStatus?: string | null }[]) {
    const k = r.careerStatus ?? "(없음)";
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  const byGrade: Record<string, number> = {};
  const teams = new Set<string>();
  for (const r of rows as { grade?: number | null; currentTeam?: string | null }[]) {
    const k = r.grade == null ? "없음" : String(r.grade);
    byGrade[k] = (byGrade[k] ?? 0) + 1;
    if (r.currentTeam) teams.add(r.currentTeam);
  }
  const store = get(gameStore).npcs.filter(
    (n) => n.currentLeague === "LEAGUE_HIGHSCHOOL" && n.careerStatus === "active").length;
  return { db활성: rows.length, db전체: allRows.length, 상태별: byStatus,
           db학년별: byGrade, db팀수: teams.size, 스토어: store };
}

export function hsGradeProbe(): Record<string, unknown> {
  const npcs = get(gameStore).npcs.filter(
    (n) => n.currentLeague === "LEAGUE_HIGHSCHOOL" && n.careerStatus === "active");
  const byGrade: Record<string, number> = {};
  const teamsWithG1 = new Set<string>();
  const teams = new Set<string>();
  for (const n of npcs) {
    const key = n.grade == null ? "없음" : String(n.grade);
    byGrade[key] = (byGrade[key] ?? 0) + 1;
    if (n.currentTeam) teams.add(n.currentTeam);
    if (n.grade === 1 && n.currentTeam) teamsWithG1.add(n.currentTeam);
  }
  const perTeam = [...teams]
    .map((t) => npcs.filter((n) => n.currentTeam === t).length)
    .sort((a, b) => a - b);
  return {
    총원: npcs.length,
    팀수: teams.size,
    학년별: byGrade,
    "1학년보유팀": teamsWithG1.size,
    "팀당(최소/중앙/최대)": [perTeam[0], perTeam[Math.floor(perTeam.length / 2)], perTeam[perTeam.length - 1]],
  };
}

/**
 * 리그별 **원시 인원** — 필터 없이 센다.
 *
 * `leagueOvrSnapshot`은 OVR이 있는 활성 NPC만 세므로, 신입생이 라이브 스탯
 * 없이 들어오면 빠진다. 인원 붕괴가 진짜인지 측정 아티팩트인지 가르려면
 * 거르지 않은 수가 필요하다.
 */
export function leagueRawCounts(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const n of get(gameStore).npcs) {
    const lg = n.currentLeague ?? "(없음)";
    const st = n.careerStatus ?? "(없음)";
    ((out[lg] ??= {})[st] ??= 0);
    out[lg][st] += 1;
  }
  return out;
}

/** 리그별 OVR 분포 — 성장이 실제로 일어나는지 본다 */
export function leagueOvrSnapshot(): Record<string, { avg: number; p90: number; n: number }> {
  const out: Record<string, { avg: number; p90: number; n: number }> = {};
  const want: Record<string, string> = {
    LEAGUE_HIGHSCHOOL: "고교", LEAGUE_UNIVERSITY: "대학",
    LEAGUE_INDEPENDENT: "독립", LEAGUE_KBL: "1군",
  };
  const live = get(npcLiveStatsStore);
  const buckets: Record<string, number[]> = {};
  for (const n of get(gameStore).npcs) {
    const label = want[n.currentLeague ?? ""];
    if (!label || n.careerStatus !== "active") continue;
    const ls = live[n.npcId];
    const ovr = Math.max(
      ls?.pitching?.ovr ?? n.pitching?.ovr ?? 0,
      ls?.batting?.ovr ?? n.batting?.ovr ?? 0,
    );
    if (ovr <= 0) continue;
    (buckets[label] ??= []).push(ovr);
  }
  for (const [k, arr] of Object.entries(buckets)) {
    arr.sort((a, b) => a - b);
    out[k] = {
      avg: Math.round(arr.reduce((s2, v) => s2 + v, 0) / arr.length * 10) / 10,
      p90: Math.round(arr[Math.floor(arr.length * 0.9)] ?? 0),
      n: arr.length,
    };
  }
  return out;
}

// ── 성장 곡선 실측 ──────────────────────────────────────────────
//
// 리그 평균 OVR이 떨어지는 게 ①성장이 약해서인지 ②노화가 세서인지
// ③유입 질이 낮아서인지를 가른다. 평균만 봐서는 셋을 구분할 수 없다.
//
// `ovrCurve()`는 **나이별 평균**이라 곡선 모양을 본다 — 건강하면 20대
// 중후반까지 오르고 그 뒤 꺾인다. 평평하거나 계속 내려가면 성장이 죽은 것.
// `ovrMark()`/`ovrDelta()`는 **같은 선수**를 시즌 전후로 비교한다 —
// 구성 변화(신입 유입·졸업)에 오염되지 않은 순수 성장 폭이다.

type OvrRow = { ovr: number; age: number; league: string };

function ovrRows(): Map<string, OvrRow> {
  const want: Record<string, string> = {
    LEAGUE_HIGHSCHOOL: "고교", LEAGUE_UNIVERSITY: "대학",
    LEAGUE_INDEPENDENT: "독립", LEAGUE_KBL: "1군", LEAGUE_KBL_FARM: "2군",
  };
  const live = get(npcLiveStatsStore);
  const out = new Map<string, OvrRow>();
  for (const n of get(gameStore).npcs) {
    const league = want[n.currentLeague ?? ""];
    if (!league || n.careerStatus === "retired") continue;
    const ls = live[n.npcId];
    const ovr = Math.max(
      ls?.pitching?.ovr ?? n.pitching?.ovr ?? 0,
      ls?.batting?.ovr ?? n.batting?.ovr ?? 0,
    );
    if (ovr <= 0) continue;
    out.set(n.npcId, { ovr, age: n.age ?? 0, league });
  }
  return out;
}

const avg = (a: number[]) => Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10;

// ── NPC 생애 궤적 ────────────────────────────────────────────────
//
// **집계로는 원인을 못 짚는다.** 이번 성장 조사에서 "시즌당 −3.1"이라는
// 평균 하나로는 아무것도 알 수 없었고, 나이별·동일선수 델타로 갈라서야
// 원인이 나왔다. 드래프트·이적·병역·은퇴도 같다 — 한 명의 인생이 순서대로
// 말이 되는지 봐야 "어디서 새는가"를 짚을 수 있다.
//
// `careerEvents`(사건)와 `careerHistory`(연도별 소속)를 합쳐 시간순으로 낸다.
// 둘 중 하나만 보면 안 된다: 사건은 전이의 *이유*를, 이력은 전이의 *결과*를
// 담고 있어서, 이유 없는 이동이나 결과 없는 사건이 바로 결함 신호다.

export type TrajectoryStep = {
  year: number;
  league: string;
  team: string;
  grade: number | null;
  events: string[];
};

export type Trajectory = {
  npcId: string;
  name: string;
  playerType: string;
  현재: { age: number; league: string; team: string; status: string; ovr: number; grade: number | null };
  steps: TrajectoryStep[];
  // 이력에 없는 사건 연도 — 사건은 있는데 소속 기록이 없는 해
  이력없는사건연도: number[];
};

/**
 * 연도별 커리어 사건 집계 — **Phase 3 전체의 계측기**.
 *
 * 드래프트·트레이드·FA·방출·입대·전역·은퇴가 전부 `careerEvents`에 남으므로,
 * 연도별로 세면 "몇 명이 · 언제 · 어디로"가 한 번에 나온다. 시스템마다
 * 따로 프로브를 만들면 또 표를 여러 벌 적게 된다.
 *
 * ⚠ 은퇴자를 빼면 안 된다 — 세계에서 빠져나간 사람이야말로 세어야 할 대상이다.
 */
export function careerEventTally(): Record<number, Record<string, number>> {
  const out: Record<number, Record<string, number>> = {};
  for (const n of get(gameStore).npcs) {
    for (const e of n.careerEvents ?? []) {
      ((out[e.year] ??= {})[e.eventType] ??= 0);
      out[e.year][e.eventType] += 1;
    }
  }
  return out;
}

/**
 * 고교 졸업생이 어디로 갔는가 — 한 해분.
 *
 * 실측에서 표본 30명 중 **21명이 5시즌 안에 야구를 그만뒀다**(OVR 73·75
 * 포함). `place()`는 능력 높은 순으로 자리를 잡으므로, 상위권이 못 들어갔다면
 * 대학·독립 정원이 실제로 모자란 것이다. 전체 인원으로 비율을 확인한다.
 */
export function draftOutcomeByYear(year: number): Record<string, unknown> {
  // ⚠ **`draft_*`만 세면 안 된다.** 독립리그에는 방출(`release`)로도 들어온다 —
  // 2026 실측에서 독립이 296 → 410(+114)인데 드래프트 유입은 47명뿐이었고,
  // 그 차이를 못 보고 "독립 유입 0"이라고 잘못 읽었다. 리그를 드나든
  // **모든 사건**을 함께 센다.
  const 진로: Record<string, number> = {};   // 졸업 후 진로 (draft_*/quit)
  const 유입: Record<string, number> = {};   // 사건 종류별 리그 유입
  const 유출: Record<string, number> = {};
  let 진로대상 = 0;
  for (const n of get(gameStore).npcs) {
    for (const e of n.careerEvents ?? []) {
      if (e.year !== year) continue;
      const to = (e.toLeagueId ?? "").replace("LEAGUE_", "");
      const from = (e.fromLeagueId ?? "").replace("LEAGUE_", "");
      if (e.eventType === "draft_picked" || e.eventType === "draft_undrafted"
          || e.eventType === "quit_baseball") {
        진로대상++;
        const k = e.eventType === "draft_picked" ? "지명"
          : e.eventType === "quit_baseball" ? "야구포기"
          : to || "미지명(행선지없음)";
        진로[k] = (진로[k] ?? 0) + 1;
      }
      if (to) 유입[`${to}←${e.eventType}`] = (유입[`${to}←${e.eventType}`] ?? 0) + 1;
      if (from) 유출[`${from}→${e.eventType}`] = (유출[`${from}→${e.eventType}`] ?? 0) + 1;
    }
  }
  return { year, 진로대상, 진로, 유입, 유출 };
}

/**
 * 은퇴·연령 분포 — 세대교체가 도는가.
 *
 * ⚠ **`careerEvents`로 은퇴를 세면 안 된다.** NPC 나이 은퇴는
 * `career_history`에만 남고 `career_events`에는 `retirement`를 push하지
 * 않는다(타입은 정의돼 있는데 아무도 안 쓴다). 그걸 모르고 사건 집계만
 * 보다가 "나이 은퇴가 한 번도 없다"고 잘못 읽었다 — `careerStatus`를 센다.
 */
export function retirementProbe(): Record<string, unknown> {
  const all = get(gameStore).npcs;
  const retired = all.filter((n) => n.careerStatus === "retired");
  const alive = all.filter((n) => n.careerStatus !== "retired");
  const ageBucket = (a: number) =>
    a < 20 ? "~19" : a < 25 ? "20-24" : a < 30 ? "25-29"
    : a < 33 ? "30-32" : a < 36 ? "33-35" : "36+";
  const retiredByAge: Record<string, number> = {};
  for (const n of retired) {
    const k = ageBucket(n.age ?? 0);
    retiredByAge[k] = (retiredByAge[k] ?? 0) + 1;
  }
  // 프로(1·2군)의 연령 분포 — 늙기만 하는지 본다
  const proAges: Record<string, number> = {};
  for (const n of alive) {
    if (n.currentLeague !== "LEAGUE_KBL" && n.currentLeague !== "LEAGUE_KBL_FARM") continue;
    const k = ageBucket(n.age ?? 0);
    proAges[k] = (proAges[k] ?? 0) + 1;
  }
  const proAlive = alive.filter(
    (n) => n.currentLeague === "LEAGUE_KBL" || n.currentLeague === "LEAGUE_KBL_FARM",
  );
  const avgAge = proAlive.length
    ? Math.round((proAlive.reduce((s, n) => s + (n.age ?? 0), 0) / proAlive.length) * 10) / 10
    : 0;
  return {
    누적은퇴: retired.length,
    은퇴자나이분포: retiredByAge,
    프로연령분포: proAges,
    프로평균나이: avgAge,
    최고령: alive.reduce((m, n) => Math.max(m, n.age ?? 0), 0),
  };
}

/**
 * FA·트레이드가 도는가.
 *
 * 실측에서 `fa_signed`가 264 → 30 → 8 → 4 → 4로 붕괴하고 트레이드는 연
 * 1~4건이었다. 가설: **2군(`LEAGUE_KBL_FARM`)이 프로 연차 적립에서 빠져
 * 있다** — Rust 오프시즌이 KBL·ABL·JBL만 `pro_service_years`를 올린다.
 * 프로 인원의 절반이 2군이라면 그동안 시계가 멈춘다.
 *
 * 연차 분포를 1군·2군으로 나눠 보면 가설이 바로 갈린다.
 */
export function faTradeProbe(): Record<string, unknown> {
  const rows = get(gameStore).npcs.filter((n) => n.careerStatus !== "retired");
  const bucket = (y: number) => y <= 0 ? "0" : y <= 2 ? "1-2" : y <= 4 ? "3-4" : y <= 6 ? "5-6" : "7+";
  const dist = (lg: string) => {
    const out: Record<string, number> = {};
    let sum = 0, n = 0;
    for (const r of rows) {
      if (r.currentLeague !== lg) continue;
      const y = r.proServiceYears ?? 0;
      out[bucket(y)] = (out[bucket(y)] ?? 0) + 1;
      sum += y; n++;
    }
    return { 인원: n, 평균연차: n ? Math.round((sum / n) * 10) / 10 : 0, 분포: out };
  };
  // KBL 자격 5년 (generation_rules.json faRules.eligibleYears)
  const eligible = rows.filter(
    (r) => (r.currentLeague === "LEAGUE_KBL" || r.currentLeague === "LEAGUE_KBL_FARM")
      && (r.proServiceYears ?? 0) >= 5,
  ).length;
  return {
    "1군": dist("LEAGUE_KBL"),
    "2군": dist("LEAGUE_KBL_FARM"),
    "자격5년이상(1·2군)": eligible,
    FA대기: rows.filter((r) => r.currentLeague === "LEAGUE_FREE_AGENT").length,
  };
}

/**
 * 트레이드 제안이 나올 재료가 있는가.
 *
 * 실측 `trade`: 9 → 8 → 2 → 1 → 1 → 0. 완전히 마른다.
 * 제안 생성(`generate_trade_proposals`)의 두 축을 직접 센다.
 *
 *  1. **계약 만료 예정자**(`contractYears <= 1`) — 제안의 주 소스인데
 *     오프시즌마다 `estimate_salary_and_contract`가 계약을 갱신해 리셋될 수 있다.
 *  2. **buyer 팀** — `rank_pct <= 0.30 && win_now_pressure > 60`이라 0팀일 수 있다.
 *     buyer가 없으면 seller만 남아 거래가 성립하지 않는다.
 *
 * ⚠ autoLog를 파일로 받는 방법(`setLogFile`)은 헤드리스에서 두 번 실패했다 —
 * 경로 규칙(`path.join(logsDir, filename)`)과 `isDev=false`가 겹친다.
 * 재료를 직접 세는 편이 확실하다.
 */
export function tradeSourceProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const m = get(masterStore);
  const s = get(seasonStore);
  const teams1 = m.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"));
  const standings = s.standings?.length
    ? s.standings
    : (s.leagueState?.["LEAGUE_KBL"]?.standings ?? []);
  const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  const rankOf = new Map(sorted.map((st, i) => [st.teamId, i]));

  const rows = teams1.map((t) => {
    const roster = g.npcs.filter((n) => n.currentTeam === t.id && n.careerStatus !== "retired");
    const expiring = roster.filter((n) => (n.contractYears ?? 0) <= 1).length;
    const rank = rankOf.get(t.id);
    const rankPct = rank != null && sorted.length ? rank / sorted.length : 0.5;
    // ⚠ 프로필은 `owner` 엔티티가 아니라 `gameStore.proTeamProfiles`에 있다.
    // 엉뚱한 데서 읽어 항상 `?? 50`으로 떨어졌고, 그러면 buyer 조건
    // (`> 60`)을 영원히 못 넘어 **수정 전후가 똑같이 buyer 0으로 보였다.**
    // `getTeamProfile`과 같은 순서로 읽는다.
    const prof = (g.proTeamProfiles[t.id]
      ?? m.teams.find((mt) => mt.id === t.id)?.proTeamProfile)?.winNowPressure;
    const mode = rankPct > 0.70 ? "seller"
      : (rankPct <= 0.30 && (prof ?? 50) > 60) ? "buyer" : "-";
    return {
      팀: t.id.replace(/^TEAM_KBL_/, "").replace(/_1$/, ""),
      인원: roster.length, 만료예정: expiring,
      순위: rank != null ? rank + 1 : null,
      압박: prof ?? null, 모드: mode,
    };
  });
  return {
    팀: rows,
    만료예정합계: rows.reduce((a, r) => a + r.만료예정, 0),
    buyer: rows.filter((r) => r.모드 === "buyer").length,
    seller: rows.filter((r) => r.모드 === "seller").length,
    순위표길이: standings.length,
  };
}

/**
 * 해외 리그(ABL·JBL)가 실제로 도는가 — 확장팩 복원(O-1) 계측.
 *
 * `releaseScope.OUT_OF_SCOPE_LEAGUES`를 비우면 게이트는 열린다. 하지만
 * **게이트를 연다고 도는 게 아니다** — 이 세션에서 "코드가 있다고 도는 게
 * 아니다"를 여러 번 겪었다. 로스터·일정·순위표·성장을 각각 확인한다.
 */
/**
 * 해외 리그 정원 초과가 어디서 오는가 (F-1).
 *
 * 실측: ABL 1군 284 → 512(정원 448)로 느는 동안 팜은 544 → 353으로 줄었다.
 * **팜에서 1군으로 대량 이동**한 것으로 보이는데, 승강
 * (`processProTeamCallupCalldown`)은 `LEAGUE_KBL` 1군만 순회하므로
 * 해외엔 그 경로가 없다 — 다른 무언가가 옮기고 있다.
 *
 * 팀별로 봐야 "전체가 조금씩 넘치는가" vs "몇 팀이 몰아서 넘치는가"가 갈린다.
 */
export function rosterOverflowProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const out: Record<string, unknown> = {};
  const RULES: Record<string, number> = {
    LEAGUE_KBL: 30, LEAGUE_KBL_FARM: 34,
    LEAGUE_ABL: 28, LEAGUE_ABL_FARM: 34,
    LEAGUE_JBL: 28, LEAGUE_JBL_FARM: 34,
  };
  for (const [lg, size] of Object.entries(RULES)) {
    const byTeam = new Map<string, number>();
    for (const n of g.npcs) {
      if (n.currentLeague !== lg || n.careerStatus === "retired") continue;
      const t = n.currentTeam ?? "";
      if (!t) continue;
      byTeam.set(t, (byTeam.get(t) ?? 0) + 1);
    }
    if (byTeam.size === 0) continue;
    const counts = [...byTeam.values()].sort((a, b) => b - a);
    out[lg.replace("LEAGUE_", "")] = {
      정원: size,
      팀수: byTeam.size,
      총원: counts.reduce((a, b) => a + b, 0),
      최대: counts[0],
      중앙: counts[Math.floor(counts.length / 2)],
      최소: counts[counts.length - 1],
      초과팀: counts.filter((c) => c > size).length,
    };
  }
  return out;
}

export function overseasProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const m = get(masterStore);
  const s = get(seasonStore);
  const live = get(npcLiveStatsStore);

  const out: Record<string, unknown> = {};
  for (const lg of ["LEAGUE_ABL", "LEAGUE_ABL_FARM", "LEAGUE_JBL", "LEAGUE_JBL_FARM"]) {
    const roster = g.npcs.filter((n) => n.currentLeague === lg && n.careerStatus !== "retired");
    const teams = new Set(roster.map((n) => n.currentTeam ?? ""));
    const ovrs = roster.map((n) => {
      const ls = live[n.npcId];
      return Math.max(
        ls?.pitching?.ovr ?? n.pitching?.ovr ?? 0,
        ls?.batting?.ovr ?? n.batting?.ovr ?? 0,
      );
    }).filter((v) => v > 0);
    const st = s.leagueState?.[lg];
    // ⚠ ABL·JBL도 KBL처럼 **1군과 팜이 같은 `leagueId`를 쓴다**(ABL 16+16,
    // JBL 12+12). `leagueId`로만 세면 팜이 딸려와 순위표(1군 16)와 어긋나
    // "순위표가 절반"처럼 보인다 — 실제로 한 번 그렇게 읽었다.
    const isFarmLeague = lg.endsWith("_FARM");
    const refsTeams = m.teams.filter((t) =>
      t.leagueId === lg.replace("_FARM", "")
      && (isFarmLeague ? t.id.endsWith("_2") : t.id.endsWith("_1")));
    out[lg.replace("LEAGUE_", "")] = {
      인원: roster.length,
      팀수: teams.size,
      refs팀: refsTeams.length,
      평균OVR: ovrs.length ? Math.round((ovrs.reduce((a, b) => a + b, 0) / ovrs.length) * 10) / 10 : 0,
      순위표: st?.standings?.length ?? 0,
      일정: (s.leagueSchedules?.[lg] ?? []).length,
      // 경기가 실제로 치러졌는가 — 일정만 있고 결과가 없으면 안 도는 것이다
      결과있는경기: (s.leagueSchedules?.[lg] ?? []).filter((e) => e.result).length,
    };
  }
  return out;
}

/**
 * 외국인 보유 현황 (F-2b·F-4).
 *
 * 보는 건 **한 시점의 총원이 아니라 팀별 한도 위반 수**다. 총원만 보면
 * 어떤 팀이 4명, 다른 팀이 2명이어도 평균이 3이라 정상으로 읽힌다 —
 * 실제로 트레이드·승강이 한도를 새게 하는 방식이 정확히 그거였다.
 */
export function foreignProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const m = get(masterStore);
  const live = get(npcLiveStatsStore);
  const out: Record<string, unknown> = {};

  // 규칙 파일을 못 읽는 자리라(동기) 한도는 `foreignSlots` 캐시에서 본다 —
  // 주간 성장이 매주 prime하므로 첫 주 이후엔 항상 채워져 있다
  const F = foreignRules();
  if (!F?.leagues?.length) return { 규칙: "없음" };

  for (const lg of F.leagues) {
    // ⚠ **이 리그 선수만 센다.** 예전엔 `n.currentLeague`로 물어서
    // 전 리그를 훑었다 — 지금은 KBL만 슬롯이 있어 결과가 같지만,
    // 나중에 ABL·JBL에 한도를 주면 세 리그가 한 통에 섞인다
    const held = g.npcs.filter((n) =>
      n.careerStatus !== "retired"
      && (n.currentLeague ?? "") === lg
      && isForeignPlayer(lg, n.nationality));
    // ⚠ **보유자 목록에서 팀을 뽑으면 0명인 팀이 아예 안 보인다.** 그러면
    // "미달 없음"이 자리가 통째로 빈 팀을 통과시킨다 — 충원이 죽었을 때
    // 정확히 그렇게 조용해진다. 팀 목록은 refs에서 온다.
    const byTeam = new Map<string, typeof held>();
    for (const t of m.teams) {
      if (t.leagueId === lg && t.id.endsWith("_1")) byTeam.set(t.id, []);
    }
    for (const n of held) {
      const t = n.currentTeam ?? "";
      byTeam.set(t, [...(byTeam.get(t) ?? []), n]);
    }
    const overHold: string[] = [];
    const overPitch: string[] = [];
    const under: string[] = [];
    for (const [tid, list] of byTeam) {
      if (list.length > F.perTeam) overHold.push(`${tid}:${list.length}`);
      if (list.length < F.perTeam) under.push(`${tid}:${list.length}`);
      const p = list.filter((n) => n.playerType === "pitcher").length;
      if (p > F.maxPitchers) overPitch.push(`${tid}:${p}`);
    }
    const ovrs = held.map((n) => {
      const ls = live[n.npcId];
      return Math.max(
        ls?.pitching?.ovr ?? n.pitching?.ovr ?? 0,
        ls?.batting?.ovr ?? n.batting?.ovr ?? 0,
      );
    }).filter((v) => v > 0);
    // 2군에 외국인이 있으면 1군 전용 원칙이 깨진 것이다.
    //
    // 🔴 **예전엔 팀 id가 `_2`로 끝나기만 하면 다 셌다.** 리그를 안 가려서
    // ABL 2군 16팀 · JBL 2군 12팀이 통째로 들어갔다 — 34명씩이면 952명이고
    // 실측이 926명이었다. **KBL 한도 검사인데 해외 2군을 세고 있었다.**
    // 그 셋이 `test:foreign`을 3건 붉게 켜 두고 있었다.
    //
    // ⚠ ABL·JBL엔 외국인 슬롯 개념이 없다(`foreignRules.leagues`가 KBL뿐).
    // 그 리그에서 USA·JPN은 **내국인**이다.
    const farmOf = `${lg}_FARM`;
    const inFarm = g.npcs.filter((n) =>
      n.careerStatus !== "retired"
      && (n.currentLeague ?? "") === farmOf
      && isForeignPlayer(lg, n.nationality)).length;

    // ⚠ **집계로는 원인을 못 찾는다.** 한도가 새면 "누가 언제 왜 옮겼는지"를
    // 그 선수의 `careerEvents`에서 직접 읽어야 한다 — 이 프로젝트에서 KBL
    // 오염 원인을 찾은 방법도 그거였다(집계는 5시즌을 헤맸다).
    const bad = new Set([...overHold.map((x) => x.split(":")[0]),
                         ...under.map((x) => x.split(":")[0])]);
    const 상세: string[] = [];
    for (const n of g.npcs) {
      if (n.careerStatus === "retired") continue;
      if (!bad.has(n.currentTeam ?? "")) continue;
      // 위와 같은 이유 — 이 리그 밖 선수를 상세에 넣으면 원인이 흐려진다
      if (!(n.currentLeague ?? "").startsWith(lg)) continue;
      if (!isForeignPlayer(lg, n.nationality)) continue;
      const ev = (n.careerEvents ?? [])
        .map((e) => `${e.year}:${e.eventType}${e.toTeamId ? `→${e.toTeamId}` : ""}`).join(",");
      상세.push(`${n.npcId} ${n.playerType} 팀=${n.currentTeam} 리그=${n.currentLeague} [${ev}]`);
    }

    out[lg.replace("LEAGUE_", "")] = {
      총원: held.length,
      팀수: byTeam.size,
      // 교체율을 재려면 명단이 있어야 한다 — 총원만으로는 "한도는 지켜지는데
      // 아무도 안 갈린다"를 못 본다. 재계약 판정이 능력치만 볼 땐 그 상태였다
      명단: held.map((n) => n.npcId),
      상세,
      한도초과: overHold,
      투수한도초과: overPitch,
      미달: under,
      "2군체류": inFarm,
      평균OVR: ovrs.length ? Math.round((ovrs.reduce((a, b) => a + b, 0) / ovrs.length) * 10) / 10 : 0,
      최저OVR: ovrs.length ? Math.min(...ovrs) : 0,
      최고OVR: ovrs.length ? Math.max(...ovrs) : 0,
    };
  }
  return out;
}

/**
 * 리그와 팀이 어긋난 선수를 찾는다 (O-2b).
 *
 * 확장팩 게이트를 열면 KBL이 **10팀 307명 → 34팀 447명**으로 불어난다.
 * refs의 KBL 팀은 1군 10 + 팜 10 = 20개뿐인데 34개가 나온다 —
 * 해외 팀에 있는 선수가 `currentLeague = LEAGUE_KBL`로 기록되는 것이다.
 *
 * 로스터 생성은 `current_league: p.league_id`라 정상이므로 **나중에 리그가
 * 덮어써진다.** 누가 그랬는지는 `careerEvents`에 남아 있다 — 집계가 아니라
 * **그 선수 자체**를 봐야 알 수 있다.
 */
export function leagueTeamMismatch(): Record<string, unknown> {
  const g = get(gameStore);
  const m = get(masterStore);
  const teamLeague = new Map(m.teams.map((t) => [t.id, t.leagueId]));

  const bad: Array<Record<string, unknown>> = [];
  const byPair: Record<string, number> = {};
  for (const n of g.npcs) {
    if (n.careerStatus === "retired" || !n.currentTeam) continue;
    const real = teamLeague.get(n.currentTeam);
    if (!real) continue;                       // refs에 없는 팀 — 별개 문제
    // 팜은 상위 리그 id를 쓴다(KBL_FARM ↔ LEAGUE_KBL) — 그건 정상이다
    const norm = (l: string) => l.replace(/_FARM$/, "");
    if (norm(n.currentLeague ?? "") === norm(real)) continue;

    const k = `${n.currentLeague} ← ${real}`;
    byPair[k] = (byPair[k] ?? 0) + 1;
    if (bad.length < 8) {
      bad.push({
        id: n.npcId,
        팀: n.currentTeam,
        기록된리그: n.currentLeague,
        팀의실제리그: real,
        원소속: n.originalLeagueId ?? null,
        최근사건: (n.careerEvents ?? []).slice(-3).map(
          (e) => `${e.year} ${e.eventType}${e.toLeagueId ? `→${e.toLeagueId}` : ""}`,
        ),
      });
    }
  }
  return { 불일치: Object.values(byPair).reduce((a, b) => a + b, 0), 조합별: byPair, 표본: bad };
}

/**
 * 수상이 실제로 기록됐는가 (4-1).
 *
 * `careerHistory.highlights`는 타입만 있고 채우는 곳이 없어 **항상 빈
 * 배열**이었다. 대학 진학 점수(`awards.length * 15`)와 드래프트 점수가
 * 이미 이걸 전제하는데 값이 0이었다.
 */
/**
 * 타자 표본 분포 (Phase 1).
 *
 * ⚠ **수상 자격선(`minPa`)이 실제 타석 분포 위에 서 있는지 확인하는 창이다.**
 * 예전엔 `pa`가 경기 수의 제곱으로 늘어서(누적값을 매 경기 또 더했다)
 * `minPa` 200이 실질 4~5타석이었고, 12타수 7안타(.583)가 타격왕이 됐다.
 * 자격선을 조정하기 전에 **분포부터 본다** — 숫자를 감으로 옮기면 또 틀린다.
 */
/**
 * **개별 선수 편차** (사용자 질문 2026-08-03).
 *
 * 리그 합산 지표(ERA·피안타/9)는 "세계 평균"만 말한다. 그 숫자가 맞아도
 * **모든 선수가 똑같이 평균이면 능력치가 안 먹는 것**이다. 여기서는 능력치와
 * 성적의 상관·분포를 본다 — 상관이 0에 가까우면 능력치가 결과에 안 닿는다.
 *
 * ⚠ `SimPitcher`에는 **성격도 구종도 필드가 없다**(속도·무브·커맨드·제구·
 * 스태미나 여섯 개뿐). 즉 NPC끼리의 리그 경기는 그 둘을 안 본다.
 * 주인공 경기(`match_engine`)만 clutch·mental을 반영한다.
 */
export function abilitySpreadProbe(leagueId = "LEAGUE_KBL"): Record<string, unknown> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const live = get(npcLiveStatsStore);
  const stats = s.leagueState?.[leagueId]?.stats ?? {};

  const rows: Array<{ ovr: number; core: number; era: number; ip: number; k9: number;
                      sprob: number; sp: boolean }> = [];
  // ⚠ **소속 리그로 표본을 거르면 안 된다.** `currentLeague`는 **측정 시점**의
  // 값이라, 그 시즌 1군에서 100이닝을 던지고 부진해서 2군으로 내려간 투수가
  // 통째로 빠진다. 강등은 성적이 나빠서 당하는 것이니 **표본에서 나쁜 ERA만
  // 골라 지우는 셈**이고, 승강이 활발해지는 후반 시즌일수록 더 많이 지워진다.
  // "시즌이 갈수록 OVR–ERA 상관이 무너진다"는 관측이 정확히 이 모양이었다.
  //
  // 정본은 **그 리그의 기록 버킷**이다 — 기록이 있으면 그 리그에서 던진 것이다.
  const byId = new Map(g.npcs.map((n) => [n.npcId, n]));
  let demotedOut = 0;
  for (const [npcId, stRaw] of Object.entries(stats)) {
    const st = stRaw as { type?: string } | undefined;
    if (!st || st.type !== "pitcher") continue;
    const n = byId.get(npcId);
    if (!n) continue;
    const q = st as unknown as { ip: number; er: number; k: number };
    if (!(q.ip >= 40)) continue;   // 규정 표본
    if (n.currentLeague !== leagueId) demotedOut++;   // 옛 필터가 지웠을 표본
    // ⚠ **시즌 시작 OVR로 잰다.** 현재 OVR은 성장·감퇴가 이미 반영된 값이라
    // "그 시즌에 어떤 능력으로 던졌나"와 어긋난다 — 시즌 중 크게 성장한 신인이
    // "높은 OVR인데 성적이 나쁜" 표본이 되어 상관을 흐린다. 실측에서 같은
    // 설정인데 상관이 −0.51 ↔ −0.07로 갈렸고, 표본이 50~60명(사실상 선발)뿐이라
    // 그런 표본 몇 개가 지표를 통째로 흔든다.
    const lv = live[n.npcId];
    const snap = lv?.seasonStartPitching ?? lv?.pitching ?? n.pitching;
    const ovr = snap?.ovr ?? 0;
    if (!(ovr > 0)) continue;
    // ⚠ **OVR은 경기에 안 쓰이는 능력치를 29% 포함한다.**
    //
    // OVR = velocity 2.5 · command 2.5 · control 2.0 · movement 1.5
    //     + stamina 1.5 · mentality 1.0 · recovery 0.5 · clutch 0.3 · holdRunners 0.2
    // 그런데 `sim_at_bat`은 **앞의 넷만** 본다.
    //
    // 생성 시점엔 전부 같은 대역에서 나와 상관이 높지만(실측 OVR–K9 0.70),
    // 성장이 진행되며 뒤쪽 29%가 따로 움직이면 **OVR은 오르는데 성적은
    // 안 따라온다**(2032년 0.16). 경기가 보는 넷만 따로 재서 가른다.
    const core = ((snap?.velocity ?? 0) * 2.5 + (snap?.command ?? 0) * 2.5
                + (snap?.control ?? 0) * 2.0 + (snap?.movement ?? 0) * 1.5) / 8.5;
    // ⚠ **선발과 불펜을 나눠야 한다.** 투수 비율을 45%로 고친 뒤 표본이
    // 60 → 112로 늘었는데, 늘어난 건 40이닝을 넘긴 **불펜**이다.
    // 불펜은 이닝이 짧아 ERA가 운에 크게 흔들리고 OVR과의 상관이 약하다 —
    // 섞어 놓으면 "능력치가 성적을 안 만든다"로 잘못 읽힌다(실측 −0.19).
    // 엔진과 같은 식으로 실효 제구를 낸다 (npc_sim_one_pitch의 strike_prob)
    const sprob = Math.min(0.68, Math.max(0.38,
      0.500 + ((snap?.control ?? 0) - 50) * 0.003 + ((snap?.command ?? 0) - 50) * 0.002));
    rows.push({ ovr, core, era: q.er * 9 / q.ip, ip: q.ip, k9: q.k * 9 / q.ip,
                sprob, sp: n.position === "SP" });
  }
  if (rows.length < 10) return { 표본: rows.length, 비고: "표본 부족" };

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const corr = (xs: number[], ys: number[]) => {
    const mx = mean(xs), my = mean(ys);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const eras = rows.map((r) => r.era).sort((a, b) => a - b);
  const q = (f: number) => r2(eras[Math.min(eras.length - 1, Math.floor(eras.length * f))]);

  // 능력치 상·하위 그룹을 직접 비교한다 — 상관계수만 보면 크기를 못 느낀다
  const byOvr = [...rows].sort((a, b) => b.ovr - a.ovr);
  const top = byOvr.slice(0, Math.max(3, Math.floor(byOvr.length * 0.25)));
  const bot = byOvr.slice(-Math.max(3, Math.floor(byOvr.length * 0.25)));

  return {
    표본: rows.length,
    // ⚠ **표본 60으로는 상관이 −0.13 ~ −0.64로 흔들린다.** `ip >= 40` 필터가
    // 사실상 선발만 남기기 때문이다. 호출측이 **여러 시즌을 합산**할 수 있게
    // 원시 행을 같이 낸다 — 불펜을 넣어 표본을 늘리는 건 안 된다.
    // 마무리(고OVR·저ERA)가 섞여 상관을 인위적으로 강화한다.
    행: rows.map((r) => [Math.round(r.ovr * 10) / 10, Math.round(r.era * 100) / 100, r.sp ? 1 : 0]),
    선발수: rows.filter((r) => r.sp).length,
    "선발 OVR-ERA": (() => {
      const sp = rows.filter((r) => r.sp);
      return sp.length >= 10
        ? r2(corr(sp.map((r) => r.ovr), sp.map((r) => r.era))) : null;
    })(),
    "불펜 OVR-ERA": (() => {
      const rp = rows.filter((r) => !r.sp);
      return rp.length >= 10
        ? r2(corr(rp.map((r) => r.ovr), rp.map((r) => r.era))) : null;
    })(),
    // ⚠ K9도 선발만 봐야 한다. 불펜은 짧은 이닝이라 탈삼진율이 크게 흔들리고,
    // 섞으면 "OVR이 탈삼진을 못 만든다"로 잘못 읽힌다(실측 전체 −0.01).
    "선발 OVR-K9": (() => {
      const sp = rows.filter((r) => r.sp);
      return sp.length >= 10
        ? r2(corr(sp.map((r) => r.ovr), sp.map((r) => r.k9))) : null;
    })(),
    "ERA_p10": q(0.10), "ERA_중앙": q(0.50), "ERA_p90": q(0.90),
    "OVR-ERA 상관": r2(corr(rows.map((r) => r.ovr), rows.map((r) => r.era))),
    // 경기가 보는 4종만 — 이게 높은데 OVR이 낮으면 **OVR 공식이 문제**다
    "구위-ERA 상관": r2(corr(rows.map((r) => r.core), rows.map((r) => r.era))),
    "구위-K9 상관": r2(corr(rows.map((r) => r.core), rows.map((r) => r.k9))),
    "평균 OVR": r2(rows.reduce((a, b) => a + b.ovr, 0) / rows.length),
    "평균 구위": r2(rows.reduce((a, b) => a + b.core, 0) / rows.length),
    "OVR-K9 상관": r2(corr(rows.map((r) => r.ovr), rows.map((r) => r.k9))),
    // 옛 필터(소속 리그)가 지웠을 표본 수 — 클수록 그 편향이 컸다는 뜻이다
    "강등제외됐을표본": demotedOut,
    // ⚠ **천장에 붙은 투수는 서로 구별되지 않는다.**
    // `npc_sim_one_pitch`의 strike_prob = 0.500 + (ctl-50)*0.003 + (cmd-50)*0.002,
    // 상한 0.68. ctl=cmd=86에서 닿고 그 위는 전부 버려진다. 성장으로 상위권이
    // 천장에 몰리면 **능력 차가 결과 차를 못 만든다** — 상관이 아니라
    // 기울기가 눕는다(실측 OVR 1점당 ERA 0.075 → 0.015).
    "제구천장비율": r2(rows.filter((r) => r.sprob >= 0.6799).length / rows.length),
    "평균strike_prob": Math.round(mean(rows.map((r) => r.sprob)) * 1000) / 1000,
    "상위25% OVR": r2(mean(top.map((r) => r.ovr))),
    "상위25% ERA": r2(mean(top.map((r) => r.era))),
    "하위25% OVR": r2(mean(bot.map((r) => r.ovr))),
    "하위25% ERA": r2(mean(bot.map((r) => r.era))),
  };
}

/** 같은 리그의 투수 쪽 분포 — 타자 수치와 짝으로 본다 */
function pitcherSide(stats: Record<string, { type: string }>): Record<string, unknown> {
  const ps = Object.values(stats).filter((x) => x.type === "pitcher") as unknown as Array<{
    ip: number; er: number; h: number; k: number; bb: number; era: number; whip: number;
  }>;
  const qualified = ps.filter((p) => p.ip >= 50);
  if (qualified.length === 0) return { 규정투수: 0 };
  const eras = qualified.map((p) => p.era).sort((a, b) => a - b);
  const q = (f: number) => eras[Math.min(eras.length - 1, Math.floor(eras.length * f))];
  const ip = ps.reduce((a, b) => a + b.ip, 0);
  const h  = ps.reduce((a, b) => a + b.h, 0);
  const k  = ps.reduce((a, b) => a + b.k, 0);
  const bb = ps.reduce((a, b) => a + b.bb, 0);
  const er = ps.reduce((a, b) => a + b.er, 0);
  return {
    규정투수: qualified.length,
    ERA_최저: q(0), ERA_중앙: q(0.5),
    "리그ERA": ip > 0 ? Math.round((er * 9 / ip) * 100) / 100 : 0,
    "9이닝당피안타": ip > 0 ? Math.round((h * 9 / ip) * 10) / 10 : 0,
    "9이닝당K": ip > 0 ? Math.round((k * 9 / ip) * 10) / 10 : 0,
    "9이닝당BB": ip > 0 ? Math.round((bb * 9 / ip) * 10) / 10 : 0,
  };
}

/**
 * ⚠ **리그 기록은 `leagueState[lid].stats`만 본다.**
 *
 * 예전엔 `s.leagueId === lid ? s.stats : ...`였다. `s.stats`는 주인공 개인
 * 기록이고 승강으로 오르내리면 1군·2군이 합산돼 있어, 주인공 리그를 잴 때만
 * **2군 기록이 섞여 들어왔다.** 실측 2029 KBL에서 규정투수가 62 → 94로
 * 부풀고 OVR–ERA 상관이 −0.54 → −0.20으로 무너졌다.
 *
 * 그 상태에서 성격 계수를 조정했다면 **오염된 측정에 맞추는** 셈이었다.
 */
/**
 * 팀별 가용 타자 수 (Phase 1-f).
 *
 * ⚠ **라인업이 9명 미만이면 남은 타자가 타순을 더 자주 돈다.**
 * Rust는 `lineup[lpos % n]`으로 돌리므로 n=6이면 타석이 1.5배가 된다 —
 * 실측 경기당 7.1타석(정상 4.7)이 정확히 그 비율이다.
 *
 * 라인업 구성기(`getTeamLineup`)에는 **9명 하한 보장이 없다.** 가용 타자가
 * 모자라면 짧은 채로 반환하고, 그 결과가 개인 기록을 부풀린다.
 */
/**
 * **전 리그 로스터 구성** (사용자 질문 2026-08-03).
 *
 * 생성 시점엔 보장된다 — `roster_gen`이 8포지션을 **두 바퀴** 돌아 백업까지
 * 만들고 `test-roster-gen`이 국내 전 팀을 검사한다. 하지만 그건 새 게임
 * 시점뿐이고, 시즌이 돌면 은퇴·부상·승강·FA로 무너진다.
 *
 * 실제로 KBL 1군에서 야수 3명·투수 34명인 팀이 나왔다. 같은 일이 2군·대학·
 * 독립·고교에서도 일어나는지 **한 번에** 본다.
 *
 * ⚠ 포수를 따로 센다. 다른 자리는 대체가 되지만 포수는 전문 요원이라
 * 0명이면 경기 자체가 성립하지 않는다.
 */
export function rosterCompositionProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const m = get(masterStore);
  const FIELD = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  const out: Record<string, unknown> = {};

  // 리그별로 어떤 팀이 속하는지 — refs가 1군·팜을 같은 leagueId로 담으므로
  // `_1`/`_2` 접미사로 가른다 (roster_gen의 plan과 같은 규칙)
  const plan: Array<[string, (t: { id: string; leagueId: string }) => boolean]> = [
    ["HIGHSCHOOL",  (t) => t.leagueId === "LEAGUE_HIGHSCHOOL"],
    ["UNIVERSITY",  (t) => t.leagueId === "LEAGUE_UNIVERSITY"],
    ["INDEPENDENT", (t) => t.leagueId === "LEAGUE_INDEPENDENT"],
    ["KBL_1군",     (t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1")],
    ["KBL_2군",     (t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_2")],
    ["ABL_1군",     (t) => t.leagueId === "LEAGUE_ABL" && t.id.endsWith("_1")],
    ["ABL_2군",     (t) => t.leagueId === "LEAGUE_ABL" && t.id.endsWith("_2")],
    ["JBL_1군",     (t) => t.leagueId === "LEAGUE_JBL" && t.id.endsWith("_1")],
    ["JBL_2군",     (t) => t.leagueId === "LEAGUE_JBL" && t.id.endsWith("_2")],
  ];

  const byTeam = new Map<string, typeof g.npcs>();
  for (const n of g.npcs) {
    // ⚠ **`active`만 세면 안 된다.** `careerStatus`는 5종이고 그중 `injured`가
    // 따로 있다 — 유일한 포수가 부상이면 이 프로브는 "포수 0명"으로 셌다.
    // 실측 시점 분해가 그 모양이었다: 시즌 중 부상이 쌓여 `시즌종료`에 3팀,
    // 롤오버에서 풀려 `오프시즌직후`에 0팀.
    //
    // **부상자는 로스터에서 빠진 게 아니라 돌아온다.** 이 검사의 취지도
    // 구성이지 당일 가용 인원이 아니다("시뮬 결과엔 안 들어가지만 화면에서
    // 명백히 잘못"). 보충 경로(`generateFreshmenV3`·`generateFarmDevelopmentV3`)도
    // **은퇴만** 자리를 비우는 것으로 세므로, 여기서 기준이 갈리면
    // 보충은 "있다"고 보고 검사는 "없다"고 보는 교착이 된다.
    // ⚠ 그렇다고 은퇴만 빼면 반대로 과하다. **`free_agent`가 팀 ID를 단 채
    // 남는다** — 독립리그 탈락 팀이 그렇고, 그러면 야수 0명짜리 팀이
    // 집계에 새로 들어와 타순 미달로 잡힌다(실측). 들일 것은 부상자뿐이다.
    if (n.careerStatus !== "active" && n.careerStatus !== "injured") continue;
    if (!n.currentTeam) continue;
    const arr = byTeam.get(n.currentTeam) ?? [];
    arr.push(n);
    byTeam.set(n.currentTeam, arr);
  }

  for (const [label, pick] of plan) {
    const teams = m.teams.filter(pick);
    if (teams.length === 0) continue;
    let minBat = 999, minPit = 999, noCatcher = 0, thinPos = 0, empty = 0;
    const bad: string[] = [];
    let totBat = 0, totPit = 0;
    // ⚠ **최소값만 보면 172팀 중 한 팀의 이상치와 스무 팀의 붕괴가 같아 보인다.**
    // 최소는 팀 수 × 시즌 수 표본의 극단값이라 한두 번은 자연스레 낮게 나온다.
    // 분포를 같이 낸다 — 검사가 "몇 팀이"를 물을 수 있어야 한다.
    const batCounts: number[] = [];
    const pitCounts: number[] = [];
    // 야수 9명 미만은 **타순 한 바퀴가 안 돈다** — 남은 타자의 타석이 부풀어
    // 통계가 왜곡되므로 다른 미달과 성격이 다르다 (getTeamLineup 주석 참고)
    let underNine = 0;

    for (const t of teams) {
      const roster = byTeam.get(t.id) ?? [];
      if (roster.length === 0) { empty++; continue; }
      const pit = roster.filter((n) => n.playerType === "pitcher").length;
      const bat = roster.length - pit;
      totBat += bat; totPit += pit;
      minBat = Math.min(minBat, bat); minPit = Math.min(minPit, pit);
      batCounts.push(bat); pitCounts.push(pit);
      if (bat < 9) { underNine++; if (bad.length < 6) bad.push(`${t.id} 야수${bat}(타순미달)`); }

      const cnt: Record<string, number> = {};
      for (const n of roster) {
        if (n.playerType === "pitcher") continue;
        cnt[n.position ?? ""] = (cnt[n.position ?? ""] ?? 0) + 1;
      }
      if ((cnt["C"] ?? 0) === 0) { noCatcher++; bad.push(`${t.id} 포수0`); }
      // 8포지션 중 한 명도 없는 자리가 있으면 그 팀은 수비가 성립 안 한다
      const missing = FIELD.filter((f) => (cnt[f] ?? 0) === 0);
      if (missing.length > 0) {
        thinPos++;
        if (bad.length < 6) bad.push(`${t.id} 공백[${missing.join(",")}] 야수${bat}/투수${pit}`);
      }
    }

    const n = teams.length - empty;
    batCounts.sort((a, b) => a - b);
    pitCounts.sort((a, b) => a - b);
    // 5퍼센타일 — 최소값보다 안정적이라 "가끔 한 팀"과 "상시 여러 팀"을 가른다
    const p05 = (v: number[]) => v.length === 0 ? 0 : v[Math.floor(v.length * 0.05)];
    out[label] = {
      팀: teams.length, 로스터없음: empty,
      평균야수: n > 0 ? Math.round((totBat / n) * 10) / 10 : 0,
      평균투수: n > 0 ? Math.round((totPit / n) * 10) / 10 : 0,
      최소야수: minBat === 999 ? 0 : minBat,
      최소투수: minPit === 999 ? 0 : minPit,
      야수5퍼센타일: p05(batCounts),
      투수5퍼센타일: p05(pitCounts),
      // 하한 미달 팀 수는 검사측이 하한을 알아야 세므로 분포를 그대로 넘긴다
      야수분포: batCounts,
      투수분포: pitCounts,
      타순미달팀: underNine,
      포수없는팀: noCatcher,
      포지션공백팀: thinPos,
      상세: bad.slice(0, 5),
    };
  }
  return out;
}

export function lineupDepthProbe(leagueId = "LEAGUE_KBL"): Record<string, unknown> {
  const g = get(gameStore);
  const m = get(masterStore);
  const s = get(seasonStore);
  const out: Array<string> = [];
  let thin = 0, teams = 0;

  for (const t of m.teams) {
    if (t.leagueId !== leagueId || !t.id.endsWith("_1")) continue;
    teams++;
    const all = g.npcs.filter((n) => n.currentTeam === t.id && n.careerStatus === "active");
    const roster = all.filter((n) => n.playerType !== "pitcher");
    // 부상자는 라인업에서 빠진다 — 가용 인원은 그만큼 더 적다
    const healthy = roster.filter((n) => !s.npcInjuries?.[n.npcId]);
    // KBO 1군 야수는 15~17명이다(생성 시점도 16). 9는 "경기가 성립하는" 선일
    // 뿐이라 그걸 기준으로 보면 백업이 없는 팀을 정상으로 읽는다
    if (healthy.length < 14) {
      thin++;
      // 투수 수까지 봐야 "야수만 마른 것"인지 "팀 전체가 마른 것"인지 갈린다
      out.push(`${t.id} 야수 ${roster.length}(가용 ${healthy.length}) 투수 ${
        all.length - roster.length} 총 ${all.length}`);
    }
  }
  return { 팀수: teams, "14명미만": thin, 상세: out.slice(0, 6) };
}

export function batterSampleProbe(): Record<string, unknown> {
  const s = get(seasonStore);
  const out: Record<string, unknown> = {};
  // 주인공 소속 리그도 본다 — **모델 두 벌을 같은 리그 안에서 맞대는 유일한 창**이다.
  // 주인공 경기는 `match_engine`, 같은 리그 NPC 경기는 `npc_sim`이 돌린다.
  // 프로까지 6시즌을 밀지 않아도 고교에서 바로 비교가 된다.
  const proLeague = get(gameStore).protagonist.leagueId;
  const leagues = ["LEAGUE_KBL", "LEAGUE_KBL_FARM"];
  if (proLeague && !leagues.includes(proLeague)) leagues.push(proLeague);
  for (const lid of leagues) {
    const stats = s.leagueState?.[lid]?.stats ?? {};
    const bs = Object.values(stats).filter((x) => x.type === "batter") as Array<{
      g: number; pa: number; ab: number; h: number; bb: number;
      avg: number; obp: number; ops: number;
    }>;
    if (bs.length === 0) continue;
    const pas = bs.map((b) => b.pa).sort((a, b) => a - b);
    const q = (f: number) => pas[Math.min(pas.length - 1, Math.floor(pas.length * f))];
    // pa가 ab+bb와 어긋나면 파생이 깨진 것이다 — 이 검사가 회귀의 핵심이다
    const mismatched = bs.filter((b) => Math.abs(b.pa - (b.ab + b.bb)) > 0.5).length;
    const regulars = bs.filter((b) => b.pa >= 200);
    // 최다타석 선수의 원시값 — 경기당 타석이 말이 되는지 본다.
    // 집계값만 보면 "최대 1140타석"이 왜 나오는지 알 수 없다
    const top = bs.reduce((a, b) => (b.pa > a.pa ? b : a), bs[0]);
    const avgs = bs.map((b) => b.avg).sort((a, b) => a - b);
    const qa = (f: number) => avgs[Math.min(avgs.length - 1, Math.floor(avgs.length * f))];
    const opsOf = (list: typeof bs) =>
      list.length ? Math.round((list.reduce((a, b) => a + b.ops, 0) / list.length) * 1000) / 1000 : 0;
    out[lid.replace("LEAGUE_", "")] = {
      타자수: bs.length,
      "pa≠ab+bb": mismatched,
      최대경기: Math.max(...bs.map((b) => b.g)),
      "pa_중앙": q(0.5), "pa_p75": q(0.75), "pa_최대": pas[pas.length - 1],
      "200타석이상": regulars.length,
      평균OPS: opsOf(bs),
      규정타자OPS: opsOf(regulars),
      최고타율_전체: Math.max(...bs.map((b) => b.avg)),
      최고타율_규정: regulars.length ? Math.max(...regulars.map((b) => b.avg)) : 0,
      // ⚠ 최대값만 보면 "이상치 한 명"으로 읽힌다. **중앙값이 리그 수준이다**
      타율_p25: qa(0.25), 타율_중앙: qa(0.5), 타율_p75: qa(0.75),
      최다타석선수: `g${top.g} pa${top.pa} ab${top.ab} bb${top.bb} = 경기당 ${
        top.g > 0 ? Math.round((top.pa / top.g) * 100) / 100 : 0}`,
      // ⚠ **경기당 타석이 실제 라인업 길이를 알려준다.** 9인 타순이면 4.5~5.2다.
      // 6을 넘으면 라인업이 9명이 아니라는 뜻이고, 그때는 능력치가 아니라
      // 출전량이 성적을 만든다 — 집계만 보면 "타격이 세다"로 읽힌다.
      "경기당타석_중앙": (() => {
        const per = bs.filter((b) => b.g >= 20).map((b) => b.pa / b.g).sort((a, b) => a - b);
        return per.length ? Math.round(per[Math.floor(per.length / 2)] * 100) / 100 : 0;
      })(),
      // ⚠ **경기당 타석이 5를 크게 넘으면 물리적으로 불가능하다.**
      // 한 선수가 두 팀 라인업에 동시에 들어가면 정확히 2배가 나온다.
      // 그 선수가 누구고 어느 팀 소속인지 이름을 남겨야 원인을 찾을 수 있다 —
      // 집계만 보면 "타격이 세다"로 오독한다(실제로 한 번 그렇게 읽었다).
      이상타석: bs.filter((b) => b.g > 0 && b.pa / b.g > 6).length,
      이상타석상세: (() => {
        const bad = Object.entries(stats)
          .filter(([, x]) => x.type === "batter")
          .filter(([, x]) => {
            const b = x as unknown as { g: number; pa: number };
            return b.g > 0 && b.pa / b.g > 6;
          })
          .slice(0, 3);
        return bad.map(([pid, x]) => {
          const b = x as unknown as { g: number; pa: number };
          const n = get(gameStore).npcs.find((v) => v.npcId === pid);
          return `${pid} 팀=${n?.currentTeam ?? "?"} 리그=${n?.currentLeague ?? "?"} g${b.g} pa${b.pa}`;
        });
      })(),
      // 타자만 보면 "타격이 세다"인지 "투수가 약하다"인지 못 가른다.
      // 두 쪽을 같이 봐야 어느 계수를 건드릴지 정할 수 있다
      ...pitcherSide(stats),
    };
  }
  return out;
}

export function awardTally(): Record<string, unknown> {
  const byTitle: Record<string, number> = {};
  const byYear: Record<number, number> = {};
  let players = 0;
  const examples: string[] = [];
  for (const n of get(gameStore).npcs) {
    let has = false;
    for (const h of n.careerHistory ?? []) {
      for (const t of h.highlights ?? []) {
        const key = t.split(" (")[0];
        byTitle[key] = (byTitle[key] ?? 0) + 1;
        byYear[h.year] = (byYear[h.year] ?? 0) + 1;
        has = true;
        if (examples.length < 6) examples.push(`${h.year} ${n.name} ${t}`);
      }
    }
    if (has) players++;
  }
  return { 수상선수: players, 부문별: byTitle, 연도별: byYear, 표본: examples };
}

/** 리그별 가용 슬롯 — 정원 대비 얼마나 차 있는가 */
export function leagueCapacity(): Record<string, unknown> {
  const rows = get(gameStore).npcs.filter((n) => n.careerStatus !== "retired");
  const byLeague: Record<string, { 인원: number; 팀수: number }> = {};
  const teams: Record<string, Set<string>> = {};
  for (const n of rows) {
    const lg = (n.currentLeague ?? "(없음)").replace("LEAGUE_", "");
    (byLeague[lg] ??= { 인원: 0, 팀수: 0 }).인원 += 1;
    (teams[lg] ??= new Set()).add(n.currentTeam ?? "");
  }
  for (const [lg, t] of Object.entries(teams)) byLeague[lg].팀수 = t.size;
  return byLeague;
}

/** NPC 표본을 고른다. 능력 상·중·하를 고르게 섞어야 경로가 다 나온다 */
export function pickTrajectorySample(leagueId: string, perBand: number): string[] {
  const live = get(npcLiveStatsStore);
  const rows = get(gameStore).npcs
    .filter((n) => n.currentLeague === leagueId && n.careerStatus !== "retired")
    .map((n) => {
      const ls = live[n.npcId];
      return {
        id: n.npcId,
        ovr: Math.max(
          ls?.pitching?.ovr ?? n.pitching?.ovr ?? 0,
          ls?.batting?.ovr ?? n.batting?.ovr ?? 0,
        ),
      };
    })
    .filter((r) => r.ovr > 0)
    .sort((a, b) => b.ovr - a.ovr);
  if (rows.length === 0) return [];
  const third = Math.floor(rows.length / 3);
  const bands = [rows.slice(0, third), rows.slice(third, third * 2), rows.slice(third * 2)];
  const out: string[] = [];
  for (const band of bands) {
    // 각 구간에서 고르게 뽑는다 — 앞에서만 뽑으면 한 팀에 몰린다
    const step = Math.max(1, Math.floor(band.length / perBand));
    for (let i = 0; i < band.length && out.length < perBand * bands.length; i += step) {
      out.push(band[i].id);
    }
  }
  return out;
}

/** 표본의 생애 궤적을 시간순으로 낸다 */
export function npcTrajectory(npcIds: string[]): Trajectory[] {
  const live = get(npcLiveStatsStore);
  const byId = new Map(get(gameStore).npcs.map((n) => [n.npcId, n]));
  const out: Trajectory[] = [];
  for (const id of npcIds) {
    const n = byId.get(id);
    if (!n) continue;
    const ls = live[id];
    const evByYear = new Map<number, string[]>();
    for (const e of n.careerEvents ?? []) {
      const label = e.detail ? `${e.eventType}(${e.detail})` : e.eventType;
      (evByYear.get(e.year) ?? evByYear.set(e.year, []).get(e.year)!).push(label);
    }
    const years = new Set<number>();
    for (const h of n.careerHistory ?? []) years.add(h.year);
    const steps: TrajectoryStep[] = (n.careerHistory ?? [])
      .slice()
      .sort((a, b) => a.year - b.year)
      .map((h) => ({
        year: h.year,
        league: (h.leagueId ?? "").replace("LEAGUE_", ""),
        team: (h.teamId ?? "").replace("TEAM_", ""),
        grade: null,
        events: evByYear.get(h.year) ?? [],
      }));
    out.push({
      npcId: id,
      name: n.name,
      playerType: n.playerType ?? "",
      현재: {
        age: n.age ?? 0,
        league: (n.currentLeague ?? "").replace("LEAGUE_", ""),
        team: (n.currentTeam ?? "").replace("TEAM_", ""),
        status: n.careerStatus,
        ovr: Math.max(
          ls?.pitching?.ovr ?? n.pitching?.ovr ?? 0,
          ls?.batting?.ovr ?? n.batting?.ovr ?? 0,
        ),
        grade: n.grade ?? null,
      },
      steps,
      이력없는사건연도: [...evByYear.keys()].filter((y) => !years.has(y)).sort(),
    });
  }
  return out;
}

/**
 * 학년제 리그(고교·대학)에서 나이와 학년의 관계를 본다.
 *
 * 고교 학년 진급이 `careerStatus == "active"`만 처리해서 **부상 중인 선수는
 * 학년이 안 오르고 졸업도 안 됐다.** 나이만 매년 +1 되어 20~21세 고교생이
 * 쌓였고, 이 프로브가 그걸 잡았다.
 *
 * ⚠ **`age = ageBase + grade`는 초기 로스터 생성 규칙이지 런타임 불변식이
 * 아니다.** 대학은 고교 졸업(20세) → 드래프트 미지명 → 진학 경로가 1년을
 * 소비해서 **21세 1학년이 정상적으로 생긴다**(실측: 매년 ~88명, 그 코호트가
 * 22세 2학년으로 그대로 진급). `학년≠나이`를 대학에서 결함으로 읽지 말 것 —
 * 한 번 그렇게 착각했다. 고교는 유입 경로가 신입생 생성 하나뿐이라 다르다.
 */
export function gradeAgeProbe(): Record<string, unknown> {
  const RULES: Record<string, { base: number; max: number }> = {
    LEAGUE_HIGHSCHOOL: { base: 16, max: 3 },
    LEAGUE_UNIVERSITY: { base: 19, max: 4 },
  };
  const out: Record<string, unknown> = {};
  for (const [lg, r] of Object.entries(RULES)) {
    // ⚠ **상무를 뺀다.** 체육부대 입대자는 20대 중후반 프로 선수라 학년이
    // 없고 나이도 학부생 범위를 넘는다 — 설계지 결함이 아니다.
    // (예전엔 상무가 `LEAGUE_UNIVERSITY`로 잘못 기록돼 대학에 섞였다.
    //  지금은 `SANGMU_LEAGUE_ID`(독립)로 바로잡혔지만 팀 필터는 남겨둔다)
    const rows = get(gameStore).npcs.filter(
      (n) => n.currentLeague === lg
        && n.careerStatus !== "retired"
        && n.careerStatus !== "military"
        && !SANGMU_TEAM_IDS.has(n.currentTeam ?? ""),
    );
    const overAge = rows.filter((n) => (n.age ?? 0) > r.base + r.max);
    const mismatch = rows.filter((n) => n.grade != null && n.age !== r.base + n.grade);
    const byAge: Record<number, number> = {};
    for (const n of rows) byAge[n.age ?? 0] = (byAge[n.age ?? 0] ?? 0) + 1;
    out[lg.replace("LEAGUE_", "")] = {
      총원: rows.length,
      정상나이: `${r.base + 1}~${r.base + r.max}`,
      초과나이: overAge.length,
      "학년≠나이": mismatch.length,
      학년없음: rows.filter((n) => n.grade == null).length,
      나이분포: byAge,
      // 숫자만 보면 원인을 못 찾는다 — 실제 선수 몇 명을 같이 낸다
      불일치표본: mismatch.slice(0, 6).map(
        (n) => `${n.grade}학년/${n.age}세(${n.currentTeam ?? "?"})`,
      ),
    };
  }
  return out;
}

/** 나이별 평균 OVR — 리그별. 성장 곡선의 모양을 본다 */
export function ovrCurve(): Record<string, Record<number, { ovr: number; n: number }>> {
  const byLeagueAge: Record<string, Record<number, number[]>> = {};
  for (const r of ovrRows().values()) {
    ((byLeagueAge[r.league] ??= {})[r.age] ??= []).push(r.ovr);
  }
  const out: Record<string, Record<number, { ovr: number; n: number }>> = {};
  for (const [lg, ages] of Object.entries(byLeagueAge)) {
    out[lg] = {};
    for (const [age, arr] of Object.entries(ages)) {
      if (arr.length < 5) continue; // 표본 5명 미만은 노이즈
      out[lg][Number(age)] = { ovr: avg(arr), n: arr.length };
    }
  }
  return out;
}

let _ovrMark: Map<string, OvrRow> | null = null;

/** 성장 폭 비교 기준점을 찍는다 */
export function ovrMark(): number {
  _ovrMark = ovrRows();
  return _ovrMark.size;
}

/**
 * 기준점 이후 **같은 선수**의 OVR 변화. 나이대별로 묶어 평균 낸다.
 * 리그는 기준점 시점 기준(승격·진학한 선수를 원래 자리에서 센다).
 */
export function ovrDelta(): Record<string, Record<string, { d: number; n: number; up: number; dn: number }>> {
  if (!_ovrMark) return {};
  const now = ovrRows();
  const bucketOf = (age: number) =>
    age <= 18 ? "~18" : age <= 21 ? "19-21" : age <= 24 ? "22-24"
    : age <= 27 ? "25-27" : age <= 30 ? "28-30" : "31+";
  const acc: Record<string, Record<string, number[]>> = {};
  for (const [id, was] of _ovrMark) {
    const is = now.get(id);
    if (!is) continue; // 은퇴·이탈은 성장 폭 계산에서 뺀다
    ((acc[was.league] ??= {})[bucketOf(was.age)] ??= []).push(is.ovr - was.ovr);
  }
  const out: Record<string, Record<string, { d: number; n: number; up: number; dn: number }>> = {};
  for (const [lg, buckets] of Object.entries(acc)) {
    out[lg] = {};
    for (const [b, arr] of Object.entries(buckets)) {
      // ⚠ 소수 1자리로 반올림하면 "0.0"과 "정말 0"이 구분되지 않는다.
      // 한 명도 안 변한 것과 전원이 +0.04인 것은 원인이 전혀 다르다 —
      // 변화 인원(up/dn)을 같이 낸다.
      out[lg][b] = {
        d: Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100,
        n: arr.length,
        up: arr.filter((v) => v > 0).length,
        dn: arr.filter((v) => v < 0).length,
      };
    }
  }
  return out;
}

/**
 * 주간 성장이 **누구를 도는지** 센다.
 *
 * `processWeeklyNpcGrowth`는 `masterStore.entities`를 돌면서
 * `npcLiveStatsStore[id]`가 있는 선수만 성장시킨다. 그런데 리그 인원·OVR
 * 측정기는 전부 `gameStore.npcs`를 본다 — **출처가 다르다.**
 * 둘의 교집합이 작으면 "성장이 0으로 보이는" 현상이 그대로 설명된다.
 * 실패는 조용하다: `if (npcs.length === 0) return;`이라 오류 로그도 안 남는다.
 */
export function growthInputProbe(): Record<string, unknown> {
  const m = get(masterStore);
  const live = get(npcLiveStatsStore);
  const g = get(gameStore);
  const players = m.entities.filter((e) => e.role === "player");
  const withLive = players.filter((e) => live[e.id]);
  const byLeague: Record<string, { entities: number; live: number; store: number }> = {};
  for (const e of players) {
    const k = e.leagueId ?? "(없음)";
    (byLeague[k] ??= { entities: 0, live: 0, store: 0 }).entities++;
    if (live[e.id]) byLeague[k].live++;
  }
  for (const n of g.npcs) {
    const k = n.currentLeague ?? "(없음)";
    (byLeague[k] ??= { entities: 0, live: 0, store: 0 }).store++;
  }
  return {
    "masterStore.entities(전체)": m.entities.length,
    "그중 player": players.length,
    "liveStats 보유(=성장 대상)": withLive.length,
    "npcLiveStats 총건수": Object.keys(live).length,
    "gameStore.npcs": g.npcs.length,
    리그별: byLeague,
  };
}

/** 성장 계수가 실제로 Rust에 전달되는지 — 배선 확인용 */
export function growthFactorProbe(): Record<string, unknown> {
  return {
    규칙파일값: {
      고교: facilityFactorOf("고교"), 대학: facilityFactorOf("대학"),
      "1군": facilityFactorOf("1군"), 독립: facilityFactorOf("독립"),
    },
  };
}

/** 주인공 현황 한 줄 — 경로 회귀가 "지금 어디에 있나"를 판정하는 데 쓴다 */
/**
 * 주인공 세부 능력치 — 성장 계측이 쓴다.
 *
 * ⚠ **OVR만 보면 미세 성장이 안 보인다.** 정수라 W6에 70이 되면 그 뒤로
 * 안 움직이는 것처럼 뜬다. 실제로는 세부 능력치가 조금씩 오르는 중이다.
 */
export function protagonistAbilities(): Record<string, number> {
  const p = get(gameStore).protagonist;
  const pit = p.pitching ?? {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(pit)) {
    if (typeof v === "number") out[k] = v;
  }
  return out;
}
export function protagonistState(): Record<string, unknown> {
  const p = get(gameStore).protagonist;
  const s = get(seasonStore);
  return {
    year: s.seasonYear, week: s.currentWeek,
    stage: p.careerStage, league: p.leagueId, team: p.teamId,
    age: p.age, grade: p.grade ?? null,
    militaryStatus: p.militaryStatus, militaryUnit: p.militaryUnit,
    serviceWeeks: p.militaryServiceWeeks, recoveryWeeks: p.militaryRecoveryWeeks ?? 0,
    proServiceYears: p.proServiceYears,
    ovr: p.pitching?.ovr ?? p.batting?.ovr ?? 0,
    retired: p.retirement ?? null,
  };
}

/**
 * 주인공과 **같은 리그·비슷한 OVR**의 NPC 투수 (Phase 1-c 대조군).
 *
 * 리그 평균과 비교하면 "주인공이 약해서 그렇다"와 "모델이 다르다"를 못 가른다.
 * 능력치를 맞춘 뒤에도 차이가 남으면 그건 모델 차이다.
 */
export function peerPitcherProbe(ovrBand = 8): Record<string, unknown> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const live = get(npcLiveStatsStore);
  const p = g.protagonist;
  const myOvr = p.pitching?.ovr ?? 0;
  const lid = p.leagueId;
  const stats = s.leagueState?.[lid]?.stats ?? {};

  let ip = 0, h = 0, er = 0, k = 0, bb = 0, n = 0;
  for (const npc of g.npcs) {
    if (npc.currentLeague !== lid || npc.playerType !== "pitcher") continue;
    const o = live[npc.npcId]?.pitching?.ovr ?? npc.pitching?.ovr ?? 0;
    if (Math.abs(o - myOvr) > ovrBand) continue;
    const st = stats[npc.npcId];
    if (!st || st.type !== "pitcher") continue;
    const q = st as unknown as { ip: number; h: number; er: number; k: number; bb: number };
    if (!(q.ip > 0)) continue;
    ip += q.ip; h += q.h; er += q.er; k += q.k; bb += q.bb; n++;
  }
  if (ip <= 0) return { 대조군: 0, 기준OVR: myOvr };
  return {
    대조군: n, 기준OVR: myOvr, 합계이닝: Math.round(ip * 10) / 10,
    era: Math.round((er * 9 / ip) * 100) / 100,
    "9이닝당피안타": Math.round((h * 9 / ip) * 10) / 10,
    "9이닝당K": Math.round((k * 9 / ip) * 10) / 10,
    "9이닝당BB": Math.round((bb * 9 / ip) * 10) / 10,
  };
}

/**
 * 주인공 시즌 성적 (Phase 1-c).
 *
 * ⚠ **타격 모델이 두 벌이다.** 리그 720경기는 `npc_sim.rs`의 간이 모델을,
 * 주인공이 뛰는 경기는 `match_engine.rs`의 투구 단위 모델을 탄다. 계수도
 * 구조도 다르다.
 *
 * 그런데 수상·승강·드래프트 평가는 **같은 규칙 파일**을 읽는다. 한쪽만
 * 맞춰두면 주인공이 상대적으로 과대·과소 평가된다. 리그를 KBO 수준으로
 * 맞춘 뒤 이쪽도 같은 세계에 있는지 확인해야 한다.
 */
export function protagonistStatProbe(): Record<string, unknown> {
  const g = get(gameStore).protagonist;
  const s = get(seasonStore);
  const st = s.stats[g.id];
  if (!st) return { 기록: "없음", stage: g.careerStage, week: s.currentWeek };
  if (st.type === "pitcher") {
    const p = st as unknown as {
      g: number; ip: number; er: number; h: number; k: number; bb: number;
      era: number; whip: number; w: number; l: number; sv?: number; hd?: number;
    };
    return {
      역할: "투수", 리그: g.leagueId, 경기: p.g,
      ip: Math.round(p.ip * 10) / 10, era: p.era, whip: p.whip,
      "9이닝당피안타": p.ip > 0 ? Math.round((p.h * 9 / p.ip) * 10) / 10 : 0,
      "9이닝당K": p.ip > 0 ? Math.round((p.k * 9 / p.ip) * 10) / 10 : 0,
      "9이닝당BB": p.ip > 0 ? Math.round((p.bb * 9 / p.ip) * 10) / 10 : 0,
      // ⚠ 승패만 찍으면 홀드·세이브가 안 보여 "기록이 아예 없다"로 오독한다
      성적: `${p.w}승 ${p.l}패 ${p.sv ?? 0}세이브 ${p.hd ?? 0}홀드`,
      보직: get(gameStore).protagonist.position ?? "?",
      경기당이닝: p.g > 0 ? Math.round((p.ip / p.g) * 100) / 100 : 0,
    };
  }
  const b = st as unknown as {
    g: number; pa: number; ab: number; h: number; hr: number; bb: number; k: number;
    avg: number; obp: number; ops: number;
  };
  return {
    역할: "타자", 리그: g.leagueId, 경기: b.g,
    pa: b.pa, ab: b.ab, avg: b.avg, obp: b.obp, ops: b.ops,
    "pa=ab+bb": b.pa === b.ab + b.bb,
    hr: b.hr, "타석당K": b.pa > 0 ? Math.round((b.k / b.pa) * 1000) / 1000 : 0,
  };
}

/**
 * 주인공을 2군으로 내린 뒤 승강이 실제로 도는지 본다 (T3).
 *
 * ⚠ **성적으로 강등을 유도하려면 시즌을 여러 번 굴려야 하고, 그래도
 * 안 걸릴 수 있다.** 그러면 이 경로는 영영 미검증으로 남는다 —
 * 이번 세션 결함 24건이 전부 그런 자리에서 나왔다.
 * `probeRetirementEval`과 같은 방식으로 무대에 직접 세운다.
 *
 * 강등 자체는 `setProtagonistTeam`이 하고(실제 승강 코드가 쓰는 것과 같은
 * 함수다), 여기서는 그 뒤 **승강 판정이 주인공을 다시 올리는가**를 본다.
 */
export function forceProtagonistToFarm(): Record<string, unknown> {
  const p = get(gameStore).protagonist;
  const before = { team: p.teamId, league: p.leagueId, stage: p.careerStage };
  if (!p.teamId || !p.teamId.endsWith("_1")) {
    return { ok: false, 이유: `1군 소속이 아니다 (${p.teamId ?? "없음"})`, before };
  }
  const farmTeam = p.teamId.replace(/_1$/, "_2");
  gameStore.setProtagonistTeam(farmTeam, "LEAGUE_KBL_FARM");
  const after = get(gameStore).protagonist;
  return {
    ok: after.teamId === farmTeam && after.leagueId === "LEAGUE_KBL_FARM",
    before,
    after: { team: after.teamId, league: after.leagueId, stage: after.careerStage },
  };
}

/**
 * 국가대표가 실제로 도는가 (T8).
 *
 * ⚠ 이 경로는 **엔진 페이로드 null로 죽어 있었다** —
 * `selectNationalSquadNative: invalid type: null, expected f64`.
 * `formOf`가 통계 없는 선수에게 NaN을 만들고 `JSON.stringify`가 null로
 * 바꿨다. 고친 뒤 실제로 발탁·대회·병역면제가 도는지 본다.
 *
 * 대회는 **개막 주에만** 열리므로 시즌 중간을 봐야 한다 — 시즌 경계에서만
 * 재면 `activeTournament`가 이미 닫혀 영영 0으로 보인다(부상과 같은 함정).
 */
export function nationalTeamProbe(): Record<string, unknown> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const duty = s.nationalDuty ?? {};
  const act = s.activeTournament;

  // ⚠ **`activeTournament` 스냅샷으로는 못 본다.** 대회 기간이 2~3주인데
  // `autoRun`은 W40·W51에서만 멈춘다 — 아시안게임(W38~40)은 멈추는 순간
  // 이미 폐막했고, 올림픽(W30~33)은 통째로 지나간다. 실제로 그렇게
  // "대회가 한 번도 안 열렸다"고 잘못 읽었다.
  // **누적 기록**(메시지함)을 함께 센다. 발탁 발표는 `emitSquadNews`가
  // `sender: "대한야구협회"`로 남긴다.
  // ⚠ `mailbox`에는 상한이 있어 오래된 건 밀려난다 — 부르는 쪽이 매 tick
  // 누적해야 한다(이 세션 초반에 50-cap으로 이벤트를 놓친 적이 있다).
  const news = get(gameStore).mailbox.filter((msg) => msg.sender === "대한야구협회");

  return {
    진행중: act ? (act.def?.name ?? "이름없음") : null,
    소집인원: Object.keys(duty).length,
    주인공소집: Object.prototype.hasOwnProperty.call(duty, g.protagonist.id),
    // 누적 — 이게 "대회가 열렸는가"의 정본이다
    발탁발표수: news.length,
    발탁제목: news.slice(0, 3).map((msg) => msg.subject),
    // 국제대회 입상은 병역 면제로 이어진다 — 그 배선까지 확인한다
    주인공병역: g.protagonist.militaryStatus ?? null,
  };
}

/** 주인공이 지금 2군인가 — T3 판정용 */
export function protagonistIsFarm(): boolean {
  const p = get(gameStore).protagonist;
  return (p.teamId ?? "").endsWith("_2") || p.leagueId === "LEAGUE_KBL_FARM";
}

/** 시즌 상태 상세 — 리그·주차·일정 구성이 어떻게 돼 있는지 */
export function seasonState(): Record<string, unknown> {
  const s = get(seasonStore);
  const byPrefix: Record<string, number> = {};
  for (const e of s.schedule) {
    const m = /^(TEAM_[A-Z]+|TOUR_[A-Z]+|PS)/.exec(e.homeTeamId ?? e.id) ?? /^([A-Z_]+)/.exec(e.id);
    const k = (e.homeTeamId ?? "").split("_")[1] ?? "?";
    byPrefix[k] = (byPrefix[k] ?? 0) + 1;
  }
  return {
    leagueId: s.leagueId, year: s.seasonYear, week: s.currentWeek,
    totalWeeks: s.totalWeeks,
    scheduleLen: s.schedule.length,
    scheduleBy: byPrefix,
    standings: s.standings.length,
    leagueSchedules: Object.fromEntries(
      Object.entries(s.leagueSchedules).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])),
  };
}

/** 은퇴했는가 — 헤드리스 루프의 종료 조건 */
export function retired(): { year: number; reason: string } | null {
  const r = get(gameStore).protagonist.retirement;
  return r ? { year: r.year, reason: r.reason } : null;
}

/**
 * 계약 협상을 "수락" 눌러준다 (`ContractNegotiationModal.accept`).
 *
 * 프로 커리어 **매년** 도는 경로인데 헤드리스로 한 번도 안 돌아봤다.
 */
export async function acceptNegotiation(): Promise<boolean> {
  const pa = get(nextPendingAction);
  if (pa?.type !== "salaryNegotiation") return false;
  const teamName = get(masterStore).teams.find((t) => t.id === pa.teamId)?.name ?? pa.teamId;
  await signNegotiatedContract(pa, {
    teamId: pa.teamId, leagueId: pa.leagueId,
    salary: pa.offeredSalary,
    durationYears: pa.durationYears, remainingYears: pa.durationYears,
    signingBonus: pa.signingBonus,
    teamOptionYears: 0, playerOptionYears: 0, noTrade: false, status: "active",
  }, teamName);
  return true;
}

/** 계약 상태 — 재계약이 실제로 적용되는지 본다 */
export function contractState(): Record<string, unknown> {
  const p = get(gameStore).protagonist;
  return {
    stage: p.careerStage, team: p.teamId, league: p.leagueId,
    contract: p.contract ? {
      team: p.contract.teamId, salary: p.contract.salary,
      years: p.contract.durationYears, remaining: p.contract.remainingYears,
    } : null,
    pendingNext: p.pendingNextContract ? {
      team: p.pendingNextContract.teamId, salary: p.pendingNextContract.salary,
    } : null,
    scheduleLen: get(seasonStore).schedule.length,
  };
}

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

/**
 * 게임이 이미 쓰고 있는 진단 로그를 파일로 받는다.
 *
 * `autoLog`는 주간 루프 곳곳에 깔려 있는데(`[W43오프시즌]`·`[정지]`·`[오류]` 등)
 * 헤드리스는 `setAutoLogFile`을 부른 적이 없어서 **전부 버려졌다.** 화면으로만
 * 보이던 정보라 헤드리스에서 결함을 추적할 때 매번 스크립트를 새로 짜야 했다.
 */
export function setLogFile(filename: string | null): void {
  setAutoLogFile(filename);
}

/**
 * 은퇴 판정을 **지금 상태 + 지정한 나이/추세**로 한 번 돌려본다.
 *
 * 25시즌을 돌려야만 이 경로를 밟을 수 있으면 페이로드 불일치 하나 고치는 데
 * 30분이 든다 — 실제로 그렇게 두 번 갔다(`RosterPlayerRef` 필드 7개 누락,
 * `calcMarketSalary` `leagueId` 누락). 둘 다 옛 `catch`가 삼키던 것이다.
 */
export async function probeRetirementEval(
  opts: { age: number; ovrTrend: number; salary: number },
): Promise<Record<string, unknown>> {
  const p0 = get(gameStore).protagonist;
  const aged = {
    ...p0, age: opts.age,
    contract: { ...(p0.contract ?? ({} as never)), salary: opts.salary, remainingYears: 1 },
  };
  const mv = await calcMarketValueForProtagonist(aged);
  const pressure = await evalRetirementPressure(opts.ovrTrend, mv, aged);
  return { marketValue: mv, suggest: pressure.suggest, urgency: pressure.urgency };
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

/**
 * 수상 자격선이 **지금 분포에서** 맞는가 (Phase 3).
 *
 * ⚠ 수상 규칙은 계산이 아니라 **판정 기준**이다. 엔진이 바뀌면 같은 규칙이
 * 다른 결과를 낸다 — 리그 타율이 .431에서 .253으로 내려온 뒤에도 자격선은
 * 그대로였다. `awardRules._note4`가 이미 "타격왕 이상치(.583)가 남아 있어
 * 추가 조정이 필요하다"고 적어 두었다.
 *
 * 부문마다 **자격 통과 인원**과 **1위 값**을 같이 낸다:
 *   통과 0명   자격선이 너무 높다 — 그 상이 아예 안 나온다
 *   통과 1~2명 표본이 얕아 요행이 1위가 된다
 *   1위 값이 minValue/maxValue에 걸리면 그 해 수상자가 없다
 */
export async function awardThresholdProbe(leagueId = "LEAGUE_KBL"): Promise<Record<string, unknown>> {
  const s = get(seasonStore);
  const stats = s.leagueState?.[leagueId]?.stats ?? {};
  // **화면·기록과 같은 규칙을 읽는다** — 여기서 따로 적으면 검사가 거짓 안심을 준다
  const rules = await loadAwardRules();
  if (!rules) return { 비고: "generation_rules.json에 awardRules가 없다" };

  // ⚠ **playerId는 필드가 아니라 키다.** `Object.values`로 뽑아 `r.playerId`를
  // 읽으면 항상 undefined라 수상자가 한 명도 집계되지 않는다 — 그래서 MVP가
  // 늘 0명으로 나왔다(부문별 1위는 정상 출력되니 티가 안 났다).
  const rows: Array<Record<string, number | string>> = Object.entries(stats).map(
    ([playerId, st]) => ({ ...(st as unknown as Record<string, number | string>), playerId }));
  const out: Record<string, unknown> = {};
  const won = new Map<string, number>();

  for (const def of [...rules.pitcher, ...rules.batter] as unknown as Array<Record<string, unknown>>) {
    const minIp = def.minIp as number | undefined;
    const minPa = def.minPa as number | undefined;
    const stat  = def.stat as string;
    const desc  = def.order === "desc";

    const pool = rows.filter((r) => {
      if (minIp != null) return r.type === "pitcher" && Number(r.ip ?? 0) >= minIp;
      if (minPa != null) return r.type === "batter"  && Number(r.pa ?? 0) >= minPa;
      return false;
    });
    if (pool.length === 0) { out[String(def.label)] = { 통과: 0, 비고: "자격자 없음" }; continue; }

    const vals = pool.map((r) => Number(r[stat] ?? NaN)).filter(Number.isFinite);
    vals.sort((a, b) => (desc ? b - a : a - b));
    const best = vals[0];
    const minValue = def.minValue as number | undefined;
    const maxValue = def.maxValue as number | undefined;
    const rejected = (minValue != null && best < minValue) || (maxValue != null && best > maxValue);
    // 2위와의 차 — 1위만 튀면 표본이 얕다는 신호다
    const gap = vals.length > 1 ? Math.abs(best - vals[1]) : 0;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    out[String(def.label)] = {
      통과: pool.length,
      "1위": r3(best),
      "2위차": r3(gap),
      "중앙": r3(vals[Math.floor(vals.length / 2)]),
      // 자격선에 걸려 수상자가 없으면 그 해 그 부문이 통째로 비는 것이다
      ...(rejected ? { 수상없음: `${minValue ?? maxValue} 기준 미달` } : {}),
    };
    if (!rejected) {
      const winner = pool.find((r) => Number(r[stat]) === best);
      const id = String(winner?.playerId ?? "");
      if (id) won.set(id, (won.get(id) ?? 0) + 1);
    }
  }
  const minTitles = rules.mvp.minTitles;
  const multi = [...won.values()].filter((n) => n >= minTitles).length;
  // ⚠ **판정을 여기 다시 적으면 화면·기록과 어긋난다.** `applySeasonAwards`가
  // minTitles 미달인 해엔 "가장 압도적으로 1위한 선수"에게 준다(사용자 확정) —
  // 이 프로브도 같은 결과를 보여야 검사가 거짓 안심을 안 준다
  out["MVP"] = {
    기준: `${minTitles}개 이상 (미달 시 최고 압도)`,
    해당: multi > 0 ? multi : (won.size > 0 ? 1 : 0),
    최다부문: won.size ? Math.max(...won.values()) : 0,
    폴백: multi === 0 && won.size > 0,
  };
  return out;
}

/**
 * 포스트시즌이 실제로 치러졌는가 (T7).
 *
 * ⚠ **일정 엔트리를 보면 안 된다.** 처음엔 `leagueSchedules[lid]`에서
 * `phase === "postseason"`을 셌는데 **항상 0**이었다 — 포스트시즌 정본은
 * `postseasonBrackets[leagueId]`(시리즈 목록)이고, 일정은 시리즈가 진행되면서
 * 주입된다(`injectPostseasonEntries`). 있는 곳을 안 보면 "아예 없다"가 된다.
 *
 * 시리즈가 있어도 `winner`가 안 붙으면 우승팀이 안 정해지고, 시즌 요약·수상·
 * 구단 성향 갱신이 전부 빈손으로 돈다 — **승자가 붙었는지**를 본다.
 */
export function postseasonProbe(leagueId = "LEAGUE_KBL"): Record<string, unknown> {
  const s = get(seasonStore);
  const series = s.postseasonBrackets?.[leagueId] ?? [];
  const decided = series.filter((x) => !!x.winner);
  // 마지막 시리즈(다음이 없는 것)의 승자가 우승팀이다
  const final = series.find((x) => x.nextSeriesId == null);
  const myTeam = get(gameStore).protagonist.teamId;
  return {
    시리즈: series.length,
    승자결정: decided.length,
    우승팀: final?.winner ?? null,
    // 주인공 팀이 가을야구에 갔는가 — 경로가 주인공까지 닿는지 본다
    주인공팀참가: myTeam
      ? series.some((x) => x.homeTeamId === myTeam || x.awayTeamId === myTeam)
      : false,
  };
}

/**
 * 도루 입력값의 실제 분포 (Phase 3-b).
 *
 * ⚠ **추측으로 계수를 만지면 빗나간다.** `STEAL_2B_SPEED_PIVOT`을 40 → 50으로
 * 올리면 시도가 크게 줄 거라 봤는데 실측 도루 중앙이 22 → 23으로 그대로였다.
 * 리그 타자의 `speed`·`baseInstinct`가 실제로 얼마인지를 안 보고 고쳤기 때문이다.
 *
 * 시도 확률은 `(speed − pivot) × 0.008 × (instinct / 50) × hold_factor`다.
 * **instinct가 높으면 speed가 낮아도 확률이 커진다** — 두 값을 같이 봐야 한다.
 */
export function stealInputProbe(leagueId = "LEAGUE_KBL"): Record<string, unknown> {
  const g = get(gameStore);
  const live = get(npcLiveStatsStore);
  const sp: number[] = [], inst: number[] = [], hold: number[] = [];
  for (const n of g.npcs) {
    if (n.currentLeague !== leagueId || n.careerStatus !== "active") continue;
    if (n.playerType === "pitcher") {
      const h = live[n.npcId]?.pitching?.holdRunners ?? n.pitching?.holdRunners;
      if (typeof h === "number") hold.push(h);
    } else {
      const b = live[n.npcId]?.batting ?? n.batting;
      if (typeof b?.speed === "number") sp.push(b.speed);
      if (typeof b?.baseInstinct === "number") inst.push(b.baseInstinct);
    }
  }
  const q = (v: number[], f: number) => {
    if (v.length === 0) return 0;
    const s = [...v].sort((a, b) => a - b);
    return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * f))] * 10) / 10;
  };
  // 지금 계수로 평균 주자의 시도 확률이 얼마인지 — 이게 판단의 핵심이다.
  //
  // ⚠ **계수를 여기 복제하면 낡는다.** 실제로 `tuning.rs`의 pivot을 50 → 75로
  // 올린 뒤에도 이 줄이 50을 쓰고 있어 "시도확률 30%"라고 계속 표시했다.
  // 값은 `STEAL_2B_SPEED_PIVOT` 75 · `STEAL_INSTINCT_PIVOT` 75다
  // (Rust 상수라 여기서 읽을 수 없으니, 바꿀 때 같이 고칠 것).
  const PIVOT = 75, INST_PIVOT = 75, SCALE = 0.008, MAX = 0.30;
  const attemptAt = (speed: number, instinct: number) =>
    Math.round(Math.max(0, Math.min(MAX,
      (speed - PIVOT) * SCALE * (instinct / INST_PIVOT))) * 1000) / 10;
  return {
    타자수: sp.length,
    "speed_p25": q(sp, 0.25), "speed_중앙": q(sp, 0.5), "speed_p75": q(sp, 0.75), "speed_p95": q(sp, 0.95),
    "instinct_중앙": q(inst, 0.5), "instinct_p95": q(inst, 0.95),
    "holdRunners_중앙": q(hold, 0.5),
    "시도%_중앙주자": attemptAt(q(sp, 0.5), q(inst, 0.5)),
    "시도%_상위주자": attemptAt(q(sp, 0.95), q(inst, 0.95)),
  };
}

// ── NPC 생애 추적 (개별 선수) ────────────────────────────────────────────────
//
// ⚠ **집계로는 못 잡는 층이 있다.** 이 작업에서 잡은 결함(세이브 0, 도루 0,
// 병역 정원 누수, CP 미생성)이 전부 집계로는 정상이었다. 총원·평균·건수는
// 맞는데 **개인의 이력이 앞뒤가 안 맞는** 경우가 남는다:
//
//   · 팀을 옮겼는데 옛 팀 로스터에 그대로 있다 (총원이 맞아 안 보인다)
//   · 은퇴했는데 다음 시즌 라인업에 나온다
//   · 커리어 이벤트는 `trade`인데 소속은 그대로다
//   · OVR이 10대에 떨어지고 30대에 오른다 (평균은 정상)
//   · 고교에서 1군으로 직행한다 (경로에 없는 점프)
//
// 그래서 **표시한 선수 몇 명을 여러 시즌 따라간다.**

export interface CohortPick { id: string; label: string }

/**
 * 추적할 선수를 리그·학년별로 뽑는다. **주인공을 반드시 넣는다** —
 * 주인공만 다른 경로를 타는지가 이 검사의 핵심 중 하나다.
 *
 * `spec`은 `{ "LEAGUE_HIGHSCHOOL:1": 20, "LEAGUE_KBL": 10, ... }` 꼴이다.
 * 키에 `:학년`이 붙으면 그 학년만 고른다.
 */
export function pickCohort(spec: Record<string, number>, seed = 12345): CohortPick[] {
  const g = get(gameStore);
  // 결정적으로 고른다 — 시드가 같으면 같은 코호트라 재현이 된다
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  const out: CohortPick[] = [
    { id: g.protagonist.id, label: "주인공" },
  ];
  for (const [key, n] of Object.entries(spec)) {
    const [leagueId, gradeStr] = key.split(":");
    const grade = gradeStr ? Number(gradeStr) : null;
    const pool = g.npcs.filter((x) =>
      x.careerStatus === "active" &&
      x.currentLeague === leagueId &&
      (grade == null || x.grade === grade));
    // 셔플 후 앞에서 n명 — 팀 순서에 쏠리지 않게
    const idx = pool.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    for (const i of idx.slice(0, n)) out.push({ id: pool[i].npcId, label: key });
  }
  return out;
}

/**
 * 표시한 선수들의 **지금 상태**. 매 시즌 불러 이력을 쌓는다.
 *
 * ⚠ 팀 로스터가 그 선수를 실제로 포함하는지도 같이 본다 — 소속 필드만 보면
 * **한쪽만 바뀐 이동**을 못 잡는다.
 */
export function cohortSnapshot(ids: string[]): Record<string, unknown> {
  const g = get(gameStore);
  const m = get(masterStore);
  const live = get(npcLiveStatsStore);
  const want = new Set(ids);
  const teamIds = new Set(m.teams.map((t) => t.id));
  const out: Record<string, unknown> = {};

  const p = g.protagonist;
  if (want.has(p.id)) {
    out[p.id] = {
      리그: p.leagueId, 팀: p.teamId, 나이: p.age,
      ovr: Math.round(p.pitching?.ovr ?? p.batting?.ovr ?? 0),
      상태: p.retirement ? "retired" : p.careerStage,
      이벤트: (p.careerEvents ?? []).length,
      팀존재: !p.teamId || teamIds.has(p.teamId),
      로스터포함: true,   // 주인공은 npcs에 없다 — 별도 경로다
    };
  }
  for (const n of g.npcs) {
    if (!want.has(n.npcId)) continue;
    const ovr = live[n.npcId]?.pitching?.ovr ?? live[n.npcId]?.batting?.ovr
      ?? n.pitching?.ovr ?? n.batting?.ovr ?? 0;
    out[n.npcId] = {
      리그: n.currentLeague, 팀: n.currentTeam, 나이: n.age,
      학년: n.grade ?? null,
      ovr: Math.round(ovr),
      상태: n.careerStatus,
      이벤트: (n.careerEvents ?? []).length,
      // 소속 팀이 refs에 실재하는가 — 없는 팀으로 가는 결함이 실제로 있었다
      팀존재: !n.currentTeam || teamIds.has(n.currentTeam),
      로스터포함: true,
    };
  }
  return out;
}

/**
 * 병역 연도별 장부 — **누가 언제 어디로 갔는가.**
 *
 * ⚠ 집계 스냅샷으로는 "지금 몇 명이 복무 중"만 보인다. 연도별 유입을 보려면
 * `militaryEnlistYear`(입대 연도)와 `military_exempt` 커리어 이벤트를 세야 한다 —
 * 둘 다 저장돼 있으므로 한 번의 스냅샷으로 전 기간을 복원할 수 있다.
 *
 * 상무 정원은 `rosterSize / 복무연수`(26/2 = 13)가 상한이다. 그보다 많으면
 * 정원 제어가 새는 것이고, 0이면 선발이 죽은 것이다.
 */
export function militaryLedgerProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const byYear: Record<number, { 상무: number; 현역: number; 면제: number }> = {};
  const bump = (y: number, k: "상무" | "현역" | "면제") => {
    if (!Number.isFinite(y)) return;
    byYear[y] = byYear[y] ?? { 상무: 0, 현역: 0, 면제: 0 };
    byYear[y][k] += 1;
  };

  const scan = (
    unit: string | null | undefined, enlistYear: number | null | undefined,
    events: Array<{ year: number; eventType: string }> | undefined,
  ) => {
    if (enlistYear != null) bump(enlistYear, unit === "sports" ? "상무" : "현역");
    for (const e of events ?? []) {
      if (e.eventType === "military_exempt") bump(e.year, "면제");
    }
  };

  for (const n of g.npcs) {
    // ⚠ **복무 중이면 `militaryUnit`, 전역했으면 `militaryServedUnit`이다.**
    // 예전엔 앞쪽만 봐서 전역자가 전부 현역으로 집계됐다
    scan(n.militaryServedUnit ?? n.militaryUnit, n.militaryEnlistYear, n.careerEvents);
  }
  // 주인공도 센다 — 이 작업에서 면제·은퇴가 "NPC는 되는데 주인공은 안 되는"
  // 결함이었다. 장부에 주인공이 빠지면 그걸 또 놓친다
  const p = g.protagonist;
  scan(p.militaryServedUnit ?? p.militaryUnit, p.militaryEnlistYear, p.careerEvents);

  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  return {
    연도별: years.map((y) => ({ 연도: y, ...byYear[y] })),
    합계: years.reduce((a, y) => ({
      상무: a.상무 + byYear[y].상무,
      현역: a.현역 + byYear[y].현역,
      면제: a.면제 + byYear[y].면제,
    }), { 상무: 0, 현역: 0, 면제: 0 }),
    // 지금 복무 중인 인원 — 정상상태가 정원(26) 근처여야 한다
    현재복무: g.npcs.filter((n) => n.careerStatus === "military").length,
    현재상무: g.npcs.filter((n) => n.careerStatus === "military" && n.militaryUnit === "sports").length,
  };
}

/**
 * 재능(잠재력) 분포 — **꼬리가 실제 세계에 존재하는가.**
 *
 * ⚠ OVR 상관 측정으로는 이걸 못 본다. 2026년에 태어난 꼬리는 16~18세라
 * 2032년에도 22~24세다 — **효과가 KBL 1군 상위권에 도착하려면 10~15년**이
 * 걸린다. 6시즌 측정에서 "안 변했다"를 보고 되돌리면 안 된다.
 *
 * 여기선 나이대별로 나눠 본다: 어린 층에 높은 잠재력이 실제로 깔렸는가.
 */
export function potentialProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const rows: Array<{ pot: number; age: number; lg: string }> = [];
  for (const n of g.npcs) {
    if (n.careerStatus === "retired") continue;
    const pot = (n as unknown as { potentialHidden?: number }).potentialHidden;
    if (typeof pot !== "number" || !(pot > 0)) continue;
    rows.push({ pot, age: n.age ?? 0, lg: n.currentLeague ?? "-" });
  }
  if (rows.length === 0) return { 표본: 0 };
  const q = (v: number[], f: number) => {
    const s = [...v].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * f))];
  };
  const band = (lo: number, hi: number) => {
    const v = rows.filter((r) => r.age >= lo && r.age <= hi).map((r) => r.pot);
    if (v.length === 0) return "-";
    // 90 이상이 몇 %인가 — 에이스가 될 수 있는 층의 두께다
    const elite = v.filter((x) => x >= 90).length;
    return `n${v.length} 중앙${q(v, 0.5)} p90 ${q(v, 0.9)} 최대${Math.max(...v)}`
         + ` · 90이상 ${(elite / v.length * 100).toFixed(1)}%`;
  };
  return {
    표본: rows.length,
    "16-18세": band(16, 18),
    "19-22세": band(19, 22),
    "23-27세": band(23, 27),
    "28세이상": band(28, 99),
  };
}

/**
 * 득점권 스플릿이 **리그 기록에 실제로 쌓이는가.**
 *
 * ⚠ 엔진 검사(`득점권_기록이_쌓인다`)는 `sim_game`만 본다. 그 값이 TS
 * 누적을 거쳐 시즌 기록에 남는지는 별개다 — 이 프로젝트에서 세이브·도루가
 * 정확히 그 층에서 0이었다(엔진은 만드는데 아무도 안 받았다).
 */
export function rispSplitProbe(leagueId = "LEAGUE_KBL"): Record<string, unknown> {
  const s = get(seasonStore);
  const stats = s.leagueState?.[leagueId]?.stats ?? {};
  let pAb = 0, pH = 0, pRAb = 0, pRH = 0, pN = 0;
  let bAb = 0, bH = 0, bRAb = 0, bRH = 0, bN = 0;
  for (const st of Object.values(stats)) {
    const r = st as unknown as {
      type: string; ab?: number; h?: number; ip?: number;
      rispAb?: number; rispH?: number;
    };
    if (r.type === "pitcher") {
      // ⚠ **ip·ab로 거르면 안 된다.** 아웃을 하나도 못 잡고 강판된 투수도,
      // 볼넷만 얻고 타수가 없는 타자도 그 타석에 서 있었다. 표본을 자르면
      // **투타 대사가 어긋난 것처럼 보인다**(실측 2026년 불일치가 이것이었다).
      // 대사 검사는 "같은 타석을 양쪽이 세는가"를 보는 것이라 자르면 안 된다.
      pN++; pH += r.h ?? 0; pRAb += r.rispAb ?? 0; pRH += r.rispH ?? 0;
      // 투수 타수는 안 들고 있다 — 비중은 타자 쪽으로 본다
    } else {
      bN++; bAb += r.ab ?? 0; bH += r.h ?? 0; bRAb += r.rispAb ?? 0; bRH += r.rispH ?? 0;
    }
  }
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    투수: pN, 타자: bN,
    "득점권 타석비중": bAb > 0 ? r3(bRAb / bAb) : 0,
    "전체 타율": bAb > 0 ? r3(bH / bAb) : 0,
    "득점권 타율": bRAb > 0 ? r3(bRH / bRAb) : 0,
    "투수 득점권 피안타": pRH,
    "투수 득점권 타수": pRAb,
    // 투타 대사 — 같은 타석을 양쪽이 세므로 합계가 같아야 한다
    "대사 일치": bRAb === pRAb,
    _피안타합: pH,
  };
}

/**
 * 육성선수 병목 — **상한인가 유출인가.**
 *
 * 실패한 2군 팀이 야수 17·투수 6이면 short = 3이라 상한 4에 안 걸린다.
 * 그러면 maxPerYear를 올려도 안 고쳐진다 — 유출이 더 빠른 것이다.
 * 이번 세션에서 하한을 추측으로 올려 1군을 굶긴 적이 있어, 숫자를 만지기
 * 전에 병목을 먼저 잰다.
 */
/**
 * 세계 상태 요약 — **두 실행이 어디서 갈리는지** 찾는 데 쓴다.
 *
 * 🔴 엔진에 `thread_rng`이 남아 있어 같은 씨앗도 실행마다 결과가 다르다.
 * 최종 숫자만 비교하면 "다르다"만 알고 **어디서** 갈렸는지는 모른다.
 * 주마다 이 값을 찍어 두 실행을 나란히 놓으면 **처음 갈린 주**가 잡힌다.
 *
 * ⚠ 갈래를 나눠 찍는다. 하나로 합치면 어느 계통이 갈렸는지 안 보인다 —
 * 로스터가 갈렸는지, 성적이 갈렸는지, 부상이 갈렸는지가 원인을 가른다.
 */
/** 소속 원본 — 로스터가 갈렸을 때 **누가** 다른지 본다 */
export function rosterRows(): string[] {
  const g = get(gameStore);
  return [...g.npcs]
    .sort((a, b) => (a.npcId < b.npcId ? -1 : a.npcId > b.npcId ? 1 : 0))
    .map((n) => `${n.npcId}|${n.currentTeam}|${n.currentLeague}|${n.careerStatus}`);
}

/** 계약 원본 — 체크섬이 갈렸을 때 **누가** 다른지 보려고 쓴다 */
export function contractRows(): string[] {
  const g = get(gameStore);
  return [...g.npcs]
    .sort((a, b) => (a.npcId < b.npcId ? -1 : a.npcId > b.npcId ? 1 : 0))
    .map((n) => `${n.npcId}|${n.currentLeague}|${n.currentSalary}|${n.contractYears}|${n.age}`);
}

export function worldChecksum(): Record<string, string> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const hash = (parts: string[]): string => {
    let h = 2166136261;
    for (const part of parts) {
      for (let i = 0; i < part.length; i++) {
        h ^= part.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      h = Math.imul(h ^ 0x2f, 16777619) >>> 0;
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  };

  // 소속·신분 — 이적·방출·은퇴가 갈리면 여기가 먼저 변한다
  const roster = [...g.npcs]
    .sort((a, b) => (a.npcId < b.npcId ? -1 : a.npcId > b.npcId ? 1 : 0))
    .map((n) => `${n.npcId}|${n.currentTeam}|${n.currentLeague}|${n.careerStatus}`);

  // 계약 — 연봉·계약연수는 FA·재계약이 갈리면 변한다
  const contract = [...g.npcs]
    .sort((a, b) => (a.npcId < b.npcId ? -1 : a.npcId > b.npcId ? 1 : 0))
    .map((n) => `${n.npcId}|${n.currentSalary}|${n.contractYears}|${n.age}`);

  // 부상 — 주간 판정이 갈리면 여기가 먼저다
  const injury = Object.entries(s.npcInjuries ?? {})
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, v]) => `${id}|${(v as { severity?: string })?.severity ?? ""}`);

  // 성적 — 경기 결과가 갈리면 여기다
  const stats: string[] = [];
  for (const [lid, ls] of Object.entries(s.leagueState ?? {}).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const rows = (ls as { standings?: Array<{ teamId: string; wins: number; losses: number }> })?.standings ?? [];
    for (const st of [...rows].sort((a, b) => (a.teamId < b.teamId ? -1 : 1))) {
      stats.push(`${lid}|${st.teamId}|${st.wins}|${st.losses}`);
    }
  }

  return {
    roster: hash(roster),
    contract: hash(contract),
    injury: hash(injury),
    standings: hash(stats),
    n: String(g.npcs.length),
  };
}
export function farmDevProbe(): Record<string, unknown> {
  const log = getFarmDevLog();
  if (log.length === 0) return { 판정건수: 0, 비고: "육성선수 판정이 한 번도 안 돌았다" };
  const capped = log.filter((r) => r.capped).length;
  const wantZero = log.filter((r) => r.want <= 0).length;
  const noCat = log.filter((r) => r.noCatcher).length;
  const shorts = log.map((r) => r.short).sort((a, b) => a - b);
  const pits = log.map((r) => r.pit).sort((a, b) => a - b);
  const q = (v: number[], f: number) => v[Math.min(v.length - 1, Math.floor(v.length * f))];
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  return {
    판정건수: log.length,
    "상한에 걸린 비율": Math.round((capped / log.length) * 100) / 100,
    "부족 0이라 건너뛴 비율": Math.round((wantZero / log.length) * 100) / 100,
    "포수 0명이던 건수": noCat,
    "부족 중앙": q(shorts, 0.5),
    "부족 p90": q(shorts, 0.9),
    "부족 최대": shorts[shorts.length - 1],
    "2군 투수 중앙": q(pits, 0.5),
    "2군 투수 최소": pits[0],
    "총 생성 요청": sum(log.map((r) => r.want)),
  };
}

/**
 * 육성선수 제도 실측 — **공급을 열었더니 드래프트가 무의미해졌는가.**
 *
 * 배선을 고쳐(`farmTeamIds`) 미지명자가 프로 2군으로 흘러가게 했는데,
 * 그것만 하면 2군이 두꺼워져 드래프트 지명의 가치가 떨어진다. 그래서
 * 세 가지를 같이 본다:
 *
 *   ① **진로 분포** — 갈 곳이 생겼는가. 예전엔 시즌당 1,135명이 그만뒀다
 *   ② **2군 구성** — 육성선수가 정식 로스터를 밀어냈는가
 *   ③ **드래프트 가치** — 지명자와 육성선수가 실제로 다른 대우를 받는가
 *
 * ⚠ ③이 핵심이다. ①만 좋아지고 ③이 무너지면 "미지명이 나은 선택"이 되어
 * 드래프트라는 갈림길 자체가 사라진다.
 */
export function devPlayerProbe(): Record<string, unknown> {
  const npcs = get(gameStore).npcs;
  const year = get(seasonStore).seasonYear;

  // ── ① 진로 분포 (연도별) ──────────────────────────────
  // `draft_undrafted`와 `quit_baseball`은 **같은 판정의 두 결과다**
  // (`Placer::place`). 둘을 같이 세야 "갈 곳이 생겼는지"가 보인다
  const route: Record<string, Record<string, number>> = {};
  for (const n of npcs) {
    for (const e of n.careerEvents ?? []) {
      if (e.eventType !== "draft_undrafted" && e.eventType !== "quit_baseball") continue;
      const y = String(e.year);
      const dest = e.eventType === "quit_baseball" ? "그만둠" : (e.toLeagueId ?? "?");
      route[y] ??= {};
      route[y][dest] = (route[y][dest] ?? 0) + 1;
    }
  }

  // ── ①-b 경로별 분포 ───────────────────────────────────
  // ⚠ **`Placer`를 타는 경로가 둘이다** — 오프시즌(방출·미계약 FA)과
  // 드래프트(미지명). 둘은 `event_type`이 다르고 **실행 시점도 다르다.**
  // 합쳐서 세면 한쪽만 도는 걸 못 본다. 실제로 ①에서 2군이 0으로 보였는데
  // 육성선수는 존재해서, 어느 경로가 도는지 구분해야 했다.
  const byKind: Record<string, Record<string, number>> = {};
  for (const n of npcs) {
    for (const e of n.careerEvents ?? []) {
      const dest = e.toLeagueId ?? (e.toTeamId ? "?팀만" : "—");
      const k = e.eventType ?? "?";
      // 진로 배정으로 보이는 것만 (지명·트레이드·FA는 별개 사건이다)
      if (!/undrafted|quit|release|placed|fa_/.test(k)) continue;
      byKind[k] ??= {};
      byKind[k][dest] = (byKind[k][dest] ?? 0) + 1;
    }
  }

  // ── ①-c 2군 자리 여유 ─────────────────────────────────
  // "왜 0명인가"의 답은 자리이거나 배선이다. 자리를 안 재면 또 추측한다
  const master = get(masterStore);
  const kblFarmTeams = master.teams
    .filter(t => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_2"))
    .map(t => t.id);
  const farmMax = 34;   // rosterRules.LEAGUE_KBL_FARM.rosterMax
  const occupancy = kblFarmTeams.map(tid => ({
    tid,
    n: npcs.filter(n => n.currentTeam === tid && n.careerStatus !== "retired").length,
  }));
  const freeSlots = occupancy.reduce((a, o) => a + Math.max(0, farmMax - o.n), 0);

  // ── ② 2군 구성 ────────────────────────────────────────
  const farm = npcs.filter(n => n.currentLeague?.endsWith("_FARM") && n.careerStatus === "active");
  const dev  = farm.filter(n => n.developmentSince != null);
  const perTeam = new Map<string, { all: number; dev: number }>();
  for (const n of farm) {
    const t = perTeam.get(n.currentTeam) ?? { all: 0, dev: 0 };
    t.all++; if (n.developmentSince != null) t.dev++;
    perTeam.set(n.currentTeam, t);
  }
  const devShares = [...perTeam.values()].map(t => t.dev / Math.max(1, t.all)).sort((a, b) => a - b);
  const sizes = [...perTeam.values()].map(t => t.all).sort((a, b) => a - b);

  // ── ③ 드래프트 가치 ───────────────────────────────────
  // **1군에 도달했는가**로 본다. 능력치 비교만 하면 "생성 때 낮게 줬으니
  // 낮다"는 동어반복이 된다 — 제도가 실제로 갈라놓는지는 결과가 말한다
  const isPro1 = (n: typeof npcs[number]) =>
    !!n.currentLeague && !n.currentLeague.endsWith("_FARM") &&
    (n.currentLeague === "LEAGUE_KBL" || n.currentLeague === "LEAGUE_ABL" || n.currentLeague === "LEAGUE_JBL");
  const everDrafted = (n: typeof npcs[number]) =>
    (n.careerEvents ?? []).some(e => e.eventType === "draft_picked");
  const everDev = (n: typeof npcs[number]) =>
    n.developmentSince != null ||
    (n.careerEvents ?? []).some(e =>
      e.eventType === "draft_undrafted" && e.toLeagueId?.endsWith("_FARM"));

  const draftedAll = npcs.filter(everDrafted);
  const devAll     = npcs.filter(n => everDev(n) && !everDrafted(n));
  const rate = (v: typeof npcs) => v.length === 0 ? null
    : Math.round((v.filter(isPro1).length / v.length) * 100) / 100;
  const salaryMed = (v: typeof npcs) => {
    const s = v.map(n => n.currentSalary ?? 0).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };

  const q = (v: number[], f: number) => v.length
    ? Math.round(v[Math.min(v.length - 1, Math.floor(v.length * f))] * 100) / 100 : null;

  return {
    시즌: year,
    "① 진로 분포": route,
    "①b 경로별": byKind,
    "①c KBL 2군 팀수": kblFarmTeams.length,
    "①c KBL 2군 여유자리": freeSlots,
    "①c KBL 2군 인원": occupancy.map(o => o.n).sort((a, b) => a - b),
    "② 2군 팀수": perTeam.size,
    "② 2군 인원": farm.length,
    "② 육성선수": dev.length,
    "② 팀당 인원 중앙": q(sizes, 0.5),
    "② 팀당 인원 최대": sizes[sizes.length - 1] ?? null,
    "② 육성 비중 중앙": q(devShares, 0.5),
    "② 육성 비중 최대": q(devShares, 1),
    "③ 지명자 수": draftedAll.length,
    "③ 지명자 1군 도달률": rate(draftedAll),
    "③ 지명자 연봉 중앙": salaryMed(draftedAll),
    "③ 육성선수 수": devAll.length,
    "③ 육성 1군 도달률": rate(devAll),
    "③ 육성 연봉 중앙": salaryMed(devAll),
  };
}

/**
 * 메일함 압력 — **밀려나는가, 안 오는가.**
 *
 * `trimMailbox`는 상한 50건이고 미결 선택지만 보존한다. **읽음 여부는 안 본다** —
 * 안 읽은 소식도 새 소식에 밀린다. 주당 생산량이 상한에 비해 얼마나 되는지
 * 모르면 "소식이 안 왔다"와 "밀려서 사라졌다"를 구분할 수 없다.
 */
export function mailboxProbe(): Record<string, unknown> {
  const box = get(gameStore).mailbox;
  const byCat: Record<string, number> = {};
  const bySender: Record<string, number> = {};
  for (const m of box) {
    byCat[m.category] = (byCat[m.category] ?? 0) + 1;
    bySender[m.sender] = (bySender[m.sender] ?? 0) + 1;
  }
  const unread = box.filter(m => m.readAt === null).length;
  const undecided = box.filter(m => m.decision?.selectedOptionId === null).length;
  const withMeta = box.filter(m => m.metadata).length;
  const metaTypes: Record<string, number> = {};
  for (const m of box) {
    const t = (m.metadata as { type?: string } | undefined)?.type;
    if (t) metaTypes[t] = (metaTypes[t] ?? 0) + 1;
  }
  // 가장 오래된 소식이 몇 주 전인가 — 상한에 걸리면 이 값이 안 늘어난다
  const oldest = box[box.length - 1]?.createdAt ?? null;
  const newest = box[0]?.createdAt ?? null;
  return {
    보유: box.length,
    // ⚠ **여기 50을 적어두면 안 된다.** 정본은 `game.ts`의 `MAX_MAILBOX`고,
    // 계측기가 자기 상한을 들고 있으면 상한을 바꿔도 **계측만 옛 기준으로**
    // "상한 미도달"을 찍는다 — 판정이 아니라 잣대가 틀어지는 형태다
    상한: MAX_MAILBOX,
    안읽음: unread,
    미결선택: undecided,
    // 살아남은 것만 세면 "안 온 건가 밀려난 건가"를 못 가른다
    "밀려남(누계)": mailboxTrimStats.dropped,
    "밀려남-안읽음": mailboxTrimStats.droppedUnread,
    "밀려남-분류별": mailboxTrimStats.droppedByCategory,
    "카드형(metadata)": withMeta,
    "카드 종류": metaTypes,
    분류별: byCat,
    보낸이별: bySender,
    최신: newest,
    최고참: oldest,
  };
}

/**
 * 소식 **종류별** 인구조사 — 통합 후보를 찾기 위한 조사 도구.
 *
 * `mailboxProbe`는 `category` 4종·보낸이로만 센다. 그런데 실제 종류는 id
 * 접두사 기준 **43종**이라, 분류로 보면 `system`·`news`에 뭉뚱그려져 **무엇이
 * 몇 통인지가 안 보인다.** 부상 소식을 사람마다 한 통에서 월 1회 리포트로
 * 묶었던 것과 같은 정리를 하려면 종류별 빈도가 먼저 있어야 한다.
 *
 * 종류는 `id`에서 뽑는다 — 주차·연도·타임스탬프를 떼면 생성 지점이 남는다
 * (`msg-train-w12-1712...` → `msg-train`). `subject`로 묶으면 문장 뱅크가
 * 같은 종류를 여러 갈래로 쪼개서 못 쓴다.
 */
export function mailboxCensus(): Record<string, unknown> {
  const box = get(gameStore).mailbox;
  // 종류 규칙의 정본은 `game.ts`의 `messageKindOf`다 — 여기 또 적으면 두 벌이 된다
  const rows: Record<string, { n: number; cat: string; senders: Set<string>; meta: string | null }> = {};
  for (const m of box) {
    const k = messageKindOf(m.id);
    const r = rows[k] ?? (rows[k] = { n: 0, cat: m.category, senders: new Set(), meta: null });
    r.n++;
    r.senders.add(m.sender);
    const t = (m.metadata as { type?: string } | undefined)?.type;
    if (t) r.meta = t;
  }
  const out = Object.entries(rows)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([kind, r]) => ({
      종류: kind, 건수: r.n, 분류: r.cat,
      보낸이: [...r.senders].slice(0, 3).join("/") + (r.senders.size > 3 ? ` 외${r.senders.size - 3}` : ""),
      카드: r.meta ?? "",
    }));
  return { 총건수: box.length, 종류수: out.length, 목록: out };
}

/**
 * **생산** 누계 — 메일함에 남아 있든 밀려났든 만들어진 전부.
 *
 * 시즌 경계마다 이걸 찍어 **차분**하면 그 시즌에 무엇이 몇 통 왔는지가 나온다.
 * 메일함을 훑는 `mailboxCensus`로는 못 하는 일이다 — 상한에 밀려 사라진 종류는
 * 0으로 보이고, 여러 시즌을 밀면 고교와 프로 소식이 한 상자에 섞인다.
 */
export function mailboxProduceProbe(): Record<string, unknown> {
  return { 총생산: mailboxProduceStats.total, 종류별: { ...mailboxProduceStats.byKind } };
}

/**
 * **시즌 종료 중복 실행 가드가 재시작을 견디는가** (2026-08-08 조사).
 *
 * `processSeasonEnd`에는 `lastSeasonEndYear` 가드가 있고 주석에 위험이 적혀
 * 있다 — *"가드가 없으면 학년이 두 번 오르고 나이가 두 살 는다."* 그런데 그
 * 필드는 `SaveGame`에 없다. 즉 **앱을 껐다 켜면 가드가 사라진다.**
 *
 * 여기서는 `toSaveGame()` → `hydrateFromSlot()` 왕복으로 재시작을 그대로
 * 재현한다(로드가 쓰는 바로 그 경로다). 가드가 살아 있으면 두 번째 호출이
 * 아무것도 안 바꿔야 한다.
 *
 * ⚠ 실제 피해는 주인공 학년이 아니라 **NPC 5,600명의 나이**다. 그쪽은
 * slot.db에 즉시 쓰이므로 되돌릴 수 없다.
 */
export async function seasonEndGuardProbe(): Promise<Record<string, unknown>> {
  const year = get(seasonStore).seasonYear;
  const sample = (): { age: number; grade: number | null; id: string }[] =>
    get(gameStore).npcs.slice(0, 5).map((n) => ({
      id: n.npcId, age: n.age, grade: (n as { grade?: number }).grade ?? null,
    }));
  const protoOf = () => {
    const p = get(gameStore).protagonist;
    return { grade: p.grade ?? null, age: p.age };
  };

  const before = { npc: sample(), proto: protoOf() };
  await gameStore.processSeasonEnd(year);
  const after1 = { npc: sample(), proto: protoOf() };

  // 같은 세션에서 한 번 더 — 가드가 막아야 한다
  await gameStore.processSeasonEnd(year);
  const after2 = { npc: sample(), proto: protoOf() };

  // **재시작 재현** — 저장했다가 다시 싣는다. 가드는 SaveGame에 없다
  const slotId = get(gameStore).currentSlotId ?? "PROBE";
  gameStore.hydrateFromSlot(gameStore.toSaveGame(), slotId);
  await gameStore.processSeasonEnd(year);
  const after3 = { npc: sample(), proto: protoOf() };

  const dAge = (a: typeof before, b: typeof before) =>
    a.npc.length && b.npc.length ? b.npc[0].age - a.npc[0].age : 0;

  return {
    연도: year,
    "①처음": before,
    "②1회 실행": after1,
    "③같은 세션 재실행": after2,
    "④재시작 후 재실행": after3,
    "나이 증가 — 1회": dAge(before, after1),
    "나이 증가 — 같은 세션 재실행": dAge(after1, after2),
    "나이 증가 — 재시작 후": dAge(after2, after3),
    판정: dAge(after2, after3) === 0 ? "가드가 재시작을 견딘다" : "재시작하면 또 돈다 (결함)",
  };
}

/**
 * 포스트시즌 진단 (B-0).
 *
 * ⚠ **화면에 독립리그 브래킷 하나만 뜬다.** `backgroundPostseason.ts`가
 * KBL·KBL_FARM은 "일정 전부 소화"로, 독립은 "단계 종료"로 판정한다 —
 * 판정 근거가 리그마다 다르다. 여기서 그 둘을 나란히 찍어 어디서 어긋나는지
 * 본다. 추측으로 고치면 다른 리그에서 같은 게 또 난다.
 */
export function postseasonDiag(): {
  week: number;
  brackets: string[];
  leagues: Record<string, { sched: number; unplayed: number; lastWeek: number; done: boolean }>;
  survival: { stage: number; ranked: number } | null;
} {
  const s = get(seasonStore);
  const leagues: Record<string, { sched: number; unplayed: number; lastWeek: number; done: boolean }> = {};
  for (const lid of ["LEAGUE_KBL", "LEAGUE_KBL_FARM", "LEAGUE_UNIVERSITY", "LEAGUE_HIGHSCHOOL"]) {
    const sch = (s.leagueSchedules?.[lid] ?? []) as { result?: unknown; week: number }[];
    const unplayed = sch.filter((e) => !e.result).length;
    leagues[lid] = {
      sched: sch.length,
      unplayed,
      lastWeek: sch.reduce((mx, e) => Math.max(mx, e.week), 0),
      done: sch.length > 0 && unplayed === 0,
    };
  }
  return {
    week: s.currentWeek,
    brackets: Object.entries(s.postseasonBrackets ?? {})
      .filter(([, v]) => Array.isArray(v) && v.length > 0).map(([k]) => k),
    leagues,
    survival: s.survival
      ? { stage: s.survival.stage, ranked: s.survival.finalRanking?.length ?? 0 }
      : null,
  };
}

/** 저장된 과거 대회·포스트시즌 (B-1 확인용) */
export async function historyDiag(slotId: string, year: number): Promise<{
  tournaments: { id: string; league: string; champ: string; runnerUp: string; hasBracket: boolean }[];
  postseason: { league: string; champ: string; runnerUp: string; hasBracket: boolean }[];
}> {
  const api = (window as unknown as { projectB: Record<string, (p: string) => Promise<string>> }).projectB;
  const t = JSON.parse(await api.seasonGetHistoryTournaments(JSON.stringify({ slotId, seasonYear: year })));
  const p = JSON.parse(await api.seasonGetHistoryPostseason(JSON.stringify({ slotId, seasonYear: year })));
  return {
    tournaments: (Array.isArray(t) ? t : []).map((r: Record<string, string>) => ({
      id: r.tour_id, league: r.league_id, champ: r.champion_name,
      runnerUp: r.runner_up_name, hasBracket: !!r.bracket_json,
    })),
    postseason: (Array.isArray(p) ? p : []).map((r: Record<string, string>) => ({
      league: r.league_id, champ: r.champion_name,
      runnerUp: r.runner_up_name, hasBracket: !!r.bracket_json,
    })),
  };
}

/**
 * 리그별 1군 로스터 분포 (D-1).
 *
 * ⚠ `releaseScope.ts`에 **"1군 로스터 캡이 해외에 안 걸린다 — 왜 안 잘리는지
 * 아직 모른다"**고 적혀 있었고, 그게 ABL·JBL을 못 여는 마지막 이유였다.
 * JBL 팀당 최대 47명(상한 32), ABL 39명(상한 34). 추측 말고 센다.
 */
export function rosterDiag(): Record<string, {
  teams: number; min: number; max: number; total: number;
  batMin: number; pitMin: number;
  pitTotal?: number; batTotal?: number; pitRatio?: number;
}> {
  const g = get(gameStore);
  // ⚠ **총원만 세면 안 된다.** 이 프로젝트에서 반복해 나온 결함이 "집계는
  // 정상인데 구성이 무너진 것"이다 — 야수가 9명 미만이면 타순이 짧아져
  // 성적이 능력치가 아니라 출전량으로 결정된다. 보직별로 같이 센다.
  const byTeam = new Map<string, { league: string; n: number; bat: number; pit: number }>();
  for (const n of g.npcs) {
    if (n.careerStatus === "retired" || !n.currentTeam) continue;
    const cur = byTeam.get(n.currentTeam)
      ?? { league: n.currentLeague ?? "", n: 0, bat: 0, pit: 0 };
    cur.n++;
    if (n.playerType === "pitcher") cur.pit++; else cur.bat++;
    byTeam.set(n.currentTeam, cur);
  }
  const out: Record<string, {
    teams: number; min: number; max: number; total: number;
    batMin: number; pitMin: number;
    pitTotal?: number; batTotal?: number; pitRatio?: number;
  }> = {};
  for (const { league, n, bat, pit } of byTeam.values()) {
    const e = (out[league] ??= { teams: 0, min: 1e9, max: 0, total: 0, batMin: 1e9, pitMin: 1e9 });
    e.teams++; e.total += n;
    e.min = Math.min(e.min, n);
    e.max = Math.max(e.max, n);
    e.batMin = Math.min(e.batMin, bat);
    e.pitMin = Math.min(e.pitMin, pit);
  }
  for (const e of Object.values(out)) {
    if (e.min === 1e9) e.min = 0;
    if (e.batMin === 1e9) e.batMin = 0;
    if (e.pitMin === 1e9) e.pitMin = 0;
  }
  // ⚠ **비율을 같이 본다.** 최소값만 보면 "생성이 적게 만든 것"과 "만들어
  // 놓고 어디서 빠진 것"을 구분할 수 없다. 생성은 0.45로 만든다 —
  // 리그 비율이 0.45 근처면 생성은 정상이고 배분이 문제다.
  for (const { league, bat, pit } of byTeam.values()) {
    const e = out[league];
    e.pitTotal = (e.pitTotal ?? 0) + pit;
    e.batTotal = (e.batTotal ?? 0) + bat;
  }
  for (const e of Object.values(out)) {
    const tot = (e.pitTotal ?? 0) + (e.batTotal ?? 0);
    e.pitRatio = tot > 0 ? Math.round(((e.pitTotal ?? 0) / tot) * 1000) / 1000 : 0;
  }
  return out;
}

/**
 * 외국인 용병 출신 (E 확인용).
 *
 * ⚠ **예전엔 무에서 만들었다** — `careerHistory: []`로 넣어서 어디서 왔다는
 * 기록이 없었다. 이제 실재하는 해외 선수를 이적시킨다. 여기서 KBL 용병의
 * 경력에 `foreign_signing`이 있는지, 출신이 마이너/메이저 어느 쪽인지 센다.
 */
export function foreignDiag(): {
  total: number; withOrigin: number; byOrigin: Record<string, number>;
  sample: string[];
  overPaths: string[];
  maxPerTeam: number; teams: number;
  ablTotal: number; ablNationality: Record<string, number>; ablKoreanName: number;
} {
  const g = get(gameStore);
  const kbl = g.npcs.filter((n) =>
    n.careerStatus === "active"
    && n.currentLeague === "LEAGUE_KBL"
    && (n.nationality ?? "KOR") !== "KOR");
  const byOrigin: Record<string, number> = {};
  const sample: string[] = [];
  let withOrigin = 0;
  for (const n of kbl) {
    const ev = [...(n.careerEvents ?? [])].reverse()
      .find((e) => e.eventType === "foreign_signing");
    if (!ev) continue;
    withOrigin++;
    const from = ev.fromLeagueId ?? "?";
    byOrigin[from] = (byOrigin[from] ?? 0) + 1;
    if (sample.length < 5) {
      sample.push(`${n.name} ${n.age}세 · ${from.replace("LEAGUE_", "")} → ${n.currentTeam}`);
    }
  }
  // ⚠ **보유 한도(팀당 3명)가 지켜지는가.** 게이트를 열면 ABL·JBL 선수가
  // 일반 FA로도 KBL에 올 수 있다 — 그 경로는 외국인 한도를 안 본다
  const perTeam = new Map<string, number>();
  for (const n of kbl) perTeam.set(n.currentTeam, (perTeam.get(n.currentTeam) ?? 0) + 1);
  const maxPerTeam = Math.max(0, ...perTeam.values());

  // ⚠ **해외 리그 선수가 한국 이름인가.** `generateOverseasIntakeV3`가
  // `generateFreshmenNative`를 쓰는데 거긴 서양 이름 풀이 안 간다
  const overseas = g.npcs.filter((n) =>
    n.careerStatus === "active"
    && (n.currentLeague === "LEAGUE_ABL" || n.currentLeague === "LEAGUE_ABL_FARM"));
  const natCount: Record<string, number> = {};
  for (const n of overseas) {
    const k = n.nationality ?? "(없음)";
    natCount[k] = (natCount[k] ?? 0) + 1;
  }
  const koreanName = overseas.filter((n) => /^[가-힣]+$/.test(n.name ?? "")).length;

  // ⚠ **한도를 넘긴 팀의 초과분이 어느 경로로 들어왔는가.**
  // 경로를 모르면 고칠 곳도 모른다 — 이 작업에서 두 번 헛짚었다.
  const overPaths: string[] = [];
  for (const [teamId, n] of perTeam) {
    if (n <= 3) continue;
    for (const x of kbl.filter((y) => y.currentTeam === teamId)) {
      const last = [...(x.careerEvents ?? [])].reverse()[0];
      overPaths.push(
        `${teamId.replace("TEAM_KBL_", "").padEnd(20)} ${(x.name ?? "").padEnd(18)}`
        + ` ${last?.eventType ?? "(경력없음)"} ${last?.fromLeagueId ?? "-"}→${last?.toLeagueId ?? "-"}`,
      );
    }
  }

  return {
    total: kbl.length, withOrigin, byOrigin, sample,
    overPaths: overPaths.slice(0, 16),
    maxPerTeam, teams: perTeam.size,
    ablTotal: overseas.length, ablNationality: natCount, ablKoreanName: koreanName,
  };
}

/**
 * 새 게임 시점 용병 출신 시드 (E-③ 확인용).
 *
 * ⚠ 예전엔 `seedCareerHistory`가 외국인을 안 가려 Rust `entry_route`가
 * 입단 나이 23~34를 전부 **"독립"**으로 매겼다 — 세계 시작 시점의 KBL 용병이
 * **한국 독립리그 출신**으로 기록돼 있었다. 출신이 없는 것보다 나쁘다.
 */
export async function foreignSeedDiag(slotId: string): Promise<{
  rows: number; byCategory: Record<string, number>;
  years: number[]; signYears: number[]; sample: string[];
  domesticRouteOnForeigner: number;
}> {
  const api = (window as unknown as {
    projectB: Record<string, (p: string) => Promise<string>>;
  }).projectB;
  const raw = await api.leagueGetTransactions(JSON.stringify({ slotId }));
  const all = JSON.parse(raw) as Array<Record<string, string | number | null>>;

  const g = get(gameStore);
  const fgnIds = new Set(g.npcs
    .filter((n) => (n.nationality ?? "KOR") !== "KOR")
    .map((n) => n.npcId));

  const mine = (Array.isArray(all) ? all : [])
    .filter((r) => fgnIds.has(String(r.player_id ?? r.playerId ?? ""))
      || String(r.player_id ?? r.playerId ?? "").startsWith("PLY_FGN_GONE_"));

  const byCategory: Record<string, number> = {};
  const years = new Set<number>();
  const sample: string[] = [];
  let domesticRouteOnForeigner = 0;

  for (const r of mine) {
    const cat = String(r.category ?? "");
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    years.add(Number(r.season_year ?? r.seasonYear ?? 0));
    // ⚠ 이게 남아 있으면 국내 경력 생성이 아직 용병을 잡고 있다
    const detail = String(r.detail ?? "");
    if (/고졸|대졸|독립/.test(detail)) domesticRouteOnForeigner++;
    if (sample.length < 6) {
      sample.push(`${r.season_year ?? r.seasonYear} ${cat.padEnd(16)}`
        + ` ${String(r.player_name ?? r.playerName ?? "").padEnd(20)} ${detail}`);
    }
  }
  // ⚠ **영입 연도만 센다.** 떠난 기록(작년 고정)이 섞이면 영입이 전부 올해여도
  // "두 해"가 되어 검사가 통과한다 — 모의 결함으로 실제로 그랬다.
  const signYears = new Set<number>();
  for (const r of mine) {
    if (String(r.category ?? "") !== "foreign_signing") continue;
    signYears.add(Number(r.season_year ?? r.seasonYear ?? 0));
  }

  return {
    rows: mine.length, byCategory,
    years: [...years].sort(), signYears: [...signYears].sort(),
    sample, domesticRouteOnForeigner,
  };
}

/**
 * 관계도 실측 — **저장된 값**과 **엔진이 돌려주는 델타**를 같이 찍는다.
 *
 * 한쪽만 보면 못 가른다. 화면이 전원 "중립"일 때 원인은 셋이다:
 *   ① 엔진이 델타를 안 만든다 (조건이 안 맞음)
 *   ② 만드는데 저장이 안 된다
 *   ③ 둘 다 되는데 값이 밴드(−10~10)를 못 넘는다
 * `deltaCalls`/`deltaSum`이 0이면 ①, 값이 안 변하면 ②, 둘 다 돌면 ③이다.
 */
export async function relationProbe(): Promise<Record<string, unknown>> {
  const slotId = get(gameStore).currentSlotId;
  if (!slotId) return { error: "슬롯 없음" };
  const rows = await slotRepo.getRelationships(slotId);
  const byKind: Record<string, { n: number; min: number; max: number; sum: number }> = {};
  const byLabel: Record<string, number> = {};
  for (const r of rows) {
    const k = r.kind;
    byKind[k] ??= { n: 0, min: 999, max: -999, sum: 0 };
    byKind[k].n++;
    byKind[k].min = Math.min(byKind[k].min, r.value);
    byKind[k].max = Math.max(byKind[k].max, r.value);
    byKind[k].sum += r.value;
    const lab = relationLabel(r.value).label;
    byLabel[lab] = (byLabel[lab] ?? 0) + 1;
  }
  return {
    rows: rows.length,
    byKind,
    byLabel,
    contacts: rows.reduce<Record<string, number>>((a, r) => {
      a[r.contact] = (a[r.contact] ?? 0) + 1; return a;
    }, {}),
    sample: rows.slice(0, 6).map(r => `${r.kind} ${r.personId.slice(-6)} = ${r.value} (W${r.updatedWeek})`),
  };
}

/**
 * 관계 라벨 변화 소식이 **한 주에 몇 통 몰리는가.**
 *
 * ⚠ **살아남은 것만 센다.** 메일함은 상한 200이라 오래된 관계 소식은 잘린다 —
 * 여기 숫자는 "생산량"이 아니라 "지금 남아 있는 것"이다. 191주 실측에서
 * 신뢰가 31명인데 선택지 달린 소식이 0으로 나온 게 그 때문이다(결함 아님).
 * 생산량을 봐야 하면 `mailboxProduceStats`를 쓴다.
 *
 * 동료 30명이 팀 승리마다 똑같이 +1을 받는다 — 속도가 같으니 라벨 경계도
 * 비슷한 주에 함께 넘는다. 그 중 `신뢰` 진입은 **선택지가 달린 이벤트**라
 * 하나씩 답해야 진행된다. 몰리면 그 주가 통째로 막힌다.
 */
export function relationBurstProbe(): Record<string, unknown> {
  const box = get(gameStore).mailbox;
  const byWeek: Record<string, number> = {};
  let withChoice = 0;
  for (const m of box) {
    if (!m.id.startsWith("msg-rel-")) continue;
    const w = m.id.match(/-w(\d+)$/)?.[1] ?? "?";
    const y = m.id.match(/-(\d{4})-w\d+$/)?.[1] ?? "?";
    const k = `${y}w${w}`;
    byWeek[k] = (byWeek[k] ?? 0) + 1;
    if (m.decision) withChoice++;
  }
  const counts = Object.values(byWeek);
  return {
    총: counts.reduce((a, b) => a + b, 0),
    주수: counts.length,
    한주최대: counts.length ? Math.max(...counts) : 0,
    "2통이상인주": counts.filter(c => c >= 2).length,
    "3통이상인주": counts.filter(c => c >= 3).length,
    선택지달린것: withChoice,
    상위: Object.entries(byWeek).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, v]) => `${k}:${v}통`),
  };
}

/**
 * `together`인데 **실제로는 같은 팀이 아닌 사람**이 몇인가.
 *
 * `apart`로 가는 길이 `onProtagonistTeamChange` 하나뿐이라, **동료가**
 * 졸업·이적으로 떠나는 경우를 아무도 처리하지 않는다. 그러면 떠난 사람이
 * 계속 `together`로 남고, 주간 갱신이 `contact === "together"`만 보므로
 * **팀 승리마다 관계가 계속 오른다** — 같이 뛰지도 않는 사람과.
 *
 * 화면에서는 "지금 함께 58명 / 지난 인연 0"으로 보인다(3학년 실측).
 */
export async function staleRelationProbe(): Promise<Record<string, unknown>> {
  const g = get(gameStore);
  const slotId = g.currentSlotId;
  if (!slotId) return { error: "슬롯 없음" };
  const rows = await slotRepo.getRelationships(slotId, { contact: "together" });
  const myTeam = g.protagonist.teamId;
  const onTeam = new Set(
    g.npcs.filter(n => n.currentTeam === myTeam).map(n => n.npcId),
  );
  const staffIds = new Set(get(masterStore).staffEntities.map(e => e.id));
  const stale = rows.filter(r =>
    r.kind === "teammate" && !onTeam.has(r.personId) && !staffIds.has(r.personId));
  return {
    together: rows.length,
    동료행: rows.filter(r => r.kind === "teammate").length,
    실제같은팀: rows.filter(r => r.kind === "teammate" && onTeam.has(r.personId)).length,
    "떠났는데 together": stale.length,
    "그중 값이 오른 사람": stale.filter(r => r.value > 10).length,
    표본: stale.slice(0, 4).map(r => `${r.personId.slice(-6)} = ${r.value} (lastTeam ${r.lastTeam || "-"})`),
  };
}

/**
 * 훈련 실측용 — **주인공의 지금 상태를 한 장으로.**
 *
 * ⚠ `trainingArea`를 같이 낸다. 화면이 저장하는 프로그램 id 12개 중 10개가
 * 마스터 JSON에 없어서 `focus` 조회가 `undefined`가 되고, 그러면 코치
 * 담당영역 관계와 훈련 효율 보너스가 **조용히 안 붙는다**는 의심이 있다.
 * 코드를 읽어 세운 가설이라 **런타임으로 확인해야 한다** — 여기가 그 자리다.
 */
export async function trainingProbe(): Promise<Record<string, unknown>> {
  const g = get(gameStore);
  const p = g.protagonist;
  const plan = g.trainingPlan;
  const programs = get(masterStore).trainingPrograms;

  const focusOf = (id: string | null) =>
    id ? (programs.find((pr) => pr.id === id)?.focus ?? null) : null;

  const { trainingAreaOf } = await import("../../apps/ui/src/shared/usecases/relationships");
  const primaryFocus = focusOf(plan.primaryProgramId);

  return {
    주차: get(seasonStore).currentWeek,
    시즌: get(seasonStore).seasonYear,
    단계: p.careerStage,
    나이: p.age,
    OVR: Math.round((p.pitching?.ovr ?? 0) * 10) / 10,
    스탯: {
      velocity: p.pitching?.velocity, command: p.pitching?.command,
      control: p.pitching?.control, movement: p.pitching?.movement,
      stamina: p.pitching?.stamina, mentality: p.pitching?.mentality,
    },
    컨디션: Math.round(p.condition), 피로: Math.round(p.fatigue),
    // ⚠ **표본이 아니라 전수다.** `advanceWeek`이 매주 세는 카운터라
    // `autoRun`이 여러 주를 건너뛰어도 빠지지 않는다 (피로>70 · 컨디션<60)
    건강: p.seasonHealth ?? null,
    계획: [plan.primaryProgramId, plan.secondaryProgramId, plan.secondary2ProgramId],
    // ── 배선 확인 ──
    "주 프로그램 focus": primaryFocus,               // null이면 마스터에 그 id가 없다
    trainingArea: await trainingAreaOf(primaryFocus), // ""이면 코치 보너스가 죽는다
    "마스터 프로그램 수": programs.length,
    보유구종: (p.pitches ?? []).map((x) => `${x.id.replace("PITCH_", "")}:${x.grade}`),
    개발중구종: p.trainingPitchState
      ? `${p.trainingPitchState.id.replace("PITCH_", "")} ${Math.round(p.trainingPitchState.progress)}%`
      : null,
  };
}

/**
 * 폼 무너짐 실측 — **화면과 경기가 같은 값을 쓰는지**를 본다.
 *
 * 한쪽만 가면 결함이다. 경기에만 걸면 조용한 너프, 화면에만 적으면
 * "표시는 있는데 효과가 없는" 값이 된다.
 */
export async function formProbe(pitchId: string): Promise<Record<string, unknown>> {
  const g = get(gameStore);
  const p = g.protagonist;
  const cat = get(masterStore).pitchCatalog;
  const diff = cat.find((c) => c.id === pitchId)?.formDifficulty ?? 0;
  const { formPenalty } = await import("../../apps/ui/src/shared/utils/growthEngine");
  const pen = await formPenalty(diff, p.pitching.control);
  return {
    구종: pitchId, 난이도: diff,
    현재제구: p.pitching.control, 현재커맨드: p.pitching.command,
    하락: pen,
    적용후: { command: Math.max(1, p.pitching.command - pen.command),
             control: Math.max(1, p.pitching.control - pen.control) },
  };
}

/** 구종 개발을 시작시킨다 — 화면 확인용 */
export function startPitchDev(pitchId: string): void {
  gameStore.startPitchTraining(pitchId);
  gameStore.setTrainingPlan({ secondary2ProgramId: "TRN_PITCH_DEV" });
}

/** 주간 OVR 변화 분포 — `growth_threshold`를 정하려면 실제 값을 봐야 한다 */
export function ovrDeltaProbe(): Record<string, unknown> {
  const box = get(gameStore).logs.filter((l) => l.startsWith("[훈련]"));
  return { 훈련로그: box.length, 최근: box.slice(0, 3) };
}

/** 커리어 한 장 — 50회 조사가 회차마다 이걸 찍는다 */
export function careerProbe(): Record<string, unknown> {
  // 수상은 에 쌓인다 — 시즌 롤오버가 얹는다
  const _aw = (get(gameStore).protagonist.careerRecords ?? [])
    .flatMap((r: any) => (r.awards ?? []).map((a: any) => a.title ?? a.label))
    .filter(Boolean);
  const g = get(gameStore);
  const s = get(seasonStore);
  const p = g.protagonist;
  const cr = g.schoolState.careerResults;
  const ret = retired();
  return {
    수상: _aw,
    경력기록수: (get(gameStore).protagonist.careerRecords ?? []).length,
    산식내역: (globalThis as Record<string, unknown>).__lastDraftBreakdown ?? null,
    시즌: s.seasonYear, 주차: s.currentWeek,
    단계: p.careerStage, 나이: p.age, 학년: p.grade ?? null,
    팀: p.teamId, 리그: p.leagueId,
    OVR: p.pitching?.ovr ?? 0,
    구종: (p.pitches ?? []).map((x) => `${x.id.replace("PITCH_", "")}${x.grade}`).join("/"),
    지명: cr?.draftDrafted
      ? `${cr.draftRound}R ${cr.draftPick}P ${cr.draftTeamId}`
      : (cr ? "미지명" : null),
    대학합격: cr?.universityPassed?.length ?? null,
    독립합격: cr?.independentPassed?.length ?? null,
    병역: p.militaryStatus, 부대: p.militaryUnit,
    은퇴: ret ? `${ret.year} ${ret.reason}` : null,
  };
}

/** 훈련 슬롯 3칸을 한 번에 — 조사가 계획 축을 바꿀 때 쓴다 */
export function setTrainingSlots(slots: string[]): void {
  gameStore.setTrainingPlan({
    primaryProgramId:    slots[0] ?? null,
    secondaryProgramId:  slots[1] ?? null,
    secondary2ProgramId: slots[2] ?? null,
  });
}

/**
 * 또래 분포 — **주인공이 리그에서 몇 번째인가.**
 *
 * 드래프트가 상대평가로 바뀌면서 이게 진로를 정한다. 주인공 OVR만 보면
 * "62면 잘 큰 것 같은데 왜 9라운드지?"를 못 푼다 — 또래가 더 높으면
 * 62는 중위권이고 9R이 맞는 결과다.
 */
export function peerProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const p = g.protagonist;
  const peers = g.npcs
    .filter((n) => n.playerType === "pitcher" && n.grade === 3
      && n.currentLeague === "LEAGUE_HIGHSCHOOL" && n.npcId !== p.id)
    // ⚠ **live를 읽는다.** 생성값은 3년을 지나도 안 자란다 — 이 계측이
    // 바로 그걸 틀려서 '주인공 백분위 56'이라는 잘못된 수치를 보고했다
    .map((n) => livePitchingOvrOf(n, get(npcLiveStatsStore)))
    .filter((o) => o > 0)
    .sort((a, b) => a - b);
  if (peers.length === 0) return { 또래: 0, 경고: "또래가 0명 — 백분위 폴백이 걸린다" };
  const at = (q: number) => peers[Math.floor(peers.length * q)];
  const below = peers.filter((o) => o < (p.pitching?.ovr ?? 0)).length;
  return {
    또래: peers.length,
    또래OVR: { 최소: peers[0], p25: at(0.25), 중앙: at(0.5), p75: at(0.75), 최대: peers[peers.length - 1] },
    주인공OVR: p.pitching?.ovr ?? 0,
    주인공백분위: Math.round(below / peers.length * 100),
    성장률: p.developmentRate,
  };
}

/**
 * 조사용 튜닝 — **안(arm)별로 주인공만 손본다.**
 *
 * ⚠ 세계(NPC)는 안 건드린다. 또래 분포가 같아야 안끼리 비교가 된다.
 * OVR 가중합은 분모가 12.0이고 가중치 합도 12.0이라 **모든 스탯에 같은 값을
 * 더하면 OVR이 그만큼 오른다** — 스탯 균형을 안 흔들면서 시작점만 옮긴다.
 */
export function tuneProtagonist(t: { ovrDelta?: number; devRateMult?: number }): void {
  const g = get(gameStore);
  const p = g.protagonist;
  const d = t.ovrDelta ?? 0;
  const pit = { ...p.pitching };
  if (d !== 0) {
    for (const k of ["velocity", "command", "control", "movement", "stamina",
                     "mentality", "recovery", "clutch", "holdRunners"] as const) {
      (pit as any)[k] = Math.max(1, Math.min(99, ((pit as any)[k] ?? 50) + d));
    }
    pit.ovr = Math.round(
      (pit.velocity * 2.5 + pit.command * 2.5 + pit.control * 2.0
       + pit.movement * 1.5 + pit.stamina * 1.5 + pit.mentality * 1.0
       + pit.recovery * 0.5 + pit.clutch * 0.3 + pit.holdRunners * 0.2) / 12.0);
  }
  gameStore.applyWeekResult(
    { pitching: pit, developmentRate: (p.developmentRate ?? 1) * (t.devRateMult ?? 1) } as any,
    [`[조사] 튜닝 ovrDelta=${d} devRate×${t.devRateMult ?? 1}`], [],
    get(seasonStore).currentWeek, get(seasonStore).seasonYear,
  );
}

/** 능력치 9종 원값 — OVR 한 숫자로는 "무엇이 안 자랐는지"를 못 본다 */
export function statProbe(): Record<string, number> {
  const p = get(gameStore).protagonist.pitching;
  return { ovr: p.ovr, 구속: p.velocity, 제구: p.command, 컨트롤: p.control,
    무브: p.movement, 스태미나: p.stamina, 멘탈: p.mentality,
    회복: p.recovery, 클러치: p.clutch, 견제: p.holdRunners };
}

/**
 * NPC 성장 추적 — **id로 고정해서 따라간다.**
 *
 * ⚠ 리그 평균만 보면 안 된다. 늙은 선수가 은퇴하고 신인이 들어오는 것만으로도
 * 평균이 움직여서, **아무도 안 자라도 리그가 자라는 것처럼 보인다.**
 */
export function npcGrowthProbe(ids?: string[]): Record<string, unknown> {
  const g = get(gameStore);
  const pick = g.npcs.filter((n) =>
    n.playerType === "pitcher" && (ids ? ids.includes(n.npcId) : true));
  const out: Record<string, unknown> = {};
  const live = get(npcLiveStatsStore);
  for (const n of pick) {
    const p = n.pitching;
    if (!p) continue;
    const lp = live[n.npcId]?.pitching;
    out[n.npcId] = {
      나이: n.age, 리그: n.currentLeague, ovr: p.ovr,
      live_ovr: lp?.ovr ?? null, live_구속: lp?.velocity ?? null, live있음: lp ? 1 : 0,
      구속: p.velocity, 제구: p.command, 컨트롤: p.control,
      무브: p.movement, 스태미나: p.stamina, 멘탈: p.mentality,
      회복: p.recovery, 클러치: p.clutch, 견제: p.holdRunners,
    };
  }
  return out;
}

/** 추적 대상 고르기 — 나이대별로 몇 명 */
export function pickTrackees(): string[] {
  const g = get(gameStore);
  const out: string[] = [];
  for (const age of [16, 19, 23, 27, 31]) {
    const c = g.npcs.find((n) => n.playerType === "pitcher" && n.age === age && n.pitching);
    if (c) out.push(c.npcId);
  }
  return out;
}

/**
 * 나이·리그별 성장폭 — **같은 선수를 따라간다.**
 *
 * ⚠ 코호트를 고정하지 않으면 은퇴·신인 유입만으로 평균이 움직여서
 * 아무도 안 자라도 리그가 자라는 것처럼 보인다.
 */
export function ageGrowthSnapshot(): Record<string, { age: number; league: string; ovr: number }> {
  const g = get(gameStore);
  const live = get(npcLiveStatsStore);
  const out: Record<string, { age: number; league: string; ovr: number }> = {};
  for (const n of g.npcs) {
    if (n.playerType !== "pitcher") continue;
    const ovr = livePitchingOvrOf(n, live);
    if (ovr <= 0) continue;
    out[n.npcId] = { age: n.age, league: n.currentLeague ?? "", ovr };
  }
  return out;
}

/**
 * 성장 레버 격리 — **커리어를 안 돌리고 엔진만 두 번 부른다.**
 *
 * ⚠ 커리어로 재면 부상·컨디션·경기 결과가 섞여서 레버 효과와 구분이 안 된다.
 * 실제로 `devRate ×1.3`을 커리어에서 쟀더니 세 능력치가 두 안에서 **정확히
 * 같게** 나왔는데, 같은 실행에 부상 흔적(무브 −2)이 있어 판정을 못 했다.
 */
export async function growthLever(devRates: number[]): Promise<Record<string, unknown>> {
  const g = get(gameStore);
  const m = get(masterStore);
  const { calcTrainingGrowth } = await import("../../apps/ui/src/shared/utils/growthEngine");
  const out: Record<string, unknown> = {};
  for (const dr of devRates) {
    const p = { ...g.protagonist, developmentRate: dr, fatigue: 30, condition: 80 };
    const r = await calcTrainingGrowth(p as any, g.trainingPlan, 1.0, undefined, m.trainingPrograms);
    const pit = r.protagonistPatch.pitching;
    const xp  = r.protagonistPatch.pitchingXP ?? {};
    out[`devRate ${dr}`] = {
      ovr: pit?.ovr, 구속: pit?.velocity, 제구: pit?.command, 컨트롤: pit?.control,
      // 레벨업이 안 나는 주엔 XP 잔량만 는다 — 그걸 봐야 배수가 먹는지 보인다
      잔여XP: Object.fromEntries(Object.entries(xp).map(([k, v]) => [k, Math.round((v as number) * 100) / 100])),
    };
  }
  return out;
}

/**
 * 고교 개인 수상이 실제로 나오는가 — **최소 출전 조건이 관문이다.**
 *
 * ⚠ `awardRules`는 고교 리그도 대상에 넣지만 방어율왕 70이닝 · 다승왕 60이닝을
 * 요구한다. 고교 시즌이 짧으면 **자격자가 0명이라 수상이 구조적으로 안 난다** —
 * 그러면 드래프트에 수상을 넣어도 항상 0으로 들어온다.
 *
 * 그래서 "수상이 몇 건 났나"가 아니라 **"조건에 닿는 투수가 몇 명이나 있나"**를
 * 같이 잰다. 0건일 때 원인이 갈린다: 자격자가 없는 것과 경쟁에서 진 것은 다르다.
 */
export function hsAwardProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const p = g.protagonist;
  const stats = leagueStatsOf(get(seasonStore), "LEAGUE_HIGHSCHOOL");
  const ip = Object.values(stats)
    .map((s: any) => Number(s?.pitching?.ip ?? s?.ip ?? 0))
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const myIp = Number((stats as any)[p.id]?.pitching?.ip ?? 0);
  return {
    투수기록수: ip.length,
    이닝: ip.length ? { 최대: Math.round(ip[0]), 상위10: Math.round(ip[Math.min(9, ip.length - 1)]), 중앙: Math.round(ip[Math.floor(ip.length / 2)]) } : null,
    "70이닝이상": ip.filter((v) => v >= 70).length,   // 방어율왕 자격
    "60이닝이상": ip.filter((v) => v >= 60).length,   // 다승·탈삼진왕 자격
    주인공이닝_리그맵: Math.round(myIp),
    // ⚠ **주인공은 다른 맵에 있다.** 화면 5곳이 `seasonStore.stats[p.id]`를 읽는데
    // `computeAwards`는 리그 맵만 받는다 — 그래서 후보에 아예 못 오른다
    주인공: (() => {
      const st: any = (get(seasonStore) as any).stats?.[p.id];
      if (!st) return null;
      return { 이닝: Math.round((st.ip ?? 0) * 10) / 10, 등판: st.g ?? null, 선발: st.gs ?? null,
               승: st.w ?? null, 패: st.l ?? null, ERA: st.era != null ? Math.round(st.era * 100) / 100 : null, 탈삼진: st.k ?? null };
    })(),
    주인공수상: (p.careerRecords ?? []).flatMap((r: any) => (r.awards ?? []).map((a: any) => a.title ?? a.label)),
  };
}

/**
 * 주인공 경기가 몇 개나 잡히는가 — **등판 0의 갈림길이다.**
 *
 * 실측(2026-08-09): 고교 3년간 시즌1 23이닝 6등판, 시즌2 6이닝 2등판, **선발 0**.
 * 또래 상위10은 77~84이닝이다. 원인이 둘 중 하나인데 숫자 하나로 갈린다:
 *   스케줄에 6경기만 잡힌다   → 일정 생성 문제
 *   30~40경기 잡히는데 안 나간다 → 컨디션·로테이션 문제
 */
export function scheduleProbe(): Record<string, unknown> {
  const s = get(seasonStore);
  const g = get(gameStore);
  // ⚠ 스케줄은 리그 맵이 아니라 seasonStore 최상위에 있다 — 리그 맵을 읽어
  // 전체 0으로 나왔다. advanceWeek도 을 쓴다
  const sched: any[] = (s as any).schedule ?? [];
  const mine = sched.filter((e: any) => e.isProtagonistGame);
  const done = mine.filter((e: any) => e.result != null);
  return {
    리그: g.protagonist.leagueId,
    포지션: g.protagonist.position, 주포지션: g.protagonist.primaryPosition, 학년: g.protagonist.grade, 나이: g.protagonist.age,
    전체경기: sched.length,
    내경기: mine.length,
    내경기_결과있음: done.length,
    // 팀 경기 대비 비율 — 팀이 치르는 경기 중 몇 %가 내 등판으로 잡히나
    내팀경기: sched.filter((e: any) =>
      e.homeTeamId === g.protagonist.teamId || e.awayTeamId === g.protagonist.teamId).length,
  };
}

/**
 * F안 — **선발 기회를 보장한다.** 능력치를 안 건드리고 악순환만 끊는다.
 *
 * 고리: 또래보다 약함 → 선발 못 맡음 → 경기 XP 없음 → 더 약해짐.
 * 시작 OVR을 올리는 건 "약한 선수를 강하게" 만드는 해법이고, 이쪽은
 * **밑바닥에서 시작하는 맛을 지키면서** 경기 XP만 확보한다.
 */
export function forceStarter(): void {
  const g = get(gameStore);
  if (g.protagonist.careerStage !== "highschool") return;
  if (g.protagonist.position === "SP") return;
  gameStore.setPosition("SP");
  gameStore.setCurrentRole("1선발");
}

/** 안별 결과 — 고리가 끊겼는지 본다 */
export function armProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const p = g.protagonist;
  const st: any = (get(seasonStore) as any).stats?.[p.id];
  return {
    포지션: p.position, 학년: p.grade, OVR: p.pitching?.ovr,
    이닝: st ? Math.round((st.ip ?? 0) * 10) / 10 : 0,
    등판: st?.g ?? 0, 선발: st?.gs ?? 0,
    ERA: st?.era != null ? Math.round(st.era * 100) / 100 : null,
  };
}

/** 드래프트 라운드별 지명자 OVR — **live로 읽는다** (생성값은 안 자란다) */
export function draftRoundProbe(): Array<Record<string, unknown>> {
  const g = get(gameStore);
  const live = get(npcLiveStatsStore);
  const out: Array<Record<string, unknown>> = [];
  for (const n of g.npcs) {
    const ev = [...(n.careerEvents ?? [])].reverse()
      .find((e: any) => e.eventType === "draft_picked");
    if (!ev) continue;
    const r = (ev as any).round ?? (ev as any).draftRound;
    if (r == null) continue;
    out.push({
      round: Number(r),
      type: n.playerType,
      ovr: n.playerType === "pitcher"
        ? livePitchingOvrOf(n as any, live)
        : (live[n.npcId]?.batting?.ovr ?? n.batting?.ovr ?? 0),
    });
  }
  return out;
}

/**
 * 드래프트를 **실제로 신청했는가** — 미지명률을 읽으려면 이게 있어야 한다.
 *
 * ⚠ 정책명으로만 가르면 안 된다. `드래+대학`처럼 둘 다 켠 회차는 대학으로
 * 가면서 드래프트를 안 밟을 수 있고, `지명거부`는 지명을 받고도 거부한 것이라
 * "떨어진" 것과 완전히 다르다. 실측(2026-08-10)에서 이걸 안 갈라 **미지명
 * 67%**가 나왔는데, 그 안에 대학 진학 5건과 지명거부 2건이 섞여 있었다.
 * OVR 71이 "미지명"이고 OVR 68이 8R 지명으로 찍혀 순서가 뒤집혀 보였다.
 */
export function draftApplyProbe(): Record<string, unknown> {
  const g = get(gameStore);
  // ⚠ **`schoolState` 아래다.** 스토어 최상위나 protagonist에서 찾으면
  // 20회 전부 null이 나온다 — 실제로 두 번 헛짚었다
  const ss: any = (g as any).schoolState ?? {};
  const a: any = ss.careerApplications;
  const r: any = ss.careerResults;
  return {
    신청여부: a?.draftApplied ?? null,
    제출됨: ss.careerApplicationsSubmitted ?? null,
    지명됨: r?.draftDrafted ?? null,
    지명팀: r?.draftTeamId ?? null,
    지명라운드: r?.draftRound ?? null, 지명순번: r?.draftPick ?? null,
    대학합격: (r?.universityPassed ?? []).length, 독립합격: (r?.independentPassed ?? []).length,
  };
}

// ── 등판 스킵 사유 집계 ────────────────────────────────────────
//
// 고교는 3인 로테이션이라 48경기면 16선발이 나와야 하는데 실측은 7회다.
// 절반 이상이 걸러지는데 사유가 셋이다: 부상 · 컨디션<35 · 학사경고.
// **어느 것인지 세야 고칠 데가 정해진다.**
const _skipTally = { 부상: 0, 컨디션: 0, 학사: 0, 몰수: 0, 등판: 0, 주간표본: 0,
                     컨디션합: 0, 컨디션최저: 100, 피로합: 0 };

/**
 * 매주 부른다 — 컨디션·피로 추이와 스킵 로그를 함께 모은다.
 *
 * ⚠ `gameStore.logs`는 **앞에 붙는 최근 30개**다. 매주 전체를 훑으면 같은
 * 줄을 30번까지 다시 센다 — 직전에 본 머리를 만날 때까지만 읽는다.
 */
let _lastLogHead: string | null = null;
export function tallyWeek(): void {
  const g = get(gameStore);
  _skipTally.주간표본++;
  _skipTally.컨디션합 += g.protagonist.condition;
  _skipTally.피로합   += g.protagonist.fatigue;
  if (g.protagonist.condition < _skipTally.컨디션최저) _skipTally.컨디션최저 = g.protagonist.condition;

  const logs = g.logs ?? [];
  for (const l of logs) {
    if (_lastLogHead != null && l === _lastLogHead) break;   // 여기부터는 이미 셌다
    if (l.includes("부상으로 인해 경기 출전 불가")) _skipTally.부상++;
    else if (l.includes("등판 회피")) _skipTally.컨디션++;
    else if (l.includes("학사 경고로 인해 경기 출전 불가")) _skipTally.학사++;
      else if (l.includes("경기 처리 오류로 자동 패배")) _skipTally.몰수++;
  }
  _lastLogHead = logs[0] ?? _lastLogHead;
}

export function skipReport(): Record<string, unknown> {
  const n = Math.max(1, _skipTally.주간표본);
  return {
    ...(_skipTally as any),
    컨디션평균: Math.round(_skipTally.컨디션합 / n),
    피로평균:   Math.round(_skipTally.피로합 / n),
  };
}

/**
 * 스킵 사유 계수를 **구독으로** 바꾼다.
 *
 * ⚠ 루프에서 주기적으로 읽는 방식은 못 쓴다. `autoRun()`이 한 번에 5~7주를
 * 진행해서 루프가 시즌당 6~8번만 돌고, 그 사이 `gameStore.logs`(최근 30개)가
 * 넘쳐 스킵 메시지가 밀려난다 — 실제로 부상·컨디션·학사가 전부 0으로 나왔고
 * 그건 "안 걸렸다"가 아니라 **"못 봤다"**였다.
 *
 * 구독은 스토어가 바뀔 때마다 불리므로 한 주치 로그도 안 놓친다.
 */
let _unsubTally: (() => void) | null = null;

export function startSkipTally(): void {
  stopSkipTally();
  _unsubTally = gameStore.subscribe((g: any) => {
    if (!g?.logs) return;
    for (const l of g.logs as string[]) {
      if (_lastLogHead != null && l === _lastLogHead) break;
      if (l.includes("부상으로 인해 경기 출전 불가")) _skipTally.부상++;
      else if (l.includes("등판 회피")) _skipTally.컨디션++;
      else if (l.includes("학사 경고로 인해 경기 출전 불가")) _skipTally.학사++;
      else if (l.includes("경기 처리 오류로 자동 패배")) _skipTally.몰수++;
    }
    _lastLogHead = (g.logs as string[])[0] ?? _lastLogHead;
    _skipTally.주간표본++;
    _skipTally.컨디션합 += g.protagonist?.condition ?? 0;
    _skipTally.피로합   += g.protagonist?.fatigue ?? 0;
    if ((g.protagonist?.condition ?? 100) < _skipTally.컨디션최저)
      _skipTally.컨디션최저 = g.protagonist.condition;
  });
}

export function stopSkipTally(): void {
  if (_unsubTally) { _unsubTally(); _unsubTally = null; }
}

export function resetSkipTally(): void {
  _lastLogHead = null;
  Object.assign(_skipTally, { 부상: 0, 컨디션: 0, 학사: 0, 몰수: 0, 등판: 0, 주간표본: 0,
                              컨디션합: 0, 컨디션최저: 100, 피로합: 0 });
}

/**
 * OVR 구간별 NPC 투수 ERA — **주인공만 이상한 건지 리그가 그런 건지 가른다.**
 *
 * ERA가 높다고 곧 결함은 아니다. 못 던지면 얻어맞는 게 맞다.
 * 같은 OVR의 NPC와 대봐야 "주인공만 다른 저울을 쓴다"를 판정할 수 있다.
 */
export function eraByOvrProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const s: any = get(seasonStore);
  const live = get(npcLiveStatsStore);
  const stats = s.leagueState?.["LEAGUE_HIGHSCHOOL"]?.stats ?? {};
  const buckets: Record<string, number[]> = {};
  for (const n of g.npcs) {
    if (n.playerType !== "pitcher") continue;
    const st: any = stats[n.npcId];
    const ip = Number(st?.ip ?? 0);
    if (ip < 20) continue;                       // 표본이 적으면 ERA가 튄다
    const ovr = livePitchingOvrOf(n as any, live);
    if (ovr <= 0) continue;
    const key = `${Math.floor(ovr / 5) * 5}~`;
    (buckets[key] ||= []).push(Number(st?.era ?? 0));
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(buckets).sort()) {
    const a = buckets[k].sort((x, y) => x - y);
    out[k] = { 명: a.length, ERA중앙: Math.round(a[Math.floor(a.length / 2)] * 100) / 100 };
  }
  const p = g.protagonist;
  const mine: any = (s as any).stats?.[p.id];
  out["주인공"] = { OVR: p.pitching?.ovr, 이닝: Math.round((mine?.ip ?? 0) * 10) / 10,
                   ERA: mine?.era != null ? Math.round(mine.era * 100) / 100 : null };
  return out;
}

/**
 * 주인공이 실제로 상대하는 타선 — **폴백이 걸리면 전 리그 최고 타자를 만난다.**
 *
 * `buildBatterLineup`은 팀 타자가 9명 미만이면 `entities` **전체**에서 뽑고
 * batting OVR 내림차순으로 정렬한다. 리그 구분이 없어서 고교 투수가 프로
 * 타자를 상대할 수 있다. 실측(2026-08-10)에서 주인공 ERA가 자기 OVR 구간
 * 중앙값의 2배 이상이었다 — 여기가 유력하다.
 */
export function lineupProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const ents = get(masterStore).entities;
  const { buildBatterLineup } = require("../../apps/ui/src/shared/utils/matchLineupBuilder");
  const myTeamBatters = ents.filter((e: any) =>
    e.teamId === g.protagonist.teamId && e.role === "player" &&
    !["SP", "RP", "CP"].includes(String((e.details as any)?.player?.position ?? "")));
  // 최근 상대 팀을 스케줄에서 하나 집는다
  const s: any = get(seasonStore);
  const mine = (s.schedule ?? []).filter((e: any) => e.isProtagonistGame);
  const last = mine[mine.length - 1];
  const opp = last ? (last.homeTeamId === g.protagonist.teamId ? last.awayTeamId : last.homeTeamId) : null;
  const oppTeamBatters = opp ? ents.filter((e: any) =>
    e.teamId === opp && e.role === "player" &&
    !["SP", "RP", "CP"].includes(String((e.details as any)?.player?.position ?? ""))).length : null;
  const lineup = opp ? buildBatterLineup(opp, ents) : [];
  const ovrs = lineup.map((b: any) => b.ovr ?? b.contact ?? 0);
  return {
    내팀타자수: myTeamBatters.length,
    상대팀: opp, 상대팀타자수: oppTeamBatters,
    폴백걸림: oppTeamBatters != null && oppTeamBatters < 9,
    타선OVR: ovrs.length ? { 최소: Math.min(...ovrs), 평균: Math.round(ovrs.reduce((a: number, b: number) => a + b, 0) / ovrs.length), 최대: Math.max(...ovrs) } : null,
  };
}

/** 수비 9인 — 좌표는 화면()과 같은 값 */
type _FPos = "C"|"1B"|"2B"|"3B"|"SS"|"LF"|"CF"|"RF"|"P";
const _FPOS: Array<[_FPos, number, number]> = [
  ["P",50,62],["C",50,90],["1B",78,70],["2B",63,55],["3B",22,70],
  ["SS",37,55],["LF",18,28],["CF",50,16],["RF",82,28],
];
function _mkFielders(mean: number) {
  return _FPOS.map(([position, x, y]) => ({ position, name: position, fielding: mean, arm: mean, speed: mean, x, y }));
}

/**
 * 두 엔진 대조 — **같은 투수를 주인공 경로에 넣고 ERA를 본다.**
 *
 * 주인공은 투구 단위 엔진(`startMatch`→`autoSimulate…`), NPC는 경기 단위
 * 엔진(`npcSimGame`)으로 **완전히 다른 두 경로**다. 커리어로 재면 타선·수비·
 * 로테이션이 섞여 엔진 탓인지 구분이 안 된다 — 여기서는 `batterMean` 하나로
 * 상대를 고정해 **엔진만** 남긴다.
 *
 * 기준: 같은 리그 OVR 70~ NPC 97명의 ERA 중앙값은 **3.28**이다.
 */
export async function engineDuel(games: number, batterMean: number, fielderMean?: number, arsenalOverride?: any[], useRealLineup = false): Promise<Record<string, unknown>> {
  // ⚠ **격리 조건이 커리어와 같아야 한다.** `batterMean 66`은 create_batter가
  // 전 스탯을 66으로 만드는데, 실제 OVR 66 타자는 컨택 59에 나머지가 제각각이다.
  // 이 차이 때문에 격리에서 고른 오프셋이 커리어에서 두 번 어긋났다.
  const _ents = get(masterStore).entities;
  const { buildBatterLineup: _bbl } = await import("../../apps/ui/src/shared/utils/matchLineupBuilder");
  const _realLineup = useRealLineup ? _bbl(get(gameStore).protagonist.teamId, _ents) : [];
  const p = get(gameStore).protagonist;
  const pit = p.pitching;
  const lines: Array<{ ip: number; er: number }> = [];
  for (let i = 0; i < games; i++) {
    const raw = await window.projectB!.matchSimulateToEntry({
      pitcher: {
        name: p.name,
        command: pit.command, velocity: pit.velocity,
        staminaCap: pit.stamina, mentalResil: pit.mentality,
        control: pit.control, movement: pit.movement,
        clutch: pit.clutch, holdRunners: pit.holdRunners,
        arsenal: arsenalOverride ?? toEngineArsenal(p.pitches),
      },
      role: "SP", protagonistSide: "home",
      ...(_realLineup.length >= 9 ? { awayLineup: _realLineup } : { batterMean }),
      ...(fielderMean != null ? { fielders: _mkFielders(fielderMean) } : {}),
    });
    const sim = JSON.parse(raw);
    if (sim.error) return { 오류: sim.error };
    if (!sim.entryReached) continue;
    const auto = JSON.parse(await window.projectB!.matchAutoFinishFromEntry());
    if (auto.error) return { 오류: auto.error };
    const outs = auto.outsRecorded ?? 0;
    lines.push({ ip: outs / 3, er: auto.earnedRuns ?? 0, k: auto.strikeouts ?? 0, h: auto.hitsAllowed ?? 0, bb: auto.walksAllowed ?? 0 } as any);
  }
  const ip = lines.reduce((s, l) => s + l.ip, 0);
  const sum = (k: string) => lines.reduce((s, l: any) => s + (l[k] ?? 0), 0);
  const per9 = (v: number) => ip > 0 ? Math.round((v * 9 / ip) * 100) / 100 : null;
  const er = lines.reduce((s, l) => s + l.er, 0);
  return {
    OVR: pit.ovr, 타자수준: batterMean, 수비수준: fielderMean ?? "기본(50)", 구종: (arsenalOverride ?? toEngineArsenal(p.pitches)).length, 경기: lines.length,
    이닝: Math.round(ip * 10) / 10, 자책: er,
    ERA: ip > 0 ? Math.round((er * 9 / ip) * 100) / 100 : null,
    경기당이닝: lines.length ? Math.round((ip / lines.length) * 10) / 10 : null,
    "K/9": per9(sum("k")), "BB/9": per9(sum("bb")), "H/9": per9(sum("h")),
  };
}

/** 리그 NPC 투수 성분 — 주인공 엔진과 어느 축이 다른지 가른다 */
export function leagueComponents(): Record<string, unknown> {
  const g = get(gameStore);
  const s: any = get(seasonStore);
  const live = get(npcLiveStatsStore);
  const stats = s.leagueState?.["LEAGUE_HIGHSCHOOL"]?.stats ?? {};
  const acc: Record<string, { ip: number; k: number; bb: number; h: number; er: number; n: number }> = {};
  for (const n of g.npcs) {
    if (n.playerType !== "pitcher") continue;
    const st: any = stats[n.npcId];
    const ip = Number(st?.ip ?? 0);
    if (ip < 20) continue;
    const ovr = livePitchingOvrOf(n as any, live);
    if (ovr <= 0) continue;
    const key = `${Math.floor(ovr / 5) * 5}~`;
    const a = (acc[key] ||= { ip: 0, k: 0, bb: 0, h: 0, er: 0, n: 0 });
    a.ip += ip; a.k += Number(st?.k ?? 0); a.bb += Number(st?.bb ?? 0);
    a.h += Number(st?.h ?? 0); a.er += Number(st?.er ?? 0); a.n++;
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(acc).sort()) {
    const a = acc[k]; const r = (v: number) => Math.round((v * 9 / a.ip) * 100) / 100;
    out[k] = { 명: a.n, ERA: r(a.er), "K/9": r(a.k), "BB/9": r(a.bb), "H/9": r(a.h) };
  }
  return out;
}

/** contact_q 밴드 분포 — 어느 구간에서 도는지 본다 */
export async function contactBands(): Promise<Record<string, unknown>> {
  const raw = await window.projectB!.engine("contactBandStatsNative", "{}");
  const d = JSON.parse(raw);
  if (d.error) return d;
  const total = (d.bands as number[]).reduce((a, b) => a + b, 0) || 1;
  const out: Record<string, unknown> = { 평균contactQ: d.avgContactQ, 스윙: total };
  (d.labels as string[]).forEach((l, i) => {
    out[l] = `${d.bands[i]} (${Math.round(d.bands[i] / total * 100)}%)`;
  });
  return out;
}
export async function resetContactBands(): Promise<void> {
  await window.projectB!.engine("resetContactBandsNative", "{}");
}

/** NPC 투수 구종 수 분포 — 주인공(패스트볼 1개)과 대본다 */
export function arsenalProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const live = get(npcLiveStatsStore);
  const cnt: Record<number, number> = {};
  let n = 0;
  for (const npc of g.npcs) {
    if (npc.playerType !== "pitcher") continue;
    // ⚠ **구종은 live에 실린다** (`npcAdapter.repoNpcToLiveStat`).
    // `npc.pitches`를 읽어 "전원 0구종"이라고 잘못 보고했다 — 이번 세션
    // 네 번째로 같은 자리를 틀렸다
    const k = (live[npc.npcId]?.pitches ?? npc.pitches ?? []).length;
    cnt[k] = (cnt[k] ?? 0) + 1; n++;
  }
  const out: Record<string, unknown> = { 투수: n };
  for (const k of Object.keys(cnt).map(Number).sort((a, b) => a - b))
    out[`${k}구종`] = `${cnt[k]}명 (${Math.round(cnt[k] / n * 100)}%)`;
  out["주인공"] = `${(g.protagonist.pitches ?? []).length}구종`;
  return out;
}

/**
 * 엔진 통합 타당성 — **투구 하나 비용을 잰다.**
 *
 * 두 엔진을 합치려면 NPC 경기도 주인공 엔진으로 돌려야 한다. 고교만 시즌당
 * 1,275경기 × 약 300구다. 자릿수를 모르면 통합에 들어갔다 성능 벽에 부딪혀
 * 되돌리게 된다 — **재고 나서 정한다.**
 *
 * ⚠ 벽시계는 같은 설정에서 2배까지 흔들린다(Phase 8 실측). 반복해서
 * 중앙값을 쓰고, 두 엔진을 **같은 실행 안에서** 번갈아 재 환경 차이를 지운다.
 */
export async function enginePitchCost(rounds: number): Promise<Record<string, unknown>> {
  const p = get(gameStore).protagonist;
  const pit = p.pitching;
  const rich: number[] = [];
  const richPitches: number[] = [];

  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    const raw = await window.projectB!.matchSimulateToEntry({
      pitcher: {
        name: p.name, command: pit.command, velocity: pit.velocity,
        staminaCap: pit.stamina, mentalResil: pit.mentality,
        control: pit.control, movement: pit.movement,
        clutch: pit.clutch, holdRunners: pit.holdRunners,
        arsenal: toEngineArsenal(p.pitches),
      },
      role: "SP", protagonistSide: "home", batterMean: 66,
      fielders: _mkFielders(66),
    });
    const sim = JSON.parse(raw);
    if (sim.error || !sim.entryReached) continue;
    const auto = JSON.parse(await window.projectB!.matchAutoFinishFromEntry());
    rich.push(performance.now() - t0);
    richPitches.push(auto.pitchCount ?? 0);
  }

  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const gameMs = med(rich);
  const pitches = med(richPitches) || 1;
  return {
    표본: rich.length,
    "주인공엔진 경기당ms": Math.round(gameMs * 100) / 100,
    "경기당 투구수(주인공분)": pitches,
    "투구당 µs": Math.round(gameMs * 1000 / pitches),
  };
}

/**
 * `game` pending이 몇 번 생기는가 — **48경기가 전부 `handleGame`에 닿는지** 가른다.
 *
 * 배제된 것: 스케줄(고교는 48개 전부 후보) · 부상/컨디션/학사 게이트(구독 계측 0) ·
 * 엔진 `entryReached`(SP는 즉시 등판). 남은 갈림길이 이것이다.
 *
 *   48 근처면  →  엔진 안에서 걸린다
 *   11 근처면  →  `advanceWeek`의 스케줄 순회에서 걸린다
 *
 * ⚠ pending은 밀어넣고 곧 소비되므로 **구독으로 본다.** 주기적으로 읽으면
 * 사이에 생겼다 사라진 걸 통째로 놓친다(스킵 로그에서 이미 당했다).
 */
const _gamePending = { 생성: 0, 본id: new Set<string>() };
let _unsubGame: (() => void) | null = null;

export function startGamePendingTally(): void {
  stopGamePendingTally();
  _unsubGame = seasonStore.subscribe((s: any) => {
    for (const pa of (s?.pendingActions ?? [])) {
      if (pa?.type !== "game" || !pa.scheduleId) continue;
      if (_gamePending.본id.has(pa.scheduleId)) continue;
      _gamePending.본id.add(pa.scheduleId);
      _gamePending.생성++;
    }
  });
}
export function stopGamePendingTally(): void {
  if (_unsubGame) { _unsubGame(); _unsubGame = null; }
}
export function gamePendingReport(): Record<string, unknown> {
  return { game_pending_생성: _gamePending.생성 };
}
export function resetGamePendingTally(): void {
  _gamePending.생성 = 0; _gamePending.본id.clear();
}

/**
 * `matchSimulateToEntry`의 반환을 가로채 센다 — **IPC 반환값이라 스토어를 안 거친다.**
 *
 * `handleGame`의 갈래는 둘뿐이고 `sim.error`는 던지면 autoRun이 멈추므로,
 * 남는 건 `entryReached`가 false로 조용히 빠지는 것이다.
 * 격리 측정(120경기)에서는 계속 true였으니 커리어에서만 다른 게 있다.
 *
 * ⚠ 앱 코드를 안 건드리려고 감싼다. 원래 함수를 그대로 부르고 결과만 본다.
 */
const _entryTally = { 호출: 0, 진입: 0, 미진입: 0, 오류: 0, 역할: {} as Record<string, number> };
let _origSimToEntry: ((r: any) => Promise<string>) | null = null;

export function startEntryTally(): void {
  stopEntryTally();
  const api: any = window.projectB;
  _origSimToEntry = api.matchSimulateToEntry.bind(api);
  api.matchSimulateToEntry = async (req: any) => {
    _entryTally.호출++;
    const role = String(req?.role ?? "?");
    _entryTally.역할[role] = (_entryTally.역할[role] ?? 0) + 1;
    const raw = await _origSimToEntry!(req);
    try {
      const d = JSON.parse(raw);
      if (d.error) _entryTally.오류++;
      else if (d.entryReached) _entryTally.진입++;
      else _entryTally.미진입++;
    } catch { /* 파싱 실패는 세지 않는다 */ }
    return raw;
  };
}
export function stopEntryTally(): void {
  if (_origSimToEntry) { (window.projectB as any).matchSimulateToEntry = _origSimToEntry; _origSimToEntry = null; }
}
export function entryReport(): Record<string, unknown> { return { ..._entryTally }; }
export function resetEntryTally(): void {
  _entryTally.호출 = 0; _entryTally.진입 = 0; _entryTally.미진입 = 0; _entryTally.오류 = 0;
  _entryTally.역할 = {};
}

/**
 * 엔진이 준 `playerLines`에 주인공이 들어 있는가 — **고치는 법이 갈린다.**
 *
 * `applyGameOutcome.ts:219`가 엔진 라인이 있으면 그걸 그대로 쓰고
 * `pitcherLine`을 버린다. 그 배열에 주인공이
 *   있으면 → 병합만 정리하면 된다(중복 방지)
 *   없으면 → pitcherLine을 앞에 붙이고 엔진 라인에서 주인공을 빼야 한다
 */
const _lineTally = { 호출: 0, 라인있음: 0, 라인빔: 0, 주인공포함: 0, 주인공없음: 0, outs0: 0, outs양: 0, outs합: 0, ip분포: [] as number[] };
let _origAutoFinish: (() => Promise<string>) | null = null;

export function startLineTally(): void {
  stopLineTally();
  const api: any = window.projectB;
  _origAutoFinish = api.matchAutoFinishFromEntry.bind(api);
  api.matchAutoFinishFromEntry = async () => {
    const raw = await _origAutoFinish!();
    try {
      const d = JSON.parse(raw);
      _lineTally.호출++;
      const lines = Array.isArray(d.playerLines) ? d.playerLines : [];
      if (lines.length > 0) {
        _lineTally.라인있음++;
        const pid = get(gameStore).protagonist.id;
        if (lines.some((l: any) => l?.playerId === pid)) _lineTally.주인공포함++;
        else _lineTally.주인공없음++;
      } else _lineTally.라인빔++;
      // ⚠ 진입은 했는데 아웃이 0이면 기록이 안 남는다 — 여기가 갈림길이다
      const o = Number(d.outsRecorded ?? 0);
      if (o > 0) { _lineTally.outs양++; _lineTally.outs합 += o; } else _lineTally.outs0++;
      _lineTally.ip분포.push(Math.round(o / 3 * 10) / 10);
    } catch { /* 무시 */ }
    return raw;
  };
}
export function stopLineTally(): void {
  if (_origAutoFinish) { (window.projectB as any).matchAutoFinishFromEntry = _origAutoFinish; _origAutoFinish = null; }
}
export function lineReport(): Record<string, unknown> { return { ..._lineTally }; }
export function resetLineTally(): void {
  _lineTally.호출 = 0; _lineTally.라인있음 = 0; _lineTally.라인빔 = 0;
  _lineTally.주인공포함 = 0; _lineTally.주인공없음 = 0;
  _lineTally.outs0 = 0; _lineTally.outs양 = 0; _lineTally.outs합 = 0; _lineTally.ip분포 = [];
}

/**
 * 주인공 성적이 **몇 번 쓰이는가** — 엔진 호출 30 vs 기록 10의 갈림길.
 *
 * 엔진 호출(=`handleGame` 진입)이 30인데 시즌 기록은 10등판이다.
 *   기록 쓰기도 30번이면 → 누적이 덮어써진다(마지막만 남는 식)
 *   기록 쓰기가 10번이면 → `handleGame` 30번 중 20번은 성적을 안 쓴다
 */
const _statWrite = { 증가횟수: 0, 마지막g: 0, ip이력: [] as number[] };
let _unsubStat: (() => void) | null = null;

export function startStatWriteTally(): void {
  stopStatWriteTally();
  const pid = get(gameStore).protagonist.id;
  _unsubStat = seasonStore.subscribe((s: any) => {
    const st = s?.stats?.[pid];
    const g = Number(st?.g ?? 0);
    if (g > _statWrite.마지막g) {
      _statWrite.증가횟수 += (g - _statWrite.마지막g);
      _statWrite.마지막g = g;
      _statWrite.ip이력.push(Math.round(Number(st?.ip ?? 0) * 10) / 10);
    }
  });
}
export function stopStatWriteTally(): void {
  if (_unsubStat) { _unsubStat(); _unsubStat = null; }
}
export function statWriteReport(): Record<string, unknown> {
  return { g증가: _statWrite.증가횟수, 마지막g: _statWrite.마지막g, ip이력: _statWrite.ip이력 };
}
export function resetStatWriteTally(): void {
  _statWrite.증가횟수 = 0; _statWrite.마지막g = 0; _statWrite.ip이력 = [];
}

/**
 * `seasonStore.applyMatchResult` 호출을 센다 — **28 vs 11의 갈림길.**
 *
 * `applyGameOutcome`이 이걸 부르고, 여기서 `accumulateStats`가 돈다.
 *   28이면 → 집계 쪽이다(주인공이 playerLines에 빠지는지 본다)
 *   11이면 → `handleGame` 안에서 빠져나가는 자리가 있다
 *
 * ⚠ 가설을 넷 세워 넷 다 틀렸다. 세고 나서 말한다.
 */
const _amrTally = { 호출: 0, 주인공포함: 0, 주인공없음: 0, 라인빔: 0, 유일id: new Set<string>() };
let _origAmr: any = null;

export function startAmrTally(): void {
  stopAmrTally();
  const ss: any = seasonStore;
  _origAmr = ss.applyMatchResult.bind(ss);
  ss.applyMatchResult = (scheduleId: string, result: any, leagueId?: string) => {
    _amrTally.호출++;
    _amrTally.유일id.add(scheduleId);
    const lines = Array.isArray(result?.playerLines) ? result.playerLines : [];
    const pid = get(gameStore).protagonist.id;
    if (lines.length === 0) _amrTally.라인빔++;
    else if (lines.some((l: any) => l?.playerId === pid)) _amrTally.주인공포함++;
    else _amrTally.주인공없음++;
    return _origAmr(scheduleId, result, leagueId);
  };
}
export function stopAmrTally(): void {
  if (_origAmr) { (seasonStore as any).applyMatchResult = _origAmr; _origAmr = null; }
}
export function amrReport(): Record<string, unknown> {
  return { 호출: _amrTally.호출, 유일경기: _amrTally.유일id.size,
           주인공포함: _amrTally.주인공포함, 주인공없음: _amrTally.주인공없음, 라인빔: _amrTally.라인빔 };
}
export function resetAmrTally(): void {
  _amrTally.호출 = 0; _amrTally.주인공포함 = 0; _amrTally.주인공없음 = 0;
  _amrTally.라인빔 = 0; _amrTally.유일id.clear();
}

/**
 * 경기 대장 — **경기 하나마다 한 줄.** 합계로는 못 하던 구분을 한다.
 *
 * 이번 세션에 만든 계측은 전부 합계였다(호출 21 · 집계 14 · 포함 10).
 * 그래서 **"안 던진 것"과 "던졌는데 유실된 것"을 끝까지 못 갈랐다.**
 * `scheduleId`를 조인 키로 두면 한 번 돌려 표가 나오고 거기서 답이 나온다.
 *
 * 조인 키를 얻는 법: `handleGame`이 엔진을 부르는 시점에 그 경기의 pending이
 * 아직 살아 있다 — 거기서 `scheduleId`를 읽는다.
 *
 * 기대값: 팀 경기 47 · 고교 3인 로테이션 → **약 15경기**가 정상이다.
 * (이 기준을 이번 세션 내내 안 정해서 21도 10도 판단을 못 했다)
 */
type LedgerRow = {
  id: string; week: number | null; friendly: boolean | null;
  entry: boolean | null; outs: number | null;
  엔진호출: number; 완료호출: number;   // ⚠ 같은 경기를 몇 번 시뮬하는가 (C-0)
  집계: boolean; 라인에주인공: boolean | null;
};
const _ledger = new Map<string, LedgerRow>();
let _origSim2: any = null, _origFin2: any = null, _origAmr2: any = null, _origFriendly: any = null;
let _curGameId: string | null = null;

function _row(id: string): LedgerRow {
  let r = _ledger.get(id);
  if (!r) {
    const e = (get(seasonStore) as any).schedule?.find((x: any) => x.id === id);
    r = { id, week: e?.week ?? null, friendly: e?.isFriendly ?? null,
          entry: null, outs: null, 엔진호출: 0, 완료호출: 0, 집계: false, 라인에주인공: null };
    _ledger.set(id, r);
  }
  return r;
}

export function startLedger(): void {
  stopLedger();
  const api: any = window.projectB;
  const ss: any = seasonStore;

  _origSim2 = api.matchSimulateToEntry.bind(api);
  api.matchSimulateToEntry = async (req: any) => {
    // 이 시점엔 그 경기의 pending이 아직 살아 있다 — 조인 키를 여기서 얻는다
    const pa = (get(seasonStore) as any).pendingActions?.find((a: any) => a?.type === "game");
    _curGameId = pa?.scheduleId ?? null;
    const raw = await _origSim2(req);
    if (_curGameId) _row(_curGameId).엔진호출++;
    if (_curGameId) {
      try { _row(_curGameId).entry = !!JSON.parse(raw).entryReached; } catch { /* 무시 */ }
    }
    return raw;
  };

  _origFin2 = api.matchAutoFinishFromEntry.bind(api);
  api.matchAutoFinishFromEntry = async () => {
    const raw = await _origFin2();
    if (_curGameId) _row(_curGameId).완료호출++;
    if (_curGameId) {
      try { _row(_curGameId).outs = Number(JSON.parse(raw).outsRecorded ?? 0); } catch { /* 무시 */ }
    }
    return raw;
  };

  const mark = (scheduleId: string, result: any) => {
    const r = _row(scheduleId);
    r.집계 = true;
    const pid = get(gameStore).protagonist.id;
    const lines = Array.isArray(result?.playerLines) ? result.playerLines : [];
    r.라인에주인공 = lines.some((l: any) => l?.playerId === pid);
  };
  _origAmr2 = ss.applyMatchResult.bind(ss);
  ss.applyMatchResult = (id: string, result: any, leagueId?: string) => { mark(id, result); return _origAmr2(id, result, leagueId); };
  _origFriendly = ss.applyFriendlyResult.bind(ss);
  ss.applyFriendlyResult = (...a: any[]) => { mark(a[0], a[1]); return _origFriendly(...a); };
}

export function stopLedger(): void {
  const api: any = window.projectB; const ss: any = seasonStore;
  if (_origSim2) { api.matchSimulateToEntry = _origSim2; _origSim2 = null; }
  if (_origFin2) { api.matchAutoFinishFromEntry = _origFin2; _origFin2 = null; }
  if (_origAmr2) { ss.applyMatchResult = _origAmr2; _origAmr2 = null; }
  if (_origFriendly) { ss.applyFriendlyResult = _origFriendly; _origFriendly = null; }
}

export function ledgerRows(): LedgerRow[] { return [..._ledger.values()]; }
export function resetLedger(): void { _ledger.clear(); _curGameId = null; }

/** C-1 검증 — 큐를 넣으면 실제로 교체가 도는가 */
export async function queueSmoke(): Promise<Record<string, unknown>> {
  const raw = await window.projectB!.engine("startMatchNative", JSON.stringify({
    protagonistSide: "home", role: "SP", batterMean: 66, leagueId: "LEAGUE_HIGHSCHOOL",
    // 상대 투수진 3명 · 각 6아웃(2이닝)씩 — 9이닝이면 두 번 바뀌어야 한다
    opponentPitchers: [
      { name: "선발", command: 50, velocity: 52, staminaCap: 40 },
      { name: "불펜", command: 48, velocity: 50 },
      { name: "마무리", command: 55, velocity: 58 },
    ],
  }));
  const st = JSON.parse(raw);
  if (st.error) return { 오류: st.error };
  const fin = JSON.parse(await window.projectB!.engine("simToGameEnd", JSON.stringify(st)));
  if (fin.error) return { 오류: fin.error };
  const logs: string[] = fin.logs ?? [];
  return {
    큐길이: st.opponentQueue?.pitchers?.length ?? 0,
    한계: st.opponentQueue?.maxOuts ?? null,
    교체로그: logs.filter((l) => l.includes("투수 교체")),
    최종투수: fin.opponentNpcPitcher?.name ?? null,
    현재인덱스: fin.opponentQueue?.current ?? null,
    누적아웃: fin.opponentQueue?.outsByCurrent ?? null,
    타자합계: (() => { const L=[...(fin.homeBatLines??[]),...(fin.awayBatLines??[])];
      const sum=(k: string)=>L.reduce((a: number,b: any)=>a+(b[k]??0),0);
      return `${L.length}명 AB ${sum("ab")} H ${sum("h")} HR ${sum("hr")} RBI ${sum("rbi")} BB ${sum("bb")} K ${sum("k")}`; })(),
    최종스코어: (fin.score?.home ?? 0) + ":" + (fin.score?.away ?? 0),
    어댑터: await (async () => {
      const mr = JSON.parse(await window.projectB!.engine("matchToResultNative",
        JSON.stringify({ state: fin, homeTeamId: "TEAM_H", awayTeamId: "TEAM_A" })));
      if (mr.error) return { 오류: mr.error };
      const lines = mr.playerLines ?? [];
      const pit = lines.filter((l: any) => l.role === "pitcher");
      const bat = lines.filter((l: any) => l.role === "batter");
      return { 스코어: mr.homeScore + ":" + mr.awayScore, 승: mr.winnerId,
               투수라인: pit.length, 타자라인: bat.length,
               투수이닝합: Math.round(pit.reduce((a: number, l: any) => a + l.ip, 0) * 10) / 10 };
    })(),
    전체어댑터: await (async () => {
      const r = JSON.parse(await window.projectB!.engine("matchToSimResultNative",
        JSON.stringify({ state: fin, homeTeamId: "TEAM_H", awayTeamId: "TEAM_A", week: 5,
                         conditions: {}, homeRotIdx: 0, awayRotIdx: 0 })));
      if (r.error) return { 오류: r.error };
      const c = r.pitcherConditions ?? {};
      return { 로테: r.nextHomeRotIdx + "/" + r.nextAwayRotIdx,
               컨디션수: Object.keys(c).length,
               피로: Object.entries(c).map(([k, v]: any) => k + " " + Math.round(v.fatigue)) };
    })(),
    투수별기록: (fin.opponentQueue?.lines ?? []).map((l: any) =>
      `${l.playerId} ${(l.outs/3).toFixed(1)}이닝 ${l.er}자책 ${l.h}피안타 ${l.k}K ${l.bb}BB ${l.pc}구`),
  };
}

/**
 * C-3 두 엔진 대조 — **같은 능력치로 같은 경기를 양쪽에 돌린다.**
 *
 * 통합의 안전장치다. 어댑터를 붙이기 전에 **지금 두 엔진이 얼마나 다른지**
 * 기준선을 잡아야, 전환 후 바뀐 게 어댑터 탓인지 원래 차이인지 갈린다.
 *
 * ⚠ 이 대조 없이 넘어가면 전 리그 성적이 통째로 바뀐 걸 몇 세션 뒤에 발견한다.
 */
export async function engineCompare(games: number): Promise<Record<string, unknown>> {
  const mk = (n: string, cmd: number, vel: number, sta: number) =>
    ({ name: n, command: cmd, velocity: vel, staminaCap: sta, mentalResil: 55,
       control: cmd - 2, movement: 52, clutch: 50, holdRunners: 50 });
  const staff = [mk("선발", 55, 55, 60), mk("불펜", 50, 52, 40), mk("마무리", 58, 60, 35)];

  // ── A: 주인공 엔진 (match_engine) ──
  let aOuts = 0, aEr = 0, aH = 0, aK = 0, aBb = 0;
  for (let i = 0; i < games; i++) {
    const st = JSON.parse(await window.projectB!.engine("startMatchNative", JSON.stringify({
      protagonistSide: "home", role: "SP", batterMean: 66, leagueId: "LEAGUE_HIGHSCHOOL",
      opponentPitchers: staff,
    })));
    if (st.error) return { 오류: st.error };
    const fin = JSON.parse(await window.projectB!.engine("simToGameEnd", JSON.stringify(st)));
    if (fin.error) return { 오류: fin.error };
    for (const l of (fin.opponentQueue?.lines ?? [])) {
      aOuts += l.outs ?? 0; aEr += l.er ?? 0; aH += l.h ?? 0; aK += l.k ?? 0; aBb += l.bb ?? 0;
    }
  }
  const per9 = (v: number, outs: number) => outs > 0 ? Math.round((v * 27 / outs) * 100) / 100 : null;
  return {
    경기: games,
    "주인공엔진": { 이닝: Math.round(aOuts / 3 * 10) / 10, ERA: per9(aEr, aOuts),
                  "K/9": per9(aK, aOuts), "BB/9": per9(aBb, aOuts), "H/9": per9(aH, aOuts) },
    비고: "NPC 엔진(sim_game)은 팀 로스터가 필요해 같은 조건을 못 만든다 — 리그 실측과 대조한다",
    "리그 NPC 실측": { ERA: "3.2~4.0", "K/9": 8.11, "BB/9": 3.90, "H/9": 7.34 },
  };
}

/**
 * OVR별 ERA 곡선 — **단조성이 살아 있는가.**
 *
 * C-4 실측에서 고교를 풀 엔진으로 돌리자 OVR–ERA 상관이 뒤집혔다
 * (60~ 3.64 → 75~ 4.57, 잘할수록 나빠진다). 엔진 자체 문제인지 전환
 * 배선 문제인지 여기서 갈린다 — 격리는 배선이 없다.
 *
 * ⚠ 능력치를 OVR 목표에 맞춰 **균등하게** 올린다. 한 스탯만 올리면
 * 그 스탯의 기여도만 보게 된다.
 */
export async function ovrEraCurve(games: number, batterMean: number): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const lvl of [55, 60, 65, 70, 75, 80]) {
    const p = {
      name: `OVR${lvl}`,
      command: lvl, velocity: lvl, staminaCap: lvl, mentalResil: lvl,
      control: lvl, movement: lvl, clutch: lvl, holdRunners: lvl,
      // ⚠ **구종을 넘긴다.** 안 넘기면 전원 패스트볼 하나가 되고, 그 페널티가
      // 능력치 차이를 덮어 곡선이 평평해진다(실측에서 ERA 6~7로 붕 떠 있었다)
      arsenal: [{ type: "fastball", grade: 3 }, { type: "slider", grade: 3 },
                { type: "changeup", grade: 2 }],
    };
    await resetContactBands();
    let outs = 0, er = 0, h = 0, k = 0, bb = 0;
    for (let i = 0; i < games; i++) {
      const st = JSON.parse(await window.projectB!.engine("startMatchNative", JSON.stringify({
        protagonistSide: "home", role: "SP", batterMean, leagueId: "LEAGUE_HIGHSCHOOL",
        opponentPitchers: [p],           // 한 명만 — 교체 없이 끝까지
      })));
      if (st.error) return { 오류: st.error };
      const fin = JSON.parse(await window.projectB!.engine("simToGameEnd", JSON.stringify(st)));
      if (fin.error) return { 오류: fin.error };
      for (const l of (fin.opponentQueue?.lines ?? [])) {
        outs += l.outs ?? 0; er += l.er ?? 0; h += l.h ?? 0; k += l.k ?? 0; bb += l.bb ?? 0;
      }
    }
    const r = (v: number) => outs > 0 ? Math.round((v * 27 / outs) * 100) / 100 : null;
    // ⚠ **contact_q가 실제로 움직이는지 같이 찍는다.** 계측 없이 가설을 세워
    // 네 번 틀렸다 — 안 움직이면 계수가 아니라 배선 문제다
    const cb: any = await contactBands();
    out[`OVR ${lvl}`] = { 이닝: Math.round(outs / 3), ERA: r(er), "K/9": r(k), "H/9": r(h), cq: cb.평균contactQ };
  }
  return out;
}

/**
 * 격리 대조 — **생성 타자 vs 실제 리그 라인업.**
 *
 * 같은 엔진인데 주인공(오프셋 7)과 리그(오프셋 0)가 다른 값을 요구한다.
 * 수비는 배제했다(넘겨도 안 바뀜). 남은 유력 후보가 타선 구성이다:
 * 격리는 `batterMean` 66으로 **전 스탯 균일한** 타자를 만들고,
 * 리그는 실제 라인업(스탯이 흩어진)을 쓴다.
 */
export async function lineupCompare(games: number): Promise<Record<string, unknown>> {
  const g = get(gameStore);
  const ents = get(masterStore).entities;
  const { buildBatterLineup } = await import("../../apps/ui/src/shared/utils/matchLineupBuilder");
  const real = buildBatterLineup(g.protagonist.teamId, ents);

  const pit = {
    name: "테스트", command: 68, velocity: 68, staminaCap: 68, mentalResil: 68,
    control: 68, movement: 68, clutch: 68, holdRunners: 68,
    arsenal: [{ type: "fastball", grade: 3 }, { type: "slider", grade: 3 }],
  };

  const run = async (useReal: boolean) => {
    let outs = 0, er = 0, h = 0, k = 0;
    for (let i = 0; i < games; i++) {
      const st = JSON.parse(await window.projectB!.engine("startMatchNative", JSON.stringify({
        protagonistSide: "home", role: "SP", leagueId: "LEAGUE_HIGHSCHOOL",
        opponentPitchers: [pit],
        ...(useReal && real.length >= 9 ? { awayLineup: real } : { batterMean: 66 }),
      })));
      if (st.error) return { 오류: st.error };
      const fin = JSON.parse(await window.projectB!.engine("simToGameEnd", JSON.stringify(st)));
      if (fin.error) return { 오류: fin.error };
      for (const l of (fin.opponentQueue?.lines ?? [])) {
        outs += l.outs ?? 0; er += l.er ?? 0; h += l.h ?? 0; k += l.k ?? 0;
      }
    }
    const r = (v: number) => outs > 0 ? Math.round((v * 27 / outs) * 100) / 100 : null;
    return { 이닝: Math.round(outs / 3), ERA: r(er), "K/9": r(k), "H/9": r(h) };
  };

  return {
    "생성 타자(균일 66)": await run(false),
    "실제 라인업": await run(true),
    "라인업 인원": real.length,
    "실제 타자 컨택": real.slice(0, 9).map((b: any) => b.contact),
  };
}

/**
 * 두 타선 구성기를 **같은 팀에** 돌려 대본다.
 *
 * 앞 세션에서 "주인공은 최강 9인, 리그는 정상 라인업"이라 진단했는데,
 * 리그 쪽(`rosterEngine.buildLineup`)도 포지션별 최고 타자를 뽑는다 —
 * 둘이 비슷하다. **같은 팀에 돌려야** 진짜 차이가 나온다.
 */
export async function builderCompare(teamIds: string[]): Promise<Record<string, unknown>> {
  const ents = get(masterStore).entities;
  const { buildBatterLineup } = await import("../../apps/ui/src/shared/utils/matchLineupBuilder");
  const out: Record<string, unknown> = {};
  for (const t of teamIds) {
    const a = buildBatterLineup(t, ents);
    const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((p, c) => p + c, 0) / xs.length) : 0;
    out[t.replace(/^TEAM_/, "")] = {
      인원: a.length,
      컨택평균: avg(a.map((b: any) => b.contact ?? 0)),
      컨택: a.slice(0, 9).map((b: any) => b.contact),
    };
  }
  return out;
}

/**
 * 주인공이 **실제로 상대하는** 타선 vs **리그 경기가 쓰는** 타선.
 *
 * ⚠ 이걸 안 찍고 조건을 바꿔 재다가 이 프로젝트에서 같은 자리를 **세 번**
 * 뒤집었다(구성기 비대칭 → batterMean 문제 → 다시 66이 맞음).
 * "커리어에서 무엇을 상대하는가"가 모든 판단의 기준이다.
 */
export async function opponentLineupProbe(): Promise<Record<string, unknown>> {
  const g = get(gameStore);
  const ents = get(masterStore).entities;
  const s: any = get(seasonStore);
  const { buildBatterLineup } = await import("../../apps/ui/src/shared/utils/matchLineupBuilder");

  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((p, c) => p + c, 0) / xs.length) : 0;
  const stat = (ls: any[]) => ({
    인원: ls.length,
    컨택: avg(ls.map((b) => b.contact ?? 0)),
    파워: avg(ls.map((b) => b.power ?? 0)),
    눈:   avg(ls.map((b) => b.eye ?? 0)),
  });

  // 주인공이 만나는 상대 팀들 (스케줄에서)
  const mine = (s.schedule ?? []).filter((e: any) => e.isProtagonistGame).slice(0, 8);
  const oppTeams = [...new Set(mine.map((e: any) =>
    e.homeTeamId === g.protagonist.teamId ? e.awayTeamId : e.homeTeamId))] as string[];

  const oppStats = oppTeams.map((t) => stat(buildBatterLineup(t, ents)));
  const merge = (k: "컨택" | "파워" | "눈") => avg(oppStats.map((o) => o[k]));

  return {
    "주인공이 상대하는 팀": oppTeams.length,
    "상대 타선 평균": { 컨택: merge("컨택"), 파워: merge("파워"), 눈: merge("눈") },
    "내 팀 타선": stat(buildBatterLineup(g.protagonist.teamId, ents)),
    "리그 전체 타자 평균": (() => {
      const bs = g.npcs.filter((n) => n.playerType !== "pitcher" && n.batting);
      return { 인원: bs.length,
               컨택: avg(bs.map((n) => n.batting!.contact ?? 0)),
               파워: avg(bs.map((n) => n.batting!.power ?? 0)) };
    })(),
  };
}

/**
 * 주인공 ERA와 리그 ERA의 **격차** — 루프의 판정 기준(오라클).
 *
 * ⚠ **오라클이 틀리면 빠르게 잘못된 곳으로 수렴한다.** 이번 프로젝트에서
 * 격리 3.73 → 커리어 7.06으로 크게 어긋난 적이 있다. 루프를 돌리기 전에
 * 이 값이 커리어 격차를 예측하는지 반드시 확인할 것.
 *
 * 같은 조건으로 양쪽을 재고 차이를 돌려준다:
 *   주인공  engineDuel (실제 상대 타선 수준 = batterMean 66 · 수비 66)
 *   리그    같은 엔진에 NPC 투수진을 넣어 돌린 것
 */
export async function eraGap(games: number): Promise<Record<string, unknown>> {
  const mine = await engineDuel(games, 66, 66);
  // 리그 쪽 — 같은 타선·수비에 리그 평균 수준 투수(OVR 66)를 세운다
  const leaguePitcher = {
    name: "리그평균", command: 66, velocity: 66, staminaCap: 66, mentalResil: 66,
    control: 66, movement: 66, clutch: 66, holdRunners: 66,
    arsenal: [{ type: "fastball", grade: 3 }, { type: "slider", grade: 3 }],
  };
  let outs = 0, er = 0;
  for (let i = 0; i < games; i++) {
    const st = JSON.parse(await window.projectB!.engine("startMatchNative", JSON.stringify({
      protagonistSide: "home", role: "SP", batterMean: 66, leagueId: "LEAGUE_HIGHSCHOOL",
      // ⚠ **투수진 셋이다.** 실제 리그는 선발→불펜→마무리로 교체한다 —
      // 한 명 완투로 재면 주인공(완투)과 조건이 같아져 격차가 사라진다
      opponentPitchers: [leaguePitcher,
        { ...leaguePitcher, name: "불펜", staminaCap: 45 },
        { ...leaguePitcher, name: "마무리", staminaCap: 40 }],
      fielders: _mkFielders(66),
    })));
    if (st.error) return { 오류: st.error };
    const fin = JSON.parse(await window.projectB!.engine("simToGameEnd", JSON.stringify(st)));
    if (fin.error) return { 오류: fin.error };
    for (const l of (fin.opponentQueue?.lines ?? [])) { outs += l.outs ?? 0; er += l.er ?? 0; }
  }
  const leagueEra = outs > 0 ? Math.round((er * 27 / outs) * 100) / 100 : null;
  const mineEra = Number(mine.ERA ?? 0);
  return {
    주인공: mineEra, 리그: leagueEra,
    격차: leagueEra != null ? Math.round((mineEra - leagueEra) * 100) / 100 : null,
    주인공이닝: mine.이닝, 리그이닝: Math.round(outs / 3),
  };
}

/**
 * 팀별 경기 수 — **대회가 넉아웃이라 일찍 지면 경기가 확 준다.**
 *
 * 주인공 등판이 시즌 9회뿐인데, 팀 경기 44~48 중 대부분이 연습경기다.
 * 리그(공식) 경기가 13이면 등판률은 오히려 높다 — 진짜 병목은 경기 수다.
 */
export function teamGameCount(): Record<string, unknown> {
  const s: any = get(seasonStore);
  const g = get(gameStore);
  const sched = (s.schedule ?? []) as any[];
  const byTeam: Record<string, { 공식: number; 연습: number }> = {};
  for (const e of sched) {
    for (const t of [e.homeTeamId, e.awayTeamId]) {
      if (!t) continue;
      const a = (byTeam[t] ||= { 공식: 0, 연습: 0 });
      if (e.isFriendly) a.연습++; else a.공식++;
    }
  }
  const counts = Object.values(byTeam).map((v) => v.공식).sort((a, b) => a - b);
  const mine = byTeam[g.protagonist.teamId] ?? { 공식: 0, 연습: 0 };
  const n = counts.length || 1;
  return {
    팀수: counts.length,
    "공식경기 최소": counts[0], "p25": counts[Math.floor(n * 0.25)],
    "중앙": counts[Math.floor(n / 2)], "p75": counts[Math.floor(n * 0.75)],
    "최대": counts[n - 1],
    "내 팀": mine,
  };
}

// ── NPC 드래프트 라운드 ↔ 능력치 대응표 (D단계) ──────────────────
//
// 주인공 산식(`determine_protagonist_draft`)과 NPC 산식(`calc_draft_score`)은
// **척도가 아예 다르다** — 주인공은 백분위 기반 0~100이고, NPC는
// `ovr*0.4 + edge + dev*0.35 + 잠재*0.1 + youth`라 대략 60~120이다.
//
// 둘을 직접 비교할 수는 없다. 잴 수 있는 건 **결과**다: 같은 OVR이 같은
// 라운드를 받는가. 주인공만 관대하면 육성 결과가 실제보다 좋게 보이고,
// 박하면 잘 키워도 보상이 없다.
//
// ⚠ **`npcs[].pitching`이 아니라 live를 읽는다.** 생성값은 안 자라서
// 3년을 추적해도 +0이다 — 이 저장소에서 네 번 나온 결함이다.
export function npcDraftTable(): Record<string, unknown> {
  const g = get(gameStore);
  const live = get(npcLiveStatsStore);
  const log = g.schoolState?.careerDraftPickLog ?? [];
  if (log.length === 0) return { 표본: 0, rows: [] };

  const byId = new Map(g.npcs.map((n) => [n.npcId, n]));
  const rows: {
    round: number; pick: number; ovr: number; genOvr: number;
    age: number; dev: number; type: string; route: string;
  }[] = [];
  for (const r of log) {
    const n = byId.get(r.playerId);
    if (!n) continue;
    // ⚠ **`playerType`으로 거른다.** `ovr > 0`만 보면 타자가 섞여 들어온다 —
    // 투수 항목이 없는 선수도 `livePitchingOvrOf`가 1을 돌려주기 때문이다
    // (`patchNpcLiveOvr`의 `Math.max(1, ...)`). 첫 실측에서 OVR 1이 네 라운드에
    // 끼어 최소값을 통째로 망가뜨렸다
    if (n.playerType !== "pitcher") continue;
    const ovr = livePitchingOvrOf(n, live);
    if (!(ovr > 1)) continue;
    rows.push({
      round: r.round, pick: r.pickNo, ovr, age: n.age,
      // ⚠ **생성값도 같이 싣는다.** `processNpcDraft`가 Rust에 넘기는 후보는
      // `s.npcs`(생성 데이터)이고, `npc_core_ovr`은 거기 `pitching.ovr`을 읽는다.
      // 성장분은 `npcLiveStatsStore`에만 있으므로 **지명이 1학년 능력치로
      // 정해지고 있을 수 있다.** 어느 쪽과 라운드가 맞는지 재서 가린다 —
      // 이 저장소에서 다섯 번 나온 결함이라 단정하지 않고 잰다
      genOvr: n.pitching?.ovr ?? 0,
      route: r.route ?? "?",
      // NPC 산식은 `dev_rate * 0.35`를 얹는다 — OVR만 보면 라운드를 못 설명한다
      dev: n.developmentRate ?? 0,
      type: n.playerType,
    });
  }
  // ⚠ **주인공과 같은 저울로 옮기려면 또래 분포가 있어야 한다.**
  // 주인공 산식은 `백분위 * 0.6 + ovrNorm * 0.4`인데 NPC 산식은
  // `ovr*0.4 + edge + dev*0.35 + youth`라 절대점수다. 라운드별 OVR만
  // 비교하면 "누가 더 관대한가"를 알 수 없다 — 같은 백분위가 같은 라운드를
  // 받는지가 물어야 할 것이고, 그러려면 분모를 여기서 같이 집어야 한다.
  //
  // 주인공 호출부(`advanceWeek`)와 **같은 조건**으로 뽑는다: 고교 3학년 투수
  const peers = g.npcs
    .filter((n) => n.playerType === "pitcher" && n.grade === 3
      && n.currentLeague === "LEAGUE_HIGHSCHOOL")
    .map((n) => livePitchingOvrOf(n, live))
    .filter((o) => o > 1);

  return { 표본: rows.length, rows, peers };
}


// ── 드래프트 좌석 무결성 (E단계) ──────────────────────────────────
//
// 소스 검사로는 못 본다: 픽번호가 실제로 1..N 유일한가, 주인공이 딱 한 줄
// 있는가, 그 줄의 팀이 그 순번의 주인인가. 예전엔 111행에 56이 두 줄이었다.
export function draftSeatProbe(): Record<string, unknown> {
  const g = get(gameStore);
  const log = g.schoolState?.careerDraftPickLog ?? [];
  if (log.length === 0) return { 표본: 0 };
  const nos = log.map((r) => r.pickNo).sort((a, b) => a - b);
  const dup = nos.filter((v, i) => i > 0 && v === nos[i - 1]);
  const teams = [...new Set(log.map((r) => r.teamId))];
  const perRound = teams.length;
  // 순번 → 팀 대응이 라운드마다 같은가 (정순이면 (pickNo-1) % 팀수가 결정한다)
  const slotTeam = new Map<number, string>();
  let slotMismatch = 0;
  for (const r of log) {
    const slot = (r.pickNo - 1) % perRound;
    const t = slotTeam.get(slot);
    if (t == null) slotTeam.set(slot, r.teamId);
    else if (t !== r.teamId) slotMismatch++;
  }
  const mine = log.filter((r) => r.isUser);
  return {
    표본: log.length,
    번호중복: dup.length,
    빠진번호: nos.length > 0 ? (nos[nos.length - 1] - nos.length) : 0,
    최대번호: nos[nos.length - 1] ?? 0,
    팀수: perRound,
    슬롯팀불일치: slotMismatch,
    주인공줄: mine.length,
    주인공순번: mine[0]?.pickNo ?? null,
    주인공팀맞나: mine.length === 1
      ? slotTeam.get((mine[0].pickNo - 1) % perRound) === mine[0].teamId : null,
  };
}

// ── 고교 리그 투수 등판 분포 (수상 편중 조사) ────────────────────
//
// 주인공이 다승왕을 57시즌 중 38번 가져가는데 탈삼진왕·방어율왕은 0이다.
// ERA 4.36으로 자격(4.5)을 절반은 통과하는데 방어율왕이 0이라는 건 **더 잘
// 던진 NPC가 있다**는 뜻이다 — 주인공이 압도적인 게 아니라 승수만 몰린다.
//
// 가설: NPC 선발은 팀당 여럿이 등판을 나눠 갖는데 주인공은 혼자 던진다.
// 그러면 같은 실력이어도 승수가 주인공에게 쌓인다. **재서 가린다.**
export function hsPitcherLoadProbe(): Record<string, unknown> {
  const s = get(seasonStore);
  const ls = (s as unknown as { leagueState?: Record<string, { stats?: Record<string, unknown> }> })
    .leagueState?.["LEAGUE_HIGHSCHOOL"]?.stats ?? {};
  type P = { type: string; g: number; gs: number; w: number; ip: number; k: number; era: number };
  const rows: P[] = Object.values(ls)
    .filter((v): v is P => (v as P)?.type === "pitcher")
    .map((v) => v as P);
  if (rows.length === 0) return { 표본: 0 };

  const g = get(gameStore);
  const mine = (s as unknown as { stats?: Record<string, P> }).stats?.[g.protagonist.id];
  const q = (a: number[], p: number) =>
    a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;

  // 자격선을 넘은 사람만 — 수상 후보가 실제로 몇 명인지가 핵심이다
  const qualified = rows.filter((r) => (r.ip ?? 0) >= 40);
  return {
    "NPC투수": rows.length,
    "자격40이상": qualified.length,
    "NPC이닝중앙": q(rows.map((r) => r.ip ?? 0), 0.5),
    "NPC등판중앙": q(rows.map((r) => r.g ?? 0), 0.5),
    "NPC승중앙": q(rows.map((r) => r.w ?? 0), 0.5),
    "NPC최다승": q(rows.map((r) => r.w ?? 0), 1),
    "NPC최다K": q(rows.map((r) => r.k ?? 0), 1),
    // ⚠ 고교 시즌에 K 184가 찍혔다. 3인 로테이션 27경기면 60~70이닝이
    // 상한인데 그 세 배다 — 이닝을 같이 봐야 어디서 부푸는지 안다
    "NPC최다이닝": q(rows.map((r) => r.ip ?? 0), 1),
    "NPC최다등판": q(rows.map((r) => r.g ?? 0), 1),
    "NPC이닝p90": q(rows.map((r) => r.ip ?? 0), 0.9),
    // ⚠ **누구인지 잡는다.** 163이닝·32등판은 3인 로테이션 21~36경기에서
    // 나올 수 없다. 그 사람이 정말 고교 소속인지, 팀이 어디인지를 봐야
    // 리그 맵이 새는 건지 로테이션이 안 지켜지는 건지 갈린다
    ...(() => {
      let topId = "", top = -1;
      for (const [id, v] of Object.entries(ls)) {
        const r = v as P;
        if (r?.type === "pitcher" && (r.ip ?? 0) > top) { top = r.ip ?? 0; topId = id; }
      }
      const n = g.npcs.find((x) => x.npcId === topId);
      return {
        "최다이닝투수": topId,
        "그선수리그": n?.currentLeague ?? (topId === g.protagonist.id ? "주인공" : "npcs에 없음"),
        "그선수팀": n?.currentTeam ?? "-",
        "그선수학년": n?.grade ?? null,
        "그선수나이": n?.age ?? null,
      };
    })(),
    "NPC최저ERA": qualified.length ? q(qualified.map((r) => r.era ?? 99), 0) : null,
    "내이닝": mine?.ip ?? null,
    "내등판": mine?.g ?? null,
    "내승": mine?.w ?? null,
    "내K": mine?.k ?? null,
    "내ERA": mine?.era ?? null,
  };
}


// ── 이중 집계 판별 (고교 리그) ────────────────────────────────────
//
// 한 투수가 팀 경기(21~36)보다 많이 등판한다(최대 37). 로테이션 인덱스는
// 정상이라(+1/경기) 남는 설명은 **같은 경기를 두 번 집계**하는 것이다.
//
// 갈라내는 법: 순위표의 승+패+무 합은 "집계된 경기 수"이고, 일정에서
// 결과가 있는 항목 수는 "실제 치른 경기 수"다. 전자가 후자의 두 배면 이중이다.
//
// ⚠ **일정을 양쪽 다 센다.** 주인공 리그 일정(`schedule`)과 배경 리그
// 일정(`leagueSchedules`)에 같은 리그가 나뉘어 있을 수 있다 — 한쪽만 보면
// "일정이 적다"로 오해하고 엉뚱한 결론을 낸다.
export function doubleCountProbe(): Record<string, unknown> {
  const s = get(seasonStore);
  const ls = (s as unknown as {
    leagueState?: Record<string, { standings?: { teamId: string; wins: number; losses: number; draws: number }[] }>
  }).leagueState?.["LEAGUE_HIGHSCHOOL"];
  const st = ls?.standings ?? [];
  if (st.length === 0) return { "표본": 0 };

  const byTeamStanding = new Map<string, number>();
  for (const x of st) byTeamStanding.set(x.teamId, (x.wins ?? 0) + (x.losses ?? 0) + (x.draws ?? 0));

  const byTeamSched = new Map<string, number>();
  const bump = (t: string) => byTeamSched.set(t, (byTeamSched.get(t) ?? 0) + 1);
  for (const e of s.schedule) {
    if (!e.result || e.isFriendly) continue;
    bump(e.homeTeamId); bump(e.awayTeamId);
  }
  const bg = (s as unknown as {
    leagueSchedules?: Record<string, { homeTeamId: string; awayTeamId: string; result?: unknown; isFriendly?: boolean }[]>
  }).leagueSchedules?.["LEAGUE_HIGHSCHOOL"] ?? [];
  for (const e of bg) {
    if (!e.result || e.isFriendly) continue;
    bump(e.homeTeamId); bump(e.awayTeamId);
  }

  const rows: { standing: number; sched: number }[] = [];
  for (const [t, n] of byTeamStanding) rows.push({ standing: n, sched: byTeamSched.get(t) ?? 0 });
  const withSched = rows.filter((r) => r.sched > 0);
  const mid = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
  const ratio = withSched.map((r) => r.standing / r.sched);
  return {
    "팀수": rows.length,
    "일정있는팀": withSched.length,
    "순위표경기중앙": mid(rows.map((r) => r.standing)),
    "일정경기중앙": mid(withSched.map((r) => r.sched)),
    "비율중앙": ratio.length ? Number(mid(ratio).toFixed(2)) : null,
    "비율최대": ratio.length ? Number(Math.max(...ratio).toFixed(2)) : null,
  };
}


// ── 시즌 종료 직전 스냅샷 (계측 전용) ────────────────────────────
//
// ⚠ **주인공 3학년은 `isSeasonEnded()` 갈래를 안 탄다.** W47 진로 결정이
// `runWorldSeasonEnd`를 직접 부르고 끝내기 때문이다. 하네스가 롤오버를
// 기다렸다가 잡으면 고교 **마지막 해를 영영 못 잡는다** — 실측 표본이
// 늘 1·2학년뿐이었고 3학년은 n=0이었다.
//
// W47에 잡는 우회도 안 된다. 시즌이 5주 모자란 값이라 이닝이 과소 집계되고
// (실측 45.0 vs 52.8) ERA도 미완성 시즌 값이 된다.
//
// 그래서 엔진이 **기록이 온전한 마지막 지점**에서 이 훅을 부른다.
const _seasonEndSnaps: Record<string, unknown>[] = [];

/** 조사 시작 시 한 번 건다. 같은 해가 두 번 잡히지 않는다(가드 뒤에서 불린다) */
export function armSeasonEndSnapshot(): void {
  setBeforeSeasonEndHook((year) => {
    const g = get(gameStore);
    _seasonEndSnaps.push({
      연도: year,
      단계: g.protagonist.careerStage,
      학년: g.protagonist.grade ?? null,
      ...armProbe(),
      등판분포: hsPitcherLoadProbe(),
    });
  });
}

/** 모아둔 스냅샷을 꺼내고 비운다 — 회차 사이에 섞이지 않게 */
export function drainSeasonEndSnapshots(): Record<string, unknown>[] {
  const out = [..._seasonEndSnaps];
  _seasonEndSnaps.length = 0;
  return out;
}

// ── 이벤트 깔때기 (트랙 B) ────────────────────────────────────────

/**
 * **이벤트가 안 뜬 건가, 떴는데 밀려난 건가** — 이 둘을 가르는 계측.
 *
 * `mailboxProbe`는 소식함에 **닿은 뒤**를 본다. 그 앞에 깔때기가 하나 더 있다:
 * conditional은 조건을 통과해도 **주당 1건만** 나가고(정의 260건), random은
 * 풀 확률(18·22·26%)을 못 넘으면 통째로 안 돈다. 이 앞단이 안 보이면
 * "이벤트 87% 유실"을 상한 탓으로만 읽게 된다.
 *
 * 소식함 쪽 숫자(`mailboxProbe`)와 **같이 읽어야 한다** — 여기 `emitted`가
 * 곧 저기 생산량의 `evt-*` 몫이다.
 */
export function eventFunnelProbe(): Record<string, unknown> {
  const f = eventFunnelStats;
  const emitted = f.mandatory.emitted + f.conditional.emitted + f.random.emitted;
  const top = (m: Record<string, number>, n: number) =>
    Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([id, v]) => ({ 규칙: id, 건수: v }));
  return {
    주수: f.weeks,
    "엔진 시간(ms)": +f.elapsedMs.toFixed(1),
    "주당 ms": f.weeks ? +(f.elapsedMs / f.weeks).toFixed(3) : 0,
    발동: emitted,
    "주당 발동": f.weeks ? +(emitted / f.weeks).toFixed(2) : 0,
    mandatory:   { ...f.mandatory },
    conditional: { ...f.conditional },
    random:      { ...f.random },
    // 조건도 정책도 통과했는데 주당 1건 상한에 밀린 것 — 이 트랙의 핵심 숫자
    "밀린 규칙 상위": top(f.crowdedByRule, 15),
    "빈 메시지로 버려진 규칙": top(f.emptyByRule, 10),
    "밀린 규칙 종수": Object.keys(f.crowdedByRule).length,
    // 선택지 단위 조건 — 몇 개가 제시됐고 몇 개가 열렸나
    "선택지 제시": f.optionsOffered,
    "선택지 열림": f.optionsOpen,
    "선택지 전부 닫힘": f.decisionsClosedOut,
    // 정의 537건 중 커리어 내내 실제로 화면에 닿은 종수 — "몇 건이 후보였고
    // 몇 건이 떴는지"의 답이다. 건수가 아니라 **종수**를 본다
    "뜬 규칙 종수": Object.keys(f.emittedByRule).length,
    "뜬 규칙 상위": top(f.emittedByRule, 10),
  };
}

/** 회차 사이에 섞이지 않게 — 재기 직전에 부른다 */
export function resetEventFunnel(): void { resetEventFunnelStats(); }

/**
 * **이 규칙 하나가 어떻게 됐나** — 연계를 만들었을 때 "실제로 도는가"를 묻는 도구.
 *
 * `eventFunnelProbe`는 상위 N종만 찍는다. 새로 만든 이벤트는 대개 하위라
 * 목록에 안 나타나는데, **안 보이는 것과 안 뜬 것은 다르다.** 이름을 대고 묻는다.
 *
 * `밀림 > 0`이면 조건은 통과했다는 뜻이다 — 자리를 못 잡았을 뿐이고,
 * 그것만으로도 "조건이 도는가"의 답은 나온다.
 */
export function eventRuleProbe(ruleId: string): Record<string, unknown> {
  const f = eventFunnelStats;
  return {
    규칙: ruleId,
    발동: f.emittedByRule[ruleId] ?? 0,
    밀림: f.crowdedByRule[ruleId] ?? 0,
    "빈 메시지": f.emptyByRule[ruleId] ?? 0,
    주인공태그: [...get(gameStore).protagonist.tags],
  };
}
