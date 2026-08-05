import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parkViewOf, parkViewForHomeTeam, defaultParkView } from "../parkView";
import { PARK_COORDS, PARK_TIER_OF, PARK_IMAGES, type ParkTier } from "../parkAnchors";

interface RefTeam { id: string; name: string; leagueId: string; stadium?: string }
const refs = JSON.parse(
  readFileSync(join(process.cwd(), "resource/data/master/entities/refs.json"), "utf8"),
) as { teams: RefTeam[]; stadiums: { id: string; name: string }[] };

const TIERS: ParkTier[] = ["pro", "university", "highschool"];

describe("좌표표 자체", () => {
  it("세 티어가 다 있다", () => {
    for (const t of TIERS) expect(PARK_COORDS[t]).toBeDefined();
  });

  it("수비 9자리가 티어마다 다 있다", () => {
    for (const t of TIERS) {
      const pos = PARK_COORDS[t].defense.map((d) => d.pos).sort();
      expect(pos).toEqual(["1B", "2B", "3B", "C", "CF", "LF", "P", "RF", "SS"].sort());
    }
  });

  it("좌표가 viewBox 안에 있다", () => {
    for (const t of TIERS) {
      const c = PARK_COORDS[t];
      for (const p of [...Object.values(c.field), ...c.defense]) {
        expect(p.x, `${t}`).toBeGreaterThan(0);
        expect(p.x, `${t}`).toBeLessThan(1000);
        expect(p.y, `${t}`).toBeGreaterThan(0);
        expect(p.y, `${t}`).toBeLessThan(920);
      }
    }
  });

  it("티어마다 좌표가 실제로 다르다 — 같으면 티어를 나눈 뜻이 없다", () => {
    const key = (t: ParkTier) => JSON.stringify(PARK_COORDS[t].field);
    expect(key("pro")).not.toBe(key("university"));
    expect(key("pro")).not.toBe(key("highschool"));
    expect(key("university")).not.toBe(key("highschool"));
  });

  it("프로 좌표는 예전 값 그대로다 — 프로 10장은 기존 GIF와 지면이 같다", () => {
    expect(PARK_COORDS.pro.field).toEqual({
      home:   { x: 497, y: 790 },
      first:  { x: 715, y: 580 },
      second: { x: 497, y: 454 },
      third:  { x: 280, y: 580 },
      mound:  { x: 497, y: 548 },
    });
  });

  it("다이아몬드가 야구답게 놓여 있다 — 홈이 제일 아래, 2루가 제일 위", () => {
    for (const t of TIERS) {
      const f = PARK_COORDS[t].field;
      expect(f.home.y, `${t} 홈`).toBeGreaterThan(f.first.y);
      expect(f.first.y, `${t} 1루`).toBeGreaterThan(f.second.y);
      expect(f.third.x, `${t} 3루`).toBeLessThan(f.home.x);
      expect(f.first.x, `${t} 1루`).toBeGreaterThan(f.home.x);
      // 1루와 3루는 같은 높이
      expect(Math.abs(f.first.y - f.third.y), `${t} 1·3루 높이`).toBeLessThanOrEqual(2);
      // 마운드는 홈과 2루 사이
      expect(f.mound.y).toBeLessThan(f.home.y);
      expect(f.mound.y).toBeGreaterThan(f.second.y);
    }
  });
});

describe("구장 → 화면", () => {
  it("전용 그림이 있는 구장은 그 PNG를 쓴다", () => {
    const v = parkViewOf("STADIUM_SEOUL_GUARDIANS");
    expect(v.imageUrl).toBe("/park/STADIUM_SEOUL_GUARDIANS.png");
    expect(v.tier).toBe("pro");
    expect(v.hasOwnImage).toBe(true);
  });

  it("티어에 맞는 좌표가 붙는다", () => {
    expect(parkViewOf("STADIUM_MIREU").coords).toBe(PARK_COORDS.university);
    expect(parkViewOf("STADIUM_HANGANG").coords).toBe(PARK_COORDS.highschool);
    expect(parkViewOf("STADIUM_SEOUL_GUARDIANS").coords).toBe(PARK_COORDS.pro);
  });

  it("독립 구장은 대학 좌표를 쓴다 — 기준 그림이 같다", () => {
    expect(parkViewOf("STADIUM_GANGBYEON").tier).toBe("university");
  });

  it("모르는 구장은 프로 기본값으로 떨어진다 — 화면이 비지 않는다", () => {
    const v = parkViewOf("STADIUM_존재하지않음");
    expect(v.imageUrl).toBe("/park/probaseball.gif");
    expect(v.coords).toBe(PARK_COORDS.pro);
    expect(v.hasOwnImage).toBe(false);
  });

  it("해외 팀의 한글 구장 이름도 조용히 기본값이 된다", () => {
    // ABL·JBL은 구장을 ID가 아니라 한글 이름 문자열로 참조하고 정의가 없다
    expect(parkViewOf("도쿄돔").imageUrl).toBe("/park/probaseball.gif");
  });

  it("구장이 비어 있어도 터지지 않는다", () => {
    for (const v of [parkViewOf(""), parkViewOf(null), parkViewOf(undefined)]) {
      expect(v.coords).toBe(PARK_COORDS.pro);
    }
  });
});

describe("홈 팀 → 구장", () => {
  it("홈 팀의 구장을 쓴다 — 원정 팀 구장에서 하지 않는다", () => {
    const home = refs.teams.find((t) => t.id === "TEAM_HS_AEWOL")!;
    const v = parkViewForHomeTeam(home.id, refs.teams);
    expect(v.stadiumId).toBe(home.stadium);
    expect(v.tier).toBe("highschool");
  });

  it("모르는 팀은 기본값", () => {
    expect(parkViewForHomeTeam("TEAM_없음", refs.teams).coords).toBe(PARK_COORDS.pro);
    expect(parkViewForHomeTeam(null, refs.teams)).toEqual(defaultParkView());
  });
});

describe("데이터 정합 — 표본이 아니라 전수", () => {
  it("국내 팀 전부가 그림 있는 구장에 배정돼 있다", () => {
    const DOMESTIC = new Set([
      "LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT", "LEAGUE_KBL",
    ]);
    const bad: string[] = [];
    for (const t of refs.teams) {
      if (!DOMESTIC.has(t.leagueId)) continue;
      const v = parkViewForHomeTeam(t.id, refs.teams);
      if (!v.hasOwnImage) bad.push(`${t.id}(${t.stadium ?? "구장없음"})`);
    }
    expect(bad, `그림 없는 구장에 배정된 팀: ${bad.slice(0, 8).join(" ")}`).toEqual([]);
  });

  it("refs의 구장 정의 27개가 전부 티어를 갖는다", () => {
    const missing = refs.stadiums.filter((s) => !PARK_TIER_OF[s.id]).map((s) => s.id);
    expect(missing, `티어 없는 구장: ${missing.join(" ")}`).toEqual([]);
  });

  it("티어표와 그림표의 구장 목록이 같다", () => {
    expect([...PARK_IMAGES].sort()).toEqual(Object.keys(PARK_TIER_OF).sort());
  });

  it("고교 구장은 전부 highschool 티어다 — 잔디 섞이면 안 된다", () => {
    const hsTeams = refs.teams.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL");
    expect(hsTeams.length).toBeGreaterThan(0);
    for (const t of hsTeams) {
      expect(parkViewForHomeTeam(t.id, refs.teams).tier, t.id).toBe("highschool");
    }
  });

  it("KBL 팀은 전부 pro 티어다", () => {
    const kbl = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL");
    for (const t of kbl) {
      expect(parkViewForHomeTeam(t.id, refs.teams).tier, t.id).toBe("pro");
    }
  });
});
