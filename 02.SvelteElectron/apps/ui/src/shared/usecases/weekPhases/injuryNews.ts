// 월간 부상 소식 — 한 달치 버퍼를 소식 하나로 만든다.
//
// ⚠ **예전엔 한 사람당 메시지 하나였다.** 매주 수술·중증이 날 때마다
// `부상 소식 — 임도훈 (중증)`이 따로 날아와 소식함이 여섯 줄씩 채워졌다.
// 오프시즌 결산과 같은 결함이고, 같은 방식으로 푼다(숫자 카드 → 목록).

import type { MessageItem } from "../../types/main";
import type { SaveSeason } from "../../types/season";
import {
  buildRows, countByClass, previewLine, type InjuryEvent,
} from "../../utils/injuryReport";
import { weekInYearOf } from "../../utils/seasonWeeks";

/** 4주마다. 기존 월간 순위표와 같은 리듬이라 소식이 한 주에 몰린다 */
export const INJURY_NEWS_PERIOD = 4;

export function isInjuryNewsWeek(weekInYear: number): boolean {
  return weekInYear > 0 && weekInYear % INJURY_NEWS_PERIOD === 0;
}

/**
 * 시즌이 몇 주 남았는가 — "시즌 아웃" 판정의 근거.
 *
 * ⚠ **모르면 0을 준다.** `injuryReport.classify`가 0이면 시즌 아웃 판정을
 * 건너뛴다 — 남은 주를 모르는데 "시즌 아웃"이라고 쓰면 화면이 지어낸 값이 된다.
 */
export function weeksLeftInSeason(season: SaveSeason, weekInYear: number): number {
  const last = season.schedule.reduce(
    (mx, e) => (e.phase === "season" || e.phase === "postseason" ? Math.max(mx, e.week) : mx),
    0,
  );
  if (last === 0) return 0;
  // `week`은 통산 주차라 연내 주차로 환산한다 — 둘을 섞으면 음수가 나온다
  const lastInYear = weekInYearOf(last);
  return Math.max(0, lastInYear - weekInYear);
}

export interface BuildInjuryNewsParams {
  events: readonly InjuryEvent[];
  weekNum: number;
  weekInYear: number;
  season: SaveSeason;
  monthLabel: string;
}

/**
 * 소식 하나. 담을 게 없으면 `null` — **빈 소식을 매달 보내지 않는다.**
 *
 * ⚠ 이름·팀명을 담지 않는다. 화면이 `npcId`로 조회한다(`injuryReport.ts` 머리말).
 */
export function buildInjuryNews(p: BuildInjuryNewsParams): MessageItem | null {
  if (p.events.length === 0) return null;

  const left = weeksLeftInSeason(p.season, p.weekInYear);
  // 집계는 사람 수다 — 한 달에 두 번 다친 사람을 두 번 세면 안 된다.
  // 이름 조회는 화면 몫이라 여기선 `people`이 비어도 맞다
  const counts = countByClass(buildRows({
    events: p.events, people: [], weeksLeftInSeason: left,
  }));
  const preview = previewLine(counts);

  return {
    id:        `msg-injury-w${p.weekNum}-${Date.now()}`,
    category:  "system",
    sender:    "리그 사무국",
    subject:   `${p.monthLabel} 부상 리포트`,
    preview,
    // 본문은 패널이 그린다. 메타데이터를 못 읽는 경로를 위한 대비책만 둔다
    body:      preview,
    createdAt: `W${p.weekNum}`,
    readAt:    null,
    metadata:  {
      type: "injury",
      week: p.weekNum,
      weeksLeftInSeason: left,
      events: [...p.events],
    },
  };
}
