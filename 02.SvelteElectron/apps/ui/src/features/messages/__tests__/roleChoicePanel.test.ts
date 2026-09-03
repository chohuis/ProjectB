import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { needsRoleConfirm, ROLE_CHOICE_IDS } from "../../../shared/usecases/pitcherRole";

/**
 * 확인 단계는 **추천이 아닌 버튼에만** 뜬다
 * (사용자 요구 3 · PLAN_ROLE_RECOMMEND §4 「확인 단계」).
 *
 * ⚠ 이 저장소의 vitest 는 `environment: "node"` 라 컴포넌트를 못 띄운다.
 * 갈래 판정은 순수 함수로 재고, 화면이 그 함수를 쓰는지는 소스 문자열로 본다.
 *
 * ⚠ §8 확정 12(「추천이든 아니든 같은 한 줄」)는 **문구 얘기다.** 앞선 구현이
 * 그걸 "추천에도 단계를 둬라"로 읽어 추천에도 확인 단계를 뒀다 — 그래서
 * 여기에 두 갈래를 다 못박는다.
 */

describe("needsRoleConfirm — 추천이면 바로 확정", () => {
  it("추천 버튼은 확인 단계가 없다", () => {
    for (const id of ROLE_CHOICE_IDS) {
      expect(needsRoleConfirm(id, id)).toBe(false);
    }
  });

  it("추천이 아닌 버튼은 전부 확인 단계를 거친다", () => {
    for (const rec of ROLE_CHOICE_IDS) {
      for (const pick of ROLE_CHOICE_IDS) {
        if (pick === rec) continue;
        expect(needsRoleConfirm(rec, pick)).toBe(true);
      }
    }
  });

  it("셋 중 확인 단계를 거치는 건 늘 둘이다", () => {
    for (const rec of ROLE_CHOICE_IDS) {
      expect(ROLE_CHOICE_IDS.filter((id) => needsRoleConfirm(rec, id)).length).toBe(2);
    }
  });
});

describe("화면 배선 — RoleChoicePanel", () => {
  const SRC = readFileSync(resolve(__dirname, "../ui/RoleChoicePanel.svelte"), "utf8");

  it("버튼이 `pick()` 을 거치고, 갈래는 `needsRoleConfirm` 이 정한다", () => {
    expect(SRC.includes("on:click={() => pick(opt.id as RoleChoiceId)}")).toBe(true);
    expect(SRC.includes("if (needsRoleConfirm(meta.recommended, id))")).toBe(true);
  });

  it("추천 갈래는 확인 단계를 건너뛰고 바로 확정한다", () => {
    expect(SRC.includes("await confirmPick(id)")).toBe(true);
    expect(SRC.includes("await applyRoleChoice(msg.id, id)")).toBe(true);
  });

  it("확인 단계를 여는 자리가 하나뿐이다 — 버튼이 직접 `pendingPick` 을 안 채운다", () => {
    expect(SRC.includes("(pendingPick = opt.id")).toBe(false);
    expect(SRC.split("pendingPick = id").length - 1).toBe(1);
  });

  it("확인 한 줄은 여전히 데이터에서 온다 — 문장을 화면이 안 짓는다", () => {
    expect(SRC.includes("roleConfirmLine(copy, meta.ahead[pendingPick])")).toBe(true);
    expect(SRC.includes("copy.confirm.buttons.back")).toBe(true);
    expect(SRC.includes("copy.confirm.buttons.go")).toBe(true);
  });
});

describe("기획 문서가 같은 것을 적고 있다", () => {
  const DOC = readFileSync(resolve(__dirname, "../../../../../../docs/PLAN_ROLE_RECOMMEND.md"), "utf8");

  it("§4 가 추천은 바로 확정이라고 적는다", () => {
    expect(DOC.includes("### 확인 단계 — **추천이 아닌 버튼에만** 뜬다 (사용자 요구 3)")).toBe(true);
    expect(DOC.includes("needsRoleConfirm()")).toBe(true);
  });

  it("옛 문장(「추천을 눌러도 같은 줄이 뜬다」)이 남아 있지 않다", () => {
    expect(DOC.includes("추천을 눌러도 같은 줄이 뜬다")).toBe(false);
    expect(DOC.includes("추천이든 아니든 누르면 같은 한 줄이 뜬다")).toBe(false);
  });
});
