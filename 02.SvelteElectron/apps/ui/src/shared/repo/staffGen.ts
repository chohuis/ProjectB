// 스태프 절차 생성 배선 (Phase 6A)
//
// 흐름: staff_rules.json(규칙) + refs.json(팀) → Rust generateStaffNative → slot.db staff
//
// 구 경로는 `entities/players/COA_*.json` 374파일을 master.db에 구워두고 읽는 것이었다.
// 그건 "생성 결과물을 저장해두고 스크립트로 사후 수정"하는 패턴이고 DESIGN §8.3이 폐기했다.
// 이제 git에 남는 건 규칙뿐이고, 규칙을 고치면 새 게임에 즉시 반영된다.

import type { TeamRef } from "../stores/master";

export type StaffRole = "manager" | "coach" | "owner";

export interface StaffRow {
  staffId: string;
  name: string;
  nameEn: string;
  role: StaffRole;
  age: number;
  teamId: string;
  leagueId: string;
  schoolId: string;
  status: string;
  /** 감독·코치 = 경력 연수 · 구단주 = 재임 연수 */
  years: number;
  /** 감독 스타일 또는 코치 전문 영역 */
  style: string;
  /** 역할별 5종. 감독은 Rust ManagerStats와 같은 키를 쓴다 */
  stats: Record<string, number>;
  riskTolerance: number;
  trainingBuff: string;
  joinedSeason: number;
}

interface StaffRulesFile {
  rules: unknown;
  namePools: {
    krSurnames: string[];
    krGiven: string[];
    enSurnames: string[];
    enGiven: string[];
  };
}

let cached: StaffRulesFile | null = null;

export async function loadStaffRules(): Promise<StaffRulesFile> {
  if (cached) return cached;
  const raw = (await window.projectB!.masterFetch("players/staff_rules.json")) as StaffRulesFile | null;
  if (!raw?.rules || !raw.namePools) {
    throw new Error("[staffGen] staff_rules.json 없음 — python scripts/build_refs_from_seeds.py 실행 필요");
  }
  cached = raw;
  return raw;
}

/** 국내 리그만. 해외는 진출 시 Lazy 생성 (people.md §2-1) */
export const DOMESTIC_STAFF_LEAGUES = [
  "LEAGUE_HIGHSCHOOL",
  "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL",
];

/**
 * 팀 목록 → 스태프 전원. worldSeed 결정적이라 같은 시드면 늘 같은 스태프가 나온다.
 *
 * @param teams refs.json의 팀 (power·traits.resource가 생성에 쓰인다)
 */
export async function generateStaffForTeams(
  teams: TeamRef[],
  worldSeed: number,
  seasonYear: number,
): Promise<StaffRow[]> {
  const file = await loadStaffRules();
  const payload = {
    worldSeed: worldSeed >>> 0,
    seasonYear,
    rules: file.rules,
    surnames: file.namePools.krSurnames,
    givenNames: file.namePools.krGiven,
    surnamesEn: file.namePools.enSurnames,
    givenNamesEn: file.namePools.enGiven,
    teams: teams.map((t) => ({
      teamId: t.id,
      leagueId: t.leagueId,
      schoolId: t.schoolId ?? "",
      power: t.power ?? 3,
      resource: t.traits?.resource ?? "안정",
    })),
  };
  const raw = await window.projectB!.engine("generateStaffNative", JSON.stringify(payload));
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`[staffGen] 생성 실패: ${(parsed as { error?: string })?.error ?? "unknown"}`);
  }
  return parsed as StaffRow[];
}

/** 국내 전 팀 스태프 (새 게임용) */
export async function generateDomesticStaff(
  allTeams: TeamRef[],
  worldSeed: number,
  seasonYear: number,
): Promise<StaffRow[]> {
  const domestic = allTeams.filter((t) => DOMESTIC_STAFF_LEAGUES.includes(t.leagueId));
  return generateStaffForTeams(domestic, worldSeed, seasonYear);
}

// ── EntityRow 변환 (화면이 기존 모양을 계속 읽게) ──────────────
//
// 화면·매치엔진은 `EntityRow.details.{manager,coach,owner}`를 읽는다.
// 스태프 저장 모양이 바뀌었으니 여기서 한 번만 맞춰준다 — 화면을 다 고치지 않는다.

import type { EntityRow } from "../stores/master";

const EMPTY_PLAYER = {
  playerType: "pitcher" as const,
  handedness: "R" as const,
  position: "SP",
  jerseyNumber: 0,
  pitching: { ovr: 50, stamina: 50, velocity: 50, command: 50, control: 50, movement: 50, mentality: 50, recovery: 50 },
  batting: { ovr: 50, contact: 50, power: 50, eye: 50, speed: 50, fielding: 50, arm: 50 },
  developmentRate: 50,
  potentialHidden: 50,
};

export function staffRowToEntityRow(st: StaffRow): EntityRow {
  const s = st.stats ?? {};
  return {
    id: st.staffId,
    name: st.name,
    nameEn: st.nameEn,
    role: st.role,
    age: st.age,
    status: (st.status as EntityRow["status"]) ?? "active",
    originLeagueId: st.leagueId,
    leagueId: st.leagueId,
    clubId: st.teamId,
    teamId: st.teamId,
    schoolId: st.schoolId,
    notes: "",
    details: {
      // 스태프는 선수 능력치가 없다. 화면이 details.player를 무조건 읽는 곳이 있어
      // 빈 껍데기를 준다 — 구 JSON도 같은 이유로 50을 채워뒀었다.
      player: EMPTY_PLAYER as EntityRow["details"]["player"],
      manager: st.role === "manager" ? {
        style: st.style,
        experienceYears: st.years,
        // Rust ManagerStats와 같은 키. 구 JSON은 tactics/decision/... 이었고
        // MatchPage는 handlePressure/strategy/... 를 읽어 값이 전달되지 않았다.
        stats: {
          tacticalIQ:     s.tacticalIQ ?? 50,
          bullpenRead:    s.bullpenRead ?? 50,
          offenseMind:    s.offenseMind ?? 50,
          motivator:      s.motivator ?? 50,
          clutchDecision: s.clutchDecision ?? 50,
        } as unknown as EntityRow["details"]["manager"] extends null ? never : NonNullable<EntityRow["details"]["manager"]>["stats"],
        gamePlanBias: "",
        riskTolerance: st.riskTolerance,
      } as NonNullable<EntityRow["details"]["manager"]> : null,
      coach: st.role === "coach" ? {
        specialty: st.style as NonNullable<EntityRow["details"]["coach"]>["specialty"],
        experienceYears: st.years,
        stats: {
          teaching:   s.teaching ?? 50,
          analytics:  s.analysis ?? 50,
          experience: Math.max(1, Math.min(5, Math.round(st.years / 5))),
        },
        trainingBuffs: st.trainingBuff,
      } as NonNullable<EntityRow["details"]["coach"]> : null,
      owner: st.role === "owner" ? {
        ownershipStyle: st.style,
        tenureYears: st.years,
        stats: {
          budgetSupport:      s.budgetSupport ?? 50,
          patience:           s.patience ?? 50,
          prInfluence:        s.prInfluence ?? 50,
          facilityInvestment: s.facilityInvestment ?? 50,
          staffTrust:         s.staffTrust ?? 50,
        },
      } : null,
    },
  } as EntityRow;
}
