import type { Condition, EventContext } from "../types/event";
import { resolveNumber, resolvePath } from "./eventPaths";
import type { PitcherSeasonStats } from "../types/save";

// ── 조건 단일 평가 ─────────────────────────────────────────────
export function evaluateCondition(cond: Condition, ctx: EventContext): boolean {
  const { protagonist, currentWeek, seasonPhase, standings, stats, schoolState } = ctx;

  switch (cond.type) {

    // ── 주차 / 시즌 ─────────────────────────────────────────────
    case "week_gte":
      return currentWeek >= cond.value;

    case "week_lte":
      return currentWeek <= cond.value;

    case "week_eq":
      return currentWeek === cond.value;

    case "season_phase":
      return seasonPhase === cond.phase;

    // ── 커리어 / 소속 ────────────────────────────────────────────
    case "career_stage":
      return protagonist.careerStage === cond.stage;

    case "league_id":
      return protagonist.leagueId === cond.leagueId;

    case "grade":
      return (protagonist.grade ?? 0) === cond.value;

    case "player_type":
      return protagonist.playerType === cond.playerType;

    // ── 컨디션 상태 ──────────────────────────────────────────────
    case "fatigue_gte":
      return protagonist.fatigue >= cond.value;

    case "fatigue_lte":
      return protagonist.fatigue <= cond.value;

    case "condition_gte":
      return protagonist.condition >= cond.value;

    case "condition_lte":
      return protagonist.condition <= cond.value;

    case "morale_gte":
      return protagonist.morale >= cond.value;

    case "morale_lte":
      return protagonist.morale <= cond.value;

    // ── 투구 능력치 ──────────────────────────────────────────────
    case "pitching_stat_gte":
      return protagonist.pitching[cond.stat] >= cond.value;

    case "pitching_stat_lte":
      return protagonist.pitching[cond.stat] <= cond.value;

    case "pitching_ovr_gte":
      return protagonist.pitching.ovr >= cond.value;

    case "pitching_ovr_lte":
      return protagonist.pitching.ovr <= cond.value;

    // ── 구종 ──────────────────────────────────────────────────────
    case "pitch_learned":
      return protagonist.pitches.some((e) => e.id === cond.pitchId);

    case "pitch_training":
      return protagonist.trainingPitchState?.id === cond.pitchId;

    // ── 태그 ──────────────────────────────────────────────────────
    case "has_tag":
      return protagonist.tags.includes(cond.tag);

    // ── 시즌 누적 스탯 ───────────────────────────────────────────
    case "season_wins_gte": {
      const s = stats[protagonist.id] as PitcherSeasonStats | undefined;
      return s?.type === "pitcher" ? s.w >= cond.value : false;
    }

    case "season_era_lte": {
      const s = stats[protagonist.id] as PitcherSeasonStats | undefined;
      if (!s || s.type !== "pitcher" || s.ip === 0) return false;
      return s.era <= cond.value;
    }

    case "season_ip_gte": {
      const s = stats[protagonist.id] as PitcherSeasonStats | undefined;
      return s?.type === "pitcher" ? s.ip >= cond.value : false;
    }

    case "season_k_gte": {
      const s = stats[protagonist.id] as PitcherSeasonStats | undefined;
      return s?.type === "pitcher" ? s.k >= cond.value : false;
    }

    // ── 팀 순위 ──────────────────────────────────────────────────
    case "team_rank_lte":
    case "team_rank_gte": {
      const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
      const rank = sorted.findIndex((s) => s.teamId === protagonist.teamId) + 1;
      if (rank === 0) return false; // 팀이 순위표에 없음
      return cond.type === "team_rank_lte" ? rank <= cond.value : rank >= cond.value;
    }

    case "fame_gte":
      return protagonist.fame >= cond.value;

    // ── 반쪽이던 축 (2026-08-22) ─────────────────────────────────
    // 셋 다 보상(`moneyDelta`·`diligenceDelta`·`popularityDelta`)은 예전부터
    // 있었는데 **읽는 쪽이 없었다.** 선택의 결과를 다음 이야기가 못 알아봤다.
    case "money_gte":
      return protagonist.money >= cond.value;

    case "money_lte":
      return protagonist.money <= cond.value;

    case "diligence_gte":
      return protagonist.diligence >= cond.value;

    case "diligence_lte":
      return protagonist.diligence <= cond.value;

    case "popularity_gte":
      return protagonist.popularity >= cond.value;

    case "popularity_lte":
      return protagonist.popularity <= cond.value;

    // ── 부상 (2026-08-22) ────────────────────────────────────────
    // ⚠ **`injury`는 없을 수 있다.** 안 다친 상태가 기본이라
    // `injury === undefined`다 — 그걸 "부상 중 아님"으로 읽는다.
    case "injured":
      return (protagonist.injury != null) === cond.value;

    case "injury_severity":
      return protagonist.injury?.severity === cond.severity;

    case "injury_weeks_gte":
      return (protagonist.injury?.recoveryWeeksLeft ?? 0) >= cond.value;

    // 커리어 누계 — `injuryHistory`는 복귀할 때 한 건씩 쌓인다
    case "injury_count_gte":
      return (protagonist.injuryHistory?.length ?? 0) >= cond.value;

    // 이번 시즌만 — `seasonHealth`는 시즌 롤오버에서 초기화된다
    case "season_injury_count_gte":
      return (protagonist.seasonHealth?.injuryCount ?? 0) >= cond.value;

    case "had_surgery":
      return (protagonist.injuryHistory ?? []).some((h) => h.severity === "surgery") === cond.value;

    case "pro_year_gte":
      return protagonist.proServiceYears >= cond.value;

    // ── 미래 필드 (군 시스템 설계 시 구현) ──────────────────────
    case "military_phase":
      return false;

    // ── 대학 학업 (Phase 9-C) ────────────────────────────────────
    //
    // `schoolState`가 없으면 전부 거짓이다 — 고교·프로·독립에서 학점 조건이
    // 참이 되면 안 된다. 대학 이벤트만 이 축을 쓴다.
    case "gpa_gte":
      return (schoolState?.universityGpa ?? 0) >= cond.value;

    case "gpa_lte":
      // ⚠ 학기를 한 번도 안 마쳤으면(이력 0) 학점이 0인 게 아니라 **없는** 것이다.
      // 그대로 0으로 비교하면 입학 첫 주부터 "학점이 위험하다"가 뜬다
      return (schoolState?.semesterGpaHistory?.length ?? 0) > 0
        && (schoolState?.universityGpa ?? 0) <= cond.value;

    case "academic_warning_gte":
      return (schoolState?.academicWarningLevel ?? 0) >= cond.value;

    // ── 일반 조건 (2026-08-24) ───────────────────────────────────
    // 쓸 수 있는 경로는 `eventPaths.ts`가 정본이다. 모르는 경로면 거기서 던진다.
    //
    // ⚠ **값이 없는 것과 경로가 틀린 것은 다르다.** 안 다쳤으면
    // `injury.rehabPhase`는 `undefined`고 비교는 false — 그게 맞다.
    // 경로 자체가 틀린 건 결함이라 던진다.
    case "num_gte": {
      const v = resolveNumber(ctx, cond.path);
      return v !== undefined && v >= cond.value;
    }

    case "num_lte": {
      const v = resolveNumber(ctx, cond.path);
      return v !== undefined && v <= cond.value;
    }

    case "eq":
      return resolvePath(ctx, cond.path) === cond.value;

    case "neq":
      return resolvePath(ctx, cond.path) !== cond.value;

    // ── 관계도 ───────────────────────────────────────────────────
    // 같은 종류가 여럿이면(동료) **가장 높은 값**을 본다 — "친한 동료가 있는가"가
    // 이야기가 묻는 것이지 평균이 아니다.
    case "relation_gte":
    case "relation_lte": {
      const rows = (ctx.relations ?? []).filter((r) => r.kind === cond.kind);
      if (rows.length === 0) return false;
      const best = cond.type === "relation_gte"
        ? Math.max(...rows.map((r) => r.value))
        : Math.min(...rows.map((r) => r.value));
      return cond.type === "relation_gte" ? best >= cond.value : best <= cond.value;
    }
  }

  // 🔴 **여기 없으면 조용히 false가 된다.**
  //
  // 예전엔 `default`가 없어서 모르는 타입이 오면 `undefined`가 반환됐고,
  // `evaluateConditions`의 `every`가 그걸 false로 읽었다. 로그도 예외도
  // 없으니 **그 이벤트는 영원히 안 뜨고 아무도 모른다.**
  //
  // 실제로 그렇게 죽어 있던 게 35종이었다(2026-08-22). 타입은 맞는데
  // 필드 이름이 틀린 경우였고(`career_stage`에 `stage` 대신 `value`),
  // 그건 `checkConditionShape`가 막는다. 여긴 타입 자체가 틀린 경우다.
  throw new Error(
    `[conditionEvaluator] 모르는 조건 타입: ${JSON.stringify(cond)} — ` +
    `오타이거나 엔진에 없는 조건이다. 조용히 넘기면 그 이벤트가 영영 안 뜬다`
  );
}

// ── 조건 배열 전체 평가 (AND) ─────────────────────────────────
export function evaluateConditions(conditions: Condition[], ctx: EventContext): boolean {
  return conditions.every((cond) => evaluateCondition(cond, ctx));
}
