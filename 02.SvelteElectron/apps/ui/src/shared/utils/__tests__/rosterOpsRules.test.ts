import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  primeRosterOpsRules,
  rotationRestGames,
  rotationSizeForLeague,
  rotationSizeForStage,
} from "../rosterEngine";

/**
 * **로스터 운용 수치를 규칙 파일로** (5단계 · 2026-08-29).
 *
 * 🔴 **Rust로 안 내렸다.** 계획엔 "피로 보정이 `npc_sim`에도 있다"고 적었는데
 *   **틀렸다** — Rust엔 같은 보정이 없다. 두 벌이 아니므로 고칠 결함이 없고,
 *   옮기면 IPC가 **+10~28%**(실측 20,000경기) 는다. **경기마다 도는 자리다.**
 *   숫자만 올리고 조회는 TS에 뒀다 — `academicsEngine`과 같은 갈래다.
 *
 * ⚠ **값을 안 바꿨다.** 옮기기만 했다 — 바꿨으면 전후를 못 잰다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const RULES = JSON.parse(read("resource/data/master/players/generation_rules.json"));

describe("로스터 운용 규칙", () => {
  it("규칙 파일에 표가 있다", () => {
    const o = RULES.rosterOpsRules;
    expect(o).toBeTruthy();
    for (const k of [
      "rotationSize",
      "restGames",
      "pitcherFatigue",
      "batterFatigue",
      "pitcherRest",
      "playThroughOvrMult",
    ]) {
      expect(o[k], k).toBeTruthy();
    }
    expect(o.freshnessWeight).toBeGreaterThan(0);
  });

  /** ⚠ 옮기면서 값을 바꾸지 않았다 */
  it("옮기면서 값을 안 바꿨다", () => {
    const o = RULES.rosterOpsRules;
    expect(o.rotationSize).toMatchObject({
      LEAGUE_HIGHSCHOOL: 3,
      LEAGUE_UNIVERSITY: 3,
      LEAGUE_INDEPENDENT: 4,
      default: 5,
    });
    expect(o.restGames).toMatchObject({
      LEAGUE_HIGHSCHOOL: 2,
      LEAGUE_UNIVERSITY: 2,
      LEAGUE_INDEPENDENT: 2,
      default: 4,
    });
    expect(o.pitcherFatigue.floor).toBe(0.65);
    expect(o.batterFatigue.floor).toBe(0.78);
    expect(o.freshnessWeight).toBe(0.3);
    expect(o.playThroughOvrMult).toMatchObject({ light: 0.88, moderate: 0.7 });
  });

  /**
   * ⚠ **투수와 타자 표가 다르다.** 투수는 단계가 하나 많고 바닥이 낮다
   *   (0.65 vs 0.78) — 피로에 더 민감하다는 뜻이고 의도로 보여 합치지 않았다.
   *   주석이 없어 확신은 못 했다. **밸런스 단계에서 확인할 값**이다.
   */
  it("투수가 피로에 더 민감하다", () => {
    const o = RULES.rosterOpsRules;
    expect(o.pitcherFatigue.tiers.length).toBeGreaterThan(o.batterFatigue.tiers.length);
    expect(o.pitcherFatigue.floor).toBeLessThan(o.batterFatigue.floor);
  });

  it("규칙 파일 값이 실제로 걸린다", () => {
    primeRosterOpsRules({
      rosterOpsRules: {
        rotationSize: { LEAGUE_KBL: 7, default: 5 } as Record<string, number>,
        restGames: { LEAGUE_KBL: 9, default: 4 } as Record<string, number>,
      },
    });
    expect(rotationSizeForLeague("LEAGUE_KBL")).toBe(7);
    expect(rotationRestGames("LEAGUE_KBL")).toBe(9);
    // 되돌린다 — 다른 검사에 새면 안 된다
    primeRosterOpsRules(RULES);
    expect(rotationSizeForLeague("LEAGUE_KBL")).toBe(5);
  });

  /** 🔴 못 채워도 0이 되면 안 된다 — 로스터가 통째로 멈춘다 */
  it("표를 안 채워도 폴백으로 돈다", () => {
    const src = read("apps/ui/src/shared/utils/rosterEngine.ts");
    const at = src.indexOf("const OPS_FALLBACK");
    expect(at, "폴백 표를 못 찾았다").toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("};", at));
    for (const v of body.match(/: (\d+(\.\d+)?)/g) ?? []) {
      expect(Number(v.slice(2)), `폴백에 0이 있다: ${body}`).toBeGreaterThan(0);
    }
  });

  /** ⚠ 단계와 리그가 **같은 표**를 본다 — 두 벌이면 갈라진다 */
  it("단계와 리그가 같은 값을 준다", () => {
    primeRosterOpsRules(RULES);
    expect(rotationSizeForStage("highschool")).toBe(rotationSizeForLeague("LEAGUE_HIGHSCHOOL"));
    expect(rotationSizeForStage("pro_kbl")).toBe(rotationSizeForLeague("LEAGUE_KBL"));
  });

  it("부팅 때 주입한다", () => {
    const M = read("apps/ui/src/shared/stores/master.ts");
    expect(M).toContain("primeRosterOpsRules(");
  });

  /** 🔴 **Rust로 안 내렸다** — 그 판단이 코드에 남아 있어야 한다 */
  it("안 내린 이유가 적혀 있다", () => {
    const src = read("apps/ui/src/shared/utils/rosterEngine.ts");
    expect(src).toContain("Rust로 안 내렸다");
    expect(RULES.rosterOpsRules._moveNote).toContain("+10~28%");
  });
});
