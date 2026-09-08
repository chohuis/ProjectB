import { get } from "svelte/store";
import { toEngineArsenal, developingDifficultyOf } from "../utils/arsenal";
import { applyDecision, applySideEffects } from "./decisions";
import { gameStore } from "../stores/game";
import { seasonStore, nextPendingAction, seasonEnded } from "../stores/season";
import { masterStore } from "../stores/master";
import { applyMilitaryEventChoice } from "./militaryLife";
import { buildMilitaryResultMessage } from "../utils/militaryResultMessage";
import { applyRoleChoice, roleChoicePolicyPick } from "./pitcherRole";
import type { RoleChoiceMetadata } from "../types/main";
import type { ProtagonistSave } from "../types/save";
import { autoAdvanceStore, autoLog, setAutoLogFile } from "../stores/autoAdvance";
import { advanceWeek } from "./advanceWeek";
import { isRetired } from "./retirement";
import { applyGameOutcome } from "./applyGameOutcome";
import type { UnifiedGameOutcome, PlayerGameLine, PendingAction } from "../types/season";
import { buildBatterLineup, buildStarterStats, buildFielders, rotIdxOf } from "../utils/matchLineupBuilder";
import { leagueMatchOptions } from "../utils/matchLeagueOptions";
import { protagonistMatchSeed } from "../utils/protagonistMatchSeed";

// ── 정지 조건 ──────────────────────────────────────────────────
// ⚠ `draftNotification`이 여기 없으면 **프로 계약이 조용히 버려진다.**
// switch의 `default:`가 resolve만 하고 넘어가서, 지명을 받고도 계약이 안 된 채
// 고교에 남는다. 커리어가 갈리는 지점은 자동 진행이 대신 결정하면 안 된다.
const STOP_PENDING = new Set<PendingAction["type"]>([
  "careerChoiceHub", "careerResults", "careerChoice", "draftObserve", "draftNotification",
  // 은퇴는 커리어가 끝나는 결정이다 — 자동 진행이 대신 넘기면 안 된다
  "retirementAsk",
  // ⚠ 계약도 마찬가지다. 예전엔 이 셋을 "dev 도구"라며 `resolvePendingAction`으로
  // **그냥 버렸다** — 자동 진행으로 W43을 지나면 재계약 제안이 사라지고,
  // 계약이 `remainingYears: 0`인 채 다음 시즌으로 넘어간다. 25시즌 헤드리스에서
  // 2031년에 만료된 계약이 2038년까지 그대로 있었다(재계약도 은퇴도 없음).
  // 지명 통보는 멈추는데 재계약은 안 멈출 이유가 없다.
  "salaryNegotiation", "optionClause", "faMarket",
  // ⚠ **트레이드도 같은 계열이었다.** 아래 "단순 resolve"에 들어 있어서
  // 자동 진행 중 트레이드되면 **통보만 사라지고 팀은 그대로**였다.
  // 주석은 "결과가 상태에 남지 않는 알림성"이라 했는데 트레이드는
  // 소속이 바뀐다 — 분류가 틀렸다. 노트레이드 조항이 있으면 거부도
  // 가능하므로 사용자 결정이 필요하다.
  "trade",
]);
const STOP_WEEKS = [40, 51] as const;

// ── 마지막 예외 스택 ─────────────────────────────────────────────
//
// 아래 루프는 예외를 잡아 `stopReason`에 **메시지만** 남긴다. 스택은 autoLog로
// 나가는데 그건 파일 로그가 켜져 있을 때만이라, 헤드리스에서는 통째로 사라졌다.
// 실측: 프로 2년차 한 시즌 내내 매주 터졌는데 25시즌 런이 정상으로 보였다.
let _lastErrorStack: string | null = null;
/** 자동 진행 중 마지막으로 삼킨 예외의 스택 — 진단용 */
export function lastAutoAdvanceError(): string | null { return _lastErrorStack; }

// ── 이벤트/메시지 선택지 피로도 기반 키워드 ───────────────────
const REST_KW   = ["휴식", "거절", "패스", "쉬", "무시"];
const ACTIVE_KW = ["훈련", "수락", "참가", "도전", "시작"];

function pickChoice<T extends { id: string; label: string }>(choices: T[], fatigue: number): string {
  if (!choices.length) return "ok";
  if (choices.length === 1) return choices[0].id;
  if (fatigue >= 70) {
    const r = choices.find((c) => REST_KW.some((k) => c.label.includes(k)));
    if (r) return r.id;
  } else if (fatigue <= 30) {
    const a = choices.find((c) => ACTIVE_KW.some((k) => c.label.includes(k)));
    if (a) return a.id;
  }
  return choices[0].id;
}

// ── 게임 자동 처리 ─────────────────────────────────────────────
async function handleGame(scheduleId: string): Promise<void> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const entry = s.schedule.find((e) => e.id === scheduleId);

  if (!entry) {
    seasonStore.resolvePendingAction("game", scheduleId);
    return;
  }

  const p = g.protagonist;
  const isHome = entry.homeTeamId === p.teamId;

  const ents = get(masterStore).entities;

  const oppTeamId  = isHome ? entry.awayTeamId : entry.homeTeamId;
  const oppLineup  = buildBatterLineup(oppTeamId, ents);
  const myLineup   = buildBatterLineup(p.teamId, ents);
  // ⚠ **컨디션·로테이션 슬롯·리그를 넘긴다.** 안 넘기면 슬롯이 0으로 고정돼
  //   상대가 늘 1번 투수다 — 리그가 아는 선발과 다른 투수를 상대하게 된다
  const lid   = p.leagueId;
  const conds = s.leagueState[lid]?.playerConditions;
  const oppPitcher = buildStarterStats(oppTeamId, ents, conds, rotIdxOf(s.leagueState, lid, oppTeamId), lid, s.npcInjuries);
  const myNpc      = (p.position as string) !== "SP"
    ? buildStarterStats(p.teamId, ents, conds, rotIdxOf(s.leagueState, lid, p.teamId), lid, s.npcInjuries)
    : undefined;

  try {
    // 🔴 **계측 모드에서만 씨앗을 넘긴다** (사용자 확정 2026-09-07). 실제
    //   플레이는 `undefined` → Rust 가 예전 그대로 `thread_rng` 다.
    //   이게 없어서 같은 씨앗·프리셋으로 돌린 드래프트가 매번 달랐다
    //   (`protagonistMatchSeed.ts` 머리말 · `BALANCE_BASELINE_101 §2`)
    const matchSeed = protagonistMatchSeed(
      s.worldSeed, s.seasonYear, entry.week, entry.id);
    const raw = await window.projectB!.matchSimulateToEntry({
      ...(matchSeed === undefined ? {} : { seed: matchSeed }),
      // ⚠ 리그를 안 넘기면 투구수 상한이 리그 기본(120)으로 떨어진다 —
      //   고교 105구가 주인공 경기에만 안 걸렸다 (MainPage 와 같은 결함 · 2026-09-03)
      leagueId: lid,
      // 1.1 A② §6-1 — 리그가 정하는 투구수 상한·선발 아웃 계수·마무리 문·의무 휴식 (규칙 파일)
      ...leagueMatchOptions(lid, conds?.[p.id], entry.gameDate, p.roleFit, p.startGuaranteeGames),
      pitcher: {
        // ⚠ **여덟 개를 다 넘긴다.** 예전엔 command·velocity·staminaCap·
        // mentalResil 넷뿐이라 **control(가중 2.0)·movement(1.5)·clutch·
        // holdRunners가 통째로 빠졌다** — OVR의 33%다. 전부 `Option<f64>`라
        // 오류 없이 조용히 기본값으로 떨어졌고, 실측(2026-08-10)에서 주인공
        // ERA가 자기 OVR 구간 중앙값의 2배였다(7.45 vs 3.35).
        // NPC 투수(`buildStarterStats`)는 처음부터 여덟 개를 다 넘겼다.
        name:       p.name,
        command:    p.pitching.command,
        velocity:   p.pitching.velocity,
        staminaCap: p.pitching.stamina,
        mentalResil: p.pitching.mentality,
        control:     p.pitching.control,
        movement:    p.pitching.movement,
        clutch:      p.pitching.clutch,
        holdRunners: p.pitching.holdRunners,
        // ⚠ 이걸 안 넘기면 주인공이 배운 구종이 자동 경기에 안 나온다
        arsenal:    toEngineArsenal(p.pitches),
        // ⚠ 폼 무너짐 — 안 넘기면 화면엔 "폼 교정 중"인데 경기는 멀쩡해진다
        developingDifficulty: developingDifficultyOf(p.trainingPitchState, get(masterStore).pitchCatalog),
      },
      role: (p.position as "SP" | "RP" | "CP") ?? "SP",
      protagonistSide: isHome ? "home" : "away",
      // ⚠ **수비를 넘긴다.** 안 넘기면 엔진이 평균 50짜리 수비를 만든다
      // (`match_engine.rs`의 `create_default_fielders(rng, 50.0)`). 리그 실제
      // 수비는 66 수준이라 주인공만 16점 약한 뒤를 두고 던졌다 — 120경기
      // 실측(2026-08-10)에서 ERA 10.29 → 7.22였다.
      //
      // **자기 팀이다.** 주인공이 던지는 동안 뒤에 서는 건 소속팀 야수다.
      fielders: buildFielders(p.teamId, ents),
      ...(oppLineup.length >= 9 ? { opponentLineup: oppLineup } : { batterMean: 55 }),
      ...(myLineup.length >= 9  ? { myTeamLineup: myLineup }    : {}),
      ...(oppPitcher             ? { opponentPitcher: oppPitcher } : {}),
      ...(myNpc                  ? { npcStarterPitcher: myNpc }    : {}),
    });

    const sim = JSON.parse(raw) as {
      error?: string;
      entryReached?: boolean;
      homeScore?: number;
      awayScore?: number;
      playerLines?: PlayerGameLine[];
    };

    if (sim.error) throw new Error(sim.error);

    if (sim.entryReached) {
      const autoRaw = await window.projectB!.matchAutoFinishFromEntry();
      const auto = JSON.parse(autoRaw) as {
        homeScore: number; awayScore: number; summary: string;
        strikeouts?: number; hitsAllowed?: number; walksAllowed?: number;
        outsRecorded?: number; pitchCount?: number; earnedRuns?: number;
        playerLines?: PlayerGameLine[];
        error?: string;
      };
      if (auto.error) throw new Error(auto.error);

      const outcome: UnifiedGameOutcome = {
        source: "auto",
        scheduleId: entry.id, week: entry.week,
        homeTeamId: entry.homeTeamId, awayTeamId: entry.awayTeamId,
        protagonistTeamId: p.teamId,
        homeScore: auto.homeScore, awayScore: auto.awayScore,
        strikeouts:   auto.strikeouts   ?? 0,
        hitsAllowed:  auto.hitsAllowed  ?? 0,
        walksAllowed: auto.walksAllowed ?? 0,
        outsRecorded: auto.outsRecorded ?? 0,
        earnedRuns:   auto.earnedRuns,
        errors: 0, pitchCount: auto.pitchCount ?? 0,
        summary: auto.summary ?? "",
        playerLines: Array.isArray(auto.playerLines) ? auto.playerLines : undefined,
      };
      await applyGameOutcome(outcome);
    } else {
      const outcome: UnifiedGameOutcome = {
        source: "auto",
        scheduleId: entry.id, week: entry.week,
        homeTeamId: entry.homeTeamId, awayTeamId: entry.awayTeamId,
        protagonistTeamId: p.teamId,
        homeScore: sim.homeScore ?? 0, awayScore: sim.awayScore ?? 0,
        strikeouts: 0, hitsAllowed: 0, walksAllowed: 0,
        outsRecorded: 0, errors: 0, pitchCount: 0,
        playerLines: Array.isArray(sim.playerLines) ? sim.playerLines : undefined,
        summary: "등판하지 못했습니다",
      };
      await applyGameOutcome(outcome);
    }
  } catch {
    // 오류 시 몰수패 처리
    const outcome: UnifiedGameOutcome = {
      source: "auto",
      scheduleId: entry.id, week: entry.week,
      homeTeamId: entry.homeTeamId, awayTeamId: entry.awayTeamId,
      protagonistTeamId: p.teamId,
      homeScore: isHome ? 0 : 3, awayScore: isHome ? 3 : 0,
      strikeouts: 0, hitsAllowed: 3, walksAllowed: 1,
      outsRecorded: 0, errors: 0, pitchCount: 0,
      summary: "경기 처리 오류로 자동 패배 처리",
    };
    await applyGameOutcome(outcome);
  }
}

// ── 메시지 자동 처리 ───────────────────────────────────────────
async function handleMessage(messageId: string): Promise<void> {
  const g = get(gameStore);
  const msg = g.mailbox.find((m) => m.id === messageId);

  if (!msg) {
    seasonStore.resolvePendingAction("message", messageId);
    await seasonStore.save();
    return;
  }

  gameStore.markMessageRead(messageId);

  if (msg.decision && msg.decision.selectedOptionId === null) {
    // 보직 소식은 **갈래가 따로다** (PLAN_ROLE_RECOMMEND §7 헤드리스).
    //
    // 🔴 `pickChoice(options, fatigue)` 는 일반 휴리스틱이라 **피로 값에 따라
    //   보직이 정해진다.** 정책은 `globalThis.__PB_ROLE_CHOICE` 하나뿐이고
    //   기본값은 「추천대로」다(확정 10) — 계측의 기준선이 그것이다.
    if (msg.metadata?.type === "roleChoice") {
      await applyRoleChoice(messageId, roleChoicePolicyPick(msg.metadata as RoleChoiceMetadata));
      return;   // applyRoleChoice 가 pending 해제·저장까지 한다
    }
    const choiceId = pickChoice(msg.decision.options, g.protagonist.fatigue);
    await applyDecision(messageId, choiceId);
  }

  seasonStore.resolvePendingAction("message", messageId);
  await gameStore.save();
  await seasonStore.save();
}

// ── 이벤트 자동 처리 ───────────────────────────────────────────
async function handleEvent(pa: Extract<PendingAction, { type: "event" }>): Promise<void> {
  const p = get(gameStore).protagonist;
  const choices = pa.choices ?? [];
  return resolveEventPending(pa, pickChoice(choices, p.fatigue));
}

/**
 * 이벤트 pending 을 한 선택으로 푼다 — **화면(이벤트 모달)과 헤드리스가 같은 셋을 부른다.**
 *
 * 🔴 2026-09-02 실측: `type:"event"` pending 을 그리는 Svelte 가 한 곳도 없었다 — 군 이벤트가
 *   사람 플레이에선 진행을 막는다(HANDOFF_A_TO_C §0.48). 화면은 이 함수 하나만 부르면 된다.
 */
export async function resolveEventPending(pa: Extract<PendingAction, { type: "event" }>, choiceId: string): Promise<void> {
  const choices = pa.choices ?? [];
  const chosen = choices.find((c) => c.id === choiceId) ?? choices[0];

  // ⚠ **`applyEventEffect`만 부르면 관계도·사치품이 빠진다.** 그 둘은 slot.db·
  // Rust 왕복이라 store 동기 패처가 못 한다 — 메시지 경로(`handleMessage`)는
  // `applyDecision`이 이어붙여 주는데 이쪽만 안 그랬다. 필드가 늘 때 한쪽만
  // 고쳐지는 자리라 지금 이어둔다.
  if (chosen?.effects) {
    gameStore.applyEventEffect(chosen.effects);
    // ⚠ **갈래를 넘긴다** (2026-09-08 · L3). 안 넘기면 통지 pending 의 상태
    //   효과가 조용히 무시된다 — 그게 바로 「가겠다고 했는데 안 내려갔다」다
    await applySideEffects(chosen.effects, { lane: pa.lane });
    // 병영생활 몫(관계·감각·상벌·휴가·성과 보정) — militaryLife 가 있고 그 풀의 이벤트일 때만 움직인다
    applyMilitaryEventChoice(pa.eventId, chosen.effects);
  }

  // 군 이벤트는 **고른 결과가 아무 데도 안 남았다** — 모달에만 있었다.
  // 결과 소식 한 통 (사용자 확정 · 트랙 B B-5 · `militaryResultMessage.ts`)
  const resMsg = buildMilitaryResultMessage(pa.eventId, pa.title, chosen);
  if (resMsg) gameStore.addMessage(resMsg);

  seasonStore.resolvePendingAction("event", pa.eventId);
  await gameStore.save();
  await seasonStore.save();
}

// ── 훈련 추천 자동 적용 ────────────────────────────────────────
/**
 * 구종 개발 대상을 정한다 — **NPC와 같은 규칙이다** (`npc_sim.rs`의
 * `npc_pitch_target` · `decide_pitch_training`).
 *
 * 목표 구종 수에 미달하면 **아직 없는 것 중 난이도가 낮은 것**을 배우고,
 * 채웠으면 **등급이 제일 낮은 것**을 올린다. NPC는 미보유 중 무작위로
 * 고르는데, 주인공은 난이도순이라 초반에 덜 헤맨다.
 *
 * @returns 개발할 대상이 정해졌으면 true — 그때만 `TRN_PITCH_DEV`가 의미가 있다
 */
function ensurePitchTraining(p: ProtagonistSave): boolean {
  // 이미 뭔가 익히는 중이면 그대로 둔다 — 매주 바꾸면 아무것도 못 끝낸다
  if (p.trainingPitchState) return true;

  const owned = p.pitches ?? [];
  // `npc_pitch_target("SP", velocity)`와 같은 값. 구종 수 상한은 5다
  const target = p.position === "SP"
    ? (p.pitching.velocity >= 70 ? 4 : 5)
    : p.position === "CP"
      ? (p.pitching.velocity >= 70 ? 2 : p.pitching.velocity >= 60 ? 3 : 4)
      : (p.pitching.velocity >= 65 ? 3 : 4);

  if (owned.length < target && owned.length < 5) {
    const catalog = get(masterStore).pitchCatalog ?? [];
    const known = new Set(owned.map((x) => x.id));
    // 난이도 오름차순 — 쉬운 것부터 익힌다
    const next = [...catalog]
      .filter((c) => !known.has(c.id))
      .sort((a, b) => (a.formDifficulty ?? 9) - (b.formDifficulty ?? 9))[0];
    if (next) { gameStore.startPitchTraining(next.id); return true; }
  }

  // 목표를 채웠으면 등급이 제일 낮은 것을 올린다 (grade 5가 상한)
  const lowest = [...owned].filter((x) => x.grade < 5).sort((a, b) => a.grade - b.grade)[0];
  if (lowest) { gameStore.startPitchTraining(lowest.id); return true; }
  return false;
}

function applyRecommendedTraining(): void {
  // ⚠ **플레이어가 정한 계획은 안 건드린다** (사용자 확정 2026-08-09).
  //
  // 예전엔 매주 무조건 덮어썼다. 세 갈래(피로/사기/기본) 어디에도 구종 개발이
  // 없어서 **자동 진행을 쓰면 구종을 영영 못 배웠다** — 육성 시뮬인데
  // 플레이어가 고른 육성 방향이 조용히 사라졌다. 60회 조사가 이걸 잡았다.
  if (get(gameStore).trainingPlan.userSet) return;

  const p = get(gameStore).protagonist;
  let primary: string, sub1: string, sub2: string;

  if (p.fatigue >= 70) {
    primary = "TRN_RECOVERY"; sub1 = "TRN_MENTAL_P"; sub2 = "TRN_CTRL_CMD";
  } else if (p.morale < 50) {
    primary = "TRN_MENTAL_P"; sub1 = "TRN_CTRL_CMD"; sub2 = "TRN_RECOVERY";
  } else {
    // ⚠ **구종 개발을 기본에 넣는다.** 예전엔 세 갈래 어디에도 없어서
    // 계획을 직접 안 짜면 **자동 진행이 구종을 영영 안 배웠다.**
    //
    // NPC는 `decide_pitch_training`으로 2~4구종까지 키운다(실측: 2구종 47% ·
    // 3구종 46% · 4구종 5%). 주인공만 2개에 머물면 그 격차가 그대로 성적이 된다 —
    // 구종 하나 차이가 ERA 9.07 vs 4.52였다.
    //
    // **NPC와 같은 규칙을 쓴다**: 목표 미달이면 새로 배우고, 채웠으면 등급을 올린다.
    primary = "TRN_CTRL_CMD"; sub1 = "TRN_VEL";
    sub2 = ensurePitchTraining(p) ? "TRN_PITCH_DEV" : "TRN_RECOVERY";
  }

  gameStore.setTrainingPlan({
    primaryProgramId:    primary,
    secondaryProgramId:  sub1,
    secondary2ProgramId: sub2,
  }, { auto: true });
}

// ── 메인 루프 ──────────────────────────────────────────────────
export async function runAutoAdvance(): Promise<void> {
  if (get(autoAdvanceStore).running) return;

  autoAdvanceStore.start();
  autoAdvanceStore.addLog("자동 진행 시작");

  // 파일 로그 파일명 초기화
  {
    const now = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    setAutoLogFile(`auto-advance-${now.getFullYear()}${p2(now.getMonth()+1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}.log`);
  }
  const startSeason = get(seasonStore).seasonYear;
  autoLog(`=== 자동 진행 세션 시작 | ${startSeason}시즌 W${get(seasonStore).currentWeek} ===`);

  const startWeek = get(seasonStore).currentWeek;
  const MAX_ITER = 1000;
  const TICK_BUDGET_MS = 8; // 이 시간 초과 시 이벤트 루프에 제어 반환
  let iter = 0;
  let tickStart = performance.now();

  // ── 헛도는 자리를 그 자리에서 짚는다 (2026-09-08 · A) ─────────
  //
  // 🔴 왜 있나. **주가 안 넘어가면 세계가 멈춘다** — 사용자 신고 여섯 중
  //   둘이 그것이었다(소식 id 사본 · 대회 무승부로 라운드가 안 닫힘).
  //   그런데 이 루프는 그런 자리를 **조용히** 지나갔다: 같은 pending 을
  //   1000번 돌고 `stop("최대 반복 횟수 초과")` 한 줄만 남겼다. 그 문구엔
  //   **어느 pending 인지도, 몇 주차인지도 없다.**
  //
  //   ⚠ 계기가 된 「정지 2026W32」는 **여기가 아니었다** — 계측 루프가
  //     `draftObserve` 를 치울 기회를 안 준 오탐이었다(`check-measure-repro.cjs`
  //     머리말). 그걸 가리는 데 하루가 걸린 이유가 바로 이 한 줄짜리 사유다:
  //     **진짜로 막힌 것인지 설계대로 멈춘 것인지 문구가 안 갈라 줬다.**
  //     그래서 오탐이 아니라 **말해 주지 않는 것**을 고친다.
  //
  //   그래서 두 가지를 바꾼다.
  //     ① **같은 pending 이 REPEAT_LIMIT 번 돌아오면 그 자리에서 멈춘다.**
  //        1000번을 다 돌 필요가 없다 — 50번이면 이미 안 풀리는 것이다.
  //        멈추는 문구에 **pending 종류·키·주차**를 적는다.
  //     ② 사유를 `오류:` 로 시작하게 한다. 헤드리스(`perfEntry.autoRun`)가
  //        `오류:` 만 던지므로, 이걸 안 붙이면 **계측이 정상 종료로 읽는다.**
  //        화면에서도 「무엇이 막고 있는지」가 그대로 보이는 편이 낫다.
  //
  // ⚠ 상한을 **주 진행 쪽에도** 건다. pending 이 하나도 없는데 `advanceWeek`
  //   이 주를 안 넘기고 돌아오는 형태(무승부 라운드가 그랬다)는 pending
  //   히스토그램에 안 잡힌다.
  const REPEAT_LIMIT = 50;
  const seenPending = new Map<string, number>();
  let sameWeekAdvances = 0;
  let lastAdvanceWeekNo = -1;
  const pendingKeyOf = (pa: PendingAction): string => {
    const p = pa as PendingAction & { scheduleId?: string; messageId?: string; eventId?: string };
    return `${pa.type}:${p.scheduleId ?? p.messageId ?? p.eventId ?? "-"}`;
  };
  /** 멈춘 자리를 사람이 읽을 수 있게 적는다 — 여기 적힌 문구가 곧 결함 신고다 */
  const stall = (what: string): void => {
    const s = get(seasonStore);
    const top = [...seenPending.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, n]) => `${k}×${n}`).join(" · ");
    const reason = `오류: 주 진행이 막혔다 — ${s.seasonYear}W${s.currentWeek} · ${what}`
      + (top ? ` (반복 pending: ${top})` : "");
    autoAdvanceStore.addLog(reason);
    autoAdvanceStore.stop(reason);
    autoLog(`[막힘] ${reason}`);
  };

  // ── 저장 배치 (P8-2a) ───────────────────────────────────────
  // `gameStore.save()`는 NPC 5,596명 전원을 다시 쓴다. 자동 진행은 한 주에
  // advanceWeek 1회 + pending 처리 2회쯤 불러 **주간 시간의 55%**를 여기 태웠다.
  // 배치를 열면 그 호출들이 표시만 하고, 주 경계에서 한 번만 쓴다.
  //
  // ⚠ 배치를 여는 건 **여기 하나뿐이다.** 넓게 열수록 크래시 때 잃는 진행이
  // 길어지므로, 아래 루프는 `advanceWeek` 직후마다 `flushSave()`로 확정한다 —
  // 즉 잃을 수 있는 최대치는 "그 주에 처리한 pending"이지 여러 주가 아니다.
  gameStore.beginSaveBatch();
  try {

  while (get(autoAdvanceStore).running && iter < MAX_ITER) {
    iter++;
    if (performance.now() - tickStart >= TICK_BUDGET_MS) {
      await new Promise<void>((r) => setTimeout(r, 0)); // UI 응답 yield
      tickStart = performance.now();
    }
    if (!get(autoAdvanceStore).running) break;

    try {
      // 0. 은퇴 → 커리어 종료. 더 진행할 것이 없다
      if (isRetired(get(gameStore).protagonist)) {
        autoAdvanceStore.stop("은퇴 — 커리어가 끝났습니다");
        autoLog("[은퇴] 커리어 종료");
        return;
      }

      // 1. 시즌 종료 → SeasonEndModal이 처리하도록 정지
      if (get(seasonEnded)) {
        const yr = get(seasonStore).seasonYear;
        autoAdvanceStore.stop(`${yr}시즌 종료 — 결산 화면을 확인해주세요`);
        autoLog(`[시즌종료] ${yr}시즌 종료 — SeasonEndModal 대기`);
        return;
      }

      const pa = get(nextPendingAction);

      // 2. pending 없음 → 정지 주차 체크 후 주 진행
      if (!pa) {
        const w = get(seasonStore).currentWeek;
        const stopAt = STOP_WEEKS.find(sw => w >= sw && startWeek < sw);
        if (stopAt !== undefined) {
          autoAdvanceStore.stop(`W${w} 도달 — 자동 진행 종료`);
          autoAdvanceStore.addLog(`[정지] W${stopAt} 도달`);
          autoLog(`[정지] W${stopAt} 도달로 자동 진행 종료`);
          return;
        }
        applyRecommendedTraining();
        autoLog(`[주진행] W${w} 시작`);
        const r = await advanceWeek();
        const wAfter = get(seasonStore).currentWeek;
        // pending 도 없이 주가 안 넘어간 채 되돌아온 횟수 — 여기가 세계가 멈추는 자리다
        if (wAfter === w) {
          sameWeekAdvances = (lastAdvanceWeekNo === w ? sameWeekAdvances : 0) + 1;
          lastAdvanceWeekNo = w;
          if (sameWeekAdvances >= REPEAT_LIMIT) {
            stall(`advanceWeek 이 ${sameWeekAdvances}회 연속 주를 안 넘겼다 (stoppedBy=${r?.stoppedBy?.type ?? "없음"})`);
            return;
          }
        } else {
          sameWeekAdvances = 0; lastAdvanceWeekNo = -1;
          // ⚠ **주가 넘어갔으면 pending 셈도 비운다.** 안 비우면 한 판이
          //   W1→W40 을 도는 실플에서 매주 뜨는 같은 이벤트가 40번 쌓여
          //   없는 결함을 가리킬 수 있다. 세고 싶은 것은 「한 주 안에서 같은
          //   pending 이 안 풀린다」이지 「한 판에 여러 번 떴다」가 아니다
          seenPending.clear();
        }
        // 주 경계 확정 — **주가 실제로 넘어갔을 때만** 쓴다.
        // `advanceWeek`은 pending(경기·메시지)을 밀어넣고 주를 안 넘긴 채
        // 돌아오는 경우가 있어, 무조건 쓰면 한 주에 두 번 쓰게 된다.
        // 안 쓴 구간은 다음 주 경계나 `endSaveBatch`에서 함께 확정된다.
        if (wAfter !== w) await gameStore.flushSave();
        autoAdvanceStore.addLog(`W${w} → W${wAfter}`);
        autoLog(`[주진행] W${w} → W${wAfter} 완료`);
        continue;
      }

      // 3. 진로 pending 정지 조건
      if (STOP_PENDING.has(pa.type)) {
        const label =
          pa.type === "careerChoiceHub" ? "대학/드래프트 지원 선택" :
          pa.type === "careerResults"   ? "드래프트 결과 확인" :
          pa.type === "retirementAsk"   ? "은퇴 여부 결정" :
          pa.type === "draftNotification" ? "지명 계약 수락 여부" :
          pa.type === "salaryNegotiation" ? "연봉 협상" :
          pa.type === "optionClause"    ? "옵션 조항 확인" :
          pa.type === "faMarket"        ? "FA 시장" :
                                          "진로 최종 선택";
        autoAdvanceStore.stop(`정지: ${label}`);
        autoAdvanceStore.addLog(`[정지] ${label}`);
        autoLog(`[정지] ${label} (type=${pa.type})`);
        return;
      }

      // 4. pending 처리
      {
        const key = pendingKeyOf(pa);
        const n = (seenPending.get(key) ?? 0) + 1;
        seenPending.set(key, n);
        if (n >= REPEAT_LIMIT) {
          stall(`같은 pending 이 ${n}회 돌아왔다 — ${key} 가 안 풀린다`);
          return;
        }
      }
      autoAdvanceStore.addLog(`처리: ${pa.type}`);
      autoLog(`[pending] type=${pa.type}`);

      switch (pa.type) {
        case "game":
          await handleGame(pa.scheduleId);
          break;

        case "message":
          await handleMessage(pa.messageId);
          break;

        case "event":
          await handleEvent(pa);
          break;

        case "conditionWarning": {
          seasonStore.resolvePendingAction("conditionWarning", pa.scheduleId);
          const entry = get(seasonStore).schedule.find((e) => e.id === pa.scheduleId);
          if (entry) seasonStore.setCurrentDate(entry.gameDate);
          seasonStore.pushPendingAction({ type: "game", scheduleId: pa.scheduleId });
          break;
        }

        case "injuryTreatment":
          gameStore.applyInjuryTreatment("conservative");
          seasonStore.resolvePendingAction("injuryTreatment");
          await gameStore.save();
          await seasonStore.save();
          break;

        // 단순 resolve — 결과가 상태에 남지 않는 알림성 pending만 여기 둔다.
        // 계약 관련(salaryNegotiation·optionClause·faMarket)은 STOP_PENDING이다
        case "sportsUnitApplication":
        case "militaryEnlistAsk":
          seasonStore.resolvePendingAction(pa.type);
          await seasonStore.save();
          break;

        default:
          seasonStore.resolvePendingAction((pa as { type: PendingAction["type"] }).type);
          await seasonStore.save();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? (err.stack ?? "") : "";
      _lastErrorStack = `${get(seasonStore).seasonYear} W${get(seasonStore).currentWeek} | ${msg}\n${stack}`;
      autoAdvanceStore.addLog(`오류: ${msg}`);
      autoAdvanceStore.stop(`오류: ${msg}`);
      autoLog(`[오류] ${msg}`);
      if (stack) autoLog(`[스택] ${stack.split("\n").slice(0, 4).join(" | ")}`);
      return;
    }
  }

  if (iter >= MAX_ITER) {
    // 위 두 상한에 안 걸리고 여기까지 왔다면 **여러 pending 이 번갈아** 돈 것이다.
    // 예전엔 "최대 반복 횟수 초과" 한 줄이라 무엇이 돌았는지 알 길이 없었다
    stall(`${MAX_ITER}회 반복 상한`);
  }

  } finally {
    // 루프 안의 `return`·예외·정지 어느 쪽으로 빠져나가도 밀린 저장을 확정한다.
    // 이게 없으면 "자동 진행을 멈췄더니 마지막 처리가 사라짐"이 된다
    await gameStore.endSaveBatch();
  }
  autoLog(`=== 자동 진행 세션 종료 | iter=${iter} ===`);
}

// ── 시즌 종료 배경 처리 (자동/수동 공통) ────────────────────────────────────
// SeasonEndModal에서 호출 (시즌 종료 배경 처리)
//
// v3에서는 no-op이다: 고교/대학/독립 배경 선수의 학년 진급 + 나이 증가는
// gameStore.processSeasonEnd()가 Rust advanceAllGrades/advanceAllAges를
// gameStore.npcs 전체(Named + 배경 구분 없이)에 대해 이미 수행한다
// (v3는 배경 선수도 전부 gameStore.npcs에 있음 — v2 시절의
// "master.db 벌크 엔티티 vs 추적 NPC" 구분이 더 이상 존재하지 않는다).
// 이 함수는 과거 master_overlay.db에 별도로 쓰던 경로였으나
// 읽는 쪽(master:loadEntities)이 오버레이를 병합하지 않아 이미 죽은 코드였고
// (그 채널도 master.db와 함께 2026-09-04에 지웠다),
// 로직 자체도 processSeasonEnd와 중복이라 되살리면 이중 에이징이 된다.
export async function runSeasonEndBgProcessing(_now: number): Promise<void> {
  return;
}
