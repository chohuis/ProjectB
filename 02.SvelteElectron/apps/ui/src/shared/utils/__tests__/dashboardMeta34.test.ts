import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  barsCopy, cardsCopy, parseDashboardLabels, tableCopy, tableLabelBlock,
} from "../dashboardCopy";
import { buildBars, buildCards, buildRankList, buildTableView } from "../dashboardView";
import {
  bracketTableMeta, cardsMeta, coachReportTableMeta, faCompTableMeta, faMarketTableMeta,
  examBarsMeta, militaryAnnualTableMeta, militaryRecordTimelineMeta, pctSub, rankListMeta,
  rowsTableMeta, semesterBarsMeta, teamMoodTableMeta, timelineMeta,
} from "../dashboardMeta";
import {
  buildOpenMessage, buildMyRoundMessage, buildChampionMessage, buildRoundProgressMessage,
} from "../../usecases/weekPhases/tournamentNews";
import type { RankListMetadata, TableMetadata } from "../../types/main";

/**
 * 소식 생산부 배열화 — **묶음 3·4** (A 단위 5 · PLAN_MESSAGE_DASHBOARDS §1·§3).
 *
 * 🔴 **형태는 셋뿐이다.** 화면이 그리는 갈래는 `table`·`rankList`·`timeline`
 *    이고(`NewsPage` 실측 2026-09-03) 막대·카드는 그릴 자리가 없다 — 문안만
 *    있다. 그래서 생산부도 그 셋으로만 낸다.
 *
 * ⚠ **본문이 표로 안 옮겨지는 자리엔 metadata 를 안 싣는다.** 표시부가 본문을
 *   **대신** 그리므로(`StatTable` 머리말) 안내가 든 본문에 표를 붙이면 그
 *   안내가 화면에서 사라진다 — 어느 자리가 그런지는 `HANDOFF_A_TO_C.md` 다.
 *
 * 🔴 여기서 **열 이름을 적지 않는다.** 기대값은 문안 파일에서 읽어 온다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(p, "utf8");
const MASTER = resolve(ROOT, "resource/data/master");

const labels = parseDashboardLabels(
  JSON.parse(read(resolve(MASTER, "messages/dashboard_labels.json"))),
);

const SRC_TOUR = resolve(__dirname, "../../usecases/weekPhases/tournamentNews.ts");
const SRC_ROLL = resolve(__dirname, "../../usecases/seasonRollover.ts");
const SRC_MARKET = resolve(__dirname, "../../usecases/weekPhases/market.ts");
const SRC_WEEK = resolve(__dirname, "../../usecases/advanceWeek.ts");

const bracketRow = (round: string, home: string, away: string, week: number, mine = false) =>
  ({ round, homeName: home, awayName: away, date: `W${week}`, mine });

describe("묶음 3 — 대진·순위", () => {
  it("대진 — 행이 경기 한 짝이고 내 팀만 강조가 붙는다", () => {
    const md = bracketTableMeta("tourOpen", [
      bracketRow("8강", "한성고", "기흥고", 21, true),
      bracketRow("8강", "부산고", "대구고", 21),
    ]);
    expect(md.kind).toBe("tourOpen");
    expect(md.rows).toHaveLength(2);
    expect(md.rows[0].myTeam).toBe(true);
    // 강조가 없는 행에는 **키 자체가 없다** — `false` 를 실으면 화면이
    // 「내 팀이 아니다」와 「모른다」를 못 가린다
    expect("myTeam" in md.rows[1]).toBe(false);
    const view = buildTableView(md, tableCopy(labels, "tourOpen"));
    expect(view.columns.map((c) => c.key)).toEqual(["round", "home", "away", "date"]);
    expect(view.rows[0].highlight).toBe(true);
    expect(view.rows[1].highlight).toBe(false);
  });

  it("대진 — 두 팀 칸은 문안이 머리글을 비워 둔다", () => {
    const view = buildTableView(
      bracketTableMeta("tourRound", [bracketRow("4강", "한성고", "기흥고", 24)]),
      tableCopy(labels, "tourRound"),
    );
    const byKey = new Map(view.columns.map((c) => [c.key, c.label]));
    expect(byKey.get("home")).toBe("");
    expect(byKey.get("away")).toBe("");
    expect(byKey.get("round")).toBe(labels!.table.tourRound.columns!.round);
  });

  it("순위 — 등수는 순서다", () => {
    const md = rankListMeta("tourChamp", [{ label: "한성고" }, { label: "기흥고" }]);
    expect(md.type).toBe("rankList");
    expect(md.items.map((i) => i.rank)).toEqual([1, 2]);
    expect(md.items[0].label).toBe("한성고");
    // 없는 값은 키를 안 만든다 — 변동은 견줄 지난 값이 없다 (§3-1)
    expect("sub" in md.items[0]).toBe(false);
    expect("isMe" in md.items[0]).toBe(false);
    expect("delta" in md.items[0]).toBe(false);
    expect(buildRankList(md).columns[0].entries[0].delta).toBeNull();
  });

  it("순위 — 수상은 사람이 큰 글씨, 상 이름이 작은 글씨다", () => {
    const md = rankListMeta("tourAward", [
      { label: "김철수", sub: "대회 MVP 타율 .420", isMe: true },
    ]);
    expect(md.items[0].sub).toBe("대회 MVP 타율 .420");
    const view = buildRankList(md);
    expect(view.columns[0].entries[0].name).toBe("김철수");
    expect(view.columns[0].entries[0].isMe).toBe(true);
  });

  it("순위 — 2군 최종 순위는 승률을 작은 글씨로 든다", () => {
    expect(pctSub(0.6333)).toBe(".633");
    expect(pctSub(1)).toBe("1.000");
    const md = rankListMeta("farmChampion", [
      { label: "부산 웨이브스", sub: pctSub(0.62) },
      { label: "서울 라이온즈", sub: pctSub(0.58) },
    ]);
    expect(md.items[1].rank).toBe(2);
    expect(md.items[1].sub).toBe(".580");
  });
});

describe("묶음 4 — 타임라인·FA 보상", () => {
  it("타임라인 — 실어 보낸 차례 그대로다", () => {
    const md = timelineMeta("seasonHsSync", [
      { when: "2026", label: "3승 1패 ERA 2.41", detail: "4/12" },
      { when: "2027", label: "8승 2패 ERA 1.98" },
    ]);
    expect(md.type).toBe("timeline");
    expect(md.entries.map((e) => e.when)).toEqual(["2026", "2027"]);
    expect(md.entries[0].detail).toBe("4/12");
    expect("detail" in md.entries[1]).toBe(false);
  });

  it("FA 보상 — 없는 항목은 행이 없고 등급에 낱말을 안 붙인다", () => {
    const full = faCompTableMeta({ grade: "A", money: 30000, playerName: "이영호" });
    expect(full.rows.map((r) => r.item)).toEqual(["grade", "money", "playerId"]);
    expect(full.rows[0].value).toBe("A");
    const moneyOnly = faCompTableMeta({ grade: "B", money: 12000, playerName: null });
    expect(moneyOnly.rows.map((r) => r.item)).toEqual(["grade", "money"]);
    const gradeOnly = faCompTableMeta({ grade: "C", money: 0 });
    expect(gradeOnly.rows.map((r) => r.item)).toEqual(["grade"]);
    const view = buildTableView(full, tableCopy(labels, "faComp"));
    expect(view.rows[0].cells[0].text).toBe(labels!.table.faComp.rows!.grade);
  });

  it("행 표 — 부르는 쪽 배열을 안 물고 간다", () => {
    const rows = [{ round: "8강", opp: "기흥고", result: "승리" }];
    const md = rowsTableMeta("tourMy", rows);
    md.rows[0].result = "패배";
    expect(rows[0].result).toBe("승리");
  });
});

// ── 소식을 실제로 만들어 본다 (순수 함수라 화면이 필요 없다) ────
describe("대회 소식 넷", () => {
  const def = {
    id: "TOUR_HS_ROSE", name: "장미기", flower: "장미",
    leagueId: "LEAGUE_HIGHSCHOOL", startWeek: 18, endWeek: 22,
  } as unknown as Parameters<typeof buildOpenMessage>[0];

  const match = (
    id: string, round: number, slot: number,
    home: string | null, away: string | null, winner: string | null, week = 20,
  ) => ({
    id, round, slot, week, gameDate: `2026-05-${10 + week}`,
    homeTeamId: home, awayTeamId: away, isBye: false, winnerTeamId: winner,
    isProtagonistGame: false,
  });

  const bracket = {
    tournamentId: def.id, leagueId: def.leagueId, seasonYear: 2026,
    bracketSize: 4, totalRounds: 2, byeCount: 0,
    matches: [
      match("m1", 1, 0, "TEAM_A", "TEAM_B", "TEAM_A"),
      match("m2", 1, 1, "TEAM_C", "TEAM_D", "TEAM_C"),
      match("m3", 2, 0, "TEAM_A", "TEAM_C", "TEAM_A", 21),
    ],
  } as unknown as Parameters<typeof buildChampionMessage>[1];

  const tName = (id: string) => `${id.replace("TEAM_", "")}고`;

  it("개막 — 대진이 있으면 1라운드가 표로 실리고 본문은 그대로다", () => {
    const msg = buildOpenMessage(
      def, ["TEAM_A", "TEAM_B", "TEAM_C", "TEAM_D"], "TEAM_B", 18, 2026, bracket, tName);
    const md = msg.metadata as TableMetadata;
    expect(md.kind).toBe("tourOpen");
    expect(md.rows).toHaveLength(2);
    expect(md.rows[0].away).toBe("B고");
    expect(md.rows[0].myTeam).toBe(true);
    expect(md.rows[0].date).toBe("W20");
    // 본문 폴백 — 표를 못 그리는 자리에서 글자가 남아야 한다
    expect(msg.body.includes("■ 참가")).toBe(true);
  });

  it("개막 — 대진이 없으면(조별예선) metadata 를 안 싣는다", () => {
    const msg = buildOpenMessage(def, ["TEAM_A"], "TEAM_A", 18, 2026, null, tName);
    expect(msg.metadata).toBeUndefined();
    expect(msg.body.length > 0).toBe(true);
  });

  it("내 경기 — 라운드·상대·결과 한 줄", () => {
    const msg = buildMyRoundMessage(def, bracket, 1, "TEAM_A", tName, 20);
    const md = msg!.metadata as TableMetadata;
    expect(md.kind).toBe("tourMy");
    expect(md.rows).toHaveLength(1);
    expect(md.rows[0].opp).toBe("B고");
    // 점수 열은 값이 없다 — 브래킷에 점수가 없다(`BracketMatch`)
    const view = buildTableView(md, tableCopy(labels, "tourMy"));
    expect(view.columns.map((c) => c.key)).toEqual(["round", "opp", "result"]);
  });

  it("우승 — 최종 순위 둘", () => {
    const msg = buildChampionMessage(def, bracket, "TEAM_B", tName, 21);
    const md = msg!.metadata as RankListMetadata;
    expect(md.kind).toBe("tourChamp");
    expect(md.items.map((i) => i.label)).toEqual(["A고", "C고"]);
    expect(msg!.body.includes("우승")).toBe(true);
  });

  it("라운드 진출 — 다음 라운드 대진이 실린다", () => {
    const msg = buildRoundProgressMessage(def, bracket, 1, "TEAM_X", tName, 20);
    const md = msg!.metadata as TableMetadata;
    expect(md.kind).toBe("tourRound");
    expect(md.rows).toHaveLength(1);
    expect(md.rows[0].round).toBe("결승");
    expect(msg!.body.includes("진출")).toBe(true);
  });
});

describe("배선과 본문", () => {
  it("자리 넷이 배선돼 있다 — 2군 우승 · 고교 연감 · FA 보상 · 대회 수상", () => {
    expect(read(SRC_ROLL).includes('rankListMeta("farmChampion"')).toBe(true);
    expect(read(SRC_ROLL).includes('timelineMeta("seasonHsSync"')).toBe(true);
    expect(read(SRC_MARKET).includes("faCompTableMeta(")).toBe(true);
    expect(read(SRC_WEEK).includes('rankListMeta("tourAward"')).toBe(true);
  });

  it("본문 문자열이 한 줄도 안 없어졌다", () => {
    expect(read(SRC_ROLL).includes("고교 시즌 종료 동기화가 완료되었습니다.")).toBe(true);
    expect(read(SRC_ROLL).includes("정규리그가 종료되었습니다.")).toBe(true);
    expect(read(SRC_MARKET).includes("보상선수  없음(보상금만)")).toBe(true);
    expect(read(SRC_TOUR).includes("여기서 대회를 마친다.")).toBe(true);
  });

  it("고교 연감은 세계 처리 뒤에 만든다 — 올해 줄이 빠지지 않게", () => {
    const src = read(SRC_ROLL);
    const roll = src.indexOf("await runWorldSeasonEnd(now);");
    const yearbook = src.indexOf("msg-season-hs-sync-");
    expect(roll > 0).toBe(true);
    expect(yearbook > roll).toBe(true);
  });

  it("전·후반기 스냅샷이 내 리그도 뜬다", () => {
    const src = read(SRC_WEEK);
    const at = src.indexOf("snapshotDueAt(nextWeekNum)");
    expect(at > 0).toBe(true);
    expect(src.slice(at, at + 400)
      .includes("captureStandingsSnapshot(key, get(gameStore).protagonist.leagueId)")).toBe(true);
  });
});

// ── 문안 칸 — 막대·카드도 같은 창구로 찾는다 ──────────────────
describe("문안 칸", () => {
  it("뿌리를 달고 온 kind 는 그 칸에서 찾는다", () => {
    // 뿌리가 없으면 표 칸이다 — 소식 19자리가 그렇게 온다
    expect(tableLabelBlock(labels, "digest")).toBeTruthy();
    expect(tableLabelBlock(labels, "bars.exam")).toBeTruthy();
    expect(tableLabelBlock(labels, "cards.seasonBrief")).toBeTruthy();
    expect(tableLabelBlock(labels, "timeline.milRecord")).toBeTruthy();
    expect(tableLabelBlock(labels, "rankList.tourChamp")).toBeTruthy();
    expect(tableLabelBlock(labels, "없는칸")).toBeNull();
    // ⚠ 뿌리를 빼면 못 찾는다 — 생산부가 kind 에 뿌리를 달아야 한다
    expect(tableLabelBlock(labels, "exam")).toBeNull();
  });

  it("labels 하나뿐인 칸은 열 이름과 항목 이름 양쪽에 걸린다", () => {
    const copy = tableCopy(labels, "cards.friendlyPlan");
    const declared = labels!.cards.friendlyPlan.labels as Record<string, string>;
    expect(copy.columns.week).toBe(declared.week);
    expect(copy.rows.week).toBe(copy.columns.week);
    // `columns` 를 따로 적은 칸에는 labels 가 안 끼어든다
    expect(tableCopy(labels, "digest").rows).toEqual({});
  });
});

// ══ B-35 로 문안이 코드에 맞춰진 자리 여덟 ═══════════════════════
//
// 문안(`277b4cafd`)이 코드가 든 값으로 다시 적혔다. 여기서는 **생산부가 그
// 새 키를 그대로 쓰는지** 와 **낱말을 안 싣는지**를 본다.
describe("B-35 새 키", () => {
  it("팀 분위기 — 사람 수 셋. 관계값은 안 싣는다", () => {
    const md = teamMoodTableMeta(12, 4, 1);
    expect(md.kind).toBe("bars.teamMood");
    expect(md.rows.map((r) => r.item)).toEqual(["total", "cold", "hostile"]);
    // 불신 0명도 줄이 남는다 — 「없다」와 「안 셌다」는 다르다
    expect(teamMoodTableMeta(9, 2, 0).rows).toHaveLength(3);
    const view = buildTableView(md, tableCopy(labels, "bars.teamMood"));
    expect(view.rows[1].cells[0].text).toBe(labels!.bars.teamMood.rows!.cold);
  });

  it("연간 병역 — 구분은 키로 싣고 화면이 이름을 붙인다", () => {
    const md = militaryAnnualTableMeta([
      { kind: "sports", names: ["김철수", "이영호"] },
      { kind: "general", names: [] },
      { kind: "discharged", names: ["박민수"] },
    ]);
    // 사람이 없는 구분은 행이 없다
    expect(md.rows.map((r) => r.kind)).toEqual(["sports", "discharged"]);
    expect(md.rows[0].count).toBe(2);
    const copy = tableCopy(labels, "timeline.militaryAnnual");
    const view = buildTableView(md, copy);
    expect(view.columns.map((c) => c.key)).toEqual(["kind", "count", "names"]);
    expect(view.rows[0].cells[0].text, "구분이 키로 그려지면 안 된다")
      .toBe(copy.kindLabel.sports);
  });

  it("FA 마감 — 미계약 0명이면 줄이 없다", () => {
    const md = faMarketTableMeta({ total: 12, moved: 5, stayed: 7, unsigned: 0 });
    expect(md.rows.map((r) => r.item)).toEqual(["total", "moved", "stayed"]);
    expect(faMarketTableMeta({ total: 12, moved: 5, stayed: 6, unsigned: 1 })
      .rows.map((r) => r.item)).toEqual(["total", "moved", "stayed", "unsigned"]);
  });

  it("코치 리포트 — 지표 이름을 안 싣는다", () => {
    const md = coachReportTableMeta([
      { key: "velocity", value: 142, delta: 2 },
      { key: "command", value: 55 },
      { key: "morale", value: 70, delta: 0 },
    ]);
    expect(md.rows.map((r) => r.name)).toEqual(["velocity", "command", "morale"]);
    // 변화가 없거나 모르면 칸을 안 만든다
    expect(md.rows[0].delta).toBe(2);
    expect("delta" in md.rows[1]).toBe(false);
    expect("delta" in md.rows[2]).toBe(false);
    const copy = tableCopy(labels, "coachReport");
    const view = buildTableView(md, copy);
    expect(view.rows[0].cells[0].text, "화면이 이름을 붙인다").toBe(copy.rows.velocity);
  });

  it("카드 — 값이 키인 자리는 키로 싣는다", () => {
    const md = cardsMeta("cards.scoutDay", [
      { key: "total", value: 120 },
      { key: "route", value: "recommend" },
      { key: "standout", value: true },
    ]);
    expect(md.items.map((i) => i.value)).toEqual([120, "recommend", true]);
    const view = buildCards(md, cardsCopy(labels, "cards.scoutDay"));
    expect(view.cards[1].value, "초청 경로는 문안이 말로 바꾼다").toBe("팀 추천");
    const decl = labels!.cards.scoutDay.labels as Record<string, string>;
    expect(view.cards[0].caption).toBe(decl.total);
  });

  it("카드 — 문안에 없는 값은 폴백이다", () => {
    const view = buildCards(
      cardsMeta("cards.showcase", [{ key: "route", value: "club_pick" }]),
      cardsCopy(labels, "cards.showcase"));
    expect(view.cards[0].value).toBe(labels!.cards.showcase.routeFallback);
  });

  it("여덟 자리가 배선돼 있고 제목에서 대시를 뺐다", () => {
    const REL = resolve(__dirname, "../relationMessages.ts");
    const CAMPUS = resolve(__dirname, "../../usecases/campusEvents.ts");
    expect(read(REL).includes("teamMoodTableMeta(total, cold, hostile)")).toBe(true);
    expect(read(SRC_ROLL).includes("militaryAnnualTableMeta(")).toBe(true);
    expect(read(SRC_ROLL).includes('playerListTableMeta("resign"')).toBe(true);
    expect(read(SRC_MARKET).includes("faMarketTableMeta(")).toBe(true);
    expect(read(SRC_WEEK).includes("coachReportTableMeta(")).toBe(true);
    expect(read(CAMPUS).includes('cardsMeta("cards.scoutDay"')).toBe(true);
    expect(read(CAMPUS).includes('cardsMeta("cards.showcase"')).toBe(true);
    expect(read(CAMPUS).includes('cardsMeta("cards.allstar"')).toBe(true);
    // 🔴 제목이 표·카드가 든 값을 또 적지 않는다 (OP ③)
    expect(read(SRC_MARKET).includes("FA 시장 마감 — ${signings.length}")).toBe(false);
    expect(read(CAMPUS).includes("전국대학선수쇼케이스 — ${res.total}")).toBe(false);
    expect(read(CAMPUS).includes("고교 스카우트 데이 — ${res.total}")).toBe(false);
    // 자동 진행 로그(autoLog)에는 남는다 — 화면에 안 뜨는 개발용 줄이라 안 본다
    expect(read(CAMPUS).includes("subject: `${year} 대학 올스타전 — ")).toBe(false);
  });
});

// ══ §0.6 다섯 — 본문+패널이 같이 그려진 뒤 (C 49c337788) ═════════
describe("§0.6 다섯", () => {
  it("시험 — 고교는 과목 백분위, 대학은 학점이고 눈금이 다르다", () => {
    const hs = examBarsMeta({
      kor: { percentile: 13 }, math: { percentile: 29 },
    });
    expect(hs.kind).toBe("bars.exam");
    expect(hs.bars.map((b) => b.key)).toEqual(["kor", "math"]);
    // 과목 이름을 안 싣는다 — 문안이 붙인다
    expect(hs.bars[0].label).toBeUndefined();
    const hsView = buildBars(hs, barsCopy(labels, "bars.exam"));
    expect(hsView.bars[0].label).toBe(
      (labels!.bars.exam.subjects as Record<string, string>).kor);
    expect(hsView.bars[0].pct, "0~100 눈금이다").toBe(13);

    const uni = semesterBarsMeta(3.4, 3.12);
    expect(uni.kind).toBe("bars.exam.byStage.university");
    const uniView = buildBars(uni, barsCopy(labels, "bars.exam.byStage.university"));
    expect(uniView.bars[0].pct, "0~4.5 눈금이라 3.4 는 76%").toBe(76);
    expect(uniView.foot[0].value).toBe("3.12");
  });

  it("군 경력 — 성과만 시간 순이다", () => {
    const md = militaryRecordTimelineMeta([
      { week: 40, note: "혹한기 3등급" }, { week: 12, note: "사격 2등급" },
    ]);
    expect(md.kind).toBe("timeline.milRecord");
    expect(md.entries.map((e) => e.when)).toEqual(["W12", "W40"]);
    expect(md.entries[0].label).toBe("사격 2등급");
    expect(militaryRecordTimelineMeta([]).entries).toHaveLength(0);
  });

  it("시즌 브리핑 — 보직은 눈금 키고 문안이 조사를 붙인다", () => {
    const md = cardsMeta("cards.seasonBrief", [{ key: "role", value: "RP" }]);
    const copy = cardsCopy(labels, "cards.seasonBrief");
    expect(buildCards(md, copy).note).toContain(labels!.roleAs.RP);
    // 낱말을 실으면 굴절표를 못 찾아 그 줄이 통째로 사라진다
    expect(buildCards(cardsMeta("cards.seasonBrief",
      [{ key: "role", value: "중계" }]), copy).note).toBe("");
  });

  it("다섯 자리가 배선돼 있다", () => {
    const NATL = resolve(__dirname, "../../usecases/nationalTeam.ts");
    const FRIENDLY = resolve(__dirname, "../friendlyMatchEngine.ts");
    const MIL = resolve(__dirname, "../../usecases/militaryDecision.ts");
    expect(read(SRC_WEEK).includes("examBarsMeta(")).toBe(true);
    expect(read(SRC_WEEK).includes("semesterBarsMeta(")).toBe(true);
    expect(read(SRC_WEEK).includes('cardsMeta("cards.seasonBrief"')).toBe(true);
    expect(read(NATL).includes('cardsMeta("cards.natlSquad"')).toBe(true);
    expect(read(FRIENDLY).includes('cardsMeta("cards.friendlyPlan"')).toBe(true);
    expect(read(MIL).includes("militaryRecordTimelineMeta(")).toBe(true);
  });
});
