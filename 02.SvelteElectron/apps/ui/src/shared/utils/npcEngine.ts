import type { MessageItem } from "../types/main";
import type { NpcSaveState } from "../types/save";
import {
  buildRows, countByGroup, previewLine, type OffseasonEvent,
} from "./offseasonReport";
import { SANGMU_TEAM_IDS } from "./ids";

// ── 시즌 종료 요약 ────────────────────────────────────────────
export interface SeasonEndSummary {
  retiredCount: number;
  militaryEnlistedCount: number;
  militaryDischargedCount: number;
  faCount: number;
  /**
   * FA 계약 성사 · 미계약.
   *
   * 🔴 **`careerEvents`로는 못 잰다** — 이 둘은 `events` 채널로만 나간다.
   *   그래서 `careerEventTally`를 쓰던 프로브가 **늘 0**을 봤고,
   *   2026-08-26까지 "FA 미계약률 0%"로 잘못 기록돼 있었다(C-7).
   *   실측은 40%대다. 엔진이 세서 넘긴다.
   */
  faSignedCount?: number;
  faUnsignedCount?: number;
  univGraduatedCount: number;
}

// 팀/구단 ID 파생 규칙(팜 팀·구단→1군 등)은 utils/ids.ts 참조 — 하드코딩 맵 금지

/**
 * 팀당 유지 인원 상한 — **정본은 `generation_rules.json rosterRules`다.**
 *
 * 예전엔 여기와 Rust `roster_rule()`에 각각 표가 박혀 있었고 둘 다 규칙 파일과
 * 달랐다 (KBL 상한 65 vs 생성 인원 30). 그 65가 1군·2군 합산에 걸리는 바람에
 * 프로 소속이 700명까지 부풀었다.
 */
export interface RosterLimit { rosterMin?: number; rosterMax: number }

export function rosterLimitsFrom(
  rosterRules: Record<string, { rosterMin?: number; rosterMax?: number }>,
): Record<string, RosterLimit> {
  const out: Record<string, RosterLimit> = {};
  for (const [leagueId, r] of Object.entries(rosterRules)) {
    if (typeof r?.rosterMax !== "number") continue;
    out[leagueId] = { rosterMin: r.rosterMin, rosterMax: r.rosterMax };
  }
  return out;
}

/**
 * 외국인 판정에 필요한 두 표. **정본은 규칙 파일이고 여기서 파생만 한다.**
 *
 * ⚠ 자국 국적을 빼먹으면 Rust가 전부 KOR로 읽어 ABL(USA)·JBL(JPN) 로스터
 * 전원이 외국인이 된다 — 그 리그 FA가 통째로 멎는다.
 */
export function foreignParamsFrom(rulesFile: {
  foreignRules?: { leagues?: string[]; perTeam?: number; maxPitchers?: number };
  rosterRules?: Record<string, { nationality?: string }>;
}): {
  foreignLeagues: string[];
  homeNationality: Record<string, string>;
  foreignPerTeam?: number;
  foreignMaxPitchers?: number;
} {
  const homeNationality: Record<string, string> = {};
  for (const [lid, r] of Object.entries(rulesFile.rosterRules ?? {})) {
    homeNationality[lid] = r?.nationality ?? "KOR";
  }
  // 🔴 **보유 한도를 안 넘기면 FA 재배치가 정원만 보고 붙인다.** 그래서
  // ABL·JBL 출신 FA가 KBL 팀에 쌓였다 — 실측 총원 113명(규칙대로면 30).
  // 한도는 `foreignRules`가 정본이고 여기선 그대로 넘기기만 한다.
  return {
    foreignLeagues: rulesFile.foreignRules?.leagues ?? [],
    homeNationality,
    ...(rulesFile.foreignRules?.perTeam !== undefined
      ? { foreignPerTeam: rulesFile.foreignRules.perTeam } : {}),
    ...(rulesFile.foreignRules?.maxPitchers !== undefined
      ? { foreignMaxPitchers: rulesFile.foreignRules.maxPitchers } : {}),
  };
}

export function clampStat(v: number): number {
  return Math.max(1, Math.min(99, Math.round(v)));
}

// npcCoreOvr는 제거됐다 — `npcs[].pitching`(생성값)을 읽어서 성장을 못 봤고,
// 호출하는 데도 없었다. **지금 OVR이 필요하면 `liveOvrOf`**(stores/npcLiveStats)를 쓴다

// ── IPC 헬퍼 ─────────────────────────────────────────────────
const api = () => (window as unknown as { projectB: Record<string, (p: string) => Promise<string>> }).projectB;

function parseResult<T>(json: string): T {
  const v = JSON.parse(json) as { error?: string } & T;
  if (v && typeof v === "object" && "error" in v) throw new Error(String((v as { error: string }).error));
  return v as T;
}

// ── 오프시즌 결과 ─────────────────────────────────────────────
export interface OffseasonResult {
  npcs: NpcSaveState[];
  pendingDraft: NpcSaveState[];
  summary: SeasonEndSummary;
  logs: string[];
  mailboxEntry: MessageItem | null;
}

// ── 오프시즌 전체 처리 (Rust DLL 위임) ──────────────────────
export async function runOffseasonProcessing(
  npcs: NpcSaveState[],
  pendingDraft: NpcSaveState[],
  seasonYear: number,
  namedNpcIds?: string[],
  /** 규칙 파일의 상한. 안 넘기면 Rust에 상한이 없어 로스터가 무한히 부푼다 */
  rosterLimits?: Record<string, RosterLimit>,
  salaryRules?: unknown,
  /**
   * 방출·FA 미계약자가 갈 곳. **안 넘기면 그 사람들이 전부 은퇴 처리된다** —
   * 22세 신인이 방출 한 번에 야구를 그만두게 된다
   */
  placement?: {
    universityTeamIds: string[];
    independentTeamIds: string[];
    /** 프로 2군 — 방출자·미계약 FA가 갈 첫 자리 */
    farmTeamIds?: string[];
    rules: import("./draftSystem").PlacementRules;
  },
  /**
   * 방출 2단계 (faRules.release). 안 넘기면 1단계(정원 초과)만 돈다 —
   * 그러면 부진한 고연봉 베테랑이 정원 안에서 계속 버틴다
   */
  releaseRules?: unknown,
  /**
   * 웨이버 공시 (`waiverRules`). 방출된 선수를 다른 구단이 데려간다.
   * ⚠ **안 넘기면 갈래가 통째로 꺼진다** — `serde(default)` 라 Rust 는
   *   조용히 통과하고 방출자가 곧장 시장으로 간다.
   */
  waiverRules?: unknown,
  /** FA 미계약자의 독립 재도전 나이 상한 (`faRules.independentAgeMax`).
   *  ⚠ 안 넘기면 갈래가 **통째로 꺼진다** — 미계약자가 바로 은퇴한다 */
  faIndependentAgeMax?: number,
  /**
   * 외국인 판정표 (`foreignParamsFrom`). 안 넘기면 외국인 개념이 없는 세계로
   * 돌아간다 — 용병이 FA를 취득하고 2군으로 강등되며 보유 한도가 깨진다
   */
  // ⚠ **타입을 좁게 적으면 새 필드가 조용히 잘린다.** `foreignPerTeam`을
  // 추가했는데 여기서 빠져 Rust까지 못 갔다 — 한도가 안 걸렸다.
  // `foreignParamsFrom`의 반환형을 그대로 받는다
  foreign?: ReturnType<typeof foreignParamsFrom>,
  /**
   * 🔴 **지금 능력치.** 안 넘기면 오프시즌 전체가 **생성 시점 값**으로 돈다.
   *
   * 성장은 `npcLiveStatsStore`에만 쌓이고 `NpcSaveState.pitching/batting`은
   * 로스터 생성 때 찍힌 값 그대로다(실측: live는 3년에 OVR ±9인데 npcs는 +0).
   * 그런데 Rust `npc_core_ovr`이 그 얼어붙은 값을 읽는다 — 은퇴·정원 정리·
   * 방출·FA·콜업 정렬 **22곳 전부**가 태어날 때 능력치로 판정하고 있었다.
   *
   * 그래서 서른다섯 살 노쇠한 선수가 스무 살 때 능력치로 평가받고,
   * 크게 자란 2군 선수가 신인 때 값으로 밀려났다.
   */
  liveStats?: Record<string, { pitching?: unknown; batting?: unknown }>,
  /**
   * 그해 성적 평점 (npcId → 0~100). 눈금 정본은 `market.calcNpcPerfScore`.
   * 안 넘기면 방출이 능력치로 판정한다 — 그게 예전 상태다.
   */
  perfScores?: Record<string, number>,
  /**
   * 구단 성향 (teamId → 12축). 안 넘기면 전 팀이 같은 방출 기준을 쓴다.
   * `eval_release_priority`의 stability·winNowPressure 갈래가 죽어 있었다.
   */
  teamProfiles?: Record<string, unknown>,
  /**
   * 🔴 **세계 씨앗.** 안 넘기면 0이라 모든 세계가 같은 오프시즌 전개를 낸다.
   *
   * 예전엔 엔진이 `thread_rng`을 써서 같은 세이브도 실행마다 달랐다 —
   * 계측을 한 번 돌려서 전후를 비교할 수 없었고 간헐 실패를 회귀와
   * 구분할 수 없었다. 결정적으로 바꾸면서 씨앗이 필요해졌다.
   */
  worldSeed?: number,
  /**
   * 팀별 연봉 상한(만원) + FA 입찰 임계값.
   *
   * 🔴 안 넘기면 FA 재배치가 **예전대로 아무 팀에나** 간다 — 구단이 원하는지
   * 얼마를 줄지가 없어 미계약이 0건이었다(실측 5시즌).
   */
  fa?: { teamPayrollCap: Record<string, number>; bidInterestMin: number; perfSpan?: number;
         renewPerfSpan?: number; bidFloorRatio?: number },
): Promise<OffseasonResult> {
  const namedFlags = new Map(npcs.map(n => [n.npcId, n.isNamed] as const));
  // ⚠ **엔진에 넘길 때만 합치고 돌아올 때 되돌린다.** 결과가 `s.npcs`를
  // 통째로 덮으므로, 안 되돌리면 "성장은 live에만 쌓인다"는 전제가 조용히
  // 깨진다. 그 전제는 `liveOvrOf`가 `Math.max(live, npcs)`로 읽는 근거다.
  const frozen = new Map<string, { pitching?: unknown; batting?: unknown }>();
  const withLive = liveStats
    ? npcs.map((n) => {
        const l = liveStats[n.npcId];
        if (!l || (!l.pitching && !l.batting)) return n;
        frozen.set(n.npcId, { pitching: n.pitching, batting: n.batting });
        return {
          ...n,
          pitching: (l.pitching ?? n.pitching) as typeof n.pitching,
          batting:  (l.batting  ?? n.batting)  as typeof n.batting,
        };
      })
    : npcs;
  const paramsJson = JSON.stringify({
    npcs: withLive, pendingDraft, seasonYear, namedNpcIds: namedNpcIds ?? [],
    rosterLimits: rosterLimits ?? {},
    ...(salaryRules ? { salaryRules } : {}),
    ...(placement ? {
      universityTeamIds: placement.universityTeamIds,
      independentTeamIds: placement.independentTeamIds,
      farmTeamIds: placement.farmTeamIds ?? [],
      placement: placement.rules,
    } : {}),
    ...(releaseRules ? { releaseRules } : {}),
    ...(waiverRules ? { waiverRules } : {}),
    // 🔴 **군팀은 웨이버 청구 대상이 아니다** (2026-08-31).
    //   `waiver_claim` 만 목적지 팀을 **NPC 소속에서 역산**하고,
    //   게다가 인원이 적은 팀부터 고른다 — 정원 26인 상무가 늘 1순위였다.
    //   상무의 비군인 전원이 `waiver_claim→IND_SANGMU_PHOENIX` 이었다.
    // ⚠ 안 넘기면 `serde(default)` 로 조용히 예전 동작이 된다.
    waiverExcludeTeams: [...SANGMU_TEAM_IDS],
    ...(faIndependentAgeMax != null ? { faIndependentAgeMax } : {}),
    worldSeed: (worldSeed ?? 0) >>> 0,
    ...(fa ? { teamPayrollCap: fa.teamPayrollCap, faBidInterestMin: fa.bidInterestMin,
               faPerfSpan: fa.perfSpan ?? 0,
               renewPerfSpan: fa.renewPerfSpan ?? 0,
               faBidFloorRatio: fa.bidFloorRatio ?? 0 } : {}),
    ...(perfScores   ? { perfScores }   : {}),
    ...(teamProfiles ? { teamProfiles } : {}),
    ...(foreign ?? {}),
  });
  const json = await api().npcRunOffseason(paramsJson);
  const raw = parseResult<{
    npcs: NpcSaveState[]; pendingDraft: NpcSaveState[];
    summary: SeasonEndSummary; logs: string[]; events?: OffseasonEvent[];
  }>(json);
  const rehydrate = (n: NpcSaveState): NpcSaveState => {
    // 넘길 때 합친 live 능력치를 원래대로 돌린다. **새로 생긴 사람은 건드리지
    // 않는다** — 용병 영입처럼 엔진이 만든 사람은 자기 값이 정본이다
    const back = frozen.get(n.npcId);
    return {
      ...n,
      ...(back ? { pitching: back.pitching as NpcSaveState["pitching"],
                   batting:  back.batting  as NpcSaveState["batting"] } : {}),
      isNamed:         n.isNamed         ?? namedFlags.get(n.npcId),
      potentialHidden: n.potentialHidden ?? 75,
    };
  };

  // ⚠ **이름·팀명을 여기서 굳히지 않는다.** 사건은 `npcId`만 들고 있고 화면이
  // 조회한다 — 예전엔 엔진이 문장을 조립해 보내 `TEAM_UNIV_ASAN`이 그대로 떴다.
  const events = raw.events ?? [];
  // 집계는 사람 수다. 이름 조회는 화면 몫이라 여기선 `people`이 비어도 맞다
  const counts = countByGroup(buildRows({ events, people: [] }));

  const mailboxEntry: MessageItem | null = events.length > 0
    ? {
        id: `msg-offseason-${Date.now()}`,
        category: "news",
        sender: "연감",
        subject: "오프시즌 결산",
        // 예전엔 `logs[0]`이라 "FA 미계약 2명"만 떴다 — 852명이 은퇴한
        // 시즌인지 목록에서 구분이 안 됐다
        preview: previewLine(counts),
        // 본문은 패널이 그린다. 메타데이터를 못 읽는 경로를 위한 대비책만 둔다
        body: previewLine(counts),
        createdAt: `Y${seasonYear}`,
        readAt: null,
        metadata: { type: "offseason", seasonYear, events },
      }
    : null;

  return {
    npcs:        raw.npcs.map(rehydrate),
    pendingDraft: raw.pendingDraft.map(rehydrate),
    summary:     raw.summary,
    // 최근 활동 로그(30칸)에 들어가는 건 **이 한 줄뿐이다.** 예전엔 개별 사건
    // 213줄이 그대로 부어져 시즌 마지막 주 기록을 통째로 밀어냈다.
    // ⚠ 화면 카드와 **같은 집계**를 쓴다 — Rust가 따로 세면 사건 수와 사람 수가
    // 어긋나 활동 로그엔 "방출 1170", 화면엔 "방출 45"가 뜬다
    logs:        events.length > 0
      ? [`오프시즌: ${previewLine(counts)}`, ...raw.logs]
      : raw.logs,
    mailboxEntry,
  };
}
