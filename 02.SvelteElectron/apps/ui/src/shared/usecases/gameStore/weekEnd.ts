/**
 * **주차 결과 배치 적용** (2026-09-30 · Ⅱ-2 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `stores/game.ts` 의
 *   `applyWeekEndBatch` 하나가 그대로 나왔다. 바뀐 것은 머리 두 줄과
 *   들여쓰기 4칸, 그리고 `import("../types/save")` 경로다.
 *
 * ⚠ **왜 store 밖인가.** 주 하나를 닫으면서 **일곱 축을 순서대로** 접는다 —
 *   패치 → 주목도 → 인기도 → 주목도(TOP10) → 사기 → 소식함 → TOP10 스냅샷.
 *   그 **순서에 뜻이 있다**: `{ ...protagonist, ...patch }` 를 먼저 만들고 그
 *   위에 `moraleDelta`(TOP10 보상)를 더해야 사기 회귀가 기준값이 되고 보상이
 *   얹힌다. 거꾸로면 회귀가 보상을 덮어 TOP10 이 아무 일도 안 하게 된다
 *   (`weekPhases/weeklyTraining.ts` 의 사기 절 주석이 그 짝이다).
 *
 * ⚠ **`update` 를 첫 인자에서 풀어서 받는다** — 본문의 `update(…)` 가 그대로 돈다.
 *
 * ⚠ 업적 진행은 `game.ts` 의 `updateAchievementProgress` **하나**를 쓴다 —
 *   여기에 사본을 만들지 않는다.
 *
 * ⚠ 검사는 `gamePathSrc()` 가 이 파일을 `game.ts` 와 한 덩이로 읽는다.
 */
import type { GameStoreState } from "../../stores/game";
import {
  computeWeekLabel,
  toPlayerCompat,
  toSchoolCompat,
  updateAchievementProgress,
} from "../../stores/game";
import { pushMailbox } from "./mailbox";
import type { MessageItem } from "../../types/main";
import type { AchievementMetrics, ProtagonistSave } from "../../types/save";

/** 스토어가 건네는 손잡이 */
export interface WeekEndCtx {
  update: (fn: (s: GameStoreState) => GameStoreState) => void;
}

export function applyWeekEndBatch(
  { update }: WeekEndCtx,
  batch: {
    protagonistPatch: Partial<ProtagonistSave>;
    logs: string[];
    weekNum: number;
    seasonYear: number;
    scoutScoreDelta?: number;
    top10Snapshot?: import("../../types/save").Top10Snapshot;
    popularityDelta?: number;
    scoutScoreDelta2?: number;
    moraleDelta?: number;
    messages?: MessageItem[];
  },
) {
  update((s) => {
    const nextMetrics: AchievementMetrics = {
      ...s.achievementMetrics,
      trainingWeeksTotal: s.achievementMetrics.trainingWeeksTotal + 1,
    };
    let p = { ...s.protagonist, ...batch.protagonistPatch };
    if (batch.scoutScoreDelta && batch.scoutScoreDelta > 0)
      p = { ...p, scoutScore: Math.max(0, Math.min(100, p.scoutScore + batch.scoutScoreDelta)) };
    if (batch.popularityDelta && batch.popularityDelta > 0)
      p = { ...p, popularity: Math.max(0, Math.min(100, p.popularity + batch.popularityDelta)) };
    if (batch.scoutScoreDelta2 && batch.scoutScoreDelta2 > 0)
      p = { ...p, scoutScore: Math.max(0, Math.min(100, p.scoutScore + batch.scoutScoreDelta2)) };
    if (batch.moraleDelta && batch.moraleDelta > 0)
      p = { ...p, morale: Math.max(0, Math.min(100, p.morale + batch.moraleDelta)) };
    let mailbox = s.mailbox;
    if (batch.messages?.length) mailbox = pushMailbox(batch.messages, s.mailbox);
    let lastTop10Pitcher = s.lastTop10Pitcher;
    let lastTop10Batter = s.lastTop10Batter;
    if (batch.top10Snapshot) {
      if (batch.top10Snapshot.type === "pitcher") lastTop10Pitcher = batch.top10Snapshot;
      else lastTop10Batter = batch.top10Snapshot;
    }
    return {
      ...s,
      protagonist: p,
      dayLabel: computeWeekLabel(batch.weekNum, batch.seasonYear),
      logs: [...batch.logs, ...s.logs].slice(0, 30),
      upcoming: [],
      player: toPlayerCompat(p),
      school: toSchoolCompat(p.careerStage, s.schoolState),
      achievementMetrics: nextMetrics,
      achievements: updateAchievementProgress(s.achievements, nextMetrics),
      mailbox,
      lastTop10Pitcher,
      lastTop10Batter,
    };
  });
}
