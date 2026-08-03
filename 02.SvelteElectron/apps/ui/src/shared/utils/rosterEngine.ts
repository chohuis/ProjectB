import { SANGMU_TEAM_IDS } from "./ids";
import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type { NpcInjuryEntry } from "../types/save";
import type { PlayerCondition } from "../types/season";

export interface TeamRoster {
  rotation: string[];   // SP ID 순서 (리그별 최대 2~5명)
  bullpen: string[];    // RP/CP ID 목록
  closer: string;       // CP ID
  lineup: string[];     // 타자 출전 순서 (1번~9번)
}

// ── 리그별 SP 의무 휴식 경기 수 ────────────────────────────────
export function rotationRestGames(leagueId: string): number {
  if (leagueId === "LEAGUE_HIGHSCHOOL")  return 2;
  if (leagueId === "LEAGUE_UNIVERSITY")  return 2;
  if (leagueId === "LEAGUE_INDEPENDENT") return 2;
  return 4;  // 프로 (KBL, ABL, JBL)
}

// ── 유효 OVR 계산 (피로·휴식·부상 반영) ───────────────────────
function calcEffectiveOvr(
  baseOvr: number,
  condition: PlayerCondition | undefined,
  currentWeek: number,
): number {
  if (!condition) return baseOvr;

  // fatigue: 100=완전회복, 낮을수록 피로
  const fatF = condition.fatigue >= 70 ? 1.00
             : condition.fatigue >= 50 ? 0.90
             : condition.fatigue >= 30 ? 0.80
             : 0.65;

  // 마지막 등판 이후 경과 주 수
  const weeksRested = condition.lastPitchedWeek > 0
    ? currentWeek - condition.lastPitchedWeek : 99;
  const restF = weeksRested >= 2 ? 1.00
              : weeksRested === 1 ? 0.85
              : 0.55;  // 직전 주 등판 → 로테이션 후순위로 밀림

  return Math.round(baseOvr * fatF * restF);
}

// ── 로테이션 운용 감각 기반 선도 점수 ─────────────────────────
// rotationSense > 50: 최근 쉰 선수 선호 → 자연스러운 로테이션
// rotationSense < 50: OVR 위주 → 같은 선수 반복 기용
//
// 입력은 감독 `bullpenRead`다. 예전 이름은 `rotationSense`이었는데 그 키는
// 7-5 F-0에서 사라졌다 — 이름만 남으면 "그 키가 아직 있는 줄" 알고 다시 읽는다
function freshnessBonus(
  lastAppearanceGameCount: number | undefined,
  teamGameCount: number,
  rotationSense: number,
): number {
  const gamesSince = lastAppearanceGameCount !== undefined
    ? teamGameCount - lastAppearanceGameCount
    : 99;  // 한 번도 안 나온 선수 → 가장 신선
  return gamesSince * (rotationSense - 50) * 0.3;
}

// 리그(careerStage)별 로테이션 크기
export function rotationSizeForStage(careerStage: string): number {
  if (careerStage === "highschool")  return 3;
  if (careerStage === "university")  return 3;
  if (careerStage === "independent") return 4;
  return 5; // pro_kbl, pro_abl, pro_jbl
}

// 리그 ID 기반 로테이션 크기 (UI 표시용)
export function rotationSizeForLeague(leagueId: string): number {
  if (leagueId === "LEAGUE_HIGHSCHOOL")  return 3;
  if (leagueId === "LEAGUE_UNIVERSITY")  return 3;
  if (leagueId === "LEAGUE_INDEPENDENT") return 4;
  return 5;
}

const PLAY_THROUGH_OVR_MULT: Record<string, number> = { light: 0.88, moderate: 0.70 };

// ── 부상 필터링 + OVR 패널티 적용 ─────────────────────────────
function applyNpcInjuries(entities: EntityRow[], npcInjuries: Record<string, NpcInjuryEntry>): EntityRow[] {
  return entities.flatMap((e) => {
    const inj = npcInjuries[e.id];
    if (!inj) return [e];
    if (!inj.isPlayingThrough) return []; // benched
    const mult = PLAY_THROUGH_OVR_MULT[inj.severity] ?? 1.0;
    if (mult === 1.0) return [e];
    const pd = e.details.player as EntityPlayerDetails | undefined;
    if (!pd) return [e];
    const patchedPlayer: EntityPlayerDetails = {
      ...pd,
      pitching: pd.pitching ? { ...pd.pitching, ovr: Math.round((pd.pitching.ovr ?? 50) * mult) } : pd.pitching,
      batting:  pd.batting  ? { ...pd.batting,  ovr: Math.round((pd.batting.ovr  ?? 50) * mult) } : pd.batting,
    };
    return [{ ...e, details: { ...e.details, player: patchedPlayer } }];
  });
}

// ── 팀 엔티티 분류 ────────────────────────────────────────────
function getTeamPlayers(teamId: string, entities: EntityRow[], npcInjuries?: Record<string, NpcInjuryEntry>, npcRetired?: string[]): EntityRow[] {
  const retiredSet = new Set(npcRetired ?? []);
  const active = entities.filter(
    (e) => e.role === "player" && e.teamId === teamId && !retiredSet.has(e.id)
      // 복무 중인 선수는 소속 팀 로스터에 안 뜬다 — 상무 로스터에서만 보인다
      && (e.status === "active" || (e.status === "military" && SANGMU_TEAM_IDS.has(teamId))),
  );
  return npcInjuries ? applyNpcInjuries(active, npcInjuries) : active;
}

function playerDetails(e: EntityRow): EntityPlayerDetails {
  return e.details.player as EntityPlayerDetails;
}

// ── SP 가용 여부 판단 ─────────────────────────────────────────
function isSpAvailable(
  condition: PlayerCondition | undefined,
  teamGameCount: number,
  restRequired: number,
): boolean {
  if (!condition?.lastStartGameCount) return true;  // 첫 등판 or 기록 없음
  return (teamGameCount - condition.lastStartGameCount) > restRequired;
}

// ── 선발 로테이션 자동 배정 ──────────────────────────────────
export function getTeamRotation(
  teamId: string,
  entities: EntityRow[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
  maxRotation = 5,
  conditions?: Record<string, PlayerCondition>,
  currentWeek = 0,
  teamGameCount?: number,
  leagueId?: string,
  npcRetired?: string[],
): string[] {
  const players = getTeamPlayers(teamId, entities, npcInjuries, npcRetired);
  const pitchers = players.filter((e) => playerDetails(e).playerType === "pitcher");

  const restRequired = leagueId ? rotationRestGames(leagueId) : 4;
  const gameCount = teamGameCount ?? 0;

  const effOvr = (e: EntityRow) =>
    calcEffectiveOvr(playerDetails(e).pitching?.ovr ?? 0, conditions?.[e.id], currentWeek);

  const allSp = pitchers.filter((e) => playerDetails(e).position === "SP");

  // 1순위: 휴식 완료된 SP → effectiveOvr 내림차순
  const availableSp = allSp
    .filter((e) => isSpAvailable(conditions?.[e.id], gameCount, restRequired))
    .sort((a, b) => effOvr(b) - effOvr(a))
    .slice(0, maxRotation)
    .map((e) => e.id);

  // 2순위: 부족하면 휴식 중인 SP 중 lastStartGameCount 가장 작은 순 (가장 오래 쉰 순)
  if (availableSp.length < maxRotation) {
    const restingSp = allSp
      .filter((e) => !availableSp.includes(e.id))
      .sort((a, b) => {
        const ga = conditions?.[a.id]?.lastStartGameCount ?? 0;
        const gb = conditions?.[b.id]?.lastStartGameCount ?? 0;
        return ga - gb;
      })
      .slice(0, maxRotation - availableSp.length)
      .map((e) => e.id);
    availableSp.push(...restingSp);
  }

  // SP 부족 시 RP 중 effectiveOvr 높은 순으로 보충
  if (availableSp.length < maxRotation) {
    const rpFill = pitchers
      .filter((e) => !availableSp.includes(e.id))
      .sort((a, b) => effOvr(b) - effOvr(a))
      .slice(0, maxRotation - availableSp.length)
      .map((e) => e.id);
    availableSp.push(...rpFill);
  }

  return availableSp;
}

// ── 불펜 편성 ────────────────────────────────────────────────
export function getTeamBullpen(
  teamId: string,
  entities: EntityRow[],
  rotation: string[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
  conditions?: Record<string, PlayerCondition>,
  teamGameCount = 0,
  rotationSense = 50,
  npcRetired?: string[],
): { bullpen: string[]; closer: string } {
  const players = getTeamPlayers(teamId, entities, npcInjuries, npcRetired);
  const rotSet = new Set(rotation);

  const reliefs = players.filter(
    (e) =>
      playerDetails(e).playerType === "pitcher" &&
      !rotSet.has(e.id) &&
      (playerDetails(e).position === "RP" || playerDetails(e).position === "CP"),
  );

  // RP: consecutiveAppearances >= 2 → 의무 휴식
  const availableRp = reliefs.filter((e) => {
    const pos = playerDetails(e).position;
    if (pos === "CP") return true;  // CP는 별도 처리
    const consec = conditions?.[e.id]?.consecutiveAppearances ?? 0;
    return consec < 2;
  });

  // CP: consecutiveAppearances >= 3 → 의무 휴식
  const availableCp = reliefs.filter((e) => {
    const pos = playerDetails(e).position;
    if (pos !== "CP") return false;
    const consec = conditions?.[e.id]?.consecutiveAppearances ?? 0;
    return consec < 3;
  });

  // 선택 점수 = effectiveOvr + freshnessBonus
  const score = (e: EntityRow) => {
    const ovr = playerDetails(e).pitching?.ovr ?? 0;
    return ovr + freshnessBonus(conditions?.[e.id]?.lastAppearanceGameCount, teamGameCount, rotationSense);
  };

  // CP: 가용 CP 중 점수 최고, 없으면 전체 CP 중 최고 (fallback)
  //
  // ⚠ **CP가 0명이면 마무리가 빈 문자열이 되고, 그러면 세이브가 리그 전체에서
  // 0이 된다.** 호출측이 `closer ? toSimPitcher(...) : null`로 넘기고 엔진은
  // 마무리가 없으면 세이브를 안 붙인다 — 아무 오류도 안 나고 조용히 사라진다.
  // 실제로 생성기가 SP/RP만 만들던 시절 규정투수 94~110명 전원의 sv가 0이었다.
  //
  // 생성은 고쳤지만(팀당 CP 1명) 트레이드·부상·은퇴로 시즌 중에 비면 같은 일이
  // 다시 난다. **CP가 없으면 제일 좋은 불펜을 마무리로 쓴다** — 실제 구단도 그렇다.
  const cpPool = availableCp.length > 0 ? availableCp
    : reliefs.filter((e) => playerDetails(e).position === "CP");
  const cpSorted = [...cpPool].sort((a, b) => score(b) - score(a));
  const closer = cpSorted[0]?.id
    ?? [...availableRp].sort((a, b) => score(b) - score(a))[0]?.id
    ?? "";

  // RP 불펜: 가용 RP + 가용 CP → 점수 내림차순 (CP는 마무리 제외 후 포함 가능)
  const bullpenPool = [
    ...availableRp.filter((e) => playerDetails(e).position === "RP"),
    ...availableCp,
  ].sort((a, b) => score(b) - score(a));

  const bullpen = bullpenPool.map((e) => e.id);
  return { bullpen, closer };
}

// ── 라인업(타순) 자동 배정 ──────────────────────────────────
const POSITION_PRIORITY = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "UT"];

// ── 충원 시 채워야 할 자리 ───────────────────────────────────────
//
// ⚠ **인원 충원이 "몇 명"만 보고 "어느 자리"를 안 보면 포지션이 무너진다.**
//
// 생성 시점(`roster_gen`)은 8포지션을 두 바퀴 돌아 백업까지 보장한다.
// 그런데 매년 들어오는 신입생·드래프트·2군 충원은 그 규칙 밖에 있었고,
// 포지션을 무작위로 뽑았다. 평균으로는 균등해도 **팀 단위 편차가 해마다
// 누적된다** — 포수는 8분의 1이라 신입생 8명이면 포수 0명일 확률이 34%다.
//
// 실측(2026~2030 시즌별 최악): 고교 102팀 **전부**가 어느 해엔가 포지션 공백,
// 포수 0명이 31팀. 독립리그만 0건이었다 — 방출자 유입이 포지션을 안 가리고
// 들어와 자연히 균형이 잡힌다.

/** 야수 8포지션 + 투수 보직. 채우는 순서가 곧 우선순위다 */
const FIELD_POSITIONS = ["C", "SS", "CF", "2B", "3B", "RF", "LF", "1B"] as const;

/**
 * 그 팀에 **모자란 자리**를 우선순위 순으로 돌려준다.
 *
 * ① 한 명도 없는 야수 자리 (포수가 맨 앞 — 전문 요원이라 0명이면 경기 불성립)
 * ② 야수 총원이 타순(9)에 못 미치면 제일 얇은 자리부터
 * ③ 투수가 하한 미달이면 SP·RP
 * ④ 백업이 없는(1명뿐인) 야수 자리
 *
 * `count`보다 짧게 돌려줄 수 있다 — 그 뒤는 생성기가 무작위로 채운다.
 *
 * ⚠ **①~③을 순서대로 다 채우면 ②가 굶는다.** 고교는 한 해 정원이 10명인데
 * 빈 자리(①)와 백업 없는 자리(③)가 합쳐 8자리를 넘는 팀이 흔하다. 그러면
 * 투수 몫이 남지 않고, 다음 해에도 같은 일이 반복된다 —
 * 실측 고교 투수 4~5명(하한 6), **102팀 중 21팀** 미달.
 *
 * 그래서 **투수 몫을 먼저 떼어 둔다.** 야수 공백(①)은 경기가 성립하지 않는
 * 문제라 그대로 최우선이고, 그 다음이 투수, 백업(③)은 마지막이다.
 */
export function neededPositions(
  roster: Array<{ playerType?: string; position?: string }>,
  count: number,
  minPitchers = 0,
  /** 타순 한 바퀴. **경기 성립 조건이라 투수 하한보다 앞이다** */
  minBatters = 9,
): string[] {
  const cnt: Record<string, number> = {};
  let pitchers = 0;
  for (const p of roster) {
    if (p.playerType === "pitcher") { pitchers++; continue; }
    const pos = p.position ?? "";
    cnt[pos] = (cnt[pos] ?? 0) + 1;
  }

  const batters = roster.length - pitchers;
  const empty  = FIELD_POSITIONS.filter((pos) => (cnt[pos] ?? 0) === 0);
  const backup = FIELD_POSITIONS.filter((pos) => (cnt[pos] ?? 0) === 1);
  const pitShort = Math.max(0, minPitchers - pitchers);

  // ⚠ **포지션 공백만 보면 야수 총원이 빈다.** 8자리 중 7자리가 차 있으면
  // 공백은 1개뿐이라, 야수가 7명이어도 나머지를 투수가 다 먹는다.
  // 실측: 투수 폴백 비율을 30% → 45%로 올리자 고교 **20팀이 타순 미달**(야수<9).
  //
  // 타순 한 바퀴는 **경기 성립 조건**이라 투수 하한보다 앞이다.
  // (야수가 9명 미만이면 Rust가 `lineup[lpos % n]`으로 돌려 남은 타자의
  // 타석이 부풀고, 능력치가 아니라 출전량이 성적을 만든다)
  const batShort = Math.max(0, minBatters - batters - empty.length);

  // 투수 몫 — 공백(①)과 야수 총원(②)을 먼저 뺀 나머지를 백업(④)과 나눈다
  const afterBat = Math.max(0, count - empty.length - batShort);
  const pitQuota = Math.min(pitShort, afterBat);

  const out: string[] = [];
  const push = (v: string) => { if (out.length < count) out.push(v); };

  for (const pos of empty) push(pos);
  // 총원이 모자라면 **제일 얇은 자리부터** 채운다 — 한 자리에 몰아주지 않는다
  const thin = [...FIELD_POSITIONS].sort((a, b) => (cnt[a] ?? 0) - (cnt[b] ?? 0));
  for (let i = 0; i < batShort; i++) push(thin[i % thin.length]);
  // 투수는 선발 우선 — 로테이션이 먼저 돌아야 경기가 성립한다
  for (let i = 0; i < pitQuota; i++) push((pitchers + i) % 3 === 2 ? "RP" : "SP");
  for (const pos of backup) push(pos);
  return out;
}

export function getTeamLineup(
  teamId: string,
  entities: EntityRow[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
  conditions?: Record<string, PlayerCondition>,
  currentWeek = 0,
  teamGameCount = 0,
  rotationSense = 50,
  npcRetired?: string[],
): string[] {
  const players = getTeamPlayers(teamId, entities, npcInjuries, npcRetired);
  let batters = players.filter(
    (e) =>
      playerDetails(e).playerType === "batter" ||
      playerDetails(e).playerType === "twoWay",
  );
  // ⚠ **9명을 못 채우면 남은 타자의 타석이 부푼다.**
  //
  // Rust는 `lineup[lpos % n]`으로 타순을 돌린다. n=6이면 한 바퀴가 짧아져
  // 타석이 9/6 = 1.5배가 되고, 그러면 **능력치가 아니라 출전량이 성적을
  // 만든다** — 실측에서 경기당 7.1타석(정상 4.7)이 나왔고 OVR·ERA 상관이
  // −0.5에서 −0.25로 무너졌다.
  //
  // 예전엔 야수가 **0명일 때만** 전체 선수로 폴백했다. 8명이면 8명짜리
  // 라인업이 그대로 나갔고 아무 신호도 없었다.
  //
  // 실제 야구도 야수가 모자라면 투수를 타석에 세운다(비상 상황). 여기서도
  // 타격이 나은 투수부터 채운다 — 부자연스럽지만 **통계를 왜곡하는 것보다 낫다.**
  if (batters.length < 9) {
    const fillers = players
      .filter((e) => !batters.includes(e))
      .sort((a, b) => (playerDetails(b).batting?.ovr ?? 0) - (playerDetails(a).batting?.ovr ?? 0));
    batters = [...batters, ...fillers.slice(0, 9 - batters.length)];
  }

  // 타자 선택 점수: 피로 반영 OVR + freshnessBonus
  const batScore = (e: EntityRow) => {
    const base = playerDetails(e).batting?.ovr ?? 0;
    const cond = conditions?.[e.id];
    const fatF = !cond ? 1.0
      : cond.fatigue >= 70 ? 1.00
      : cond.fatigue >= 50 ? 0.90
      : 0.78;
    const effOvr = Math.round(base * fatF);
    return effOvr + freshnessBonus(cond?.lastAppearanceGameCount, teamGameCount, rotationSense);
  };

  // 포지션별 1명씩 최고 점수 선택
  const used = new Set<string>();
  const positionPick: Record<string, string> = {};

  for (const pos of POSITION_PRIORITY) {
    const best = batters
      .filter((e) => !used.has(e.id) && playerDetails(e).position === pos)
      .sort((a, b) => batScore(b) - batScore(a))[0];
    if (best) {
      positionPick[pos] = best.id;
      used.add(best.id);
    }
  }

  // 포지션 미충족 시 남은 타자로 보충
  let remaining = batters
    .filter((e) => !used.has(e.id))
    .sort((a, b) => batScore(b) - batScore(a));

  const lineup9: string[] = [];
  for (const pos of POSITION_PRIORITY) {
    if (positionPick[pos]) lineup9.push(positionPick[pos]);
    if (lineup9.length >= 9) break;
  }
  while (lineup9.length < 9 && remaining.length > 0) {
    const next = remaining.shift()!;
    lineup9.push(next.id);
  }

  // 타순 정렬: 1번(출루율 높음) → 3·4번(파워·컨택) → 나머지
  return sortBattingOrder(lineup9, entities);
}

function sortBattingOrder(ids: string[], entities: EntityRow[]): string[] {
  if (ids.length === 0) return [];

  const map = new Map(entities.map((e) => [e.id, e]));
  const scored = ids.map((id) => {
    const e = map.get(id);
    if (!e) return { id, lead: 0, power: 0, contact: 0 };
    const b = playerDetails(e).batting;
    const lead    = (b?.eye ?? 50) + (b?.speed ?? 50);
    const power   = (b?.power ?? 50) + (b?.contact ?? 50);
    const contact = b?.contact ?? 50;
    return { id, lead, power, contact };
  });

  if (scored.length < 3) return scored.map((s) => s.id);

  // 리드오프: lead 최고, 클린업: power 최고 (3·4번)
  scored.sort((a, b) => b.lead - a.lead);
  const leadoff = scored.shift()!;
  scored.sort((a, b) => b.power - a.power);
  const cleanup = [scored.shift(), scored.shift()].filter((s): s is typeof scored[0] => !!s);
  const rest = scored.map((s) => s.id);

  return [leadoff.id, rest[0] ?? "", ...cleanup.map((c) => c.id), ...rest.slice(1)].filter(Boolean);
}

// ── 팀 전체 로스터 한 번에 생성 ─────────────────────────────
export function buildTeamRoster(
  teamId: string,
  entities: EntityRow[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
  maxRotation = 5,
  conditions?: Record<string, PlayerCondition>,
  currentWeek = 0,
  teamGameCount = 0,
  leagueId = "",
  rotationSense = 50,
  npcRetired?: string[],
): TeamRoster {
  const rotation = getTeamRotation(teamId, entities, npcInjuries, maxRotation, conditions, currentWeek, teamGameCount, leagueId, npcRetired);
  const { bullpen, closer } = getTeamBullpen(teamId, entities, rotation, npcInjuries, conditions, teamGameCount, rotationSense, npcRetired);
  const lineup = getTeamLineup(teamId, entities, npcInjuries, conditions, currentWeek, teamGameCount, rotationSense, npcRetired);
  return { rotation, bullpen, closer, lineup };
}
