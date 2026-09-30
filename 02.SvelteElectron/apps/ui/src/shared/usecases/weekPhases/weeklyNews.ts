/**
 * **주간 소식 — 리그 결과 · 야구계 다이제스트 · 월간 부상 · 내 몸**
 * (2026-09-30 · Ⅱ-1 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `advanceWeek.ts` 의
 *   `processWeekBoundary` 안에 있던 「주차 → 월 레이블 헬퍼」부터 「뽑은
 *   인덱스를 세이브로 되돌린다」까지가 그대로 나왔다. 블록 경계는 옮기기 전
 *   파일의 주석 절을 그대로 따랐다.
 *
 * ⚠ **넷이 한 덩이여야 한다.** 월 레이블 헬퍼를 넷이 같이 쓰고, 마지막 절이
 *   **세 리포트가 뽑은 문장 인덱스를 한 번에** 되돌린다. 갈라 놓으면 앞선
 *   리포트가 뽑은 것이 안 남아 같은 제목이 연속으로 난다.
 *
 * ⚠ **배경 리그 시뮬 뒤여야 한다.** 리그 결과 소식이 `get(seasonStore)` 로
 *   막 시뮬한 결과를 다시 읽는다 — 앞으로 옮기면 한 통도 안 온다.
 *
 * ⚠ 검사는 주간 진행 경로를 **한 덩이로** 읽으므로(`__tests__/weekPathSrc.ts`)
 *   검사 문장은 한 글자도 안 바뀌었다.
 */
import { get } from "svelte/store";
import { gameStore, type GameStoreState } from "../../stores/game";
import { seasonStore, type SeasonStoreState } from "../../stores/season";
import type { MasterState } from "../../stores/master";
import { buildLeagueDigest, DIGEST_WEEKS, LEAGUE_NAMES } from "./digest";
import { buildInjuryNews, isInjuryNewsWeek } from "./injuryNews";
import { buildMyBodyReport } from "./myBodyReport";
import { gameResultsTableMeta } from "../../utils/dashboardMeta";
import { tableCopy } from "../../utils/dashboardCopy";
import type { BankPicker } from "../../utils/reportCopy";

/** 옮기기 전 지역 변수를 그대로 담은 인자 묶음 — 이름이 본문과 같아야 한다 */
export interface WeeklyNewsArgs {
  weekNum: number;
  weekInYear: number;
  /** 「업적 체크」 자리에서 읽은 스냅샷 셋 — 안에서 다시 읽으면 뜻이 바뀐다 */
  gFinal: GameStoreState;
  sFinal: SeasonStoreState;
  mFinal: MasterState;
  /** 문안 은행 — 훈련·부상·내 몸 셋이 **같은 것**을 쓴다 */
  reportPicker: BankPicker;
}

export function runWeeklyNews({
  weekNum,
  weekInYear,
  gFinal,
  sFinal,
  mFinal,
  reportPicker,
}: WeeklyNewsArgs): void {
  // 주차 → 월 레이블 헬퍼
  function weekToMonthLabel(wk: number): string {
    const d = new Date(`${sFinal.seasonYear}-03-01`);
    d.setDate(d.getDate() + (wk - 1) * 7);
    return `${d.getMonth() + 1}월`;
  }

  // ── 주인공 리그 전주 NPC 경기 결과 메시지 ─────────────────────
  if (weekNum > 1) {
    const sAfterSim = get(seasonStore);
    const teamById = new Map(mFinal.teams.map((t) => [t.id, t.name]));

    // ⚠ 관계도와 **같은 한 칸 어긋남**이었다. 위 주석대로 "전주"가 맞는데
    // 필터는 `weekNum`을 봤다 — 막 들어선 주라 결과가 없어서 이 소식은
    // **한 통도 온 적이 없다**(실측 `measure:relations`, `league-results` 0건).
    const myGames = sAfterSim.schedule.filter(
      (e) => e.week === weekNum - 1 && !e.isProtagonistGame && !!e.result,
    );
    if (myGames.length > 0) {
      const leagueName = LEAGUE_NAMES[gFinal.protagonist.leagueId] ?? gFinal.protagonist.leagueId;
      const monthLabel = weekToMonthLabel(weekNum);
      const lines = myGames.map((e) => {
        const home = teamById.get(e.homeTeamId) ?? e.homeTeamId;
        const away = teamById.get(e.awayTeamId) ?? e.awayTeamId;
        const r = e.result!;
        return `${away} ${r.awayScore} : ${r.homeScore} ${home}`;
      });
      // 🔴 **본문은 한 줄이다** (U6② · 2026-09-07 · 사용자). 값은 아래 표가
      //   든다 — 본문에도 같은 줄을 실으면 화면에 **두 번** 나온다.
      //   2026-09-04 에 다른 다섯 자리를 이 규칙으로 줄였는데(`dashboardMeta34`
      //   §본문) 여기만 **본문에 값 줄밖에 없어** 남길 문장이 없었다.
      //   새 말을 짓지 않는 규칙이라 미뤘고, 이제 문안이 그 한 줄을 갖는다
      //   (`dashboard_labels.json` `table.leagueResults.lead`).
      //
      // ⚠ **폴백은 문안이 없을 때만이다.** 문안을 못 읽으면 빈 본문이 되어
      //   소식함에서 「내용 없음」과 구분이 안 된다 — 그때만 값 줄을 남긴다.
      const lead = tableCopy(mFinal.dashboardLabels, "leagueResults").lead;
      gameStore.addMessage({
        id: `msg-league-results-${sFinal.seasonYear}-w${weekNum}`,
        category: "system",
        sender: "리그 사무국",
        subject: `${monthLabel} ${leagueName} 경기 결과`,
        preview: lines[0] ?? "",
        body: lead || lines.join("\n"),
        // 경기마다 열이 같다 — 표로도 싣는다 (PLAN_MESSAGE_DASHBOARDS §1-1 · 묶음 2).
        // ⚠ **본문 줄 순서(원정 먼저)와 표 열 순서(홈 먼저)가 다르다.** 열 순서는
        //   문안이 정한다 — 본문을 표에 맞춰 고치면 텍스트 폴백이 바뀐다
        metadata: gameResultsTableMeta(
          myGames.map((e) => ({
            homeName: teamById.get(e.homeTeamId) ?? e.homeTeamId,
            awayName: teamById.get(e.awayTeamId) ?? e.awayTeamId,
            homeScore: e.result!.homeScore,
            awayScore: e.result!.awayScore,
            mine:
              e.homeTeamId === gFinal.protagonist.teamId ||
              e.awayTeamId === gFinal.protagonist.teamId,
          })),
        ),
        createdAt: `W${weekNum}`,
        readAt: null,
      });
    }
  }

  // ── 야구계 소식 (통합 다이제스트) ────────────────────────────
  //
  // **같은 성격의 소식 네 갈래를 한 통으로 합쳤다** (2026-08-08).
  // 실측 `measure:messagekinds` 6시즌 기준 고교 62.3통/시즌 · 프로 28.0통/시즌:
  //
  //   msg-neighbor   고교 매주      무작위 1권역+1리그 선두 두 줄
  //   msg-myrank     고교 월 1회    내 권역·전국 순위
  //   msg-hs-digest  고교2~3 분기   5리그 선두/최하위 + 스카우트
  //   msg-standings  프로 4주마다   리그당 한 통, 전체 순위표
  //
  // 넷이 각자 주기를 들고 있어 네 박자로 왔고, **제일 잘 만든 형식(다이제스트)이
  // 고교 2~3학년에만** 있었다. 프로가 되면 리그당 한 통으로 다시 쪼개지면서
  // 정작 내 리그는 안 왔다(`lid === myLeagueId`로 건너뛰었다).
  if (DIGEST_WEEKS.has(weekInYear)) {
    const sAfterSim = get(seasonStore);
    const teamById = new Map(mFinal.teams.map((t) => [t.id, t.name]));
    // 권역 표시명은 refs의 구장 이름에서 나온다 — 손으로 표를 만들면 빠뜨린다.
    // "한라구장" 그대로면 "한라구장 3위"가 되어 어색하니 접미를 권역으로 바꾼다
    const stadiumById = new Map(mFinal.stadiums.map((x) => [x.id, x.name]));

    // ⚠ 시즌이 끝난 리그는 빼야 한다 — 안 그러면 겨울에도 순위표가 온다.
    // 기존 월간 순위표에 있던 `lastGameWeek` 게이트를 그대로 옮긴 것이다
    const isLeagueActive = (lid: string) => {
      const sched = sAfterSim.leagueSchedules[lid] ?? [];
      const lastGameWeek = sched.reduce((mx, e) => Math.max(mx, e.week), 0);
      return lastGameWeek === 0 || weekInYear <= lastGameWeek;
    };

    const digest = buildLeagueDigest({
      weekNum,
      seasonYear: sAfterSim.seasonYear,
      monthLabel: weekToMonthLabel(weekNum),
      careerStage: gFinal.protagonist.careerStage,
      hsGrade:
        gFinal.protagonist.careerStage === "highschool"
          ? (gFinal.protagonist.grade ?? 1)
          : undefined,
      myTeamId: gFinal.protagonist.teamId,
      myLeagueId: gFinal.protagonist.leagueId,
      leagueState: sAfterSim.leagueState,
      // ⚠ **내 리그 순위표는 여기 있다.** `leagueState`엔 내가 안 뛰는 리그만
      // 들어 있어서, 거기서 읽으면 프로 다이제스트에 내 순위가 통째로 빠진다
      myStandings: sAfterSim.standings,
      teamName: (id: string) => teamById.get(id) ?? id,
      regionName: (id: string) => {
        const nm = stadiumById.get(id);
        return nm ? `${nm.replace(/구장$/, "")}권역` : `${id.replace(/^STADIUM_/, "")}권역`;
      },
      scoutScore: gFinal.protagonist.scoutScore ?? 0,
      isLeagueActive,
      // 지난 달 순위 — 변동 열의 재료 (PLAN_MESSAGE_DASHBOARDS §3-1 (나)).
      // 첫 달·첫 시즌엔 없고, 그러면 변동을 아예 안 그린다
      prevStandings: sAfterSim.standingsSnapshots?.[gFinal.protagonist.leagueId]?.last_digest,
    });
    if (digest) {
      gameStore.addMessage(digest);
      // 🔴 **소식을 보낸 뒤에 덮는다.** 앞에 두면 이번 달 순위와 자기 자신을
      //   견주게 되어 변동이 늘 0 이다. 안 보낸 달은 안 덮는다 — 다음 달이
      //   「마지막으로 본 순위」와 견주는 게 맞다
      seasonStore.captureStandingsSnapshot("last_digest", gFinal.protagonist.leagueId);
    }
  }

  // ── 월간 부상 리포트 ────────────────────────────────────────
  //
  // ⚠ **커리어 단계를 안 가린다.** 다이제스트도 이제 안 가리지만, 부상은
  // 주기가 다르다 — 같은 학교 동료가 빠지면 내 출전이 바뀐다.
  if (isInjuryNewsWeek(weekInYear)) {
    const buffered = seasonStore.drainInjuryNews();
    const news = buildInjuryNews({
      events: buffered,
      weekNum,
      weekInYear,
      season: get(seasonStore),
      monthLabel: weekToMonthLabel(weekNum),
      subjectBank: { copy: mFinal.reportCopy, picker: reportPicker },
    });
    if (news) gameStore.addMessage(news);

    // ── 주인공 몸 상태 (같은 주기) ──────────────────────────────
    //
    // ⚠ **버퍼를 반드시 비운다.** 리포트를 안 보내도(담을 게 없어 null이어도)
    // drain은 해야 한다 — 안 그러면 다음 달 리포트에 지난달 경고가 섞인다.
    const myEvents = seasonStore.drainMyBodyEvents();
    const inj = gFinal.protagonist.injury;
    const teamByIdMB = new Map(mFinal.teams.map((t) => [t.id, t.name]));
    const myBody = buildMyBodyReport(
      myEvents,
      inj
        ? {
            injuryType: inj.type,
            severity: inj.severity,
            recoveryWeeksLeft: inj.recoveryWeeksLeft,
            // ⚠ `InjuryState`에 **발생 주차가 없다.** 지어내지 않고 전체 기간에서
            // 되짚는다 — 치료로 기간이 바뀌면 어긋날 수 있어 표시만 쓴다
            sinceWeek: Math.max(1, weekNum - (inj.totalRecoveryWeeks - inj.recoveryWeeksLeft)),
          }
        : null,
      weekNum,
      sFinal.seasonYear,
      weekToMonthLabel(weekNum),
      (id) => teamByIdMB.get(id) ?? id,
      { copy: mFinal.reportCopy, picker: reportPicker },
    );
    if (myBody) gameStore.addMessage(myBody);
  }

  // 🔴 **뽑은 인덱스를 세이브로 되돌린다** (C2). 안 되돌리면 「직전 제외」가
  //   매주 초기화돼 같은 제목이 연속으로 난다 — 이벤트 본문 은행이
  //   `recordSentencePicks` 로 먼저 그은 선이고, 같은 칸을 쓴다.
  // ⚠ **위 세 리포트를 다 만든 뒤다.** 앞에 두면 이번 주 훈련 제목만 남고
  //   부상·내 몸이 뽑은 것은 안 남는다.
  if (Object.keys(reportPicker.picks).length > 0) {
    seasonStore.recordSentencePicks(reportPicker.picks);
  }
}
