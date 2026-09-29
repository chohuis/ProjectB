/**
 * **훈련 · 컨디션 · 부상 · 성장** (2026-09-30 · Ⅱ-1 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `advanceWeek.ts` 의
 *   `processWeekBoundary` 안에 있던 「새 보상의 지속 효과」부터 「훈련 결과 후
 *   주인공 상태 로컬 계산」까지가 그대로 나왔다. 블록 경계는 옮기기 전 파일의
 *   주석 절을 그대로 따랐다.
 *
 * ⚠ **성실 감쇠·사기 회귀 상수도 같이 왔다.** 여기서만 쓰는데 `advanceWeek.ts`
 *   에 남겨 두면 이 파일이 그 파일을 물고 그 파일이 이 파일을 물어 **순환**이
 *   된다. `advanceWeek.ts` 는 `moraleAfterWeek` 를 **다시 내보내기**만 한다 —
 *   정본은 하나이고 옛 import 경로가 그대로 산다.
 *
 * ⚠ **인자 묶음 하나로 받는다.** 옮기기 전 이 절이 읽던 지역 변수가 열넷이라
 *   이름을 그대로 두는 것이 본문을 한 글자도 안 고치는 유일한 길이다.
 *   `logs` 는 **참조로** 받아 같은 배열에 쌓인다.
 *
 * ⚠ 검사는 주간 진행 경로를 **한 덩이로** 읽으므로(`__tests__/weekPathSrc.ts`)
 *   검사 문장은 한 글자도 안 바뀌었다.
 */
import { get } from "svelte/store";
import { seasonStore, type SeasonStoreState } from "../../stores/season";
import type { GameStoreState } from "../../stores/game";
import type { MasterState, TeamRef } from "../../stores/master";
import { trainingIntensityOf } from "../../utils/arsenal";
import { seedOf } from "../../utils/seedOf";
import { EVENT_LANE_RANDS } from "../../utils/eventEngine";
import { BankPicker } from "../../utils/reportCopy";
import { calcWeeklyFinance, calcTrainingBonus } from "../finance";
import { calcTrainingGrowth, type GrowthResult } from "../../utils/growthEngine";
import { facilityTierOf } from "../../utils/ids";
import type { StaffMods } from "../../utils/staffEffects";
import type { WeeklyStudyResult } from "../../utils/academicsEngine";
import { getPermanentPenalty } from "./injuries";
import { loadRetirementRules, surgeryRetireChance } from "../retirement";
import { getPitchCoachName, makeTrainingMessage } from "./training";
import { INJURY_LABEL } from "../../types/save";
import type {
  InjuryHistoryEntry,
  InjurySeverity,
  InjuryState,
  InjuryType,
  PitchingAttributes,
  ProtagonistSave,
} from "../../types/save";
import type { MessageItem } from "../../types/main";

/**
 * 성실 주간 자연 감쇠 (사용자 확정 2026-08-26).
 *
 * **0.4는 실측으로 골랐다.** 같은 씨앗에 0 / 0.1 / 0.2 / 0.4를 걸어 재고,
 * 0.4를 다시 3회 재서 확정했다:
 *
 *     감쇠 0.1  평균 95 · 80이상 92%   ← 거의 안 듣는다
 *     감쇠 0.2  평균 91 · 80이상 83%   ← 미미하다
 *     감쇠 0.4  평균 76 · 80이상 44%   ← **띠가 생긴다**
 *
 *     0.4 · 3회 최소   49.4 · 56.2 · 54.6   (전에는 60 · 60 · 60)
 *          · 80이상    45% · 0% · 54%       (전에는 82~95%)
 *
 * ⚠ **`diligence_lte 30`은 여전히 0회다. 그게 맞다** — 계측 하네스는 늘
 *   최선을 고르는 주인공이다. 성실히 플레이하는데 30까지 떨어지면
 *   그 조건의 뜻이 뒤집힌다. 30은 **게으른 플레이어**가 닿을 자리다.
 *
 * ⚠ `PB_DIL_DECAY`로 덮어 다시 잴 수 있다.
 */
const DILIGENCE_WEEKLY_DECAY = Number(
  (typeof process !== "undefined" && process.env?.PB_DIL_DECAY) || 0.4,
);

/**
 * 🔴 **사기는 기준값으로 끌린다 — 평균 회귀** (사용자 확정 2026-09-01).
 *
 * 성실과 **같은 병**이었는데 더 심했다. 실측(`probe:traits --path univ` ·
 * 8시즌 · 씨앗 20260803):
 *
 * ```
 *   대학  최소 100 · 최대 100 · 평균 100   표본 56주 — **한 번도 안 움직인다**
 *   고교  최소  70 · 최대 100 · 평균  99
 *   사기 ≤60 에 닿은 주   0
 * ```
 *
 * 그래서 사기를 조건으로 쓰는 **대학 이벤트 아홉이 전멸**했다(트랙 B 실측 ·
 * 문턱 40·48·50·50·55·55·55·58·60). 다른 무대는 같은 문턱대가 뜬다.
 *
 * ⚠ **올리는 경로만 있었다** — 경기 승패로도 훈련으로도 안 움직이고
 * 자연 감쇠도 없다. 이벤트 선택지(양수가 3배)와 TOP10 순위 보상
 * (`rankEffect` · 매주 +1~5, **음수 없음**)이 전부였다.
 *
 * ## 왜 감쇠가 아니라 회귀인가
 *
 * 성실은 **습관**이라 방치하면 떨어지는 게 맞다(단방향 감쇠). 사기는
 * **기분**이라 좋을 때도 나쁠 때도 중립으로 돌아온다 — 바닥에 붙어
 * 영영 못 올라오면 그것도 죽은 축이다.
 *
 * ```
 *   사기 100 → 매주 (60-100) × 0.05 = **-2.0**
 *   사기  70 →       (60- 70) × 0.05 = **-0.5**   가까울수록 느려진다
 *   사기  30 →       (60- 30) × 0.05 = **+1.5**   바닥에서는 올라온다
 * ```
 *
 * TOP10 보상(+1~5)과 만나 **평형점**이 생긴다 — 상위권 주인공은 높게,
 * 무명은 60 근처. 그게 노린 것이다.
 *
 * ⚠ **소수를 유지한다.** 정수로 반올림하면 회귀량이 1 미만일 때 매주 0이
 * 되어 아무 일도 안 일어난다(성실에서 겪었다).
 *
 * ⚠ `PB_MORALE_PIVOT` · `PB_MORALE_PULL` 로 덮어 다시 잴 수 있다.
 */
const MORALE_PIVOT = Number((typeof process !== "undefined" && process.env?.PB_MORALE_PIVOT) || 60);
const MORALE_WEEKLY_PULL = Number(
  (typeof process !== "undefined" && process.env?.PB_MORALE_PULL) || 0.05,
);

/**
 * 한 주가 지난 뒤의 사기. **검사가 이 함수를 부른다.**
 *
 * ⚠ 식을 인라인으로 두면 검사가 자기 사본을 만들어 보게 되고, 그러면
 * **코드를 되돌려도 검사가 초록**이다(변이가 안 잡힌다). 순수 함수로
 * 뽑아 두면 검사와 코드가 같은 것을 본다.
 */
export function moraleAfterWeek(cur: number): number {
  return Math.max(0, Math.min(100, cur + (MORALE_PIVOT - cur) * MORALE_WEEKLY_PULL));
}

/** 옮기기 전 지역 변수를 그대로 담은 인자 묶음 — 이름이 본문과 같아야 한다 */
export interface WeeklyTrainingArgs {
  weekNum: number;
  /** 함수 머리의 스냅샷 셋 */
  g: GameStoreState;
  s: SeasonStoreState;
  m: MasterState;
  /** 주간 로그 — **참조로 받는다.** 옮기기 전과 같은 배열에 쌓여야 한다 */
  logs: string[];
  /** 학업 — 훈련 효율을 깎는다 */
  studyResult: WeeklyStudyResult;
  /** 대학 학사 경고 단계의 훈련 효율 하락 (없으면 1.0) */
  univEffMod: number;
  majorEffBonus: number;
  coachEffBonus: number;
  /** 스태프 배수 + 특성 보정 */
  myMods: StaffMods;
  teamRef: TeamRef | undefined;
  slumpPenalty: number;
  newLowMoraleWeeks: number;
  alreadyInjured: boolean;
}

/** 아래 절들이 그대로 쓰는 열 */
export interface WeeklyTrainingResult {
  growth: GrowthResult;
  afterP: ProtagonistSave;
  trainingMsg: MessageItem | null;
  trainingScoutDelta: number;
  ovrDeltaThisWeek: number;
  weeklyNet: number;
  reportPicker: BankPicker;
  eventRands: number[];
  teb: ProtagonistSave["trainEffBoost"];
  irm: ProtagonistSave["injuryRiskMod"];
}

export async function runWeeklyTraining({
  weekNum,
  g,
  s,
  m,
  logs,
  studyResult,
  univEffMod,
  majorEffBonus,
  coachEffBonus,
  myMods,
  teamRef,
  slumpPenalty,
  newLowMoraleWeeks,
  alreadyInjured,
}: WeeklyTrainingArgs): Promise<WeeklyTrainingResult> {
  // ── 새 보상의 지속 효과 (2026-09-08 · §5 `trainEffBoost`·`injuryRiskMod`) ──
  //
  // 🔴 **남은 주가 0이면 없는 것과 같다.** 주를 안 줄이면 한 번 받은 보정이
  //    커리어 내내 남는다 — 아래 `growth.protagonistPatch` 에서 줄인다.
  const teb = g.protagonist.trainEffBoost;
  const trainEffFactor = teb && teb.weeksLeft > 0 ? 1 + teb.pct / 100 : 1;
  const irm = g.protagonist.injuryRiskMod;
  // `pct` 는 「위험이 몇 % 오르나」라 음수가 덜 다치는 쪽이다.
  // `injuryPrevention` 은 **클수록 덜 다치는** 축이라 나눠서 부호를 맞춘다
  const injuryRiskFactor = Math.max(0.2, irm && irm.weeksLeft > 0 ? 1 + irm.pct / 100 : 1);

  // 훈련 강도 — 정본은 `utils/arsenal.ts`의 `trainingIntensityOf` 하나다
  const trainingIntensity = trainingIntensityOf([
    g.trainingPlan.primaryProgramId,
    g.trainingPlan.secondaryProgramId,
    g.trainingPlan.secondary2ProgramId,
  ]);

  // 동일 부위 이전 부상 이력 여부 (moderate 이상)
  const hasPriorInjurySameArea = (g.protagonist.injuryHistory ?? []).some(
    (h) => h.severity !== "light",
  );
  // +2는 인접권역 다이제스트용이다 (권역 하나 · 리그 하나 고르기).
  // 이벤트 엔진은 앞에서부터 순서대로 소비하므로 뒤 두 개는 안 건드린다 —
  // TS 게임 로직에서 Math.random()은 금지라 난수는 전부 Rust에서 온다
  const NEWS_RANDS = 2;
  /**
   * 주간 리포트 문안 은행 여섯 (C2) — `train#subject`·`train#body`·
   * `train#program`·`injury#subject`·`mybody#subject`·`mybody#lead`.
   *
   * 🔴 **꼬리에서 가져간다.** 이벤트 엔진은 앞에서부터 순서대로 먹으므로
   *   여기서 뒤를 떼어 써야 이벤트 뽑기가 안 밀린다 — 앞에서 떼면 같은
   *   씨앗의 이벤트가 통째로 달라진다.
   * ⚠ `Math.random()` 은 금지다(CLAUDE.md) — 문안 뽑기도 Rust 난수다.
   */
  const REPORT_RANDS = 6;
  // 🔴 **풀 수로 세던 걸 상수로 바꿨다** (2026-09-08). 랜덤 풀이 노말 등급으로
  //    흡수돼 `maxPicksPerWeek` 가 없어졌다 — 이제 이벤트가 쓰는 난수는
  //    등급 추첨 1 + 등급 안 뽑기(폴백 포함) 최대 4 + 문장 뱅크다
  //    (`eventEngine.EVENT_LANE_RANDS`).
  const randCount = EVENT_LANE_RANDS + NEWS_RANDS + REPORT_RANDS;

  // ── 4개 독립 IPC 병렬 실행 (Phase 3) ──────────────────────────
  const [facilityEffModRaw, injuryCalcRaw, finance, trainingSub, eventRandsRaw] = await Promise.all(
    [
      window.projectB!.weekCalcFacilityEff(
        JSON.stringify({
          careerStage: g.protagonist.careerStage,
          // refs의 국내 팀엔 `tier`가 없다 — 리그에서 파생한다 (ids.ts 정본)
          teamTier: teamRef ? facilityTierOf(teamRef.leagueId) : null,
          facilityInvestment: myMods.facility,
        }),
      ),
      window.projectB!.weekCalcInjury(
        JSON.stringify({
          // 🔴 **씨앗을 넘긴다.** 안 넘기면 엔진이 `thread_rng`로 떨어져
          //    같은 세이브도 실행마다 다른 주에 다친다. 그 차이가 성적으로,
          //    성적이 진로로 번져 같은 씨앗이어도 프로에 갔다 독립에 갔다 한다.
          seed: seedOf(
            get(seasonStore).worldSeed ?? 0,
            get(seasonStore).seasonYear,
            weekNum,
            "injury-protagonist",
          ),
          fatigue: g.protagonist.fatigue,
          consecutiveHighFatigueWeeks: g.protagonist.consecutiveHighFatigueWeeks ?? 0,
          hasInjury: alreadyInjured,
          currentInjuryType: g.protagonist.injury?.type ?? null,
          currentSeverity: g.protagonist.injury?.severity ?? null,
          recoveryWeeksLeft: g.protagonist.injury?.recoveryWeeksLeft ?? null,
          playerType: g.protagonist.playerType,
          age: g.protagonist.age,
          condition: g.protagonist.condition,
          trainingIntensity,
          consecutiveLowMoraleWeeks: g.protagonist.consecutiveLowMoraleWeeks ?? 0,
          hasPriorInjurySameArea,
          priorSteroidUsed: g.protagonist.injury?.steroidUsed ?? false,
          // 코치 관리력이 발생 확률을, 구단 시설이 회복 주차를 민다 (§7-5 F-1).
          // 🔴 **부상 위험 보정도 같은 축이다** (2026-09-08 · §5 `injuryRiskMod`).
          //    `pct` 는 「위험이 몇 % 오르나」라 음수가 덜 다치는 쪽이고,
          //    `injuryPrevention` 은 **클수록 덜 다치는** 축이라 부호를 뒤집어 나눈다.
          //    ⚠ 새 인자를 만들지 않는다 — 만들면 Rust 쪽에 계수 자리가 둘이 된다.
          injuryPrevention: myMods.injuryPrevention / injuryRiskFactor,
          recoveryBoost: myMods.facility,
        }),
      ),
      // 개인 재정 (§7-5 F-3). 예전 `weekCalcWeeklyNet`은 무대별 상수 표가 Rust
      // 안에 박혀 있어 조정하려면 재컴파일이 필요했다 — 이제 규칙 파일이 정본이다
      calcWeeklyFinance({ protagonist: g.protagonist, seasonYear: s.seasonYear }),
      // 개인 트레이닝 구독 — 보너스가 팀 자원에 반비례한다 (DESIGN §7.3)
      calcTrainingBonus({ protagonist: g.protagonist }),
      // 🔴 **씨앗을 안 넘기고 있었다** (2026-09-07). `roll_random_batch` 는
      //    씨앗이 0이면 `thread_rng` 로 떨어진다 — 그래서 **이벤트 뽑기가 실행마다
      //    달랐고**, 선택지 효과가 능력치를 밀어 같은 씨앗·같은 경기 결과인데도
      //    고교 3년 뒤 OVR·구속이 갈렸다(실측: 3회에 75/76/76 · 76/77/78).
      //    같은 자리의 `injuries.ts` 는 처음부터 `seedOf` 를 넘기고 있었다 —
      //    **한쪽만 배선된 형태**다.
      window.projectB!.weekRollRandomBatch(
        randCount,
        seedOf(
          get(seasonStore).worldSeed ?? 0,
          get(seasonStore).seasonYear,
          weekNum,
          "event-rands",
        ),
      ),
    ],
  );
  const facilityEffMod = JSON.parse(facilityEffModRaw) as number;
  const injuryCalc = JSON.parse(injuryCalcRaw) as {
    injuryUpdate: { type: string; severity: string; recoveryWeeksLeft: number } | null;
    justOccurred: boolean;
    justHealed: boolean;
    effMod: number;
    newConsecutiveHighFatigueWeeks: number;
    source: string | null;
    /** 부상 전조 — 임계 넘긴 첫 주에만 온다 (§7-5 F-2) */
    warning?: { kind: string; fatigue: number; risk: number };
  };
  const weeklyNet = finance.netWeekly;
  const eventRands = JSON.parse(eventRandsRaw) as number[];
  /**
   * 문안 은행 하나 — 훈련·부상·내 몸 셋이 **같은 것을 쓴다.**
   *
   * 🔴 **하나여야 한다.** 리포트마다 따로 만들면 난수 꼬리를 셋이 같은
   *   자리에서 떼어 가고, 같은 주 세 리포트가 늘 같은 인덱스를 뽑는다.
   *   기억 키(`train#subject`·`injury#subject`…)는 은행마다 갈려 있으니
   *   하나로 묶어도 서로를 안 흔든다(`reportCopy.BankPicker` 머리말).
   * ⚠ 뽑은 인덱스는 아래에서 `sentenceMemory` 로 되돌린다 — 안 되돌리면
   *   「직전 제외」가 매주 초기화돼 같은 제목이 연속으로 난다.
   */
  const reportPicker = new BankPicker(
    get(seasonStore).sentenceMemory ?? {},
    eventRands.slice(-REPORT_RANDS),
  );
  const injuryJustOccurred = injuryCalc.justOccurred;
  const injuryJustHealed = injuryCalc.justHealed;

  // Rust 출력 → InjuryState 변환
  let injuryState: InjuryState | undefined;
  if (!injuryJustHealed && injuryCalc.injuryUpdate) {
    if (injuryJustOccurred) {
      injuryState = {
        type: injuryCalc.injuryUpdate.type as InjuryType,
        severity: injuryCalc.injuryUpdate.severity as InjurySeverity,
        recoveryWeeksLeft: injuryCalc.injuryUpdate.recoveryWeeksLeft,
        totalRecoveryWeeks: injuryCalc.injuryUpdate.recoveryWeeksLeft,
        permanentPenaltyApplied: false,
        source: (injuryCalc.source ?? "fatigue") as import("../../types/save").InjurySource,
      };
    } else if (alreadyInjured && g.protagonist.injury) {
      injuryState = {
        ...g.protagonist.injury,
        recoveryWeeksLeft: injuryCalc.injuryUpdate.recoveryWeeksLeft,
      };
    }
  }

  // ── 부상 전조 (§7-5 F-2) ────────────────────────────────────
  //
  // 임계를 넘은 첫 주는 부상 판정을 건너뛰고 여기서 경고만 낸다. 그대로 두면
  // 다음 주에 risk 확률로 실제 판정이 돈다 — 손쓸 기회를 한 번 주는 장치다.
  const injuryWarning = injuryCalc.warning ?? null;

  const SURGERY_REHAB_EFF: Record<number, number> = { 1: 0.0, 2: 0.1, 3: 0.3, 4: 0.6 };
  let effectiveInjuryEffMod = injuryCalc.effMod;
  if (injuryState && injuryState.severity === "surgery") {
    const elapsed = injuryState.totalRecoveryWeeks - injuryState.recoveryWeeksLeft;
    const pct = injuryState.totalRecoveryWeeks > 0 ? elapsed / injuryState.totalRecoveryWeeks : 0;
    const phase: 1 | 2 | 3 | 4 = pct < 0.25 ? 1 : pct < 0.5 ? 2 : pct < 0.75 ? 3 : 4;
    injuryState = { ...injuryState, rehabPhase: phase };
    effectiveInjuryEffMod = SURGERY_REHAB_EFF[phase];
  }

  // 개인 트레이닝 구독 보너스 — 사비를 들인 만큼 효율이 오른다.
  // **팀 자원에 반비례**하므로 열악한 팀일수록 이 값이 크다 (DESIGN §7.3)
  const subBonus = trainingSub.byArea.reduce((a, b) => a + b.effective, 0);

  // `univEffMod`는 학사 경고 단계의 훈련 효율 하락이다 (대학 전용, 없으면 1.0)
  const finalEffMod =
    studyResult.efficiencyMod *
    univEffMod *
    (1 + majorEffBonus + coachEffBonus + subBonus) *
    // 이벤트가 준 훈련 효율 보정 (§5 `trainEffBoost`) — 시설·개인 트레이닝과
    // 같은 층이다. 안 곱하면 레어 보상이 데이터에만 있고 아무 일도 안 한다
    trainEffFactor *
    facilityEffMod *
    slumpPenalty *
    effectiveInjuryEffMod;

  // ⚠ **프로그램 표를 넘긴다.** 안 넘기면 Rust 역직렬화가 실패해 오류가 난다 —
  // 예전처럼 하드코딩된 표로 조용히 굴러가지 않는다 (정본은 programs.json)
  const growth = await calcTrainingGrowth(
    g.protagonist,
    g.trainingPlan,
    finalEffMod,
    myMods,
    m.trainingPrograms,
  );
  // 관계도가 "이번 주 성장"을 보려면 여기서 잡아 둬야 한다 — 아래에서
  // 패치가 스토어에 반영된 뒤엔 차이를 구할 수 없다
  const ovrDeltaThisWeek =
    (growth.protagonistPatch.pitching?.ovr ?? g.protagonist.pitching.ovr) -
    g.protagonist.pitching.ovr;
  if (subBonus > 0) {
    growth.logs.push(
      `[개인 트레이닝] 효율 +${(subBonus * 100).toFixed(1)}% (구독 ${trainingSub.byArea.length}건 · 주 ${trainingSub.weeklyCost}만원${trainingSub.inverseFactor !== 1 ? ` · 팀 시설 보정 ×${trainingSub.inverseFactor.toFixed(2)}` : ""})`,
    );
  }

  if (newLowMoraleWeeks >= 3)
    growth.logs.push(`[슬럼프] 사기 저하 ${newLowMoraleWeeks}주 연속 — 훈련 효율 -30%`);
  if (coachEffBonus > 0.01)
    growth.logs.push(`[코치] 투수 코치 지도 보너스 +${Math.round(coachEffBonus * 100)}%`);
  if (injuryJustOccurred && injuryState) {
    const label = INJURY_LABEL[injuryState.type];
    growth.logs.push(`[부상] ${label} 발생 — ${injuryState.recoveryWeeksLeft}주 회복 필요`);
    if (injuryState.severity === "moderate" || injuryState.severity === "severe") {
      seasonStore.pushPendingAction({
        type: "injuryTreatment",
        injuryType: injuryState.type,
        severity: injuryState.severity,
      });
    }
    // ── 부상 은퇴 판정 (수술급 발생 즉시) ────────────────────────
    //
    // ⚠ **주인공에게는 이 경로가 없었다.** NPC는 `weekPhases/injuries`가
    // 수술 발생 즉시 굴리는데(36세 이상 65%), 주인공은 수술을 받아도 아무
    // 판정이 없어 설계의 트리거 셋 중 "부상 강제"가 데이터상 존재하지 않았다.
    //
    // **NPC와 같은 표를 쓴다** (`retirementRules.surgery`). 따로 두면
    // "NPC는 36세에 은퇴하는데 나는 45세까지 뛴다"가 된다.
    if (injuryState.severity === "surgery") {
      const retireRules = await loadRetirementRules();
      // 조용히 넘어가지 않는다 — 규칙이 없으면 커리어가 끝나지 않는다
      if (!retireRules) {
        throw new Error("[은퇴판정] generation_rules.json에 retirementRules가 없다");
      }
      {
        const hadSurgery = (g.protagonist.injuryHistory ?? []).some(
          (h) => h.severity === "surgery",
        );
        const chance = surgeryRetireChance(g.protagonist.age, hadSurgery, retireRules);
        // TS에서 Math.random()은 금지 — 난수는 전부 Rust에서 온다
        // ⚠ **씨앗도 넘긴다.** 안 넘기면 `thread_rng` 라 같은 세이브를 다시
        //   열 때마다 은퇴 여부가 달라진다(2026-09-07 · 위 배치와 같은 결함)
        const roll =
          (
            JSON.parse(
              await window.projectB!.weekRollRandomBatch(
                1,
                seedOf(
                  get(seasonStore).worldSeed ?? 0,
                  get(seasonStore).seasonYear,
                  weekNum,
                  "surgery-retire",
                ),
              ),
            ) as number[]
          )[0] ?? 1;
        if (roll < chance) {
          seasonStore.pushPendingAction({
            type: "retirementAsk",
            urgency: 1,
            reason: "injury",
            detail: `${INJURY_LABEL[injuryState.type]} — 재기 불가 판정`,
          });
          growth.logs.push(`[은퇴] ${INJURY_LABEL[injuryState.type]} 재기 불가 판정`);
        }
      }
    }
  } else if (alreadyInjured && !injuryJustHealed && injuryState) {
    growth.logs.push(`[부상] 회복 중 (${injuryState.recoveryWeeksLeft}주 남음) — 훈련 효율 -80%`);
    // 주간 치료비 차감. **단위는 만원이다** — `money`도 드래프트 계약금도 만원이다.
    //
    // 고치기 전엔 이 표만 원 단위(500_000)로 만원 단위 `money`에서 빼고 있었다.
    // 초기 자산이 1,200(=1,200만원)이니 **보존 치료 한 주면 자산이 0**이 됐다.
    const weeklyTreatmentCost: Record<string, number> = {
      conservative: injuryState.severity === "moderate" ? 30 : 50,
      counseling: 80,
    };
    const treatCost = weeklyTreatmentCost[injuryState.treatmentChoice ?? ""] ?? 0;
    if (treatCost > 0) {
      growth.protagonistPatch.money = Math.max(0, (g.protagonist.money ?? 0) - treatCost);
      growth.logs.push(`[치료비] 주간 치료비 ${treatCost}만원 차감`);
    }
  } else if (injuryJustHealed) {
    growth.logs.push(`[부상] 회복 완료 — 정상 훈련 재개`);
  } else if (injuryWarning) {
    const pct = Math.round(injuryWarning.risk * 100);
    growth.logs.push(
      `[부상 경고] 피로 ${Math.round(injuryWarning.fatigue)} — 이대로 한 주 더 가면 ${pct}% 확률로 부상`,
    );
    // ⚠ **소식을 여기서 바로 보내지 않는다.** NPC 부상은 이미 월간 리포트인데
    // 내 몸만 낱개로 왔다 — 경고 한 통, 부상 결장 한 통, 컨디션 결장 한 통이
    // 따로 떴다. 월말에 한 통으로 모은다(`buildMyBodyReport`).
    seasonStore.pushMyBodyEvent({
      week: weekNum,
      kind: "warning",
      fatigue: Math.round(injuryWarning.fatigue),
      riskPct: pct,
    });
  }
  if (studyResult.efficiencyMod < 1.0) {
    growth.logs.push(`[학업] 주간 효율 ${Math.round(studyResult.efficiencyMod * 100)}%`);
  }

  // ── 성실 자연 감쇠 ───────────────────────────────────────────
  //
  // 🔴 **성실이 오르기만 했다.** 실측(2026-08-26 · 3회):
  //      최소 60(=시작값) · 최대 99 · 표본의 82~95%가 80 이상
  //      `diligence_lte 30`은 **0회** — 영원히 false였다
  //
  //   보상이 양수 147건 대 음수 9건이고 **음수 중 7건이 대학 전용**이라,
  //   데이터로 음수를 아무리 늘려도 못 이긴다. 성실은 습관이니
  //   **방치하면 떨어지는 것**이 자연스럽다 (사용자 확정 2026-08-26).
  //
  // ⚠ **소수를 유지한다.** 정수로 반올림하면 감쇠율이 1 미만일 때
  //   매주 0이 되어 아무 일도 안 일어난다. 사기도 소수로 돈다.
  {
    const cur = g.protagonist.diligence ?? 0;
    const next = Math.max(1, cur - DILIGENCE_WEEKLY_DECAY);
    if (next !== cur) growth.protagonistPatch.diligence = next;
  }

  // 사기 — **기준값으로 끌린다.** 근거는 `MORALE_PIVOT` 주석에 있다.
  //
  // ⚠ **여기서 patch 에 넣는 게 맞다.** `applyWeekEndBatch` 가
  //   `{ ...protagonist, ...patch }` 를 먼저 만들고 그 위에 `moraleDelta`
  //   (TOP10 보상)를 더한다 — 회귀가 기준값이 되고 보상이 얹힌다.
  //   순서가 반대면 회귀가 보상을 덮어 TOP10 이 아무 일도 안 하게 된다.
  {
    const cur = g.protagonist.morale ?? MORALE_PIVOT;
    const next = moraleAfterWeek(cur);
    if (Math.abs(next - cur) > 1e-9) growth.protagonistPatch.morale = next;
  }

  growth.protagonistPatch.consecutiveLowMoraleWeeks = newLowMoraleWeeks;
  growth.protagonistPatch.consecutiveHighFatigueWeeks = injuryCalc.newConsecutiveHighFatigueWeeks;
  growth.protagonistPatch.injury = injuryState;

  if (injuryJustHealed && g.protagonist.injury && !g.protagonist.injury.permanentPenaltyApplied) {
    const prevInj = g.protagonist.injury;
    const penalty = getPermanentPenalty(prevInj);
    const penaltyEntries = Object.entries(penalty) as [string, number][];
    if (penaltyEntries.length > 0) {
      const pitching: PitchingAttributes = {
        ...(growth.protagonistPatch.pitching ?? g.protagonist.pitching),
      };
      for (const [stat, delta] of penaltyEntries) {
        if (stat in pitching) {
          (pitching as unknown as Record<string, number>)[stat] = Math.max(
            1,
            ((pitching as unknown as Record<string, number>)[stat] ?? 0) + delta,
          );
        }
      }
      pitching.ovr = Math.round(
        (pitching.velocity * 2.5 +
          pitching.command * 2.5 +
          pitching.control * 2.0 +
          pitching.movement * 1.5 +
          pitching.stamina * 1.5 +
          pitching.mentality * 1.0 +
          pitching.recovery * 0.5 +
          pitching.clutch * 0.3 +
          pitching.holdRunners * 0.2) /
          12.0,
      );
      growth.protagonistPatch.pitching = pitching;
      growth.logs.push(
        `[부상 후유증] ${INJURY_LABEL[prevInj.type]} 영구 손실 — ${penaltyEntries.map(([k, v]) => `${k} ${v}`).join(", ")}`,
      );
    }
    const histEntry: InjuryHistoryEntry = {
      type: prevInj.type,
      severity: prevInj.severity,
      year: s.seasonYear,
      week: weekNum,
      treatmentChoice: prevInj.treatmentChoice ?? "rest",
      ...(penaltyEntries.length > 0
        ? { permanentLoss: penalty as InjuryHistoryEntry["permanentLoss"] }
        : {}),
    };
    growth.protagonistPatch.injuryHistory = [...(g.protagonist.injuryHistory ?? []), histEntry];
  }

  const shPrev = g.protagonist.seasonHealth ?? {
    lowConditionWeeks: 0,
    highFatigueWeeks: 0,
    injuryCount: 0,
    totalWeeks: 0,
  };
  growth.protagonistPatch.seasonHealth = {
    lowConditionWeeks: shPrev.lowConditionWeeks + (g.protagonist.condition < 60 ? 1 : 0),
    highFatigueWeeks: shPrev.highFatigueWeeks + (g.protagonist.fatigue > 70 ? 1 : 0),
    injuryCount: shPrev.injuryCount + (injuryJustOccurred ? 1 : 0),
    totalWeeks: shPrev.totalWeeks + 1,
  };

  logs.push(...growth.logs);

  // 훈련 결과 후 주인공 상태 로컬 계산 (store 읽기 없이 이벤트·TOP10 입력 준비)
  const ovrBefore = g.protagonist.pitching.ovr;
  const ovrAfter = growth.protagonistPatch.pitching?.ovr ?? ovrBefore;
  const trainingScoutDelta =
    ovrAfter > ovrBefore ? Math.min(3, Math.max(1, ovrAfter - ovrBefore)) : 0;
  const afterP: ProtagonistSave = {
    ...g.protagonist,
    money: Math.max(0, g.protagonist.money + weeklyNet),
    ...growth.protagonistPatch,
  };
  const coachName = getPitchCoachName(afterP.teamId, m.entities);
  const trainingMsg = makeTrainingMessage(s.seasonYear, weekNum, growth.logs, afterP, coachName, {
    copy: m.reportCopy,
    picker: reportPicker,
    // 🔴 **엔진이 판정 재료를 준다.** 계수 셋이 Rust 안이라 여기서 다시
    //   곱하면 결정 ④ 가 지운 사본이 되살아난다(`growth_engine.rs::xp_ratio_of`)
    xpRatio: growth.xpRatio,
    primaryProgramId: g.trainingPlan.primaryProgramId,
  });

  return {
    growth,
    afterP,
    trainingMsg,
    trainingScoutDelta,
    ovrDeltaThisWeek,
    weeklyNet,
    reportPicker,
    eventRands,
    teb,
    irm,
  };
}
