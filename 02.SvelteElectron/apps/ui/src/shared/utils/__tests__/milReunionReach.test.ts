import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { runEventEngine, resetEventFunnelStats } from "../eventEngine";
import { parseTierRules } from "../tierRules";
import RAW_TIER_RULES from "../../../../../../resource/data/master/events/tier_rules.json";
import type { DecisionTemplate, EventContext, EventRule, MessageTemplate } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";

/**
 * 병영 재회 12종이 **전역 뒤에 실제로 뽑히는가** (단위 17 · 2026-09-04).
 *
 * 🔴 D 가 「도달 0/12」로 올린 것을 좇았더니 **배선이 아니라 목록**이었다 —
 *    `_manifest.json` 이 낡아 12종이 로드 목록에 아예 없었다(조건부 322 vs
 *    파일 334). `gen:manifest` 한 번에 340이 되고 12종이 들어온다. 그건
 *    `eventManifest.test.ts` 가 지킨다.
 *
 * 여기서는 **그 다음**을 잰다 — 목록에 있으면 조건·정책·주당 1칸을 지나
 * 소식이 되는가. 헤드리스 한 판은 씨앗을 타서 「안 떴다」가 「못 뜬다」인지
 * 「이번 판엔 안 왔다」인지 못 가른다. 여기는 규칙 파일과 진짜 엔진으로
 * 그 갈래를 없앤다.
 *
 * ⚠ **조건을 검사에 옮겨 적지 않는다.** 규칙 파일을 그대로 읽는다 — 문턱을
 *   B 가 바꾸면 이 검사도 같이 움직여야 한다.
 */

const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const read = (p: string) => readFileSync(resolve(MASTER, p), "utf8");

const REUNION_DIR = resolve(MASTER, "events/conditional");
const reunionFiles = readdirSync(REUNION_DIR).filter(
  (f) => f.startsWith("EVT_MILREUNION_") && f.endsWith(".json"),
);

// ⚠ 규칙 파일을 그대로 쓴다. `masterStore.parseEventRule` 은 내보내지 않는데, 이
//   열둘은 새 꼴(`conditions` 배열)이라 옮겨 담을 게 없다 — 모양 검사는
//   `eventConditionShape.test.ts` 가 따로 본다.
const rules: EventRule[] = reunionFiles.map(
  (f) => JSON.parse(readFileSync(resolve(REUNION_DIR, f), "utf8")) as EventRule,
);

const msgTmpls = new Map<string, MessageTemplate>(
  (JSON.parse(read("messages/templates.json")) as { templates: MessageTemplate[] }).templates.map(
    (t) => [t.id, t],
  ),
);
const decTmpls = new Map<string, DecisionTemplate>(
  (
    JSON.parse(read("messages/decision_templates.json")) as { decisions: DecisionTemplate[] }
  ).decisions.map((t) => [t.id, t]),
);

/** 전역한 지 `weeks` 주 된 주인공. 나머지는 이 검사가 안 보는 값이다 */
const discharged = (weeks: number, over: Partial<ProtagonistSave> = {}): ProtagonistSave =>
  ({
    id: "PLY_HERO",
    name: "검사",
    careerStage: "independent",
    leagueId: "LEAGUE_INDEPENDENT",
    teamId: "TEAM_IND_A",
    age: 23,
    playerType: "pitcher",
    position: "SP",
    handedness: "R",
    pitchingForm: "overhand",
    jerseyNumber: 18,
    condition: 80,
    fatigue: 10,
    morale: 60,
    pitching: {
      ovr: 60,
      stamina: 60,
      velocity: 60,
      command: 60,
      control: 60,
      movement: 60,
      mentality: 60,
      recovery: 60,
      clutch: 60,
      holdRunners: 60,
    },
    batting: { ovr: 30 },
    primaryPosition: "SP",
    positionRatings: { SP: 60 },
    diligence: 60,
    popularity: 10,
    developmentRate: 1,
    potentialHidden: 70,
    growthPoints: 0,
    tags: [],
    pitchingXP: {},
    battingXP: {},
    pitches: [],
    money: 1000,
    fame: 50,
    scoutScore: 0,
    proServiceYears: 0,
    militaryStatus: "군필",
    militaryServedUnit: "general",
    dischargedSeason: 2030,
    dischargedWeek: 10 - weeks,
    militaryRecord: {
      unitId: "UNIT_A",
      unitName: "1대대",
      roleId: "mortar",
      roleLabel: "박격포",
      arcLabel: "사수",
      finalBallSense: 60,
      leaveDays: 20,
      awards: [],
      penalties: [],
      perf: [],
      senseCurve: [],
      topRelations: [{ memberId: "M1", name: "김상병", value: 45 }],
      conversion: { statDelta: -1, velocityDelta: 0, recoveryWeeks: 6 },
    },
    ...over,
  }) as unknown as ProtagonistSave;

const ctxOf = (
  weeks: number,
  over: Partial<ProtagonistSave> = {},
  currentWeek = 10,
): EventContext => ({
  protagonist: discharged(weeks, over),
  currentWeek,
  seasonYear: 2030,
  seasonPhase: "season",
  standings: [],
  stats: {},
  triggeredEvents: {},
});

/**
 * 전역 뒤 설 수 있는 무대 둘. **대학은 없다** — 학생 출신은 독립으로 가고
 * (militaryDecision 의 전역 처리) 프로 출신은 제 리그로 돌아간다.
 *
 * 🔴 12종 중 다섯이 프로 전용이다(career_stage pro_*) — 독립으로 전역한 판에서는
 *    그 다섯이 **영영 안 뜬다.** 설계대로인지 문턱인지는 B·사용자 몫이라
 *    여기서는 무대를 둘 다 훑어 「열리는 자리가 있는가」만 본다.
 */
const STAGES: readonly string[] = ["independent", "pro_kbl"];

/** 등급 규칙은 진짜 파일에서 읽는다 — 여기 숫자를 적으면 두 번째 정본이 된다 */
const TIER_RULES = parseTierRules(RAW_TIER_RULES);

/** 한 주를 돌린다. 난수는 고정 — 씨앗이 결과를 가르면 검사가 아니다 */
const runWeek = (ctx: EventContext) => {
  resetEventFunnelStats();
  return runEventEngine(
    rules,
    [],
    msgTmpls,
    decTmpls,
    ctx,
    2030,
    1,
    [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    TIER_RULES,
    "공용",
  );
};

describe("병영 재회 — 전역 뒤 도달", () => {
  it("12종이 폴더에 있다", () => {
    expect(reunionFiles).toHaveLength(12);
  });

  it("문안·선택지 템플릿이 다 있다 — 없으면 빈 소식으로 버려진다", () => {
    for (const r of rules) {
      if (r.messageTemplateId) {
        expect(msgTmpls.has(r.messageTemplateId), `${r.id} 문안 없음`).toBe(true);
      }
      if (r.decisionTemplateId) {
        expect(decTmpls.has(r.decisionTemplateId), `${r.id} 선택지 없음`).toBe(true);
      }
    }
  });

  /** 🔴 조건이 제일 헐거운 한 종 — 이게 안 뜨면 경로 자체가 죽은 것이다 */
  it("전역 5주차에 소식이 온다", () => {
    const out = runWeek(ctxOf(5));
    expect(out.newMessages.length, "재회 소식이 한 통도 안 왔다").toBeGreaterThan(0);
    expect(out.newMessages[0].body.trim().length).toBeGreaterThan(0);
  });

  /** ⚠ 미필·상무는 이 풀을 안 본다 — `militaryServedUnit` 이 갈래다 */
  it("현역을 안 다녀왔으면 한 통도 안 온다", () => {
    const sports = runWeek(ctxOf(5, { militaryServedUnit: "sports" } as Partial<ProtagonistSave>));
    expect(sports.newMessages).toHaveLength(0);
    const none = runWeek(
      ctxOf(5, {
        militaryStatus: "미필",
        militaryServedUnit: null,
      } as unknown as Partial<ProtagonistSave>),
    );
    expect(none.newMessages).toHaveLength(0);
  });

  /**
   * 종마다 **자기 창 안에서 뽑히는가** — 한 종씩 따로 돌린다.
   *
   * ⚠ **다 같이 돌리면 넷밖에 안 닿는다**(실측 FIRST_CALL·PARCEL·INDIE_FIELD·
   *   WEDDING). 조건부는 **주당 한 칸**이라 창이 겹치면 우선순위가 높은 쪽이
   *   나머지를 밀어낸다 — 그건 도달 불가가 아니라 자리다툼이다. 여기서 재는
   *   것은 「조건이 열리는 주가 있는가」다.
   */
  it.each(reunionFiles.map((f) => f.replace(/.json$/, "")))(
    "%s — 전역 뒤 어느 주에는 열린다",
    (id) => {
      const only = rules.filter((r) => r.id === id);
      let open = 0;
      for (const stage of STAGES) {
        for (let w = 0; w <= 160; w += 2) {
          for (const cw of [4, 10, 20, 30]) {
            resetEventFunnelStats();
            for (const morale of [45, 60]) {
              const ctx = ctxOf(w, { careerStage: stage, morale } as Partial<ProtagonistSave>, cw);
              const out = runEventEngine(
                only,
                [],
                msgTmpls,
                decTmpls,
                ctx,
                2030,
                1,
                [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
                TIER_RULES,
                "공용",
              );
              if (out.newMessages.length > 0) open++;
            }
          }
        }
      }
      expect(open, "열리는 주가 없다 — 조건이 서로를 막는다").toBeGreaterThan(0);
    },
  );
});
