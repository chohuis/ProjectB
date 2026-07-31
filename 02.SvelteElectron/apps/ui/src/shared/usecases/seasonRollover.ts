// ── 시즌 롤오버 (오프시즌) ────────────────────────────────────
//
// 이 로직은 원래 `features/season-end/ui/SeasonEndModal.svelte` **안에** 있었다.
// 그래서 헤드리스로 부를 수가 없었고, Phase 8 계측이 오프시즌만 통째로
// 비워둔 채 진행됐다 (PHASE8_PLAN §P8-0 "못 재는 것").
//
// 여기로 옮긴 이유는 두 가지다:
//  1. 잴 수 있게 — `measure:perf`가 시즌 경계를 넘을 수 있다
//  2. 시험할 수 있게 — 컴포넌트를 띄우지 않고 회귀를 걸 수 있다
//
// 모달에는 **표시와 사용자 선택만** 남는다. 세계를 바꾸는 건 전부 여기다.

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { runSeasonEndBgProcessing } from "./runAutoAdvance";
import { draftDestinationTeams } from "../utils/draftSystem";
import type { PitcherSeasonStats, BatterSeasonStats } from "../types/save";

/** 시즌 기록을 history_* 테이블에 남긴다 (순위·개인기록·포스트시즌) */
export async function saveSeasonHistory(seasonYear: number) {
  const slotId = get(gameStore).currentSlotId;
  if (!slotId) return;

  const standingRows: object[] = [];
  for (const st of get(seasonStore).standings) {
    const groupLabel = "";
    standingRows.push({ leagueId: get(seasonStore).leagueId, teamId: st.teamId, groupLabel,
      wins: st.wins, losses: st.losses, draws: st.draws, winPct: st.winPct,
      runsFor: st.runsFor, runsAgainst: st.runsAgainst, streak: st.streak, last10: st.last10 });
  }
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) {
    // 주인공 리그는 첫 번째 루프에서 group_label 포함해 저장했으므로 건너뜀
    // (leagueState에도 동일 리그가 있어 INSERT OR REPLACE로 덮어쓰면 group_label이 '' 로 초기화됨)
    if (lid === get(seasonStore).leagueId) continue;
    for (const st of (ls.standings ?? [])) {
      standingRows.push({ leagueId: lid, teamId: st.teamId, groupLabel: "",
        wins: st.wins, losses: st.losses, draws: st.draws, winPct: st.winPct,
        runsFor: st.runsFor, runsAgainst: st.runsAgainst, streak: st.streak, last10: st.last10 });
    }
  }
  if (standingRows.length > 0) {
    window.projectB!.seasonSaveHistoryStandings(JSON.stringify({ slotId, seasonYear, rows: standingRows })).catch(() => {});
  }
  const lbStatRows: object[] = [];
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) {
    for (const [playerId, stat] of Object.entries(ls.stats ?? {})) {
      if ((stat as { type?: string }).type === "pitcher") {
        const p2 = stat as PitcherSeasonStats;
        lbStatRows.push({ leagueId: lid, playerId, statType: "pitcher",
          g: p2.g, gs: p2.gs, w: p2.w, l: p2.l, sv: p2.sv ?? 0, hd: p2.hd ?? 0,
          ip: p2.ip, er: p2.er, hP: p2.h, kP: p2.k, bbP: p2.bb, era: p2.era, whip: p2.whip });
      } else {
        const b2 = stat as BatterSeasonStats;
        lbStatRows.push({ leagueId: lid, playerId, statType: "batter",
          g: b2.g, pa: b2.pa, ab: b2.ab, hB: b2.h, hr: b2.hr, rbi: b2.rbi,
          sb: b2.sb ?? 0, bbB: b2.bb, kB: b2.k, avgV: b2.avg, obp: b2.obp, slg: b2.slg, ops: b2.ops });
      }
    }
  }
  if (lbStatRows.length > 0) {
    window.projectB!.seasonSaveHistoryLbStats(JSON.stringify({ slotId, seasonYear, rows: lbStatRows })).catch(() => {});
  }

  // 포스트시즌 결과 저장
  const psRows: object[] = [];
  const psEntries = get(seasonStore).schedule.filter((e) => e.phase === "postseason");
  const finalEntry = psEntries.find((e) => e.id.startsWith("PS_FINAL_"));
  if (finalEntry?.result) {
    const playoffTeams = Array.from(new Set(
      psEntries
        .filter((e) => e.id.startsWith("PS_SEMI"))
        .flatMap((e) => [e.homeTeamId, e.awayTeamId])
    ));
    psRows.push({
      leagueId: get(seasonStore).leagueId,
      championId: finalEntry.result.winnerId,
      runnerUpId: finalEntry.result.loserId ?? "",
      playoffTeams,
    });
  } else if (get(seasonStore).standings.length > 0) {
    const sorted = [...get(seasonStore).standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    psRows.push({ leagueId: get(seasonStore).leagueId, championId: sorted[0].teamId, runnerUpId: "", playoffTeams: [] });
  }
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) {
    if (lid === get(seasonStore).leagueId) continue;
    const sorted = [...(ls.standings ?? [])].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    if (sorted.length > 0) psRows.push({ leagueId: lid, championId: sorted[0].teamId, runnerUpId: "", playoffTeams: [] });
  }
  if (psRows.length > 0) {
    window.projectB!.seasonSaveHistoryPostseason(JSON.stringify({ slotId, seasonYear, rows: psRows })).catch(() => {});
  }
}

export interface SeasonRolloverInput {
  /** 종료되는 시즌 연도 */
  seasonYear: number;
  /**
   * `processSeasonEnd` **전**의 학년. 그 안에서 주인공 학년이 이미 올라가므로
   * 호출 뒤에 읽으면 늦다 — 고교 재초기화 여부 판단이 어긋난다.
   */
  gradeBeforeAdvance: number | null | undefined;
}

/**
 * 시즌 롤오버 — 학년 진급·드래프트·오프시즌·에이징·새 시즌 초기화.
 *
 * ⚠ **주인공 시즌 기록(`appendCareerRecord`)은 호출 전에 끝나 있어야 한다.**
 * 그건 순위·수상처럼 화면이 이미 계산해둔 값에서 나오고, 여기서 다시
 * 계산하면 정본이 둘이 된다.
 */
export async function runSeasonRollover(input: SeasonRolloverInput): Promise<void> {
  const now = input.seasonYear;
  const gradeBeforeAdvance = input.gradeBeforeAdvance;

  // ⚠ 컴포넌트에서 `p`는 `$: p = $gameStore.protagonist`라 **반응형**이었다.
  // 여기서 스냅샷으로 잡으면 `processSeasonEnd` 이후의 변화(학년 진급·졸업으로
  // 바뀐 careerStage, 서명된 계약)를 못 보고 옛 값으로 분기한다.
  const P = () => get(gameStore).protagonist;

  // 고교 NPC 학년 승급 + 졸업 처리는 매 시즌 종료마다 실행 (careerStage 무관)
  // processSeasonEnd 내부에서 protagonist.careerStage === "highschool"일 때만 주인공 학년도 올림
  await gameStore.processSeasonEnd(now);

  // NPC 드래프트 — **오프시즌보다 먼저** 돌아야 한다.
  //
  // 오프시즌이 미지명자 진로를 배정하므로(방출·FA 미계약과 같은 로직),
  // 드래프트가 그 뒤에 오면 이미 대학·독립으로 흩어진 뒤가 된다.
  // W47 관전에서 이미 돌았으면 `lastDraftYear` 가드가 건너뛴다 —
  // 주인공 졸업 시즌엔 W47 관전 이벤트가 안 떠서 여기가 유일한 경로다.
  {
    const { univIds, indIds } = draftDestinationTeams(get(masterStore).teams);
    await gameStore.processNpcDraft(now, univIds, indIds);
  }

  // ── 프로(KBL/ABL/JBL): pendingNextContract 적용 후 새 시즌 초기화 ──
  const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(P().careerStage);
  if (isProStage) {
    const leagueStats2: Record<string, Record<string, import("../types/save").PlayerSeasonStats>> = {};
    for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) leagueStats2[lid] = ls.stats;
    gameStore.applySeasonHistory(get(seasonStore).stats, leagueStats2, now);
    await seasonStore.flushAllLeagueStatsToDb(now);
    await saveSeasonHistory(now);
    await gameStore.processAllLeaguesSeasonEnd(now);
    await gameStore.applyAgingDecay();
    await runSeasonEndBgProcessing(now);
    gameStore.advanceSeasonYear(get(seasonStore).seasonYear);

    // ── 2군 리그 우승팀 발표 메시지 ────────────────────────────
    const FARM_LEAGUE_NAMES: Record<string, string> = {
      LEAGUE_KBL_FARM: "KBL 2군", LEAGUE_ABL_FARM: "ABL 마이너", LEAGUE_JBL_FARM: "JBL 2군",
    };
    for (const [lid, label] of Object.entries(FARM_LEAGUE_NAMES)) {
      const ls = get(seasonStore).leagueState[lid];
      if (!ls || ls.standings.length === 0) continue;
      const sorted = [...ls.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
      if (!sorted.some((s) => s.wins + s.losses > 0)) continue;
      const champion = get(masterStore).teams.find((t) => t.id === sorted[0].teamId)?.name ?? sorted[0].teamId;
      const runnerUp = sorted[1]
        ? (get(masterStore).teams.find((t) => t.id === sorted[1].teamId)?.name ?? sorted[1].teamId)
        : "-";
      gameStore.addMessage({
        id: `msg-farm-champion-${lid}-${now}`,
        category: "news", sender: "리그 사무국",
        subject: `${now} ${label} 시즌 종료`,
        preview: `${label} 우승: ${champion}`,
        body: [
          `${now} ${label} 정규리그가 종료되었습니다.`,
          ``,
          `우승: ${champion}  (${sorted[0].wins}승 ${sorted[0].losses}패)`,
          `준우승: ${runnerUp}`,
        ].join("\n"),
        createdAt: `W${get(seasonStore).currentWeek}`, readAt: null,
      });
    }

    // 시즌 종료 후 계약 연수 감산 (W43이 아닌 시즌 끝에 처리)
    gameStore.applySeasonContractProgress();

    const pending = P().pendingNextContract;
    if (pending) {
      gameStore.applyPendingNextContract();
      const proTeamIds = get(masterStore).teams
        .filter((t) => t.leagueId === pending.leagueId)
        .map((t) => t.id);
      const seasonYear = (get(seasonStore).seasonYear || 2026) + 1;
      const { generateKblSchedule, generateAblSchedule, generateJblSchedule } = await import("../utils/scheduleGen");
      const isAbl = pending.leagueId === "LEAGUE_ABL";
      const isJbl = pending.leagueId === "LEAGUE_JBL";
      seasonStore.initSeason(pending.leagueId, seasonYear, 52, proTeamIds);
      seasonStore.setSchedule(
        isAbl ? await generateAblSchedule(proTeamIds, pending.teamId) :
        isJbl ? await generateJblSchedule(proTeamIds, pending.teamId) :
                await generateKblSchedule(proTeamIds, pending.teamId),
      );
    } else {
      // 미서명 상태 — 최소 계약 강제 (Step 3에서 정상 처리, 여기는 폴백)
      seasonStore.startNewSeason();
    }

    await gameStore.save();
    await seasonStore.save();
    return;
  }

  // ── 독립리그: 오프시즌 W39~W47에 careerChoiceHub로 이미 처리됨 ──
  // SeasonEndModal에서는 연간 정산만 진행

  if (P().careerStage === "highschool" && P().schoolId) {
    gameStore.addMessage({
      id: `msg-season-hs-sync-${Date.now()}`,
      category: "news",
      sender: "연감",
      subject: `${now} 시즌 졸업/승급 반영`,
      preview: "고교 선수 학년 승급과 졸업 대상 정리가 반영되었습니다.",
      body: ["고교 시즌 종료 동기화가 완료되었습니다.", "NPC 학년 승급과 졸업 처리가 반영되었습니다.", "졸업 대상은 드래프트/진로 처리 풀로 이관되었습니다."].join("\n"),
      createdAt: `Y${now}`,
      readAt: null,
    });
  }

  const leagueStats: Record<string, Record<string, import("../types/save").PlayerSeasonStats>> = {};
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) leagueStats[lid] = ls.stats;
  gameStore.applySeasonHistory(get(seasonStore).stats, leagueStats, now);

  await seasonStore.flushAllLeagueStatsToDb(now);
  await saveSeasonHistory(now);
  await gameStore.processAllLeaguesSeasonEnd(now);  // ← 여기서 __lastOffseasonSummary 세팅

  // ── 연간 병역 현황 메시지 (processAllLeaguesSeasonEnd 이후 읽어야 정확한 데이터)
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
  await runSeasonEndBgProcessing(now);
  gameStore.advanceSeasonYear(get(seasonStore).seasonYear);
  seasonStore.startNewSeason();

  // gradeBeforeAdvance 기준으로 판단: processSeasonEnd 후 p.grade는 이미 증가해 있으므로
  // grade 1→2 또는 2→3 진급 시에만 다음 HS 시즌 재초기화 (grade 3→졸업은 제외)
  if (P().careerStage === "highschool" && gradeBeforeAdvance != null && gradeBeforeAdvance < 3) {
    // 팀 목록을 넘기지 않는다 — 일정·순위표 모두 HS_REGIONS(102팀)에서 나오므로
    // 새 게임 initAllLeaguesV3와 자동으로 같은 소스가 된다.
    await seasonStore.reinitHighschoolSeason(P().teamId);
  }

  await gameStore.save();
  await seasonStore.save();
}
