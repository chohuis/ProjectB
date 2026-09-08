import type { Condition, EventContext } from "../types/event";
import { resolveNumber, resolvePath } from "./eventPaths";
import { streakKeyOf } from "./eventCounters";
import type { PitcherSeasonStats } from "../types/save";
import { GROUPS_BY_LEAGUE } from "./leagueTeams.generated";

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
      // 🔴 **프로 세 리그를 한 번에 가리킬 수단이 없었다.** KBL 171종이
      // `stage: "pro_kbl"`로 잠겨 있어 **해외로 나가면 1군 이야기가 통째로
      // 멈췄다** — ABL·JBL이 0종인 진짜 이유다. 타입을 늘리지 않고
      // `stages` 배열을 받는다. `stage` 하나는 그대로 동작한다.
      if (Array.isArray(cond.stages)) return cond.stages.includes(protagonist.careerStage);
      return protagonist.careerStage === cond.stage;

    case "league_id":
      // 🔴 **세 리그 2군을 한 번에 가리킬 수단이 없었다.** KBL 2군 40종이
      // `leagueId: "LEAGUE_KBL_FARM"` 하나로 잠겨 있어 **ABL·JBL 2군이 0종**이었다.
      // 1군은 `career_stage`에 `stages` 배열을 열어 풀었는데(2026-08-25)
      // `league_id`엔 그게 없었다. 같은 모양으로 연다 — `leagueId` 하나는
      // 그대로 동작한다.
      if (Array.isArray(cond.leagueIds)) return cond.leagueIds.includes(protagonist.leagueId);
      return protagonist.leagueId === cond.leagueId;

    case "grade":
      return (protagonist.grade ?? 0) === cond.value;

    case "player_type":
      // 🔴 **정확 일치면 투타겸업이 조용히 빠진다.** `PlayerType`은 셋인데
      // (`pitcher` · `batter` · `twoWay`) 예전엔 `===`라 `twoWay` 주인공에게
      // 투수 이벤트도 타자 이벤트도 안 떴다. 지금은 주인공이 항상 `pitcher`라
      // 안 터지지만, 타입이 열리는 날 **8종이 말없이 사라지는** 모양이다.
      //
      // 겸업은 투수이기도 하고 타자이기도 하다 — 엔진도 그렇게 본다
      // (`gradeAdvance.ts`가 `twoWay`를 `pitcher`로 접는다).
      if (protagonist.playerType === "twoWay") {
        return cond.playerType === "pitcher" || cond.playerType === "batter"
          || cond.playerType === "twoWay";
      }
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

    // ── 반대쪽 — "성적이 나쁘다" (2026-09-01 · 사용자 확정) ──────
    //
    // 🔴 위 넷은 전부 **잘한 쪽**만 물었다. 그래서 부진·기회부족을
    //    `morale_lte` 가 대역하고 있었다(그 조건을 쓰는 이벤트 **42종**).
    //
    // ⚠ **기록이 없으면 거짓이다.** `0 <= N` 이 참이라고 "안 던졌는데 부진"
    //    으로 뜨면 안 된다 — 데뷔 전·부상 결장이 전부 걸린다.
    //    그래서 `season_*_gte` 와 달리 **등판 여부를 먼저 본다.**
    case "season_wins_lte": {
      const s = stats[protagonist.id] as PitcherSeasonStats | undefined;
      if (!s || s.type !== "pitcher" || s.g === 0) return false;
      return s.w <= cond.value;
    }

    case "season_era_gte": {
      const s = stats[protagonist.id] as PitcherSeasonStats | undefined;
      // ⚠ `ip === 0` 이면 ERA 가 0 이라 **얻어맞은 게 아니라 안 던진 것**이다
      if (!s || s.type !== "pitcher" || s.ip === 0) return false;
      return s.era >= cond.value;
    }

    case "season_ip_lte": {
      const s = stats[protagonist.id] as PitcherSeasonStats | undefined;
      // ⚠ **여기는 `g === 0` 을 본다.** "이닝이 적다"는 등판은 했는데 짧다는
      //    뜻이고, 한 경기도 안 나간 것과 다르다
      if (!s || s.type !== "pitcher" || s.g === 0) return false;
      return s.ip <= cond.value;
    }

    case "season_k_lte": {
      const s = stats[protagonist.id] as PitcherSeasonStats | undefined;
      if (!s || s.type !== "pitcher" || s.ip === 0) return false;
      return s.k <= cond.value;
    }

    // ── 팀 순위 ──────────────────────────────────────────────────
    //
    // 🔴 **조·권역이 있으면 그 안의 순위다** (2026-09-01 · 트랙 B 실측).
    //
    // 예전엔 리그 전체에서 셌다. 그런데 아마추어는 리그가 통짜가 아니다:
    //
    // ```
    //   고교  102팀  권역 8개 (6~20팀)     HS_REGIONS
    //   대학   50팀  조   5개 (각 10팀)    UNIV_GROUPS
    //   프로   10팀  조 없음 — 리그가 곧 조
    // ```
    //
    // 그래서 `team_rank_lte 2` 가 고교에서는 **102팀 중 2위**를 요구했고
    // 넷 다 한 번도 안 떴다(실측 0/4).
    //
    // ⚠ **이름이 뜻을 말한다** — `EVT_UNIV_GROUP_LAST` 가 `team_rank_gte 4`
    // 다. 50팀 기준이면 4위는 상위권인데 「조 꼴찌」라 부른다. **10팀 조를
    // 전제로 쓴 값**이다. 고교 `lte 2·4`("미디어가 주목")도 마찬가지다.
    //
    // ⚠ 문턱은 **하나도 안 고쳤다.** 지금 값들이 전부 10팀 안팎 감각이고
    // 그게 조 크기와 맞는다 — 모수를 바로잡으면 값이 저절로 맞는다.
    case "team_rank_lte":
    case "team_rank_gte": {
      // 주인공이 속한 조. 없으면 리그 전체가 모수다
      const groups = GROUPS_BY_LEAGUE[protagonist.leagueId];
      const myGroup = groups
        ? Object.values(groups).find((ids) => ids.includes(protagonist.teamId))
        : undefined;
      const pool = myGroup
        ? standings.filter((s) => myGroup.includes(s.teamId))
        : standings;
      const sorted = [...pool].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
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

    // 🔴 **`military_phase`를 지웠다 (2026-08-26).**
    // 
    // `return false`만 하는 스텁이었다 — 걸어도 **영원히 안 뜨고 로그도 안 남는다.**
    // 쓰는 데이터는 **0건**이었다(`check:eventconditions`가 그렇게 보고했다).
    // 
    // ⚠ **살릴 자리가 아니다.** 군 복무 중엔 이벤트 엔진이 아예 안 돈다
    //   (`advanceWeek:1602`에서 별도 경로로 빠진다). 트랙 B가 군 서사 14종을
    //   조건부 이벤트로 만들었다가 계측 0회를 보고 알았고,
    //   **`events/pools/military_*.json` 54종으로 옮겼다** — Rust가 계급으로 고른다.
    //   그 자리는 이미 채워졌다.
    // 
    // ⚠ 지웠으므로 이제 이 조건을 쓰면 **로드에서 잡힌다**(`assertConditions`).
    //   스텁일 때는 조용히 false였다 — 그게 더 나쁘다.


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
      // ⚠ **`unitmate` 는 출처가 다르다** (B-20 재회 · 2026-09-03). 부대원 관계는
      //   관계 테이블(slot.db)에 안 들어간다 — 복무가 끝나면
      //   `militaryRecord.topRelations` 상위 셋으로 접히고 그게 유일한 기록이다.
      //   `ctx.relations` 에서 찾으면 **영영 0건**이라 조용히 false 가 된다.
      const values = cond.kind === "unitmate"
        ? (ctx.protagonist?.militaryRecord?.topRelations ?? []).map((r) => r.value)
        : (ctx.relations ?? []).filter((r) => r.kind === cond.kind).map((r) => r.value);
      if (values.length === 0) return false;
      const best = cond.type === "relation_gte" ? Math.max(...values) : Math.min(...values);
      return cond.type === "relation_gte" ? best >= cond.value : best <= cond.value;
    }

    // ── 시간을 세는 조건 넷 (2026-09-08 · §12) ───────────────────
    //
    // ⚠ 넷 다 **세는 칸이 없으면 false** 다. 「아직 안 채웠다」와 같은 뜻이라
    //   맞지만, **끝내 못 채우는 칸**은 다르다 — 그건 배선이 빠진 것이고
    //   `check:tiercoverage` 가 「후보 0」으로 잡는다.

    case "streak": {
      const got = protagonist.streaks?.[streakKeyOf(cond)];
      return got !== undefined && got >= cond.weeks;
    }

    case "count": {
      const got = protagonist.counters?.[cond.counter];
      return got !== undefined && got >= cond.value;
    }

    case "compare": {
      // ⚠ `storyNpcs` 등록부가 아직 없다 — `npcId` 직접이 지금의 유일한 길이다(§12).
      //   `role` 은 등록부가 생기면 잇는다. 지금 `role` 만 적으면 **false** 다.
      const id = cond.npcId;
      if (!id) return false;
      const npc = ctx.storyNpcs?.[id];
      if (!npc) return false;
      const theirs = npc[cond.stat];
      const mine = resolveNumber(ctx, cond.stat);
      if (theirs === undefined || mine === undefined) return false;
      const margin = cond.margin ?? 0;
      return cond.op === "gte" ? mine >= theirs + margin : mine <= theirs - margin;
    }

    case "last_game": {
      const g = ctx.lastGame;
      if (!g) return false;
      const v = (g as unknown as Record<string, number | boolean>)[cond.field];
      if (v === undefined) return false;
      if (typeof v === "boolean" || typeof cond.value === "boolean") {
        // 참/거짓 칸(완봉·완투·승리)은 `eq` 만 뜻이 있다
        return cond.op === "eq" && v === cond.value;
      }
      if (cond.op === "gte") return v >= cond.value;
      if (cond.op === "lte") return v <= cond.value;
      return v === cond.value;
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
