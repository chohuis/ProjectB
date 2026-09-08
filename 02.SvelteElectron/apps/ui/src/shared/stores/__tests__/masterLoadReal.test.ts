/**
 * **진짜 데이터로 진짜 로더를 돌린다** — 「게임이 안 뜬다」를 잡는 자리
 * (2026-09-08 · A · L4 실사고).
 *
 * 🔴 왜 있나. 조건 표 하나가 어긋나 `assertConditions` 가 던졌고 **마스터 로드가
 *   통째로 죽어 게임이 안 떴다.** 그런데 `npm test` 2,642 건이 전부 통과했다 —
 *   **마스터 로드를 실제로 도는 검사가 하나도 없었기 때문**이다. 부품은 다들
 *   따로 검사받는데 **조립해서 켜 보는 자리**가 없었다.
 *
 * 여기서는 `window.projectB.masterFetch` 를 디스크로 이어 주고 **실제 로더**
 * (`masterStore.reloadEvents` → `loadEventsFromManifest` → `parseEventRule` →
 * `assertConditions`)를 그대로 돌린다. 전자(electron)가 필요 없다 — 로더가
 * 파일을 어떻게 얻는지만 갈아 끼우는 것이라 **같은 코드가 돈다.**
 *
 * ⚠ **`load()` 가 아니라 `reloadEvents()` 를 쓴다.** `load()` 는 예외를 삼키고
 *   `console.warn("[masterStore] load failed")` 만 남긴다 — 그 삼킴이 이번 사고에서
 *   증상을 「고교 팀이 없다」로 옮겨 놓은 자리다. 검사는 **던지는 쪽**을 봐야 한다.
 * ⚠ 이벤트만 본다. 여기서 규칙·문안까지 다 켜면 느려지고, 이번에 깨진 자리는
 *   이벤트 파서다. 다른 갈래가 깨지면 그때 이 파일에 한 줄 더한다.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { get } from "svelte/store";
import { masterStore } from "../master";

const MASTER = resolve(process.cwd(), "resource/data/master");

beforeAll(() => {
  // 로더가 파일을 얻는 통로만 갈아 끼운다 — 파싱·검증은 진짜 코드가 한다
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { projectB: unknown }).projectB = {
    masterFetch: async (rel: string) => {
      const p = resolve(MASTER, rel);
      return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
    },
  };
});

describe("마스터 로더 — 진짜 데이터로 켜 본다", () => {
  it("🔴 이벤트가 전부 로드된다 — 조건 하나만 어긋나도 여기서 던진다", async () => {
    if (!existsSync(resolve(MASTER, "_manifest.json"))) {
      throw new Error("_manifest.json 이 없다 — `npm run gen:manifest` 를 먼저 돌려라");
    }
    // 던지면 그대로 실패다. 삼키지 않는다 — 삼키는 것이 이번 사고의 절반이었다
    await masterStore.reloadEvents();

    const rules = get(masterStore).eventRules;
    // 0 건이면 「조용히 통과하는 검사」다 — 못 읽고 초록을 내면 안 된다
    expect(rules.length).toBeGreaterThan(500);
  });

  it("로드된 규칙에 id·title 이 다 있다 — 파서가 조용히 빈 규칙을 만들지 않는다", () => {
    const rules = get(masterStore).eventRules;
    const broken = rules.filter((r) => !r.id || !r.title);
    expect(broken.map((r) => r.id)).toEqual([]);
  });
});
