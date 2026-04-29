import type { Condition, EventContext } from "../types/event";
import type { PitcherSeasonStats } from "../types/save";

// ── 조건 단일 평가 ─────────────────────────────────────────────
export function evaluateCondition(cond: Condition, ctx: EventContext): boolean {
  const { protagonist, currentWeek, seasonPhase, standings, stats, triggeredEvents } = ctx;

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
      return protagonist.learnedPitchIds.includes(cond.pitchId);

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

    // ── 미래 필드 (추후 구현, 현재는 false) ─────────────────────
    case "fame_gte":
    case "pro_year_gte":
    case "military_phase":
      return false;
  }
}

// ── 조건 배열 전체 평가 (AND) ─────────────────────────────────
export function evaluateConditions(conditions: Condition[], ctx: EventContext): boolean {
  return conditions.every((cond) => evaluateCondition(cond, ctx));
}
