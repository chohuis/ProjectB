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
