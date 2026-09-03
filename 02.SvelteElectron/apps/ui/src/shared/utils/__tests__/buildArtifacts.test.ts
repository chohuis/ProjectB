import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **생성물이 낡거나 새는 자리** (2026-09-04 · A 전수 조사).
 *
 * 🔴 이 저장소에는 커밋 안 하고 **만들어서 쓰는 것**이 여덟 가지다. 그중
 *    하나(`_manifest.json`)가 낡아 이벤트 18종이 조용히 안 실린 적이 있다.
 *    같은 형태가 더 없는지 훑어 **자리마다** 검사를 건다.
 *
 * 여기서 보는 것은 셋이다:
 *   ① 만드는 자리가 `npm run build` 사슬에 걸려 있는가
 *   ② 포장 목록(`build.files`)이 개발용 산출물을 빼는가
 *   ③ 생성 코드(파이썬)를 못 돌리는 자리는 **정본과 대조**되는가
 *
 * ⚠ **파일이 있는지는 안 본다.** 갓 받은 저장소엔 아직 없는 게 정상이고,
 *   「낡았다」와 「아직 안 만들었다」가 같아 보이면 안 된다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
  build: { files: string[] };
};

describe("빌드 사슬 — 만드는 자리가 걸려 있다", () => {
  /** `npm run build` 가 실제로 부르는 것들 (한 겹 펼친다) */
  const chain = (name: string, depth = 0): string[] => {
    const s = pkg.scripts[name];
    if (!s || depth > 3) return [];
    const out = [name];
    for (const m of s.split("&&").map((x) => x.trim())) {
      const sub = m.startsWith("npm run ") ? m.slice(8).split(" ")[0] : "";
      if (sub) out.push(...chain(sub, depth + 1));
    }
    return out;
  };

  const built = new Set(chain("build"));

  it.each([
    ["이벤트·업적 목록 (_manifest.json)", "gen:manifest"],
    ["마스터 DB (resource/master.db)", "build:masterdb"],
    ["패키지 dist (contracts·core)", "build:packages"],
    ["화면 번들 (dist/ui)", "build:ui"],
  ])("%s 는 build 가 만든다", (_what, script) => {
    expect(built.has(script), `${script} 가 build 사슬에 없다`).toBe(true);
  });

  /** ⚠ `prebuild` 는 npm 이 `build` 앞에 **자동으로** 부른다 — 사슬에 안 적힌다 */
  it("네이티브 엔진은 prebuild 가 만든다", () => {
    expect(pkg.scripts.prebuild).toContain("build:native");
  });
});

describe("포장 목록 — 개발용이 안 실린다", () => {
  const files = pkg.build.files;
  const has = (g: string) => files.includes(g);

  /**
   * 🔴 **`resource/` 는 두 번 실린다.** `vite.config.ts` 가 `publicDir` 로
   *    그 폴더를 통째로 `dist/ui/` 에 복사하는데, 포장 목록은 `dist/ui/**`
   *    를 통째로 넣는다 — 그래서 `!resource/…` 로 뺀 것이 **번들 사본으로
   *    그대로 들어간다.** 뺄 자리는 언제나 둘이다.
   */
  it.each([
    ["data/staging"], ["data/balance"], ["data/seeds"],
    ["data/master/entities/players"],
  ])("%s 는 resource·dist/ui 양쪽에서 빠진다", (p) => {
    expect(has(`!resource/${p}/**`), `!resource/${p}/** 이 없다`).toBe(true);
    expect(has(`!dist/ui/${p}/**`), `!dist/ui/${p}/** 이 없다 — 번들 사본이 실린다`).toBe(true);
  });

  it("계측 로그는 양쪽에서 빠진다 — 4.7MB 가 실리고 있었다", () => {
    expect(has("!resource/logs/**")).toBe(true);
    expect(has("!dist/ui/logs/**")).toBe(true);
  });

  it("마스터 DB 는 resource 것만 실린다 — 번들 사본은 아무도 안 읽는다", () => {
    // `main.cjs` 는 `unpackedPath("resource", "master.db")` 를 연다
    expect(has("!dist/ui/master.db")).toBe(true);
    expect(has("resource/**")).toBe(true);
  });
});

describe("생성물 대 정본 — 파이썬을 못 돌리는 자리", () => {
  /**
   * `leagueTeams.generated.ts` 는 `build_refs_from_seeds.py` 가 만든다.
   * 이 환경에 파이썬이 없어 **다시 만들어 볼 수가 없다** — 그래서 정본
   * (`refs.json`)과 대조만 한다. 대회 주차는 `tournamentWeeks.test.ts` 가
   * 이미 CSV 와 맞춰 보고 있고, 여기는 **팀 목록**이 그 자리다.
   */
  const REFS = resolve(ROOT, "resource/data/master/entities/refs.json");
  const GEN = resolve(ROOT, "apps/ui/src/shared/utils/leagueTeams.generated.ts");

  it("생성물의 팀 id 가 refs.json 과 한 개도 안 어긋난다", () => {
    expect(existsSync(REFS) && existsSync(GEN)).toBe(true);
    const refs = JSON.parse(readFileSync(REFS, "utf8")) as { teams: { id: string }[] };
    const src = readFileSync(GEN, "utf8");
    const inGen = new Set((src.match(/"TEAM_[A-Z0-9_]+"/g) ?? []).map((s) => s.slice(1, -1)));
    const inRefs = new Set(refs.teams.map((t) => t.id));
    expect([...inGen].filter((id) => !inRefs.has(id)), "생성물에만 있는 팀").toEqual([]);
    expect([...inRefs].filter((id) => !inGen.has(id)), "refs 에만 있는 팀").toEqual([]);
  });
});
