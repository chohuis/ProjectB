import type { ProtagonistSave } from "../types/save";
import type { MainTabId, MeTabId } from "../types/main";

/**
 * 내비와 "나" 탭의 **노출 정본**. (사용자 확정 2026-08-05: "안 쓰는 건 숨긴다")
 *
 * ⚠ 숨기는 기준은 **"지금 이 단계에서 정말 의미가 없는가"** 하나다.
 * 실측으로 확인한 것:
 *
 *   상무 복무 중에도 `teamId`는 안 바뀐다 (`gameStore.enlistMilitary`).
 *   소속팀은 계속 경기를 하므로 **팀·리그·일정을 숨기면 있는 정보를 지운다.**
 *   처음엔 숨기려 했다가 데이터를 보고 접었다.
 *
 *   `careerStage`에 `"retired"`는 없다. 은퇴는 `retirement` 필드의 유무로 본다
 *   (`save.ts` 주석 — 마지막 소속이 기록의 일부라 단계를 안 덮는다).
 *
 * 표를 `Record<유니온, …>`으로 못박아 탭이 늘면 컴파일이 깨지게 한다.
 */

type Ctx = Pick<ProtagonistSave, "careerStage" | "retirement">;

const ALWAYS = () => true;

const NAV: Record<MainTabId, (p: Ctx) => boolean> = {
  news:     ALWAYS,
  me:       ALWAYS,
  team:     ALWAYS,
  league:   ALWAYS,
  people:   ALWAYS,
  schedule: ALWAYS,
};

/** 사이드바에서 "나"와 "세계"를 가르는 자리 — 이 다음부터 세계 쪽이다 */
export const NAV_ORDER: MainTabId[] = ["news", "me", "team", "league", "people", "schedule"];
export const NAV_GROUP_BREAK_AFTER: MainTabId = "me";

const ME: Record<MeTabId, (p: Ctx) => boolean> = {
  status:       ALWAYS,
  // 은퇴하면 더 클 일이 없다
  training:     (p) => !p.retirement,
  // 재학 중에만. 예전 `showAcademicsTab`와 같은 조건이고 정본을 여기로 옮겼다
  academics:    (p) => p.careerStage === "highschool" || p.careerStage === "university",
  // ⚠ 재정은 아마추어도 연다. `FinancePage`가 "학생·독립 무대에는 스폰서가
  // 붙지 않습니다"를 직접 말하고 용돈·구독은 단계와 무관하다 — 숨기면 안 된다
  finance:      ALWAYS,
  achievements: ALWAYS,
};

export const ME_ORDER: MeTabId[] = ["status", "training", "academics", "finance", "achievements"];

export function visibleNavTabs(p: Ctx): MainTabId[] {
  return NAV_ORDER.filter((id) => NAV[id](p));
}

export function visibleMeTabs(p: Ctx): MeTabId[] {
  return ME_ORDER.filter((id) => ME[id](p));
}

/** 지금 보고 있는 탭이 숨겨졌을 때 어디로 보낼지 — 첫 번째 보이는 탭 */
export function fallbackMeTab(p: Ctx, current: MeTabId): MeTabId {
  const vis = visibleMeTabs(p);
  return vis.includes(current) ? current : (vis[0] ?? "status");
}
