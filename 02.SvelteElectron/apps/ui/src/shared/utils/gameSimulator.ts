import { seedFrom } from "./hash";
import { toEngineArsenal } from "./arsenal";
import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type { NpcInjuryEntry } from "../types/save";
import type { MatchResult, NpcLiveStat, PlayerCondition } from "../types/season";
import { buildTeamRoster, getTeamBullpen, getTeamRotation, rotationSizeForLeague, starterOfRotation } from "./rosterEngine";

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
  /** 도루 저지 — 수비 팀에서 포수를 찾는 데 쓴다 */
  position: string; arm: number;
  /** 🔴 **수비 능력.** 예전엔 없어서 리그 경기가 컨택·주력으로 대용값을
   *  만들었다 — 팀마다 수비가 사실상 같았다 (2026-08-29) */
  fielding: number;
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
    // 🔴 **포수 도루 저지.** 수비 팀 라인업에서 포수를 찾아 `arm`을 쓴다 —
    //    안 넘기면 엔진이 중립(50)으로 보고 어깨 좋은 포수를 두는 뜻이 없어진다.
    //    바로 위 `speed`·`baseInstinct`가 정확히 같은 이유로 빠져 있던 전례가 있다.
    position: (e.details.player as EntityPlayerDetails).position ?? "",
    arm:      b?.arm ?? 50,
    // ⚠ 안 실으면 리그 경기 수비가 전 팀 50 고정으로 돌아간다
    fielding: b?.fielding ?? 50,
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
  // 🔴 **손으로 색인하지 않는다** — 이 자리가 실제로 던진 투수와 어긋나 있었다.
  //   실측: 선발로 적힌 투수가 실제로 던진 비율 **42.6% → 99.2%**
  const homeSpId = starterOfRotation(homeRotation, homeRotIdx);
  const awaySpId = starterOfRotation(awayRotation, awayRotIdx);
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
    /** 세계 씨앗 — 이게 있어야 같은 세이브가 같은 경기를 낸다(재현성).
     *  안 주면 예전 그대로 매번 다른 결과다 */
    worldSeed?: number;
    /** 일정 id — 같은 주에 같은 카드가 두 번 있으면 씨앗이 겹친다 */
    scheduleId?: string;
    /**
     * 이 경기의 시즌 페이즈. **`"season"`일 때만 무승부가 난다.**
     *
     * 🔴 대회·포스트시즌은 **승자가 나와야 한다** — 대진이 다음 라운드로
     *   못 넘어간다. 안 넘기면 무제한(예전 동작)이라 조용히 안전하다.
     */
    phase?: import("../types/season").SeasonPhase;
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
    worldSeed,
    scheduleId,
    phase,
  } = options ?? {};

  const entityMap = new Map(entities.map((e) => [e.id, e]));

  // ⚠ **`rotIdx`와 `teamGameCount`는 다른 것이다.** 예전엔 위치 인자라
  // `homeRotIdx`가 `teamGameCount` 자리로 들어갔고, 그 안에서 버려졌다 —
  // 로테이션이 한 번도 안 돌아 매 경기 1번 투수가 선발이었다
  const homeRoster = buildTeamRoster({
    teamId: homeTeamId, entities, npcInjuries, maxRotation: rotationSize,
    conditions, currentWeek: week, leagueId,
    rotationSense: homeHandlePersonnel,
  });
  const awayRoster = buildTeamRoster({
    teamId: awayTeamId, entities, npcInjuries, maxRotation: rotationSize,
    conditions, currentWeek: week, leagueId,
    rotationSense: awayHandlePersonnel,
  });

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
    // 🔴 **연장 상한** — 정규시즌만 건다. 0이면 무제한(승부가 날 때까지).
    //   예전엔 이 값이 없어 **무승부가 구조상 안 나왔다.**
    extraInningLimit: phase === "season" ? EXTRA_INNING_LIMIT : 0,
    homeTeamId,
    awayTeamId,
    worldSeed,
    scheduleId,
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
/**
 * 연장 상한 (KBO 규정). 이 회를 넘기고도 동점이면 무승부다.
 *
 * ⚠ 정규시즌에만 건다 — 대회·포스트시즌은 승자가 나와야 한다.
 */
export const EXTRA_INNING_LIMIT = 12;

export const FULL_ENGINE_LEAGUES = new Set<string>([
  "LEAGUE_HIGHSCHOOL",   // C-4 검증 완료 (ERA 3.86 · 이닝 47.3)
  "LEAGUE_UNIVERSITY",   // C-5
  "LEAGUE_INDEPENDENT",  // C-5 (검증 완료)
  // 프로 — 5인 로테이션이라 교체 로직이 더 무겁게 돈다
  "LEAGUE_KBL",
  "LEAGUE_KBL_FARM",
  "LEAGUE_ABL",
  "LEAGUE_JBL",
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
/**
 * 리그 경기의 수비진.
 *
 * 🔴 **예전엔 신원도 능력도 없었다** (2026-08-29):
 *   `name`이 **포지션 문자열**("SS")이었고 `fielding`은 컨택·주력에서
 *   만든 **대용값**이었다. 그래서 (a) 실책을 선수에게 달 수 없었고
 *   (b) 수비가 팀마다 사실상 같았다.
 *
 * ⚠ **주인공 경기는 이미 실제 수비수를 넘긴다**(`buildFielders`) —
 *   두 경로가 **다른 수준으로 돌고 있었다.** 이걸 맞춘다.
 * ⚠ 그래서 **밸런스가 움직인다** — 수비 좋은 팀과 나쁜 팀이 갈린다.
 *   실측은 커밋에 남긴다(사용자 확정: 멈추지 않고 진행).
 */
function buildFieldersFromLineup(lineup: SimBatter[]): Record<string, unknown>[] {
  const pos = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  return pos.map((p, i) => {
    const b = lineup[i % Math.max(1, lineup.length)];
    // ⚠ 타순은 수비 위치가 아니다 — 라인업 순서로 자리를 채우는 건 근사다.
    //   `SimBatter`가 포지션을 안 들고 있어서 지금은 이게 최선이다.
    return {
      position: p,
      playerId: b?.id ?? "",
      name: b?.id ?? p,
      // 🔴 **실제 수비 능력을 쓴다.** 컨택 대용이 아니다
      fielding: b?.fielding ?? 50,
      arm: b?.arm ?? 50,
      speed: b?.speed ?? 50,
      x: _FIELD_XY[p].x, y: _FIELD_XY[p].y,
    };
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
  // 🔴 **`slice(0, 1)`이었다.** 명단이 이미 돌려진 걸 전제한 코드였는데,
  //   `npc_sim`·`mergeConditions`는 같은 명단을 `rotIdx`로 또 색인했다.
  //   이제 명단은 **순서 그대로** 오고 색인은 `starterOfRotation` 하나가 한다.
  const starterOf = (rot: any[], idx: number) => {
    const id = starterOfRotation(rot.map((x: any) => x.id), idx);
    const hit = rot.find((x: any) => x.id === id);
    return hit ? [hit] : [];
  };
  // 🔴 **마무리를 불펜에서 뺀다.** `getTeamBullpen`이 마무리를 불펜 목록에도
  //   같이 넣어 준다(그건 의도다 — 다른 호출부가 전체 불펜을 본다). 그대로
  //   큐에 실으면 **마무리가 점수순 정렬에서 대개 맨 앞이라 6~7회에 소모되고
  //   9회에 남아 있지 않다.** `npc_sim::build_pit_queue`는 이걸 걸러내는데
  //   이 경로만 안 걸러냈다 — **고친 곳이 둘인데 하나만이었다.**
  const queueOf = (rot: any[], idx: number, bullpen: any[], closer: any) => {
    const closerId = closer?.id;
    const seen = new Set<string>();
    const push = (arr: any[], x: any) => {
      if (!x || seen.has(x.id)) return;
      seen.add(x.id); arr.push(x);
    };
    const out: any[] = [];
    for (const x of starterOf(rot, idx)) push(out, x);
    for (const x of bullpen) { if (x?.id !== closerId) push(out, x); }
    push(out, closer);
    return out;
  };
  const homePitchers = queueOf(params.homeRotation, params.homeRotIdx ?? 0,
                               params.homeBullpen, params.homeCloser).map(toEnginePitcher);
  const awayPitchers = queueOf(params.awayRotation, params.awayRotIdx ?? 0,
                               params.awayBullpen, params.awayCloser).map(toEnginePitcher);

  // 씨앗 — **같은 세이브·같은 주의 같은 경기는 늘 같은 값**이어야 한다.
  // 그래야 세이브를 다시 열어도 지난 주 순위표가 안 바뀐다.
  //
  // ⚠ **`Date.now()`나 호출 순서에 기대면 안 된다** — 그러면 재현이 깨진다.
  // ⚠ 같은 주에 같은 카드가 두 번 있으면(더블헤더·대회) 씨앗이 겹치므로
  //    일정 id를 받으면 같이 섞는다.
  // ⚠ **`worldSeed`를 안 넘기면 씨앗 없이 돈다**(예전 그대로). 넘겼는지는
  //    `matchSeedWiring.test.ts`가 호출부마다 본다
  const seed = params.worldSeed === undefined
    ? undefined
    : seedFrom(`${params.worldSeed}:${params.week}:${params.homeTeamId}:`
      + `${params.awayTeamId}:${params.scheduleId ?? ""}`);

  const startRaw = await engineCall("startMatchNative", JSON.stringify({
    leagueId,
    // ⚠ 여기 안 넘기면 풀 엔진 경기만 무승부가 안 난다 — 리그마다 규칙이 갈린다
    extraInningLimit: params.extraInningLimit ?? 0,
    ...(seed === undefined ? {} : { seed }),
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
    // 🔴 **원정 수비가 없었다** (2026-08-29). 안 넘기면 홈 9명이 **양 팀 이닝을
    //   다 지킨다** — 수비 기록이 홈 선수에게 몰리고 원정 타자는 홈 수비를 만난다
    opponentFielders: buildFieldersFromLineup(params.awayLineup),
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
