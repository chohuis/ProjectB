import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 리그 화면 **역대(연혁) 탭.** (2026-09-01 · 트랙 C 2주차)
 *
 * 🔴 "히스토리 화면이 없다"는 세 번째 오독이었다 — `LeaguePage` 는 이미
 *    연도 선택 + 다섯 탭으로 **역대 순위·수상·포스트시즌·대회를 다 그린다.**
 *    진짜로 없던 것은 **여러 해를 가로지르는 뷰**다. 15~20시즌을 뛰고 나면
 *    "어느 해에 누가 우승했나"를 알려면 연도 선택을 스무 번 돌려야 했다.
 */
const SRC = readFileSync(
  resolve(__dirname, "../league/LeaguePage.svelte"), "utf8");
const STORE = readFileSync(
  resolve(__dirname, "../../shared/stores/leagueUiStore.ts"), "utf8");

describe("역대 탭 — 여러 해를 가로지른다", () => {
  it("탭 유니온의 정본에 `history` 가 있다", () => {
    // ⚠ 페이지가 아니라 스토어가 정본이다 — 그 파일 주석이 못박아 뒀다
    expect(STORE, "leagueUiStore 의 LeagueTab 에 history 가 없다")
      .toMatch(/\| "history"/);
  });

  it("탭 버튼이 있다", () => {
    expect(SRC).toMatch(/tab === "history"/);
  });

  it("우승 계보와 통산 수상을 둘 다 그린다", () => {
    expect(SRC, "우승 계보가 없다").toContain("우승 계보");
    expect(SRC, "통산 수상이 없다").toContain("통산 수상");
  });

  /**
   * 🔴 **빈 것이 정상이다.** 첫 시즌을 마치기 전에는 원래 아무것도 없다.
   *    A 회신 §2 가 "빈 상태를 정상으로 다뤄라"라고 못박았다.
   */
  it("빈 상태를 결함처럼 보이게 쓰지 않는다", () => {
    expect(SRC, "빈 상태 안내가 없다 — 첫 시즌 전에는 늘 비어 있다")
      .toMatch(/아직 지나간 시즌이 없습니다/);
  });

  /**
   * ⚠ 역대 탭은 여러 해를 한 번에 본다. 연도 선택이 같이 뜨면 무엇을
   *   고르라는 건지 모른다.
   */
  it("역대 탭에서는 연도 선택을 감춘다", () => {
    expect(SRC).toMatch(/\{#if tab !== "history"\}[\s\S]{0,400}?yr-select/);
  });

  /**
   * 🔴 **안 열린 대회도 한 줄 온다**(우승 빈칸). 계보에 넣으면 "미정"이
   *    해마다 쌓여 계보 자체가 안 읽힌다.
   */
  it("우승자가 없는 줄은 계보에 안 넣는다", () => {
    expect(SRC).toMatch(/if \(!r\.champion_id && !r\.champion_name\) continue;/);
  });

  /** 반응문이 자기 결과에 다시 걸리면 무한히 돈다 */
  it("한 번만 읽는 가드가 있다", () => {
    expect(SRC).toMatch(/histAllState !== "idle"/);
  });
});

describe("수상은 한 번에 읽는다", () => {
  /**
   * `history_league` 는 C 소유(`slotdb.cjs`)라 전 연도를 한 번에 읽게 고쳤다.
   * 연도별로 N번 부르면 조회가 연도 수만큼 는다.
   */
  it("`kind` 로 걸러 한 번만 부른다", () => {
    expect(SRC).toMatch(/getHistoryLeague\(\{ slotId, kind: "awards" \}\)/);
  });

  it("slotdb 가 연도 없이도 읽는다", () => {
    const DB = readFileSync(
      resolve(__dirname, "../../../../desktop/ipc/slotdb.cjs"), "utf8");
    const fn = DB.slice(DB.indexOf("getHistoryLeague(db, p)"));
    expect(fn, "leagueId 를 필수로 요구하면 전 연도 조회가 깨진다")
      .not.toMatch(/WHERE league_id = \?"\)\.all\(p\.leagueId\)/);
    expect(fn).toMatch(/if \(p\.kind\)/);
  });
});

/**
 * B8 "해외 빈 순위표 56행" — **원인은 과잉 교정이었다.** (2026-09-01 눈확인)
 *
 * `refs` 가 1군·팜을 같은 `leagueId` 로 담아서, 안 거르면 ABL 이 32팀 ·
 * JBL 이 24팀으로 떴다(합 56). 그래서 `_2` 로 끝나는 팀을 **무조건** 뺐다.
 *
 * 🔴 그런데 2군 리그를 고르면 그 리그 행은 전부 `_2` 라 **통째로 사라졌다** —
 *    "해당 시즌 순위 기록이 없습니다"가 뜨는데 DB 에는 멀쩡히 있었다.
 *    실측(2026시즌 세이브):
 *
 *      LEAGUE_ABL       16행 중 `_2` 0개    ← 필터가 하는 일이 없다
 *      LEAGUE_ABL_FARM  16행 중 `_2` 16개   ← 전부 사라진다
 *      LEAGUE_JBL_FARM  12행 중 `_2` 12개
 *      LEAGUE_KBL_FARM  10행 중 `_2` 10개
 *
 * ⚠ **필터를 그냥 지우면 안 된다.** 옛 세이브는 1군 `league_id` 아래 팜 팀이
 *   섞여 있을 수 있고, 그때 32팀이 다시 뜬다. 1군을 볼 때만 뺀다.
 */
describe("2군 순위표가 사라지지 않는다 (B8)", () => {
  it("`_2` 제외를 1군 화면에서만 한다", () => {
    expect(SRC, "2군을 무조건 빼고 있다 — 팜 리그 과거 순위가 통째로 사라진다")
      .not.toMatch(/\.filter\(r => !r\.team_id\.endsWith\("_2"\)\)/);
    expect(SRC, "1군 보호가 사라졌다 — 옛 세이브에서 32팀이 다시 뜬다")
      .toMatch(/lid\.endsWith\("_FARM"\) \|\| !r\.team_id\.endsWith\("_2"\)/);
  });
});
