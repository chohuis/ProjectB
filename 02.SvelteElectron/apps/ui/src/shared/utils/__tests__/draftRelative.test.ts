import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 드래프트는 상대평가다 ────────────────────────────────────────
//
// 사용자 확정(2026-08-09):
//   상위픽   팀 에이스급 + 리그 최상위
//   중간픽   리그에서 무난한 수준
//   미지명   애매하거나 · 큰 부상이 있거나 · 대회에서 못했거나
//
// 예전엔 `scout*0.6 + ovr*0.4`의 **절대값**이었다. 고교말 OVR 실측 범위가
// 52~63이라 OVR 기여가 4.4점 폭뿐이었고 scoutScore는 3년에 +14가 천장이라,
// **60회 조사에서 지명 30회가 전부 9라운드 · 미지명 0건**이었다.
//
// ⚠ **폴백으로 조용히 돌아가는 걸 막는다.** Rust는 또래 분포가 비면 OVR을
// 백분위처럼 쓴다(터지지 않게). 호출부가 안 넘기면 겉보기엔 멀쩡한데
// 옛 동작이다 — 그래서 배선을 검사가 본다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("주인공 드래프트 산식", () => {
  const rust = read("packages/engine-native/src/npc_sim.rs");

  it("리그 백분위를 쓴다", () => {
    expect(rust).toMatch(/peer_ovrs\.iter\(\)\.filter\(\|&&o\| o < params\.pitching_ovr\)/);
  });

  it("절대 OVR도 항으로 남는다 — 팀운이 없어도 재능은 보인다", () => {
    expect(rust).toMatch(/let ovr_norm =/);
    expect(rust).toMatch(/pct \* 0\.6 \+ ovr_norm \* 0\.4/);
  });

  it("부상·대회·에이스가 전부 반영된다", () => {
    for (const t of ["injury_pen", "tour_adj", "ace_bonus"]) expect(rust).toContain(t);
  });

  it("라운드가 직선이라 1~11이 전부 나온다", () => {
    // 옛 식 `ceil(4 + (55-score)/5)`은 4·8·10·11이 도달 불가였다
    expect(rust).not.toMatch(/ceil\(\) as i32/);
    // 앵커: **리그 중위(50) → 6R · 최상위(95) → 1R.**
    // 처음엔 11R에서 내려오는 식이라 중위가 9~10R로 밀렸고, OVR 척도까지
    // 어긋나 **20회 전부 미지명**이 나왔다 — 실측으로 두 번 고쳤다.
    expect(rust).toMatch(/\(6\.0 - \(draft_score - 50\.0\) \* 0\.111\)/);
  });

  it("호출부가 또래 분포를 실제로 넘긴다 — 안 넘기면 폴백이 옛 동작이다", () => {
    const s = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(s).toMatch(/determineProtagonistDraft\([\s\S]{0,200}peerOvrs/);
    expect(s).toMatch(/majorInjuries/);
    expect(s).toMatch(/tournamentScore/);
  });

  it("또래에서 주인공을 뺀다 — 분모에 자기를 넣으면 백분위가 낮게 나온다", () => {
    const s = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(s).toMatch(/n\.npcId !== p\.id/);
  });
});
