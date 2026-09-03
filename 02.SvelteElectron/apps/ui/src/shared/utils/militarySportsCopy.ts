/**
 * 체육부대(상무) 병역 탭 문안 — **정본은 `resource/data/master/messages/military_sports.json`이다**
 * (PLAN_MILITARY_LIFE §39).
 *
 * 🔴 **코드에 문장을 적지 않는다.** 이 파일은 그 JSON의 모양(타입)과 채우는
 * 규칙만 갖는다. `roleChoiceCopy.ts`(B-12)·`contractCopy.ts`(B-13)·
 * `dashboardCopy.ts`(B-21)가 먼저 같은 선을 그었다.
 *
 * ## 못 읽으면 화면을 지우는 게 아니라 안 그린다
 *
 * 보직 소식은 문안이 없으면 소식 자체를 안 만든다. 여기는 화면이라 다르다 —
 * 문안이 없으면 **그 칸을 통째로 안 그리고 옛 배너만 남긴다.** 말을 지어내지
 * 않는다. 값(전역까지 몇 주·일정·소식)은 문안과 무관하게 이미 있으므로
 * 「데이터가 없다」와 「문안이 없다」가 섞이지 않게 하려는 것이다.
 *
 * ## 일정은 **`eventIds` 가 정본이다**
 *
 * 상무는 현역 부대 일정을 다 겪지 않는다(§39 — 사격·행군·혹한기·유격·진지
 * 공사는 현역 것이다). 어느 자리가 상무에도 있는지는 **데이터가 정한다** —
 * 코드에 id 목록을 적으면 데이터가 바뀔 때 한쪽만 고쳐진 채 남는다.
 *
 * ⚠ `eventIds` 가 없으면 **보직 전용(`role`)만 뺀 전부**를 그린다. 조용히
 *   빈 목록이 되면 「일정이 없다」와 「목록을 안 실었다」가 같아 보인다.
 */
import type { MilitaryCalendarEntry } from "../types/militaryLife";

export interface MilitarySportsCopy {
  head: { title: string; lead: string };
  discharge: {
    title: string; unit: string; progress: string;
    done: string; dateLead: string; dateForm: string;
  };
  noGames: { title: string; body: string; note: string };
  calendar: {
    title: string; lead: string; past: string; upcoming: string;
    emptyPast: string; emptyUpcoming: string; ahead: string; leave: string;
    /** 상무에도 있는 일정의 `event` id. 없으면 보직 전용만 뺀 전부 */
    eventIds?: string[];
  };
  news: { title: string; lead: string; empty: string; more: string };
}

/** 문자열 칸이 다 찼는지 — 한 칸이라도 비면 화면이 반 토막이라 통째로 접는다 */
function filled(o: unknown, keys: readonly string[]): boolean {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === "string" && (r[k] as string).length > 0);
}

export function parseMilitarySportsCopy(raw: unknown): MilitarySportsCopy | null {
  const o = raw as Partial<MilitarySportsCopy> | null;
  if (!o || typeof o !== "object") return null;
  if (!filled(o.head, ["title", "lead"])) return null;
  if (!filled(o.discharge, ["title", "unit", "progress", "done", "dateLead", "dateForm"])) return null;
  if (!filled(o.noGames, ["title", "body", "note"])) return null;
  if (!filled(o.calendar, ["title", "lead", "past", "upcoming", "emptyPast", "emptyUpcoming", "ahead", "leave"])) return null;
  if (!filled(o.news, ["title", "lead", "empty", "more"])) return null;
  const ids = (o.calendar as MilitarySportsCopy["calendar"]).eventIds;
  return {
    head: o.head as MilitarySportsCopy["head"],
    discharge: o.discharge as MilitarySportsCopy["discharge"],
    noGames: o.noGames as MilitarySportsCopy["noGames"],
    calendar: {
      ...(o.calendar as MilitarySportsCopy["calendar"]),
      eventIds: Array.isArray(ids) && ids.every((x) => typeof x === "string") ? ids : undefined,
    },
    news: o.news as MilitarySportsCopy["news"],
  };
}

/**
 * 자리표를 채운다. **정규식을 안 쓴다** — 이름이 다섯뿐이라 그대로 잇는다
 * (`roleChoiceCopy.fillRoleCopy` 와 같은 선).
 *
 * ⚠ 값이 없는 자리표는 **그대로 남긴다.** 조용히 빈 칸이 되면 "왜 문장이
 * 반 토막인가"의 답이 화면 어디에도 없다.
 */
export function fillSportsCopy(
  tmpl: string, vars: Partial<Record<"total" | "done" | "n" | "days" | "year", string | number>>,
): string {
  let out = tmpl;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined || v === null) continue;
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/**
 * 상무가 겪는 일정만 남긴다 — 순서는 주차 오름차순.
 *
 * ⚠ **보직 전용은 언제나 뺀다.** 상무는 보직을 안 묻는다(사용자 결정 09-03)
 *   므로 `role` 이 붙은 자리는 주인이 없다.
 */
export function sportsCalendar(
  calendar: MilitaryCalendarEntry[], eventIds: string[] | undefined,
): MilitaryCalendarEntry[] {
  const allow = eventIds ? new Set(eventIds) : null;
  return calendar
    .filter((c) => c.role === undefined || c.role === null)
    .filter((c) => (allow ? allow.has(c.event) : true))
    .slice()
    .sort((a, b) => a.week - b.week);
}

/**
 * 소식함에서 군 이벤트 소식만 — 최신순 그대로.
 *
 * ⚠ **`sender` 로 고르지 않는다.** 「체육부대」는 문장이라 데이터가 바뀌면
 *   조용히 0건이 된다. `id` 접두사는 `advanceWeek` 가 만드는 규칙이고
 *   (`msg-mil-<이벤트 id>-<연도>-w<주>`) 코드가 정본이다.
 */
export const MILITARY_MSG_PREFIX = "msg-mil-";

export function militaryNews<T extends { id: string }>(mailbox: T[]): T[] {
  return mailbox.filter((m) => m.id.startsWith(MILITARY_MSG_PREFIX));
}
