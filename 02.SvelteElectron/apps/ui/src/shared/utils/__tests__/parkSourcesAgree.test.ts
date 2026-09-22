import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { NEUTRAL_DIMS } from "../parkDims";
import { PARK_TIER_OF, PARK_IMAGES, parkTierOf, type ParkTier } from "../parkAnchors";

/**
 * 구장 정본이 여럿이다 — **겹치는 칸에서 같은가.**
 *
 * 🔴 왜 있나 (2026-09-22 실측 · `docs/SIM_OVERSEAS_CLUBS_STAGE0_2026-09-22.md` §3).
 *   「어떤 구장이 있고 치수가 얼마인가」가 **네 곳**에 있었다 —
 *   `refs.json`(게임이 읽는다) · `park/_spec/stadiums.json`(그림 검사가 읽는다) ·
 *   `PARK_TIER_OF` · `PARK_IMAGES`. 지금 겹치는 칸은 0칸 차이지만
 *   **기계가 보는 검사가 하나도 없었다.** 그리고 중립 기본값이 **둘**이다 —
 *   TS `NEUTRAL_DIMS` 와 Rust `impl Default for ParkDims`. TS 주석이
 *   "엔진 기본값과 같아야 한다"고 적고 있을 뿐이었다.
 *
 * ⚠ **값을 글자로 박지 않는다.** 여기 숫자를 베껴 적으면 값을 고칠 때 검사도
 *   같이 고치게 되어 아무것도 못 잡는다. 서로를 읽어서 비교한다.
 *
 * 넷 중 하나는 이 작업에서 줄였다 — `PARK_IMAGES` 는 이제 `PARK_TIER_OF` 의
 * 키에서 파생된다. 남은 셋은 역할이 달라 합칠 수 없다(런타임 · 그림 검사 ·
 * 번들 안 좌표표). 대신 여기서 묶는다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

interface RefStadium {
  id: string;
  name: string;
  parkFactor?: string;
  capacity?: number;
  dist?: { lf: number; cf: number; rf: number; fence: number };
}
interface SpecStadium {
  id: string;
  name: string;
  tier: string;
  pf: string;
  dist: { lf: number; cf: number; rf: number; fence: number };
}

const refs = JSON.parse(read("resource/data/master/entities/refs.json")) as {
  stadiums: RefStadium[];
};
const spec = JSON.parse(read("resource/park/_spec/stadiums.json")) as SpecStadium[];

/** `_spec` 의 한글 티어 → 코드 티어. `check-park.cjs` 와 같은 표다 */
const TIER_KEY: Record<string, ParkTier> = {
  프로: "pro",
  대학: "university",
  독립: "university",
  고교: "highschool",
};

describe("구장 정본이 서로 맞는가", () => {
  const specById = new Map(spec.map((s) => [s.id, s]));
  const refById = new Map(refs.stadiums.map((s) => [s.id, s]));
  /** 둘 다 가진 구장에서만 비교한다 — 해외가 한쪽에만 들어오는 중이다 */
  const shared = spec.filter((s) => refById.has(s.id));

  it("겹치는 구장이 있다 — 없으면 이 검사가 헛돈다", () => {
    expect(shared.length).toBeGreaterThan(20);
  });

  it("`_spec` 의 구장은 전부 `refs` 에도 있다", () => {
    const only = spec.filter((s) => !refById.has(s.id)).map((s) => s.id);
    expect(only, `그림 명세에만 있는 구장: ${only.join(" ")}`).toEqual([]);
  });

  it("이름·파크팩터가 같다", () => {
    const bad: string[] = [];
    for (const s of shared) {
      const r = refById.get(s.id)!;
      if (r.name !== s.name) bad.push(`${s.id} 이름 refs=${r.name} spec=${s.name}`);
      if (r.parkFactor !== s.pf) bad.push(`${s.id} 성격 refs=${r.parkFactor} spec=${s.pf}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  /** 🔴 담장은 경기 결과를 바꾼다 — 두 파일이 갈리면 그림과 야구가 어긋난다 */
  it("담장 치수가 같다", () => {
    const bad: string[] = [];
    for (const s of shared) {
      const r = refById.get(s.id)!;
      if (JSON.stringify(r.dist) !== JSON.stringify(s.dist)) {
        bad.push(`${s.id} refs=${JSON.stringify(r.dist)} spec=${JSON.stringify(s.dist)}`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("티어가 `_spec` 과 같다", () => {
    const bad: string[] = [];
    for (const s of spec) {
      const want = TIER_KEY[s.tier];
      expect(want, `${s.id} 의 티어 "${s.tier}" 를 코드 티어로 못 옮긴다`).toBeDefined();
      if (parkTierOf(s.id) !== want) bad.push(`${s.id} 코드=${parkTierOf(s.id)} spec=${s.tier}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  /**
   * `PARK_IMAGES` 는 이제 `PARK_TIER_OF` 의 키에서 파생된다.
   * 그러니 지켜야 할 것은 **파일이 실제로 있나**다.
   */
  it("그림 있는 구장마다 PNG 파일이 있다", () => {
    const missing = [...PARK_IMAGES].filter(
      (id) => !existsSync(resolve(ROOT, `resource/park/${id}.png`)),
    );
    expect(missing, `PNG 없는 구장: ${missing.join(" ")}`).toEqual([]);
  });

  it("PNG 파일마다 코드에 자리가 있다 — 남는 그림이 없다", () => {
    const pngs = readdirSync(resolve(ROOT, "resource/park"))
      .filter((f) => f.startsWith("STADIUM_") && f.endsWith(".png"))
      .map((f) => f.slice(0, -4));
    const orphan = pngs.filter((id) => !PARK_IMAGES.has(id));
    expect(orphan, `코드에 없는 그림: ${orphan.join(" ")}`).toEqual([]);
    // 손으로 적는 표는 그림 있는 국내 구장뿐이다 — 해외는 접두 규칙이 받는다
    expect(new Set(Object.keys(PARK_TIER_OF))).toEqual(new Set(pngs));
    expect(specById.size).toBe(pngs.length);
  });
});

/**
 * 중립 기본값 둘 — TS 와 Rust.
 *
 * ⚠ **갈리면 "안 넘겼을 때"와 "중립을 넘겼을 때"가 다른 야구가 된다.**
 *   담장 배선을 고친 뒤로는 안 넘기는 자리가 없지만, 마스터가 아직 안 실린
 *   순간·구장을 못 찾는 팀은 여전히 이 값으로 떨어진다.
 */
describe("중립 기본값이 TS·Rust 에서 같다", () => {
  /** `impl Default for ParkDims` 블록 안의 `ParkDims { … }` 를 읽는다 */
  function rustDefaultDims(): Record<string, number> {
    const src = read("packages/engine-native/src/types.rs");
    const at = src.indexOf("impl Default for ParkDims");
    expect(at, "Rust 에 `impl Default for ParkDims` 가 없다 — 검사가 낡았다").toBeGreaterThan(-1);
    // ⚠ `impl` 줄 자체에도 "ParkDims {" 가 있다 — 본문부터 찾는다
    const fn = src.indexOf("fn default()", at);
    expect(fn, "`fn default()` 를 못 찾았다").toBeGreaterThan(at);
    const open = src.indexOf("ParkDims {", fn);
    const close = src.indexOf("}", open);
    expect(close, "기본값 블록을 못 읽었다").toBeGreaterThan(open);
    const body = src.slice(open + "ParkDims {".length, close);
    const out: Record<string, number> = {};
    for (const part of body.split(",")) {
      const colon = part.indexOf(":");
      if (colon < 0) continue;
      const key = part.slice(0, colon).trim();
      const val = Number(part.slice(colon + 1).trim());
      if (key) out[key] = val;
    }
    return out;
  }

  it("네 칸이 소수점까지 같다", () => {
    const rust = rustDefaultDims();
    expect(Object.keys(rust).sort()).toEqual(["cf", "fence", "lf", "rf"]);
    expect(rust).toEqual({ ...NEUTRAL_DIMS });
  });

  /** 값이 안 읽히면 위 검사가 조용히 빈 객체를 비교하게 된다 */
  it("읽은 값이 숫자다 — 파싱이 헛돌면 안 된다", () => {
    for (const v of Object.values(rustDefaultDims())) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});
