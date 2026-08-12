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

  it("넷 다 같은 OVR이다 — 아키타입은 유불리가 아니라 취향이다", () => {
    const ovrs = presets.map((p) => p.ovr);
    expect(new Set(ovrs).size).toBe(1);
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
    const src = read("apps/ui/src/pages/new-game/NewGamePage.svelte");
    const m = src.match(/potentialHidden = Math\.floor\(Math\.random\(\) \* (\d+)\) \+ (\d+)/);

    it("생성식이 있다", () => {
      expect(m).not.toBeNull();
    });

    it("하한이 프리셋 최고 스탯보다 높다 — 넘긴 채 시작하면 안 된다", () => {
      const floor = Number(m![2]);
      const maxStat = Math.max(...presets.flatMap((p) => Object.keys(W).map((k) => p[k])));
      expect(floor).toBeGreaterThan(maxStat);
    });

    it("굴리기가 성장 속도를 실제로 가른다 — 상·중·하가 다른 구간에 든다", () => {
      const span = Number(m![1]), floor = Number(m![2]);
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
      const floor = Number(m![2]);
      expect(70 / floor).toBeLessThan(0.95);
    });

    it("하네스가 게임의 중앙값을 쓴다 — 어긋나면 다른 주인공을 잰다", () => {
      // 하네스는 결정적이어야 해서 고정값을 쓴다. 그 값이 게임과 어긋나면
      // 계측이 조용히 다른 선수를 재고, 그 위에 쌓은 결론이 전부 틀어진다.
      // 실제로 여기가 옛 중앙(75)으로 남아 있었고 "고교말 OVR 71"이 거기서 나왔다
      // `random(0..span-1) + floor`의 값은 floor ~ floor+span-1이다.
      // 중앙은 floor + (span-1)/2 — 짝수 폭이면 반값이라 내림한다
      const mid = (span: number, floor: number) => Math.floor(floor + (span - 1) / 2);
      const harness = read("scripts/perf/perfEntry.ts");

      const hp = harness.match(/potentialHidden: (\d+)/);
      expect(hp).not.toBeNull();
      expect(Number(hp![1])).toBe(mid(Number(m![1]), Number(m![2])));

      // developmentRate도 같은 이유로 맞춰야 한다
      const dm = src.match(/developmentRate = Math\.floor\(Math\.random\(\) \* (\d+)\) \+ (\d+)/);
      expect(dm).not.toBeNull();
      const hd = harness.match(/developmentRate: (\d+)/);
      expect(Number(hd![1])).toBe(mid(Number(dm![1]), Number(dm![2])));
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

  it("넷 다 구종을 둘 이상 갖는다 — 하나면 ERA가 2배가 된다", () => {
    // 실측(2026-08-10, 투수68·타자66·수비66·60경기):
    //   패스트볼 1개 → ERA 9.07 · H/9 14.74 · BABIP 44.7%
    //   2구종        → ERA 4.52 · H/9  9.77
    // 타자가 같은 공만 보면 contact_q가 48까지 내려가 밴드 표의 하위
    // 구간(안타 33~40%)에서 돌게 된다
    const src = read("apps/ui/src/pages/new-game/NewGamePage.svelte");
    const blocks = [...src.matchAll(/pitches:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(blocks).toHaveLength(4);
    for (const b of blocks) expect((b.match(/id:/g) ?? []).length).toBeGreaterThanOrEqual(2);
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
