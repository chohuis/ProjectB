import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accumulateStats, sanitizeStatsRecord, fpctOf } from "../season-helpers";
import type { PlayerGameLine } from "../../types/season";
import type { BatterSeasonStats } from "../../types/save";

/**
 * **수비 기록 집계·저장·복원** (G-3 · 2026-08-29).
 *
 * ⚠ **네 층을 다 넓혀야 한다** — v12에서 겪은 그대로다. 하나만 넓히면
 *   조용히 null이 되고 시즌이 넘어가는 순간 사라진다:
 *
 *     스키마(db.cjs v13) → INSERT(main.cjs) → 저장(seasonRollover) → 복원(LeaguePage)
 *
 * 실측: 16칸 전부 저장→조회 왕복 확인(`user_version = 13`).
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const line = (o: Partial<Record<string, number>>): PlayerGameLine =>
  ({
    role: "batter",
    playerId: "P1",
    ab: 4,
    h: 1,
    hr: 0,
    rbi: 0,
    bb: 0,
    k: 1,
    sb: 0,
    ...o,
  }) as PlayerGameLine;

describe("수비 기록 집계", () => {
  it("수비율 식", () => {
    // (자살 + 보살) / (자살 + 보살 + 실책)
    expect(fpctOf(240, 320, 11)).toBe(0.981);
    // ⚠ 기회가 없으면 0이다 — 1로 두면 **한 번도 안 잡은 선수가 완벽한 수비수**다
    expect(fpctOf(0, 0, 0)).toBe(0);
  });

  it("경기 줄에서 누적한다", () => {
    let s = accumulateStats({}, [line({ e: 1, a: 2, po: 3 })]);
    s = accumulateStats(s, [line({ e: 0, a: 1, po: 2 })]);
    const b = s.P1 as BatterSeasonStats;
    expect(b.e).toBe(1);
    expect(b.a).toBe(3);
    expect(b.po).toBe(5);
    expect(b.fpct).toBe(fpctOf(5, 3, 1));
  });

  /** 🔴 없는 것과 0을 가른다 — 0이면 "실책 0인 수비수"가 되어 거짓이다 */
  it("구 세이브는 칸을 안 만든다", () => {
    const s = accumulateStats({}, [line({})]);
    const b = s.P1 as BatterSeasonStats;
    expect(b.e).toBeUndefined();
    expect(b.fpct).toBeUndefined();
  });

  /** ⚠ 파생값이라 저장된 값을 안 믿는다 — era·whip 과 같은 취급 */
  it("로드에서 수비율을 다시 만든다", () => {
    const dirty = {
      P1: {
        type: "batter",
        g: 10,
        pa: 40,
        ab: 36,
        h: 10,
        hr: 1,
        rbi: 5,
        sb: 0,
        bb: 4,
        k: 8,
        avg: 0,
        obp: 0,
        slg: 0,
        ops: 0,
        e: 2,
        a: 10,
        po: 20,
        fpct: 0.999,
      } as BatterSeasonStats,
    };
    const clean = sanitizeStatsRecord(dirty) as Record<string, BatterSeasonStats>;
    expect(clean.P1.fpct).toBe(fpctOf(20, 10, 2));
  });
});

describe("수비 기록 저장 (v13)", () => {
  const DB = read("apps/desktop/ipc/db.cjs");
  const COLS = ["def_e", "def_a", "def_po", "fpct"];

  it("스키마에 네 칸이 있다", () => {
    expect(DB).toContain("if (currentVersion < 13) {");
    for (const c of COLS) expect(DB, c).toContain(`"${c}"`);
  });

  /** 🔴 v13을 v12 앞에 넣으면 버전이 덮여 영원히 다시 돈다 */
  it("v13이 v12 뒤에 온다", () => {
    expect(DB.indexOf("currentVersion < 13")).toBeGreaterThan(DB.indexOf("currentVersion < 12"));
  });

  it("INSERT 자리표시자가 맞는다", () => {
    const MAIN = read("apps/desktop/main.cjs");
    const at = MAIN.indexOf("INSERT OR REPLACE INTO history_lb_stats");
    const body = MAIN.slice(at, MAIN.indexOf("`", at));
    expect((body.match(/\?/g) ?? []).length).toBe(48);
    for (const c of COLS) expect(body, c).toContain(c);
  });

  it("저장이 네 칸을 보낸다", () => {
    const R = read("apps/ui/src/shared/usecases/seasonRollover.ts");
    for (const k of ["defE:", "defA:", "defPo:", "fpct:"]) expect(R, k).toContain(k);
  });

  it("복원이 네 칸을 되살린다", () => {
    const LP = read("apps/ui/src/pages/league/LeaguePage.svelte");
    for (const c of COLS) expect(LP, c).toContain(`r.${c}`);
    // ⚠ `?? 0`으로 채우지 않는다
    expect(LP.includes("e: r.def_e ?? 0")).toBe(false);
  });

  it("화면이 표시한다", () => {
    for (const f of [
      "apps/ui/src/pages/status/StatusPage.svelte",
      "apps/ui/src/features/player/ui/PlayerDetailModal.svelte",
    ]) {
      expect(read(f), f).toContain('"FPCT"');
    }
  });
});
