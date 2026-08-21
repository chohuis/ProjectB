// ── 일정 델타 ──────────────────────────────────────────────────────────────
//
// 🔴 **시즌 전체 일정을 매주 다시 보내고 있었다.** `repo:setSeason`이 IPC의
// **32.5%**(975MB/시즌)이고 그중 90%가 일정인데, 주마다 실제로 달라지는 건
// **3.3%**뿐이다(실측 7,080건 중 235건 — 그 주에 치른 경기다).
//
// 그래서 바뀐 항목만 보낸다. 천장은 **94.4% 감축**, 전체 IPC로는 약 -27%다.
//
// ⚠ **NPC는 이 방식이 안 통했다.** 거긴 `xp`가 매주 변해 95%가 더티였고
// 더티 셋이 -4.5%뿐이었다. **재고 나서 고른 자리다.**
//
// ⚠ **지우기는 델타로 못 나른다.** 시즌이 넘어가 일정이 통째로 갈리면
// 항목이 사라지는데, 델타는 "덮어쓰기"만 표현한다. 그래서 **항목이 줄면
// 전량 모드로 떨어진다** — 안 그러면 옛 일정이 slot.db에 남는다.

import type { ScheduleEntry } from "../types/season";

export interface ScheduleDeltaItem {
  /** `"primary"`(주인공 리그) 또는 `"league"` — slot.db `schedule.bucket`과 같다 */
  bucket: "primary" | "league";
  leagueId: string;
  entry: ScheduleEntry;
}

interface SeasonLike {
  schedule?: ScheduleEntry[];
  leagueSchedules?: Record<string, ScheduleEntry[]>;
}

/** 직전에 보낸 일정 — `bucket|leagueId|entryId` → 직렬화 문자열 */
let _last = new Map<string, string>();

/**
 * 슬롯을 바꾸거나 새 게임을 시작하면 비운다.
 *
 * ⚠ **안 비우면 다른 세계의 일정을 "안 바뀌었다"고 판단한다.** 그러면 그
 * 경기가 영영 저장되지 않는다 — 조용히 사라지는 종류의 결함이다.
 */
export function resetScheduleDelta(): void {
  _last = new Map();
}

const keyOf = (bucket: string, lid: string, id: string) => `${bucket}|${lid}|${id}`;

/**
 * 직전 저장 이후 달라진 일정 항목만 뽑는다.
 *
 * `null`을 돌려주면 **전량 모드로 보내야 한다**:
 *   · 첫 저장(비교 대상이 없다)
 *   · 항목이 줄었다(지우기를 델타로 못 나른다)
 *
 * ⚠ **부작용이 있다** — 뽑는 김에 스냅샷을 갱신한다. 결과를 안 쓰고 버리면
 * 그 항목들이 "이미 보냈다"로 남아 **다음에도 안 보내진다.** 저장이 실패할 수
 * 있는 자리에서는 `rollback`을 부른다.
 */
export function collectScheduleDelta(season: SeasonLike): ScheduleDeltaItem[] | null {
  const cur = new Map<string, string>();
  const items: ScheduleDeltaItem[] = [];

  const scan = (bucket: "primary" | "league", lid: string, list?: ScheduleEntry[]) => {
    if (!Array.isArray(list)) return;
    for (const e of list) {
      if (!e || typeof e.id !== "string") continue;
      const k = keyOf(bucket, lid, e.id);
      const j = JSON.stringify(e);
      cur.set(k, j);
      if (_last.get(k) !== j) items.push({ bucket, leagueId: lid, entry: e });
    }
  };

  scan("primary", "", season.schedule);
  for (const [lid, list] of Object.entries(season.leagueSchedules ?? {})) {
    scan("league", lid, list);
  }

  const first = _last.size === 0;
  // 항목이 줄었으면 지운 것이 있다 — 델타로는 못 나른다
  const shrank = !first && cur.size < _last.size;

  _prev = _last;
  _last = cur;
  return first || shrank ? null : items;
}

/** `collectScheduleDelta` 직전 상태 — 저장이 실패하면 여기로 되돌린다 */
let _prev = new Map<string, string>();

/**
 * 스냅샷을 직전 상태로 되돌린다.
 *
 * 저장이 실패했는데 스냅샷만 앞서 가면 **그 항목들이 영영 안 보내진다.**
 * 한 단계만 되돌릴 수 있으면 충분하다 — 저장은 순차로 일어난다.
 */
export function rollbackScheduleDelta(): void {
  _last = _prev;
}
