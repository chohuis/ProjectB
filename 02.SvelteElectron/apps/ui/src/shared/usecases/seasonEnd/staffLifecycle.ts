// 시즌 종료 — 스태프 생애주기 (Phase 6B)
//
// `game.ts`의 `processAllLeaguesSeasonEnd`(566줄)는 건드리지 않는다. 그 566줄은
// 병역·FA·드래프트가 얽혀 있어 쪼개려면 별도 작업이 필요하고, 스태프는 거기에
// 의존하지 않는다. 여기서 독립적으로 처리하고 한 줄로 호출한다.
//
// 흐름: slot.db staff → Rust advanceStaffSeason → 빈 자리 신규 생성 → slot.db 갱신

import { get } from "svelte/store";

import { masterStore } from "../../stores/master";
import { seasonStore } from "../../stores/season";
import { slotRepo } from "../../repo/slotRepo";
import { generateStaffForTeams, loadStaffRules, type StaffRow } from "../../repo/staffGen";
import { ALL_TEAMS_BY_LEAGUE } from "../../utils/leagueScheduler";
import type { Standing } from "../../types/season";

export interface StaffEvent {
  /** "retired" | "fired" | "moved" | "hired" | "vacant" */
  kind: string;
  staffId: string;
  name: string;
  role: string;
  teamId: string;
  leagueId: string;
  fromTeamId?: string;
  age: number;
}

interface AdvanceResult {
  staff: StaffRow[];
  events: StaffEvent[];
  slumpSeasons: Record<string, number>;
}

/** 스태프 생애주기가 도는 국내 리그 (해외는 Lazy — 진출 시 생성) */
const LIFECYCLE_LEAGUES = [
  "LEAGUE_HIGHSCHOOL",
  "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL",
];

/**
 * 리그 최종 순위 → 경질 판정 입력.
 *
 * 순위표가 없는 리그는 아예 넘기지 않는다 — 0승 0패를 "최하위 부진"으로 읽으면
 * 시뮬이 안 돈 리그의 감독이 전원 경질된다.
 */
function buildResults(
  slumpSeasons: Record<string, number>,
  powerOf: Map<string, number>,
): {
  teamId: string; leagueId: string; power: number;
  rank: number; leagueSize: number; slumpSeasons: number;
}[] {
  const s = get(seasonStore);
  const out: ReturnType<typeof buildResults> = [];

  for (const leagueId of LIFECYCLE_LEAGUES) {
    const standings: Standing[] = s.leagueState?.[leagueId]?.standings ?? [];
    const played = standings.filter((st) => st.wins + st.losses + st.draws > 0);
    if (played.length === 0) continue;   // 안 돈 리그 — 경질 판정 제외

    const ranked = [...standings].sort(
      (a, b) => b.winPct - a.winPct
        || b.runsFor - a.runsFor
        || a.runsAgainst - b.runsAgainst
        || a.teamId.localeCompare(b.teamId),
    );
    ranked.forEach((st, i) => {
      out.push({
        teamId: st.teamId,
        leagueId,
        power: powerOf.get(st.teamId) ?? 3,
        rank: i + 1,
        leagueSize: ranked.length,
        slumpSeasons: slumpSeasons[st.teamId] ?? 0,
      });
    });
  }
  return out;
}

/**
 * 스태프 시즌 종료 처리.
 *
 * @param seasonYear 방금 끝난 시즌
 * @returns 벌어진 일 (뉴스·메시지 소재) + 갱신된 부진 누적
 */
export async function processStaffSeasonEnd(
  slotId: string,
  seasonYear: number,
  worldSeed: number,
  prevSlumpSeasons: Record<string, number> = {},
): Promise<{ events: StaffEvent[]; slumpSeasons: Record<string, number> }> {
  const current = await slotRepo.getStaff(slotId, { status: "active" });
  if (current.length === 0) {
    // 구 세이브에는 스태프가 없다 (6A 마이그레이션 v3는 테이블만 만든다)
    return { events: [], slumpSeasons: prevSlumpSeasons };
  }

  const teams = get(masterStore).teams;
  const powerOf = new Map(teams.map((t) => [t.id, t.power ?? 3]));
  const rulesFile = await loadStaffRules();
  const lifecycle = (rulesFile.rules as { lifecycle?: unknown }).lifecycle;
  if (!lifecycle) {
    console.warn("[staffLifecycle] staff_rules.toml에 [lifecycle] 없음 — 생애주기 건너뜀");
    return { events: [], slumpSeasons: prevSlumpSeasons };
  }

  const raw = await window.projectB!.engine("advanceStaffSeasonNative", JSON.stringify({
    worldSeed: worldSeed >>> 0,
    seasonYear,
    staff: current,
    results: buildResults(prevSlumpSeasons, powerOf),
    rules: lifecycle,
  }));
  const parsed = JSON.parse(raw) as AdvanceResult | { error?: string };
  if (!("staff" in parsed) || !Array.isArray(parsed.staff)) {
    console.error("[staffLifecycle] Rust 오류:", (parsed as { error?: string }).error);
    return { events: [], slumpSeasons: prevSlumpSeasons };
  }

  let staff = parsed.staff;
  const events = [...parsed.events];

  // ── 빈 자리 신규 생성 ────────────────────────────────────────
  // Rust는 이동만 처리하고 "vacant"로 남긴다 — 이름 풀·생성 규칙을 생애주기
  // 모듈이 또 들고 있지 않게 하려고 생성은 여기서 한다 (staff_gen 재사용).
  const vacant = events.filter((e) => e.kind === "vacant");
  if (vacant.length > 0) {
    const byTeam = new Map<string, { teamId: string; leagueId: string }>();
    for (const v of vacant) byTeam.set(v.teamId, { teamId: v.teamId, leagueId: v.leagueId });
    const refTeams = teams.filter((t) => byTeam.has(t.id));

    // 시즌마다 다른 사람이 나와야 하므로 seed에 시즌을 섞는다
    const fresh = await generateStaffForTeams(refTeams, worldSeed ^ (seasonYear * 2654435761), seasonYear + 1);
    const have = new Set(staff.map((s) => s.staffId));

    for (const v of vacant) {
      // 그 팀·그 역할의 새 사람. 같은 팀에 여러 자리가 비면 순번으로 구분한다
      const candidates = fresh.filter((f) => f.teamId === v.teamId && f.role === v.role);
      const pick = candidates.find((c) => !have.has(c.staffId))
        ?? candidates[0];
      if (!pick) continue;

      // ID 충돌 방지 — 은퇴자가 같은 ID를 이미 점유하고 있다
      let id = pick.staffId;
      let n = 2;
      while (have.has(id)) { id = `${pick.staffId}_v${n}`; n += 1; }
      have.add(id);

      const hired: StaffRow = { ...pick, staffId: id, joinedSeason: seasonYear + 1 };
      staff = [...staff, hired];
      events.push({
        kind: "hired",
        staffId: hired.staffId,
        name: hired.name,
        role: hired.role,
        teamId: hired.teamId,
        leagueId: hired.leagueId,
        age: hired.age,
      });
    }
  }

  // ── slot.db 반영 ─────────────────────────────────────────────
  // 기존 행은 UPDATE(나이·상태·경력·소속·능력치), 신규는 INSERT.
  const existing = new Set(current.map((s) => s.staffId));
  const updates = staff
    .filter((s) => existing.has(s.staffId))
    .map((s) => ({
      staffId: s.staffId, age: s.age, status: s.status, years: s.years,
      teamId: s.teamId, leagueId: s.leagueId, stats: s.stats,
    }));
  if (updates.length > 0) await slotRepo.updateStaff(slotId, updates);

  const inserts = staff.filter((s) => !existing.has(s.staffId));
  if (inserts.length > 0) await slotRepo.insertStaff(slotId, inserts);

  return { events: events.filter((e) => e.kind !== "vacant"), slumpSeasons: parsed.slumpSeasons };
}

/** 스태프 사건 → 메시지 본문 한 줄 (뉴스 소재) */
export function describeStaffEvent(e: StaffEvent, teamName: (id: string) => string): string {
  const role = e.role === "manager" ? "감독" : e.role === "coach" ? "코치" : "구단주";
  switch (e.kind) {
    case "retired": return `${teamName(e.teamId)} ${e.name} ${role}(${e.age}세) 은퇴`;
    case "fired":   return `${teamName(e.teamId)} ${e.name} ${role} 경질`;
    case "moved":   return `${e.name} ${role} — ${teamName(e.fromTeamId ?? "")} → ${teamName(e.teamId)} 이적`;
    case "hired":   return `${teamName(e.teamId)} 신임 ${e.name} ${role}(${e.age}세) 부임`;
    default:        return "";
  }
}

/** 주인공 팀에 벌어진 일만 (개인 메시지용) */
export function myTeamStaffEvents(events: StaffEvent[], myTeamId: string): StaffEvent[] {
  return events.filter((e) => e.teamId === myTeamId || e.fromTeamId === myTeamId);
}

/** 리그 전체에 팀이 몇 개인지 — 로그 표시용 */
export function leagueTeamCount(leagueId: string): number {
  return (ALL_TEAMS_BY_LEAGUE[leagueId] ?? []).length;
}
