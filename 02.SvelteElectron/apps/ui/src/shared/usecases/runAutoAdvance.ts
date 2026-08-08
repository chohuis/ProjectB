import { get } from "svelte/store";
import { toEngineArsenal, developingDifficultyOf } from "../utils/arsenal";
import { applyDecision, applySideEffects } from "./decisions";
import { gameStore } from "../stores/game";
import { seasonStore, nextPendingAction, seasonEnded } from "../stores/season";
import { masterStore } from "../stores/master";
import { autoAdvanceStore, autoLog, setAutoLogFile } from "../stores/autoAdvance";
import { advanceWeek } from "./advanceWeek";
import { isRetired } from "./retirement";
import { applyGameOutcome } from "./applyGameOutcome";
import type { UnifiedGameOutcome, PlayerGameLine, PendingAction } from "../types/season";
import { buildBatterLineup, buildStarterStats } from "../utils/matchLineupBuilder";

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
  const oppPitcher = buildStarterStats(oppTeamId, ents);
  const myNpc      = (p.position as string) !== "SP" ? buildStarterStats(p.teamId, ents) : undefined;

  try {
    const raw = await window.projectB!.matchSimulateToEntry({
      pitcher: {
        name:       p.name,
        command:    p.pitching.command,
        velocity:   p.pitching.velocity,
        staminaCap: p.pitching.stamina,
        mentalResil: p.pitching.mentality,
        // ⚠ 이걸 안 넘기면 주인공이 배운 구종이 자동 경기에 안 나온다
        arsenal:    toEngineArsenal(p.pitches),
        // ⚠ 폼 무너짐 — 안 넘기면 화면엔 "폼 교정 중"인데 경기는 멀쩡해진다
        developingDifficulty: developingDifficultyOf(p.trainingPitchState, get(masterStore).pitchCatalog),
      },
      role: (p.position as "SP" | "RP" | "CP") ?? "SP",
      protagonistSide: isHome ? "home" : "away",
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
  const choiceId = pickChoice(choices, p.fatigue);
  const chosen = choices.find((c) => c.id === choiceId);

  // ⚠ **`applyEventEffect`만 부르면 관계도·사치품이 빠진다.** 그 둘은 slot.db·
  // Rust 왕복이라 store 동기 패처가 못 한다 — 메시지 경로(`handleMessage`)는
  // `applyDecision`이 이어붙여 주는데 이쪽만 안 그랬다. 필드가 늘 때 한쪽만
  // 고쳐지는 자리라 지금 이어둔다.
  if (chosen?.effects) {
    gameStore.applyEventEffect(chosen.effects);
    await applySideEffects(chosen.effects);
  }

  seasonStore.resolvePendingAction("event", pa.eventId);
  await gameStore.save();
  await seasonStore.save();
}

// ── 훈련 추천 자동 적용 ────────────────────────────────────────
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
    primary = "TRN_CTRL_CMD"; sub1 = "TRN_VEL"; sub2 = "TRN_RECOVERY";
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
        await advanceWeek();
        const wAfter = get(seasonStore).currentWeek;
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
    autoAdvanceStore.stop("최대 반복 횟수 초과");
    autoLog("[정지] 최대 반복 횟수 초과");
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
// master:loadEntities가 오버레이를 병합하지 않아 이미 죽은 코드였고,
// 로직 자체도 processSeasonEnd와 중복이라 되살리면 이중 에이징이 된다.
export async function runSeasonEndBgProcessing(_now: number): Promise<void> {
  return;
}
