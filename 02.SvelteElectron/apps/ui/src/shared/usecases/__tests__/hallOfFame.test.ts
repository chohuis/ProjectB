import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateHof, scoreOfHighlight, awardLabelsFrom, type HofRules } from "../hallOfFame";

/**
 * 명예의 전당 · 영구결번 (2단계).
 *
 * 사용자 확정: **수상 이력 중심 · 헌액자+재적 5년 · 은퇴 즉시 심사**
 *
 * 🔴 **상 이름을 여기 적지 않는다.** 규칙 파일의 `awardRules` label 에서
 *   읽는다 — 두 벌이 되면 label 을 바꿨을 때 조용히 0점이 된다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const rulesFile = JSON.parse(
  readFileSync(resolve(ROOT, "resource/data/master/players/generation_rules.json"), "utf8"),
) as { hallOfFameRules: HofRules; awardRules: unknown };

const R = rulesFile.hallOfFameRules;
const L = awardLabelsFrom(rulesFile);

const player = (highlights: string[][], teams: string[]) => ({
  npcId: "P1", name: "테스트", jerseyNumber: 7,
  careerHistory: highlights.map((h, i) => ({ teamId: teams[i], highlights: h })),
});

describe("명예의 전당", () => {
  it("규칙 파일에 값이 있다", () => {
    expect(R, "hallOfFameRules 없음").toBeTruthy();
    expect(R.threshold).toBeGreaterThan(0);
    expect(R.retiredNumber.minSeasonsWithTeam).toBeGreaterThan(0);
  });

  it("상 이름을 규칙 파일에서 읽는다", () => {
    expect(L.mvp, "MVP label").toBeTruthy();
    expect(L.rookie, "신인왕 label").toBeTruthy();
    expect(L.titles.length, "부문 label 들").toBeGreaterThan(5);
  });

  it("수상마다 제 점수가 붙는다", () => {
    expect(scoreOfHighlight(L.mvp, R, L)).toBe(R.points.mvp);
    expect(scoreOfHighlight(L.rookie, R, L)).toBe(R.points.rookie);
    // 부문상은 `label (값)` 형태다 — 접두사로 본다
    expect(scoreOfHighlight(`${L.titles[0]} (15승)`, R, L)).toBe(R.points.title);
    expect(scoreOfHighlight("골든글러브 (포수) (.312)", R, L)).toBe(R.points.golden);
    expect(scoreOfHighlight("올스타", R, L)).toBe(R.points.allstar);
    expect(scoreOfHighlight("듣도보도 못한 상", R, L)).toBe(0);
  });

  it("상 이름끼리 접두사로 겹치지 않는다", () => {
    // 🔴 처음엔 "골든글러브를 먼저 본다"를 검사했는데 **순서를 바꿔도
    //   통과했다**(변이로 확인) — 부문 label 중 "골든글러브"로 시작하는
    //   게 없어서 순서가 무의미했다. 주석이 과장이었다.
    //
    //   지킬 값어치가 있는 건 **겹치지 않는다**는 쪽이다. 겹치면 그때
    //   비로소 순서가 결과를 바꾸고, 어느 쪽이 이기든 한쪽이 조용히 0점이
    //   되거나 잘못된 점수가 붙는다.
    const all = [L.mvp, L.rookie, L.golden, L.allstar, ...L.titles].filter(Boolean);
    for (const a of all) {
      for (const b of all) {
        if (a === b) continue;
        expect(b.startsWith(a), `"${b}" 가 "${a}" 로 시작한다 — 점수가 갈린다`)
          .toBe(false);
      }
    }
  });

  it("문턱을 넘어야 헌액된다", () => {
    const few = evaluateHof(player([[L.rookie]], ["T1"]), R, L);
    expect(few, "신인왕 하나로는 못 든다").toBeNull();

    const many = evaluateHof(player([[L.mvp], [L.mvp]], ["T1", "T1"]), R, L);
    expect(many, "MVP 둘이면 든다").toBeTruthy();
    expect(many!.score).toBe(R.points.mvp * 2);
  });

  it("재적 문턱을 넘은 구단만 결번한다", () => {
    const minS = R.retiredNumber.minSeasonsWithTeam;
    const hl = Array.from({ length: minS + 2 }, () => [L.mvp]);
    // 앞 minS 시즌은 T1, 나머지 둘은 T2
    const teams = [...Array(minS).fill("T1"), "T2", "T2"];
    const res = evaluateHof(player(hl, teams), R, L);
    expect(res).toBeTruthy();
    expect(res!.retiredNumberTeams, "T1 만 결번").toEqual(["T1"]);
  });

  it("두 구단에서 오래 뛰면 양쪽 다 결번한다", () => {
    const minS = R.retiredNumber.minSeasonsWithTeam;
    const hl = Array.from({ length: minS * 2 }, () => [L.mvp]);
    const teams = [...Array(minS).fill("T1"), ...Array(minS).fill("T2")];
    const res = evaluateHof(player(hl, teams), R, L);
    expect(res!.retiredNumberTeams.sort()).toEqual(["T1", "T2"]);
  });
});

describe("명예의 전당 배선", () => {
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
  const strip = (s: string) => s
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const rollover = strip(read("apps/ui/src/shared/usecases/seasonRollover.ts"));
  const store = strip(read("apps/ui/src/shared/stores/game.ts"));
  const week = strip(read("apps/ui/src/shared/usecases/weekPhases/jerseyNumbers.ts"));
  const rust = read("packages/engine-native/src/npc_sim.rs");
  const libRs = read("packages/engine-native/src/lib.rs");

  it("수상 **뒤**에 심사한다", () => {
    // 앞에 두면 그 해 수상이 점수에 안 들어간다
    const a = rollover.indexOf("applySeasonAwards");
    const b = rollover.indexOf("inductHallOfFame");
    expect(a, "수상 호출").toBeGreaterThan(-1);
    expect(b, "헌액 호출").toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
  });

  it("세이브에 실린다", () => {
    // 🔴 4단계에서 `clubBudgets` 를 안 실어 앱을 끄면 사라질 뻔했다
    expect(store.includes("hallOfFame: s.hallOfFame"), "저장").toBe(true);
    expect(store.includes("saved.hallOfFame"), "복원").toBe(true);
    expect(store.includes("retiredNumbers: s.retiredNumbers"), "결번 저장").toBe(true);
    expect(store.includes("saved.retiredNumbers"), "결번 복원").toBe(true);
  });

  it("결번된 번호를 새 선수가 못 받는다", () => {
    // ⚠ `serde(default)` 라 TS 가 안 넘겨도 조용히 통과한다 — 넘기는지 본다
    expect(week.includes("retiredNumbers: g.retiredNumbers"), "TS 가 넘긴다").toBe(true);
    expect(libRs.includes("retired_numbers"), "napi 가 받는다").toBe(true);
    expect(rust.includes("if let Some(list) = retired.get(&team)"), "Rust 가 막는다").toBe(true);
  });

  it("이미 헌액된 사람을 다시 안 넣는다", () => {
    // 은퇴 상태는 계속 남으므로 매년 세면 결번이 무한히 쌓인다
    const hof = strip(read("apps/ui/src/shared/usecases/hallOfFame.ts"));
    expect(hof.includes("already.has(n.npcId)")).toBe(true);
  });
});

describe("헌액 대상 리그", () => {
  it("프로만 든다", () => {
    // 🔴 실측(씨앗 111 · 5시즌): 헌액자 6명 중 **대학 선수 1명**이 있었다.
    //   대학·고교에도 수상이 있어 점수가 쌓인다.
    expect(R.leagues, "대상 리그 목록").toBeTruthy();
    expect(R.leagues!.length).toBeGreaterThan(0);
    for (const lg of R.leagues!) {
      expect(lg.startsWith("LEAGUE_"), lg).toBe(true);
    }
    expect(R.leagues!.includes("LEAGUE_UNIVERSITY"), "대학은 빠져야").toBe(false);
    expect(R.leagues!.includes("LEAGUE_HIGHSCHOOL"), "고교는 빠져야").toBe(false);
  });

  it("경력으로 거른다 — 현재 소속이 아니라", () => {
    // 은퇴하면 소속이 비거나 마지막 팀이 남는다
    const src = readFileSync(
      resolve(ROOT, "apps/ui/src/shared/usecases/hallOfFame.ts"), "utf8");
    expect(src.includes("careerHistory ?? []).some(")).toBe(true);
    expect(src.includes("if (!everPro) continue;")).toBe(true);
  });
});
