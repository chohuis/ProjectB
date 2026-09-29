/**
 * **`pitchGradeUp.steps` 가 실제로 그만큼 올리는가** (2026-09-09 · 사용자 확정 · B 제보).
 *
 * 🔴 보상안 §1 은 히든이 「구종 등급 **두 단계**」인데, 효과 객체는 같은 키를 둘
 *   둘 수 없어서 **한 번에 +1 이 상한**이었다. 그대로 두면 히든이 유니크와 종류가
 *   같아지고, 데이터에 두 단계를 적어 봐야 **한 단계만 먹고 조용히 넘어간다** —
 *   B 가 정확히 짚었다. 조용히 넘어가는 게 제일 나쁘다.
 *
 * 그래서 칸을 붙이고 **여기서 못박는다.** 「적을 수 있다」가 아니라
 * 「적은 만큼 오른다」를 잰다.
 */
import { describe, it, expect } from "vitest";
import { applyEffectToProtagonist } from "../game";
import type { ProtagonistSave } from "../../types/save";

const withPitch = (grade: number): ProtagonistSave =>
  ({
    pitches: [{ id: "PITCH_SLIDER", grade }],
    pitching: {
      ovr: 60,
      velocity: 60,
      command: 60,
      control: 60,
      movement: 60,
      mentality: 60,
      stamina: 60,
      recovery: 60,
      clutch: 60,
      holdRunners: 60,
    },
    pitchingXP: {},
    battingXP: {},
    tags: [],
    condition: 70,
    fatigue: 30,
    morale: 60,
    money: 100,
    fame: 10,
    popularity: 10,
    diligence: 60,
  }) as unknown as ProtagonistSave;

const gradeOf = (p: ProtagonistSave) =>
  (p.pitches ?? []).find((x) => x.id === "PITCH_SLIDER")?.grade;

describe("`pitchGradeUp.steps`", () => {
  it("없으면 한 단계 — 옛 데이터가 그대로 돈다", () => {
    expect(
      gradeOf(applyEffectToProtagonist(withPitch(2), { pitchGradeUp: { id: "PITCH_SLIDER" } })),
    ).toBe(3);
  });

  it("🔴 `steps: 2` 면 **두 단계** 오른다 — 히든이 유니크와 갈리는 자리다", () => {
    expect(
      gradeOf(
        applyEffectToProtagonist(withPitch(1), { pitchGradeUp: { id: "PITCH_SLIDER", steps: 2 } }),
      ),
    ).toBe(3);
    expect(
      gradeOf(
        applyEffectToProtagonist(withPitch(2), { pitchGradeUp: { id: "PITCH_SLIDER", steps: 2 } }),
      ),
    ).toBe(4);
  });

  it("세 단계도 적은 만큼 오른다 — 상한 전까지는 값이 그대로 산다", () => {
    expect(
      gradeOf(
        applyEffectToProtagonist(withPitch(1), { pitchGradeUp: { id: "PITCH_SLIDER", steps: 3 } }),
      ),
    ).toBe(4);
  });

  it("상한 5 를 안 넘는다", () => {
    expect(
      gradeOf(
        applyEffectToProtagonist(withPitch(4), { pitchGradeUp: { id: "PITCH_SLIDER", steps: 3 } }),
      ),
    ).toBe(5);
    expect(
      gradeOf(
        applyEffectToProtagonist(withPitch(5), { pitchGradeUp: { id: "PITCH_SLIDER", steps: 2 } }),
      ),
    ).toBe(5);
  });

  it("0·음수는 한 단계로 본다 — 「올린다」고 적고 안 오르면 안 된다", () => {
    expect(
      gradeOf(
        applyEffectToProtagonist(withPitch(2), { pitchGradeUp: { id: "PITCH_SLIDER", steps: 0 } }),
      ),
    ).toBe(3);
    expect(
      gradeOf(
        applyEffectToProtagonist(withPitch(2), { pitchGradeUp: { id: "PITCH_SLIDER", steps: -3 } }),
      ),
    ).toBe(3);
  });

  it("없는 구종이면 아무 일도 안 한다", () => {
    const p = applyEffectToProtagonist(withPitch(2), {
      pitchGradeUp: { id: "PITCH_CURVE", steps: 2 },
    });
    expect(gradeOf(p)).toBe(2);
    expect((p.pitches ?? []).length).toBe(1);
  });
});

/**
 * **`pitchGrant.grade`** — 히든의 구종 **부여**가 유니크와 갈리는 자리
 * (2026-09-30 · 사용자 확정 · 정본 `PLAN_REWARDS_2026-09-09.md §7.3`).
 *
 * 🔴 예전엔 부여가 **늘 `grade: 1`** 이라 히든의 `pitchGrant` 가 유니크의
 *   그것과 **한 글자도 안 달랐다.** 검사 ⑥ 은 `pitchGradeUp` 만 봐서 이
 *   자리에 걸 잣대가 없었다(`HANDOFF_B_TO_A 6차 §0.1`).
 *
 * ⚠ **「이미 있는 구종」 갈래는 `grade` 를 안 본다.** 있는 구종에 두 단계를
 *   주는 길은 `pitchGradeUp steps 2` 하나다 — 여기서도 +2 가 되면 정본이
 *   둘이 되고, 「2 로 맞춘다」와 「+2」가 자리마다 갈린다(§7.2 ㉠ 의 겹침).
 *   아래 대조군 둘이 그 경계를 못박는다.
 */
const curveOf = (p: ProtagonistSave) =>
  (p.pitches ?? []).find((x) => x.id === "PITCH_CURVE")?.grade;

describe("`pitchGrant.grade`", () => {
  it("없으면 등급 1 로 붙는다 — 옛 데이터가 그대로 돈다", () => {
    const p = applyEffectToProtagonist(withPitch(2), { pitchGrant: { id: "PITCH_CURVE" } });
    expect(curveOf(p)).toBe(1);
  });

  it("🔴 `grade: 2` 면 **2등급으로** 붙는다 — 히든이 유니크와 갈리는 자리다", () => {
    const p = applyEffectToProtagonist(withPitch(2), {
      pitchGrant: { id: "PITCH_CURVE", grade: 2 },
    });
    expect(curveOf(p)).toBe(2);
  });

  it("🔴 대조군 — **이미 있는 구종**이면 `grade: 2` 여도 한 단계만 오른다", () => {
    expect(
      gradeOf(
        applyEffectToProtagonist(withPitch(2), { pitchGrant: { id: "PITCH_SLIDER", grade: 2 } }),
      ),
    ).toBe(3);
  });

  it("🔴 대조군 — 있는 구종을 두 단계 올리는 길은 `pitchGradeUp steps 2` 하나다", () => {
    expect(
      gradeOf(
        applyEffectToProtagonist(withPitch(2), { pitchGradeUp: { id: "PITCH_SLIDER", steps: 2 } }),
      ),
    ).toBe(4);
  });

  it("5종이 차면 아무 일도 안 한다 — 등급을 적었어도 자리가 없다", () => {
    const full = {
      ...withPitch(2),
      pitches: [
        { id: "PITCH_SLIDER", grade: 2 },
        { id: "PITCH_FASTBALL", grade: 2 },
        { id: "PITCH_CHANGEUP", grade: 2 },
        { id: "PITCH_SPLITTER", grade: 2 },
        { id: "PITCH_FORKBALL", grade: 2 },
      ],
    } as unknown as ProtagonistSave;
    const p = applyEffectToProtagonist(full, { pitchGrant: { id: "PITCH_CURVE", grade: 2 } });
    expect(curveOf(p)).toBeUndefined();
    expect((p.pitches ?? []).length).toBe(5);
  });
});
