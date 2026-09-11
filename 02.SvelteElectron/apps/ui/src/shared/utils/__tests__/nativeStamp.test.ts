import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

/**
 * **낡은 `.node` 로 계측하면 그 자리에서 안다** (2026-09-04 · A).
 *
 * 🔴 `packages/engine-native/*.node` 는 git 에 없다. Rust 를 고치고
 *    `npm run build:native` 를 빼먹으면 **옛 엔진 그대로 돌고 아무도 안
 *    알려 준다** — 09-04 에 D 의 NPC 덤프가 빨갛게 나온 게 그것이었다.
 *    규칙은 이미 고쳐져 있었고 바이너리만 옛것이었다.
 *
 * 🔴 **시각으로는 못 본다.** cargo 가 캐시를 맞히면(`Finished in 0.08s`)
 *    `.node` 를 새로 안 쓴다 — napi 는 `index.js` 만 다시 뱉는다. 실측으로
 *    `index.js` 08:58 · `.node` 전날 19:39 이 나왔다. 그래서 **내용 해시**다.
 *
 * 여기서 못박는 것 넷:
 *   ① 도장을 찍는 자리 — `build:native` 가 소스 해시를 산물 옆에 남긴다
 *   ② 도장을 보는 자리 — 계측·회귀가 다 지나는 `headless.boot()` 맨 앞
 *   ③ 해시 규칙 — 내용이 바뀌면·이름이 바뀌면 달라지고, 그 밖엔 안 달라진다
 *   ④ 지금 이 작업 폴더가 실제로 맞는가 (도장이 있을 때만)
 */

const require_ = createRequire(import.meta.url);
const ROOT = resolve(__dirname, "../../../../../..");
const stampMod = require_(resolve(ROOT, "scripts/native-stamp.cjs")) as {
  NATIVE_DIR: string;
  STAMP_FILE: string;
  ESCAPE_ENV: string;
  listSourceFiles: () => string[];
  hashFiles: (files: string[], baseDir: string) => string;
  computeSourceHash: () => { hash: string; fileCount: number };
  findNodeBinary: () => string | null;
  readStamp: () => null | { sourceHash: string; nodeHash: string; builtAt: string };
  checkStamp: () => { ok: boolean; reason?: string; message?: string };
};

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("① 도장을 찍는 자리 — build:native 가 남긴다", () => {
  it("build:native 가 빌드 뒤에 native-stamp 를 부른다", () => {
    const s = pkg.scripts["build:native"] ?? "";
    expect(s.includes("scripts/native-stamp.cjs"), "build:native 가 도장을 안 찍는다").toBe(true);
    expect(s.includes("--write")).toBe(true);
    // 순서가 중요하다 — 빌드가 **성공한 뒤에** 찍어야 한다
    expect(s.indexOf("engine-native")).toBeLessThan(s.indexOf("native-stamp"));
  });

  it("사람이 직접 대조할 수 있는 명령이 있다 (check:native)", () => {
    expect(pkg.scripts["check:native"] ?? "").toContain("--check");
  });

  it("도장은 산물과 짝이라 git 에 안 들어간다", () => {
    const ig = readFileSync(resolve(ROOT, ".gitignore"), "utf8");
    expect(ig.includes(".native-stamp.json"), "도장이 gitignore 에 없다").toBe(true);
  });
});

describe("② 도장을 보는 자리 — 계측이 여기를 지난다", () => {
  const headless = readFileSync(resolve(ROOT, "scripts/perf/headless.cjs"), "utf8");

  it("headless 가 native-stamp 의 assertFresh 를 부른다", () => {
    expect(headless.includes("native-stamp.cjs")).toBe(true);
    expect(headless.includes("assertFresh")).toBe(true);
  });

  it("계측을 **시작하기 전에** 본다 — 임시 폴더를 만들기 전이다", () => {
    const at = headless.indexOf("assertFresh");
    const mk = headless.indexOf("mkdtempSync");
    expect(at).toBeGreaterThan(-1);
    expect(mk).toBeGreaterThan(-1);
    expect(at, "낡음 검사가 부팅 뒤로 밀려 있다").toBeLessThan(mk);
  });
});

describe("③ 해시 규칙 — 임시 폴더로 확인한다 (진짜 소스는 안 건드린다)", () => {
  /** 파일 몇 개를 만들고 해시를 받아 온다 */
  const withFixture = <T>(
    files: Record<string, string>,
    fn: (dir: string, paths: string[]) => T,
  ): T => {
    const dir = mkdtempSync(join(tmpdir(), "native-stamp-"));
    try {
      const paths = Object.entries(files).map(([name, body]) => {
        const p = join(dir, name);
        writeFileSync(p, body, "utf8");
        return p;
      });
      return fn(dir, paths);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("같은 내용·같은 이름이면 같은 해시다", () => {
    const a = withFixture({ "a.rs": "fn a() {}", "b.rs": "fn b() {}" }, (d, p) =>
      stampMod.hashFiles(p, d),
    );
    const b = withFixture({ "a.rs": "fn a() {}", "b.rs": "fn b() {}" }, (d, p) =>
      stampMod.hashFiles(p, d),
    );
    expect(a).toBe(b);
  });

  it("목록 순서가 달라도 같은 해시다 — 파일 시스템 순서에 안 기댄다", () => {
    const [fwd, rev] = withFixture({ "a.rs": "x", "b.rs": "y" }, (d, p) => [
      stampMod.hashFiles(p, d),
      stampMod.hashFiles([...p].reverse(), d),
    ]);
    expect(fwd).toBe(rev);
  });

  it("한 글자만 바뀌어도 해시가 달라진다 — 이게 잡으려던 것이다", () => {
    const before = withFixture({ "a.rs": "let x = 1;" }, (d, p) => stampMod.hashFiles(p, d));
    const after = withFixture({ "a.rs": "let x = 2;" }, (d, p) => stampMod.hashFiles(p, d));
    expect(after).not.toBe(before);
  });

  it("내용이 같아도 **이름이 바뀌면** 달라진다 (경로도 해시에 넣는다)", () => {
    const asA = withFixture({ "a.rs": "same" }, (d, p) => stampMod.hashFiles(p, d));
    const asB = withFixture({ "b.rs": "same" }, (d, p) => stampMod.hashFiles(p, d));
    expect(asB).not.toBe(asA);
  });

  it("이어붙이기로 헷갈리지 않는다 — 길이를 같이 넣는다", () => {
    // 경로만 다르고 이어붙이면 같아지는 짝: ("ab","c") 대 ("a","bc")
    const one = withFixture({ "f.rs": "ab", "g.rs": "c" }, (d, p) => stampMod.hashFiles(p, d));
    const two = withFixture({ "f.rs": "a", "g.rs": "bc" }, (d, p) => stampMod.hashFiles(p, d));
    expect(two).not.toBe(one);
  });

  it("옮겨진 파일도 잡는다 — 폴더가 바뀌면 상대경로가 바뀐다", () => {
    const dir = mkdtempSync(join(tmpdir(), "native-stamp-"));
    try {
      const flat = join(dir, "a.rs");
      writeFileSync(flat, "fn a() {}", "utf8");
      const h1 = stampMod.hashFiles([flat], dir);
      const moved = join(dir, "moved.rs");
      renameSync(flat, moved);
      const h2 = stampMod.hashFiles([moved], dir);
      expect(h2).not.toBe(h1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("③-b 해싱 대상 — 엔진을 바꾸는 것만 본다", () => {
  const files = stampMod.listSourceFiles().map((f) => f.split("\\").join("/"));

  it("Rust 소스가 실제로 잡힌다 (36개 언저리)", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter((f) => f.endsWith(".rs")).length).toBeGreaterThan(20);
  });

  it("Cargo.toml 과 Cargo.lock 도 본다 — 의존성이 바뀌면 엔진이 바뀐다", () => {
    expect(files.some((f) => f.endsWith("/Cargo.toml"))).toBe(true);
    expect(files.some((f) => f.endsWith("/Cargo.lock"))).toBe(true);
  });

  it("산물은 안 본다 — target/ · .node · napi 가 만든 index.*", () => {
    expect(files.filter((f) => f.includes("/target/"))).toEqual([]);
    expect(files.filter((f) => f.endsWith(".node"))).toEqual([]);
    expect(files.filter((f) => f.endsWith("/index.js") || f.endsWith("/index.d.ts"))).toEqual([]);
  });
});

describe("④ 지금 이 작업 폴더", () => {
  /**
   * 도장이 있을 때만 본다. 갓 받은 저장소엔 `.node` 도 도장도 없는 게
   * 정상이고, 「낡았다」와 「아직 안 만들었다」가 같아 보이면 안 된다.
   * **도장이 있는데 소스와 안 맞으면 그건 진짜 낡은 것**이라 여기서 빨개진다
   * — `npm test` 만 돌려도 「Rust 고치고 빌드 안 했다」가 잡힌다.
   */
  const hasStamp = existsSync(stampMod.STAMP_FILE) && stampMod.findNodeBinary() !== null;

  it.skipIf(!hasStamp)(".node 가 지금 Rust 소스에서 나온 것이다", () => {
    const res = stampMod.checkStamp();
    expect(res.ok, `${res.reason}: ${res.message} — npm run build:native`).toBe(true);
  });

  it("탈출구 이름이 안내 문구와 같다", () => {
    expect(stampMod.ESCAPE_ENV).toBe("PB_ALLOW_STALE_NATIVE");
    const headless = readFileSync(resolve(ROOT, "scripts/perf/headless.cjs"), "utf8");
    expect(
      headless.includes(stampMod.ESCAPE_ENV),
      "헤드리스 주석이 탈출구를 다르게 적어 뒀다",
    ).toBe(true);
  });
});
