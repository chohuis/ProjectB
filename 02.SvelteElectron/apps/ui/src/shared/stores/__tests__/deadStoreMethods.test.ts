import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **`gameStore` 메서드 중 아무도 안 부르는 것** (2026-09-30 · 항목 3).
 *
 * 🔴 왜 검사로 못박나. 09-27 전수에서 열둘이 나왔는데 **손대지 않고 넘겼고**,
 *   그 뒤로 늘어났는지 줄었는지 아무도 몰랐다. 「호출부 0」은 조용하다 —
 *   타입도 맞고 빌드도 되고 화면도 뜬다.
 *
 * 🔴 **죽은 것과 아직 안 부른 것은 다르다**(`CLAUDE.md`).
 *   · **죽은 것** — 같은 일을 하는 자리가 이미 따로 있다(정본 둘). 지운다.
 *   · **아직 안 부른 것** — 읽는 쪽은 살아 있는데 쓰는 자리를 안 불렀다.
 *     지우면 되살릴 자리가 없어진다. 남기고 주석을 적는다.
 *
 * 2026-09-30 판정 — 지운 열 · 남긴 하나 · 잣대가 틀려서 살아 있던 하나:
 *
 * ```
 *   지운 열  recordTrainingWeek     applyWeekEndBatch 가 같은 계수기를 올린다
 *            updatePopularity      applyPopularityChange 와 글자까지 같다
 *            updateScoutScore      applyScoutScoreChange 와 글자까지 같다
 *            appendCareerDraftPickLog  npcDraft.ts 가 로그를 직접 적는다
 *            clearCareerDraftPickLog   같은 자리
 *            completePitchLearning     Rust 성장 엔진이 pitchStateAction 으로 낸다
 *            advancePitchProgress      같은 자리
 *            initNpcsForNewGame        읽는 시나리오 칸을 아무도 안 읽는다
 *            saveTop10Snapshot         applyWeekEndBatch 가 같은 칸을 적는다
 *            hydrate                   「App.svelte 호환」이라 적혀 있는데 그 호출이 없다
 *
 *   남긴 하나 markDraftTriggered   히든 `EVT_HID_UNIV_EARLY_CALL` 이
 *                                  `school.draftTriggered` 를 읽는다 — 쓰는 자리가
 *                                  이것뿐이라 지우면 그 이벤트를 영영 못 연다
 *
 *   살아 있던 하나 setCareerDraftCandidates
 *                                  `gameStore.…` 로만 세면 0 이지만
 *                                  `npcDraft.ts` 가 `ctx.store.…` 로 부른다 —
 *                                  **잣대가 먼저 틀렸다**
 * ```
 *
 * ⚠ 검사에 정규식을 쓰지 않는다 — 문자열 비교만.
 */
const ROOT = resolve(__dirname, "../../../../../..");

/** 훑는 범위 — 화면·유스케이스·계측 전부. `gameStore.` 를 부를 수 있는 곳이다 */
const SCAN_DIRS = ["apps/ui/src", "scripts"];
const STORE = "apps/ui/src/shared/stores/game.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      walk(rel, out);
      continue;
    }
    if (!/\.(ts|svelte|cjs|mjs)$/.test(e.name)) continue;
    if (e.name.endsWith(".d.ts")) continue;
    out.push(rel);
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap((d) => (statSync(resolve(ROOT, d)).isDirectory() ? walk(d) : []));
const SOURCES = FILES.filter((f) => f !== STORE).map(
  (f) => [f, readFileSync(resolve(ROOT, f), "utf8")] as const,
);
const STORE_SRC = readFileSync(resolve(ROOT, STORE), "utf8");

/**
 * store 메서드 이름 전수 — `game.ts` 가 돌려주는 객체의 들여쓰기 4칸 자리다.
 *
 * ⚠ **목록을 손으로 적지 않는다.** 적으면 새 메서드가 생겨도 안 잡힌다 —
 *   이 저장소가 `RETIRED_NPC_COLUMNS` 에서 밟은 형태다.
 */
function storeMethodNames(): string[] {
  const out = new Set<string>();
  for (const line of STORE_SRC.split("\n")) {
    if (!line.startsWith("    ")) continue;
    const body = line.slice(4);
    if (body.startsWith(" ") || body.startsWith("/") || body.startsWith("*")) continue;
    const open = body.indexOf("(");
    if (open <= 0) continue;
    const name = body.slice(0, open).replace("async ", "").trim();
    if (!name || name.includes(" ") || name.includes(".") || name.includes(":")) continue;
    // `if (`·`for (`·`return (` 같은 문장은 걸러낸다
    if (["if", "for", "while", "switch", "return", "catch"].includes(name)) continue;
    out.add(name);
  }
  return [...out].sort();
}

/** 부르는 자리 — `.name(` 를 그대로 찾는다(`gameStore.` · `ctx.store.` 둘 다 잡힌다) */
function callSites(name: string): string[] {
  const needle = `.${name}(`;
  return SOURCES.filter(([, t]) => t.includes(needle)).map(([f]) => f);
}

describe("store 메서드 — 호출부 전수", () => {
  it("메서드를 손 목록 없이 긁어낸다 — 백 개가 넘는다", () => {
    expect(storeMethodNames().length).toBeGreaterThan(80);
  });

  /**
   * 🔴 **여기서 늘어나면 새 죽은 칸이 생긴 것이다.**
   *
   * 남는 하나(`markDraftTriggered`)는 「아직 안 부른 것」이고 그 이유가
   * `game.ts` 의 그 자리 주석에 적혀 있다.
   */
  it("🔴 호출부 0 인 메서드는 `markDraftTriggered` 하나뿐이다", () => {
    const dead = storeMethodNames().filter((n) => callSites(n).length === 0);
    expect(dead, "호출부 0 — 죽은 것인지 아직 안 부른 것인지 판정하고 주석을 남긴다").toEqual([
      "markDraftTriggered",
    ]);
  });

  it("🔴 남긴 하나에는 왜 남겼는지가 적혀 있다 — 주석 없이 남기면 다음 사람이 지운다", () => {
    expect(STORE_SRC).toContain("아직 안 부른 것이다 — 죽은 칸이 아니다");
    expect(STORE_SRC).toContain("EVT_HID_UNIV_EARLY_CALL");
  });

  it("🔴 지운 열은 정의가 남아 있지 않다 — 되살리면 정본이 둘이다", () => {
    const gone = [
      "recordTrainingWeek",
      "updatePopularity",
      "updateScoutScore",
      "appendCareerDraftPickLog",
      "clearCareerDraftPickLog",
      "completePitchLearning",
      "advancePitchProgress",
      "initNpcsForNewGame",
      "saveTop10Snapshot",
    ];
    const revived = gone.filter((n) => storeMethodNames().includes(n));
    expect(revived, "지운 메서드가 되살아났다").toEqual([]);
  });

  /**
   * 🔴 **살아 있는 쌍을 못박는다.** 지운 것과 **같은 일을 하는 자리**가
   *   없어지면 그 기능이 조용히 사라진다.
   */
  it("지운 것의 짝이 살아 있다 — 인기도·주목도·훈련 주 수·TOP10", () => {
    expect(callSites("applyPopularityChange").length).toBeGreaterThan(0);
    expect(callSites("applyScoutScoreChange").length).toBeGreaterThan(0);
    // 훈련 주 수와 TOP10 스냅샷은 주차 마감 한 자리가 든다
    expect(callSites("applyWeekEndBatch").length).toBeGreaterThan(0);
  });
});
