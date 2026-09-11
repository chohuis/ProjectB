import type { DecisionEffect } from "../types/main";
import type { EventGrade } from "./tierRules";

/**
 * 이벤트 **등급 칩과 종류 힌트의 표시 정본** (2026-09-08 · PLAN_EVENT_TIERS §2·§9 · C 4-5).
 *
 * ## 왜 데이터가 아니라 여기인가 (C 판단 · 2026-09-08)
 *
 * 지시는 「등급 이름은 문안으로 · `messages/*.json` 에 키가 없으면 만들라」였다.
 * **안 만들었다.** 이 저장소에서 **칩의 이름·색은 이미 TS 가 정본**이다 —
 * `messageCategory.ts` 의 `CATEGORY`(라벨 + accent)가 그 선을 그었고, 그
 * 머리말이 「화면이 자기 표를 들면 정본이 둘이 된다」고 적은 뒤 **표를 유틸
 * 하나로 모았다.** 등급 칩을 `messages/*.json` 으로 빼면 **라벨은 데이터에,
 * 색은 TS 에** 남아 한 칩이 두 파일로 갈린다 — 이 저장소가 반복해 밟은 형태다.
 *
 * 반대로 **이벤트 본문·선택지 문구는 데이터(B)** 다. 여기 있는 것은 본문이
 * 아니라 **화면이 붙이는 이름표**뿐이다: 등급 셋 · 위기 · 대가 한 줄 · 종류 아홉.
 *
 * ## 상위 등급은 숫자를 감춘다 (§2)
 *
 * 유니크·히든은 선택지 힌트에 **종류만** 보인다(「큰 것을 얻는다 · 관계를
 * 내준다」). 🔴 **`effectHint` 문자열에서 숫자를 지우지 않는다** — 그 문장은
 * 데이터의 말이고, 화면이 정규식으로 깎으면 「+3」은 지워도 「크게」는 남는
 * 반쪽이 된다. **효과 객체(`DecisionEffect`)에서 종류를 다시 짓는다.**
 */

export type EventTheme =
  "body" | "media" | "social" | "team" | "train" | "career" | "people" | "money" | "story";

export interface GradeChip {
  label: string;
  /** 밝은 지면의 칩 글자색. 흰 바탕 위 4.5:1 을 넘긴다(분류 칩과 같은 조건) */
  accent: string;
  /**
   * 어두운 지면의 같은 자리.
   *
   * 🔴 **분류 칩(`messageCategory`)은 밝은 값 하나만 들고 있다** — `styles.css`
   *   머리말이 「의미색을 그대로 쓰면 안 된다」고 적어 둔 바로 그 형태다.
   *   등급 칩은 색이 곳 자체라(파랑·보라·금) 같은 실수를 반복하지 않는다.
   */
  accentDark: string;
}

/**
 * 등급 칩. **노말은 없다** — 늘 오는 것에 이름표를 붙이면 이름표가 배경이 된다(§9).
 *
 * 색: 레어 파랑 · 유니크 보라 · 히든 금색(§9 「색은 C 가 정한다」).
 * 셋 다 `messageCategory.CATEGORY` 의 accent 와 **겹치지 않는 색조**를 골랐다 —
 * 목록에서 분류 칩과 등급 칩이 나란히 서므로 같은 색이면 둘을 못 가른다.
 */
export const GRADE_CHIP: Partial<Record<EventGrade, GradeChip>> = {
  rare: { label: "레어", accent: "#1B6AA5", accentDark: "#6BB6F0" },
  unique: { label: "유니크", accent: "#7B3FA0", accentDark: "#C79BE8" },
  hidden: { label: "히든", accent: "#8A6100", accentDark: "#F0C25C" },
};

export function gradeChip(g: EventGrade | undefined | null): GradeChip | null {
  return g ? (GRADE_CHIP[g] ?? null) : null;
}

/** 숫자를 감추는 등급 — 유니크·히든(§2 「보상 표시: 종류만」) */
export function hidesNumbers(g: EventGrade | undefined | null): boolean {
  return g === "unique" || g === "hidden";
}

/**
 * 위기 표시 (§9) — **레어·유니크 중** `theme` 가 몸 계열인 것.
 *
 * ⚠ 노말은 뺀다(칩 자체가 없다). 히든도 뺀다 — 히든 칩은 그 자체가 사건의
 *   표시라 위에 위기를 겹치면 무엇이 드문 것인지 안 보인다.
 */
export const CRISIS_LABEL = "위기";
export function isCrisis(
  g: EventGrade | undefined | null,
  theme: string | undefined | null,
): boolean {
  if (g !== "rare" && g !== "unique") return false;
  return theme === "body" || theme === "crisis";
}

/** 대가가 붙은 이벤트의 머리말 (§4 · 어느 갈래를 골라도 낸다) */
export const COST_LEAD = "이 선택에는 대가가 따른다";

// ── 종류 아홉 ────────────────────────────────────────────────
//
// ⚠ **얻는 말과 내주는 말을 따로 둔다.** 「관계」 한 낱말만 보이면 얻는지
//   내주는지를 모른다 — §2 의 예문(「큰 것을 얻는다 · 관계를 내준다」)이
//   부호를 말로 들고 있다.
interface KindCopy {
  gain: string;
  lose: string;
}

const KIND: Record<string, KindCopy> = {
  growth: { gain: "큰 것을 얻는다", lose: "가진 것을 잃는다" },
  train: { gain: "실력이 는다", lose: "훈련이 밀린다" },
  chance: { gain: "기회가 열린다", lose: "기회가 닫힌다" },
  people: { gain: "사람을 얻는다", lose: "관계를 내준다" },
  money: { gain: "돈이 들어온다", lose: "돈을 내준다" },
  body: { gain: "몸이 편해진다", lose: "몸을 갈아 넣는다" },
  mind: { gain: "마음이 놓인다", lose: "마음을 다친다" },
  fame: { gain: "이름이 알려진다", lose: "이름값을 깎는다" },
  study: { gain: "학업이 오른다", lose: "학업을 미룬다" },
};

/** 종류를 세우는 순서 — 큰 것부터. 표시는 이 순서로 자른다 */
const KIND_ORDER = [
  "growth",
  "chance",
  "train",
  "people",
  "fame",
  "money",
  "body",
  "mind",
  "study",
];

/** 한 줄에 몇 종류까지. 넷을 넘기면 힌트가 본문만큼 길어져 종류가 안 읽힌다 */
const MAX_KINDS = 3;

const sumOf = (r: Record<string, number> | undefined): number =>
  Object.values(r ?? {}).reduce((a, b) => a + b, 0);

/**
 * 효과 객체 → 종류 목록. `+`(얻음)·`-`(내줌)을 **따로** 담는다.
 *
 * ⚠ `addTag`·`removeTag`·`counterDelta` 는 안 센다 — 연계의 열쇠라 화면에
 *   보일 뜻이 없다(「태그를 얻는다」는 아무 말도 아니다).
 */
function kindsOf(e: DecisionEffect | undefined): { gain: Set<string>; lose: Set<string> } {
  const gain = new Set<string>();
  const lose = new Set<string>();
  if (!e) return { gain, lose };
  const put = (k: string, v: number) => {
    if (v > 0) gain.add(k);
    else if (v < 0) lose.add(k);
  };

  // 큰 것 — 즉시 스탯·잠재력·성장률·구종·특성. 유니크·히든의 몫이다
  put("growth", sumOf(e.statDelta));
  put("growth", e.potentialDelta ?? 0);
  put("growth", e.devRateDelta ?? 0);
  if (e.pitchGrant || e.pitchGradeUp || e.trait) gain.add("growth");

  put("train", sumOf(e.xp));
  if (e.trainEffBoost) put("train", e.trainEffBoost.pct);
  if (e.pitchProgressJump) put("train", e.pitchProgressJump.pct);

  if (e.startGuarantee) gain.add("chance");
  if (e.mentor) gain.add("people");
  if (e.relationDelta) put("people", e.relationDelta.delta);
  put("people", e.memberRelationDelta ?? 0);

  put("money", e.moneyDelta ?? 0);
  if (e.luxurySpend) lose.add("money");

  // ⚠ 피로는 **부호가 뒤집힌다** — 피로가 오르는 것이 내주는 쪽이다
  put("body", -(e.fatigueDelta ?? 0));
  put("body", e.conditionDelta ?? 0);
  // ⚠ 부상 위험도 뒤집힌다 — 음수(덜 다친다)가 얻는 쪽이다(§5 머리말)
  if (e.injuryRiskMod) put("body", -e.injuryRiskMod.pct);

  put("mind", e.moraleDelta ?? 0);
  put("fame", (e.fameDelta ?? 0) + (e.popularityDelta ?? 0));
  put("study", e.studyQualityDelta ?? 0);
  if (e.studyModeSet) gain.add("study");
  put("study", e.diligenceDelta ?? 0);

  // 같은 종류가 양쪽에 서면 **내주는 쪽만 남긴다** — 「얻고 잃는다」는 아무
  // 것도 안 말한다. 대가가 있다는 사실이 상위 등급에서 더 중요한 정보다
  for (const k of lose) gain.delete(k);
  return { gain, lose };
}

/**
 * 선택지의 **종류만 힌트** (§2). 종류를 못 세우면 빈 문자열이고, 부르는 쪽이
 * 그 자리를 비운다 — 화면이 「무언가 일어난다」로 메우면 그게 지어낸 말이다.
 */
export function kindOnlyHint(e: DecisionEffect | undefined): string {
  const { gain, lose } = kindsOf(e);
  const gains = KIND_ORDER.filter((k) => gain.has(k)).map((k) => KIND[k].gain);
  const loses = KIND_ORDER.filter((k) => lose.has(k)).map((k) => KIND[k].lose);
  // 🔴 **얻는 쪽으로 줄을 채우면 내주는 쪽이 잘린다.** 앞에서부터 세 개를
  //   자르는 방식으로 재 봤더니 실제 유니크(EVT_HS_COMMON_RETIRE_GIFT)에서
  //   「큰 것을 얻는다 · 사람을 얻는다 · 마음이 놓인다」가 되어 **돈을 낸다는
  //   말이 통째로 사라졌다.** 유니크의 요점은 얻는 것이 아니라 **무엇을 내주고
  //   얻나**라(§2 「대가: 있음」) 내주는 쪽 한 자리를 먼저 떼어 둔다.
  const g = gains.slice(0, loses.length > 0 ? MAX_KINDS - 1 : MAX_KINDS);
  const l = loses.slice(0, MAX_KINDS - g.length);
  return [...g, ...l].join(" · ");
}

/**
 * 이벤트에 붙은 **대가**(§4)의 종류만. 대가는 늘 내주는 쪽이라 `lose` 를 먼저
 * 세우되, 데이터가 `+` 로 적어 둔 것(예: 피로 +10)도 같은 자리에 든다.
 */
export function costKindHint(costs: DecisionEffect[] | undefined): string {
  if (!costs || costs.length === 0) return "";
  const all = new Set<string>();
  for (const c of costs) {
    const { gain, lose } = kindsOf(c);
    for (const k of lose) all.add(k);
    for (const k of gain) all.add(k);
  }
  const out = KIND_ORDER.filter((k) => all.has(k)).map((k) => KIND[k].lose);
  return out.slice(0, MAX_KINDS).join(" · ");
}
