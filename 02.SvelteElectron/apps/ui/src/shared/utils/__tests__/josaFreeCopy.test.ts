import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 자리표시자 뒤에 조사를 안 붙인다 — **여섯 자리** (B-28 실측 · C 단위 9 ③).
 *
 * 🔴 **받침을 코드가 보게 만들지 않는다.** 「을/를」·「이/가」·「으로/로」는
 *    앞 글자의 받침이 정하는데, 자리표시자에는 데이터가 들어온다 — 목록이
 *    늘 때마다 틀리고, 그때 고칠 자리가 코드 한 줄이 아니라 문장 전부다.
 *    이 저장소가 정한 답은 하나다: **체언 종지**(「선택: 간다」) 또는
 *    **자리표시자를 문장 끝에**(「개나리기. 대회가 끝났습니다.」).
 *
 * B 가 실측한 것(HANDOFF_B_TO_A B-28):
 *
 * ```
 * militaryResultMessage.ts  선택지 176 중 172 틀림   「{label}」을 골랐다
 * nationalTeam.ts           대회 7 중 7 전부 틀림     {name}이 막을 내렸습니다
 * militaryLife.ts           보직 7 중 4 틀림          {arc}이 됐다
 * tournamentNews.ts         꽃 7 중 2 틀림            {flower}를 들어올렸다
 * injuries.ts               부상명 받침이면 틀림      {injury}로 인한 은퇴
 * contractDecision.ts       팀 238 중 0 — 아직 안 틀린다. 하나만 늘면 깨진다
 * ```
 *
 * ⚠ **정규식으로 훑지 않는다.** 전수 스캐너는 D 몫이다(B 가 쓴 것이 있다) —
 *   여기는 고친 여섯 자리가 다시 안 돌아오는지만 못박는다.
 *
 * ⚠ 짝이 되는 검사가 하나 더 있다 — `militaryResultMessage.test.ts` 가
 *   실제 소식 본문을 만들어 본다. 여기는 **아직 검사가 없는 다섯 자리**다.
 */
const SRC = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("고친 여섯 자리 — 조사가 돌아오지 않았다", () => {
  it("군 선택 결과 — 「선택: {label}」", () => {
    const s = read("utils/militaryResultMessage.ts");
    expect(s, "선택지 라벨 뒤에 조사가 돌아왔다").not.toContain("」을 골랐다");
    expect(s).toContain("선택: ${choice.label}");
    // ⚠ 부제·대시 금지 — 제목의 대시도 같이 뺐다
    expect(s, "제목에 대시가 돌아왔다").not.toContain("} — 결과");
  });

  it("대표팀 대회 종료 — 이름을 문장 끝에", () => {
    const s = read("usecases/nationalTeam.ts");
    expect(s, "대회 이름 일곱이 전부 무받침인데 「이」가 붙어 있다").not.toContain(
      "}이 막을 내렸습니다",
    );
    expect(s).toContain("대회가 끝났습니다.");
  });

  it("군 보직 변화 — 「보직: {arc}」", () => {
    const s = read("usecases/militaryLife.ts");
    expect(s, "보직 이름 뒤에 조사가 돌아왔다").not.toContain("]}이 됐다");
    expect(s).toContain("보직: ${ARC_LABELS");
  });

  /**
   * ⚠ **눈확인에서 잡았다** (c58 · 2026-09-04). B-28 목록에 없던 자리다 —
   *   대표팀(`nationalTeam.ts`)만 고치고 대회 우승 소식은 같은 문장을
   *   그대로 들고 있었다. 「장미기(장미)이 막을 내렸습니다」 로 떴다.
   */
  it("대회 우승 소식 본문도 이름을 문장 끝에", () => {
    const s = read("usecases/weekPhases/tournamentNews.ts");
    expect(s, "대회 이름 뒤에 「이」 가 붙어 있다").not.toContain("}이 막을 내렸습니다");
    expect(s, "같은 말을 두 번 한다 — 이름과 꽃").not.toContain("(${def.flower})이");
  });

  it("대회 우승 — 꽃 이름을 문장 끝에", () => {
    const s = read("usecases/weekPhases/tournamentNews.ts");
    expect(s, "왕중왕·여명은 받침이라 「를」이 틀린다").not.toContain("}를 들어올렸다");
    expect(s).toContain("우승입니다.");
  });

  it("부상 은퇴 기록 — 「{부상명} 은퇴」", () => {
    const s = read("usecases/weekPhases/injuries.ts");
    expect(s, "부상명이 받침이면 「으로」다").not.toContain("}로 인한 은퇴");
    expect(s).toContain("} 은퇴`");
  });

  /**
   * ⚠ **지금은 안 틀리던 자리다.** 팀 238개가 다 무받침이라(200 무받침 +
   *   38 비한글) 「와」가 맞았다 — 이름 하나만 받침으로 늘어도 네 줄이 깨진다.
   */
  it("계약 완료 — 팀 이름을 문장 끝에", () => {
    const s = read("usecases/contractDecision.ts");
    expect(s, "팀 이름 뒤에 「와」가 돌아왔다").not.toContain("}와 계약이");
    expect(s).not.toContain("}와의 계약이");
    expect(s).not.toContain("}와 FA 계약이");
    expect(s).toContain("${teamName} 계약이 완료되었습니다.");
    expect(s).toContain("${teamName} FA 계약이 완료되었습니다.");
  });
});
