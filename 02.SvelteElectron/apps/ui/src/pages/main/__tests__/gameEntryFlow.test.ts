import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **헤더의 경기 버튼이 실제로 듣는가.**
 *
 * 🔴 경기 창이 소식 탭에만 묶여 있어서(`currentTab === "news"`), 헤더 버튼은
 *   탭을 바꾸는 일만 했다 — **소식 탭에 이미 있으면 눌러도 아무 일도 안
 *   일어났다.** 누른 사람에게는 고장으로 보인다(2026-08-27 실플 논의).
 *
 * ⚠ 브리핑은 **여기서 안 연다.** 경기 창의 버튼으로 여는 창이다
 *   (사용자 확정 2026-08-07) — 그 결정을 이 흐름이 뒤집지 않는지 같이 본다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const MAIN = read("apps/ui/src/pages/main/MainPage.svelte");
const HEADER = read("apps/ui/src/features/main-layout/ui/TopHeader.svelte");

describe("헤더 → 경기 흐름", () => {
  it("버튼 문구가 동사다 — 누를 수 있어 보여야 한다", () => {
    const m = HEADER.match(/type === "game"\s*\?\s*"([^"]+)"/);
    expect(m, "경기 문구를 못 찾았다 — 정규식이 소스와 어긋났다").not.toBeNull();
    expect(m![1], `문구가 "${m?.[1]}"이다`).not.toMatch(/대기|중\.\.\.|중…/);
  });

  // 🔴 탭만 바꾸면 이미 그 탭일 때 안 듣는다
  it("경기일 때 창을 직접 연다 — 탭 이동에만 기대지 않는다", () => {
    const fn = MAIN.slice(MAIN.indexOf("function openPendingFromNext"));
    const body = fn.slice(0, fn.indexOf("\n  }"));
    expect(body).toMatch(/type === "game"/);
    expect(body).toMatch(/gameModalForced\s*=\s*true/);
  });

  it("경기 창이 탭에만 묶여 있지 않다", () => {
    // 열림 조건에 강제 표식이 함께 들어가야 한다
    const m = MAIN.match(/\$: gameModalOpen = ([^;]+);/);
    expect(m, "gameModalOpen을 못 찾았다").not.toBeNull();
    expect(m![1]).toMatch(/gameModalForced/);
    expect(m![1]).toMatch(/currentTab === "news"/);
  });

  // ⚠ 안 끄면 다음 경기까지 켜진 채로 남는다
  it("대기가 사라지면 강제 표식이 꺼진다", () => {
    expect(MAIN).toMatch(/!pendingGameEntry && gameModalForced\) gameModalForced = false/);
  });

  /**
   * ⚠ **브리핑은 진행 버튼이 아니다**(사용자 확정 2026-08-07).
   *   헤더가 브리핑을 직접 열면 그 결정이 조용히 뒤집힌다.
   */
  it("헤더가 브리핑을 직접 열지 않는다", () => {
    const fn = MAIN.slice(MAIN.indexOf("function openPendingFromNext"));
    const body = fn.slice(0, fn.indexOf("\n  }"));
    expect(body).not.toMatch(/briefingScheduleId\s*=/);
  });
});
