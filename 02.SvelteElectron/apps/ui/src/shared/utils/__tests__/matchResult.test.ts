import { describe, it, expect } from "vitest";
import {
  isOutInPlay, isHit, isStrike, isAtBatOver,
  flashLabel, logLabel, logClass, flashColor,
  type PitchResultCode, type BallInPlay,
} from "../matchResult";

const ALL: PitchResultCode[] = [
  "STRIKE_SWING", "STRIKE_LOOK", "BALL", "FOUL",
  "INPLAY_OUT", "GROUND_OUT", "FLY_OUT", "LINE_OUT", "DOUBLE_PLAY",
  "FIELDING_ERROR", "HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN",
  "WALK", "GAME_OVER",
];

const ball = (o: Partial<BallInPlay> = {}): BallInPlay =>
  ({ hitType: "groundBall", zone: "SS", hardness: 3, ...o });

describe("분류", () => {
  it("인플레이 아웃 다섯 (중간값 포함)", () => {
    expect(ALL.filter(isOutInPlay)).toEqual(
      ["INPLAY_OUT", "GROUND_OUT", "FLY_OUT", "LINE_OUT", "DOUBLE_PLAY"]);
  });

  it("⚠ 병살은 인플레이 아웃이다 — 아웃 집계에서 빠지면 이닝이 안 끝난다", () => {
    expect(isOutInPlay("DOUBLE_PLAY")).toBe(true);
    expect(isAtBatOver("DOUBLE_PLAY")).toBe(true);
  });

  it("안타 넷", () => {
    expect(ALL.filter(isHit)).toEqual(["HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"]);
  });

  it("스트라이크 둘 — 파울은 아니다", () => {
    expect(ALL.filter(isStrike)).toEqual(["STRIKE_SWING", "STRIKE_LOOK"]);
    expect(isStrike("FOUL")).toBe(false);
  });

  it("타석이 끝나는 결과 — 볼·파울·스트라이크는 안 끝난다", () => {
    expect(isAtBatOver("BALL")).toBe(false);
    expect(isAtBatOver("FOUL")).toBe(false);
    expect(isAtBatOver("STRIKE_SWING")).toBe(false);
    expect(isAtBatOver("WALK")).toBe(true);
    expect(isAtBatOver("FIELDING_ERROR")).toBe(true);
    expect(isAtBatOver("HOME_RUN")).toBe(true);
  });
});

describe("문구", () => {
  it("모든 코드에 큰 글자 문구가 있다 — 코드가 그대로 노출되면 안 된다", () => {
    for (const c of ALL) {
      expect(flashLabel(c)).toBeTruthy();
      expect(flashLabel(c)).not.toBe(c);
    }
  });

  it("큰 글자는 짧다 — 1.4초 스쳐 지나간다", () => {
    for (const c of ALL) expect(flashLabel(c).length).toBeLessThanOrEqual(6);
  });

  it("타구 정보가 있으면 누구 앞이었는지까지 쓴다", () => {
    expect(logLabel("GROUND_OUT", ball({ zone: "SS" }))).toBe("유격수 땅볼 아웃");
    expect(logLabel("FLY_OUT", ball({ zone: "CF", hitType: "flyBall" }))).toBe("중견수 뜬공 아웃");
    expect(logLabel("LINE_OUT", ball({ zone: "2B", hitType: "lineDrive" }))).toBe("2루수 직선타 아웃");
  });

  it("팝업도 뜬공으로 부른다", () => {
    expect(logLabel("FLY_OUT", ball({ zone: "1B", hitType: "popup" }))).toBe("1루수 뜬공 아웃");
  });

  it("병살은 잡은 위치를 앞에 붙인다", () => {
    expect(logLabel("DOUBLE_PLAY", ball({ zone: "SS" }))).toBe("유격수 병살타");
  });

  it("⚠ '병살타'는 땅볼에만 쓴다 — 직선타 병살은 다른 말이다", () => {
    // 엔진은 직선타에서도 병살을 낸다(잡아서 주자를 묶는 경우).
    // 그때 "중견수 병살타"라고 쓰면 틀린 야구 용어가 된다 — 실제로 화면에 찍혔다
    expect(logLabel("DOUBLE_PLAY", ball({ zone: "CF", hitType: "lineDrive" }))).toBe("중견수 직선타 병살");
    expect(logLabel("DOUBLE_PLAY", ball({ zone: "SS", hitType: "groundBall" }))).toBe("유격수 병살타");
  });

  it("⚠ 타구 정보가 없으면 지어내지 않는다", () => {
    expect(logLabel("GROUND_OUT")).toBe("땅볼 아웃");
    expect(logLabel("DOUBLE_PLAY")).toBe("병살타");
    expect(logLabel("GROUND_OUT", null)).toBe("땅볼 아웃");
  });

  it("모르는 수비 위치가 오면 기본 문구로 물러난다", () => {
    expect(logLabel("GROUND_OUT", ball({ zone: "DH" }))).toBe("땅볼 아웃");
  });

  it("단타는 방향을 붙이되 2·3루타는 안 붙인다 — 엔진이 낙구 지점을 안 준다", () => {
    expect(logLabel("HIT_SINGLE", ball({ zone: "LF" }))).toBe("좌익수 앞 안타");
    expect(logLabel("HIT_DOUBLE", ball({ zone: "LF" }))).toBe("2루타");
  });
});

describe("색", () => {
  it("모든 코드에 로그 색이 있다 (평범한 것 빼고)", () => {
    for (const c of ALL) {
      if (c === "GAME_OVER") continue;
      expect(logClass(c)).not.toBe("");
    }
  });

  it("병살은 아웃 색이 아니라 제 색이다 — 삼진보다 좋은 일이다", () => {
    expect(logClass("DOUBLE_PLAY")).toBe("log-dp");
    expect(logClass("GROUND_OUT")).toBe("log-out");
    expect(logClass("DOUBLE_PLAY")).not.toBe(logClass("GROUND_OUT"));
  });

  it("인플레이 아웃 셋은 같은 색", () => {
    expect(new Set(["GROUND_OUT", "FLY_OUT", "LINE_OUT"].map((c) => logClass(c as PitchResultCode))).size).toBe(1);
  });

  it("모든 코드에 큰 글자 색이 있다", () => {
    for (const c of ALL) expect(flashColor(c)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("홈런과 삼진은 색이 다르다", () => {
    expect(flashColor("HOME_RUN")).not.toBe(flashColor("STRIKE_SWING"));
  });
});
