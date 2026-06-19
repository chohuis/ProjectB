import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore, nextPendingAction, seasonEnded } from "../stores/season";
import { masterStore } from "../stores/master";
import { autoAdvanceStore, autoLog, setAutoLogFile } from "../stores/autoAdvance";
import { advanceWeek } from "./advanceWeek";
import { applyGameOutcome } from "./applyGameOutcome";
import type { UnifiedGameOutcome, PlayerGameLine, PendingAction } from "../types/season";
import type { PlayerSeasonStats } from "../types/save";
import { buildBatterLineup, buildStarterStats } from "../utils/matchLineupBuilder";

// ── 정지 조건 ──────────────────────────────────────────────────
const STOP_PENDING = new Set<PendingAction["type"]>(["careerChoiceHub", "careerResults", "careerChoice"]);
const STOP_WEEKS = [40, 51] as const;

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

  if (get(masterStore).entities.length === 0) {
    await masterStore.loadEntities("");
  }
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
        outsRecorded?: number; pitchCount?: number; playerLines?: PlayerGameLine[];
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
    gameStore.resolveDecision(messageId, choiceId);
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

  if (chosen?.effects) {
    gameStore.applyEventEffect(chosen.effects);
  }

  seasonStore.resolvePendingAction("event", pa.eventId);
  await gameStore.save();
  await seasonStore.save();
}

// ── 시즌 종료 자동 처리 ────────────────────────────────────────
async function handleSeasonEnd(): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);
  const p = g.protagonist;
  const now = s.seasonYear;
  const gradeBeforeAdvance = p.grade;

  gameStore.appendCareerRecord(
    {
      year: now, leagueId: p.leagueId, teamId: p.teamId,
      statLine: "", ovr: p.pitching.ovr, awards: [],
    },
    (s.stats[p.id] as PlayerSeasonStats) ?? undefined,
  );

  await gameStore.processSeasonEnd(now);

  const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(p.careerStage);

  const leagueStats: Record<string, Record<string, PlayerSeasonStats>> = {};
  for (const [lid, ls] of Object.entries(s.leagueState)) leagueStats[lid] = ls.stats as Record<string, PlayerSeasonStats>;
  gameStore.applySeasonHistory(s.stats, leagueStats, now);

  await seasonStore.flushAllLeagueStatsToDb(now);
  await gameStore.processAllLeaguesSeasonEnd(now);

  // 연간 병역 현황 메시지
  type OffseasonSummary = { militaryEnlistedSports?: string[]; militaryEnlistedGeneral?: string[]; militaryDischargedNames?: string[] };
  const offseasonSummary = (window as Window & { __lastOffseasonSummary?: OffseasonSummary | null }).__lastOffseasonSummary ?? null;
  if (offseasonSummary) {
    const sports     = offseasonSummary.militaryEnlistedSports ?? [];
    const general    = offseasonSummary.militaryEnlistedGeneral ?? [];
    const discharged = offseasonSummary.militaryDischargedNames ?? [];
    if (sports.length + general.length + discharged.length > 0) {
      const lines: string[] = [];
      if (sports.length)     lines.push(`◆ 체육부대 입대 (${sports.length}명)\n  ${sports.slice(0, 5).join(", ")}${sports.length > 5 ? ` 외 ${sports.length - 5}명` : ""}`);
      if (general.length)    lines.push(`◆ 일반부대 입대 (${general.length}명)\n  ${general.slice(0, 3).join(", ")}${general.length > 3 ? ` 외 ${general.length - 3}명` : ""}`);
      if (discharged.length) lines.push(`◆ 전역 (${discharged.length}명)\n  ${discharged.slice(0, 3).join(", ")}${discharged.length > 3 ? ` 외 ${discharged.length - 3}명` : ""}`);
      gameStore.addMessage({
        id: `msg-military-annual-${now}`,
        category: "news", sender: "병무청",
        subject: `${now} 시즌 병역 현황`,
        preview: `입대 ${sports.length + general.length}명, 전역 ${discharged.length}명`,
        body: lines.join("\n\n"),
        createdAt: `Y${now}`, readAt: null,
      });
    }
    (window as Window & { __lastOffseasonSummary?: unknown }).__lastOffseasonSummary = null;
  }

  await gameStore.applyAgingDecay();

  // ── Phase 1: 배경 엔티티 age / proServiceYears 연간 갱신 ─────────────────
  {
    const gAge = get(gameStore);
    const mAge = get(masterStore);
    const slotIdAge = gAge.currentSlotId;
    const namedIdsAge = new Set(gAge.npcs.map(n => n.npcId));
    const proLeagueSetAge = new Set(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);

    const toAge = mAge.entities.filter(e =>
      e.role === "player" &&
      e.leagueId && proLeagueSetAge.has(e.leagueId) &&
      !namedIdsAge.has(e.id)
    );

    if (toAge.length > 0 && slotIdAge) {
      const aged = toAge.map(e => {
        const isPro = !!(e.teamId && e.teamId !== "");
        const curPSY = (e.details?.player?.proServiceYears ?? 0);
        return {
          ...e,
          age: e.age + 1,
          details: {
            ...e.details,
            player: {
              ...e.details?.player,
              proServiceYears: isPro ? curPSY + 1 : curPSY,
            },
          },
        };
      });
      const ageRes = JSON.parse(
        await window.projectB!.masterBulkUpsertEntities(
          JSON.stringify({ slotId: slotIdAge, entities: aged })
        )
      ) as { ok: boolean; count?: number; error?: string };
      if (ageRes.error) autoLog(`[엔티티에이징오류] ${ageRes.error}`);
      else autoLog(`[엔티티에이징] ${ageRes.count ?? aged.length}명 overlay 저장`);
      await masterStore.reloadEntities(now, slotIdAge);
    }
  }

  // ── Phase 6: 배경 엔티티 드래프트 기록 ─────────────────────────────────────
  {
    const gDraft = get(gameStore);
    const mDraft = get(masterStore);
    const slotIdDraft = gDraft.currentSlotId;
    if (slotIdDraft) {
      const namedIdsDraft = new Set(gDraft.npcs.map(n => n.npcId));
      const proLeaguesDraft = new Set(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);
      const bgDraftEntries = mDraft.entities.filter(e =>
        e.role === "player" &&
        e.leagueId && proLeaguesDraft.has(e.leagueId) &&
        !namedIdsDraft.has(e.id) &&
        e.entryYear === now &&
        e.teamId && e.teamId !== ""
      );
      autoLog(`[배경드래프트] entryYear=${now} 검색 → ${bgDraftEntries.length}명 (전체 엔티티 ${mDraft.entities.length}명)`);
      if (bgDraftEntries.length > 0) {
        const draftRows = bgDraftEntries.map(e => ({
          seasonYear: now, category: "draft",
          playerId: e.id, playerName: e.name ?? e.id,
          toTeamId: e.teamId, toLeagueId: e.leagueId,
          detail: "드래프트 입단",
        }));
        const draftRes = JSON.parse(
          await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId: slotIdDraft, rows: draftRows }))
        ) as { ok: boolean; error?: string };
        if (draftRes.error) autoLog(`[배경드래프트오류] ${draftRes.error}`);
        else autoLog(`[배경드래프트] ${bgDraftEntries.length}명 기록`);
      }
    }
  }

  const gNow = get(gameStore);
  autoLog(`[드래프트] pendingDraft=${gNow.pendingDraft.length}명`);
  if (gNow.pendingDraft.length > 0) {
    const univIds = m.teams.filter((t) => t.leagueId === "LEAGUE_UNIVERSITY" && t.id !== "TEAM_SPORTS_UNIT").map((t) => t.id);
    const indIds  = m.teams.filter((t) => t.leagueId === "LEAGUE_INDEPENDENT").map((t) => t.id);
    await gameStore.processNpcDraft(now, univIds, indIds);
  }

  if (isProStage) {
    const pending = gNow.protagonist.pendingNextContract;
    gameStore.advanceSeasonYear(get(seasonStore).seasonYear);

    if (pending) {
      gameStore.applyPendingNextContract();
      const proTeamIds = m.teams.filter((t) => t.leagueId === pending.leagueId).map((t) => t.id);
      const nextYear   = (s.seasonYear || 2026) + 1;
      const { generateKblSchedule, generateAblSchedule, generateJblSchedule } = await import("../utils/scheduleGen");
      const { shuffleAblConferences } = await import("../utils/postseasonEngine");
      const isAbl = pending.leagueId === "LEAGUE_ABL";
      const isJbl = pending.leagueId === "LEAGUE_JBL";
      seasonStore.initSeason(pending.leagueId, nextYear, 52, proTeamIds);
      seasonStore.setSchedule(
        isAbl ? await generateAblSchedule(proTeamIds, pending.teamId) :
        isJbl ? await generateJblSchedule(proTeamIds, pending.teamId) :
                await generateKblSchedule(proTeamIds, pending.teamId),
      );
      if (isAbl) {
        const { east, west } = await shuffleAblConferences(proTeamIds);
        seasonStore.setAblConferences(east, west);
      }
    } else {
      seasonStore.startNewSeason();
    }
  } else {
    // 고교: schoolId 있으면 seasonYear 진행 안 함 (SeasonEndModal과 동일 로직)
    const isHsWithSchool = p.careerStage === "highschool" && !!p.schoolId;
    if (!isHsWithSchool) {
      gameStore.advanceSeasonYear(get(seasonStore).seasonYear);
    }
    seasonStore.startNewSeason();

    if (p.careerStage === "highschool" && gradeBeforeAdvance != null && gradeBeforeAdvance < 3) {
      const allHsIds = m.teams.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL").map((t) => t.id);
      await seasonStore.reinitHighschoolSeason(p.teamId, allHsIds);
    }
  }

  await gameStore.save();
  await seasonStore.save();
}

// ── 훈련 추천 자동 적용 ────────────────────────────────────────
function applyRecommendedTraining(): void {
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
  });
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
  let iter = 0;

  while (get(autoAdvanceStore).running && iter < MAX_ITER) {
    iter++;
    await new Promise<void>((r) => setTimeout(r, 0)); // UI 응답 yield
    if (!get(autoAdvanceStore).running) break;

    try {
      // 1. 시즌 종료 처리
      if (get(seasonEnded)) {
        const yr = get(seasonStore).seasonYear;
        autoAdvanceStore.addLog(`${yr} 시즌 종료 처리`);
        autoLog(`[시즌종료] ${yr}시즌 종료 처리 시작`);
        await handleSeasonEnd();
        autoAdvanceStore.addLog("새 시즌 시작");
        autoLog(`[시즌종료] ${yr}시즌 처리 완료 → ${get(seasonStore).seasonYear}시즌 시작`);
        continue;
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
        autoAdvanceStore.addLog(`W${w} → W${wAfter}`);
        autoLog(`[주진행] W${w} → W${wAfter} 완료`);
        continue;
      }

      // 3. 진로 pending 정지 조건
      if (STOP_PENDING.has(pa.type)) {
        const label =
          pa.type === "careerChoiceHub" ? "대학/드래프트 지원 선택" :
          pa.type === "careerResults"   ? "드래프트 결과 확인" :
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

        case "preGameBriefing":
          seasonStore.resolvePendingAction("preGameBriefing", pa.scheduleId);
          await seasonStore.save();
          break;

        case "hsGroupDraw":
          seasonStore.resolvePendingAction("hsGroupDraw");
          await seasonStore.save();
          break;

        case "injuryTreatment":
          gameStore.applyInjuryTreatment("conservative");
          seasonStore.resolvePendingAction("injuryTreatment");
          await gameStore.save();
          await seasonStore.save();
          break;

        // dev 도구: 복잡한 비즈니스 로직 없이 단순 resolve
        case "salaryNegotiation":
        case "optionClause":
        case "trade":
        case "faMarket":
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
  autoLog(`=== 자동 진행 세션 종료 | iter=${iter} ===`);
}
