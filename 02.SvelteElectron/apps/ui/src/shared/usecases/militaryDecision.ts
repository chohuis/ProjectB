import { MILITARY_RESULT_WEEK } from "../utils/seasonWeeks";
// ── 병역 결정 ────────────────────────────────────────────────────
//
// 일반병 입대가 **네 곳에 복제**돼 있었고 서로 달랐다:
//
// | 호출부 | 오프시즌 | 커리어이벤트 | 거래기록 |
// |---|---|---|---|
// | `MilitaryEnlistAskModal` | ✅ | ✅ | ✅ |
// | `CareerResultModal` (전원 탈락) | ❌ | ❌ | ✅ |
// | `DraftNotificationModal` (거절·대안 없음) | ❌ | ❌ | ✅ |
// | `advanceWeek` (체육부대 선발) | ✅ | ✅ | ✅ |
//
// ⚠ **오프시즌을 빠뜨린 두 경로가 문제다.** 입대하면 `SeasonEndModal`이
// 안 뜨므로 그 자리에서 NPC 오프시즌을 돌려야 하는데, 안 돌면 그해에
// NPC가 나이를 안 먹고 은퇴·FA·드래프트 배정이 통째로 건너뛰어진다.
// 복무 2년이면 세계가 2년치 정체된다.

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { ALL_TEAMS_BY_LEAGUE } from "../utils/leagueScheduler";
import { SANGMU_TEAM_IDS } from "../utils/ids";

export type EnlistUnit = "sports" | "general";

/**
 * 입대 처리 — **어느 경로로 들어와도 같은 일이 일어난다.**
 *
 * @param unit 체육부대 / 일반병
 * @param week 입대 주차 (기본 52 — 시즌 종료 시점)
 * @param sportsSelected 체육부대 선발 여부 (`enlistMilitary`의 세 번째 인자)
 */
export async function enlistProtagonist(
  unit: EnlistUnit,
  week = MILITARY_RESULT_WEEK,
  sportsSelected = false,
): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const p = g.protagonist;
  const seasonYear = s.seasonYear;
  const label = unit === "sports" ? "체육부대 입대" : "일반병 입대";

  gameStore.enlistMilitary(unit, week, sportsSelected, seasonYear);
  gameStore.addCareerEvent({
    year: seasonYear,
    eventType: "military_enlist",
    fromTeamId: p.teamId || undefined,
    fromLeagueId: p.leagueId || undefined,
    detail: label,
  });

  // ⚠ 입대하면 `SeasonEndModal`이 안 뜬다 — NPC 오프시즌을 여기서 돌려야
  // 세계가 멈추지 않는다. 예전엔 네 경로 중 둘이 이걸 빠뜨렸다
  await gameStore.processAllLeaguesSeasonEnd(seasonYear);

  // 복무 중에는 경기가 없다. 주차만 흐른다.
  //
  // ⚠ **52주짜리 시즌을 연다.** 예전엔 100주 한 시즌이었는데, 그러면
  // "1시즌 = 52주"(DESIGN §6.1)가 깨져서 **복무 2년 동안 세계는 1년만
  // 흐른다** — 연도도 나이도 한 번만 오른다(실측: 2029 입대 후 전역했는데
  // 여전히 2029년 19세). 복무는 시즌 롤오버가 이어 열어 두 번에 나눈다.
  await openMilitarySeason((seasonYear || 2026) + 1, g.protagonist.teamId);

  const slotId = g.currentSlotId;
  if (slotId) {
    await window.projectB!.leagueAddTransactions(JSON.stringify({
      slotId,
      rows: [{
        seasonYear, week, category: "military",
        playerId: p.id, playerName: p.name,
        fromTeamId: p.teamId || null, fromLeagueId: p.leagueId || null,
        detail: label,
      }],
    }));
  }

  await gameStore.save();
  await seasonStore.save();
}

/** 총 복무 기간(주). 52주 시즌 두 번에 나눠 흐른다 */
export const SERVICE_WEEKS = 100;



/**
 * 군 시즌을 연다 — **주인공만** 경기 없는 52주. 입대와 롤오버가 같은 함수를 쓴다.
 *
 * 🔴 **세상까지 멈춰 있었다** (2026-09-02).
 *
 * `initSeason` 은 `set(next)` 로 전부 갈아끼운다 — `leagueSchedules` 가
 * 빈다. 그래서 복무 2년 동안 **전 리그가 한 경기도 안 치러졌다**:
 *
 * ```
 *   [일정끝:military] (전 리그 0)
 * ```
 *
 * 주인공이 안 뛰는 것과 **세상이 안 도는 것은 다르다.** 전역하면 돌아갈
 * 리그가 있어야 하고, 그 사이 NPC 성장·드래프트·순위가 굴러야 한다.
 *
 * ⚠ `LEAGUE_MILITARY` 는 `ALL_TEAMS_BY_LEAGUE` 에 없어서 `reinitSeasonSchedules`
 *   가 `s.schedule` 을 안 건드린다 — 위 `setSchedule([])` 가 그대로 산다.
 */
export async function openMilitarySeason(seasonYear: number, protagonistTeamId = ""): Promise<void> {
  seasonStore.initSeason("LEAGUE_MILITARY", seasonYear, 52, []);
  seasonStore.setSchedule([]);
  await seasonStore.reinitSeasonSchedules("LEAGUE_MILITARY", protagonistTeamId);
}

/**
 * 전역 처리 — 복무가 끝나면 원래 무대로 돌아간다.
 *
 * ⚠ **이 로직은 `advanceWeek.handleSeasonEnd` 안에 있었고 죽은 코드였다.**
 * 거기 조건은 `currentWeek + 1 > totalWeeks`인데, `runAutoAdvance`는 그보다
 * 먼저 `seasonEnded`(`currentWeek >= totalWeeks`)에서 멈춘다 — 같은 순간이라
 * **전역 분기에 도달할 수가 없다.** 그래서 입대하면 시즌 롤오버가 군 시즌을
 * 새로 열고 또 열어서 영원히 군대에 있었다.
 * 실측: 2029 입대 → 2036년 복무 700주(13.5년), 26세.
 *
 * 시즌 롤오버가 부르는 게 맞다 — 거기가 실제로 도는 경로다.
 *
 * @returns 전역했으면 true. 복무가 안 끝났으면 false
 */
export async function dischargeProtagonist(): Promise<boolean> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const p = g.protagonist;
  if (p.careerStage !== "military") return false;
  if ((p.militaryServiceWeeks ?? 0) < SERVICE_WEEKS) return false;

  gameStore.completeMilitaryService();

  // 학생 신분에서 입대했으면 소속이 아직 학교다 — 리그·팀·시즌을 독립리그로
  // 옮긴다. `completeMilitaryService`가 단계만 바꾸므로 여기가 짝이다
  // (안 하면 `stage: independent`인데 `league: LEAGUE_HIGHSCHOOL`이 된다).
  const after = get(gameStore).protagonist;
  if (after.careerStage === "independent" && after.leagueId !== "LEAGUE_INDEPENDENT") {
    const indieTeams = ALL_TEAMS_BY_LEAGUE.LEAGUE_INDEPENDENT ?? [];
    // 상무는 복무 중인 선수의 자리다 — 전역자가 갈 팀이 아니다
    const target = indieTeams.filter((t) => !SANGMU_TEAM_IDS.has(t)).sort()[0];
    if (target) gameStore.setProtagonistTeam(target, "LEAGUE_INDEPENDENT");
  }

  gameStore.addCareerEvent({
    year: s.seasonYear,
    eventType: "military_discharge",
    toTeamId: p.contract?.teamId ?? undefined,
    detail: "전역",
  });

  // 복귀 계약 — 잔여 계약이 있으면 그 팀과 재확인, 없으면 FA 시장.
  // (예전 `handleSeasonEnd`가 하던 일이다. 도달만 못 했을 뿐 내용은 맞다)
  const contract = p.contract;
  if (contract) {
    seasonStore.pushPendingAction({
      type: "salaryNegotiation",
      teamId: contract.teamId, leagueId: contract.leagueId,
      offeredSalary: contract.salary,
      durationYears: Math.max(1, contract.remainingYears),
      minDurationYears: 1, maxDurationYears: 2,
      signingBonus: 0,
      context: "military_return",
    });
  } else {
    seasonStore.pushPendingAction({ type: "faMarket" });
  }

  gameStore.addMessage({
    id: `msg-military-discharge-${s.seasonYear}`,
    category: "system", sender: "병무청",
    subject: "전역",
    preview: "병역 의무를 마쳤습니다.",
    body: [
      "병역 의무를 마치고 전역했습니다.",
      "",
      p.militaryUnit === "sports"
        ? "체육부대에서 실전 감각을 유지했습니다. 복귀 적응이 빠릅니다."
        : "오랜 공백이 있었습니다. 감각을 되찾는 데 시간이 필요합니다.",
    ].join("\n"),
    createdAt: `Y${s.seasonYear}`, readAt: null,
  });

  await gameStore.save();
  await seasonStore.save();
  return true;
}
