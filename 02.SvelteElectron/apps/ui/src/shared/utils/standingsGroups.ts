// ── 순위표 그룹 나누기 ───────────────────────────────────────────
//
// 고교는 **102팀 8권역**, 대학은 **50팀 5조**로 굴러가는데 순위표는
// 한 덩어리로 그려졌다. 102줄짜리 표에서는 내가 몇 등인지도, 우리 권역
// 1위가 누군지도 읽을 수 없다 — 리그 구조가 화면에 없던 셈이다.
//
// ABL·JBL만 컨퍼런스로 쪼개져 있었고 그것도 화면에 표 4벌이 하드코딩돼
// 있었다. 그룹 정의는 이미 `GROUPS_BY_LEAGUE`(refs에서 생성)에 있으니
// 거기서 읽어 **한 경로로** 처리한다.

import { GROUPS_BY_LEAGUE, LEAGUE_GROUP_META } from "./leagueTeams.generated";
import { ablConference, jblConference } from "./leagueConferences";

export interface StandingsGroup {
  /** 화면에 찍을 이름 — "한라권역", "A조", "East" */
  label: string;
  teamIds: ReadonlySet<string>;
}

/** 대학 조 라벨 (A~E) — 구장ID에서 찾는다 */
function univGroupLabel(stadiumId: string): string | null {
  const meta = LEAGUE_GROUP_META.find(
    (m) => m.leagueId === "LEAGUE_UNIVERSITY" && m.stadiumId === stadiumId,
  );
  return meta ? `${meta.label}조` : null;
}

/**
 * 이 리그를 그룹으로 나눠 보여줘야 하는가, 나눈다면 어떻게.
 *
 * @param stadiumName 구장 ID → 이름. 고교 권역 이름이 여기서 나온다
 *   (`refs.stadiums`). 손으로 표를 만들면 권역 하나를 빠뜨린다 — 실제로 그랬다.
 * @returns 그룹 목록. **나눌 필요가 없으면 `null`** — 호출부가 통짜 표로 그린다
 */
export function standingsGroupsOf(
  leagueId: string,
  stadiumName: (id: string) => string,
): StandingsGroup[] | null {
  // ── 국내 권역·조 (refs에서 생성된 정본) ──
  const groups = GROUPS_BY_LEAGUE[leagueId];
  if (groups) {
    const isUniv = leagueId === "LEAGUE_UNIVERSITY";
    const out = Object.entries(groups).map(([stadiumId, teamIds]) => ({
      label: isUniv
        ? (univGroupLabel(stadiumId) ?? stadiumName(stadiumId))
        : // "한라구장" → "한라권역". 뒤에 붙는 말이 달라야 순위표에서 안 헷갈린다
          `${stadiumName(stadiumId).replace(/구장$/, "")}권역`,
      teamIds: new Set(teamIds),
    }));
    // 큰 권역부터 — 팀 수가 6~20으로 차이가 커서 작은 권역이 위에 오면
    // 표가 들쭉날쭉해 보인다. 조는 A~E 이름순이 자연스럽다
    return isUniv
      ? out.sort((a, b) => a.label.localeCompare(b.label))
      : out.sort((a, b) => b.teamIds.size - a.teamIds.size || a.label.localeCompare(b.label));
  }

  // ── 해외 컨퍼런스 ──
  if (leagueId === "LEAGUE_ABL" || leagueId === "LEAGUE_ABL_FARM") {
    return [
      { label: "East", teamIds: new Set<string>() },
      { label: "West", teamIds: new Set<string>() },
    ].map((g) => ({ ...g, teamIds: g.teamIds })); // 소속은 아래 matcher가 판정
  }
  if (leagueId === "LEAGUE_JBL" || leagueId === "LEAGUE_JBL_FARM") {
    return [
      { label: "센트럴 (CL)", teamIds: new Set<string>() },
      { label: "퍼시픽 (PL)", teamIds: new Set<string>() },
    ];
  }

  return null; // 프로 1군·2군·독립 — 10팀이라 통짜가 낫다
}

/**
 * 팀이 이 그룹에 속하는가.
 *
 * 국내는 팀 목록으로, 해외는 컨퍼런스 함수로 판정한다 — 해외 컨퍼런스는
 * 팀 ID 규칙(`_CL_`)에서 나와 목록이 따로 없다.
 */
export function inGroup(leagueId: string, group: StandingsGroup, teamId: string): boolean {
  if (group.teamIds.size > 0) return group.teamIds.has(teamId);
  if (leagueId.startsWith("LEAGUE_ABL")) return ablConference(teamId) === group.label;
  if (leagueId.startsWith("LEAGUE_JBL")) {
    const c = group.label.includes("CL") ? "CL" : "PL";
    return jblConference(teamId) === c;
  }
  return false;
}

/**
 * 순위표 행을 그룹별로 쪼갠다. 그룹이 없으면 통짜 하나로 돌려준다.
 *
 * @param idOf 팀 ID 접근자 — 현재 시즌은 `teamId`, 과거 기록은 `team_id`라
 *   키가 다르다. 둘을 각자 처리하면 한쪽만 고쳐진다
 */
export function splitByGroup<T>(
  leagueId: string,
  rows: T[],
  stadiumName: (id: string) => string,
  idOf: (row: T) => string = (r) => (r as unknown as { teamId: string }).teamId,
): { label: string | null; rows: T[] }[] {
  const groups = standingsGroupsOf(leagueId, stadiumName);
  if (!groups) return [{ label: null, rows }];

  const out = groups
    .map((g) => ({ label: g.label, rows: rows.filter((r) => inGroup(leagueId, g, idOf(r))) }))
    .filter((g) => g.rows.length > 0);

  // 어느 그룹에도 안 잡힌 팀 — 데이터가 어긋난 것이다. **버리지 않고 보여준다**
  // (조용히 사라지면 "우리 팀이 순위표에 없다"가 된다)
  const claimed = new Set(out.flatMap((g) => g.rows.map((r) => idOf(r))));
  const orphans = rows.filter((r) => !claimed.has(idOf(r)));
  if (orphans.length > 0) out.push({ label: "미분류", rows: orphans });

  return out.length > 0 ? out : [{ label: null, rows }];
}
