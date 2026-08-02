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
import { autoAdvanceStore, setAutoLogFile } from "../../apps/ui/src/shared/stores/autoAdvance";
import { startNewGameV3 } from "../../apps/ui/src/shared/repo/slotLifecycleV3";
import { assignHighschoolPosition } from "../../apps/ui/src/shared/utils/pitcherRoleEngine";
import { runAutoAdvance, lastAutoAdvanceError } from "../../apps/ui/src/shared/usecases/runAutoAdvance";
import { advanceWeek } from "../../apps/ui/src/shared/usecases/advanceWeek";
import { nextPendingAction, seasonEnded } from "../../apps/ui/src/shared/stores/season";
import { runDraftBoardBackground } from "../../apps/ui/src/shared/usecases/runDraftBoardBackground";
import { runSeasonRollover } from "../../apps/ui/src/shared/usecases/seasonRollover";
import { processTradeWindow } from "../../apps/ui/src/shared/usecases/weekPhases/market";
import { runDevScenarios } from "../../apps/ui/src/shared/usecases/devScenarios";
import {
  signNegotiatedContract, applyOptionClause, signFaOffer, waitFaMarket,
  acceptTrade, rejectTrade,
} from "../../apps/ui/src/shared/usecases/contractDecision";
import { generateFaOffers } from "../../apps/ui/src/shared/utils/faEngine";
import {
  retireProtagonist, isRetired, evalRetirementPressure, calcMarketValueForProtagonist,
} from "../../apps/ui/src/shared/usecases/retirement";
import { runCampusEventsWeek } from "../../apps/ui/src/shared/usecases/campusEvents";
import { enlistProtagonist } from "../../apps/ui/src/shared/usecases/militaryDecision";
import {
  submitCareerApplications, confirmCareerResults, chooseDraft,
  chooseSchoolOrIndependent, acceptDraftOffer, rejectDraftOffer, continueCurrentStage,
} from "../../apps/ui/src/shared/usecases/careerDecision";
import { facilityFactorOf, SANGMU_TEAM_IDS } from "../../apps/ui/src/shared/utils/ids";
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

    case "retirementAsk":
      // 은퇴 권고를 **수락**한다 — 헤드리스는 커리어가 끝나는지 보는 게 목적이다.
      // 실제 게임에서는 플레이어가 "더 뛴다"를 고를 수 있다
      await retireProtagonist("decline");
      return "retirementAsk(retire)";

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
    // ⚠ **상무를 빼야 한다.** 체육부대 입대자는 `currentLeague`가
    // LEAGUE_UNIVERSITY로 바뀌어 대학 리그에서 뛴다. 20대 중후반 프로 선수라
    // 학년이 없고 나이도 학부생 범위를 넘는데, 그건 설계지 결함이 아니다.
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
