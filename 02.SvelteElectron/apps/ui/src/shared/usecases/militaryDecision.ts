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
  week = 52,
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

  // 복무 중에는 경기가 없다. 주차만 흐른다 (100주 = 약 2시즌)
  seasonStore.initSeason("LEAGUE_MILITARY", (seasonYear || 2026) + 1, 100, []);
  seasonStore.setSchedule([]);

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
