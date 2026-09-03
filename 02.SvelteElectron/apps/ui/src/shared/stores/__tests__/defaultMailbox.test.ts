import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 새 게임 소식함은 비어서 시작한다 ──────────────────────────────
//
// 예전엔 `DEFAULT_MAILBOX` 에 자리표시자 넷(msg-000~003 · 고정 이름 "투수 코치 오지경"·
// "감독 임우현" · 보직과 무관한 "선발 확정" · 안 한 훈련의 "커맨드 +1")이 박혀 있었고,
// 새 게임이 소식함을 비우지 않아 **모든 새 게임 첫 소식함**에 그대로 들어갔다.
// 사용자 결정(2026-09-03): 지운다 — 첫 소식함은 실제 시스템 소식이 채운다.
// 문자열 포함으로만 본다 — 정규식을 쓰지 않는다(CLAUDE.md).

const ROOT = resolve(__dirname, "../../../../../..");
const src = readFileSync(resolve(ROOT, "apps/ui/src/shared/stores/game.ts"), "utf8");

describe("기본 소식함", () => {
  it("DEFAULT_MAILBOX 가 빈 배열이다", () => {
    const at = src.indexOf("const DEFAULT_MAILBOX: MessageItem[] = [];");
    expect(at).toBeGreaterThan(-1);
  });
  it("자리표시자 소식 id 가 남아 있지 않다", () => {
    for (const id of ['"msg-000"', '"msg-001"', '"msg-002"', '"msg-003"']) {
      expect(src.includes(id)).toBe(false);
    }
  });
  it("고정 이름이 남아 있지 않다", () => {
    expect(src.includes("투수 코치 오지경")).toBe(false);
    expect(src.includes("감독 임우현")).toBe(false);
  });
});
