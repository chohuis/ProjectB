import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  primeTraitDisplay,
  traitDisplayRules,
  growthRoom,
  growthGrade,
  gradeTone,
  scoutedGrade,
  personalityTags,
  militaryHistory,
  foreignBadge,
  rispSplit,
  rispTone,
  type TraitGrade,
  type PersonalityAxis,
} from "../playerTraits";
import { primeForeignRules } from "../foreignSlots";

/** 규칙 파일이 정본이다 — 테스트가 경계값을 다시 적으면 정본이 둘이 된다 */
const rulesFile = JSON.parse(
  readFileSync(join(process.cwd(), "resource/data/master/players/generation_rules.json"), "utf8"),
) as {
  traitDisplay: {
    growthRoomCuts: Record<"A" | "B" | "C" | "D", number>;
    scoutingBlurWidth: number;
    personalityCuts: Record<string, { hi: number; lo: number }>;
    maxPersonalityTags: number;
  };
  foreignRules?: unknown;
  rosterRules?: Record<string, { nationality?: string }>;
};

beforeAll(() => {
  primeTraitDisplay(rulesFile);
  primeForeignRules(rulesFile);
});

const CUTS = rulesFile.traitDisplay.growthRoomCuts;
const GRADES: TraitGrade[] = ["A", "B", "C", "D", "E"];

describe("규칙 주입", () => {
  it("generation_rules.json에 traitDisplay가 있다", () => {
    expect(traitDisplayRules()).not.toBeNull();
  });

  it("주입 전에는 등급도 태그도 안 나온다 — 조용히 틀린 값을 만들지 않는다", () => {
    primeTraitDisplay({});
    expect(growthGrade(40)).toBeNull();
    expect(personalityTags({ ambition: 99 })).toEqual([]);
    primeTraitDisplay(rulesFile);
  });
});

describe("성장 여지", () => {
  it("천장에서 현재 실력을 뺀다", () => {
    expect(growthRoom(88, 64)).toBe(24);
  });

  it("한쪽이라도 없으면 null — 0으로 만들지 않는다", () => {
    expect(growthRoom(undefined, 64)).toBeNull();
    expect(growthRoom(88, undefined)).toBeNull();
  });

  it("경계값이 그 등급에 포함된다", () => {
    expect(growthGrade(CUTS.A)).toBe("A");
    expect(growthGrade(CUTS.B)).toBe("B");
    expect(growthGrade(CUTS.C)).toBe("C");
    expect(growthGrade(CUTS.D)).toBe("D");
    expect(growthGrade(CUTS.D - 1)).toBe("E");
  });

  it("경계 바로 아래는 한 등급 내려간다", () => {
    expect(growthGrade(CUTS.A - 1)).toBe("B");
    expect(growthGrade(CUTS.B - 1)).toBe("C");
    expect(growthGrade(CUTS.C - 1)).toBe("D");
  });

  it("여지가 음수여도(이미 천장을 넘긴 노장) 터지지 않는다", () => {
    expect(growthGrade(-5)).toBe("E");
  });

  it("경계가 내림차순이다 — 뒤집히면 등급 하나가 도달 불가가 된다", () => {
    expect(CUTS.A).toBeGreaterThan(CUTS.B);
    expect(CUTS.B).toBeGreaterThan(CUTS.C);
    expect(CUTS.C).toBeGreaterThan(CUTS.D);
  });

  it("다섯 등급이 전부 실제로 나온다", () => {
    const seen = new Set<TraitGrade>();
    for (let room = -10; room <= 60; room++) {
      const g = growthGrade(room);
      if (g) seen.add(g);
    }
    expect([...seen].sort()).toEqual(GRADES.slice().sort());
  });

  it("A·B는 밝게, D·E는 어둡게", () => {
    expect(gradeTone("A")).toBe("good");
    expect(gradeTone("C")).toBe("mid");
    expect(gradeTone("E")).toBe("low");
  });
});

describe("스카우팅 흐림", () => {
  const IDS = Array.from({ length: 400 }, (_, i) => `NPC_KBL_${i}`);

  it("내 팀 선수는 정확한 등급이다", () => {
    for (const g of GRADES) {
      const s = scoutedGrade(g, "NPC_X", true);
      expect(s?.exact).toBe(g);
      expect(s?.range).toBeNull();
    }
  });

  it("남의 팀은 범위로만 나온다", () => {
    const s = scoutedGrade("C", "NPC_X", false);
    expect(s?.exact).toBeNull();
    expect(s?.range).not.toBeNull();
    expect(s?.label).toMatch(/^[A-E]~[A-E]$/);
  });

  it("범위가 항상 진짜 등급을 담는다 — 전 등급 × 400 ID 전수", () => {
    for (const g of GRADES) {
      for (const id of IDS) {
        const s = scoutedGrade(g, id, false);
        const [lo, hi] = s!.range!;
        const i = GRADES.indexOf(g);
        expect(GRADES.indexOf(lo)).toBeLessThanOrEqual(i);
        expect(GRADES.indexOf(hi)).toBeGreaterThanOrEqual(i);
      }
    }
  });

  it("범위 폭이 규칙대로다", () => {
    const w = rulesFile.traitDisplay.scoutingBlurWidth;
    for (const id of IDS) {
      const [lo, hi] = scoutedGrade("C", id, false)!.range!;
      expect(GRADES.indexOf(hi) - GRADES.indexOf(lo) + 1).toBe(w);
    }
  });

  it("같은 선수는 언제나 같은 범위다 — Math.random()을 쓰지 않는다", () => {
    for (const id of IDS.slice(0, 50)) {
      const a = scoutedGrade("B", id, false)!.label;
      const b = scoutedGrade("B", id, false)!.label;
      expect(a).toBe(b);
    }
  });

  it("창이 늘 진짜 등급 한가운데는 아니다 — 가운데만 읽으면 정답이면 흐린 뜻이 없다", () => {
    // C(가운데 등급)는 창이 밀릴 자리가 양쪽에 다 있다
    const labels = new Set(IDS.map((id) => scoutedGrade("C", id, false)!.label));
    expect(labels.size).toBeGreaterThan(1);
  });

  it("등급이 없으면 null이다", () => {
    expect(scoutedGrade(null, "NPC_X", false)).toBeNull();
  });
});

describe("성격 태그", () => {
  const CUT = rulesFile.traitDisplay.personalityCuts;
  const AXES = Object.keys(CUT) as PersonalityAxis[];

  it("문구가 있는 축·방향은 전부 실제로 도달한다 — 死문구가 없다", () => {
    // ⚠ 이게 이 파일에서 제일 중요한 검사다. 고정 임계값(>=75/<=25)을 쓰던
    // 방식에선 실측상 태그 6종이 영원히 안 나왔다.
    const reachable = new Set<string>();
    for (const axis of AXES) {
      for (const side of ["hi", "lo"] as const) {
        const v = side === "hi" ? CUT[axis].hi : CUT[axis].lo;
        const tags = personalityTags({ [axis]: v } as Partial<Record<PersonalityAxis, number>>);
        for (const t of tags) reachable.add(`${t.axis}:${t.side}`);
      }
    }
    // 도달한 태그가 축 수보다 많아야 한다(대부분의 축이 양방향)
    expect(reachable.size).toBeGreaterThanOrEqual(AXES.length);
    // 각 축이 최소 한 방향은 나온다
    for (const axis of AXES) {
      const hit = [...reachable].some((k) => k.startsWith(`${axis}:`));
      expect(hit, `${axis} 축은 어느 방향으로도 태그가 안 나온다`).toBe(true);
    }
  });

  it("경계값이 정확히 포함된다", () => {
    expect(personalityTags({ ambition: CUT.ambition.hi })).toHaveLength(1);
    expect(personalityTags({ ambition: CUT.ambition.hi - 1 })).toHaveLength(0);
    expect(personalityTags({ ambition: CUT.ambition.lo })).toHaveLength(1);
    expect(personalityTags({ ambition: CUT.ambition.lo + 1 })).toHaveLength(0);
  });

  it("hi < lo 인 축이 없다 — 뒤집히면 한 선수가 양쪽 태그를 다 받는다", () => {
    for (const axis of AXES) {
      expect(CUT[axis].lo, `${axis}`).toBeLessThan(CUT[axis].hi);
    }
  });

  it("평범한 선수는 태그가 없다", () => {
    const mid: Partial<Record<PersonalityAxis, number>> = {};
    for (const axis of AXES) mid[axis] = (CUT[axis].hi + CUT[axis].lo) / 2;
    expect(personalityTags(mid)).toEqual([]);
  });

  it("태그 수가 상한을 넘지 않는다", () => {
    const extreme: Partial<Record<PersonalityAxis, number>> = {};
    for (const axis of AXES) extreme[axis] = CUT[axis].hi;
    expect(personalityTags(extreme).length).toBe(rulesFile.traitDisplay.maxPersonalityTags);
  });

  it("순서가 항상 같다 — 열 때마다 태그가 춤추면 안 된다", () => {
    const p: Partial<Record<PersonalityAxis, number>> = {};
    for (const axis of AXES) p[axis] = CUT[axis].hi;
    const a = personalityTags(p).map((t) => t.axis);
    const b = personalityTags(p).map((t) => t.axis);
    expect(a).toEqual(b);
  });

  it("성격이 없으면(주인공·구 세이브) 빈 배열이다", () => {
    expect(personalityTags(null)).toEqual([]);
    expect(personalityTags(undefined)).toEqual([]);
    expect(personalityTags({})).toEqual([]);
  });
});

describe("병역 이력", () => {
  it("군필 + 상무면 상무 출신", () => {
    expect(militaryHistory("군필", "sports")?.text).toBe("상무 출신");
  });
  it("군필 + 일반이면 현역 만기", () => {
    expect(militaryHistory("군필", "general")?.text).toBe("현역 만기");
  });
  it("복무 중에는 이력이 아니다", () => {
    expect(militaryHistory("현역", "sports")).toBeNull();
  });
  it("면제·미필은 없다", () => {
    expect(militaryHistory("면제", undefined)).toBeNull();
    expect(militaryHistory("미필", undefined)).toBeNull();
  });
  it("구 세이브(다녀온 부대 기록 없음)는 조용히 비운다", () => {
    expect(militaryHistory("군필", undefined)).toBeNull();
  });
});

describe("국적 배지", () => {
  it("KBL 외국인만 배지가 붙는다", () => {
    expect(foreignBadge("LEAGUE_KBL", "USA")?.label).toBe("미국");
  });
  it("KBL 한국 선수는 배지가 없다", () => {
    expect(foreignBadge("LEAGUE_KBL", "KOR")).toBeNull();
  });
  it("용병 개념이 없는 리그는 국적이 달라도 배지가 없다", () => {
    expect(foreignBadge("LEAGUE_HIGHSCHOOL", "USA")).toBeNull();
    expect(foreignBadge("LEAGUE_UNIVERSITY", "JPN")).toBeNull();
  });
  it("리그를 모르면 배지가 없다", () => {
    expect(foreignBadge(undefined, "USA")).toBeNull();
  });
});

describe("득점권", () => {
  it("타수가 없으면 아무것도 안 보여준다", () => {
    expect(rispSplit({ rispAb: 0, rispH: 0 }, "batter", 0.28)).toBeNull();
    expect(rispSplit(null, "batter", 0.28)).toBeNull();
  });

  it("표본이 얇으면 비율 대신 원수만 준다 — 1/3타수가 3할로 보이면 안 된다", () => {
    const s = rispSplit({ rispAb: 3, rispH: 1 }, "batter", 0.28);
    expect(s?.text).toBe("1/3");
    expect(s?.delta).toBeNull();
  });

  it("표본이 충분하면 타율과 차이를 준다", () => {
    const s = rispSplit({ rispAb: 40, rispH: 14 }, "batter", 0.28);
    expect(s?.avg).toBeCloseTo(0.35, 3);
    expect(s?.text).toBe(".350 (14/40)");
    expect(s?.delta).toBeCloseTo(0.07, 3);
  });

  it("투수는 피안타율이라 이름이 다르다", () => {
    expect(rispSplit({ rispAb: 40, rispH: 8 }, "pitcher", 0.25)?.label).toBe("득점권 피안타율");
    expect(rispSplit({ rispAb: 40, rispH: 8 }, "batter", 0.25)?.label).toBe("득점권 타율");
  });

  it("좋고 나쁨이 타자와 투수에서 반대다", () => {
    // 같은 +0.05인데 타자는 강하고 투수는 얻어맞은 것이다
    expect(rispTone(0.05, "batter")).toBe("good");
    expect(rispTone(0.05, "pitcher")).toBe("bad");
    expect(rispTone(-0.05, "batter")).toBe("bad");
    expect(rispTone(-0.05, "pitcher")).toBe("good");
  });

  it("차이가 작으면 색을 안 준다 — 노이즈를 성격으로 읽지 않는다", () => {
    expect(rispTone(0.01, "batter")).toBe("flat");
    expect(rispTone(null, "batter")).toBe("flat");
  });
});
