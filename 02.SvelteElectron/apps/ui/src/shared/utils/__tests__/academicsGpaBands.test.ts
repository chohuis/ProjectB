import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  UNIVERSITY_GPA_BANDS,
  gpaBandOf,
  primeAcademicsUnivRules,
  resetAcademicsUnivRulesForTest,
  universityGpaScale,
} from "../academicsEngine";

// ── 대학 학점 칸 — **화면 문턱 = 이벤트 문턱** ────────────────────────
//
// 🔴 2026-09-11 까지 요약 헤더의 GPA 칸은 `toGpa45(avgPercentile)` 를 그렸다 —
//   `settleSemester` 가 정산하는 누적 학점(`schoolState.universityGpa`) 이 아니라
//   **지금 과목 백분위를 환산한 다른 숫자**였다. 그 칸이 `{#if isUniv}` 의
//   `{:else}` 안에 다시 `{#if isUniv}` 라 한 번도 안 떠서 어긋난 걸 못 봤다.
//   살리면서 엔진 값으로 바꿨고, **여기가 그걸 못 박는다.**
//
// 🔴 **정규식으로 긁지 않는다.** 조건이 여러 줄로 갈려 있어 줄 단위 정규식은
//   값을 놓친다. JSON 으로 파싱해 `conditions` 와 `hiddenCondition` 을 **둘 다**
//   훑는다 — 히든(`EVT_HID_UNIV_PROFESSOR` · `gpa_gte 4`)이 `hiddenCondition`
//   에만 있어서, 한쪽만 보면 최상 문턱을 통째로 놓친다.

const ROOT = resolve(__dirname, "../../../../../..");
const EVENTS = resolve(ROOT, "resource/data/master/events");
const RULES = JSON.parse(
  readFileSync(resolve(ROOT, "resource/data/master/players/generation_rules.json"), "utf8"),
);

interface GpaUse {
  file: string;
  type: "gpa_gte" | "gpa_lte";
  value: number;
}

/** 이벤트 데이터를 훑어 학점 조건을 전부 모은다 */
function collectGpaConditions(): GpaUse[] {
  const found: GpaUse[] = [];

  const scanArray = (file: string, arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const c of arr) {
      if (!c || typeof c !== "object") continue;
      const t = (c as { type?: unknown }).type;
      if (t !== "gpa_gte" && t !== "gpa_lte") continue;
      const v = (c as { value?: unknown }).value;
      expect(typeof v, `${file} ${t} 의 value 가 수가 아니다`).toBe("number");
      found.push({ file, type: t, value: v as number });
    }
  };

  const scanNode = (file: string, node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    scanArray(file, o.conditions);
    scanArray(file, o.hiddenCondition);
    // 묶음 파일(한 파일에 이벤트 여럿)도 같은 규칙으로 훑는다
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach((x) => scanNode(file, x));
      else if (v && typeof v === "object") scanNode(file, v);
    }
  };

  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".json")) {
        const rel = relative(EVENTS, full).split("\\").join("/");
        let parsed: unknown;
        try {
          parsed = JSON.parse(readFileSync(full, "utf8"));
        } catch (e) {
          throw new Error(`[events] ${rel} 파싱 실패: ${String(e)}`);
        }
        scanNode(rel, parsed);
      }
    }
  };

  walk(EVENTS);
  return found;
}

const USES = collectGpaConditions();

beforeEach(() => {
  resetAcademicsUnivRulesForTest();
});

describe("이벤트 데이터가 쓰는 학점 문턱", () => {
  it("🔴 잣대가 먼저 맞는지 — 학점 조건이 실제로 잡힌다", () => {
    // 0 건이면 이 검사 전체가 아무것도 안 보는 것이다
    expect(USES.length).toBeGreaterThanOrEqual(8);
    expect(USES.some((u) => u.type === "gpa_gte")).toBe(true);
    expect(USES.some((u) => u.type === "gpa_lte")).toBe(true);
  });

  it("🔴 `hiddenCondition` 쪽도 본다 — 히든의 최상 문턱(4.0)", () => {
    const hidden = USES.filter((u) => u.file.includes("EVT_HID_UNIV_PROFESSOR"));
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toMatchObject({ type: "gpa_gte", value: UNIVERSITY_GPA_BANDS.top });
  });

  it("화면 문턱이 이벤트 문턱과 같다 — 네 값 전부 데이터에 있다", () => {
    const gte = new Set(USES.filter((u) => u.type === "gpa_gte").map((u) => u.value));
    const lte = new Set(USES.filter((u) => u.type === "gpa_lte").map((u) => u.value));

    expect(lte.has(UNIVERSITY_GPA_BANDS.danger)).toBe(true); // 2.4
    expect(gte.has(UNIVERSITY_GPA_BANDS.fair)).toBe(true); // 3.0
    expect(gte.has(UNIVERSITY_GPA_BANDS.good)).toBe(true); // 3.5
    expect(gte.has(UNIVERSITY_GPA_BANDS.top)).toBe(true); // 4.0
  });

  it("거꾸로도 — 데이터가 쓰는 문턱 중 화면이 모르는 값이 없다", () => {
    // 졸업선(2.0)은 규칙 파일이 정본이라 띠에 없다. 나머지는 전부 띠여야 한다
    const known = new Set<number>([
      ...Object.values(UNIVERSITY_GPA_BANDS),
      RULES.academicsRules.university.graduationGpa,
    ]);
    const unknown = USES.filter((u) => !known.has(u.value));
    expect(
      unknown,
      `화면이 모르는 학점 문턱이 생겼다 — 띠(UNIVERSITY_GPA_BANDS)에 넣어라: ${JSON.stringify(unknown)}`,
    ).toEqual([]);
  });

  it("졸업선은 규칙 파일이 정본이다 — 화면이 따로 안 든다", () => {
    primeAcademicsUnivRules(RULES);
    const scale = universityGpaScale();
    expect(scale.graduationGpa).toBe(RULES.academicsRules.university.graduationGpa);
    expect(scale.gpaMax).toBe(RULES.academicsRules.university.gpaMax);
    // 그 값이 `EVT_UNIV_GRAD_NEAR` 의 `gpa_gte` 와 같아야 한다
    const near = USES.filter((u) => u.file.includes("EVT_UNIV_GRAD_NEAR"));
    expect(near).toHaveLength(1);
    expect(near[0].value).toBe(scale.graduationGpa);
  });

  it("🔴 대조군 — 규칙이 안 실렸으면 폴백이고, 폴백도 규칙 파일과 같다", () => {
    const fallback = universityGpaScale();
    expect(fallback.gpaMax).toBe(RULES.academicsRules.university.gpaMax);
    expect(fallback.graduationGpa).toBe(RULES.academicsRules.university.graduationGpa);
  });
});

describe("학점 띠", () => {
  it("문턱 위아래로 갈린다", () => {
    expect(gpaBandOf(0)).toBe("danger");
    expect(gpaBandOf(2.4)).toBe("danger"); // `gpa_lte 2.4` 와 같은 방향 — 경계는 위험이다
    expect(gpaBandOf(2.41)).toBe("normal");
    expect(gpaBandOf(2.99)).toBe("normal");
    expect(gpaBandOf(3.0)).toBe("fair");
    expect(gpaBandOf(3.49)).toBe("fair");
    expect(gpaBandOf(3.5)).toBe("good");
    expect(gpaBandOf(3.99)).toBe("good");
    expect(gpaBandOf(4.0)).toBe("top");
    expect(gpaBandOf(4.5)).toBe("top");
  });

  it("경계가 이벤트 판정과 어긋나지 않는다", () => {
    // `gpa_lte 2.4` 가 참인 값은 전부 위험 띠여야 한다
    for (const g of [0, 1.5, 2.0, 2.39, 2.4]) {
      expect(g <= UNIVERSITY_GPA_BANDS.danger).toBe(true);
      expect(gpaBandOf(g)).toBe("danger");
    }
    // `gpa_gte 3.5` 가 참인 값은 전부 좋음 이상이어야 한다
    for (const g of [3.5, 3.8, 4.0, 4.5]) {
      expect(g >= UNIVERSITY_GPA_BANDS.good).toBe(true);
      expect(["good", "top"]).toContain(gpaBandOf(g));
    }
  });
});
