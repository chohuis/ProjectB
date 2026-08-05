import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  teamTokens, lightness, contrast, contrastOnWhiteText, DEFAULT_PRIMARY,
} from "../teamTheme";

// ⚠ **이 검사가 UI 전체의 바닥이다.** 팀 색은 172팀에서 오고, 헤더·CTA·강조가
// 전부 여기서 파생된다. 한 팀이라도 대비가 무너지면 그 팀을 고른 플레이어는
// 게임 내내 안 읽히는 화면을 본다.

describe("팀 토큰 파생", () => {
  it("헤더는 흰 글씨가 읽히도록 항상 어둡다", () => {
    // 실측: 238팀 주색 L* 13~83, 그중 130팀이 L* > 45라 그대로 쓰면 흰 글씨가 죽는다
    const bright = teamTokens(["#F49530", "#123A6B"]);   // 광주 팬서스 L*70
    expect(lightness(bright.dark)).toBeLessThan(30);
    expect(contrastOnWhiteText(bright.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it("이미 어두운 팀도 헤더 명도를 맞춘다", () => {
    const dark = teamTokens(["#0A0A1E", "#C8102E"]);
    expect(contrastOnWhiteText(dark.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it("CTA는 데이터의 보조색을 그대로 쓴다", () => {
    const t = teamTokens(["#194980", "#C1500F"]);
    expect(t.accent).toBe("#C1500F");
  });

  it("보조색이 없으면 CTA를 파생한다", () => {
    const t = teamTokens(["#194980"]);
    expect(contrastOnWhiteText(t.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("보조색이 흰 글씨를 못 받으면 쓰지 않는다", () => {
    // #FFE44D는 흰 글씨 대비 1.28:1 — CTA 배경으로 못 쓴다
    const t = teamTokens(["#194980", "#FFE44D"]);
    expect(t.accent).not.toBe("#FFE44D");
    expect(contrastOnWhiteText(t.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("골드는 헤더 위에서 읽힌다", () => {
    for (const p of ["#194980", "#DC5A46", "#2A386F", "#F49530", "#30C52B"]) {
      const t = teamTokens([p, "#123A6B"]);
      expect(contrast(t.gold, t.dark)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("골드가 무채색으로 무너지지 않는다", () => {
    // ⚠ 회색과 섞어 명도를 맞추던 시절 부산·대전·서울 로열스가 전부 #B0B0B0이 됐다.
    // 하이라이트에서 팀 색이 사라지면 이 디자인의 의미가 없다.
    const navy = teamTokens(["#194980", "#C1500F"]).gold;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(navy.substr(i, 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(30);
  });

  it("핀스트라이프는 주색에서 오고 세기가 고정이다", () => {
    // 팀이 바뀌어도 줄무늬 세기가 같아야 화면 밀도 인상이 유지된다
    const a = teamTokens(["#194980"]).stripe;
    const b = teamTokens(["#F49530"]).stripe;
    expect(a).toMatch(/^rgba\(25, 73, 128, 0\.055\)$/);
    expect(b).toMatch(/0\.055\)$/);
  });

  it("색이 없으면 기본값으로 돈다", () => {
    const t = teamTokens(null);
    expect(contrastOnWhiteText(t.dark)).toBeGreaterThanOrEqual(4.5);
    expect(lightness(DEFAULT_PRIMARY)).toBeGreaterThan(0);
  });

  it("3자리 hex도 받는다", () => {
    const t = teamTokens(["#19F"]);
    expect(t.dark).toMatch(/^#[0-9A-F]{6}$/);
  });
});

// ── 실제 데이터 전수 ──────────────────────────────────────────
//
// ⚠ 위 검사들은 **손으로 고른 5~6색 표본**이다. 이 구간에서만 "표본은 통과인데
// 현실은 아님"이 여러 번 나왔다. 상단 헤더(U2)가 금색-헤더 짝에 **주 버튼과
// 등번호**를 얹으면서 이 짝이 182팀 전부에서 성립해야 하는 조건이 됐다.
describe("refs.json 국내 팀 전수", () => {
  const DOMESTIC = new Set([
    "LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT", "LEAGUE_KBL",
  ]);

  interface RefTeam { id: string; name: string; leagueId: string; colors?: string[] }

  const raw = readFileSync(
    join(process.cwd(), "resource/data/master/entities/refs.json"), "utf8");
  const parsed = JSON.parse(raw) as { teams: RefTeam[] | Record<string, RefTeam> };
  const all: RefTeam[] = Array.isArray(parsed.teams)
    ? parsed.teams
    : Object.values(parsed.teams);
  const teams = all.filter((t) => DOMESTIC.has(t.leagueId));

  it("국내 팀이 실제로 읽혔다 — 경로가 어긋나면 0팀으로 조용히 통과한다", () => {
    expect(teams.length).toBeGreaterThan(150);
  });

  it("헤더 위 금색이 어느 팀에서도 4.5:1을 지킨다 (등번호 · 다음 주 진행 버튼)", () => {
    const bad: string[] = [];
    for (const t of teams) {
      const tk = teamTokens(t.colors);
      const cr = contrast(tk.gold, tk.dark);
      if (cr < 4.5) bad.push(`${t.name} ${t.colors?.[0]} → ${cr.toFixed(2)}:1`);
    }
    expect(bad).toEqual([]);
  });

  it("헤더 위 흰 글씨(이름 · 날짜)도 어느 팀에서나 읽힌다", () => {
    const bad: string[] = [];
    for (const t of teams) {
      const cr = contrastOnWhiteText(teamTokens(t.colors).dark);
      if (cr < 4.5) bad.push(`${t.name} → ${cr.toFixed(2)}:1`);
    }
    expect(bad).toEqual([]);
  });
});
