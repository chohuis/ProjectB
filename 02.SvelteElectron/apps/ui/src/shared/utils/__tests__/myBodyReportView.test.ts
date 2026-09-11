import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MyBodyEvent, MyBodyMetadata } from "../../types/main";
import {
  buildMyBodyRows,
  myBodyRowCount,
  myBodyInjuryName,
  MY_BODY_SEVERITY_LABEL,
  ABSENCE_REASON_LABEL,
  MY_BODY_LABEL,
} from "../myBodyReportView";

/**
 * 몸 상태 월간 소식의 **대시보드 갈래** (MESSAGE_KINDS_DISPLAY_2026-09-03 §4).
 *
 * ⚠ **컴포넌트를 띄우지 않는다.** 이 저장소의 vitest 는 `environment: "node"` 라
 * DOM 이 없다. 행을 만드는 순수 함수를 직접 재고, **화면에 갈래가 있는지**는
 * 소스 문자열 대조로 본다 — `faOfferTerms.test.ts` 와 같은 방식이다.
 */

const SRC = resolve(__dirname, "../../../pages/news/NewsPage.svelte");
const PANEL = resolve(__dirname, "../../../features/messages/ui/MyBodyPanel.svelte");
const MAKER = resolve(__dirname, "../../usecases/weekPhases/myBodyReport.ts");
const read = (p: string) => readFileSync(p, "utf8");

function meta(over: Partial<MyBodyMetadata> = {}): MyBodyMetadata {
  return { type: "myBody", week: 12, injury: null, events: [], ...over };
}

const absence = (o: Partial<MyBodyEvent> = {}): MyBodyEvent => ({
  kind: "absence",
  week: 5,
  reason: "condition",
  condition: 41,
  ...o,
});
const warning = (o: Partial<MyBodyEvent> = {}): MyBodyEvent => ({
  kind: "warning",
  week: 6,
  fatigue: 82,
  riskPct: 24,
  ...o,
});

// ── ① 갈래가 있는가 (결함 자체) ───────────────────────────────
describe("NewsPage 에 myBody 갈래가 있다", () => {
  const src = read(SRC);

  it('metadata.type === "myBody" 갈래를 연다', () => {
    expect(src.includes('selected.metadata?.type === "myBody"')).toBe(true);
  });

  it("그 갈래가 MyBodyPanel 을 그린다", () => {
    expect(src.includes("<MyBodyPanel")).toBe(true);
    expect(
      src.includes('import MyBodyPanel from "../../features/messages/ui/MyBodyPanel.svelte"'),
    ).toBe(true);
  });

  it("기존 넷도 그대로 있다 — 갈래를 더하며 지우지 않았다", () => {
    for (const t of ["training", "top10", "offseason", "injury"]) {
      expect(src.includes(`selected.metadata?.type === "${t}"`)).toBe(true);
    }
  });

  it("화면은 행을 직접 만들지 않는다 — 만드는 자리는 util 하나다", () => {
    const panel = read(PANEL);
    expect(panel.includes("buildMyBodyRows")).toBe(true);
    // 행을 화면 안에서 거르면 검사가 한 줄도 못 잰다
    expect(panel.includes('e.kind === "absence"')).toBe(false);
    expect(panel.includes('e.kind === "warning"')).toBe(false);
  });
});

// ── ② metadata 예시로 행 수를 잰다 ────────────────────────────
describe("metadata 예시 → 렌더 항목 수", () => {
  it("빈 소식은 행이 0이다", () => {
    const r = buildMyBodyRows(meta());
    expect(myBodyRowCount(r)).toBe(0);
    expect(r.injury).toBeNull();
    expect(r.counts).toEqual({ absence: 0, warning: 0, injuryWeeksLeft: 0 });
  });

  it("결장 2 · 경고 3 이면 행이 5다", () => {
    const r = buildMyBodyRows(
      meta({
        events: [
          absence({ week: 3 }),
          absence({ week: 7 }),
          warning({ week: 2 }),
          warning({ week: 5 }),
          warning({ week: 8 }),
        ],
      }),
    );
    expect(r.absences).toHaveLength(2);
    expect(r.warnings).toHaveLength(3);
    expect(myBodyRowCount(r)).toBe(5);
  });

  it("부상이 있으면 한 줄이 더 는다 — 대조군", () => {
    const events = [absence(), warning()];
    const without = buildMyBodyRows(meta({ events }));
    const withInjury = buildMyBodyRows(
      meta({
        events,
        injury: { injuryType: "ELBOW_INFLAM", severity: "moderate", weeksLeft: 4, sinceWeek: 9 },
      }),
    );
    expect(myBodyRowCount(withInjury)).toBe(myBodyRowCount(without) + 1);
    expect(withInjury.counts.injuryWeeksLeft).toBe(4);
  });

  it("events 가 아예 없는 옛 소식도 견딘다", () => {
    const broken = { type: "myBody", week: 4, injury: null } as unknown as MyBodyMetadata;
    expect(myBodyRowCount(buildMyBodyRows(broken))).toBe(0);
  });
});

// ── ③ 행 안의 값 ──────────────────────────────────────────────
describe("행이 들고 나가는 값", () => {
  it("결장은 상대 팀 id 를 그대로 낸다 — 이름은 화면이 조회한다", () => {
    const r = buildMyBodyRows(meta({ events: [absence({ opponentTeamId: "TEAM_KBL_1" })] }));
    expect(r.absences[0].opponentTeamId).toBe("TEAM_KBL_1");
    // util 은 스토어를 안 읽는다 — 이름을 붙이면 팀 이름이 바뀔 때 소식이 옛말을 한다
    expect(read(resolve(__dirname, "../myBodyReportView.ts")).includes("../stores/")).toBe(false);
  });

  it("상대가 없으면 null 이다", () => {
    const r = buildMyBodyRows(meta({ events: [absence({ opponentTeamId: undefined })] }));
    expect(r.absences[0].opponentTeamId).toBeNull();
  });

  it("사유가 안 실린 옛 사건은 컨디션으로 본다", () => {
    const r = buildMyBodyRows(meta({ events: [absence({ reason: undefined })] }));
    expect(r.absences[0].reason).toBe("condition");
  });

  it("부상 결장은 컨디션 값이 없다 — 없는 값을 0 으로 만들지 않는다", () => {
    const r = buildMyBodyRows(
      meta({ events: [absence({ reason: "injury", condition: undefined })] }),
    );
    expect(r.absences[0].reason).toBe("injury");
    expect(r.absences[0].condition).toBeNull();
  });

  it("경고의 피로·위험이 비면 null 이다", () => {
    const r = buildMyBodyRows(
      meta({ events: [warning({ fatigue: undefined, riskPct: undefined })] }),
    );
    expect(r.warnings[0]).toEqual({ week: 6, fatigue: null, riskPct: null });
  });

  it("주차 오름차순으로 정렬한다", () => {
    const r = buildMyBodyRows(
      meta({
        events: [
          absence({ week: 9 }),
          absence({ week: 2 }),
          warning({ week: 8 }),
          warning({ week: 1 }),
        ],
      }),
    );
    expect(r.absences.map((a) => a.week)).toEqual([2, 9]);
    expect(r.warnings.map((w) => w.week)).toEqual([1, 8]);
  });
});

// ── ④ 이름표 — 소식 본문과 같은 말이어야 한다 ──────────────────
describe("이름표", () => {
  it("부상 이름은 INJURY_LABEL 을 거친다 — 코드가 그대로 새지 않는다", () => {
    const r = buildMyBodyRows(
      meta({
        injury: { injuryType: "SHOULDER_INFLAM", severity: "moderate", weeksLeft: 3, sinceWeek: 2 },
      }),
    );
    expect(r.injury!.name).not.toBe("SHOULDER_INFLAM");
    expect(r.injury!.name.length).toBeGreaterThan(0);
  });

  it("표에 없는 부상 코드는 그대로 둔다 — 임의로 「부상」이라 부르지 않는다", () => {
    expect(myBodyInjuryName("NOT_IN_TABLE")).toBe("NOT_IN_TABLE");
  });

  it("등급 한글이 소식 본문(myBodyReport.ts)과 같은 말이다", () => {
    const maker = read(MAKER);
    for (const [k, v] of Object.entries(MY_BODY_SEVERITY_LABEL)) {
      expect(maker.includes(`${k}: "${v}"`)).toBe(true);
    }
  });

  it("결장 사유는 두 갈래뿐이다", () => {
    expect(Object.keys(ABSENCE_REASON_LABEL).sort()).toEqual(["condition", "injury"]);
  });

  it("칸 이름을 화면이 따로 적지 않는다 — 표가 두 벌이 되면 한쪽만 고쳐진다", () => {
    const panel = read(PANEL);
    for (const key of ["week", "opponent", "reason", "condition", "fatigue", "risk"] as const) {
      expect(panel.includes(`MY_BODY_LABEL.${key}`)).toBe(true);
      expect(panel.includes(`>${MY_BODY_LABEL[key]}<`)).toBe(false);
    }
  });
});
