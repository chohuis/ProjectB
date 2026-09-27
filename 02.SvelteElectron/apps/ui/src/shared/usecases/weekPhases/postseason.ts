/**
 * **시즌 경계 — 포스트시즌 · 대회 · 독립 생존리그** (2026-09-27 · Ⅱ-1 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `advanceWeek.ts` 3,352줄에서
 *   이 다섯 함수(519줄)가 한 덩이로 나왔다 — 셋 다 「주가 끝나는 자리」의
 *   일이고 서로만 부른다(`progressTournaments` → `replayDrawnKnockout`).
 *   `advanceWeek.ts` 에는 **순서와 가드만** 남긴다.
 *
 * ⚠ **바뀐 것은 상대 경로뿐이다** — 한 단계 깊어져 `../` 가 `../../` 가 됐다.
 *   함수 이름·시그니처·블록 순서·주석은 그대로다. 옮기기 전에 쓴 검사
 *   (`__tests__/postseasonWeekBlocks.test.ts` · 갈림길 16 + 배선 대조군 5)가
 *   주간 진행 경로를 **한 덩이로** 읽으므로 검사 문장은 한 글자도 안 바뀌었다.
 *
 * ⚠ 여기 함수들은 전부 `advanceWeek.ts` 의 주 루프에서만 불린다. 화면·다른
 *   usecase 에서 부르지 않는다 — 부르면 대회 라운드가 한 주에 두 번 닫힌다.
 */
import { get } from "svelte/store";
import { seasonStore, npcLiveStatsStore } from "../../stores/season";
import { gameStore } from "../../stores/game";
import { masterStore } from "../../stores/master";
import { simulateGame } from "../../utils/gameSimulator";
import { rotationSizeForLeague } from "../../utils/rosterEngine";
import { toGameDate } from "../../utils/scheduleGen";
import { HS_REGIONS } from "../../utils/leagueScheduler";
import { rankListMeta } from "../../utils/dashboardMeta";
import {
  buildKblBracket,
  buildAblBracket,
  buildIndLadder,
  buildJblBracket,
  applyGameToSeries,
  fillNextSeries,
  resolveNonProtagonistSeries,
  postseasonSeed,
  makeSeriesGame,
  nextGameNum,
} from "../../utils/postseasonEngine";
import {
  winnerById,
  scheduledIdSet,
  knockoutMatchIds,
  allScheduleEntries,
} from "../../utils/scheduleView";
import { IND_LEAGUE_ID, emptySurvivalState } from "../../utils/survivalLeague";
import { TOURNAMENTS } from "../../utils/tournament";
import {
  applyRoundResults,
  missingRoundEntries,
  openTournamentsForWeek,
  promoteFinishedGroupStages,
} from "../tournaments";
import { progressSurvival } from "../survivalLeague";
import { collectTournamentLines, tournamentAwards, weekRangeOf } from "../tournamentAwards";
import {
  buildOpenMessage,
  buildMyRoundMessage,
  buildChampionMessage,
  buildRoundProgressMessage,
} from "./tournamentNews";
import type { MatchResult } from "../../types/season";
import type { MessageItem } from "../../types/main";

// ── 통합 포스트시즌 주입 (HS / KBL / ABL / UNIV / IND) ──────────
// 매 게임 처리 후 호출. 정규시즌 종료 감지 → 브라켓 초기화 → 다음 경기 주입
/**
 * 독립 생존리그 진행 (Phase 5-6).
 *
 * 대회와 달리 한 주에 여러 단계가 겹치지 않으므로 반복 루프가 필요 없다 —
 * 단계가 끝나야 다음 단계 일정이 나오고, 단계 사이에는 최소 한 주가 있다.
 */
export async function progressIndependentLeague(week: number): Promise<void> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const state = s.survival ?? emptySurvivalState();

  // ⚠ **여기서 순위표를 만들지 않는다** (2026-09-01).
  //
  // 한때 `stageStandings` 결과를 매주 `leagueState` 로 옮겼다. 독립 경기가
  // 아무도 안 돌아 순위표가 전원 0-0 이던 시절의 대증요법이었다.
  //
  // 🔴 **뿌리를 고치자 그게 해로워졌다.** `injectLeagueEntries` 가 주인공
  // 리그 일정을 `s.schedule` 에 넣게 되면서 **일반 경로가 순위를 제대로
  // 만든다**(`syncProtagonistLeagueUpdate`). 그런데 마지막 단계에는
  // `INDS{stage}_` 일정이 없어 `stageStandings` 가 **빈 결과**를 내고,
  // 그게 멀쩡한 순위표를 **0-0 으로 덮었다.**
  //
  // 실측(트랙 B): 순위는 8~10 으로 움직이는데 `survivalProbe` 의
  // `반영_승패합` 은 0 이었다 — **두 경로가 같은 자리를 두고 다퉜다.**
  //
  // ⚠ `stageStandings` 는 **탈락 판정에만** 쓴다(`progressSurvival` 안).
  //   그게 원래 그 함수의 몫이다.

  const r = await progressSurvival(week, s, state, g.protagonist.teamId);
  if (!r) return;

  seasonStore.setSurvivalState(r.state);
  if (r.entries.length > 0) {
    seasonStore.injectLeagueEntries(IND_LEAGUE_ID, r.entries);
  }
  if (r.eliminated.length > 0) {
    console.info(`[독립] ${r.state.stage - 1}차 Stage 종료 — 탈락 ${r.eliminated.length}팀`);
    // 내 팀이 그 안에 있으면 **일어난 일**이다 (2026-09-08 · L1)
    if (r.eliminated.includes(g.protagonist.teamId)) {
      gameStore.recordOutcome({
        kind: "eliminated",
        year: s.seasonYear,
        week,
        detail: `독립 ${r.state.stage - 1}차`,
      });
    }
  }
}

/**
 * 이 경기가 **넉아웃(대회 본선)인가** — 무승부로 끝나면 대진이 못 넘어간다.
 *
 * 🔴 시뮬 호출부마다 물어야 한다. 한 곳이라도 안 물으면 그 경로의 대회
 *   경기만 12이닝 상한이 걸려 무승부가 나고, **그 대회가 그 라운드에서
 *   죽는다**(장미기 2028 실측 — `knockoutMatchIds` 머리말).
 *   배선이 빠졌는지는 `drawRule.test.ts` 가 호출부 수로 본다.
 */
export function isKnockoutGame(scheduleId: string): boolean {
  return knockoutMatchIds(get(seasonStore)).has(scheduleId);
}

/**
 * **무승부로 끝난 넉아웃 경기를 재경기로 푼다** — 2026-09-06 이전 세이브용.
 *
 * 🔴 왜 필요한가: 넉아웃이 무승부면 `result.winnerId` 가 빈 문자열이고,
 *   `advanceTournamentRoundNative` 는 참가팀이 아닌 승자를 무시한다. 그러면
 *   그 라운드는 `live.every(winnerTeamId)` 를 **영영 못 채워** 주마다 다시
 *   확정되고, `buildMyRoundMessage` 가 **같은 소식 id 를 다시 낸다** —
 *   Svelte 가 키 중복으로 던져 화면이 통째로 굳었다(실사용자 신고).
 *   그리고 그 대회는 거기서 죽는다(장미기 2028 은 2라운드 7경기를 치르고도
 *   반영이 안 됐다 · 실측).
 *
 * ⚠ **만드는 쪽은 고쳤다**(`gameSimulator` 의 `knockout`). 여기는 이미
 *   저장된 무승부를 푸는 자리라 새 세이브에서는 한 번도 안 돈다.
 *
 * ⚠ **결과를 통째로 갈아 끼우지 않는다.** `settleDrawnKnockout` 머리말 —
 *   선수 기록은 이미 쌓여 있어 다시 쌓으면 이중 계상이다.
 *
 * @returns 재경기 승자. 못 풀면 `null`(그러면 대회는 그대로 멈춘 채다 —
 *          없는 승자를 지어내지 않는다).
 */
async function replayDrawnKnockout(m: {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
}): Promise<string | null> {
  const s = get(seasonStore);
  const entry = allScheduleEntries(s).find((e) => e.id === m.id);
  const entities = get(masterStore).entities;
  if (!entry || !m.homeTeamId || !m.awayTeamId || entities.length === 0) return null;

  const lid = entry.leagueId ?? "";
  const lState = s.leagueState[lid];
  const sim = await simulateGame(m.homeTeamId, m.awayTeamId, entities, {
    conditions: lState?.playerConditions ?? {},
    homeRotIdx: lState?.teamRotationIndex?.[m.homeTeamId] ?? 0,
    awayRotIdx: lState?.teamRotationIndex?.[m.awayTeamId] ?? 0,
    week: entry.week,
    phase: entry.phase,
    knockout: true, // ← 이것 때문에 다시 도는 것이다
    npcInjuries: s.npcInjuries,
    npcLiveStats: get(npcLiveStatsStore),
    leagueId: lid,
    rotationSize: rotationSizeForLeague(lid),
    // 씨앗은 **원래 경기 그대로** 둔다 — 같은 세이브를 다시 열어도 같은
    // 재경기가 나와야 한다(꼬리표를 붙이면 재현이 갈린다)
    worldSeed: s.worldSeed,
    scheduleId: m.id,
  });
  const w = sim.result.winnerId;
  if (!w) return null;
  console.warn(
    `[대회] 넉아웃 무승부를 재경기로 풀었다 — ${m.id} ` +
      `${sim.result.homeScore}:${sim.result.awayScore} 승 ${w}`,
  );
  seasonStore.settleDrawnKnockout(
    m.id,
    sim.result.homeScore,
    sim.result.awayScore,
    w,
    sim.result.loserId ?? null,
  );
  return w;
}

/**
 * 전국대회 진행 (Phase 5-4).
 *
 * 대회는 한 주에 여러 라운드가 들어간다(국화기 7R/4주). 다음 라운드 대진은
 * 직전 라운드 결과가 나와야 정해지므로, 경기 처리 루프와 번갈아 돌려야 한다.
 * → 이 함수는 "지금 넣을 수 있는 경기를 넣고, 넣었으면 true"를 돌려주고
 *   호출부가 경기를 치른 뒤 다시 부른다.
 *
 * @returns 일정에 새 경기를 넣었으면 true
 */
export async function progressTournaments(
  week: number,
  /**
   * 「진출 명단」 소식을 담을 그릇 (2026-09-08 · B 소식 실측).
   *
   * 🔴 이 함수는 **한 주에 여러 번 불린다** — 대회 하나당 한 번에 한 라운드만
   *   닫고 빠지므로, 호출부가 경기를 치른 뒤 다시 부른다(`pass` 루프 · 상한 20).
   *   그래서 여기서 바로 `addMessage` 하면 라운드마다 한 통씩 쌓인다 —
   *   실측 주당 0.45통 · 많으면 다섯 통이고, 그게 「같은 주 같은 성격 여럿」의
   *   제일 큰 자리였다.
   *
   * ⚠ **그릇을 안 주면 예전 그대로 바로 내보낸다.** 묶는 것은 주가 끝난 뒤에나
   *   할 수 있는 일이라, 그 자리를 아는 호출부만 그릇을 준다.
   */
  roundNewsSink?: MessageItem[],
): Promise<boolean> {
  const g = get(gameStore);
  // 앞 라운드가 늦게 끝나 주차를 넘긴 대회 경기를 이번 주로 당긴다.
  // 경기 처리 루프가 `e.week === 이번주`만 보므로, 안 당기면 영영 안 치러진다
  seasonStore.pullOverdueTournamentGames(week, toGameDate(get(seasonStore).seasonYear, week, 6));
  // 주인공 소속과 무관하게 전 리그 대회가 돈다 — DESIGN §2 국내 풀 시뮬.
  // 주인공이 대학에 가도 모교의 국화기는 계속 열린다.
  const protagonistTeamId = g.protagonist.teamId;
  let injected = false;

  // ① 이번 주에 개막하는 대회 (넉아웃이면 브래킷, 은하기·여명기면 조 추첨)
  const sOpen = get(seasonStore);
  const opened = await openTournamentsForWeek(
    week,
    sOpen,
    protagonistTeamId,
    get(masterStore).teams,
    sOpen.worldSeed ?? 0,
  );
  const tName4Tour = (id: string) => get(masterStore).teams.find((t) => t.id === id)?.name ?? id;

  /**
   * 주인공 권역의 팀들 — 라운드 진출 명단에서 **아는 팀을 짚어주는** 데 쓴다.
   *
   * ⚠ 없으면 남의 대회 8강 명단은 그냥 모르는 이름 나열이라 읽을 이유가 없다.
   * 고교가 아니면 빈 집합이다(권역은 고교 개념이다) — 그때는 명단만 나온다.
   */
  const myRegionTeamIds = (): Set<string> | undefined => {
    for (const ids of Object.values(HS_REGIONS)) {
      if (ids.includes(protagonistTeamId)) return new Set(ids);
    }
    return undefined;
  };
  for (const o of opened) {
    if (o.bracket) seasonStore.setTournamentBracket(o.bracket);
    if (o.stage) seasonStore.setGroupStage(o.stage);
    if (o.entries.length > 0) {
      seasonStore.injectTournamentEntries(o.entries);
      injected = true;
    }
    // 개막 알림 — 대회는 고교 시즌 서사의 본체인데 예전엔 아무 통지가 없었다
    const def = TOURNAMENTS.find(
      (t) => t.id === (o.bracket?.tournamentId ?? o.stage?.tournamentId),
    );
    if (def) {
      const entrants = o.bracket
        ? [...new Set(o.bracket.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))].filter(
            (x): x is string => !!x,
          )
        : (o.stage?.groups ?? []).flatMap((gr) => gr.teams);
      // 브래킷을 같이 넘긴다 — 개막 소식이 1라운드 대진을 표로 얹는다
      // (A 단위 5 묶음 3). 조별예선 대회(`o.stage`)는 대진이 아직 없어
      // `null` 이고, 그러면 소식이 표를 안 싣는다
      // ⚠ 무대를 같이 넘긴다 — 남의 무대 대회에 「우리 팀은 출전권을 얻지
      //   못했다」가 붙으면 프로·상무 주인공에게 해마다 여덟 통이 간다
      gameStore.addMessage(
        buildOpenMessage(
          def,
          entrants,
          protagonistTeamId,
          get(gameStore).protagonist.leagueId ?? "",
          week,
          get(seasonStore).seasonYear,
          o.bracket,
          tName4Tour,
        ),
      );
    }
  }

  // ② 예선이 다 끝난 대회 → 본선 8강 브래킷 생성
  {
    const promoted = await promoteFinishedGroupStages(get(seasonStore), protagonistTeamId);
    for (const p of promoted) {
      seasonStore.setTournamentBracket(p.bracket);
      const due = p.entries.filter((e) => e.week <= week);
      if (due.length > 0) {
        seasonStore.injectTournamentEntries(due);
        injected = true;
      }
    }
  }

  // ③ 결과가 다 나온 라운드 → 다음 라운드 대진 확정 + 주입
  const s = get(seasonStore);
  // 두 군데(주인공 리그 / 그 밖)를 합치는 규칙은 `scheduleView` 하나다
  const resultOf = winnerById(s);
  const scheduledIds = scheduledIdSet(s);

  for (const bracket of Object.values(s.tournaments ?? {})) {
    for (let r = 1; r <= bracket.totalRounds; r++) {
      const live = bracket.matches.filter(
        (m) => m.round === r && !m.isBye && m.homeTeamId && m.awayTeamId,
      );
      if (live.length === 0) continue;
      if (live.every((m) => m.winnerTeamId)) continue; // 이미 반영됨

      // ⚠ 대진은 확정됐는데 **일정에 없는** 라운드 — 먼저 넣는다.
      // 예전엔 다음 라운드 일정을 `week <= 현재주`로 걸러 버리고 다시 넣는
      // 경로가 없어서, 모든 대회가 1라운드에서 교착했다 (우승팀 0)
      {
        const missing = await missingRoundEntries(bracket, r, scheduledIds);
        // ⚠ **지난 주차로 들어가면 영영 안 치러진다.** 경기 처리 루프가
        // `e.week === 이번주`만 보기 때문이다. 앞 라운드가 늦게 끝나
        // 원래 주차를 넘겼으면 **이번 주로 당겨서** 넣는다 —
        // 실제 대회도 앞 라운드가 밀리면 다음 라운드가 곧바로 붙는다.
        const due = missing
          .filter((e) => e.week <= week)
          .map((e) =>
            e.week === week
              ? e
              : {
                  ...e,
                  week,
                  gameDate: toGameDate(get(seasonStore).seasonYear, week, 6),
                },
          );
        if (due.length > 0) {
          seasonStore.injectTournamentEntries(due);
          injected = true;
        }
        if (missing.length > 0) break; // 경기를 치른 뒤 다시 부른다
      }

      // 🔴 **승자 없는 결과** — 넉아웃 무승부다. 그대로 넘기면 승자가 안
      //   찍혀 이 라운드가 **매 주 다시 확정된다**(`replayDrawnKnockout` 머리말).
      for (const m of live) {
        const w = resultOf.get(m.id);
        if (w === undefined || w === m.homeTeamId || w === m.awayTeamId) continue;
        const settled = await replayDrawnKnockout(m);
        if (settled) resultOf.set(m.id, settled);
      }

      const results = live
        .filter((m) => resultOf.has(m.id))
        .map((m) => ({ matchId: m.id, winnerTeamId: resultOf.get(m.id)! }));
      if (results.length < live.length) break; // 아직 안 끝난 라운드
      // 재경기로도 못 풀었으면 **이 라운드는 건너뛴다.** 승자 없는 결과를
      // 그대로 넘기면 라운드가 안 닫히고 같은 소식이 주마다 다시 난다.
      if (results.some((x) => !x.winnerTeamId)) {
        console.error(
          `[대회] ${bracket.tournamentId} r${r} — 승자 없는 경기가 남아 라운드를 못 닫는다`,
        );
        break;
      }

      const { bracket: next, nextEntries } = await applyRoundResults(
        bracket,
        r,
        results,
        protagonistTeamId,
      );
      seasonStore.setTournamentBracket(next);

      // 내 팀 결과 · 우승 확정 — 둘 다 확정된 브래킷만 읽는다 (새 시뮬 없음)
      {
        const def = TOURNAMENTS.find((t) => t.id === next.tournamentId);
        if (def) {
          const mine = buildMyRoundMessage(def, next, r, protagonistTeamId, tName4Tour, week);
          if (mine) gameStore.addMessage(mine);

          // 🔴 **일어난 일을 적는다** (2026-09-08 · L1 · `PLAN_MESSAGE_LANES`).
          //   통지가 `outcome_within` 으로 이걸 읽는다 — 예전엔
          //   「대회에서 탈락했습니다」가 조건을 **`morale_lte 55`** 로 썼다
          //   (진출은 `team_rank_lte 2` 인데 탈락은 사기라, 같은 대회를 두 축으로
          //   판정하고 있었다 · `types/event.ts` 의 `season_*_lte` 머리말).
          //
          // ⚠ **소식이 아니라 브래킷을 본다.** `mine` 은 null 일 수 있고
          //   (내 팀이 그 라운드에 없다) 소식 유무로 판정하면 「우승했는데
          //   소식이 없어서 우승을 못 적는」 자리가 생긴다
          {
            const myMatch = next.matches.find(
              (m) =>
                m.round === r &&
                (m.homeTeamId === protagonistTeamId || m.awayTeamId === protagonistTeamId),
            );
            if (myMatch?.winnerTeamId) {
              const won = myMatch.winnerTeamId === protagonistTeamId;
              const yr = get(seasonStore).seasonYear;
              if (!won) {
                gameStore.recordOutcome({ kind: "eliminated", year: yr, week, detail: def.id });
              } else if (r === next.totalRounds) {
                gameStore.recordOutcome({ kind: "champion", year: yr, week, detail: def.id });
              }
            }
          }

          // ⚠ **내 팀이 없는 라운드도 알린다** (32강부터, 사용자 확정 2026-08-08).
          // 예전엔 우리가 안 나간 대회는 개막·우승 두 통뿐이라 누가 올라갔는지
          // 알 수 없었고, 나간 대회도 탈락한 뒤로는 깜깜했다.
          // `buildRoundProgressMessage`가 내 팀 라운드면 스스로 null을 내므로
          // 위 `mine`과 겹치지 않는다.
          const progress = buildRoundProgressMessage(
            def,
            next,
            r,
            protagonistTeamId,
            tName4Tour,
            week,
            myRegionTeamIds(),
          );
          // ⚠ **「진출 명단」만 그릇으로 간다.** 내 팀 경기 결과·개막·우승·시상은
          //   각자 제 이야기라 그대로 나간다 — 읽는 사람의 이야기를 남 이야기와
          //   같이 접으면 줄인 게 아니라 지운 것이 된다
          if (progress) {
            if (roundNewsSink) roundNewsSink.push(progress);
            else gameStore.addMessage(progress);
          }

          if (r === next.totalRounds) {
            const champ = buildChampionMessage(def, next, protagonistTeamId, tName4Tour, week);
            if (champ) gameStore.addMessage(champ);

            // 🔴 **대회 개인 수상** — 5개 대회가 도는데 우승해도 개인에게
            //   남는 게 없었다. 팀 성적만 쌓여 진로 판정의 팀 점수로만 갔다.
            // ⚠ MVP는 우승팀 안에서, 부문상은 참가팀 전체에서 뽑는다
            //   (사용자 확정 2026-08-30).
            // ⚠ 기록은 시즌 수상과 **같은 자리**(`careerHistory.highlights`)에
            //   남긴다 — 명예의 전당·진학 점수가 그걸 본다.
            const finalM = next.matches.find((m) => m.round === next.totalRounds);
            const championId = finalM?.winnerTeamId ?? null;
            if (championId) {
              const sNow = get(seasonStore);
              const range = weekRangeOf(sNow, def.id);
              if (range) {
                const ents = get(masterStore).entities;
                const teamsNow2 = get(masterStore).teams;
                // 🔴 **리그 게이트가 없으면 섞인다.** 일정은 주인공 것 하나라,
                //   대학 대회의 주차 범위로 고교 경기를 모으면 **대학 대회
                //   이름으로 고교 선수가 상을 받는다** — 실측에서 고교 집계에
                //   여명기·은하기·왕중왕전이 섞여 나왔다.
                const teamOf = (pid: string): string | null => {
                  const tid = ents.find((e) => e.id === pid)?.teamId ?? null;
                  if (!tid) return null;
                  const lg = teamsNow2.find((t) => t.id === tid)?.leagueId ?? null;
                  return lg === def.leagueId ? tid : null;
                };
                const awards = tournamentAwards(
                  collectTournamentLines(sNow.schedule, range.start, range.end),
                  championId,
                  teamOf,
                );
                if (awards.length > 0) {
                  const byPlayer = new Map<string, string[]>();
                  for (const a of awards) {
                    const list = byPlayer.get(a.playerId) ?? [];
                    list.push(`${def.name} ${a.label}`);
                    byPlayer.set(a.playerId, list);
                  }
                  gameStore.addSeasonHighlights(next.seasonYear, byPlayer);

                  // 우리 팀이 걸린 상만 알린다 — 5대회 × 3상이면 한 해 15통이다
                  const mineAw = awards.filter((a) => a.teamId === protagonistTeamId);
                  if (mineAw.length > 0) {
                    const nameOf = (pid: string) => ents.find((e) => e.id === pid)?.name ?? pid;
                    gameStore.addMessage({
                      // ⚠ 주차를 넣는다 — 이 소식도 대회 라운드 루프에서
                      //   같이 난다(`tournamentNews.ts` 머리말)
                      id: `msg-tour-award-${def.id}-${next.seasonYear}-w${week}`,
                      category: "news",
                      // 🔴 **여기만 「고교야구연맹」으로 박혀 있었다** (2026-09-06).
                      //   `TOURNAMENTS` 에는 고교 5개와 **대학 3개**(왕중왕전·
                      //   은하기·여명기)가 같이 있고 이 루프는 여덟을 다 돈다 —
                      //   대학 주인공이 왕중왕전에서 상을 받으면 「고교야구연맹」이
                      //   보냈다. 형제 소식 넷은 `tournamentNews.ts` 에서 이미
                      //   같은 식으로 갈라져 있었다(개막·라운드·우승)
                      sender:
                        def.leagueId === "LEAGUE_UNIVERSITY" ? "대학야구연맹" : "고교야구연맹",
                      subject: `${def.name} 시상 — 우리 학교 ${mineAw.length}명`,
                      preview: mineAw.map((a) => a.label).join(" · "),
                      body: [
                        `${next.seasonYear} ${def.name} 시상식`,
                        "",
                        ...mineAw.map((a) => `🏅 ${a.label}  ${nameOf(a.playerId)}  (${a.value})`),
                      ].join(String.fromCharCode(10)),
                      createdAt: `W${week}`,
                      readAt: null,
                      // 상마다 사람이 붙는다 (§1-2). **소속 열은 안 싣는다** —
                      // 여긴 `teamId === protagonistTeamId` 로 걸러진 우리 학교
                      // 몫이라 전 행이 같은 팀이다(바로 위 `mineAw`)
                      metadata: rankListMeta(
                        "tourAward",
                        mineAw.map((a) => ({
                          label: nameOf(a.playerId),
                          sub: `${a.label} ${a.value}`,
                          isMe: a.playerId === get(gameStore).protagonist.id,
                        })),
                      ),
                    });
                  }
                }
              }
            }
          }
        }
      }
      const due = nextEntries.filter((e) => e.week <= week);
      if (due.length > 0) {
        seasonStore.injectTournamentEntries(due);
        injected = true;
      }
      break; // 이 대회는 한 번에 한 라운드씩
    }
  }

  return injected;
}

export async function injectLeaguePostseason(nextWeek: number): Promise<void> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const leagueId = g.protagonist.leagueId;
  const protagonistId = g.protagonist.teamId;
  const seasonYear = s.seasonYear;

  // 고교·대학은 제외 — 시즌 결산이 패왕기(11월)·왕중왕전(5월)로 옮겨갔다 (Phase 5-5a).
  // top4 준결승/결승을 남기면 결승이 두 번 열린다.
  const SUPPORTED = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_INDEPENDENT"];
  if (!SUPPORTED.includes(leagueId)) return;

  // 정규시즌 경기가 남아 있으면 아직 아님
  if (s.schedule.some((e) => e.phase === "season" && !e.result)) return;

  const bracket = s.postseasonBrackets?.[leagueId] ?? null;

  // ── 브라켓 미초기화: 빌드 후 비주인공 시리즈 즉시 시뮬 ──────
  if (!bracket) {
    let built: import("../../types/season").PostseasonSeries[];
    if (leagueId === "LEAGUE_KBL") built = await buildKblBracket(s.standings);
    else if (leagueId === "LEAGUE_INDEPENDENT") built = await buildIndLadder(s.standings);
    else if (leagueId === "LEAGUE_JBL") built = await buildJblBracket(s.standings);
    else if (leagueId === "LEAGUE_ABL") {
      const { ablConference } = await import("../../utils/leagueConferences");
      const eastSt = s.standings.filter((st) => ablConference(st.teamId) === "East");
      const westSt = s.standings.filter((st) => ablConference(st.teamId) === "West");
      built = await buildAblBracket(eastSt, westSt);
    } else {
      return;
    }
    if (built.length === 0) return;
    built = await resolveNonProtagonistSeries(
      built,
      protagonistId,
      postseasonSeed(s.worldSeed ?? 0, seasonYear, leagueId, built),
    );
    seasonStore.initPostseasonBracket(leagueId, built);
    return; // 다음 루프 이터레이션에서 경기 주입
  }

  // ── 주인공 팀이 참여하는 활성 시리즈 탐색 ───────────────────
  const activeSeries = bracket.find(
    (ser) =>
      !ser.winner &&
      ser.homeTeamId !== "" &&
      ser.awayTeamId !== "" &&
      (ser.homeTeamId === protagonistId || ser.awayTeamId === protagonistId),
  );

  if (!activeSeries) {
    // 주인공 팀 탈락 or 포스트시즌 완료 — 남은 비주인공 시리즈 자동 처리
    const hasUnresolved = bracket.some(
      (ser) => !ser.winner && ser.homeTeamId !== "" && ser.awayTeamId !== "",
    );
    if (hasUnresolved) {
      seasonStore.updatePostseasonBracket(
        leagueId,
        await resolveNonProtagonistSeries(
          bracket,
          protagonistId,
          postseasonSeed(s.worldSeed ?? 0, seasonYear, leagueId, bracket),
        ),
      );
    }
    return;
  }

  // ── 다음 경기 주입 여부 확인 ────────────────────────────────
  const gNum = nextGameNum(activeSeries);
  const gId = `${activeSeries.id}_G${gNum}`;
  if (s.schedule.some((e) => e.id === gId)) return; // 이미 주입됨

  const game = await makeSeriesGame(activeSeries, gNum, nextWeek, protagonistId, seasonYear);
  seasonStore.injectPostseasonEntries([game]);
}

// ── 포스트시즌 경기 결과 → 브라켓 업데이트 ──────────────────────
export async function applyPostseasonResult(
  scheduleId: string,
  result: MatchResult,
): Promise<void> {
  const match = scheduleId.match(/^(.+)_G(\d+)$/);
  if (!match) return;
  const seriesId = match[1];

  const s = get(seasonStore);
  const g = get(gameStore);
  const leagueId = g.protagonist.leagueId;
  const bracket = s.postseasonBrackets?.[leagueId];
  if (!bracket) return;

  const idx = bracket.findIndex((ser) => ser.id === seriesId);
  if (idx < 0) return;

  const updated = await applyGameToSeries(bracket[idx], result.winnerId);
  let newBracket = bracket.map((ser, i) => (i === idx ? updated : ser));

  if (updated.winner) {
    newBracket = await fillNextSeries(newBracket, updated);
    newBracket = await resolveNonProtagonistSeries(
      newBracket,
      g.protagonist.teamId,
      postseasonSeed(s.worldSeed ?? 0, s.seasonYear, leagueId, newBracket),
    );
  }

  seasonStore.updatePostseasonBracket(leagueId, newBracket);
}
