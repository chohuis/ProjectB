import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * **추첨 풀 배선.**
 *
 * 🔴 풀 파일 경로가 `stores/master.ts`에 **한 줄씩 박혀** 있었다. 새 풀을
 * 만들어도 아무도 안 읽고, 오류도 로그도 안 난다 — 그 풀에 들어간 이벤트가
 * 영원히 안 뜬다. 이벤트·업적은 이미 매니페스트로 읽는데 풀만 빠져 있었다.
 * 2026-08-25에 `POOL_TRAIN_DAILY`·`POOL_BODY_DAILY`를 만들다 걸렸다.
 *
 * 이제 매니페스트가 정본이다. 이 검사는 **매니페스트·풀 파일·규칙 셋이
 * 서로 어긋나지 않는 것**을 지킨다.
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const manifest = JSON.parse(readFileSync(join(MASTER, "_manifest.json"), "utf8")) as { pools?: string[] };

type Pool = { id?: string; baseRoll?: { value: number }; maxPicksPerWeek?: number };

const poolFiles = readdirSync(join(MASTER, "events/pools"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ name: f.replace(/\.json$/, ""), json: JSON.parse(readFileSync(join(MASTER, "events/pools", f), "utf8")) as Pool }));
/** ⚠ `military_*`는 모양이 다르다 — 군 이벤트 표지 추첨 풀이 아니다 */
const drawPools = poolFiles.filter((p) => typeof p.json.id === "string" && p.json.id.startsWith("POOL_") && p.json.baseRoll);

function walk(dir: string): string[] {
  const { statSync } = require("node:fs") as typeof import("node:fs");
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : [];
  });
}
const RANDOM = walk(join(MASTER, "events/random"))
  .map((f) => JSON.parse(readFileSync(f, "utf8")) as { id: string; poolId?: string });

describe("추첨 풀", () => {
  it("매니페스트가 추첨 풀을 전부 싣는다", () => {
    expect(manifest.pools).toBeDefined();
    expect([...(manifest.pools ?? [])].sort()).toEqual(drawPools.map((p) => p.name).sort());
  });

  /** 🔴 규칙이 없는 풀을 가리키면 그 이벤트는 영원히 안 뜬다 */
  it("규칙이 가리키는 풀이 전부 존재한다", () => {
    const known = new Set(drawPools.map((p) => p.json.id));
    const orphans = RANDOM.filter((r) => r.poolId && !known.has(r.poolId)).map((r) => `${r.id} → ${r.poolId}`);
    expect(orphans).toEqual([]);
  });

  it("빈 풀이 없다 — 추첨률만 먹고 아무것도 안 뽑는 풀", () => {
    const empty = drawPools.filter((p) => !RANDOM.some((r) => r.poolId === p.json.id)).map((p) => p.json.id);
    expect(empty).toEqual([]);
  });

  /**
   * ⚠ 추첨률 총합은 **주당 기대 랜덤 소식 건수**다(풀마다 독립 추첨,
   * `maxPicksPerWeek` 1). 2026-08-25에 team_life 하나를 셋으로 가르며
   * 26% → 48%(train 13 · body 9 · team 26)로 올렸다 — 42종이 35뽑기를
   * 나누던 걸 65뽑기로 늘린 것이다. 여기에 media 18 · social 22가 더해진다.
   *
   * 상한을 둔 이유: 소식함은 200통이고 **코드가 직접 만드는 소식 45자리**가
   * 따로 있다. 랜덤을 무한정 올리면 이야기가 알림에 밀린다.
   */
  it("주당 기대 랜덤 소식이 1.2건을 넘지 않는다", () => {
    const total = drawPools.reduce((a, p) => a + (p.json.baseRoll?.value ?? 0) * (p.json.maxPicksPerWeek ?? 1), 0) / 100;
    expect(total).toBeLessThanOrEqual(1.2);
  });
});
