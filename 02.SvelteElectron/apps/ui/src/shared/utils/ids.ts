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
