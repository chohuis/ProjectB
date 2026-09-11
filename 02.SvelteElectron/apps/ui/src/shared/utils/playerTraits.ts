import { fnv1a32 } from "./hash";
/**
 * 선수 상세에 붙는 파생 표시 — 성장여지 등급 · 성격 태그 · 병역 이력 · 득점권.
 *
 * **엔진이 만들어 놓고 화면이 한 번도 안 받던 값들이다.** U9 조사에서
 * `rispAb/rispH`는 시즌 합산까지 해 놓고 렌더 0곳, `nationality`는 `.svelte`
 * 전체에서 0건, `potentialHidden`은 세 곳에서 전달만 되고 렌더 0곳이었다.
 *
 * ⚠ **경계값은 여기 적지 않는다.** 전부 `generation_rules.json`의
 * `traitDisplay`가 정본이고, 그 값은 `scripts/measure-traits.cjs` 실측에서 나왔다.
 * 눈대중으로 정하면 안 되는 이유는 그 파일의 `_why` 주석에 있다.
 */

import { isForeignPlayer } from "./foreignSlots";

// ── 규칙 주입 (foreignSlots.primeForeignRules와 같은 방식) ──────────────

export interface TraitDisplayRules {
  growthRoomCuts: { A: number; B: number; C: number; D: number };
  scoutingBlurWidth: number;
  personalityCuts: Record<string, { hi: number; lo: number }>;
  maxPersonalityTags: number;
}

let _rules: TraitDisplayRules | null = null;

export function primeTraitDisplay(rulesFile: { traitDisplay?: unknown }): void {
  _rules = (rulesFile.traitDisplay as TraitDisplayRules | undefined) ?? null;
}

export function traitDisplayRules(): TraitDisplayRules | null {
  return _rules;
}

// ── 성장 여지 등급 ────────────────────────────────────────────────────

export type TraitGrade = "A" | "B" | "C" | "D" | "E";
const GRADES: readonly TraitGrade[] = ["A", "B", "C", "D", "E"];

/**
 * 성장 여지 = 천장 − 현재 실력. **원수치(`potentialHidden`)로 등급을 매기지 않는다.**
 *
 * Rust가 `potential = clamp(pot_cap * mult, ovr, 99)`로 만들기 때문에 현재 OVR이
 * 천장의 바닥을 밀어올린다. 실측(28,000명)에서 원수치에 고정 경계를 씌우면
 * KBL의 92%가 A였고 D·E는 전 리그에서 0%였다 — 등급이 리그 이름을 다시 말할 뿐이다.
 * 여지로 재면 중앙값이 리그를 가리지 않는다(고교 24 · 대학 24 · 독립 23 · KBL 25).
 */
export function growthRoom(
  potentialHidden: number | undefined,
  ovr: number | undefined,
): number | null {
  if (typeof potentialHidden !== "number" || typeof ovr !== "number") return null;
  return potentialHidden - ovr;
}

export function growthGrade(room: number | null): TraitGrade | null {
  if (room == null || !_rules) return null;
  const c = _rules.growthRoomCuts;
  if (room >= c.A) return "A";
  if (room >= c.B) return "B";
  if (room >= c.C) return "C";
  if (room >= c.D) return "D";
  return "E";
}

/** 등급이 좋을수록 밝은 톤. `statTone`과 같은 어휘를 쓴다 */
export function gradeTone(g: TraitGrade | null): "good" | "mid" | "low" {
  if (g === "A" || g === "B") return "good";
  if (g === "C") return "mid";
  return "low";
}

export interface ScoutedGrade {
  /** 정확한 등급. 관측이 흐린 선수는 null */
  exact: TraitGrade | null;
  /** 흐린 관측의 범위. 정확할 땐 null */
  range: [TraitGrade, TraitGrade] | null;
  label: string;
}

/**
 * 내 팀 선수는 정확한 등급, 남의 팀은 3등급 범위(사용자 확정).
 *
 * ⚠ **창을 진짜 등급에 가운데 맞추면 안 된다.** 그러면 가운데만 읽어서 정답이
 * 나오니 흐린 뜻이 없다. `npcId` 해시로 창을 −1/0/+1 만큼 밀어 진짜 등급이
 * 창 안 어디에 있는지 모르게 한다.
 */
export function scoutedGrade(
  grade: TraitGrade | null,
  playerId: string,
  known: boolean,
): ScoutedGrade | null {
  if (!grade) return null;
  if (known) return { exact: grade, range: null, label: grade };

  const width = Math.max(1, Math.min(_rules?.scoutingBlurWidth ?? 3, GRADES.length));
  if (width === 1) return { exact: grade, range: null, label: grade };

  const g = GRADES.indexOf(grade);
  const offset = (fnv1a32(playerId) % width) - Math.floor(width / 2);
  const maxStart = GRADES.length - width;
  const start = Math.max(0, Math.min(g - Math.floor(width / 2) + offset, maxStart));
  const lo = GRADES[start];
  const hi = GRADES[start + width - 1];
  return { exact: null, range: [lo, hi], label: `${lo}~${hi}` };
}

// ── 성격 태그 ─────────────────────────────────────────────────────────

/**
 * 축 → 문구. **`Record<축, …>`로 선언한다** — 축이 늘면 여기서 컴파일이 깨져야
 * 한다. 조용히 빠지면 화면에 안 나올 뿐이라 아무도 모른다 (규칙 §5-3).
 *
 * `null`은 "그쪽으로 치우쳐도 할 말이 없다"는 뜻이다. 프로의식이 높은 건
 * 특징이지만 낮은 쪽은 실측 최소가 50이라 애초에 극단이 없다.
 */
export type PersonalityAxis =
  | "loyalty"
  | "ambition"
  | "greed"
  | "competitiveDrive"
  | "stabilityPreference"
  | "professionalism"
  | "overseasAmbition"
  | "marketPreference";

interface AxisCopy {
  hi: string | null;
  lo: string | null;
}

const AXIS_COPY: Record<PersonalityAxis, AxisCopy> = {
  loyalty: { hi: "팀에 헌신적", lo: "팀에 미련 없음" },
  ambition: { hi: "야망이 크다", lo: "욕심이 없다" },
  greed: { hi: "돈에 민감", lo: "돈에 무심" },
  competitiveDrive: { hi: "승부욕 강함", lo: "승부에 담담" },
  stabilityPreference: { hi: "안정 지향", lo: "변화를 즐김" },
  professionalism: { hi: "프로 의식", lo: null },
  overseasAmbition: { hi: "해외 지향", lo: "국내 잔류형" },
  marketPreference: { hi: "큰 무대 선호", lo: "연고 우선" },
};

/** 태그가 겹칠 때 남길 순서. 앞이 사람을 더 잘 설명한다 */
const AXIS_PRIORITY: readonly PersonalityAxis[] = [
  "ambition",
  "competitiveDrive",
  "loyalty",
  "overseasAmbition",
  "greed",
  "stabilityPreference",
  "marketPreference",
  "professionalism",
];

export interface PersonalityTag {
  axis: PersonalityAxis;
  text: string;
  side: "hi" | "lo";
  /** 축 경계에서 얼마나 벗어났나 — 정렬용 */
  strength: number;
}

/**
 * 성격 7축을 문구 태그로. **수치는 안 보여준다**(사용자 확정) — 사람을
 * 능력치처럼 읽게 만들면 "탐욕 88"이 좋은 값으로 오해된다.
 *
 * ⚠ **고정 임계값(>=75 / <=25)을 쓰면 안 된다.** 축마다 생성 범위가 다르다.
 * 실측에서 해외지향은 최대가 50이라 '높음'이 영원히 안 나오고, 프로의식은
 * 최소가 50이라 '낮음'이 영원히 안 나왔다 — 그 방식으론 태그 6종이 死문구다.
 */
export function personalityTags(
  personality: Partial<Record<PersonalityAxis, number>> | null | undefined,
): PersonalityTag[] {
  if (!personality || !_rules) return [];
  const out: PersonalityTag[] = [];

  for (const axis of AXIS_PRIORITY) {
    const v = personality[axis];
    const cut = _rules.personalityCuts[axis];
    const copy = AXIS_COPY[axis];
    if (typeof v !== "number" || !cut) continue;

    if (v >= cut.hi && copy.hi) {
      out.push({ axis, text: copy.hi, side: "hi", strength: v - cut.hi });
    } else if (v <= cut.lo && copy.lo) {
      out.push({ axis, text: copy.lo, side: "lo", strength: cut.lo - v });
    }
  }

  // 우선순위가 1차, 같은 순위 안에선 더 극단적인 쪽. 정렬을 안정적으로 두려고
  // 인덱스를 tiebreak에 쓴다 — 같은 선수가 열 때마다 순서가 바뀌면 안 된다.
  const rank = (t: PersonalityTag) => AXIS_PRIORITY.indexOf(t.axis);
  out.sort((a, b) => rank(a) - rank(b));
  return out.slice(0, _rules.maxPersonalityTags ?? 3);
}

// ── 병역 이력 ─────────────────────────────────────────────────────────

export interface MilitaryHistory {
  text: string;
  tone: "sports" | "general";
}

/**
 * 상무 출신인지 현역 출신인지. **`militaryStatus`만 보면 안 보인다** —
 * 군필/미필만 있고 어디를 다녀왔는지가 없다.
 *
 * `militaryServedUnit`은 전역 뒤에도 남게 고친 필드다(커밋 22bc3cf1c).
 * 그걸 저장만 하고 화면이 안 읽고 있었다.
 */
export function militaryHistory(
  status: string | undefined,
  servedUnit: "sports" | "general" | undefined,
): MilitaryHistory | null {
  if (status !== "군필" || !servedUnit) return null;
  return servedUnit === "sports"
    ? { text: "상무 출신", tone: "sports" }
    : { text: "현역 만기", tone: "general" };
}

// ── 국적 ──────────────────────────────────────────────────────────────

const NATION_LABEL: Record<string, string> = {
  KOR: "한국",
  JPN: "일본",
  USA: "미국",
  OTHER: "기타",
};

export interface ForeignBadge {
  code: string;
  label: string;
}

/**
 * 외국인 슬롯 보유자일 때만 배지를 준다. 판정은 **`isForeignPlayer`가 정본**이라
 * 여기서 국적을 직접 비교하지 않는다 — ABL·JBL은 국적이 달라도 용병 개념이 없다.
 */
export function foreignBadge(
  leagueId: string | undefined,
  nationality: string | undefined,
): ForeignBadge | null {
  if (!leagueId || !isForeignPlayer(leagueId, nationality)) return null;
  const code = nationality ?? "OTHER";
  return { code, label: NATION_LABEL[code] ?? code };
}

// ── 득점권 스플릿 ─────────────────────────────────────────────────────

export interface RispSplit {
  /** 타자면 "득점권 타율", 투수면 "득점권 피안타율" */
  label: string;
  avg: number;
  text: string;
  ab: number;
  h: number;
  /** 시즌 전체 대비 차이. 기준값이 없으면 null */
  delta: number | null;
}

function fmtAvg(v: number): string {
  return v.toFixed(3).replace(/^0/, "");
}

/**
 * 득점권 성적. 엔진(`npc_sim.rs`)이 재고 `season-helpers`가 합산까지 하는데
 * 화면이 한 곳도 안 읽고 있었다.
 *
 * 타수가 너무 적으면 타율이 의미를 잃는다 — 3할이 1/3타수일 수 있다.
 * 표본이 얇으면 비율 대신 원수만 준다.
 */
export function rispSplit(
  stats: { rispAb?: number; rispH?: number } | null | undefined,
  kind: "batter" | "pitcher",
  seasonAvg: number | null,
  minAb = 10,
): RispSplit | null {
  const ab = stats?.rispAb ?? 0;
  const h = stats?.rispH ?? 0;
  if (ab <= 0) return null;

  const label = kind === "batter" ? "득점권 타율" : "득점권 피안타율";
  if (ab < minAb) {
    return { label, avg: h / ab, text: `${h}/${ab}`, ab, h, delta: null };
  }
  const avg = h / ab;
  return {
    label,
    avg,
    text: `${fmtAvg(avg)} (${h}/${ab})`,
    ab,
    h,
    delta: seasonAvg == null ? null : avg - seasonAvg,
  };
}

/**
 * 득점권이 좋은 쪽인지. **타자와 투수가 반대다** — 투수는 피안타율이라
 * 낮아야 좋다. 이걸 뒤집는 건 화면마다 흔한 실수라 여기서 한 번만 정한다.
 */
export function rispTone(
  delta: number | null,
  kind: "batter" | "pitcher",
  threshold = 0.02,
): "good" | "bad" | "flat" {
  if (delta == null || Math.abs(delta) < threshold) return "flat";
  const better = kind === "batter" ? delta > 0 : delta < 0;
  return better ? "good" : "bad";
}
