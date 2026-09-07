import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROLE_ASK_WEEK, ROLE_ASK_WEEK_DEFAULT, roleAskWeekOf } from "../../utils/seasonWeeks";
import { HS_START_WEEK, UNIV_REGULAR_START_WEEK, PRESEASON_START_WEEK, PRO_START_WEEK } from "../../utils/leagueScheduler";
import { SURVIVAL_STAGES } from "../../utils/leagueTeams.generated";
import { roleAskReasonOf, shouldAskRoleChoice, hasRoleChoiceThisSeason, roleChoiceGuardKey } from "../pitcherRole";
import type { ProtagonistSave } from "../../types/save";

/**
 * **묻는 주**와 **다시 묻는 때** (PLAN_ROLE_RECOMMEND §4 · 확정 8·9).
 *
 * ⚠ 캘린더를 바꾸면 여기가 깨져야 한다. 안 깨지면 **오류 없이 그 시즌만
 * 안 묻는다** — 이 저장소가 주차 상수로 반복해 겪은 형태다(`seasonWeeks.ts` 머리).
 */
type P = Parameters<typeof roleAskReasonOf>[0];

function pitcher(over: Partial<ProtagonistSave> = {}): P {
  return {
    playerType: "pitcher",
    careerStage: "pro_kbl",
    leagueId: "LEAGUE_KBL",
    teamId: "TEAM_KBL_A_1",
    lastRoleChoiceKey: undefined,
    careerEvents: [],
    ...over,
  } as P;
}

describe("묻는 주 — 개막 주 상수와 맞는다", () => {
  /**
   * 🔴 **고교만 「개막 전 주」가 아니다** (2026-09-07 · 사용자 확정).
   *
   * W6(개막 W7 앞 주)이었는데, 새 게임은 W1에 자동으로 선발이 배정되고
   * 다섯 주 뒤에 「보직을 고르라」가 왔다 — 사용자가 「처음 시작할 때
   * 나오는 게 좋겠다」고 정했다.
   *
   * ⚠ 그래도 **개막보다는 앞이어야 한다** — 개막 뒤면 옛 보직으로 몇 경기를
   *   치른 뒤가 된다. 그 선은 여기서 지킨다.
   */
  it("고교는 W1 이다 — 개막(W7)보다 앞이다", () => {
    expect(ROLE_ASK_WEEK.LEAGUE_HIGHSCHOOL).toBe(1);
    expect(ROLE_ASK_WEEK.LEAGUE_HIGHSCHOOL).toBeLessThan(HS_START_WEEK);
  });

  it("대학은 정규 개막(W5) 앞 주", () => {
    expect(ROLE_ASK_WEEK.LEAGUE_UNIVERSITY).toBe(UNIV_REGULAR_START_WEEK - 1);
  });

  it("독립은 1차 Stage(W10) 앞 주", () => {
    const stage1 = SURVIVAL_STAGES.find((s) => s.stage === 1)!;
    expect(ROLE_ASK_WEEK.LEAGUE_INDEPENDENT).toBe(stage1.startWeek - 1);
  });

  it("프로 1군만 W1 이다 — 시범경기가 W1~4 라 W4 에 물으면 12경기가 지난 뒤다", () => {
    expect(PRESEASON_START_WEEK).toBe(1);
    for (const lid of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
      expect(roleAskWeekOf(lid)).toBe(PRESEASON_START_WEEK);
    }
  });

  it("프로 2군은 시범경기가 없어 정규 개막(W5) 앞 주다", () => {
    for (const lid of ["LEAGUE_KBL_FARM", "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"]) {
      expect(roleAskWeekOf(lid)).toBe(PRO_START_WEEK - 1);
    }
  });

  it("표에 없는 리그는 기본값으로 떨어진다", () => {
    expect(roleAskWeekOf("LEAGUE_MILITARY")).toBe(ROLE_ASK_WEEK_DEFAULT);
  });
});

describe("언제 묻나", () => {
  it("개막 전 주에 묻는다", () => {
    expect(roleAskReasonOf(pitcher(), 2029, 1)).toBe("season");
  });

  it("개막 전 주가 아니면 안 묻는다", () => {
    expect(roleAskReasonOf(pitcher(), 2029, 7)).toBeNull();
  });

  // 🔴 새 게임 **첫 주**에 묻는다 (2026-09-07 · 사용자 확정). W6 은 없앴다 —
  //   거기서 물으면 W1 자동 배정을 다섯 주 뒤에 뒤집는 소식이 된다
  it("고교는 W1 이다 — W6 에는 안 묻는다", () => {
    const hs = pitcher({ careerStage: "highschool", leagueId: "LEAGUE_HIGHSCHOOL", teamId: "TEAM_HS_A" });
    expect(roleAskReasonOf(hs, 2026, 1)).toBe("season");
    expect(roleAskReasonOf(hs, 2026, 6)).toBeNull();
  });

  /**
   * 🔴 **W1 자동 배정이 안 돌아야 한다.** 물음이 가드를 세우고
   * `advanceWeek` 의 W1 갈래가 그 가드를 본다 — 순서가 뒤집히면 같은 주에
   * 「선발로 배정되었습니다」와 「보직을 고르십시오」가 **둘 다** 뜬다.
   * 프로 1군이 이미 그 길이라 배선은 있다(아래 「W1 자동 배정 배선」).
   */
  it("고교도 물으면 그 시즌 자동 배정이 막힌다", () => {
    const hs = pitcher({
      careerStage: "highschool", leagueId: "LEAGUE_HIGHSCHOOL", teamId: "TEAM_HS_A",
      lastRoleChoiceKey: roleChoiceGuardKey(2026, "TEAM_HS_A", 1),
    });
    expect(hasRoleChoiceThisSeason(hs as ProtagonistSave, 2026)).toBe(true);
    expect(roleAskReasonOf(hs, 2026, 1)).toBeNull();
  });

  it("타자는 안 묻는다", () => {
    expect(roleAskReasonOf(pitcher({ playerType: "batter" }), 2029, 1)).toBeNull();
  });

  // 🔴 확정 9 — 복무 중엔 주인공 경기가 0이다. 보직만 정해 두면 화면엔
  //   보직이 떠 있는데 기록이 안 쌓여 "왜 안 던졌나"의 답이 없다
  it("복무 중엔 안 묻는다 — 상무도 현역도", () => {
    const mil = pitcher({ careerStage: "military", leagueId: "LEAGUE_INDEPENDENT", teamId: "TEAM_IND_SANGMU_PHOENIX" });
    expect(roleAskReasonOf(mil, 2033, 9)).toBeNull();
  });
});

describe("가드 — 같은 주에 두 번 안 묻는다", () => {
  it("가드가 이번 주와 같으면 안 묻는다 (앱을 껐다 켠 경우)", () => {
    const p = pitcher({ lastRoleChoiceKey: roleChoiceGuardKey(2029, "TEAM_KBL_A_1", 1) });
    expect(roleAskReasonOf(p, 2029, 1)).toBeNull();
  });

  it("가드가 없으면 묻는다 — 대조군", () => {
    expect(roleAskReasonOf(pitcher({ lastRoleChoiceKey: undefined }), 2029, 1)).toBe("season");
  });

  it("다음 시즌 같은 주에는 다시 묻는다", () => {
    const p = pitcher({ lastRoleChoiceKey: roleChoiceGuardKey(2029, "TEAM_KBL_A_1", 1) });
    expect(roleAskReasonOf(p, 2030, 1)).toBe("season");
  });

  it("그 시즌에 물었는지 판정 — W1 자동 배정이 이걸 본다", () => {
    const p = pitcher({ lastRoleChoiceKey: roleChoiceGuardKey(2029, "TEAM_KBL_A_1", 1) });
    expect(hasRoleChoiceThisSeason(p as ProtagonistSave, 2029)).toBe(true);
    expect(hasRoleChoiceThisSeason(p as ProtagonistSave, 2030)).toBe(false);
    expect(hasRoleChoiceThisSeason({ lastRoleChoiceKey: undefined }, 2029)).toBe(false);
  });
});

describe("시즌 중에 다시 묻는 자리 — 셋만 연다", () => {
  it("콜업 — 2군에서 1군으로 (개막 전 주가 아니어도 묻는다)", () => {
    const p = pitcher({
      teamId: "TEAM_KBL_A_1",
      lastRoleChoiceKey: roleChoiceGuardKey(2029, "TEAM_KBL_A_2", 4),
    });
    expect(roleAskReasonOf(p, 2029, 9)).toBe("callup");
  });

  it("강등 — 1군에서 2군으로", () => {
    const p = pitcher({
      careerStage: "pro_kbl", leagueId: "LEAGUE_KBL_FARM", teamId: "TEAM_KBL_A_2",
      lastRoleChoiceKey: roleChoiceGuardKey(2029, "TEAM_KBL_A_1", 1),
    });
    expect(roleAskReasonOf(p, 2029, 12)).toBe("demote");
  });

  it("무대 이동·이적 — 같은 층에서 팀만 바뀌면 stageMove", () => {
    const p = pitcher({
      teamId: "TEAM_KBL_B_1",
      lastRoleChoiceKey: roleChoiceGuardKey(2029, "TEAM_KBL_A_1", 1),
    });
    expect(roleAskReasonOf(p, 2029, 15)).toBe("stageMove");
  });

  it("같은 팀이면 시즌 중엔 안 묻는다 — 성적이 나빠서 다시 묻는 일은 없다 (확정 3)", () => {
    const p = pitcher({ lastRoleChoiceKey: roleChoiceGuardKey(2029, "TEAM_KBL_A_1", 1) });
    expect(roleAskReasonOf(p, 2029, 15)).toBeNull();
  });

  it("지난 시즌의 팀과 다르다고 시즌 중에 묻지는 않는다", () => {
    const p = pitcher({
      teamId: "TEAM_KBL_B_1",
      lastRoleChoiceKey: roleChoiceGuardKey(2028, "TEAM_KBL_A_1", 1),
    });
    expect(roleAskReasonOf(p, 2029, 15)).toBeNull();
    // 개막 전 주에는 묻는다
    expect(roleAskReasonOf(p, 2029, 1)).toBe("season");
  });

  it("전역 뒤 첫 시즌은 머리말이 다르다", () => {
    const p = pitcher({
      careerEvents: [{ year: 2033, eventType: "military_discharge", detail: "전역" }] as ProtagonistSave["careerEvents"],
    });
    expect(roleAskReasonOf(p, 2034, 1)).toBe("discharge");
  });

  it("전역이 오래됐으면 평범한 개막 전 주다", () => {
    const p = pitcher({
      careerEvents: [{ year: 2030, eventType: "military_discharge", detail: "전역" }] as ProtagonistSave["careerEvents"],
    });
    expect(roleAskReasonOf(p, 2034, 1)).toBe("season");
  });
});

describe("shouldAskRoleChoice 는 같은 판정을 쓴다", () => {
  it("이유가 있으면 참", () => {
    expect(shouldAskRoleChoice(pitcher(), 2029, 1)).toBe(true);
    expect(shouldAskRoleChoice(pitcher(), 2029, 7)).toBe(false);
  });
});

/**
 * W1 자동 배정은 **선택이 이미 있으면 덮어쓰지 않는다** (§7).
 *
 * ⚠ 배선을 확인한다 — 판정 함수가 있어도 `advanceWeek` 이 안 부르면
 * 아무 일도 안 일어난다(CLAUDE.md "층마다 맞는데 잇는 선이 없다").
 * 정규식을 쓰지 않고 문자열로 본다.
 */
describe("W1 자동 배정 배선", () => {
  const SRC = readFileSync(resolve(__dirname, "../advanceWeek.ts"), "utf8");

  it("processWeekBoundary 가 askRoleChoice 를 부른다", () => {
    expect(SRC.includes("await askRoleChoice(s.seasonYear, weekInYearOf(weekNum))")).toBe(true);
  });

  // 🔴 스냅샷이 아니라 **다시 읽은** store 를 본다 — 방금 세운 가드가 함수
  //   머리의 `g` 에는 없다. 프로 1군은 묻는 주가 W1 이라 그대로 두면 같은 주에
  //   물음과 브리핑이 둘 다 뜬다
  it("W1 갈래가 hasRoleChoiceThisSeason 으로 막히고, store 를 다시 읽는다", () => {
    expect(SRC.includes("!hasRoleChoiceThisSeason(get(gameStore).protagonist, s.seasonYear)")).toBe(true);
  });

  it("둘 다 import 되어 있다", () => {
    expect(SRC.includes('import { askRoleChoice, hasRoleChoiceThisSeason } from "./pitcherRole"')).toBe(true);
  });
});

/**
 * 헤드리스 갈래 — `pickChoice(options, fatigue)` 를 **안 탄다**.
 *
 * 🔴 그 휴리스틱은 라벨의 키워드와 피로로 고른다. 보직 소식이 거기로 들어가면
 * **피로 값에 따라 보직이 정해진다.**
 */
describe("헤드리스 배선", () => {
  const SRC = readFileSync(resolve(__dirname, "../runAutoAdvance.ts"), "utf8");

  it("handleMessage 가 roleChoice 를 먼저 가른다", () => {
    expect(SRC.includes('if (msg.metadata?.type === "roleChoice")')).toBe(true);
  });

  it("그 갈래가 applyRoleChoice + 정책을 쓴다", () => {
    expect(SRC.includes("await applyRoleChoice(messageId, roleChoicePolicyPick(")).toBe(true);
  });

  it("갈래가 pickChoice 앞에 있다 — 뒤면 아무 소용이 없다", () => {
    const branch = SRC.indexOf('if (msg.metadata?.type === "roleChoice")');
    const heur   = SRC.indexOf("const choiceId = pickChoice(msg.decision.options");
    expect(branch).toBeGreaterThan(-1);
    expect(heur).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(heur);
  });

  it("프로브가 정책 기본값을 심는다", () => {
    const PROBE = readFileSync(resolve(__dirname, "../../../../../../scripts/probe-paths.cjs"), "utf8");
    expect(PROBE.includes('globalThis.__PB_ROLE_CHOICE = process.env.PB_ROLE_CHOICE || "recommend"')).toBe(true);
  });
});
