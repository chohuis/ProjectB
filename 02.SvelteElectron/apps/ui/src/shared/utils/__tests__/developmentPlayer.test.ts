import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isRegistrable, isDevelopmentPlayer, DEV_REGISTRATION_MONTH } from "../developmentPlayer";

/** **실데이터를 읽는다.** 인라인 값으로 두면 게임과 달라져 거짓 안심을 준다 */
function rules() {
  const p = resolve(
    __dirname,
    "../../../../../../resource/data/master/players/generation_rules.json",
  );
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("육성선수 등록 제한", () => {
  it("정식 등록 선수는 언제나 올라갈 수 있다", () => {
    expect(isRegistrable(undefined, 2026, 3)).toBe(true);
    expect(isRegistrable(null, 2026, 1)).toBe(true);
  });

  it("입단 연도 5월 전에는 못 올라간다", () => {
    for (let m = 1; m < DEV_REGISTRATION_MONTH; m++) {
      expect(isRegistrable(2026, 2026, m)).toBe(false);
    }
  });

  it("입단 연도 5월부터는 올라갈 수 있다", () => {
    for (let m = DEV_REGISTRATION_MONTH; m <= 12; m++) {
      expect(isRegistrable(2026, 2026, m)).toBe(true);
    }
  });

  it("다음 해부터는 달과 무관하다", () => {
    // ⚠ 매년 5월까지 묶으면 육성선수가 영영 못 올라와서
    // "노력하면 프로가 된다"는 전제 자체가 없어진다
    for (let m = 1; m <= 12; m++) {
      expect(isRegistrable(2026, 2027, m)).toBe(true);
    }
  });

  it("신분은 연도 무관하게 남는다", () => {
    expect(isDevelopmentPlayer(2026)).toBe(true);
    expect(isDevelopmentPlayer(undefined)).toBe(false);
  });
});

describe("육성선수 계약 — 규칙 파일", () => {
  it("연봉이 신인 최저연봉보다 낮다", () => {
    // ⚠ 같거나 높으면 계약금이 붙는 하위 라운드 지명이 무의미해진다.
    // "지명 안 되는 게 낫다"가 되면 드래프트 자체가 무너진다
    const r = rules();
    const dev = r.developmentPlayerRules?.salary;
    const rookieMin = Math.min(
      ...(r.draftRules.contract.byPick as Array<{ salary: number }>).map((b) => b.salary),
    );
    expect(typeof dev).toBe("number");
    expect(dev).toBeLessThan(rookieMin);
  });

  it("시작 능력치가 정식 2군보다 낮다", () => {
    const r = rules();
    const dev = r.developmentPlayerRules;
    const farm = r.rosterRules["LEAGUE_KBL_FARM"];
    expect(dev.ovrMax).toBeLessThan(farm.pitchingOvrMax);
    expect(dev.ovrMax).toBeLessThan(farm.battingOvrMax);
    expect(dev.ovrMin).toBeLessThan(farm.pitchingOvrMin);
  });

  it("천장은 안 낮춘다 — 생성 호출이 potentialOvrMax를 따로 넘긴다", () => {
    // ⚠ 천장은 `ovrMax * pot_mult`다. `potentialOvrMax`를 안 넘기면 위에서
    // 낮춘 `ovrMax`가 그대로 천장이 되어 **"지금은 약하지만 클 수 있다"가
    // 그냥 약한 선수**가 된다 — 육성선수가 프로가 되는 경로가 없어진다.
    // 소스를 읽는 검사다. 값만 봐선 배선이 살아 있는지 알 수 없다
    const src = readFileSync(resolve(__dirname, "../../repo/slotLifecycleV3.ts"), "utf8");
    // 생성 호출 단위로 쪼개서, 능력치를 낮춘 호출은 천장도 같이 넘기는지 본다
    const calls = src
      .split("generateFreshmenNative")
      .slice(1)
      .map((b) => b.slice(0, 1400));
    const lowered = calls.filter((b) => b.includes("dev.ovrMax"));
    expect(lowered.length).toBeGreaterThan(0);
    for (const b of lowered) expect(b).toContain("potentialOvrMax");
  });

  it("육성선수 상한이 0이 아니다 — 0이면 제도가 없는 것과 같다", () => {
    // ⚠ **정원 밖 인원이라 따로 있어야 한다.** 정식 정원(rosterMax)만 쓰면
    // 2군이 꽉 찬 순간 자리가 사라진다 — 실측에서 KBL 2군 10팀 여유가
    // 5자리였고 그해 미지명자 1,373명 중 2군에 간 사람이 0명이었다
    const r = rules();
    expect(r.developmentPlayerRules.intakeMax).toBeGreaterThan(0);
    // 반대로 정식 정원만큼 받으면 2군이 육성선수로 채워져
    // 드래프트 지명의 가치가 사라진다
    expect(r.developmentPlayerRules.intakeMax).toBeLessThan(
      r.rosterRules["LEAGUE_KBL_FARM"].rosterMax,
    );
  });

  it("2군 상한이 0이 아니다 — 0이면 미지명자가 갈 곳이 없다", () => {
    // 이 값이 배선까지 살아 있는지는 `check:devplayer`가 실제 드래프트를
    // 돌려서 본다. 여기선 규칙 파일 쪽 전제만 지킨다
    expect(rules().rosterRules["LEAGUE_KBL_FARM"]?.rosterMax).toBeGreaterThan(0);
  });
});
