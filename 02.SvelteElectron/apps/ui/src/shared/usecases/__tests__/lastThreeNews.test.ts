import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 남은 3건 — 보상선수 · 독립리그 재도전 · 스카우팅 표시.
 *
 * ⚠ 셋 다 **주인공 팀이 걸릴 때만** 보낸다. 리그 전체는 한 해 수백 건이다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const strip = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("보상선수 소식", () => {
  const src = strip(read("apps/ui/src/shared/usecases/weekPhases/market.ts"));

  it("소식을 만든다", () => {
    expect(src.includes("msg-facomp-")).toBe(true);
    expect(src.includes("FA 보상")).toBe(true);
  });

  it("우리 팀이 주거나 받을 때만", () => {
    expect(src.includes("const gave = sg.fromTeamId === myT")).toBe(true);
    expect(src.includes("const got  = sg.toTeamId === myT")).toBe(true);
    expect(src.includes("(gave || got)")).toBe(true);
  });

  it("보상이 실제로 오간 것만", () => {
    // 잔류는 보상이 없다 — 그것까지 보내면 소식이 배로 는다
    expect(src.includes("!stayed && hasComp")).toBe(true);
  });
});

describe("독립리그 재도전 소식", () => {
  const src = strip(read("apps/ui/src/shared/usecases/seasonRollover.ts"));
  const rust = read("packages/engine-native/src/npc_sim.rs");

  it("소식을 만든다", () => {
    expect(src.includes("msg-indie-retry-")).toBe(true);
    expect(src.includes("독립리그 재도전")).toBe(true);
  });

  it("🔴 detail로 가른다 — `transfer`는 트레이드에도 쓰인다", () => {
    // ⚠ **`"독립리그 재도전"` 은 소식 제목에도 있다.** 그것만 보면 필터를
    //   지워도 통과한다(변이로 확인) — **필터 줄 통째로** 본다.
    expect(src.includes(`if (!String(e.detail ?? "").includes("독립리그 재도전")) continue;`)).toBe(
      true,
    );
    // Rust 쪽 문자열도 함께 못박는다 — 한쪽만 바뀌면 조용히 0건이 된다
    expect(rust.includes('Some("FA 미계약 → 독립리그 재도전".into())')).toBe(true);
  });

  it("원 소속으로 거른다", () => {
    // ⚠ 웨이버와 달리 여긴 Rust 가 `from_team_id` 를 넣는다(확인함)
    expect(src.includes("e.fromTeamId === myTeam")).toBe(true);
    expect(rust.includes("from_team_id: npc.original_team_id.clone()")).toBe(true);
  });
});

describe("스카우팅 표시", () => {
  const modal = read("apps/ui/src/features/team/ui/TeamDetailModal.svelte");

  it("팀 상세에 보인다", () => {
    expect(modal.includes("스카우팅")).toBe(true);
    expect(modal.includes("드래프트 평가 오차")).toBe(true);
  });

  it("🔴 폭을 규칙 파일에서 읽는다", () => {
    // 화면이 숫자를 지어내면 엔진과 갈린다 — `clubEffects` 와 같은 원칙
    expect(modal.includes("draftScoutingRules?.span")).toBe(true);
  });

  it("엔진과 같은 식을 쓴다", () => {
    // 엔진: ((100 - q) / 100) * span
    expect(modal.includes("((100 - profileOf.scoutingQuality) / 100) * sp")).toBe(true);
  });
});
