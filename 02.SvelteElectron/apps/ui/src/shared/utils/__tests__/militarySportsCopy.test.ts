import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  parseMilitarySportsCopy, fillSportsCopy, sportsCalendar, militaryNews,
  MILITARY_MSG_PREFIX,
} from "../militarySportsCopy";
import type { MilitaryCalendarEntry } from "../../types/militaryLife";

/**
 * 체육부대 병역 탭 (§39) — **정본은 데이터다**(`messages/military_sports.json`).
 *
 * ⚠ **데이터가 코드와 어긋나도 아무도 안 죽고 로그도 안 남는다.** 게임은 돌고
 * 화면만 옛 배너로 떨어진다 — 이 저장소가 이벤트 로더에서 겪은 형태다.
 * 그래서 파일 셋(문안 · 부대 일정 · 소식 id 규칙)을 직접 읽어 맞춘다.
 *
 * 🔴 여기서 보는 것 넷:
 *   ① 로더가 실제 파일을 통과시킨다
 *   ② 문안의 `calendar.eventIds` 가 **calendar.json 에 실제로 있는 자리**다
 *   ③ 상무엔 보직이 없다 — 보직 전용(`role`) 자리가 안 섞인다
 *   ④ 소식 고르기가 `advanceWeek` 가 만드는 **id 규칙**과 같다
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const RAW = JSON.parse(readFileSync(join(MASTER, "messages/military_sports.json"), "utf8"));
const CALENDAR = JSON.parse(
  readFileSync(join(MASTER, "military/calendar.json"), "utf8"),
) as MilitaryCalendarEntry[];
/** 소식 id 를 만드는 자리 — 규칙이 바뀌면 목록이 조용히 0건이 된다 */
const ADVANCE_WEEK = readFileSync(
  join(__dirname, "../../usecases/advanceWeek.ts"), "utf8");

describe("체육부대 문안 데이터", () => {
  it("로더가 실제 파일을 통과시킨다", () => {
    expect(parseMilitarySportsCopy(RAW)).not.toBeNull();
  });

  it("한 칸이라도 비면 통째로 안 그린다", () => {
    // ⚠ 반 토막 화면보다 옛 배너가 낫다 — 「없다」와 「비었다」를 안 섞는다
    const half = JSON.parse(JSON.stringify(RAW));
    half.noGames.body = "";
    expect(parseMilitarySportsCopy(half)).toBeNull();
    expect(parseMilitarySportsCopy(null)).toBeNull();
    expect(parseMilitarySportsCopy({})).toBeNull();
  });

  it("자리표가 데이터에 있고 코드가 채운다", () => {
    const copy = parseMilitarySportsCopy(RAW)!;
    expect(copy.discharge.progress).toContain("{total}");
    expect(copy.discharge.progress).toContain("{done}");
    expect(copy.calendar.ahead).toContain("{n}");
    expect(copy.calendar.leave).toContain("{days}");
    expect(copy.news.more).toContain("{n}");
    const line = fillSportsCopy(copy.discharge.progress, { total: 100, done: 40 });
    expect(line).toContain("100");
    expect(line).toContain("40");
    expect(line).not.toContain("{");
  });

  it("값이 없는 자리표는 그대로 남긴다", () => {
    // 조용히 빈 칸이 되면 "왜 문장이 반 토막인가"의 답이 화면에 없다
    expect(fillSportsCopy("{n}주 뒤", {})).toBe("{n}주 뒤");
  });
});

describe("상무 부대 일정", () => {
  const copy = parseMilitarySportsCopy(RAW)!;
  const ids = copy.calendar.eventIds ?? [];

  it("문안이 일정 목록을 갖는다", () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  it("목록의 자리가 calendar.json 에 실제로 있다", () => {
    // ⚠ 없는 id 를 적으면 화면이 조용히 짧아진다 — 오타 하나가 그 꼴이다
    const known = new Set(CALENDAR.map((c) => c.event));
    for (const id of ids) expect(known.has(id), `${id} 가 calendar.json 에 없다`).toBe(true);
  });

  it("보직 전용은 안 섞인다 — 상무는 보직을 안 묻는다", () => {
    const got = sportsCalendar(CALENDAR, ids);
    expect(got.length).toBe(ids.length);
    for (const c of got) expect(c.role ?? null).toBeNull();
  });

  it("주차 오름차순이다", () => {
    const got = sportsCalendar(CALENDAR, ids);
    for (let i = 1; i < got.length; i++) expect(got[i].week).toBeGreaterThanOrEqual(got[i - 1].week);
  });

  it("입소부터 전역까지 이어진다", () => {
    const got = sportsCalendar(CALENDAR, ids);
    const last = CALENDAR.slice().sort((a, b) => a.week - b.week).at(-1)!;
    expect(got[0].week).toBe(1);
    expect(got.at(-1)!.event).toBe(last.event);
  });

  it("목록이 없으면 보직 전용만 뺀 전부다 — 조용히 0건이 되지 않는다", () => {
    const got = sportsCalendar(CALENDAR, undefined);
    expect(got.length).toBe(CALENDAR.filter((c) => c.role === undefined || c.role === null).length);
    expect(got.length).toBeGreaterThan(ids.length);
  });
});

describe("부대 소식 고르기", () => {
  it("advanceWeek 이 만드는 id 접두사와 같다", () => {
    // 🔴 접두사가 갈리면 목록이 **에러 없이 0건**이 된다. 만드는 자리를 직접 본다
    expect(ADVANCE_WEEK).toContain(`id: \`${MILITARY_MSG_PREFIX}`);
  });

  it("군 소식만 남기고 순서를 안 바꾼다", () => {
    const box = [
      { id: `${MILITARY_MSG_PREFIX}MIL_SPT_COACH_TIP-2031-w12` },
      { id: "msg-standings-LEAGUE_KBL-w12" },
      { id: `${MILITARY_MSG_PREFIX}MIL_COM_FAMILY_VISIT-2031-w9` },
    ];
    const got = militaryNews(box);
    expect(got.map((m) => m.id)).toEqual([box[0].id, box[2].id]);
  });

  it("군 소식이 없으면 빈 목록이다", () => {
    expect(militaryNews([{ id: "msg-news-1" }])).toHaveLength(0);
  });
});
