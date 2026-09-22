import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { NEUTRAL_DIMS, parkDimsForHomeTeam } from "../parkDims";
import type { StadiumRef, TeamRef } from "../../stores/master";

/**
 * 구장 담장 배선 — **엔진 입구가 스스로 구하는가.**
 *
 * 🔴 왜 있나 (2026-09-22 실측 · `docs/SIM_OVERSEAS_CLUBS_STAGE0_2026-09-22.md` §3).
 *   담장은 `simulateGame` 의 **선택 옵션**이었다. 그래서 배경 리그 한 자리만
 *   넘기고 **여섯 자리가 안 넘겼다** — 주인공 리그 NPC 경기(`weekPhases/games.ts`)
 *   · 주인공 리그 경기 세 갈래와 넉아웃 재경기(`advanceWeek.ts`)
 *   · 기록 보강(`applyGameOutcome.ts`) · 주인공이 직접 던지는 경기(`MatchPage`).
 *   타입이 `?` 라 tsc 가 안 잡고, 값이 없으면 Rust 가 `ParkDims::default()` 로
 *   조용히 떨어진다. 구장 27개를 채워 놓고도 **주인공은 어디서 던지든 중립**이었고
 *   이건 해외만의 문제가 아니라 **KBL·고교도 같이 틀렸다.**
 *
 * 고친 방식은 "빠뜨린 여섯에 한 줄씩 더한다"가 **아니다** — 그러면 일곱 번째가
 * 또 빠진다. **넘기는 규약을 지우고** 엔진 입구가 홈 팀으로 스스로 구하게 했다.
 * 이 검사는 그 규약이 되돌아가지 않는지를 본다.
 */

const SHARED = resolve(__dirname, "../..");
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".svelte")) out.push(p);
  }
  return out;
}

/** `await simulateGame(` 부터 짝이 맞는 닫는 괄호까지 — 씨앗 검사와 같은 방식 */
function callsOf(src: string): string[] {
  const out: string[] = [];
  const marker = "await simulateGame(";
  let i = src.indexOf(marker);
  while (i >= 0) {
    let depth = 0,
      j = i + marker.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(i, j + 1));
    i = src.indexOf(marker, j);
  }
  return out;
}

describe("구장 담장 배선", () => {
  const GS = read("apps/ui/src/shared/utils/gameSimulator.ts");

  it("simulateGame 이 홈 팀으로 스스로 구한다 — 호출부 몫이 아니다", () => {
    expect(GS).toContain("export function homeParkDims(");
    expect(GS).toContain("parkDims: options?.parkDims ?? homeParkDims(homeTeamId),");
  });

  /**
   * 🔴 **호출부가 넘겨야 하면 또 빠진다.** 옵션을 다시 필수 규약으로 되돌리면
   *   (= 호출부가 넘기기 시작하면) 안 넘기는 자리가 생기고, 그 자리는 조용히
   *   중립이 된다. 그래서 **아무 호출부도 안 넘기는 것**이 지금 규약이다.
   */
  it("simulateGame 호출부는 담장을 안 넘긴다 — 정본이 입구 하나다", () => {
    const passing: string[] = [];
    let total = 0;
    for (const p of walk(SHARED)) {
      for (const call of callsOf(readFileSync(p, "utf8"))) {
        total++;
        if (call.includes("parkDims")) {
          passing.push(`${p.replace(SHARED, "")} — ${call.slice(0, 70).replace(/\s+/g, " ")}…`);
        }
      }
    }
    expect(total, "simulateGame 호출부가 하나도 없다 — 검사가 헛돈다").toBeGreaterThan(3);
    expect(passing, `담장을 손수 넘기는 호출부:\n${passing.join("\n")}`).toEqual([]);
  });

  /** 🔴 주인공이 직접 던지는 경기는 `simulateGame` 이 아니라 `matchStart` 다 */
  it("matchStart 두 자리 다 담장을 넘긴다", () => {
    const MP = read("apps/ui/src/pages/match/MatchPage.svelte");
    const starts = MP.split("matchStart({").length - 1;
    expect(starts, "matchStart 호출부가 둘이 아니다 — 검사가 낡았다").toBe(2);
    expect(MP.split("parkDims: homeParkDims(").length - 1).toBe(starts);
    // 엔진이 받을 자리가 실제로 있어야 한다 — 없으면 serde 가 조용히 버린다
    expect(read("packages/engine-native/src/types.rs")).toContain(
      "pub park_dims: Option<ParkDims>,",
    );
    expect(read("apps/ui/src/shared/types/projectb.d.ts")).toContain("parkDims?: { lf: number;");
  });

  /**
   * 대조군 — **안 넘기면(=구장을 못 찾으면) 중립으로 떨어진다.**
   * 이게 성립해야 "고치기 전엔 전부 중립이었다"가 증명된다.
   */
  it("대조군: 구장을 못 찾으면 중립이다", () => {
    const teams = [{ id: "T", stadium: "STADIUM_없는것" }] as Pick<TeamRef, "id" | "stadium">[];
    const stadiums: StadiumRef[] = [
      { id: "STADIUM_다른것", name: "x", dist: { lf: 1, cf: 2, rf: 3, fence: 4 } },
    ];
    expect(parkDimsForHomeTeam("T", teams, stadiums)).toEqual(NEUTRAL_DIMS);
    // 홈 팀을 모를 때도, 팀에 구장이 없을 때도 지어내지 않는다
    expect(parkDimsForHomeTeam(null, teams, stadiums)).toEqual(NEUTRAL_DIMS);
    expect(parkDimsForHomeTeam("없는팀", teams, stadiums)).toEqual(NEUTRAL_DIMS);
  });

  /**
   * 대조군의 반대쪽 — **찾으면 중립과 다른 값이 나온다.**
   * 둘이 같으면 배선을 고쳐도 야구가 안 바뀐다(= 이 작업이 헛일이다).
   */
  it("KBL 타자친화·투수친화 구장은 중립과 다르다", () => {
    const refs = JSON.parse(read("resource/data/master/entities/refs.json")) as {
      teams: TeamRef[];
      stadiums: StadiumRef[];
    };
    const kbl = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL");
    expect(kbl.length).toBeGreaterThan(0);

    const dimsOf = (t: TeamRef) => parkDimsForHomeTeam(t.id, refs.teams, refs.stadiums);
    const stadiumOf = (t: TeamRef) => refs.stadiums.find((s) => s.id === t.stadium);

    // 1군 KBL 은 전부 표에 있다 — 하나라도 중립으로 떨어지면 배선이 헛돈다
    for (const t of kbl) {
      expect(stadiumOf(t), `${t.id} 의 구장이 표에 없다`).toBeTruthy();
    }
    const hitter = kbl.find((t) => stadiumOf(t)?.parkFactor === "타자친화");
    const pitcher = kbl.find((t) => stadiumOf(t)?.parkFactor === "투수친화");
    expect(hitter, "KBL 타자친화 구장이 없다").toBeTruthy();
    expect(pitcher, "KBL 투수친화 구장이 없다").toBeTruthy();
    expect(dimsOf(hitter!)).not.toEqual(NEUTRAL_DIMS);
    expect(dimsOf(pitcher!)).not.toEqual(NEUTRAL_DIMS);
    // 담장이 실제로 갈린다 — 타자친화가 더 가깝다
    expect(dimsOf(hitter!).cf).toBeLessThan(dimsOf(pitcher!).cf);
  });
});
