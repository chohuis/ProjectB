import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 경기 화면 선수 카드 — **능력치가 소리 없이 잘리면 안 된다.** (2026-09-01)
 *
 * 🔴 `.bar-list, .line-list` 가 `overflow: hidden` 이라, 카드가 짧아지면
 *    막대가 그냥 사라졌다. **스크롤바도 없어서 잘린 줄도 모른다.**
 *    투구를 고르라고 띄운 상대 타자 능력치가 그 자리다.
 *
 *    실측(잘린 높이 px · [타자, 투수]):
 *
 *        1280×720   [104, 82]   ← FHD @150%
 *        1366×768   [ 65, 43]   ← 노트북 표준
 *        1536×864 이상          [0, 0]
 *
 *    둘 다 `PARK_CLIP` 문서가 "실사용"으로 꼽은 해상도다.
 *
 * ⚠ `hidden` 을 **지우면** 카드가 늘어나 옆 열을 밀고 구장까지 흔든다.
 *   `auto` 여야 한다 — 넘칠 때만 스크롤바가 생기고 1536 이상은 그대로다.
 */
const SRC = readFileSync(
  resolve(__dirname, "../match/MatchPage.svelte"), "utf8");

/**
 * ⚠ **짧은 높이 블록에도 같은 선택자가 있다** (2026-09-01 · 720p 대응).
 *   그냥 `indexOf` 하면 그쪽을 먼저 잘라서, 이 검사가 **엉뚱한 규칙을 보고
 *   통과했다.** `@media` 안쪽을 걷어내고 기본 규칙을 찾는다.
 */
const BASE = SRC.replace(/@media[^{]*\{[\s\S]*?\n  \}/g, "");

const RULE = BASE.slice(
  BASE.indexOf(".bar-list, .line-list {"),
  BASE.indexOf(".bar-list, .line-list {") + 320);

describe("선수 카드 능력치가 잘려도 닿을 수 있다", () => {
  it("규칙을 찾았다", () => {
    expect(RULE.length, "`.bar-list, .line-list` 규칙을 못 잘랐다 — 검사가 헛돈다")
      .toBeGreaterThan(100);
  });

  it("`overflow: hidden` 이 아니다", () => {
    expect(RULE, "잘린 능력치에 닿을 길이 없다 (1366×768 에서 65px 가 사라진다)")
      .not.toMatch(/overflow:\s*hidden/);
  });

  it("넘칠 때만 스크롤한다", () => {
    expect(RULE).toMatch(/overflow-y:\s*auto/);
  });

  /**
   * ⚠ 카드가 늘어나면 옆 열 높이를 밀어 구장이 흔들린다.
   *   `min-height: 0` 과 `flex` 가 그걸 막는 짝이라 같이 있어야 한다.
   */
  it("카드가 늘어나지 않게 잡는 짝이 남아 있다", () => {
    expect(RULE).toMatch(/min-height:\s*0/);
    expect(RULE).toMatch(/flex:\s*1 1 auto/);
  });
});
