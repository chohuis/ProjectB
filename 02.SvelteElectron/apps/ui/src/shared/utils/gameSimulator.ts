import { toEngineArsenal } from "./arsenal";
import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type { NpcInjuryEntry } from "../types/save";
import type { MatchResult, NpcLiveStat, PlayerCondition } from "../types/season";
import { buildTeamRoster, getTeamBullpen, getTeamRotation, rotationRestGames, rotationSizeForLeague } from "./rosterEngine";

// ── 반환 타입 ─────────────────────────────────────────────────
export interface SimGameResult {
  result: MatchResult;
  nextHomeRotIdx: number;
  nextAwayRotIdx: number;
  pitcherConditions: Record<string, PlayerCondition>;
}

// ── IPC 헬퍼 ─────────────────────────────────────────────────
const api = () => (window as unknown as { projectB: Record<string, (p: string) => Promise<string>> }).projectB;

function parseResult<T>(json: string): T {
  const v = JSON.parse(json) as { error?: string } & T;
  if (v && typeof v === "object" && "error" in v) throw new Error(String((v as { error: string }).error));
  return v as T;
}

// ── EntityRow → SimPitcher / SimBatter 변환 ──────────────────
// ⚠ **능력치를 골라 담는 자리다.** 여기 빠뜨린 값은 리그 경기에서 존재하지
// 않는 것과 같다 — `clutch`·`mentality`·`battingClutch`가 생성·저장까지 되면서
// 이 조립부에서만 빠져 있었고, 그래서 **주인공 경기에만 위기 보정이 있었다.**
//
// 같은 일이 도루에서 또 났다. `speed`·`baseInstinct`·`holdRunners`가 전부
// 있는데 여기서 안 담겨서 **리그 전체 도루가 0**이었다(규정타석 97~102명 전원).
// 능력치를 추가하면 이 조립부부터 확인할 것.
interface SimPitcher {
  id: string; velocity: number; movement: number; command: number;
  control: number; stamina: number; clutch: number; mentality: number;
  holdRunners: number;
  /** 보유 구종 (C-4). npc_sim은 안 쓰지만 풀 엔진이 쓴다 — 없으면 패스트볼 하나가 된다 */
  arsenal?: { type: string; grade: number }[];
}
interface SimBatter {
  id: string; contact: number; power: number; eye: number;
  discipline: number; battingClutch: number;
  speed: number; baseInstinct: number;
}

function toSimPitcher(
  id: string,
  entityMap: Map<string, EntityRow>,
  npcLiveStats?: Record<string, NpcLiveStat>,
  adaptFactor?: number,
): SimPitcher | null {
  const e = entityMap.get(id);
  if (!e) return null;
  const live = npcLiveStats?.[id];
  const p = live?.pitching ?? (e.details.player as EntityPlayerDetails).pitching;
  const f = adaptFactor ?? 1;
  return {
    id,
    velocity:  Math.round((p?.velocity  ?? 50) * f),
    movement:  Math.round((p?.movement  ?? 50) * f),
    command:   Math.round((p?.command   ?? 50) * f),
    control:   Math.round((p?.control   ?? 50) * f),
    stamina:   Math.round((p?.stamina   ?? 50) * f),
    // 위기 보정은 상황이 정하는 축이라 컨디션 계수(f)를 곱하지 않는다
    clutch:    p?.clutch    ?? 50,
    mentality: p?.mentality ?? 50,
    // 견제력 — 도루 시도를 누른다. 안 넘기면 엔진이 50(무보정)으로 본다
    holdRunners: p?.holdRunners ?? 50,
    // ⚠ **구종을 싣는다.** 안 실으면 풀 엔진에서 전원 패스트볼 하나가 되고,
    // 구종 1개 페널티(ERA 2배)를 리그 전체가 먹는다
    arsenal: toEngineArsenal(live?.pitches ?? []),
  };
}

function toSimBatter(
  id: string,
  entityMap: Map<string, EntityRow>,
  npcLiveStats?: Record<string, NpcLiveStat>,
): SimBatter | null {
  const e = entityMap.get(id);
  if (!e) return null;
  const live = npcLiveStats?.[id];
  const b = live?.batting ?? (e.details.player as EntityPlayerDetails).batting;
  return {
    id,
    contact:    b?.contact    ?? 50,
    power:      b?.power      ?? 50,
    eye:        b?.eye        ?? 50,
    discipline: b?.discipline ?? 50,
    battingClutch: b?.battingClutch ?? 50,
    // ⚠ **이 둘을 안 넘기면 도루가 거의 안 나온다.** 엔진이 없으면 50으로 보고,
    // 50은 시도 확률이 바닥이다. 능력치는 처음부터 있었는데 전달만 빠져 있었다
    speed:        b?.speed        ?? 50,
    baseInstinct: b?.baseInstinct ?? 50,
  };
}

// ── Rust 반환 컨디션과 TS 추적 필드 머지 ──────────────────────
// Rust는 fatigue/lastPitchedWeek/pitchOutsLast만 반환.
// TS 전용 필드(lastStartGameCount, lastAppearanceGameCount, consecutiveAppearances)는
// 여기서 머지해서 완성된 PlayerCondition을 만든다.
function mergeConditions(
  rustConditions: Record<string, { fatigue: number; lastPitchedWeek: number; pitchOutsLast: number }>,
  prevConditions: Record<string, PlayerCondition>,
  homeRotation: string[],
  awayRotation: string[],
  homeBullpen: string[],
  awayBullpen: string[],
  homeRotIdx: number,
  awayRotIdx: number,
  leagueId: string,
): Record<string, PlayerCondition> {
  const result: Record<string, PlayerCondition> = {};
  const homeSpId = homeRotation[homeRotIdx % Math.max(1, homeRotation.length)];
  const awaySpId = awayRotation[awayRotIdx % Math.max(1, awayRotation.length)];
  const appearedIds = new Set(Object.keys(rustConditions));

  for (const [id, rustCond] of Object.entries(rustConditions)) {
    const prev = prevConditions[id];
    const isSp = id === homeSpId || id === awaySpId;
    const currentGameCount = id === homeSpId || homeBullpen.includes(id)
      ? homeRotIdx
      : awayRotIdx;

    if (isSp) {
      // SP: lastStartGameCount 업데이트, consecutiveAppearances 리셋
      result[id] = {
        fatigue:            rustCond.fatigue,
        lastPitchedWeek:    rustCond.lastPitchedWeek,
        pitchOutsLast:      rustCond.pitchOutsLast,
        lastStartGameCount: currentGameCount,
        lastAppearanceGameCount: prev?.lastAppearanceGameCount,
        consecutiveAppearances:  0,
      };
    } else {
      // RP/CP: consecutiveAppearances 증가
      const prevCount = prev?.lastAppearanceGameCount ?? -99;
      const wasConsecutive = prevCount === currentGameCount - 1;
      result[id] = {
        fatigue:                 rustCond.fatigue,
        lastPitchedWeek:         rustCond.lastPitchedWeek,
        pitchOutsLast:           rustCond.pitchOutsLast,
        lastStartGameCount:      prev?.lastStartGameCount,
        lastAppearanceGameCount: currentGameCount,
        consecutiveAppearances:  wasConsecutive
          ? (prev?.consecutiveAppearances ?? 0) + 1
          : 1,
      };
    }
  }

  // 미출전 불펜 → consecutiveAppearances 리셋
  const allBullpenIds = [...homeBullpen, ...awayBullpen];
  for (const id of allBullpenIds) {
    if (appearedIds.has(id)) continue;
    const prev = prevConditions[id];
    if (!prev) continue;
    result[id] = { ...prev, consecutiveAppearances: 0 };
  }

  // 리그별 SP 휴식 검증 (미등판 SP 컨디션은 건드리지 않음)
  void leagueId;  // 현재 참조용, 추후 제한 로직에 활용 가능

  return result;
}

// ── 풀게임 시뮬레이션 (Rust DLL 위임) ──────────────────────
export async function simulateGame(
  homeTeamId: string,
  awayTeamId: string,
  entities:   EntityRow[],
  options?: {
    conditions?:     Record<string, PlayerCondition>;
    homeRotIdx?:     number;
    awayRotIdx?:     number;
    week?:           number;
    npcInjuries?:    Record<string, NpcInjuryEntry>;
    rotationSize?:   number;
    npcLiveStats?:   Record<string, NpcLiveStat>;
    leagueId?:       string;
    homeHandlePersonnel?: number;
    awayHandlePersonnel?: number;
    tradeAdaptationPenalty?: { playerId: string; factor: number };
  },
): Promise<SimGameResult> {
  const {
    conditions = {},
    homeRotIdx = 0,
    awayRotIdx = 0,
    week = 0,
    npcInjuries,
    rotationSize = 5,
    npcLiveStats,
    leagueId = "",
    homeHandlePersonnel = 50,
    awayHandlePersonnel = 50,
    tradeAdaptationPenalty,
  } = options ?? {};

  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const homeRoster = buildTeamRoster(homeTeamId, entities, npcInjuries, rotationSize, conditions, week, homeRotIdx, leagueId, homeHandlePersonnel);
  const awayRoster = buildTeamRoster(awayTeamId, entities, npcInjuries, rotationSize, conditions, week, awayRotIdx, leagueId, awayHandlePersonnel);

  const toSimPitchers = (ids: string[]) => ids.map(id => {
    const factor = tradeAdaptationPenalty && id === tradeAdaptationPenalty.playerId
      ? tradeAdaptationPenalty.factor : undefined;
    return toSimPitcher(id, entityMap, npcLiveStats, factor);
  }).filter(Boolean) as SimPitcher[];
  const toSimBatters  = (ids: string[]) => ids.map(id => toSimBatter(id, entityMap, npcLiveStats)).filter(Boolean)  as SimBatter[];

  const params = {
    homeRotation: toSimPitchers(homeRoster.rotation),
    awayRotation: toSimPitchers(awayRoster.rotation),
    homeBullpen:  toSimPitchers(homeRoster.bullpen),
    awayBullpen:  toSimPitchers(awayRoster.bullpen),
    homeCloser:   homeRoster.closer ? toSimPitcher(homeRoster.closer, entityMap) : null,
    awayCloser:   awayRoster.closer ? toSimPitcher(awayRoster.closer, entityMap) : null,
    homeLineup:   toSimBatters(homeRoster.lineup),
    awayLineup:   toSimBatters(awayRoster.lineup),
    homeRotIdx,
    awayRotIdx,
    conditions,
    week,
    homeTeamId,
    awayTeamId,
  };

  // ── C-4: 리그별 엔진 선택 ────────────────────────────────────────
  //
  // 통합은 **리그 하나씩** 넓힌다. 성능이나 성적이 예상과 다르면 그 리그만
  // 되돌린다 — 전부 한 번에 바꾸면 어디서 어긋났는지 못 찾는다.
  //
  // 새 경로는 주인공 경기와 **같은 엔진**(match_engine)을 쓴다. 구종·수비·
  // 로케이션이 전부 반영되고, 두 저울이 하나가 된다.
  const json = FULL_ENGINE_LEAGUES.has(leagueId)
    ? await simulateWithMatchEngine(params, leagueId)
    : await api().npcSimGame(JSON.stringify(params));
  const raw  = parseResult<{
    result: MatchResult;
    nextHomeRotIdx: number;
    nextAwayRotIdx: number;
    pitcherConditions: Record<string, { fatigue: number; lastPitchedWeek: number; pitchOutsLast: number }>;
  }>(json);

  // Rust 반환 컨디션에 TS 추적 필드 머지
  const pitcherConditions = mergeConditions(
    raw.pitcherConditions,
    conditions,
    homeRoster.rotation,
    awayRoster.rotation,
    homeRoster.bullpen,
    awayRoster.bullpen,
    homeRotIdx,
    awayRotIdx,
    leagueId,
  );

  return {
    result:            raw.result,
    nextHomeRotIdx:    raw.nextHomeRotIdx,
    nextAwayRotIdx:    raw.nextAwayRotIdx,
    pitcherConditions,
  };
}


/** `engine:call` 단일 채널 — `api()`는 인자 하나짜리 브릿지라 타입이 다르다 */
const engineCall = (fn: string, payload: string): Promise<string> =>
  (window as unknown as { projectB: { engine: (f: string, p: string) => Promise<string> } }).projectB.engine(fn, payload);

// ── C-4: 풀 엔진 전환 ─────────────────────────────────────────────
//
// **이 Set 하나가 스위치다.** 리그를 넣으면 그 리그가 주인공과 같은 엔진으로
// 돌고, 빼면 즉시 예전으로 돌아간다. 되돌림 지점을 코드에 남겨 둔다.
//
// 비용 근거: 주인공 엔진 투구당 31µs · 고교 리그 주당 32경기 → 약 136ms.
// 주간 처리 14초의 1% 수준이다(그 대부분은 저장·성장·이벤트다).
// ⚠ **지금은 비어 있다 — 전환을 되돌렸다.** C-4 실측(2026-08-11)에서
// OVR–ERA 상관이 **뒤집혔다**:
//
//   전환 전  60~ 4.23 → 65~ 3.67 → 70~ 3.36 → 75~ 3.32  (잘할수록 좋다)
//   전환 후  60~ 3.64 → 65~ 4.06 → 70~ 4.13 → 75~ 4.57  (잘할수록 나쁘다)
//
// 능력치가 높을수록 ERA가 나빠지면 육성·드래프트·수상이 전부 거꾸로 돈다.
// 성능은 문제없었다(주당 +153ms, 예상 136ms와 일치).
export const FULL_ENGINE_LEAGUES = new Set<string>([
  "LEAGUE_HIGHSCHOOL",
]);

/** SimPitcher → 엔진이 받는 PartialPitcherStats */
function toEnginePitcher(p: SimPitcher): Record<string, unknown> {
  return {
    name: p.id,                       // 기록이 id로 돌아와야 순위표에 붙는다
    command: p.command, velocity: p.velocity,
    staminaCap: p.stamina, mentalResil: p.mentality ?? 50,
    control: p.control, movement: p.movement,
    clutch: p.clutch ?? 50, holdRunners: p.holdRunners ?? 50,
    arsenal: p.arsenal,
  };
}

/** 타순에서 수비 9인을 만든다 — 좌표는 화면()과 같은 값 */
const _FIELD_XY: Record<string, { x: number; y: number }> = {
  P: { x: 50, y: 62 }, C: { x: 50, y: 90 }, "1B": { x: 78, y: 70 }, "2B": { x: 63, y: 55 },
  "3B": { x: 22, y: 70 }, SS: { x: 37, y: 55 }, LF: { x: 18, y: 28 }, CF: { x: 50, y: 16 }, RF: { x: 82, y: 28 },
};
function buildFieldersFromLineup(lineup: SimBatter[]): Record<string, unknown>[] {
  const pos = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  return pos.map((p, i) => {
    const b = lineup[i % Math.max(1, lineup.length)];
    // SimBatter엔 수비 능력이 없다 — 컨택을 대용으로 쓴다(리그 평균 수준을 만든다)
    const lvl = b ? Math.round((b.contact + b.speed) / 2) : 50;
    return { position: p, name: p, fielding: lvl, arm: lvl, speed: b?.speed ?? 50,
             x: _FIELD_XY[p].x, y: _FIELD_XY[p].y };
  });
}

/** SimBatter → 엔진이 받는 BatterStats */
function toEngineBatter(b: SimBatter): Record<string, unknown> {
  return {
    id: b.id, name: b.id,
    contact: b.contact, power: b.power, eye: b.eye, discipline: b.discipline,
    battingClutch: b.battingClutch ?? 50, platoon: 50,
    speed: b.speed, baseInstinct: b.baseInstinct ?? 50,
    // SimBatter엔 수비 필드가 없다 — 엔진 기본값을 쓴다
    fielding: 50, arm: 50,
  };
}

/**
 * 리그 경기를 주인공 엔진으로 돌린다 (C-4).
 *
 * ⚠ **주인공이 없는 경기다.** `protagonistSide`는 기록 대상을 정할 뿐이고,
 * 여기서는 양쪽 다 NPC라 큐 두 개로 전부 처리된다.
 */
async function simulateWithMatchEngine(params: any, leagueId: string): Promise<string> {
  const homePitchers = [...params.homeRotation.slice(0, 1), ...params.homeBullpen,
                        ...(params.homeCloser ? [params.homeCloser] : [])].map(toEnginePitcher);
  const awayPitchers = [...params.awayRotation.slice(0, 1), ...params.awayBullpen,
                        ...(params.awayCloser ? [params.awayCloser] : [])].map(toEnginePitcher);

  const startRaw = await engineCall("startMatchNative", JSON.stringify({
    leagueId,
    protagonistSide: "home",
    role: "SP",
    homeLineup: params.homeLineup.map(toEngineBatter),
    awayLineup: params.awayLineup.map(toEngineBatter),
    myPitchers: homePitchers,
    opponentPitchers: awayPitchers,
    // ⚠ **수비를 넘긴다.** 안 넘기면 엔진이 평균 50짜리를 만든다 —
    // 주인공 경기는 넘기는데 리그 경기만 안 넘기면 **같은 엔진인데 두 저울**이 된다.
    // 실측에서 수비 50 vs 66이 ERA 3점 차이였다.
    // 타순이 곧 수비 라인업이다(리그 시뮬은 포지션을 따로 안 들고 있다)
    fielders: buildFieldersFromLineup(params.homeLineup),
  }));
  const st = JSON.parse(startRaw);
  if (st.error) throw new Error(`[C-4] startMatch: ${st.error}`);

  const finRaw = await engineCall("simToGameEnd", startRaw);
  const fin = JSON.parse(finRaw);
  if (fin.error) throw new Error(`[C-4] simToGameEnd: ${fin.error}`);

  return await engineCall("matchToSimResultNative", JSON.stringify({
    state: fin,
    homeTeamId: params.homeTeamId, awayTeamId: params.awayTeamId,
    week: params.week, conditions: params.conditions,
    homeRotIdx: params.homeRotIdx, awayRotIdx: params.awayRotIdx,
  }));
}
