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
  it("OVR이 58~62 안이다 — 벌어져도 한 급 안이다", () => {
    for (const p of presets) {
      expect(p.ovr).toBeGreaterThanOrEqual(58);
      expect(p.ovr).toBeLessThanOrEqual(62);
    }
  });

  /**
   * 🔴 **또래 위 얼마인가로 다시 잡았다** (2026-09-09 · 결정 ⑭ · 사용자 확정).
   *
   * 사용자 지적: 「1학년부터 구속이 150 넘게 나오고 주인공은 선발로 막 뛰고
   * OVR 도 너무 높다」. **첫 1년이 성장이 아니라 확인**이 되고, 드래프트 상위픽이
   * 거의 보장돼 **대학·독립 갈래를 겪을 이유가 없다**는 것이 문제였다.
   *
   * ⚠ **옛 근거(「또래 중앙 68」)는 틀렸다.** 그건 몇 시즌 굴린 세이브를 잰
   *   값이다. 새 게임 직후를 재면(`npm run probe:a:startovr` · 씨앗 셋 ·
   *   고교 투수 1,428명):
   *
   * ```
   *   1학년  중앙 56~57 · 상위25 63 · 상위10 67 · 상위5 69 · 최고 76~77
   *   3학년  중앙 56~57 · 상위25 62~63 · 상위10 66~67
   * ```
   *
   *   즉 예전 프리셋(68~70)은 **1학년 백분위 96%** 였다 — 상위 4% 로 시작했다.
   *   지금 값(59~61)은 **65~72%** 다: 상위권이되 손에 잡히는 자리.
   *
   * ⚠ 값은 **제안값이다** — 5단계에서 D 가 다시 잰다(`BALANCE_BACKLOG`).
   */
  it("또래 1학년 상위권이되 꼭대기는 아니다 — 58~62", () => {
    for (const p of presets) {
      expect(p.ovr).toBeGreaterThanOrEqual(58);
      expect(p.ovr).toBeLessThanOrEqual(62);
    }
  });

  /**
   * 🔴 **구속 상한** — 사용자가 콕 집은 자리다(「1학년부터 150 넘게」).
   *   화면 구속 = `100 + velocity × 0.65` 이므로 150 km/h 는 스탯 77 이다.
   *   또래 1학년 최고가 76~77(154~155) 이므로 **프리셋이 거기 닿으면 안 된다.**
   */
  it("구속이 150 km/h 를 안 넘는다 — 스탯 77 미만", () => {
    for (const p of presets) expect(p.velocity).toBeLessThan(77);
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

  /**
   * 🔴 **사본이 셋이면 하나는 늘 뒤처진다** (2026-09-09 실측).
   *
   * 프리셋 값이 세 군데에 있다 — 페이지(정본) · `perfEntry.PITCHING`(균형형
   * 픽스처) · `perfEntry.START_PRESETS`(넷) · `perfEntry.presetEraCurve` 의 `P`.
   * ⑭ 를 넣으며 훑어 보니 **`P` 가 이미 어긋나 있었다**: 균형형이 `75/75` 인데
   * 게임 값은 `70/70` 이었다(2026-08-26 변경을 그 사본만 안 따라갔다).
   * 그 상태로 「프리셋 넷의 전력이 비슷한가」를 재고 있었다.
   *
   * 여기서 **네 벌이 같은지** 매번 본다. 값이 아니라 **일치**를 지킨다 —
   * 다음에 프리셋을 바꿔도 이 검사는 그대로 산다.
   */
  it("하네스 사본들이 페이지와 값이 같다 — 어긋나면 다른 주인공을 잰다", () => {
    const harness = read("scripts/perf/perfEntry.ts");
    const hp = parsePresets(harness);
    // `START_PRESETS`(넷)이 잡힌다. `PITCHING`·`presetEraCurve` 의 `P` 는
    // `pitching:` 꼴이 아니라 여기 안 든다 — 그 둘은 바로 아래·위 검사가 맡는다
    expect(hp.length).toBeGreaterThanOrEqual(4);

    const sig = (o: Record<string, number>) => Object.keys(W).map((k) => `${k}:${o[k]}`).join(",");
    const pageSigs = new Set(presets.map(sig));
    const stray = hp.filter((o) => !pageSigs.has(sig(o)));
    expect(stray.map(sig), "페이지에 없는 값을 하네스가 들고 있다").toEqual([]);

    // 넷이 **다** 하네스에 있어야 한다 — 하나가 빠지면 그 프리셋은 계측 밖이다
    const harnessSigs = new Set(hp.map(sig));
    expect(presets.map(sig).filter((x) => !harnessSigs.has(x))).toEqual([]);
  });

  /**
   * `presetEraCurve` 의 `P` 는 `pitching:` 꼴이 아니라 위 검사에 안 든다.
   * **거기가 실제로 어긋나 있던 자리**라(균형형 75/75 · 게임은 70/70) 따로 본다.
   */
  it("`presetEraCurve` 의 사본도 페이지와 같다", () => {
    const harness = read("scripts/perf/perfEntry.ts");
    for (const pr of presets) {
      expect(harness, `velocity ${pr.velocity} · command ${pr.command} 짝이 하네스에 없다`)
        .toContain(`velocity: ${pr.velocity}, command: ${pr.command}`);
    }
    // 옛 드리프트 값이 되살아나면 여기서 걸린다
    expect(harness).not.toContain("velocity: 75, command: 75");
  });

  it("총합이 같아도 배분은 다르다 — 프리셋이 서로 구별된다", () => {
    const sig = presets.map((p) => Object.keys(W).map((k) => p[k]).join(","));
    expect(new Set(sig).size).toBe(4);

    // 특화형 셋은 확실한 강점이 있어야 한다 — 총합이 같으니 강점이 없으면
    // 고를 이유도 없다. **균형형은 예외다**: 튀는 스탯이 없는 게 그 정의다
    // 특화형 셋은 균형형보다 확실히 뾰족하다. 절대값이 아니라 **균형형과의
    // 격차**로 본다 — 프리셋 전체를 올리면 절대 기준은 매번 어긋난다
    //
    // 🔴 **격차 +5 → +3 (2026-09-10 · 5단계 D · 사용자 확정 ②).** 제구형의
    // velocity 48→53 · command 69→67은 `calc_pitching_ovr` 상 OVR 59를
    // 유지하려고 계산으로 고른 값이다(백로그 결정⑭ §①). 그런데 command가
    // 바로 제구형의 peak 스탯이었다 — 69(=balPeak+5, 여유 0)에서 67로
    // 내려가며 이 마진을 2점 깎는다. power·stamina는 여전히 정확히
    // balPeak+5(69)라 원래도 여유가 0이었다 — +5는 애초에 빡빡한 값이었다.
    // OVR을 지키는 쪽을 골랐으므로 여기 마진을 3으로 낮춘다(제구형은
    // 그래도 +3 — 균형형과 뚜렷이 갈린다. power·stamina는 +5 그대로 통과).
    const peakOf = (p: Record<string, number>) => Math.max(...Object.keys(W).map((k) => p[k]));
    const balPeak = peakOf(presets[0]);
    expect(presets.slice(1).filter((p) => peakOf(p) >= balPeak + 3)).toHaveLength(3);

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
