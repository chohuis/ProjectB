import { describe, it, expect } from "vitest";
import {
  CATEGORIES, categoriesFor, cardCategoriesFor, categoryByKey,
  qualificationOf, qualifies, rankBy, rate3, type LbRow,
} from "../leaderboard";
import type { PitcherSeasonStats, BatterSeasonStats } from "../../types/save";

function pit(id: string, o: Partial<PitcherSeasonStats>): LbRow {
  const s: PitcherSeasonStats = {
    type: "pitcher", g: 0, gs: 0, w: 0, l: 0, sv: 0, hd: 0,
    ip: 0, er: 0, h: 0, k: 0, bb: 0, era: 0, whip: 0, ...o,
  };
  return { id, name: id, team: "T", stats: s, qualified: false };
}
function bat(id: string, o: Partial<BatterSeasonStats>): LbRow {
  const s: BatterSeasonStats = {
    type: "batter", g: 0, pa: 0, ab: 0, h: 0, hr: 0, rbi: 0,
    sb: 0, bb: 0, k: 0, avg: 0, obp: 0, slg: 0, ops: 0, ...o,
  };
  return { id, name: id, team: "T", stats: s, qualified: false };
}
function withQual(rows: LbRow[], q: ReturnType<typeof qualificationOf>): LbRow[] {
  return rows.map((r) => ({ ...r, qualified: qualifies(r.stats, q) }));
}

describe("부문 정의", () => {
  it("찾던 넷이 전부 부문으로 있다 — 이게 U6의 목적이다", () => {
    for (const k of ["sv", "hd", "sb", "obp", "slg"]) {
      expect(categoryByKey(k), `${k} 부문이 없다`).toBeTruthy();
    }
  });

  it("키가 겹치지 않는다", () => {
    const keys = CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ERA·WHIP은 낮을수록 위다", () => {
    expect(categoryByKey("era")!.dir).toBe("asc");
    expect(categoryByKey("whip")!.dir).toBe("asc");
    expect(categoryByKey("k")!.dir).toBe("desc");
  });

  it("세이브·홀드·도루·홈런은 누적이라 자격을 안 건다", () => {
    for (const k of ["sv", "hd", "sb", "hr", "rbi", "w", "k"]) {
      expect(categoryByKey(k)!.kind, `${k}`).toBe("count");
    }
  });

  it("ERA·타율·출루율·장타율은 비율이라 자격이 필요하다", () => {
    for (const k of ["era", "whip", "avg", "obp", "slg", "ops"]) {
      expect(categoryByKey(k)!.kind, `${k}`).toBe("rate");
    }
  });

  it("양쪽 다 카드가 다섯 장씩 나온다", () => {
    expect(cardCategoriesFor("pitcher")).toHaveLength(5);
    expect(cardCategoriesFor("batter")).toHaveLength(5);
  });

  it("부문은 투타로 갈린다", () => {
    expect(categoriesFor("pitcher").every((c) => c.side === "pitcher")).toBe(true);
    expect(categoriesFor("batter").every((c) => c.side === "batter")).toBe(true);
  });
});

describe("규정이닝 · 규정타석", () => {
  it("경기 수에 비례한다", () => {
    const q = qualificationOf(144);
    expect(q.ip).toBe(144);
    expect(q.pa).toBe(446);
  });

  it("경기가 적은 리그에서도 바닥값이 남는다 — 안 그러면 순위표가 통째로 빈다", () => {
    const q = qualificationOf(4);
    expect(q.ip).toBe(10);
    expect(q.pa).toBe(20);
  });

  it("시즌 초에는 요구치도 작다 — 순위표가 처음부터 돈다", () => {
    expect(qualificationOf(30).ip).toBe(30);
    expect(qualificationOf(30).pa).toBe(93);
  });
});

describe("순위 매기기", () => {
  const q = qualificationOf(100);   // ip 100 · pa 310

  it("10이닝 0점대가 ERA 1위를 뺏지 못한다", () => {
    const rows = withQual([
      pit("ace",   { ip: 180, era: 2.14 }),
      pit("cameo", { ip: 10,  era: 0.00 }),
    ], q);
    const top = rankBy(rows, categoryByKey("era")!);
    expect(top).toHaveLength(1);
    expect(top[0].id).toBe("ace");
  });

  it("마무리는 규정이닝을 못 채워도 세이브 1위가 된다", () => {
    // ⚠ 여기서 자격을 걸면 세이브왕이 영원히 안 나온다 — 이 게임에서
    // 실제로 41개를 던진 마무리가 화면 어디에도 없었던 이유다
    const rows = withQual([
      pit("closer", { ip: 64, sv: 34 }),
      pit("ace",    { ip: 180, sv: 0 }),
    ], q);
    const top = rankBy(rows, categoryByKey("sv")!);
    expect(top[0].id).toBe("closer");
    expect(top).toHaveLength(2);
  });

  it("도루왕도 같은 이유로 자격이 없다", () => {
    const rows = withQual([
      bat("runner", { pa: 120, sb: 47 }),
      bat("slug",   { pa: 600, sb: 2 }),
    ], q);
    expect(rankBy(rows, categoryByKey("sb")!)[0].id).toBe("runner");
  });

  it("타율은 규정타석을 채운 선수만", () => {
    const rows = withQual([
      bat("reg",  { pa: 500, avg: 0.312 }),
      bat("part", { pa: 40,  avg: 0.500 }),
    ], q);
    const top = rankBy(rows, categoryByKey("avg")!);
    expect(top).toHaveLength(1);
    expect(top[0].id).toBe("reg");
  });

  it("동률은 ID로 갈라 순서가 흔들리지 않는다", () => {
    const rows = withQual([
      pit("zz", { ip: 120, w: 15 }), pit("aa", { ip: 120, w: 15 }),
      pit("mm", { ip: 120, w: 15 }),
    ], q);
    const a = rankBy(rows, categoryByKey("w")!).map((r) => r.id);
    const b = rankBy([...rows].reverse(), categoryByKey("w")!).map((r) => r.id);
    expect(a).toEqual(["aa", "mm", "zz"]);
    expect(a).toEqual(b);
  });

  it("limit이 0이면 전부 준다 — 전체표가 쓴다", () => {
    const rows = withQual(Array.from({ length: 30 }, (_, i) =>
      pit(`p${i}`, { ip: 120, k: i })), q);
    expect(rankBy(rows, categoryByKey("k")!)).toHaveLength(30);
    expect(rankBy(rows, categoryByKey("k")!, 5)).toHaveLength(5);
  });
});

describe("표기", () => {
  it("비율은 앞의 0을 뗀다", () => {
    expect(rate3(0.312)).toBe(".312");
    expect(rate3(0.05)).toBe(".050");
  });
  it("1할 이상은 그대로 둔다 — OPS는 1을 넘는다", () => {
    expect(rate3(1.024)).toBe("1.024");
  });
});
