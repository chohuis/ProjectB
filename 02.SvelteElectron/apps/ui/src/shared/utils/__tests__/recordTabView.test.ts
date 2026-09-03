import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  buildContractHistoryTable, buildTournamentRecordTable, contractTermsText,
  myTournamentLine, CONTRACT_HISTORY_KIND, TOURNAMENT_RECORD_KIND,
} from "../recordTabView";
import { shiftContract, sameContract } from "../contractHistory";
import { parseDashboardLabels, tableCopy } from "../dashboardCopy";
import { buildTableView } from "../dashboardView";
import type { ProContract, CareerGameLogEntry } from "../../types/save";
import type { TournamentBracket } from "../tournament";

/**
 * 기록 탭 카드 둘 — 계약 이력 · 대회 전적
 * (`PLAN_MESSAGE_DASHBOARDS.md` §7-3·§7-4 · 사용자 확정 「오래 남을 것은 기록 탭」).
 *
 * 🔴 **여기가 재는 것은 「소식이 밀려나도 남는가」다.** 소식함은 1500칸에서
 *    잘리는 자리라(§8) 계약 완료·대회 결과가 사라진다. 세이브에 남는 값과
 *    그걸 그리는 표가 이 파일의 전부다.
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const LABELS = parseDashboardLabels(
  JSON.parse(readFileSync(join(MASTER, "messages/dashboard_labels.json"), "utf8")),
);
const TERMS = JSON.parse(
  readFileSync(join(MASTER, "messages/contract_terms.json"), "utf8"),
).signed as { teamOption: string; playerOption: string; noTrade: string };

const salaryText = (v: number) => `${v}만원`;
const contract = (over: Partial<ProContract> = {}): ProContract => ({
  teamId: "TEAM_A", leagueId: "LEAGUE_KBL",
  salary: 5000, durationYears: 3, remainingYears: 3,
  signingBonus: 0, teamOptionYears: 0, playerOptionYears: 0,
  noTrade: false, status: "active", ...over,
});

const copyOf = (kind: string) => tableCopy(LABELS, kind);
const rowsOf = (kind: string, md: Parameters<typeof buildTableView>[0]) =>
  buildTableView(md, copyOf(kind)).rows.map((r) => r.cells.map((c) => c.text));

describe("문안 — 기록 탭도 같은 파일에서 온다", () => {
  it("`recordTab` 뿌리를 달고 찾는다", () => {
    // 소식 19자리는 뿌리 없이 `"digest"` 로 온다 — 그 길이 안 깨져야 한다
    expect(copyOf(CONTRACT_HISTORY_KIND).title).not.toBe("");
    expect(copyOf(TOURNAMENT_RECORD_KIND).title).not.toBe("");
    expect(copyOf("digest").title).not.toBe("");
  });

  it("계약 종류 셋의 한글이 문안에 있다", () => {
    const k = copyOf(CONTRACT_HISTORY_KIND).kindLabel;
    for (const kind of ["new", "resign", "fa"]) expect(k[kind]).toBeTruthy();
  });

  it("빈 표 한 줄이 카드마다 다르다", () => {
    // 「맺은 계약이 없다」와 「나간 대회가 없다」는 다른 말이다
    expect(copyOf(CONTRACT_HISTORY_KIND).empty)
      .not.toBe(copyOf(TOURNAMENT_RECORD_KIND).empty);
  });
});

describe("계약 이력 — 지금 계약도 한 줄이다", () => {
  it("이력이 없어도 지금 계약이 선다", () => {
    const md = buildContractHistoryTable(undefined, contract({ signedYear: 2030 }),
                                         { salaryText });
    expect(md.rows).toHaveLength(1);
    expect(md.rows[0].myTeam).toBe(true);
  });

  it("최근이 위다 — 「시즌별 성적」과 같은 방향", () => {
    const md = buildContractHistoryTable(
      [contract({ signedYear: 2028 }), contract({ signedYear: 2031 })],
      contract({ signedYear: 2034 }), { salaryText },
    );
    expect(md.rows.map((r) => r.year)).toEqual([2034, 2031, 2028]);
  });

  it("연도를 모르는 계약은 맨 아래고 칸이 `—` 다", () => {
    // 구 세이브엔 `signedYear` 가 없다. 위에 두면 모르는 해가 제일 최근처럼 보인다
    const md = buildContractHistoryTable([contract({})], contract({ signedYear: 2030 }),
                                         { salaryText });
    expect(md.rows[1].year).toBeNull();
    expect(rowsOf(CONTRACT_HISTORY_KIND, md)[1][0]).toBe(copyOf(CONTRACT_HISTORY_KIND).emptyCell);
  });

  it("종류는 세이브에 낱말이 들고 한글은 문안이 준다", () => {
    const md = buildContractHistoryTable(undefined, contract({ signedYear: 2030, kind: "fa" }), {
      salaryText, kindLabel: copyOf(CONTRACT_HISTORY_KIND).kindLabel,
    });
    expect(md.rows[0].kind).toBe("FA");
  });

  it("모르는 종류는 키를 그대로 둔다 — 빈 칸이면 왜 비었는지 안 남는다", () => {
    const md = buildContractHistoryTable(
      undefined, { ...contract({ signedYear: 2030 }), kind: "loan" as never },
      { salaryText, kindLabel: copyOf(CONTRACT_HISTORY_KIND).kindLabel },
    );
    expect(md.rows[0].kind).toBe("loan");
  });

  it("열 여섯이 문안 순서대로 선다", () => {
    const md = buildContractHistoryTable(undefined, contract({ signedYear: 2030, kind: "new" }),
                                         { salaryText });
    const cols = buildTableView(md, copyOf(CONTRACT_HISTORY_KIND)).columns.map((c) => c.key);
    expect(cols).toEqual(["year", "teamId", "salary", "years", "kind", "options"]);
  });

  it("구단 칸은 id 로 남고 이름은 화면이 바꾼다", () => {
    // 이름을 여기서 만들면 표시 언어를 못 탄다 — `teamMap` 이 `language` 파생이다
    const md = buildContractHistoryTable(undefined, contract({ signedYear: 2030 }), { salaryText });
    expect(md.rows[0].teamId).toBe("TEAM_A");
  });
});

describe("조항 칸 — 붙은 것만 잇는다", () => {
  it("없는 조항은 줄 자체가 없다", () => {
    expect(contractTermsText(contract(), TERMS)).toBe("");
  });

  it("옵션 연수는 자리표를 갈아 끼운다", () => {
    const s = contractTermsText(contract({ teamOptionYears: 2, noTrade: true }), TERMS);
    expect(s).toContain("2");
    expect(s).not.toContain("{optYears}");
    expect(s).toContain(TERMS.noTrade);
  });

  it("문안이 없으면 빈 칸이다 — 말을 지어내지 않는다", () => {
    expect(contractTermsText(contract({ noTrade: true }), null)).toBe("");
  });
});

describe("계약 이력을 쌓는 자리 — 옛 것이 뒤로 간다", () => {
  it("첫 계약은 이력을 안 늘린다", () => {
    const r = shiftContract(undefined, contract(), { year: 2030, kind: "new" });
    expect(r.history).toEqual([]);
    expect(r.contract.signedYear).toBe(2030);
    expect(r.contract.kind).toBe("new");
  });

  it("새 계약이 오면 옛 계약이 이력으로 간다", () => {
    const prev = contract({ signedYear: 2030 });
    const r = shiftContract(prev, contract({ salary: 9000 }), { year: 2033, kind: "resign" }, []);
    expect(r.history).toEqual([prev]);
    expect(r.contract.signedYear).toBe(2033);
  });

  it("같은 계약을 두 번 안 쌓는다", () => {
    // 재계약은 `setPendingNextContract` 로 한 번, W52 롤오버로 또 한 번 온다
    const prev = contract({ signedYear: 2030 });
    const first = shiftContract(prev, contract({ signedYear: 2033, salary: 9000 }), {}, []);
    const again = shiftContract(prev, contract({ signedYear: 2033, salary: 9000 }), {},
                                first.history);
    expect(again.history).toHaveLength(1);
  });

  it("이미 찍힌 연도를 덮어쓰지 않는다", () => {
    const r = shiftContract(undefined, contract({ signedYear: 2028 }), { year: 2033 });
    expect(r.contract.signedYear).toBe(2028);
  });

  it("남은 기간은 같은 계약인지 볼 때 안 본다", () => {
    // 시즌마다 줄어드는 값이라 보면 같은 계약이 해마다 다른 계약이 된다
    const a = contract({ signedYear: 2030, remainingYears: 3 });
    const b = contract({ signedYear: 2030, remainingYears: 1 });
    expect(sameContract(a, b)).toBe(true);
  });
});

// ── 대회 전적 ────────────────────────────────────────────────────

/** 4팀 대회 — 1라운드 둘, 결승 하나 */
function bracket(winners: [string, string, string]): TournamentBracket {
  const m = (round: number, slot: number, week: number, h: string, a: string, w: string) => ({
    id: `M${round}-${slot}`, round, slot, week, gameDate: "",
    homeTeamId: h, awayTeamId: a, isBye: false, winnerTeamId: w,
    isProtagonistGame: false,
  });
  return {
    tournamentId: "TOUR_A", leagueId: "LEAGUE_HIGHSCHOOL", seasonYear: 2030,
    bracketSize: 4, totalRounds: 2, byeCount: 0,
    matches: [
      m(1, 0, 10, "TEAM_A", "TEAM_B", winners[0]),
      m(1, 1, 10, "TEAM_C", "TEAM_D", winners[1]),
      m(2, 0, 12, winners[0], winners[1], winners[2]),
    ],
  };
}

const log = (over: Partial<CareerGameLogEntry>): CareerGameLogEntry => ({
  week: 10, opponentId: "TEAM_B", myScore: 3, oppScore: 1,
  ip: 6, er: 1, h: 4, k: 7, bb: 1, decision: "W", pitchCount: 92, ...over,
});

describe("대회 전적 — 나간 대회만 선다", () => {
  const run = (over: Record<string, unknown> = {}) => ({
    year: 2030, name: "개나리기", teamId: "TEAM_A",
    bracket: bracket(["TEAM_A", "TEAM_C", "TEAM_A"]),
    ...over,
  }) as Parameters<typeof buildTournamentRecordTable>[0][number];

  it("안 나간 대회는 줄이 없다", () => {
    // 해마다 여덟 줄씩 「미출전」이 쌓이면 표가 안 읽힌다
    const md = buildTournamentRecordTable([run({ teamId: "TEAM_Z" })]);
    expect(md.rows).toHaveLength(0);
  });

  it("우승한 해는 굵게 선다", () => {
    const md = buildTournamentRecordTable([run()]);
    expect(md.rows[0].round).toBe("우승");
    expect(md.rows[0].myTeam).toBe(true);
  });

  it("탈락한 라운드가 결과다", () => {
    const md = buildTournamentRecordTable([run({
      teamId: "TEAM_B", bracket: bracket(["TEAM_A", "TEAM_C", "TEAM_A"]),
    })]);
    expect(md.rows[0].round).toContain("탈락");
    expect(md.rows[0].myTeam).toBeUndefined();
  });

  it("최근이 위다", () => {
    const md = buildTournamentRecordTable([run(), run({ year: 2033 })]);
    expect(md.rows.map((r) => r.year)).toEqual([2033, 2030]);
  });
});

describe("내 기록 칸 — 「등판 없음」과 「모른다」가 다르다", () => {
  const b = bracket(["TEAM_A", "TEAM_C", "TEAM_A"]);

  it("주차와 상대를 둘 다 봐야 리그 경기가 안 섞인다", () => {
    // 같은 주에 배경 리그 경기가 있다 — 주차만 보면 그게 대회 기록이 된다
    const line = myTournamentLine(b, "TEAM_A", [log({}), log({ opponentId: "TEAM_X", k: 99 })]);
    expect(line).toContain("7K");
    expect(line).not.toContain("99");
  });

  it("여러 경기는 합쳐서 한 줄이다", () => {
    const line = myTournamentLine(b, "TEAM_A",
      [log({}), log({ week: 12, opponentId: "TEAM_C", ip: 3, k: 4 })]);
    expect(line).toBe("9이닝 11K");
  });

  it("나갔는데 안 던졌으면 `null` — 화면이 「등판 없음」을 찍는다", () => {
    expect(myTournamentLine(b, "TEAM_A", [])).toBeNull();
    const md = buildTournamentRecordTable([{
      year: 2030, name: "개나리기", teamId: "TEAM_A", bracket: b, gameLog: [],
    }]);
    const copy = copyOf(TOURNAMENT_RECORD_KIND);
    expect(rowsOf(TOURNAMENT_RECORD_KIND, md)[0][3]).toBe(copy.noAppearance);
    expect(copy.noAppearance).not.toBe(copy.emptyCell);
  });

  it("기록이 안 남은 시즌은 `—` 다 — 없는 사실을 적지 않는다", () => {
    expect(myTournamentLine(b, "TEAM_A", undefined)).toBeUndefined();
    const md = buildTournamentRecordTable(
      [{ year: 2030, name: "개나리기", teamId: "TEAM_A", bracket: b }],
      { emptyCell: copyOf(TOURNAMENT_RECORD_KIND).emptyCell },
    );
    expect(rowsOf(TOURNAMENT_RECORD_KIND, md)[0][3])
      .toBe(copyOf(TOURNAMENT_RECORD_KIND).emptyCell);
  });
});

describe("빈 카드 — 왜 비었는지가 화면에 남는다", () => {
  it("계약이 하나도 없으면 문안 한 줄이 선다", () => {
    const md = buildContractHistoryTable(undefined, undefined, { salaryText });
    const view = buildTableView(md, copyOf(CONTRACT_HISTORY_KIND));
    expect(view.rows).toHaveLength(0);
    expect(view.empty).toBe(copyOf(CONTRACT_HISTORY_KIND).empty);
    // 행이 없어도 머리글은 선다 — 표가 통째로 사라지면 자리를 못 찾는다
    expect(view.columns).toHaveLength(6);
  });

  it("나간 대회가 없으면 대회 전적도 그렇다", () => {
    const view = buildTableView(buildTournamentRecordTable([]),
                                copyOf(TOURNAMENT_RECORD_KIND));
    expect(view.rows).toHaveLength(0);
    expect(view.empty).toBe(copyOf(TOURNAMENT_RECORD_KIND).empty);
  });
});
