import type { ProtagonistSave } from "../types/save";

/**
 * 등급 추첨 규칙 — **정본은 `events/tier_rules.json` 하나다.**
 *
 * 🔴 여기 기본값을 두지 않는다. 못 읽으면 `parseTierRules` 가 **던진다** —
 *   조용히 기본값으로 굴러가면 계측이 「어느 값으로 잰 것인가」를 못 답한다.
 *   이 저장소가 반복해 겪은 형태다(매니페스트 스텁 · 훈련 프로그램 표).
 */

export type EventGrade = "normal" | "rare" | "unique" | "hidden";

/** 낮은 것부터 — 폴백은 이 배열을 왼쪽으로 한 칸 간다 */
export const GRADES: readonly EventGrade[] = ["normal", "rare", "unique", "hidden"];

/** 한 단계 아래 등급. 노말이면 없다(더 내려갈 곳이 없다) */
export function gradeBelow(g: EventGrade): EventGrade | null {
  const i = GRADES.indexOf(g);
  return i <= 0 ? null : GRADES[i - 1];
}

export interface StageGroup {
  id: string;
  militaryStatus?: string[];
  leagueIds?: string[];
  careerStages?: string[];
  /** 프로를 연차로 가를 때 쓴다 — 지금 데이터엔 없다(§ stageGroups 주석) */
  proYearGte?: number;
  proYearLte?: number;
}

export interface TierRules {
  weights: Record<EventGrade, number>;
  seasonCap: Partial<Record<EventGrade, number>>;
  dryBoost: Partial<Record<EventGrade, { afterWeeks: number; perWeek: number; max: number }>>;
  stateMod: Record<string, { tier: EventGrade; from: number; perPoint: number; max: number }>;
  starve: { perWeek: number; max: number };
  hidden: { careerCapPerEvent: number };
  fallback: "step_down";
  stageGroups: StageGroup[];
  seasonFreq: Partial<Record<EventGrade, { min: number; max: number }>>;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * JSON 을 규칙으로 읽는다. **모르는 값·빠진 값이면 던진다.**
 *
 * ⚠ `_` 로 시작하는 칸은 문서다 — 데이터 파일 안에 근거를 적어 두려고 뒀고
 *   여기서 무시한다.
 */
export function parseTierRules(raw: unknown): TierRules {
  const bad = (why: string): never => {
    throw new Error(`[tier_rules] ${why} — resource/data/master/events/tier_rules.json 을 봐라`);
  };
  if (!raw || typeof raw !== "object") return bad("파일을 못 읽었다");
  const o = raw as Record<string, unknown>;

  const w = o.weights as Record<string, unknown> | undefined;
  if (!w) return bad("`weights` 가 없다");
  const weights = {} as Record<EventGrade, number>;
  for (const g of GRADES) {
    if (!isNum(w[g])) return bad(`\`weights.${g}\` 가 숫자가 아니다`);
    weights[g] = w[g] as number;
  }

  // ⚠ **없어도 된다** — 시즌 상한은 2026-09-08 에 데이터에서 뺐다
  //   (`tier_rules.json` `_seasonCapDoc`). 열쇠가 없으면 빈 표가 되고
  //   모든 `cap` 이 undefined 라 아무 등급도 안 막힌다. **읽는 코드는
  //   남겨 둔다** — 옛 세이브·다른 규칙 JSON 이 상한을 들고 있어도 안 죽고,
  //   되살리려면 데이터 한 줄이면 된다.
  const capRaw = (o.seasonCap ?? {}) as Record<string, unknown>;
  const seasonCap: Partial<Record<EventGrade, number>> = {};
  for (const g of GRADES) if (isNum(capRaw[g])) seasonCap[g] = capRaw[g] as number;

  const dryRaw = (o.dryBoost ?? {}) as Record<string, Record<string, number>>;
  const dryBoost: TierRules["dryBoost"] = {};
  for (const g of GRADES) {
    const d = dryRaw[g];
    if (!d) continue;
    if (!isNum(d.afterWeeks) || !isNum(d.perWeek) || !isNum(d.max)) {
      return bad(`\`dryBoost.${g}\` 에 afterWeeks·perWeek·max 가 다 있어야 한다`);
    }
    dryBoost[g] = { afterWeeks: d.afterWeeks, perWeek: d.perWeek, max: d.max };
  }

  const smRaw = (o.stateMod ?? {}) as Record<string, Record<string, unknown>>;
  const stateMod: TierRules["stateMod"] = {};
  for (const [k, v] of Object.entries(smRaw)) {
    if (k.startsWith("_")) continue;
    const tier = v.tier as EventGrade;
    if (!GRADES.includes(tier)) return bad(`\`stateMod.${k}.tier\` 가 등급 이름이 아니다`);
    if (!isNum(v.from) || !isNum(v.perPoint) || !isNum(v.max)) {
      return bad(`\`stateMod.${k}\` 에 from·perPoint·max 가 다 있어야 한다`);
    }
    stateMod[k] = {
      tier,
      from: v.from as number,
      perPoint: v.perPoint as number,
      max: v.max as number,
    };
  }

  const st = o.starve as Record<string, unknown> | undefined;
  if (!st || !isNum(st.perWeek) || !isNum(st.max))
    return bad("`starve.perWeek`·`starve.max` 가 없다");

  const hd = o.hidden as Record<string, unknown> | undefined;
  if (!hd || !isNum(hd.careerCapPerEvent)) return bad("`hidden.careerCapPerEvent` 가 없다");

  if (o.fallback !== "step_down") return bad("`fallback` 은 지금 `step_down` 하나뿐이다");

  const sg = o.stageGroups;
  if (!Array.isArray(sg) || sg.length === 0) return bad("`stageGroups` 가 비었다");
  const stageGroups: StageGroup[] = sg.map((g: Record<string, unknown>) => {
    if (typeof g.id !== "string") return bad("`stageGroups[].id` 가 없다");
    return {
      id: g.id,
      militaryStatus: g.militaryStatus as string[] | undefined,
      leagueIds: g.leagueIds as string[] | undefined,
      careerStages: g.careerStages as string[] | undefined,
      proYearGte: isNum(g.proYearGte) ? g.proYearGte : undefined,
      proYearLte: isNum(g.proYearLte) ? g.proYearLte : undefined,
    };
  });

  const freqRaw = (o.seasonFreq ?? {}) as Record<string, { min: number; max: number }>;
  const seasonFreq: TierRules["seasonFreq"] = {};
  for (const g of GRADES) {
    const f = freqRaw[g];
    if (f && isNum(f.min) && isNum(f.max)) seasonFreq[g] = { min: f.min, max: f.max };
  }

  return {
    weights,
    seasonCap,
    dryBoost,
    stateMod,
    starve: { perWeek: st.perWeek as number, max: st.max as number },
    hidden: { careerCapPerEvent: hd.careerCapPerEvent as number },
    fallback: "step_down",
    stageGroups,
    seasonFreq,
  };
}

/**
 * 지금 주인공이 선 무대. **배열 순서대로 처음 맞는 것**이다.
 *
 * ⚠ 군이 맨 위인 이유는 데이터 쪽 주석에 적었다 — 복무 중에도 `careerStage`
 *   가 소속을 들고 있어 그냥 두면 프로로 읽힌다.
 * ⚠ 어디에도 안 맞으면 `"공용"` 이다 — 무대를 못 가르는 것과 무대가 없는 것을
 *   가른다(0 으로 접으면 검사 표에서 그 판이 통째로 사라진다).
 */
export function stageGroupOf(rules: TierRules, p: ProtagonistSave): string {
  for (const g of rules.stageGroups) {
    if (g.militaryStatus && !g.militaryStatus.includes(p.militaryStatus)) continue;
    if (g.leagueIds && !g.leagueIds.includes(p.leagueId)) continue;
    if (g.careerStages && !g.careerStages.includes(p.careerStage)) continue;
    if (g.proYearGte !== undefined && (p.proServiceYears ?? 0) < g.proYearGte) continue;
    if (g.proYearLte !== undefined && (p.proServiceYears ?? 0) > g.proYearLte) continue;
    // 아무 조건도 안 적힌 묶음은 「나머지 전부」다
    if (
      !g.militaryStatus &&
      !g.leagueIds &&
      !g.careerStages &&
      g.proYearGte === undefined &&
      g.proYearLte === undefined
    )
      return g.id;
    return g.id;
  }
  return "공용";
}
