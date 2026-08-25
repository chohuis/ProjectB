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

  // ⚠ **로테이션은 고정이다.** 예전엔 매 경기 "휴식 완료된 SP를
  // `effectiveOvr` 내림차순"으로 다시 뽑았다. `effectiveOvr`는 컨디션이 섞인
  // 값이라 매주 흔들리고, 그러면 **상위 5명 집합이 계속 바뀐다** —
  // 팀에 SP가 12명이면 12명이 돌아가며 던져 각자 7~12번뿐이었다.
  //
  // 실제 야구는 로테이션이 시즌 내내 고정이고 5명이 각자 28번 던진다.
  // 표본이 4배 두꺼워야 ERA가 능력치를 반영한다 — 실측 OVR–ERA 상관이
  // 선발 61명일 때 −0.63인데 96명일 때 **+0.12**(양수)까지 갔다.
  //
  // **기본 OVR로 뽑는다.** 컨디션이 안 섞이므로 같은 5명이 유지된다.
  // 부상자는 `getTeamPlayers`가 이미 뺐고, 5인 로테이션이면 등판 간격이
  // 자연히 4경기라 휴식 조건도 저절로 맞는다.
  const baseOvr = (e: EntityRow) => playerDetails(e).pitching?.ovr ?? 0;
  const core = [...allSp].sort((a, b) => baseOvr(b) - baseOvr(a)).slice(0, maxRotation);
  const availableSp = core.map((e) => e.id);

  // 로테이션이 안 차면(부상·인원 부족) 남은 SP에서 **가장 오래 쉰 순**으로 메운다.
  // 여기서도 `effectiveOvr`를 쓰면 그 순간 컨디션 좋은 선수가 끼어들어
  // 로테이션이 다시 흔들린다
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
  void isSpAvailable; void gameCount; void restRequired; void effOvr;

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
 * ② 야수 총원(타순 9)과 ③ 투수 하한이 **둘 다 모자라면 부족분에 비례 배분**
 *
 * ④ 남은 칸은 **투수 비율(0.45)대로** 투수와 백업 자리를 섞는다
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
  /** 남은 칸의 투수 비율. **생성 규칙(`pitcherRatio` 0.45)과 같아야 한다** */
  pitcherRatio = 0.45,
  /**
   * 투수 중 **선발** 비중. 정본은 `tuning.rs`의 `SP_SHARE_OF_PITCHERS`(0.45)다.
   *
   * ⚠ 예전엔 `(pitchers + i) % 3 === 2 ? "RP" : "SP"`라 **67%가 선발**이었다.
   * 생성은 45%인데 충원이 67%면 선발이 매년 불어난다 — 실측 6시즌에 리그
   * 선발이 57 → 112명(팀당 11명)이 됐고, 로테이션은 5~6이라 명목상 선발이
   * 각자 짧게 던지면서 **OVR–ERA 상관이 −0.61 → −0.19로 무너졌다.**
   */
  spShare = 0.45,
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
  // ⚠ **`empty`를 `count`로 잘라 봤으나 더 나빠졌다**(2026-08-25 · 3회 측정).
  //    `batShort`가 커지면 `batQuota`가 `remain`을 더 먹고, 그만큼
  //    **투수 몫(`pitQuota`)과 백업 칸이 줄어** 포수가 밀린다.
  //    실측: 고교 통과 2/3 → 1/3.
  //    이 식은 **의도적으로 낙관적이다** — 공백이 채워질 걸 전제한다.
  const batShort = Math.max(0, minBatters - batters - empty.length);

  // ⚠ **둘 다 하한 미달이면 우선순위로 나누면 안 된다.** 앞쪽이 `count`를 다
  // 먹으면 뒤쪽이 굶는다. 고교는 한 해 정원이 10명뿐이라 이게 바로 드러났다 —
  // 같은 코드에서 실행마다 **고교 투수 미달이 ≤5팀 ↔ 76팀**으로 갈렸다.
  // 어느 쪽이 굶느냐가 그때그때 로스터 상태에 달렸기 때문이다.
  //
  // 공백(①)을 뺀 나머지를 **부족분에 비례해** 나눈다. 둘 다 모자라면
  // 둘 다 조금씩 채우고, 남으면 백업(④)으로 간다.
  const remain = Math.max(0, count - empty.length);
  const need = batShort + pitShort;
  const batQuota = need === 0 ? 0
    : Math.min(batShort, Math.round((remain * batShort) / need));
  const pitQuota = Math.min(pitShort, Math.max(0, remain - batQuota));

  const out: string[] = [];
  const push = (v: string) => { if (out.length < count) out.push(v); };

  for (const pos of empty) push(pos);
  // 총원이 모자라면 **제일 얇은 자리부터** 채운다 — 한 자리에 몰아주지 않는다
  const thin = [...FIELD_POSITIONS].sort((a, b) => (cnt[a] ?? 0) - (cnt[b] ?? 0));
  for (let i = 0; i < batQuota; i++) push(thin[i % thin.length]);
  // 투수는 선발 우선 — 로테이션이 먼저 돌아야 경기가 성립한다
  // 선발 비중대로 섞는다 — 앞에서부터 spShare만큼 선발
  const spOf = (idx: number, n: number) => idx < Math.round(n * spShare) ? "SP" : "RP";
  for (let i = 0; i < pitQuota; i++) push(spOf(i, pitQuota));

  // ── 남은 칸: 비율을 **여기서 직접 지킨다** ─────────────────────
  //
  // ⚠ 두 번 틀렸다.
  //
  //   1차 — 백업 자리(전부 야수)로 남은 칸을 다 채웠다. 그러면 생성기의
  //         폴백(투수 45%)이 돌 여지가 없다. 실측 고교 신입생 1,020명 중
  //         **지정 613칸이 전부 야수**였고 실제 투수는 161명(15.8%)이었다.
  //   2차 — 그래서 백업을 아예 뺐다. 이번엔 **포수가 사라졌다**(8~11팀).
  //         `empty`(①)는 자리가 0이 된 **뒤에야** 도는데, 백업이 바로
  //         그 전에 채워 넣는 장치였다 — 포수는 8분의 1이라 신입생 8명이면
  //         0명일 확률이 34%다.
  //
  // 폴백에 비율을 맡기는 것 자체가 틀렸다. **지정 리스트가 비율을 지키고**
  // 백업도 같이 채운다 — 난수에 기대지 않으니 팀별 편차도 없다.
  const rest = Math.max(0, count - out.length);
  const restPit = Math.round(rest * pitcherRatio);
  let bi = 0;
  for (let i = 0; i < rest; i++) {
    if (i < restPit) { push(spOf(i, restPit)); continue; }
    // 백업 없는 자리 → 그것도 다 차면 제일 얇은 자리
    push(backup[bi] ?? thin[bi % thin.length]);
    bi++;
  }
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
/**
 * ⚠ **인자를 객체로 받는다.** 예전엔 위치 인자 10개였고, 호출부가
 * `rotIdx`를 **`teamGameCount` 자리에** 넣고 있었다:
 *
 *   정의  (..., currentWeek, teamGameCount, leagueId, rotationSense, ...)
 *   호출  (..., week,        homeRotIdx,    leagueId, homeHandlePersonnel)
 *
 * 타입이 둘 다 number라 조용히 통과했고, `getTeamRotation`은 그 값을
 * `void gameCount;`로 버렸다. **로테이션 인덱스는 저장되고 갱신되고
 * 다음 경기로 넘어갔지만 쓰이는 자리가 없었다** — 그래서 배선을 따라가도
 * 전부 정상으로 보였다.
 *
 * 결과: 매 경기 `rotation[0]`(OVR 1위)이 선발로 나갔다. 실측에서 한 투수가
 * 시즌 **186이닝 · 36등판**(팀 공식경기 거의 전부)을 던졌고, 나머지 투수는
 * 연습경기에만 나와 리그 이닝 중앙이 3.3이었다.
 */
export interface BuildRosterParams {
  teamId: string;
  entities: EntityRow[];
  npcInjuries?: Record<string, NpcInjuryEntry>;
  maxRotation?: number;
  conditions?: Record<string, PlayerCondition>;
  currentWeek?: number;
  /** 팀이 지금까지 치른 경기 수 (휴식 판정용) */
  teamGameCount?: number;
  /** **이번 경기 선발이 로테이션 몇 번째인가.** 경기마다 +1 */
  rotIdx?: number;
  leagueId?: string;
  rotationSense?: number;
  npcRetired?: string[];
}

export function buildTeamRoster(p: BuildRosterParams): TeamRoster {
  const {
    teamId, entities, npcInjuries, maxRotation = 5, conditions,
    currentWeek = 0, teamGameCount = 0, rotIdx = 0,
    leagueId = "", rotationSense = 50, npcRetired,
  } = p;

  const base = getTeamRotation(
    teamId, entities, npcInjuries, maxRotation, conditions, currentWeek,
    teamGameCount, leagueId, npcRetired,
  );

  // ⚠ **여기가 인덱스를 실제로 쓰는 유일한 자리다.** `getTeamRotation`은
  // OVR 순으로 고정된 명단을 돌려준다(그건 의도다 — 매주 흔들리면 표본이
  // 얇아져 ERA가 능력치를 못 따라간다). 그 명단을 **경기마다 회전시켜야**
  // 선발이 돌아간다. 회전을 안 하면 1번이 매 경기 나간다.
  const rotation = base.length > 0
    ? [...base.slice(rotIdx % base.length), ...base.slice(0, rotIdx % base.length)]
    : base;

  const { bullpen, closer } = getTeamBullpen(teamId, entities, rotation, npcInjuries, conditions, teamGameCount, rotationSense, npcRetired);
  const lineup = getTeamLineup(teamId, entities, npcInjuries, conditions, currentWeek, teamGameCount, rotationSense, npcRetired);
  return { rotation, bullpen, closer, lineup };
}
