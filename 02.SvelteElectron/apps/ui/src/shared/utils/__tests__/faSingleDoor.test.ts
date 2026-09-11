import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OVERSEAS_FLOOR } from "../postingInterest";

/**
 * **해외 제안이 들어오는 문은 하나여야 한다.**
 *
 * 🔴 Rust `player_engine.rs`에 `OVERSEAS_ROUTES`가 있었다 — 후보 풀과 **별개로**
 *   해외 팀을 1~2개 무작위로 더 얹는 경로다. 해외가 열리기 전엔 유일한 방법이라
 *   맞았지만, 1단계가 풀을 열자(`faDestinationLeagues`) **같은 일을 하는 길이
 *   둘**이 됐고 이쪽은 문지기를 전부 우회했다:
 *
 *       관심도 판정(`eval_fa_bid`) · 정원 여유 · 외국인 보유 한도 · 포스팅 문턱
 *
 *   실측(2026-08-27, 8시즌 × 6씨앗): 문지기를 달았는데도 해외 제안이 89건 남았다.
 *   **문지기를 조여도 안 줄던 이유가 이것이다.**
 *
 * ⚠ 정규식을 안 쓴다 — 이스케이프가 어긋나면 검사가 조용히 헛돈다.
 * ⚠ **호출을 본다 — 주석은 세지 않는다.** 지운 이유를 Rust 주석에 남겨 뒀다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const RUST = read("packages/engine-native/src/player_engine.rs");
const TS = read("apps/ui/src/shared/utils/faEngine.ts");

describe("해외 제안은 문이 하나다", () => {
  /** 선언 형태로 본다 — 주석에 남은 이름에 걸리지 않게 */
  it("Rust에 우회 루트가 없다", () => {
    expect(RUST.includes("const OVERSEAS_ROUTES")).toBe(false);
    expect(RUST.includes("해외 스카우트 오퍼")).toBe(false);
  });

  /**
   * 🔴 **후보 풀 밖에서 제안을 만들면 안 된다.** 우회 루트는 `params.teams`를
   *   직접 훑어 `dest_teams`를 따로 만들었다.
   */
  it("Rust가 풀 밖에서 팀을 따로 뽑지 않는다", () => {
    expect(RUST.includes("dest_teams")).toBe(false);
    // 제안은 `indices`(= 관심도를 통과한 팀)에서만 나온다
    expect(RUST.includes("indices[..n_picks]")).toBe(true);
  });

  /**
   * 🔴 **리그별 바닥을 같이 지우면 안 된다.** 그 두 줄이 우회 루트가 가진
   *   유일한 근거였다 — 지우면 ABL·JBL이 같은 조건이 되고 **위계가 사라진다.**
   */
  it("리그별 바닥이 TS로 옮겨져 살아 있다", () => {
    expect(TS.includes("OVERSEAS_FLOOR[t.leagueId]")).toBe(true);
    expect(TS.includes("protagonist.pitching.ovr < floor.ovr")).toBe(true);
    expect(TS.includes("< floor.fame")).toBe(true);
  });

  /**
   * ⚠ **ABL이 위다.** 한 번 거꾸로 잡은 적이 있다 — JBL 문턱을 더 높게 뒀는데
   *   연봉은 ABL이 1.75배였다(`league_salary_mult` ABL 3.5 / JBL 2.0).
   */
  it("ABL이 JBL보다 어렵다", () => {
    expect(OVERSEAS_FLOOR.LEAGUE_ABL.ovr).toBeGreaterThan(OVERSEAS_FLOOR.LEAGUE_JBL.ovr);
    expect(OVERSEAS_FLOOR.LEAGUE_ABL.fame).toBeGreaterThan(OVERSEAS_FLOOR.LEAGUE_JBL.fame);
  });

  /** 값을 옮기기만 했다 — 바꾸면 이동 전후를 못 잰다 */
  it("옮기면서 값을 바꾸지 않았다", () => {
    expect(OVERSEAS_FLOOR.LEAGUE_ABL).toEqual({ ovr: 70, fame: 30 });
    expect(OVERSEAS_FLOOR.LEAGUE_JBL).toEqual({ ovr: 62, fame: 15 });
  });
});
