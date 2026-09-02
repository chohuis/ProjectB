/**
 * 군경팀(상무) — refs.json의 실제 ID.
 *
 * 이걸 상수로 뽑은 이유: `TEAM_SPORTS_UNIT`이 v1 시절 ID인데 코드 세 곳에
 * 하드코딩돼 있었고, Phase 5가 refs를 갈아엎으면서 **존재하지 않는 팀**이 됐다.
 * 새 게임 필터도, 런타임 입대 처리도 그 ID를 쓰고 있었다.
 *
 * 상무는 **독립리그 소속**이다 (예전 코드는 LEAGUE_UNIVERSITY로 넣었다).
 */
export const SANGMU_TEAM_ID = "TEAM_IND_SANGMU_PHOENIX";
export const SANGMU_LEAGUE_ID = "LEAGUE_INDEPENDENT";

/** 구 ID 포함 — 구 세이브·구 코드 경로를 걸러낼 때 쓴다 */
export const SANGMU_TEAM_IDS: ReadonlySet<string> = new Set([
  SANGMU_TEAM_ID,
  "TEAM_SPORTS_UNIT",
]);

// ── ID 규칙 정본 (DESIGN.md §8.2 원칙 6) ─────────────────────
// 리그/팀/구단 ID의 유일한 출처는 refs.json이며, 파생 규칙은 이 모듈에만 둔다.
// 개별 파일에 .replace(/^CLUB_/...) 류 인라인 변환을 두지 않는다.

/** 구단 ID → 1군 팀 ID (CLUB_KBL_X → TEAM_KBL_X_1) */
export function clubToFirstTeam(clubId: string): string {
  return clubId.startsWith("CLUB_")
    ? `TEAM_${clubId.slice("CLUB_".length)}_1`
    : clubId;
}

/** 1군 팀 ID → 팜(2군) 팀 ID (TEAM_X_1 → TEAM_X_2), 규칙 불일치 시 null */
export function farmTeamId(teamId: string): string | null {
  return teamId.endsWith("_1") ? `${teamId.slice(0, -2)}_2` : null;
}

/**
 * 팜(2군) 팀 ID → 1군 팀 ID (TEAM_X_2 → TEAM_X_1), 규칙 불일치 시 null.
 *
 * `farmTeamId` 의 역이다. 해외 2군 직행 제안이 **부모 1군의 전력**으로
 * 문턱을 정한다(2026-09-02 · 사용자 확정) — refs 의 `_2` 팀은 전부 ★3 이라
 * 2군 전력으로는 28팀이 한 문턱에 몰린다.
 */
export function firstTeamIdOf(teamId: string): string | null {
  return teamId.endsWith("_2") ? `${teamId.slice(0, -2)}_1` : null;
}

/**
 * 1군·2군을 한 구단으로 묶는 키 (TEAM_X_1 · TEAM_X_2 → TEAM_X).
 *
 * "같은 구단 사람인가"를 묻는 자리에 쓴다 — 내 팀 2군 선수는 남이 아니다.
 * 꼬리표가 없는 팀(고교·대학·독립)은 그대로 돌려준다.
 */
export function clubKeyOfTeam(teamId: string): string {
  return teamId.replace(/_[12]$/, "");
}

// ── 고교 권역 역방향 조회 ────────────────────────────────────────
//
// `HS_REGIONS`는 권역 → 팀 배열이라 "이 팀이 어느 권역인가"를 못 묻는다.
// 화면마다 `Object.entries(HS_REGIONS).find(...)`를 적으면 정본이 흩어지므로
// 여기 한 번만 만들어 캐시한다 (`primeTeamLeagueMap`과 같은 방식).

let _teamRegion: Map<string, string> | null = null;

/** `HS_REGIONS`(권역 → 팀 목록)에서 역방향 표를 만든다 */
export function primeHsRegionMap(regions: Record<string, readonly string[]>): void {
  const m = new Map<string, string>();
  for (const [regionId, teamIds] of Object.entries(regions)) {
    for (const id of teamIds) m.set(id, regionId);
  }
  _teamRegion = m;
}

/**
 * 이 팀이 속한 고교 권역. 고교가 아니거나 표가 안 채워졌으면 null.
 *
 * ⚠ 권역은 **고교에만 있다.** 대학·프로는 전국 단일 순위이므로 이 함수가
 * null을 주는 게 정상이고, 화면은 그때 전국만 보여준다.
 */
export function hsRegionOfTeam(teamId: string): string | null {
  return _teamRegion?.get(teamId) ?? null;
}

/** 같은 권역의 팀들. 권역이 없으면 빈 배열 */
export function hsRegionTeams(
  teamId: string,
  regions: Record<string, readonly string[]>,
): readonly string[] {
  const rid = hsRegionOfTeam(teamId);
  return rid ? regions[rid] ?? [] : [];
}

// ── 팀 → 리그 파생 ───────────────────────────────────────────────
//
// ⚠ **이게 없어서 선수 소속이 어긋났다.** 팀을 바꾸는 자리마다 리그를 각자
// 처리했는데 — FA 계약은 `currentLeague: "LEAGUE_KBL"`을 **하드코딩**하고,
// 트레이드는 리그를 **아예 안 건드리고**, 승강만 `_2` 접미사로 파생했다.
//
// 국내끼리는 출발·도착 리그가 같아서 **안 드러났다.** 확장팩(ABL·JBL)을 켜자
// 즉시 터졌다 — `TEAM_ABL_MOTORWOLVES_1` 소속인데 `currentLeague`는
// `LEAGUE_KBL`인 선수가 생겼다. 게다가 Rust FA 재배치가 `current_league`로
// 팀을 그룹화하므로 **오염이 자가증식한다**(한 시즌에 25명 → 224명).
//
// 팀 ID가 곧 리그다. 파생 규칙은 여기 하나에 둔다.

let _teamLeague: Map<string, string> | null = null;

/**
 * refs에서 팀→리그 표를 만들어 캐시한다. `masterStore.teams`를 넘긴다.
 * 부팅 시 한 번 부르면 되고, 안 불러도 `leagueOfTeam`이 접미사로 폴백한다.
 */
export function primeTeamLeagueMap(teams: readonly { id: string; leagueId: string }[]): void {
  const m = new Map<string, string>();
  for (const t of teams) {
    // refs는 1군·팜을 **같은 leagueId**로 담는다 (KBL 1군 10 + 팜 10 = 20팀이
    // 전부 LEAGUE_KBL). `_2`는 팜 리그로 파생한다 — `roster_gen.rs`의 plan과 같은 규칙.
    m.set(t.id, t.id.endsWith("_2") ? `${t.leagueId}_FARM` : t.leagueId);
  }
  _teamLeague = m;
}

/**
 * 팀 ID → 리그 ID. **선수 소속을 바꿀 때 반드시 이걸 쓴다.**
 *
 * 표가 없으면 ID 접두사로 폴백한다 — 헤드리스·테스트에서 `primeTeamLeagueMap`을
 * 안 불렀을 때 조용히 틀린 값을 주는 것보다 낫다.
 */
export function leagueOfTeam(teamId: string): string | null {
  if (!teamId) return null;
  const hit = _teamLeague?.get(teamId);
  if (hit) return hit;

  const farm = teamId.endsWith("_2");
  const m = /^TEAM_([A-Z]+)_/.exec(teamId);
  if (!m) return null;
  const base = ({
    HS: "LEAGUE_HIGHSCHOOL", UNIV: "LEAGUE_UNIVERSITY", IND: "LEAGUE_INDEPENDENT",
    KBL: "LEAGUE_KBL", ABL: "LEAGUE_ABL", JBL: "LEAGUE_JBL",
  } as Record<string, string>)[m[1]];
  if (!base) return null;
  // 고교·대학·독립엔 팜이 없다
  return farm && (base === "LEAGUE_KBL" || base === "LEAGUE_ABL" || base === "LEAGUE_JBL")
    ? `${base}_FARM` : base;
}

/**
 * 리그 ID → 시설 등급. Rust `facility_factor`가 받는 5종과 같은 문자열이다.
 *
 * ⚠ **`TeamRef.tier`를 쓰면 안 된다.** refs.json의 국내 182팀에는 그 필드가 아예
 * 없고(값이 있는 건 범위 밖인 해외 56팀뿐), `?? "독립"` 폴백이 걸려 있었다.
 * 그래서 국내 NPC 5,600명이 전부 `facility_factor("독립") = 0.78`로 성장하고
 * 있었다 — 고교(1.08)·프로1군(1.00)이 있어야 할 자리다.
 */
export function facilityTierOf(leagueId: string): string {
  switch (leagueId) {
    case "LEAGUE_HIGHSCHOOL":  return "고교";
    case "LEAGUE_UNIVERSITY":  return "대학";
    case "LEAGUE_KBL":         return "1군";
    case "LEAGUE_KBL_FARM":    return "2군";
    case "LEAGUE_ABL":
    case "LEAGUE_JBL":         return "1군";
    default:                   return "독립";
  }
}

/**
 * 부팅 무결성 검증 — 코드 상수(leagueScheduler 팀 목록)가 refs.json 팀과 일치하는지,
 * 프로 1군 팀마다 _2 팜 팀이 refs에 존재하는지 확인한다.
 * 위반 시 콘솔 에러 + 위반 목록 반환 (게임은 계속 — 개발 중 조기 발견 목적).
 */
export function validateTeamRefs(
  refTeamIds: ReadonlySet<string>,
  codeTeamLists: Record<string, readonly string[]>,
): string[] {
  const violations: string[] = [];
  for (const [listName, ids] of Object.entries(codeTeamLists)) {
    for (const id of ids) {
      if (!refTeamIds.has(id)) {
        violations.push(`${listName}: '${id}' 이(가) refs.json에 없음`);
      }
      if (id.endsWith("_1")) {
        const farm = farmTeamId(id);
        if (farm && !refTeamIds.has(farm)) {
          violations.push(`${listName}: '${id}' 의 팜 팀 '${farm}' 이(가) refs.json에 없음`);
        }
      }
    }
  }
  if (violations.length > 0) {
    console.error(`[ids] 팀 ID 무결성 위반 ${violations.length}건:\n` + violations.join("\n"));
  }
  return violations;
}

// ── 무대별 성장 계수 ─────────────────────────────────────────────
//
// ⚠ **정본은 `generation_rules.json`의 `growthRules.facilityFactor`다.**
// 예전엔 이 표가 Rust(`npc_sim.rs facility_factor()`)에만 있었고,
// **대학 0.95 < 고교 1.08**이라 고교 출신이 대학에 가면 성장이 오히려
// 느려졌다. 그래서 얼리 신청 하한(68)을 넘는 사람이 유출량을 못 따라가
// **대학 드래프트 후보가 5년에 걸쳐 220 → 1로 말라붙었다**(실측).
let _facFactors: Record<string, number> | null = null;

export async function loadFacilityFactors(): Promise<Record<string, number>> {
  if (_facFactors) return _facFactors;
  const raw = await window.projectB!.masterFetch("players/generation_rules.json") as
    { growthRules?: { facilityFactor?: Record<string, number> } } | null;
  const t = raw?.growthRules?.facilityFactor;
  if (!t) throw new Error("[ids] generation_rules.json growthRules.facilityFactor 없음");
  _facFactors = t;
  return t;
}

/** 규칙 파일을 미리 읽어둔 뒤 동기적으로 쓴다. 못 읽었으면 undefined → Rust 폴백 */
export function facilityFactorOf(tier: string): number | undefined {
  return _facFactors?.[tier];
}

// ── NPC 성장 속도 규칙 ───────────────────────────────────────────
//
// ⚠ **정본은 `generation_rules.json`의 `growthRules.xp`다.**
// 예전엔 Rust에 박혀 있었고, 그 값으로는 17세 유망주가 스탯 하나를 +1
// 올리는 데 85주가 걸렸다 — 고교 3년을 다 뛰어도 OVR이 1도 안 올랐다.
// 30세 감퇴만 정상 작동해서 세계 평균이 매년 내려앉았다.

export type GrowthXpRules = {
  multiplierPitcher: number;
  multiplierBatter: number;
  ageBands: Array<{ maxAge: number; f: number }>;
};

let _xpRules: GrowthXpRules | null = null;

export async function loadGrowthXpRules(): Promise<GrowthXpRules> {
  if (_xpRules) return _xpRules;
  const raw = await window.projectB!.masterFetch("players/generation_rules.json") as
    { growthRules?: { xp?: GrowthXpRules } } | null;
  const t = raw?.growthRules?.xp;
  if (!t) throw new Error("[ids] generation_rules.json growthRules.xp 없음");
  if (!Array.isArray(t.ageBands) || t.ageBands.length === 0) {
    throw new Error("[ids] growthRules.xp.ageBands가 비었다");
  }
  _xpRules = t;
  return t;
}

/** 미리 읽어둔 성장 규칙. 못 읽었으면 undefined → Rust 폴백 */
export function growthXpRules(): GrowthXpRules | undefined {
  return _xpRules ?? undefined;
}

// ── 프로 리그 목록 ───────────────────────────────────────────────
//
// ⚠ **`["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]`이 여섯 군데에 적혀 있었다**
// (`market.ts` 셋 · `game.ts` 셋). 그러면서 정작 **운영은 KBL 전용**이었다 —
// 승강·FA 시장·트레이드가 전부 `leagueId === "LEAGUE_KBL"`로 걸러졌다.
//
// 그래서 확장팩을 열면 ABL·JBL은 **채우는 경로(Rust 오프시즌)는 있는데
// 정리하는 경로(TS 승강)가 없는 리그**가 된다. 실측에서 1군이 팀당 41·46명
// (상한 34·32)까지 부풀었고, `releaseScope.ts`는 그걸 "캡이 안 걸린다"고
// 적어 뒀었다. Rust 캡은 정상이다 — 떼어 재보면 14 → 26으로 정확히 자른다.

import { isLeagueInScope } from "../config/releaseScope";

/** 프로 1군 리그 — 승강·FA·트레이드가 도는 무대 */
export const PRO_LEAGUES = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"] as const;

/**
 * **지금 실제로 도는** 프로 1군 리그.
 *
 * 확장팩이 닫혀 있으면 KBL 하나다 — 그때는 예전과 완전히 같게 돈다.
 * 게이트 하나가 유일한 스위치가 되도록 여기서 거른다.
 */
export function activeProLeagues(): string[] {
  return PRO_LEAGUES.filter(isLeagueInScope);
}

/** 프로 1군 + 그 팜. 승강은 짝으로 돈다 */
export function activeProLeaguesWithFarm(): string[] {
  return activeProLeagues().flatMap((l) => [l, `${l}_FARM`]);
}

/** 프로 리그인가 (팜 제외) */
export function isProLeague(leagueId: string): boolean {
  return (PRO_LEAGUES as readonly string[]).includes(leagueId);
}
