import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarkIndex,
  fallbackSpec,
  teamMarkSvg,
  markKey,
  groupKey,
  SHELL,
  type MarkTeam,
} from "../teamMark";

interface RefTeam {
  id: string;
  name: string;
  leagueId: string;
  stadium?: string;
  colors?: string[];
}
const refs = JSON.parse(
  readFileSync(join(process.cwd(), "resource/data/master/entities/refs.json"), "utf8"),
) as { teams: RefTeam[] };
const TEAMS: MarkTeam[] = refs.teams;

describe("마크 키", () => {
  it("1군과 2군은 같은 마크다", () => {
    expect(markKey("TEAM_KBL_BUSAN_WAVES_1")).toBe(markKey("TEAM_KBL_BUSAN_WAVES_2"));
    expect(markKey("TEAM_ABL_EMPIRE_1")).toBe(markKey("TEAM_ABL_EMPIRE_2"));
    expect(markKey("TEAM_JBL_CL_NEONCRANES_1")).toBe(markKey("TEAM_JBL_CL_NEONCRANES_2"));
  });

  it("꼬리표가 없는 팀은 그대로", () => {
    expect(markKey("TEAM_HS_AEWOL")).toBe("TEAM_HS_AEWOL");
    expect(markKey("TEAM_UNIV_ASAN")).toBe("TEAM_UNIV_ASAN");
  });

  it("고교는 권역이 그룹이고 나머지는 리그다", () => {
    expect(
      groupKey({ id: "x", name: "", leagueId: "LEAGUE_HIGHSCHOOL", stadium: "STADIUM_HALLA" }),
    ).toBe("STADIUM_HALLA");
    expect(groupKey({ id: "x", name: "", leagueId: "LEAGUE_KBL", stadium: "STADIUM_X" })).toBe(
      "LEAGUE_KBL",
    );
  });
});

describe("전 팀 배정 (refs.json 실측)", () => {
  const index = buildMarkIndex(TEAMS);

  it("팀이 실제로 읽혔다 — 경로가 어긋나면 조용히 통과한다", () => {
    expect(TEAMS.length).toBeGreaterThan(200);
  });

  it("모든 팀에 마크가 있다 (1군·2군 합쳐 한 벌)", () => {
    const keys = new Set(TEAMS.map((t) => markKey(t.id)));
    expect(index.size).toBe(keys.size);
    for (const t of TEAMS) expect(index.has(markKey(t.id)), t.id).toBe(true);
  });

  it("⚠ 같은 그룹 안에서 (외곽·문양) 짝이 안 겹친다 — 이게 이 설계의 전제다", () => {
    const byGroup = new Map<string, Set<string>>();
    const dup: string[] = [];
    const seen = new Set<string>();
    for (const t of TEAMS) {
      const key = markKey(t.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const g = groupKey(t);
      const s = index.get(key)!;
      const pair = `${s.shell}/${s.motif}`;
      if (!byGroup.has(g)) byGroup.set(g, new Set());
      if (byGroup.get(g)!.has(pair)) dup.push(`${g}: ${t.name} ${pair}`);
      byGroup.get(g)!.add(pair);
    }
    expect(dup).toEqual([]);
  });

  it("가장 큰 그룹이 60팀 미만이다 — 넘으면 위 보장이 깨진다", () => {
    const count = new Map<string, number>();
    const seen = new Set<string>();
    for (const t of TEAMS) {
      const key = markKey(t.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const g = groupKey(t);
      count.set(g, (count.get(g) ?? 0) + 1);
    }
    const biggest = Math.max(...count.values());
    expect(biggest, "외곽 5 × 문양 12의 최소공배수는 60이다").toBeLessThan(60);
  });

  it("같은 목록을 두 번 넣으면 같은 결과가 나온다", () => {
    const a = buildMarkIndex(TEAMS);
    const b = buildMarkIndex([...TEAMS].reverse());
    for (const [k, v] of a) expect(b.get(k), k).toEqual(v);
  });

  it("이름에 뜻이 있으면 그 문양이 붙는다", () => {
    const of = (name: string) => {
      const t = TEAMS.find((x) => x.name === name)!;
      return index.get(markKey(t.id))!.motif;
    };
    expect(of("부산 웨이브스")).toBe("wave");
    expect(of("서울 로열스")).toBe("crown");
  });
});

describe("SVG 만들기", () => {
  const index = buildMarkIndex(TEAMS);

  it("팀 색이 그대로 들어간다", () => {
    const t = TEAMS.find((x) => x.name === "대전 팬텀스")!;
    const svg = teamMarkSvg(index.get(markKey(t.id))!, t.colors, t.name);
    expect(svg).toContain(t.colors![0]);
    expect(svg).toContain(t.colors![1]);
    expect(svg).toContain(`aria-label="${t.name}"`);
  });

  it("색이 없어도 기본값으로 돈다", () => {
    const svg = teamMarkSvg(fallbackSpec("TEAM_X"), null);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain("</svg>");
  });

  it("238팀 전부 유효한 SVG가 나온다", () => {
    const bad: string[] = [];
    for (const t of TEAMS) {
      const svg = teamMarkSvg(index.get(markKey(t.id))!, t.colors, t.name);
      if (!svg.startsWith("<svg ") || !svg.endsWith("</svg>")) bad.push(t.id);
      if (!svg.includes('viewBox="0 0 100 102"')) bad.push(t.id + " viewBox");
    }
    expect(bad).toEqual([]);
  });

  it("외곽 패스가 다섯 종류 다 유효하다", () => {
    for (const [k, d] of Object.entries(SHELL)) {
      expect(d.startsWith("M"), k).toBe(true);
      expect(d.trim().endsWith("Z"), k).toBe(true);
    }
  });

  it("배정표에 없는 팀도 폴백으로 그려진다", () => {
    const s = fallbackSpec("TEAM_NEW_TEAM_1");
    expect(fallbackSpec("TEAM_NEW_TEAM_2")).toEqual(s); // 1군·2군 같음
    expect(SHELL[s.shell]).toBeTruthy();
  });
});
