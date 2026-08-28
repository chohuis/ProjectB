import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeAwards, type AwardRules } from "../seasonAwards";
import type { PlayerSeasonStats } from "../../types/save";

/**
 * **수상 부문 보강** (2026-08-29 · 2단계).
 *
 * 부문 표가 `stat`·`order`·`minIp`/`minPa`로 주도되므로 규칙 파일에 줄만
 * 늘리면 된다. 승률만 파생값이라 `sanitizeStatsRecord`가 만든다.
 *
 * 🔴 붙이면서 **탈삼진·도루가 통째로 0인 것**을 찾았다 — 밸런스가 아니라
 *   배선이었다. `match_engine`이 3스트라이크째에 코드를 `Strikeout*`로
 *   좁히는데 누적은 `Strike*`만 봤고, 도루는 로그만 만들고 `sb`를 안 올렸다.
 *
 *     실측 규정투수 56명 최다 K **0** · 규정타자 103명 도루 **0**
 *     12 리그시즌 수상: 탈삼진왕 0 → **11** · 도루왕 0 → **11**
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const RULES = JSON.parse(
  read("resource/data/master/players/generation_rules.json"),
).awardRules as AwardRules;

describe("수상 부문", () => {
  it("KBO 부문이 다 있다", () => {
    const pit = RULES.pitcher.map((d) => d.id);
    const bat = RULES.batter.map((d) => d.id);
    for (const id of ["wins", "era", "strikeouts", "saves", "holds", "winPct"]) {
      expect(pit, id).toContain(id);
    }
    for (const id of ["avg", "hr", "rbi", "sb", "hits", "obp", "slg"]) {
      expect(bat, id).toContain(id);
    }
    expect(RULES.rookie?.label).toBe("신인왕");
  });

  /** ⚠ 고교·대학은 `proServiceYears`가 0이라 **전원이 신인**이 된다 */
  it("신인왕은 프로 리그만이다", () => {
    expect(RULES.rookie?.leagues).toEqual(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);
    const src = read("apps/ui/src/shared/usecases/seasonAwards.ts");
    expect(src).toContain("(rules.rookie.leagues ?? []).includes(leagueId)");
  });

  /** ⚠ 자격선이 없으면 0이 1위가 된다 — 모든 부문에 하한이 있어야 한다 */
  it("모든 부문에 자격선과 하한이 있다", () => {
    for (const d of [...RULES.pitcher, ...RULES.batter]) {
      expect(d.minIp ?? d.minPa, `${d.label} 자격선`).toBeGreaterThan(0);
      expect(d.minValue ?? d.maxValue, `${d.label} 하한`).toBeDefined();
    }
  });

  /** 비율 부문은 야구 관습 표기다 — `.312` / 장타율 1.0 이상은 앞자리를 살린다 */
  it("비율 부문 표기", () => {
    const mk = (o: Partial<PlayerSeasonStats>) => ({
      type: "batter", g: 100, pa: 300, ab: 250, h: 80, hr: 10, rbi: 40,
      sb: 10, bb: 40, k: 50, avg: 0.32, obp: 0.4, slg: 0.55, ops: 0.95, ...o,
    } as PlayerSeasonStats);
    const w = computeAwards(RULES, { P1: mk({}), P2: mk({ avg: 0.28, obp: 0.35, slg: 0.46 }) });
    expect(w.find((x) => x.defId === "obp")?.valueText).toBe(".400");
    expect(w.find((x) => x.defId === "slg")?.valueText).toBe(".550");
  });

  /** 🔴 삼진 코드가 좁혀진 뒤 누적이 옛 이름을 보고 있었다 */
  it("엔진이 좁혀진 삼진 코드를 센다", () => {
    const ME = read("packages/engine-native/src/match_engine.rs");
    expect(ME).toContain("PitchResultCode::StrikeoutSwing | PitchResultCode::StrikeoutLook\n                        => line.k += 1,");
    expect(ME).toContain("StrikeoutSwing | StrikeoutLook => {\n                        b.ab += 1; b.k += 1;");
    // 옛 갈래가 돌아오지 않는다
    expect(ME.includes("PitchResultCode::StrikeSwing | PitchResultCode::StrikeLook\n                        if cnt_reset => line.k += 1,")).toBe(false);
  });

  /** 🔴 도루는 로그만 남기고 기록을 안 남겼다 */
  it("엔진이 도루를 기록한다", () => {
    const ME = read("packages/engine-native/src/match_engine.rs");
    expect(ME).toContain("if let Some(id) = r.player_id.clone() { stole.push(id); }");
    expect(ME).toContain("if let Some(b) = lines.iter_mut().find(|x| &x.player_id == id) { b.sb += 1; }");
  });

  /** 승률은 파생값이다 — 저장된 값을 안 믿는다 */
  it("승률을 승·패에서 다시 만든다", () => {
    const H = read("apps/ui/src/shared/utils/season-helpers.ts");
    expect(H).toContain("export function winPctOf(");
    expect(H.split("winPctOf(").length - 1).toBeGreaterThanOrEqual(3);
  });
});
