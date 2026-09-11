import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 주인공과 NPC가 같은 규칙으로 내려온다 ──────────────────────
//
// 예전엔 주인공만 **스태미나 문턱**(35)으로 내려왔다. 그 상수 주석은
// "NPC와 같은 기준"이라고 적혀 있었지만 **NPC는 스태미나 문턱을 안 쓴다** —
// `PitcherQueue::should_switch`는 아웃카운트 예산과 투구수만 본다.
// 35라는 숫자는 NPC의 어떤 값과도 대응하지 않았다.
//
// 결과가 등판 길이 차이다:
//   NPC 선발  max_outs = 12 + (스태미나/99)*15  → 스태미나 60이면 7이닝
//   주인공    스태미나 <= 35                    → 실측 4.5이닝
//
// 이닝이 짧으니 시즌 이닝이 32~44에 머물렀고, 수상 자격선에 계속 걸렸으며
// (같은 seed에서 수상 회차가 8/30 ↔ 1/30으로 널뛰었다) 볼륨이 필요한
// 탈삼진왕·방어율왕은 210시즌 0건이었다.
//
// **한 엔진에 교체 규칙이 둘이면 반드시 어긋난다** — 이 저장소에서 반복된
// 형태고, 실제로 오프셋 충돌의 정체이기도 했다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("투수 교체 규칙 — 정본 하나", () => {
  const eng = read("packages/engine-native/src/match_engine.rs");
  const tun = read("packages/engine-native/src/tuning.rs");

  it("주인공도 아웃 예산을 받는다", () => {
    expect(eng).toMatch(/fn protagonist_max_outs\(state: &MatchState\) -> u32/);
    expect(eng).toMatch(/state\.outs_since_entry >= budget/);
  });

  it("예산 식이 NPC 선발과 같다", () => {
    // `queue_max_outs`의 선발 갈래와 같은 계수여야 한다. 다르면 통합 엔진에서
    // 주인공만 다른 길이로 던진다
    const npcForm = /12\.0 \+ \(stam \/ 99\.0\) \* 15\.0/;
    expect(eng.match(new RegExp(npcForm, "g"))?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("예산에 난수를 넣지 않는다 — 타석마다 재추첨되면 안 된다", () => {
    // `should_protagonist_exit`은 타석마다 불린다. ±3 흔들림을 그대로 쓰면
    // 22아웃에서 내려갈지 25아웃에서 내려갈지가 매 타석 새로 뽑힌다
    const fn = eng.slice(eng.indexOf("fn protagonist_max_outs"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).not.toMatch(/rng|gen::<f64>/);
  });

  it("현재 스태미나가 아니라 상한으로 정한다", () => {
    // 현재값을 쓰면 던질수록 예산이 줄어 자기 자신을 쫓는 식이 된다
    expect(eng).toMatch(/state\.protagonist_pitcher\.stamina_cap\.max\(1\.0\)/);
    const fn = eng.slice(eng.indexOf("fn protagonist_max_outs"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).not.toMatch(/state\.protagonist_stamina\b/);
  });

  it("구원 등판엔 예산을 안 준다", () => {
    expect(eng).toMatch(
      /let is_starter = state\.my_queue\.pitchers\.is_empty\(\) \|\| state\.my_queue\.current == 0/,
    );
    expect(eng).toMatch(/if budget > 0 && state\.outs_since_entry >= budget/);
  });

  it("스태미나 문턱은 비상 하한으로만 남는다", () => {
    expect(tun).toMatch(/pub const PROTAGONIST_STAMINA_EMERGENCY: f64\s+= 15\.0;/);
    // 예산 검사가 스태미나 검사보다 **앞**이어야 한다 — 뒤면 스태미나가
    // 먼저 걸려서 예산이 있으나 마나가 된다
    const iBudget = eng.indexOf("state.outs_since_entry >= budget");
    const iStam = eng.indexOf("if stam <= T::protagonist_stamina_exit()");
    expect(iBudget).toBeGreaterThan(0);
    expect(iBudget).toBeLessThan(iStam);
  });

  it("NPC 교체는 여전히 아웃·투구수만 본다", () => {
    const types = read("packages/engine-native/src/types.rs");
    const fn = types.slice(types.indexOf("pub fn should_switch"));
    const body = fn.slice(0, fn.indexOf("\n    }"));
    expect(body).toMatch(/over_outs \|\| over_pitches/);
    expect(body).not.toMatch(/stamina/);
  });
});
