import type { EventContext } from "../types/event";
import type { PitcherSeasonStats, BatterSeasonStats } from "../types/save";

/**
 * **경로로 값을 읽는다** — 조건 타입을 필드마다 하나씩 만들지 않기 위한 장치.
 *
 * 예전엔 `season_wins_gte`·`season_era_lte`처럼 **필드 하나에 조건 타입 하나**였다.
 * 45종까지 그렇게 늘렸는데, 새 필드가 생길 때마다 평가기·타입 유니온·
 * `CONDITION_FIELDS`(master.ts)·문서 **넷을 같이** 고쳐야 한다. 그 넷이 어긋나는 게
 * 이 트랙이 두 번 겪은 결함이다(2026-08-22 조건 44개가 필드 이름이 틀려 영원히 false).
 *
 * 그래서 남은 축은 전부 `{ type: "num_gte", path: "batting.contact", value: 60 }`
 * 형태로 연다. 축이 늘어도 **이 파일의 표 한 곳**만 는다.
 *
 * 🔴 **경로는 반드시 허용 목록을 거친다.** 오타를 그대로 통과시키면
 * `undefined`가 비교에 들어가 조용히 false가 되고, 그게 정확히 예전 결함이다.
 * 모르는 경로는 **던진다** — 로드에서 죽는 게 조용히 안 뜨는 것보다 낫다.
 *
 * ⚠ **기존 45종은 그대로 둔다.** 데이터 535건이 쓰고 있고 지우면 전부 고쳐야 한다.
 */

// ── 키 묶음 (정본은 types/save.ts) ─────────────────────────────
const PITCHING = [
  "ovr", "stamina", "velocity", "command", "control",
  "movement", "mentality", "recovery", "clutch", "holdRunners",
] as const;

const BATTING = [
  "ovr", "contact", "power", "eye", "discipline", "speed",
  "baseInstinct", "bunting", "platoon", "fielding", "arm", "battingClutch",
] as const;

/** 투수 시즌 기록. `type`은 판별자라 뺀다 */
const PITCHER_STATS = [
  "g", "gs", "w", "l", "sv", "hd", "ip", "er", "h", "k", "bb",
  "era", "whip", "rispAb", "rispH",
] as const;

/** 타자 시즌 기록 */
const BATTER_STATS = [
  "g", "pa", "ab", "h", "hr", "rbi", "sb", "bb", "k",
  "avg", "obp", "slg", "ops", "rispAb", "rispH",
] as const;

const STANDING = ["wins", "losses", "draws", "winPct", "runsFor", "runsAgainst"] as const;

const CONTRACT_NUM = [
  "salary", "durationYears", "remainingYears", "signingBonus",
  "teamOptionYears", "playerOptionYears",
] as const;

const SEASON_HEALTH = ["lowConditionWeeks", "highFatigueWeeks", "injuryCount", "totalWeeks"] as const;

const INJURY_NUM = ["recoveryWeeksLeft", "totalRecoveryWeeks", "rehabPhase"] as const;

const SCHOOL_NUM = [
  "examAccumScore", "warningCount", "universityWeek", "universityGpa",
  "semesterQualityAccum", "semesterWeeks", "repeatedYears", "academicWarningLevel",
] as const;

/** 주인공 최상위 숫자 필드 */
const PROTA_NUM = [
  "age", "grade", "jerseyNumber", "condition", "fatigue", "morale",
  "diligence", "popularity", "developmentRate", "potentialHidden", "growthPoints",
  "money", "fame", "scoutScore", "proServiceYears",
  "militaryServiceWeeks", "militaryRecoveryWeeks", "militaryDeferPenalty",
  "tradeAdaptationWeeks", "faNegotiationRound", "faUnsignedWeeks",
] as const;

/** 주인공 최상위 문자열·열거 필드 (`eq` 전용) */
const PROTA_EQ = [
  "careerStage", "leagueId", "teamId", "schoolId", "playerType", "position",
  "primaryPosition", "handedness", "pitchingForm", "currentRole", "militaryStatus",
  "militaryUnit", "militaryServedUnit", "militaryHiatusStage",
] as const;

/** 불리언 (`eq`로 true/false를 본다) */
const BOOL_PATHS = [
  "sportsUnitSelected", "sportsUnitApplied",
  "contract.noTrade", "injury.permanentPenaltyApplied", "injury.steroidUsed",
  "school.attendsUniversity", "school.eligibilityBlocked", "school.majorSelected",
  "school.graduated", "school.draftTriggered", "school.careerChoiceConfirmed",
] as const;

/** 배열 길이 — "부상 이력 3회 이상" 같은 것 */
const COUNT_PATHS = [
  "injuryHistory.count", "careerRecords.count", "careerEvents.count",
  "pitches.count", "tags.count", "relations.count",
] as const;

const join = (prefix: string, keys: readonly string[]) => keys.map((k) => `${prefix}.${k}`);

/** 숫자로 읽을 수 있는 경로 전부 */
export const NUM_PATHS: ReadonlySet<string> = new Set([
  ...PROTA_NUM,
  ...join("pitching", PITCHING),
  ...join("batting", BATTING),
  ...join("seasonStart.pitching", PITCHING),
  ...join("seasonStart.batting", BATTING),
  ...join("xp.pitching", PITCHING),
  ...join("xp.batting", BATTING),
  ...join("stats", PITCHER_STATS),
  ...join("stats", BATTER_STATS),
  ...join("standing", STANDING),
  ...join("contract", CONTRACT_NUM),
  ...join("seasonHealth", SEASON_HEALTH),
  ...join("injury", INJURY_NUM),
  ...join("school", SCHOOL_NUM),
  ...COUNT_PATHS,
  "week", "seasonYear",
]);

/** `eq`로 읽을 수 있는 경로 전부 */
export const EQ_PATHS: ReadonlySet<string> = new Set([
  ...PROTA_EQ,
  ...BOOL_PATHS,
  "contract.status", "injury.type", "injury.severity", "injury.source",
  "injury.treatmentChoice", "school.weeklyStudyMode", "school.universityMajor",
  "seasonPhase",
]);

// ── 해석 ───────────────────────────────────────────────────────
const seasonStatsOf = (ctx: EventContext): PitcherSeasonStats | BatterSeasonStats | undefined =>
  ctx.stats[ctx.protagonist.id] as PitcherSeasonStats | BatterSeasonStats | undefined;

/** 내 팀의 순위표 행. 없으면 undefined — 비교는 전부 false가 된다 */
function standingOf(ctx: EventContext) {
  return ctx.standings.find((s) => s.teamId === ctx.protagonist.teamId);
}

/**
 * 경로를 값으로. **모르는 경로면 던진다.**
 *
 * ⚠ `undefined`를 돌려주는 것과 던지는 것은 다르다 — 값이 아직 없는 것(부상을
 * 안 당했다)은 `undefined`가 맞고, **경로 자체가 틀린 것**은 결함이다.
 */
export function resolvePath(ctx: EventContext, path: string): unknown {
  if (!NUM_PATHS.has(path) && !EQ_PATHS.has(path)) {
    throw new Error(`[eventPaths] 모르는 경로: "${path}" — eventPaths.ts의 표에 없다`);
  }
  const p = ctx.protagonist;

  if (path === "week") return ctx.currentWeek;
  if (path === "seasonPhase") return ctx.seasonPhase;
  if (path === "seasonYear") return undefined;   // ctx에 없다 — 넣을 때 여기도 잇는다

  const dot = path.indexOf(".");
  if (dot === -1) return (p as unknown as Record<string, unknown>)[path];

  const head = path.slice(0, dot);
  const rest = path.slice(dot + 1);

  switch (head) {
    case "pitching":    return p.pitching[rest as keyof typeof p.pitching];
    case "batting":     return p.batting[rest as keyof typeof p.batting];
    case "seasonStart": {
      const d2 = rest.indexOf(".");
      const which = rest.slice(0, d2), key = rest.slice(d2 + 1);
      const src = which === "pitching" ? p.seasonStartPitching : p.seasonStartBatting;
      return src ? (src as unknown as Record<string, number>)[key] : undefined;
    }
    case "xp": {
      const d2 = rest.indexOf(".");
      const which = rest.slice(0, d2), key = rest.slice(d2 + 1);
      const src = which === "pitching" ? p.pitchingXP : p.battingXP;
      return (src as Record<string, number> | undefined)?.[key] ?? 0;
    }
    case "stats":       return (seasonStatsOf(ctx) as unknown as Record<string, unknown> | undefined)?.[rest];
    case "standing":    return (standingOf(ctx) as unknown as Record<string, unknown> | undefined)?.[rest];
    case "contract":    return (p.contract as unknown as Record<string, unknown> | undefined)?.[rest];
    case "seasonHealth":return (p.seasonHealth as unknown as Record<string, unknown> | undefined)?.[rest];
    case "injury":      return (p.injury as unknown as Record<string, unknown> | undefined)?.[rest];
    case "school":      return (ctx.schoolState as unknown as Record<string, unknown> | undefined)?.[rest];
    case "injuryHistory":  return (p.injuryHistory ?? []).length;
    case "careerRecords":  return (p.careerRecords ?? []).length;
    case "careerEvents":   return (p.careerEvents ?? []).length;
    case "pitches":        return (p.pitches ?? []).length;
    case "tags":           return (p.tags ?? []).length;
    case "relations":      return (ctx.relations ?? []).length;
    default:
      throw new Error(`[eventPaths] 경로 뿌리를 모른다: "${head}" (${path})`);
  }
}

/** 숫자 비교용. 값이 없으면 `undefined` — 비교는 false가 된다 */
export function resolveNumber(ctx: EventContext, path: string): number | undefined {
  const v = resolvePath(ctx, path);
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
