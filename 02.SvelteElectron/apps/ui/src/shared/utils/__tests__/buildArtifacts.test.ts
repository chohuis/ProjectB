import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **생성물이 낡거나 새는 자리** (2026-09-04 · A 전수 조사).
 *
 * 🔴 이 저장소에는 커밋 안 하고 **만들어서 쓰는 것**이 일곱 가지다. 그중
 *    하나(`_manifest.json`)가 낡아 이벤트 18종이 조용히 안 실린 적이 있다.
 *    같은 형태가 더 없는지 훑어 **자리마다** 검사를 건다.
 *
 * 여기서 보는 것은 넷이다:
 *   ① 만드는 자리가 `npm run build` 사슬에 걸려 있는가
 *   ② 포장 목록(`build.files`)이 개발용 산출물을 빼는가
 *   ③ 생성 코드(파이썬)를 못 돌리는 자리는 **정본과 대조**되는가
 *   ④ 접은 것이 **되살아나지 않았는가** (`master.db`)
 *
 * ⚠ **파일이 있는지는 안 본다.** 갓 받은 저장소엔 아직 없는 게 정상이고,
 *   「낡았다」와 「아직 안 만들었다」가 같아 보이면 안 된다.
 *
 * ⚠ 여덟에서 일곱이 됐다 — `resource/master.db` 를 **2026-09-04 에 접었다**
 *   (사용자 확정). 그 파일이 담던 표는 `npc_master` 하나였고 Phase 6A 이후
 *   0행이었는데, 없으면 `masterDb = null` 로 조용히 지나가서 「빈 게 정상」과
 *   「빌드가 빠졌다」가 구분이 안 됐다. 아래 마지막 묶음이 그 자리를 지킨다.
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
  it.each([["data/staging"], ["data/balance"], ["data/seeds"], ["data/master/entities/players"]])(
    "%s 는 resource·dist/ui 양쪽에서 빠진다",
    (p) => {
      expect(has(`!resource/${p}/**`), `!resource/${p}/** 이 없다`).toBe(true);
      expect(has(`!dist/ui/${p}/**`), `!dist/ui/${p}/** 이 없다 — 번들 사본이 실린다`).toBe(true);
    },
  );

  it("계측 로그는 양쪽에서 빠진다 — 4.7MB 가 실리고 있었다", () => {
    expect(has("!resource/logs/**")).toBe(true);
    expect(has("!dist/ui/logs/**")).toBe(true);
  });

  it("resource 는 통째로 실린다 — 마스터 데이터·경기장 그림이 여기 있다", () => {
    expect(has("resource/**")).toBe(true);
  });
});

/**
 * **접은 것이 되살아나지 않는다** — `master.db` (2026-09-04 · 사용자 확정).
 *
 * 지운 자리가 여섯이다. 하나라도 슬며시 돌아오면 「빈 표를 만들어 아무도
 * 안 읽는」 옛 상태로 되돌아간다 — 그걸 여기서 못박는다.
 */
describe("접은 산출물 — master.db 가 안 돌아온다", () => {
  const ROOT_FILES = (p: string) => resolve(ROOT, p);

  it("build 사슬에도 dev 사슬에도 build:masterdb 가 없다", () => {
    expect(pkg.scripts["build:masterdb"], "build:masterdb 스크립트가 되살아났다").toBeUndefined();
    for (const s of ["build", "dev:desktop", "predeploy", "pack"]) {
      expect(pkg.scripts[s] ?? "", `${s} 가 build:masterdb 를 부른다`).not.toContain("masterdb");
    }
  });

  it("만들던 스크립트 파일이 없다", () => {
    expect(existsSync(ROOT_FILES("scripts/generate_master_db.cjs"))).toBe(false);
  });

  it("포장 목록에 master.db 줄이 남아 있지 않다", () => {
    expect(pkg.build.files.filter((f) => f.includes("master.db"))).toEqual([]);
  });

  it("읽던 IPC 세 자리가 다 없다 — main·preload·타입 선언", () => {
    const main = readFileSync(ROOT_FILES("apps/desktop/main.cjs"), "utf8");
    const preload = readFileSync(ROOT_FILES("apps/desktop/preload.cjs"), "utf8");
    // 핸들러 등록·브리지 노출만 본다. 「왜 지웠나」를 적은 주석은 남아 있어야 한다
    expect(main.includes('ipcMain.handle("master:loadEntities"')).toBe(false);
    expect(main.includes("new Database(masterDbPath")).toBe(false);
    expect(preload.includes("masterLoadEntities:")).toBe(false);
  });

  it("행 변환기(masterRowToEntityRow)를 db.cjs 가 더는 내보내지 않는다", () => {
    const db = readFileSync(ROOT_FILES("apps/desktop/ipc/db.cjs"), "utf8");
    expect(db.includes("function masterRowToEntityRow")).toBe(false);
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
    expect(
      [...inGen].filter((id) => !inRefs.has(id)),
      "생성물에만 있는 팀",
    ).toEqual([]);
    expect(
      [...inRefs].filter((id) => !inGen.has(id)),
      "refs 에만 있는 팀",
    ).toEqual([]);
  });
});
