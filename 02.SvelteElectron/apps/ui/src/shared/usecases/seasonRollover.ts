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
import { autoLog } from "../stores/autoAdvance";
import { DEFAULT_TEAM_PROFILE } from "./weekPhases/market";
import { applySeasonAwards } from "./seasonAwards";
import { applyProtagonistSeasonRecord } from "./seasonCareerRecord";
import { bracketFinalists } from "../utils/bracket";
import { finalistsOf } from "../utils/tournamentView";
import { TOURNAMENTS } from "../utils/leagueTeams.generated";
import { leagueStandingsOf } from "../utils/season-helpers";
import { draftDestinationTeams } from "../utils/draftSystem";
import { proSchedule } from "./proSeason";
import { dischargeProtagonist, openMilitarySeason } from "./militaryDecision";
import type { PitcherSeasonStats, BatterSeasonStats } from "../types/save";

/**
 * 세계 오프시즌을 한 해에 한 번만 돌게 하는 가드.
 *
 * `applySeasonHistory`·`processAllLeaguesSeasonEnd`엔 각자 방어가 있지만
 * `applyAgingDecay`·`runSeasonEndBgProcessing`엔 없다.
 */
let _lastWorldSeasonEndYear = -1;

/** 세계 처리 로그를 자동 진행 로그로 흘린다 */
function logsOf(lines: string[]): void {
  for (const l of lines) autoLog(l);
}

/**
 * **세계 오프시즌** — 주인공이 무엇을 하든 매 시즌 끝에 반드시 도는 처리.
 *
 * ⚠ 예전엔 이 순서가 **세 분기에 각각** 적혀 있었고(military·프로·학생),
 * 그중 어디도 안 타는 경로가 있었다. `acceptDraftOffer`가 `openProSeason`으로
 * 다음 해를 직접 열기 때문에 **주인공이 지명된 해엔 통째로 건너뛰었다** —
 * 실측: 그 해 NPC 사건이 `fa_signed 6`뿐이고 드래프트·은퇴·이적·연도기록이
 * 전부 없었으며 주인공 나이도 안 올랐다.
 *
 * 이제 정본은 여기 하나다. 롤오버와 진로 결정 양쪽에서 부르고, 연도 가드가
 * 중복 실행을 막는다.
 */
/**
 * 시즌 기록이 아직 온전한 **마지막 지점**에서 불리는 계측 훅.
 *
 * ⚠ 계측 전용이다 — 운영 코드가 여기 붙으면 안 된다.
 *
 * 왜 필요한가: 조사 하네스는 `isSeasonEnded()`를 보고 롤오버 직전에
 * 스냅샷을 잡는데, **주인공 3학년은 그 갈래를 안 탄다.** W47 진로 결정
 * 경로가 `runWorldSeasonEnd`를 직접 부르고 끝내기 때문이다. 그래서 고교
 * **마지막 해 성적을 한 번도 못 잡았고**, 실측 표본이 늘 1·2학년뿐이었다.
 *
 * W47에 잡는 우회는 시즌이 5주 모자란 값을 준다(이닝 과소·ERA 노이즈).
 * 3학년은 드래프트 직전 해라 그 해 완주 성적이 제일 중요하다.
 */
let _beforeSeasonEndHook: ((year: number) => void) | null = null;
export function setBeforeSeasonEndHook(fn: ((year: number) => void) | null): void {
  _beforeSeasonEndHook = fn;
}

/**
 * 시즌 종료 처리가 **다 끝난 뒤**에 불리는 계측 훅.
 *
 * ⚠ 계측 전용이다 — 운영 코드가 여기 붙으면 안 된다.
 *
 * `setBeforeSeasonEndHook`과 **짝이지 대체가 아니다.** 저쪽은 성적이 온전한
 * 지점(처리 앞)이고, 이쪽은 **롤오버가 만든 값**을 보는 자리다 —
 * 순위·구단 성향·압박·목표 순위·연속 기록은 `updateProTeamProfiles()`가
 * 돌고 난 뒤에야 생긴다.
 *
 * 왜 필요한가: 하네스가 `isSeasonEnded()`를 보고 잡으면 **주인공이 진로를
 * 정하는 해를 통째로 놓친다.** `pushCareerForward`가 드래프트 통보 뒤로
 * 시즌을 넘겼 때 실측한 것: `S2028 W32 → S2029 W0` — 2028 종료를 안 거친다.
 * 그 해만 표본이 비면 연속 실패·연속 우승 같은 **누적 값을 영영 못 재다.**
 */
let _afterSeasonEndHook: ((year: number) => void) | null = null;
export function setAfterSeasonEndHook(fn: ((year: number) => void) | null): void {
  _afterSeasonEndHook = fn;
}

export async function runWorldSeasonEnd(now: number): Promise<void> {
  if (_lastWorldSeasonEndYear === now) return;
  _lastWorldSeasonEndYear = now;

  // ⚠ **가드 뒤, 처리 앞.** 가드 앞이면 같은 해에 두 번 잡히고,
  // `processSeasonEnd` 뒤면 이미 진급·초기화가 지나 기록이 사라진다
  try { _beforeSeasonEndHook?.(now); } catch { /* 계측이 게임을 깨지 않는다 */ }

  // ⓪ NPC 학년 진급·졸업·나이 — **드래프트보다 먼저**.
  //
  // ⚠ 이게 빠져 있어서 A 수정이 절반만 들었다. 진로 결정 경로에서
  // `runWorldSeasonEnd`를 부를 때 아직 졸업 처리가 안 돼 **졸업생이 드래프트
  // 풀에 없었다** — 그 해 `quit_baseball`이 정상(950)의 12%인 116건이었다.
  // 정상 롤오버는 이미 부르므로 `lastSeasonEndYear` 가드가 중복을 막는다.
  await gameStore.processSeasonEnd(now);

  // NPC 드래프트는 **오프시즌보다 먼저** 돌아야 한다 — 오프시즌이 미지명자
  // 진로를 배정하므로, 드래프트가 뒤에 오면 이미 흩어진 뒤가 된다.
  // W47 관전에서 이미 돌았으면 `lastDraftYear` 가드가 건너뛴다.
  {
    const { univIds, indIds } = draftDestinationTeams(get(masterStore).teams);
    await gameStore.processNpcDraft(now, univIds, indIds);
  }

  const leagueStats: Record<string, Record<string, import("../types/save").PlayerSeasonStats>> = {};
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) leagueStats[lid] = ls.stats;
  gameStore.applySeasonHistory(get(seasonStore).stats, leagueStats, now);

  await seasonStore.flushAllLeagueStatsToDb(now);
  await saveSeasonHistory(now);
  await gameStore.processAllLeaguesSeasonEnd(now);  // ← 여기서 __lastOffseasonSummary 세팅
  // ⚠ **주인공 시즌 기록은 여기서 남긴다.** 예전엔 `SeasonEndModal`이 유일한
  // 호출부라 결산 화면을 열어야만 `careerRecords`가 쌓였고, 자동 진행에선
  // 은퇴할 때까지 한 줄도 없었다. 수상보다 **먼저**여야 얹을 자리가 생긴다
  applyProtagonistSeasonRecord(now);
  // 수상은 연도 기록이 만들어진 **뒤**여야 얹을 자리가 있다
  logsOf(await applySeasonAwards(now));
  await gameStore.applyAgingDecay();
  await updateProTeamProfiles();
  await runSeasonEndBgProcessing(now);

  // ⚠ **모든 처리 뒤.** 앞에 두면 압박·목표가 아직 지난 시즌 값이다
  try { _afterSeasonEndHook?.(now); } catch { /* 계측이 게임을 깨지 않는다 */ }
}

/**
 * 시즌 성적으로 구단 성향을 갱신한다 — **팀 개성이 생기는 유일한 경로**.
 *
 * ⚠ `calc_win_now_pressure_update`는 구현돼 있는데 **아무도 안 불렀다.**
 * `initProTeamProfiles`·`patchProTeamProfile`도 호출부가 없어서
 * `gameStore.proTeamProfiles`는 항상 비어 있었고, refs.json에도
 * `proTeamProfile`이 없어 **전 팀이 `DEFAULT_TEAM_PROFILE`(전 항목 50)** 로
 * 떨어졌다.
 *
 * 그 결과가 트레이드 소멸이다. buyer 조건이
 * `rank_pct <= 0.30 && win_now_pressure > 60`인데 모두가 정확히 50이라
 * **buyer가 구조적으로 0팀**이었다 — seller만 남으면 거래 상대가 없다.
 * 실측 트레이드: 9 → 8 → 2 → 1 → 1 → 0.
 *
 * 같은 프로필을 승강 임계값(`10.0 - win_now_pressure * 0.05`)·방출·FA 입찰도
 * 읽으므로, 눌려 있는 동안 그쪽 판단도 전부 중립이었다.
 */
async function updateProTeamProfiles(): Promise<void> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const m = get(masterStore);

  for (const leagueId of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
    const standings = leagueStandingsOf(s, leagueId);
    if (standings.length === 0) continue;
    const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

    // ── 목표 순위 — **지출과 우승 이력에서 유도한다** ──────────────
    //
    // 🔴 예전엔 절대 순위만 봐서 **예산 큰 팀도 중위권이면 +2**로 만족했다.
    // 실측 KBL 지출 지수가 1.5 ~ 0.52로 3배 벌어져 있는데 기대는 같았다.
    //
    // 리그 안 상대 위치로 낸다 — 새 상수가 없다. 지출 "순위"로 하면 동점이
    // 많아(0.99가 3팀 · 0.9가 4팀) 자의적이라 **연속값**으로 뽑는다.
    //
    // ⚠ **해외는 예산이 없다**(refs에 `history.budget`이 KBL에만 있다).
    // 그러면 목표를 중위권으로 둬서 사실상 예전 동작이 된다 — 조용히
    // 깨지지 않게 하는 폴백이다. 해외 예산이 생기면 자동으로 작동한다.
    const deviationWeight = await (async () => {
      try {
        const { loadRosterRules } = await import("../repo/newGameV3");
        const r = await loadRosterRules() as { promotionRules?: { pressureDeviationWeight?: number } };
        return r.promotionRules?.pressureDeviationWeight ?? 0;
      } catch { return 0; }
    })();
    const targetOf = new Map<string, number>();
    {
      const budgets = sorted.map((st) => ({
        teamId: st.teamId,
        idx: m.teams.find((t) => t.id === st.teamId)?.history?.budget ?? 0,
      }));
      const vals = budgets.map((b2) => b2.idx).filter((v) => v > 0);
      const lo = vals.length ? Math.min(...vals) : 0;
      const hi = vals.length ? Math.max(...vals) : 0;
      for (const b2 of budgets) {
        // 예산이 없거나 전 팀이 같으면 중위권을 목표로 — 예전 동작과 같아진다
        if (!b2.idx || hi <= lo) { targetOf.set(b2.teamId, sorted.length / 2); continue; }
        const t = 1 + (sorted.length - 1) * ((hi - b2.idx) / (hi - lo));
        // 연속 우승만큼 기대가 올라간다 (1위가 하한)
        const titles = g.teamStreaks[b2.teamId]?.titles ?? 0;
        targetOf.set(b2.teamId, Math.max(1, t - titles));
      }
      // 계측·화면이 읽을 수 있게 담는다 — 같은 식을 두 번 구현하지 않는다
      gameStore.setTeamTargets(Object.fromEntries(targetOf));
    }

    for (let i = 0; i < sorted.length; i++) {
      const teamId = sorted[i].teamId;
      const cur = g.proTeamProfiles[teamId]
        ?? m.teams.find((t) => t.id === teamId)?.proTeamProfile
        ?? DEFAULT_TEAM_PROFILE;
      // 이번 시즌 결과로 연속 기록을 갱신한다. **압박에 넘기기 전에** 센다 —
      // 올해 실패면 올해 것까지 세어야 그 압박이 반영된다
      const prev = g.teamStreaks[teamId] ?? { missedPlayoffs: 0, titles: 0 };
      const madePlayoffs = (i + 1) <= Math.floor(sorted.length / 2);
      const streak = {
        missedPlayoffs: madePlayoffs ? 0 : prev.missedPlayoffs + 1,
        titles: i === 0 ? prev.titles + 1 : 0,
      };
      gameStore.patchTeamStreak(teamId, streak);
      const raw = await window.projectB!.engine("calcWinNowPressureUpdateNative", JSON.stringify({
        currentPressure: cur.winNowPressure,
        ownerPatience: cur.ownerPatience,
        finalStanding: i + 1,
        totalTeams: sorted.length,
        // 🔴 **연속 기록을 실제로 센다.** 예전엔 0이 하드코딩이라 연속 하위권
        // 팀이 추가 압박을 못 받았다 — 매년 +8로 같았다. 산식에는 × 5 계수가
        // 처음부터 있었다.
        //
        // ⚠ 진출선은 **압박 산식이 이미 쓰는 기준**과 같게 둔다
        // (`final_standing <= total_teams / 2`). 따로 정하면 표가 둘이 된다.
        consecutiveMissedPlayoffs: streak.missedPlayoffs,
        wonChampionship: i === 0,
        // 목표 대비 편차 — 0이면 엔진이 예전 절대 순위 방식으로 떨어진다
        targetStanding: targetOf.get(teamId) ?? 0,
        deviationWeight,
      }));
      const r = JSON.parse(raw) as { newPressure?: number; error?: string };
      if (r.error || typeof r.newPressure !== "number") continue;
      gameStore.patchProTeamProfile(teamId, { ...cur, winNowPressure: r.newPressure });
    }
  }
}


/** 진로 결정 등으로 시즌을 건너뛸 때 가드를 되돌린다 (새 게임·슬롯 전환) */
export function resetWorldSeasonEndGuard(): void {
  _lastWorldSeasonEndYear = -1;
}

/**
 * 시즌 기록을 history_* 테이블에 남긴다 (순위·개인기록·포스트시즌).
 *
 * ⚠ **이름을 같이 남긴다.** 예전엔 ID만 넣고 볼 때마다 조회했는데, 은퇴하거나
 * 사라진 선수는 조회가 빗나가 화면에 ID가 그대로 떴다. 과거 기록은 **그때의
 * 사실**이라 그때 이름이 함께 남아야 한다 — 팀명이 바뀌어도 5년 전 순위표는
 * 그 시절 이름이어야 맞다.
 */
export async function saveSeasonHistory(seasonYear: number) {
  const slotId = get(gameStore).currentSlotId;
  if (!slotId) return;

  const teams = get(masterStore).teams ?? [];
  const teamNameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? "";
  const entities = get(masterStore).entities ?? [];
  const me = get(gameStore).protagonist;
  const personNameOf = (id: string) =>
    id === me.id ? me.name : (entities.find((e) => e.id === id)?.name ?? "");
  const personTeamOf = (id: string) =>
    teamNameOf(id === me.id ? (me.teamId ?? "") : (entities.find((e) => e.id === id)?.teamId ?? ""));

  const standingRows: object[] = [];
  for (const st of get(seasonStore).standings) {
    const groupLabel = "";
    standingRows.push({ leagueId: get(seasonStore).leagueId, teamId: st.teamId, groupLabel,
      teamName: teamNameOf(st.teamId),
      wins: st.wins, losses: st.losses, draws: st.draws, winPct: st.winPct,
      runsFor: st.runsFor, runsAgainst: st.runsAgainst, streak: st.streak, last10: st.last10 });
  }
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) {
    // 주인공 리그는 첫 번째 루프에서 group_label 포함해 저장했으므로 건너뜀
    // (leagueState에도 동일 리그가 있어 INSERT OR REPLACE로 덮어쓰면 group_label이 '' 로 초기화됨)
    if (lid === get(seasonStore).leagueId) continue;
    for (const st of (ls.standings ?? [])) {
      standingRows.push({ leagueId: lid, teamId: st.teamId, groupLabel: "",
        teamName: teamNameOf(st.teamId),
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
          playerName: personNameOf(playerId), teamName: personTeamOf(playerId),
          g: p2.g, gs: p2.gs, w: p2.w, l: p2.l, sv: p2.sv ?? 0, hd: p2.hd ?? 0,
          ip: p2.ip, er: p2.er, hP: p2.h, kP: p2.k, bbP: p2.bb, era: p2.era, whip: p2.whip });
      } else {
        const b2 = stat as BatterSeasonStats;
        lbStatRows.push({ leagueId: lid, playerId, statType: "batter",
          playerName: personNameOf(playerId), teamName: personTeamOf(playerId),
          g: b2.g, pa: b2.pa, ab: b2.ab, hB: b2.h, hr: b2.hr, rbi: b2.rbi,
          sb: b2.sb ?? 0, bbB: b2.bb, kB: b2.k, avgV: b2.avg, obp: b2.obp, slg: b2.slg, ops: b2.ops });
      }
    }
  }
  if (lbStatRows.length > 0) {
    window.projectB!.seasonSaveHistoryLbStats(JSON.stringify({ slotId, seasonYear, rows: lbStatRows })).catch(() => {});
  }

  // 포스트시즌 결과 저장
  const brackets = get(seasonStore).postseasonBrackets ?? {};
  const psRows: object[] = [];
  const psEntries = get(seasonStore).schedule.filter((e) => e.phase === "postseason");
  const finalEntry = psEntries.find((e) => e.id.startsWith("PS_FINAL_"));
  if (finalEntry?.result) {
    const playoffTeams = Array.from(new Set(
      psEntries
        .filter((e) => e.id.startsWith("PS_SEMI"))
        .flatMap((e) => [e.homeTeamId, e.awayTeamId])
    ));
    const myLeague = get(seasonStore).leagueId;
    psRows.push({
      leagueId: myLeague,
      championId: finalEntry.result.winnerId,
      runnerUpId: finalEntry.result.loserId ?? "",
      championName: teamNameOf(finalEntry.result.winnerId),
      runnerUpName: teamNameOf(finalEntry.result.loserId ?? ""),
      playoffTeams,
      // ⚠ **대진을 통째로 남긴다.** 지금까지 우승·준우승·진출팀 셋만 저장해서
      // 화면이 "지난 시즌은 대진 과정이 아니라 결과만 남는다"고 쓸 수밖에
      // 없었다. 데이터가 없어서였지 화면이 게을러서가 아니다.
      bracket: brackets[myLeague] ?? null,
    });
  } else if (get(seasonStore).standings.length > 0) {
    const sorted = [...get(seasonStore).standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    const myLeague = get(seasonStore).leagueId;
    psRows.push({ leagueId: myLeague, championId: sorted[0].teamId, runnerUpId: "",
      championName: teamNameOf(sorted[0].teamId), runnerUpName: "",
      playoffTeams: [], bracket: brackets[myLeague] ?? null });
  }
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) {
    if (lid === get(seasonStore).leagueId) continue;
    const bracket = brackets[lid] ?? null;
    // ⚠ **우승은 대진이 정한다.** 예전엔 `standings[0]`(정규시즌 1위)을 우승으로
    // 적고 준우승은 빈칸으로 뒀다 — 브래킷이 바로 옆에 있는데. 그래서 과거 기록의
    // "우승"과 그 아래 대진표의 승자가 서로 다를 수 있었다.
    const fin = bracket ? bracketFinalists(bracket) : null;
    const sorted = [...(ls.standings ?? [])].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    // 포스트시즌이 없는 리그(대학·고교)는 정규시즌 1위가 그 시즌의 1위다
    const championId = fin?.champion ?? sorted[0]?.teamId ?? "";
    if (!championId) continue;
    psRows.push({ leagueId: lid, championId, runnerUpId: fin?.runnerUp ?? "",
      championName: teamNameOf(championId), runnerUpName: teamNameOf(fin?.runnerUp ?? ""),
      playoffTeams: [], bracket });
  }
  if (psRows.length > 0) {
    window.projectB!.seasonSaveHistoryPostseason(JSON.stringify({ slotId, seasonYear, rows: psRows })).catch(() => {});
  }

  // ── 대회 결과 저장 ──────────────────────────────────────────
  //
  // ⚠ **대회만 과거 기록이 없었다.** 화면은 `$seasonStore.tournaments`
  // (현재 시즌)만 보므로 **시즌이 넘어가면 지난해 대회가 통째로 사라졌다** —
  // 연도를 골라도 올해 것이 보였다. 고교 5개·대학 3개가 매 시즌 열리고
  // 우승팀까지 나오는데 볼 데가 없었다.
  //
  // ⚠ **안 열린 대회도 한 줄 남긴다.** 없으면 화면이 "미참가"와 "안 열림"을
  // 구분 못 한다 — 결산 화면이 바로 그 구분을 필요로 한다.
  {
    const sT = get(seasonStore);
    const tourRows = TOURNAMENTS.map((def) => {
      const bracket = sT.tournaments?.[def.id] ?? null;
      const group   = sT.groupStages?.[def.id] ?? null;
      const fin     = finalistsOf(bracket);
      return {
        tourId: def.id, leagueId: def.leagueId, tourName: def.name,
        championId: fin?.champion ?? "", championName: teamNameOf(fin?.champion ?? ""),
        runnerUpId: fin?.runnerUp ?? "", runnerUpName: teamNameOf(fin?.runnerUp ?? ""),
        bracket, group,
      };
    });
    if (tourRows.length > 0) {
      window.projectB!.seasonSaveHistoryTournaments(
        JSON.stringify({ slotId, seasonYear, rows: tourRows })).catch(() => {});
    }
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

  // ── 복무 중 ──────────────────────────────────────────────────
  //
  // ⚠ 전역이 **여기 없어서 입대하면 영원히 군대에 있었다.** 전역 코드는
  // `advanceWeek.handleSeasonEnd`에 있었지만 `runAutoAdvance`가 그보다 먼저
  // 시즌 종료(`currentWeek >= totalWeeks`)에서 멈춰 도달할 수가 없었다 —
  // 두 조건이 같은 순간을 가리키는데 자동 진행이 먼저 잡는다(죽은 코드).
  // 실측: 2029 입대 → 2036년 복무 700주(13.5년), 26세.
  //
  // 복무는 52주 시즌 두 번으로 흐른다. 매 시즌 세계 오프시즌을 돌리고
  // 나이를 올린 뒤, 복무가 끝났으면 전역하고 아니면 다음 해를 연다.
  // (오프시즌을 건너뛰면 복무 기간만큼 세계가 정체된다 — `militaryDecision` 주석 참고)
  if (P().careerStage === "military") {
    // ⚠ 예전엔 `processAllLeaguesSeasonEnd`만 불렀다. 그 사이 **드래프트가
    // 안 돌아** 복무 2년 동안 신인이 한 명도 안 들어왔다.
    await runWorldSeasonEnd(now);
    gameStore.advanceSeasonYear(get(seasonStore).seasonYear);
    if (!(await dischargeProtagonist())) openMilitarySeason(now + 1);
    await gameStore.save();
    await seasonStore.save();
    return;
  }

  // NPC 드래프트 — **오프시즌보다 먼저** 돌아야 한다.
  //
  // 오프시즌이 미지명자 진로를 배정하므로(방출·FA 미계약과 같은 로직),
  // 드래프트가 그 뒤에 오면 이미 대학·독립으로 흩어진 뒤가 된다.
  // W47 관전에서 이미 돌았으면 `lastDraftYear` 가드가 건너뛴다 —
  // 주인공 졸업 시즌엔 W47 관전 이벤트가 안 떠서 여기가 유일한 경로다.
  // ── 프로(KBL/ABL/JBL): pendingNextContract 적용 후 새 시즌 초기화 ──
  const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(P().careerStage);
  if (isProStage) {
    await runWorldSeasonEnd(now);
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
      seasonStore.initSeason(pending.leagueId, seasonYear, 52, proTeamIds);
      seasonStore.setSchedule(await proSchedule(pending.leagueId, proTeamIds, pending.teamId));
    } else {
      // ⚠ **계약 기간 중이면 `pendingNextContract`가 없는 게 정상이다.**
      // 재계약을 앞둔 해가 아니면 아무것도 대기하지 않는다 — 신인 3년 계약이면
      // 2·3년차가 여기로 온다.
      //
      // 예전엔 이 분기가 `startNewSeason()`만 불렀다. 그건 **빈 시즌**을 만든다
      // (`makeEmptySeason` — 일정 없음). 그래서 프로 2년차부터 경기가 0건이었다.
      // 주석은 "미서명 상태 폴백"이라고 적혀 있었지만 실제로 여기 오는 건
      // 대부분 **정상 계약 중인 선수**다.
      seasonStore.startNewSeason();
      const me = P();
      const teamIds = get(masterStore).teams
        .filter((t) => t.leagueId === me.leagueId)
        .map((t) => t.id);
      if (teamIds.length > 0 && me.teamId) {
        seasonStore.setSchedule(await proSchedule(me.leagueId, teamIds, me.teamId));
      }
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

  await runWorldSeasonEnd(now);

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
