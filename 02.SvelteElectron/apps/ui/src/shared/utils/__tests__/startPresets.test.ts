import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 시작 프리셋은 넷 다 같은 총합이다 ────────────────────────────
//
// 사용자 확정(2026-08-09): **프리셋은 스탯 배분만 다르고 총합은 같다.**
// 시작 선택이 곧 커리어 상한이 되면 이후 육성 선택의 무게가 줄어든다 —
// 아키타입은 유불리가 아니라 취향이어야 한다.
//
// 실측 근거: 고교 3학년 투수 509명의 OVR 중앙이 **68**이고 하위 25%가 65다.
// 예전 프리셋은 46~56이라 **뭘 골라도 또래 중앙 한참 아래에서 출발**했고,
// 3년을 잘 키워도 백분위 1%였다.
//
// ⚠ **하네스가 이 표를 베껴 갖고 있다.** `perfEntry.ts`의 `PITCHING`이
// 균형형과 같아야 한다 — 어긋나면 계측이 게임과 다른 주인공을 재고, 그 위에
// 쌓은 결론이 전부 틀어진다. 실제로 그래서 "시작 49"를 게임 값으로 착각했다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** OVR 가중합 — 가중치 합이 12.0이라 분모와 같다 */
const W: Record<string, number> = {
  velocity: 2.5, command: 2.5, control: 2.0, movement: 1.5, stamina: 1.5,
  mentality: 1.0, recovery: 0.5, clutch: 0.3, holdRunners: 0.2,
};
const ovrOf = (p: Record<string, number>) =>
  Math.round(Object.entries(W).reduce((s, [k, w]) => s + p[k] * w, 0) / 12);

/** `pitching: { ovr: 56, velocity: 58, … }` 형태를 전부 뽑는다 */
function parsePresets(src: string): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (const m of src.matchAll(/pitching:\s*\{([^}]*)\}/g)) {
    const o: Record<string, number> = {};
    for (const f of m[1].matchAll(/(\w+):\s*(\d+)/g)) o[f[1]] = Number(f[2]);
    if ("velocity" in o && "holdRunners" in o) out.push(o);
  }
  return out;
}

describe("새 게임 시작 프리셋", () => {
  const presets = parsePresets(read("apps/ui/src/pages/new-game/NewGamePage.svelte"));

  it("프리셋이 4종 있다", () => {
    expect(presets).toHaveLength(4);
  });

  it("적힌 ovr이 스탯에서 실제로 계산되는 값과 같다", () => {
    // 예전엔 제구형이 `ovr: 56`인데 스탯으로는 58이었다 — 화면이 거짓말을 한다
    for (const p of presets) expect(ovrOf(p)).toBe(p.ovr);
  });

  /**
   * 🔴 **넷 다 같은 OVR이던 규칙을 풀었다** (2026-08-26).
   *
   * 구종 수가 달라졌으므로(제구형만 2개) OVR도 달라야 전력이 비슷해진다.
   * 지금은 70 · 68 · 68 · 69다.
   *
   * ⚠ **OVR이 같아도 전력은 안 같았다.** 프리셋 넷을 60경기씩 돌린 실측:
   *     전(넷 다 OVR 68)  5.35 ~ 7.53   격차 **2.18**
   *     후(70·68·68·69)   6.28 ~ 7.56   격차 **1.28**
   *   OVR을 맞춰 두던 시절에 오히려 더 갈렸다 — 구속이 ERA에 크게 들어
   *   제구형(구속 57)이 늘 불리했다. **OVR은 전력의 대리값이 못 된다.**
   *
   * ⚠ 그래도 **너무 벌어지는 것은 막는다** — 66~70 안에 둔다.
   */
  it("OVR이 66~70 안이다 — 벌어져도 한 급 안이다", () => {
    for (const p of presets) {
      expect(p.ovr).toBeGreaterThanOrEqual(66);
      expect(p.ovr).toBeLessThanOrEqual(70);
    }
  });

  it("또래 중앙(68) 근처다 — 66~70", () => {
    // 실측(2026-08-10) 6안 비교에서 **68이 관문**이었다:
    //   선발배정  56→0% · 60→17% · 64→67% · 68→100%
    //   이닝      29.7 → 33.4 → 46.4 → **60.3**  ← 수상 자격선(60) 돌파
    // 64 이하면 선발을 못 잡아 경기 XP가 안 붙고, 수상·상위픽이 통째로 막힌다
    for (const p of presets) {
      expect(p.ovr).toBeGreaterThanOrEqual(66);
      expect(p.ovr).toBeLessThanOrEqual(70);
    }
  });

  // ── 잠재력은 시작 스탯 위에서 시작한다 ──────────────────────
  //
  // `potential_cap_factor`는 `현재스탯 / 잠재력` **비율**로 XP를 깎는다.
  // 잠재력 하한이 시작 스탯보다 낮으면 **자기 잠재력을 넘긴 채 시작**하고,
  // 그 커리어는 1주차부터 성장이 0.10배가 된다 — 훈련을 뭘 해도 안 큰다.
  //
  // 실제로 그랬다. 잠재력 60~90 · 프리셋 최고 스탯 78:
  //   시작 시점에 이미 0.35배 이하   68%
  //   시작 시점에 이미 0.10배        39%
  // 실측 궤적이 1학년 69 · 2학년 70 · 고교말 71 · 최대 75로, 3년에 +3이고
  // 최대값이 잠재력 중앙에 붙었다. 같은 시기 고졸 지명자는 OVR 중앙 74다.
  describe("잠재력 범위", () => {
    // 🔴 **정본이 규칙 파일로 옮겨졌다** (2026-08-28). 예전엔 화면이
    //   `Math.random()`으로 굴려서 여기서 그 식을 정규식으로 읽었다.
    //   난수를 Rust로 옮기면서 값은 `protagonistRules`가 정본이 됐고,
    //   **코드가 맞는데 검사가 옛 모양을 지켜 빨간불이었다.**
    const rules = JSON.parse(
      read("resource/data/master/players/generation_rules.json"),
    ) as { protagonistRules?: { potentialMin?: number; potentialMax?: number } };
    const pMin = rules.protagonistRules?.potentialMin;
    const pMax = rules.protagonistRules?.potentialMax;

    it("규칙 파일에 잠재력 범위가 있다", () => {
      expect(typeof pMin).toBe("number");
      expect(typeof pMax).toBe("number");
      expect(pMax!).toBeGreaterThan(pMin!);
    });

    /** 🔴 난수를 화면으로 되돌리면 안 된다 — 그게 이번에 고친 것이다 */
    it("화면이 잠재력을 직접 굴리지 않는다", () => {
      const src = read("apps/ui/src/pages/new-game/NewGamePage.svelte");
      expect(src.includes("Math.floor(Math.random() * 20) + 80")).toBe(false);
      expect(src.includes('"genProtagonistHiddenNative"')).toBe(true);
    });

    it("하한이 프리셋 최고 스탯보다 높다 — 넘긴 채 시작하면 안 된다", () => {
      const floor = pMin!;
      const maxStat = Math.max(...presets.flatMap((p) => Object.keys(W).map((k) => p[k])));
      expect(floor).toBeGreaterThan(maxStat);
    });

    it("굴리기가 성장 속도를 실제로 가른다 — 상·중·하가 다른 구간에 든다", () => {
      const span = pMax! - pMin! + 1, floor = pMin!;
      const cap = (cur: number, pot: number) => {
        const r = cur / pot;
        return r < 0.75 ? 1.0 : r < 0.85 ? 0.7 : r < 0.95 ? 0.35 : 0.1;
      };
      // 대표 스탯 70(프리셋 중앙대)이 최저·최고 굴리기에서 다른 계수를 받아야
      // 잠재력 뽑기가 의미를 갖는다. 폭이 좁으면 전원이 같은 속도로 큰다
      expect(cap(70, floor)).toBeLessThan(cap(70, floor + span - 1));
    });

    it("최저 굴리기도 멈추지는 않는다", () => {
      // 0.10배는 사실상 성장 정지다. 느린 것과 죽은 것은 다르다
      const floor = pMin!;
      expect(70 / floor).toBeLessThan(0.95);
    });

    it("하네스가 게임의 중앙값을 쓴다 — 어긋나면 다른 주인공을 잰다", () => {
      // 하네스는 결정적이어야 해서 고정값을 쓴다. 그 값이 게임과 어긋나면
      // 계측이 조용히 다른 선수를 재고, 그 위에 쌓은 결론이 전부 틀어진다.
      // 실제로 여기가 옛 중앙(75)으로 남아 있었고 "고교말 OVR 71"이 거기서 나왔다
      // ⚠ **범위는 규칙 파일이 정본이다** (2026-08-28). 예전엔 화면의
      //   `Math.random()` 식을 정규식으로 읽었는데 난수가 Rust로 갔다.
      // 중앙은 (min + max) / 2 — 반값이면 내림한다
      const mid = (lo: number, hi: number) => Math.floor((lo + hi) / 2);
      const harness = read("scripts/perf/perfEntry.ts");
      const r2 = JSON.parse(
        read("resource/data/master/players/generation_rules.json"),
      ) as { protagonistRules?: Record<string, number> };
      const pr = r2.protagonistRules ?? {};

      const hp = harness.match(/potentialHidden: (\d+)/);
      expect(hp).not.toBeNull();
      expect(Number(hp![1])).toBe(mid(pr.potentialMin!, pr.potentialMax!));

      // developmentRate도 같은 이유로 맞춰야 한다
      const hd = harness.match(/developmentRate: (\d+)/);
      expect(hd).not.toBeNull();
      expect(Number(hd![1])).toBe(mid(pr.devRateMin!, pr.devRateMax!));
    });
  });

  it("총합이 같아도 배분은 다르다 — 프리셋이 서로 구별된다", () => {
    const sig = presets.map((p) => Object.keys(W).map((k) => p[k]).join(","));
    expect(new Set(sig).size).toBe(4);

    // 특화형 셋은 확실한 강점이 있어야 한다 — 총합이 같으니 강점이 없으면
    // 고를 이유도 없다. **균형형은 예외다**: 튀는 스탯이 없는 게 그 정의다
    // 특화형 셋은 균형형보다 확실히 뾰족하다. 절대값이 아니라 **균형형과의
    // 격차**로 본다 — 프리셋 전체를 올리면 절대 기준은 매번 어긋난다
    const peakOf = (p: Record<string, number>) => Math.max(...Object.keys(W).map((k) => p[k]));
    const balPeak = peakOf(presets[0]);
    expect(presets.slice(1).filter((p) => peakOf(p) >= balPeak + 5)).toHaveLength(3);

    // 균형형(첫 번째)은 편차가 좁다
    const bal = Object.keys(W).map((k) => presets[0][k]);
    expect(Math.max(...bal) - Math.min(...bal)).toBeLessThanOrEqual(12);
  });

  /**
   * 🔴 **구종 둘 이상이던 규칙을 바꿨다** (사용자 확정 2026-08-26).
   *   셋을 하나로 줄이고 주력 스탯을 줬다 — 둘째 구종을 배우는 것이 첫 목표가 된다.
   *
   * ⚠ **옛 근거(2026-08-10)는 낡았다**: 1개 ERA 9.07 · 2개 4.52라고 적혀 있었는데
   *   오늘 다시 재니 **7.90 대 6.70**이었다(60경기 ×2회 · probe-arsenal.cjs).
   *   그 사이 엔진이 여러 번 바뀌었다.
   *
   * ⚠ 대신 **구종이 아예 없는 것**은 막는다. 하나도 없으면 던질 공이 없다.
   */
  it("넷 다 구종을 적어도 하나 갖는다", () => {
    const src = read("apps/ui/src/pages/new-game/NewGamePage.svelte");
    const blocks = [...src.matchAll(/pitches:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(blocks).toHaveLength(4);
    for (const b of blocks) expect((b.match(/id:/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("하네스 구종이 균형형과 같다", () => {
    const h = read("scripts/perf/perfEntry.ts");
    const src = read("apps/ui/src/pages/new-game/NewGamePage.svelte");
    const norm = (t: string) => t.replace(/\s+/g, "");
    const first = norm(src.match(/pitches:\s*\[([^\]]*)\]/)![1]);
    const hp = norm(h.match(/pitches:\s*\[([^\]]*)\]/)![1]);
    expect(hp).toBe(first);
  });

  it("계측 하네스가 균형형과 같은 값을 쓴다", () => {
    // 어긋나면 계측이 게임과 다른 주인공을 잰다 — 이번에 실제로 겪었다
    const h = read("scripts/perf/perfEntry.ts");
    const m = h.match(/const PITCHING = \{([\s\S]*?)\};/);
    expect(m).not.toBeNull();
    const hp: Record<string, number> = {};
    for (const f of m![1].matchAll(/(\w+):\s*(\d+)/g)) hp[f[1]] = Number(f[2]);
    const balanced = presets[0];   // NewGamePage의 첫 프리셋이 균형형
    for (const k of [...Object.keys(W), "ovr"]) expect(hp[k]).toBe(balanced[k]);
  });
});
