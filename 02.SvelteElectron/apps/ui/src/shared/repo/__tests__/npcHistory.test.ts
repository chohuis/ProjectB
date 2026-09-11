import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { teamByYearOf, pastServiceOf, buildRosterParams } from "../newGameV3";
import { buildPastPlayerStats } from "../seedPastPlayerStats";
import { KNOWN_CAREER_EVENTS } from "../../utils/careerEventLabel";

/**
 * NPC 경력·이력 (B-29 D-1·D-2·D-3·D-5 · 사용자 확정 2026-09-03).
 *
 * ⚠ **엔진을 안 돌린다.** 이 저장소의 vitest 는 `environment: "node"` 라
 * electron 을 못 띄운다 — 순수 함수를 직접 재고, Rust 가 실제로 그 문자열을
 * 내는지는 **소스에서** 본다. 값(분포)은 D 의 덤프 몫이다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const rulesFile = JSON.parse(read("resource/data/master/players/generation_rules.json"));

const NPC_SIM = read("packages/engine-native/src/npc_sim.rs");
/** 여러 줄에 걸친 호출을 찾으려고 한 줄로 편다. **정규식을 안 쓴다**(CLAUDE.md) */
const NPC_SIM_FLAT = NPC_SIM.split("\n")
  .map((l) => l.trim())
  .join(" ");
const ROSTER_GEN = read("packages/engine-native/src/roster_gen.rs");
const SAVE_TS = read("apps/ui/src/shared/types/save.ts");
const NEWGAME = read("apps/ui/src/shared/repo/newGameV3.ts");
const PAST_STATS = read("apps/ui/src/shared/repo/seedPastPlayerStats.ts");

/**
 * Rust 가 `career_events` 에 싣는 유형을 소스에서 뽑는다.
 *
 * ⚠ **정규식을 안 쓴다**(CLAUDE.md). 두 자리뿐이라 문자열로 자른다 —
 *   `career_ev(<해>, "<유형>"` 과 `event_type: "<유형>"`.
 */
function rustCareerEventTypes(src: string): string[] {
  const out = new Set<string>();
  const grab = (head: string) => {
    for (const chunk of src.split(head).slice(1)) {
      const q = chunk.indexOf('"');
      if (q < 0) continue;
      const end = chunk.indexOf('"', q + 1);
      if (end < 0) continue;
      const v = chunk.slice(q + 1, end);
      // 변수로 넘기는 자리(`kind.into()`)는 문자열이 아니라 건너뛴다
      if (v.length > 0 && v.length < 40 && !v.includes(" ")) out.add(v);
    }
  };
  grab("career_ev(season_year,");
  grab("event_type: ");
  return [...out];
}

// ── ① 방출·웨이버가 선수 경력에 남는다 (D-1) ─────────────────
describe("방출·웨이버가 경력에 남는다", () => {
  it("방출 셋 다 career_events 에 들어간다", () => {
    for (const kind of ["release_roster", "release_score", "release_budget"]) {
      expect(NPC_SIM_FLAT.includes(`career_ev( season_year, "${kind}"`)).toBe(true);
    }
  });

  it("웨이버는 예전부터 들어갔다 — 같이 확인만 한다", () => {
    expect(NPC_SIM.includes(`event_type: "waiver_claim"`)).toBe(true);
  });

  it("승격·강등은 안 남긴다 — 정합성 보정이라 사건이 아니다", () => {
    for (const kind of ["promote", "demote_roster", "demote_fielder"]) {
      expect(NPC_SIM_FLAT.includes(`career_ev( season_year, "${kind}"`)).toBe(false);
    }
  });

  it("엔진이 내는 유형이 타입 유니온과 이름표에 다 있다 (D-8)", () => {
    const types = rustCareerEventTypes(NPC_SIM);
    expect(types.length).toBeGreaterThan(5);
    for (const t of types) {
      expect(SAVE_TS.includes(`| "${t}"`), `save.ts 유니온에 ${t} 가 없다`).toBe(true);
      expect(KNOWN_CAREER_EVENTS.includes(t), `careerEventLabel 에 ${t} 가 없다`).toBe(true);
    }
  });
});

// ── ② 과거 성적의 팀이 이적 이력을 따른다 (D-2) ──────────────
describe("연도별 성적이 이적을 따른다", () => {
  const events = [
    { npcId: "N1", seasonYear: 2021, fromTeamId: null, toTeamId: "A" }, // 입단
    { npcId: "N1", seasonYear: 2023, fromTeamId: "A", toTeamId: "B" }, // 이적
  ];

  it("이적 전 해는 옛 팀, 이적 뒤는 새 팀이다", () => {
    const m = teamByYearOf(events, 2026, 5)!.get("N1")!;
    expect(m.get(2022)).toBe("A");
    expect(m.get(2023)).toBe("B");
    expect(m.get(2025)).toBe("B");
  });

  it("입단 기록이 없어도(해외) 첫 이적의 떠난 팀이 출발점이다", () => {
    const m = teamByYearOf(
      [{ npcId: "N2", seasonYear: 2024, fromTeamId: "X", toTeamId: "Y" }],
      2026,
      5,
    )!.get("N2")!;
    expect(m.get(2022)).toBe("X");
    expect(m.get(2024)).toBe("Y");
  });

  it("이력이 없으면 아예 없다 — 현재 팀으로 떨어진다", () => {
    expect(teamByYearOf([], 2026, 5).size).toBe(0);
  });

  it("과거 성적이 그 표를 실제로 읽는다", () => {
    const teamByYear = new Map([
      [2025, "B"],
      [2024, "A"],
    ]);
    const rows = buildPastPlayerStats(
      [
        {
          npcId: "N1",
          leagueId: "LEAGUE_KBL",
          teamId: "NOW",
          age: 30,
          ovr: 70,
          playerType: "pitcher",
          teamByYear,
        },
      ],
      12345,
      2026,
      3,
    );
    expect(rows.find((r) => r.year === 2025)!.teamId).toBe("B");
    expect(rows.find((r) => r.year === 2024)!.teamId).toBe("A");
    // 표에 없는 해는 현재 팀이다 (원클럽맨이 그렇다)
    expect(rows.find((r) => r.year === 2023)!.teamId).toBe("NOW");
  });

  it("만들기가 쓰기보다 앞이다 — 순서가 바뀌면 D-2 가 돌아온다", () => {
    const iBuild = NEWGAME.indexOf("buildCareerHistorySeed(");
    const iPast = NEWGAME.indexOf("buildPastPlayerStats(");
    const iWrite = NEWGAME.indexOf("addTransactions(opts.slotId");
    expect(iBuild).toBeGreaterThan(0);
    expect(iPast).toBeGreaterThan(iBuild);
    expect(iWrite).toBeGreaterThan(iPast);
  });

  it("현재 팀을 그대로 박던 줄이 없어졌다", () => {
    expect(PAST_STATS.includes("teamId: p.teamByYear?.get(year) ?? p.teamId")).toBe(true);
  });
});

// ── ③ FA 자격 연차 정본 하나 (D-3) ───────────────────────────
describe("FA 자격 연차", () => {
  it("게임 규칙에 리그별 값이 있다", () => {
    const e = rulesFile.faRules?.eligibleYears;
    expect(e?.LEAGUE_KBL).toBeGreaterThan(0);
    expect(e?.LEAGUE_ABL).toBeGreaterThan(0);
    expect(e?.LEAGUE_JBL).toBeGreaterThan(0);
  });

  it("이력 생성이 그 값을 리그마다 갈아 넘긴다", () => {
    expect(NEWGAME.includes("faEligibleYears: eligible")).toBe(true);
    expect(NEWGAME.includes("faEligibleYears?.[leagueId]")).toBe(true);
  });

  it("리그마다 값이 다르다 — 하나로 뭉개면 D-3 이 돌아온다", () => {
    const e = rulesFile.faRules.eligibleYears;
    expect(new Set([e.LEAGUE_KBL, e.LEAGUE_ABL, e.LEAGUE_JBL]).size).toBeGreaterThan(1);
  });
});

// ── ④ 새 게임 병역 (D-5) ─────────────────────────────────────
describe("새 게임 NPC 병역", () => {
  it("규칙 파일이 정본이다", () => {
    const ps = rulesFile.militaryRules?.pastService;
    expect(ps?.undecidedBelow).toBeGreaterThan(0);
    expect(ps?.servedFrom).toBeGreaterThan(ps.undecidedBelow);
    expect(ps?.servedPct).toBeGreaterThan(0);
  });

  it("로더가 그 자리를 읽는다", () => {
    expect(pastServiceOf(rulesFile)).toEqual(rulesFile.militaryRules.pastService);
    expect(pastServiceOf({ version: 1, rosterRules: {} })).toBeUndefined();
  });

  it("생성 파라미터에 실린다 — 안 실으면 조용히 예전 동작이다", () => {
    const p = buildRosterParams(
      "LEAGUE_KBL",
      2026,
      1,
      [],
      { rosterSize: 30 } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      rulesFile.militaryRules.pastService,
    ) as Record<string, unknown>;
    expect(p.pastService).toBeTruthy();
  });

  it("Rust 가 국적을 가린다 — 외국인은 면제 그대로다", () => {
    expect(ROSTER_GEN.includes("fn past_service_of(")).toBe(true);
    expect(ROSTER_GEN.includes(`if !is_korean { return ("면제".into(), None); }`)).toBe(true);
  });
});

// ── ⑤ 계약 기간 나이 상한 (D-4) ──────────────────────────────
describe("계약 기간 나이 상한", () => {
  it("규칙 파일에 표가 있다 — 코드에 나이를 안 박는다", () => {
    const caps = rulesFile.salaryRules?.contractYearsMaxByAge;
    expect(Array.isArray(caps)).toBe(true);
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) {
      expect(c.fromAge).toBeGreaterThan(0);
      expect(c.maxYears).toBeGreaterThan(0);
    }
  });

  it("나이가 많을수록 상한이 짧다", () => {
    const caps = [...rulesFile.salaryRules.contractYearsMaxByAge].sort(
      (a: { fromAge: number }, b: { fromAge: number }) => a.fromAge - b.fromAge,
    );
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i].maxYears).toBeLessThanOrEqual(caps[i - 1].maxYears);
    }
  });

  it("연봉 계산이 그 상한을 먹인다", () => {
    expect(NPC_SIM.includes("cap_contract_years(rules, age, years)")).toBe(true);
  });
});
