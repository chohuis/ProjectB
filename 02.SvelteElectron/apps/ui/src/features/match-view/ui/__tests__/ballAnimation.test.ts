import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 타구 애니메이션 (0단계 · 2026-08-30).
 *
 * 🔴 **엔진이 채워 보내는 값을 화면이 받아서 버리고 있었다.**
 *   이 저장소의 반복 결함이 정확히 그 형태다 — 피홈런·장타·수비기록·
 *   선발여부·스카우팅이 전부 "값은 만들어지는데 쓰는 데가 없다"였다.
 *
 * ⚠ **정정**: 화면이 큐 6종을 안 쓰는 줄 알았는데 **다 쓰고 있었다.**
 *   실제로 버려지던 건 `ball_batted` 의 `arc` 하나였다 — 타구 종류별로
 *   다른 포물선이 오는데 직선으로만 그렸다.
 */
const ROOT = resolve(__dirname, "../../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("타구 포물선", () => {
  const page = read("apps/ui/src/pages/match/MatchPage.svelte");
  const rust = read("packages/engine-native/src/match_engine.rs");

  it("엔진이 타구 종류별로 다른 arc를 준다", () => {
    // 팝업이 제일 높고 땅볼이 제일 낮다
    expect(rust.includes("BallHitType::Popup      => 0.85, BallHitType::FlyBall    => 0.60,")).toBe(true);
    expect(rust.includes("BallHitType::LineDrive  => 0.15, BallHitType::GroundBall => 0.05,")).toBe(true);
  });

  it("🔴 화면이 그 arc를 쓴다", () => {
    // 안 넘기면 팝업도 땅볼도 같은 직선이 된다
    expect(page.includes("await tweenBall(svgTo, ms(cue.duration), cue.arc);")).toBe(true);
  });

  it("포물선이 시작·도착에서 0이다", () => {
    // 4t(1-t) 는 양 끝에서 0 — 공이 글러브에서 떠서 시작하면 안 된다
    expect(page.includes("const rise = lift * 4 * t * (1 - t);")).toBe(true);
    expect(page.includes("y: Math.round(from.y + dy * t - rise),")).toBe(true);
  });

  it("높이가 거리에 비례한다", () => {
    // 짧은 타구가 높이 뜨면 어색하다
    expect(page.includes("const lift = arc * dist * 0.55;")).toBe(true);
  });

  it("🔴 송구는 직선이다 — arc를 안 넘긴다", () => {
    // 송구가 포물선을 그리면 야수가 띄워 던지는 꼴이다
    expect(page.includes(
      '      } else if (cue.type === "ball_throw") {\n' +
      "        const svgTo = enginePosToSvg(cue.to);\n" +
      "        await tweenBall(svgTo, ms(cue.duration));"
    )).toBe(true);
  });

  it("arc를 안 넘기면 예전과 같은 직선이다", () => {
    // 기본값 0 — 투구도 이 갈래로 돈다
    expect(page.includes("async function tweenBall(to: FieldPoint, duration: number, arc = 0) {")).toBe(true);
  });
});

describe("병살 연출", () => {
  const rust = read("packages/engine-native/src/match_engine.rs");

  it("🔴 병살은 송구가 두 번이다", () => {
    // 예전엔 한 번뿐이라 **병살과 평범한 땅볼이 똑같이 보였다**
    expect(rust.includes("if code == PitchResultCode::DoublePlay && threw_to != FieldPosition::B1 {")).toBe(true);
    expect(rust.includes("                    from: relay_from, to: relay_to, duration: 220,")).toBe(true);
  });

  it("첫 송구가 1루면 두 번째가 없다", () => {
    // 1루에서 잡고 2루로 던지는 형태는 이 모델에 없다
    expect(rust.includes("threw_to != FieldPosition::B1")).toBe(true);
  });

  it("두 번째는 1루로 간다", () => {
    expect(rust.includes("let relay_to = fielder_default_pos(FieldPosition::B1);")).toBe(true);
  });
});

describe("화면이 큐 6종을 다 쓴다", () => {
  const page = read("apps/ui/src/pages/match/MatchPage.svelte");

  it.each([
    ["ball_pitch", 'cue.type === "ball_pitch"'],
    ["ball_batted", 'cue.type === "ball_batted"'],
    ["ball_throw", 'cue.type === "ball_throw"'],
    ["fielder_move", 'cue.type === "fielder_move"'],
    ["runner_advance", 'cue.type === "runner_advance"'],
    ["show_result", 'cue.type === "show_result"'],
  ])("%s 를 쓴다", (_name, needle) => {
    expect(page.includes(needle)).toBe(true);
  });

  it("실책이 보인다", () => {
    expect(page.includes("errorFlashPos = lastFielderMovePos;")).toBe(true);
  });
});
