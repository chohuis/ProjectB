import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PitcherSeasonStats } from "../../types/save";
import { primeContractRules } from "../contractTerms";
import { parseDashboardLabels, tableCopy } from "../dashboardCopy";
import { buildTableView } from "../dashboardView";
import {
  standingsTableMeta, pitcherSeasonTableMeta, contractTableMeta,
  gameResultsTableMeta, myGameTableMeta, tradeTableMeta, playerListTableMeta, lockNoteOf,
} from "../dashboardMeta";

/**
 * 소식 생산부 배열화 — 묶음 1 (A 단위 5 · PLAN_MESSAGE_DASHBOARDS §1·§3).
 *
 * ⚠ **화면을 안 띄운다.** 생산부가 만든 `metadata` 를 C 가 만든 화면 쪽
 * 함수(`buildTableView`)에 그대로 넣어 **표가 서는지**까지 본다 — 두 쪽이
 * 실제로 맞물리는지는 그렇게만 잴 수 있다.
 *
 * 🔴 여기서 **열 이름을 적지 않는다.** 기대값은 문안 파일에서 읽어 온다 —
 * 검사가 「승」 을 적어 두면 그것도 두 벌째가 된다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(p, "utf8");
const MASTER = resolve(ROOT, "resource/data/master");

const labels = parseDashboardLabels(
  JSON.parse(read(resolve(MASTER, "messages/dashboard_labels.json"))),
);
const rulesFile = JSON.parse(read(resolve(MASTER, "players/generation_rules.json"))) as Record<string, never>;

const SRC_DIGEST   = resolve(__dirname, "../../usecases/weekPhases/digest.ts");
const SRC_WEEK     = resolve(__dirname, "../../usecases/advanceWeek.ts");
const SRC_CONTRACT = resolve(__dirname, "../../usecases/contractDecision.ts");
const SRC_SNAPSHOT = resolve(__dirname, "../standingsSnapshot.ts");
const SRC_POST     = resolve(__dirname, "../../stores/postseason.ts");

beforeAll(() => { primeContractRules(rulesFile); });

const team = (id: string, w: number, l: number, d = 0, streak = "") => ({
  teamId: id, teamName: `${id}팀`, wins: w, losses: l, draws: d,
  winPct: w + l > 0 ? w / (w + l) : 0, streak,
});

const stats = (o: Partial<PitcherSeasonStats>): PitcherSeasonStats => ({
  type: "pitcher", g: 0, gs: 0, w: 0, l: 0, sv: 0, hd: 0, ip: 0, er: 0, h: 0,
  bb: 0, k: 0, hb: 0, era: 0, whip: 0, ...o,
} as PitcherSeasonStats);

// ── ① 문안이 있다 ────────────────────────────────────────────
describe("문안", () => {
  it("dashboard_labels.json 을 읽는다", () => {
    expect(labels).toBeTruthy();
  });

  it("묶음 1 의 종류 넷이 선언돼 있다", () => {
    for (const k of ["digest", "seasonEndPro", "seasonEndIndie", "contractSigned", "faSigned"]) {
      expect(Object.keys(labels!.table)).toContain(k);
    }
  });
});

// ── ② 순위표 ─────────────────────────────────────────────────
describe("순위표 (msg-digest-)", () => {
  const rows = [team("A", 30, 10), team("B", 25, 15), team("C", 10, 30)];

  it("순위는 넘긴 순서다 — 여기서 다시 정렬하지 않는다", () => {
    const md = standingsTableMeta({ rows, myTeamId: "B" });
    expect(md.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(md.rows[1].myTeam).toBe(true);
    expect(md.rows[0].myTeam).toBeUndefined();
  });

  it("팀 칸에 **이름**이 담긴다 — 화면엔 찾는 자리가 없다", () => {
    const md = standingsTableMeta({ rows, myTeamId: "B" });
    expect(md.rows[0].teamId).toBe("A팀");
  });

  it("지난 순위가 없으면 변동 열을 안 그린다", () => {
    const md = standingsTableMeta({ rows, myTeamId: "B" });
    expect(md.deltaKey).toBeUndefined();
    const view = buildTableView(md, tableCopy(labels, "digest"));
    expect(view.deltaLabel).toBeNull();
  });

  it("지난 순위가 있으면 오른 칸 수로 담는다 — 순위는 작을수록 좋다", () => {
    const prev: Record<string, number> = { A: 3, B: 1, C: 2 };
    const md = standingsTableMeta({ rows, myTeamId: "B", prevRankOf: (t) => prev[t] });
    expect(md.deltaKey).toBe("delta");
    expect(md.rows[0].delta).toBe(2);   // 3위 → 1위
    expect(md.rows[1].delta).toBe(-1);  // 1위 → 2위
  });

  it("모르는 팀만 변동이 없다 — 나머지는 그대로 그린다", () => {
    const md = standingsTableMeta({ rows, myTeamId: "B", prevRankOf: (t) => (t === "A" ? 2 : undefined) });
    expect(md.rows[0].delta).toBe(1);
    expect(md.rows[1].delta).toBeUndefined();
  });

  it("무승부가 한 팀도 없으면 무 열을 안 보낸다", () => {
    const md = standingsTableMeta({ rows, myTeamId: "B" });
    expect(md.rows[0].draws).toBeUndefined();
    const withDraw = standingsTableMeta({ rows: [team("A", 3, 1, 2), team("B", 2, 2)], myTeamId: "A" });
    expect(withDraw.rows[0].draws).toBe(2);
    expect(withDraw.rows[1].draws).toBe(0);
  });

  it("화면이 문안 순서로 표를 세운다 — 열을 안 실어 보냈다", () => {
    const md = standingsTableMeta({ rows, myTeamId: "B" });
    expect(md.columns).toHaveLength(0);
    const view = buildTableView(md, tableCopy(labels, "digest"));
    expect(view.columns.map((c) => c.key)).toEqual(["rank", "teamId", "w", "l", "pct"]);
    // 이름표는 문안에서 온다 — 검사도 파일에서 읽는다
    expect(view.columns[2].label).toBe(labels!.table.digest.columns!.w);
    expect(view.rows).toHaveLength(3);
  });
});

// ── ③ 시즌 성적 ──────────────────────────────────────────────
describe("시즌 성적 (msg-pro-season-end- · msg-indie-season-end-)", () => {
  it("여덟 항목이 항목·값 두 칸으로 갈린다", () => {
    const md = pitcherSeasonTableMeta("seasonEndPro", stats({ w: 12, l: 7, sv: 0, hd: 3, ip: 168.6667, era: 3.21, whip: 1.18, k: 141 }));
    expect(md.rows.map((r) => r.item)).toEqual(["w", "l", "sv", "hd", "ip", "era", "whip", "k"]);
    // 이닝은 야구 표기다 — 화면이 반올림하면 안 된다
    expect(md.rows[4].value).toBe("168.2");
    expect(md.rows[5].value).toBe("3.21");
  });

  it("성적이 없으면 행이 없다 — 문안의 빈 줄이 뜬다", () => {
    const md = pitcherSeasonTableMeta("seasonEndPro", undefined);
    expect(md.rows).toHaveLength(0);
    const view = buildTableView(md, tableCopy(labels, "seasonEndPro"));
    expect(view.empty).toBe(labels!.table.seasonEndPro.empty);
  });

  it("지난해를 안 넘기면 그 열이 안 선다", () => {
    const md = pitcherSeasonTableMeta("seasonEndPro", stats({ w: 5 }));
    const view = buildTableView(md, tableCopy(labels, "seasonEndPro"));
    expect(view.columns.map((c) => c.key)).toEqual(["item", "value"]);
  });

  it("지난해를 넘기면 열이 하나 는다", () => {
    const md = pitcherSeasonTableMeta("seasonEndPro", stats({ w: 5 }), stats({ w: 9 }));
    const view = buildTableView(md, tableCopy(labels, "seasonEndPro"));
    expect(view.columns.map((c) => c.key)).toEqual(["item", "value", "prev"]);
  });

  it("항목 이름은 문안이 붙인다 — metadata 는 키만 든다", () => {
    const md = pitcherSeasonTableMeta("seasonEndIndie", stats({ w: 5 }));
    const view = buildTableView(md, tableCopy(labels, "seasonEndIndie"));
    expect(view.rows[0].cells[0].text).toBe(labels!.table.seasonEndIndie.rows!.w);
  });
});

// ── ④ 계약 조건 ──────────────────────────────────────────────
describe("계약 조건 (msg-contract-signed- · msg-fa-signed-)", () => {
  it("없는 항목은 줄 자체가 없다 — 계약금 0 · 조항 없음", () => {
    const md = contractTableMeta("contractSigned", {
      teamName: "부산 웨이브스", salary: 12000, years: 3, signingBonus: 0,
    });
    expect(md.rows.map((r) => r.item)).toEqual(["teamId", "salary", "years"]);
  });

  it("계약금·조항이 있으면 줄이 는다", () => {
    const md = contractTableMeta("faSigned", {
      teamName: "부산 웨이브스", salary: 12000, years: 3, signingBonus: 30000,
      teamOptionYears: 1, noTrade: true,
    });
    expect(md.rows.map((r) => r.item)).toEqual(["teamId", "salary", "years", "bonus", "options"]);
    expect(String(md.rows[4].value)).toContain("노트레이드");
  });

  it("인센티브는 표 안의 표다 — 점으로 이어 문안을 찾는다", () => {
    const md = contractTableMeta("contractSigned", {
      teamName: "부산 웨이브스", salary: 12000, years: 3, signingBonus: 0,
      incentives: [
        { kind: "games", threshold: 25, bonus: 900 },
        { kind: "era", threshold: 3, bonus: 1500 },
      ],
    });
    expect(md.extra?.kind).toBe("contractSigned.incentives");
    expect(md.extra?.rows).toHaveLength(2);
    expect(md.extra?.rows[0].name).toBe("25등판");
    expect(md.extra?.rows[1].name).toBe("ERA 3.00 이하");
    // 문안이 점으로 이어 잡힌다
    const view = buildTableView(md.extra!, tableCopy(labels, md.extra!.kind), true);
    expect(view.title).toBe("인센티브");
    expect(view.columns.map((c) => c.key)).toEqual(["name", "amount"]);
  });

  it("인센티브가 없으면 표 안의 표도 없다", () => {
    const md = contractTableMeta("contractSigned", {
      teamName: "부산 웨이브스", salary: 12000, years: 3, signingBonus: 0, incentives: [],
    });
    expect(md.extra).toBeUndefined();
  });
});

// ── ⑤ 배선 ───────────────────────────────────────────────────
describe("배선", () => {
  it("본문 문자열을 안 건드렸다 — 표는 얹기만 한다", () => {
    expect(read(SRC_DIGEST).includes("→ 세부 순위는 [기록] 탭")).toBe(true);
    expect(read(SRC_WEEK).includes("시즌 성적: ${statSummary}")).toBe(true);
    expect(read(SRC_CONTRACT).includes("W52 새 시즌 시작 시 정식 적용됩니다.")).toBe(true);
  });

  it("네 자리가 생산부 함수를 부른다", () => {
    expect(read(SRC_DIGEST).includes("standingsTableMeta(")).toBe(true);
    expect(read(SRC_WEEK).includes('pitcherSeasonTableMeta("seasonEndPro"')).toBe(true);
    expect(read(SRC_WEEK).includes('pitcherSeasonTableMeta(\n          "seasonEndIndie"')).toBe(true);
    expect(read(SRC_CONTRACT).includes('contractTableMeta("contractSigned"')).toBe(true);
    expect(read(SRC_CONTRACT).includes('contractTableMeta("faSigned"')).toBe(true);
  });

  it("스냅샷 키에 last_digest 가 있다", () => {
    expect(read(SRC_SNAPSHOT).includes('"last_digest"')).toBe(true);
  });

  it("내 리그도 뜬다 — leagueState 엔 내 리그가 없다", () => {
    expect(read(SRC_POST).includes("ownLeagueId")).toBe(true);
  });

  it("소식을 **보낸 뒤에** 지난 순위를 덮는다", () => {
    const src = read(SRC_WEEK);
    const iAdd = src.indexOf("gameStore.addMessage(digest)");
    const iCap = src.indexOf('captureStandingsSnapshot("last_digest"');
    expect(iAdd).toBeGreaterThan(0);
    expect(iCap).toBeGreaterThan(iAdd);
  });
});

// ── ⑥ 묶음 2 ─────────────────────────────────────────────────
describe("묶음 2 — 경기·트레이드·말소·웨이버", () => {
  const SRC_MARKET   = resolve(__dirname, "../../usecases/weekPhases/market.ts");
  const SRC_FRIENDLY = resolve(__dirname, "../friendlyMatchEngine.ts");
  const SRC_ROLL     = resolve(__dirname, "../../usecases/seasonRollover.ts");

  it("경기 결과 — 점수 칸을 생산부가 합친다", () => {
    const md = gameResultsTableMeta([
      { homeName: "한성고", awayName: "기흥고", homeScore: 5, awayScore: 3, mine: true },
      { homeName: "북악고", awayName: "동래고", homeScore: 1, awayScore: 2 },
    ]);
    // ⚠ **원정이 먼저다**(사용자 U6). 본문 줄·주간 로그·경기 종료 화면이 다 그렇다 —
    //   표만 홈이 먼저라 같은 경기가 서로 뒤집혀 보였다
    expect(md.rows[0].score).toBe("3 : 5");
    expect(md.rows[0].away).toBe("기흥고");
    expect(md.rows[0].myTeam).toBe(true);
    expect(md.rows[1].myTeam).toBeUndefined();
    const view = buildTableView(md, tableCopy(labels, "leagueResults"));
    expect(view.columns.map((c) => c.key)).toEqual(["away", "score", "home"]);
  });

  it("내 경기 — 연습경기는 투구수 줄이 없다", () => {
    const off = myGameTableMeta("officialResult", { ip: 6.3333, h: 5, er: 2, k: 7, bb: 1, pitches: 92, dec: "승" });
    expect(off.rows.map((r) => r.item)).toEqual(["ip", "h", "er", "k", "bb", "pitches", "dec"]);
    expect(off.rows[0].value).toBe("6.1");
    const fr = myGameTableMeta("friendlyResult", { ip: 3, h: 2, er: 0, k: 4, bb: 0, dec: "무" });
    expect(fr.rows.map((r) => r.item)).toEqual(["ip", "h", "er", "k", "bb", "dec"]);
  });

  it("트레이드 — 행이 구단, 값이 받은 선수다", () => {
    const md = tradeTableMeta(
      [{ teamName: "부산 웨이브스", playerNames: ["김철수"] },
       { teamName: "서울 라이온즈", playerNames: ["이영호"] }],
      "리빌딩",
    );
    expect(md.rows).toHaveLength(2);
    expect(md.footnote).toBe("리빌딩");
    const view = buildTableView(md, tableCopy(labels, "npcTrade"));
    expect(view.columns.map((c) => c.key)).toEqual(["teamId", "players"]);
  });

  it("말소 비고는 문안에서 온다 — 코드가 문장을 안 적는다", () => {
    const note = lockNoteOf(labels, 10);
    expect(note).toBe(labels!.table.demote.lockNote!.toString().split("{weeks}").join("10"));
    expect(lockNoteOf(null, 10)).toBeUndefined();
  });

  it("말소·웨이버 — 이름을 담는다", () => {
    const dm = playerListTableMeta("demote", ["김철수", "이영호"], "10주간 재등록 불가");
    expect(dm.rows[0].npcId).toBe("김철수");
    expect(dm.rows[0].note).toBe("10주간 재등록 불가");
    const wv = playerListTableMeta("waiver", ["박민수"]);
    expect(wv.rows[0].note).toBeUndefined();
    const view = buildTableView(wv, tableCopy(labels, "waiver"));
    expect(view.columns.map((c) => c.key)).toEqual(["npcId"]);
  });

  it("다섯 자리가 배선돼 있고 본문은 그대로다", () => {
    expect(read(SRC_WEEK).includes("gameResultsTableMeta(")).toBe(true);
    expect(read(SRC_FRIENDLY).includes('myGameTableMeta("officialResult"')).toBe(true);
    expect(read(SRC_FRIENDLY).includes('myGameTableMeta("friendlyResult"')).toBe(true);
    expect(read(SRC_MARKET).includes("tradeTableMeta(")).toBe(true);
    expect(read(SRC_MARKET).includes('playerListTableMeta("demote"')).toBe(true);
    expect(read(SRC_ROLL).includes('playerListTableMeta("waiver"')).toBe(true);
    // 본문 문자열이 살아 있다
    expect(read(SRC_FRIENDLY).includes("▶ 내 기록")).toBe(true);
    expect(read(SRC_MARKET).includes("주간 1군 재등록이 불가하다")).toBe(true);
  });
});
