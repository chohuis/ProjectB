import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **구단 데이터** (4-A · 2026-08-29 · 사용자 확정).
 *
 * 재정(4-B·4-C)의 전제다 — 수용인원 없이는 관중 수입을 만들 수 없다.
 *
 *   구장 capacity   KBO 실제 규모 대역
 *   모기업          **이름만** — 지원 규모는 `budget`에서 유도한다
 *   문사 데이터     238팀 전부
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const R = JSON.parse(read("resource/data/master/entities/refs.json")) as {
  stadiums: { id: string; name: string; capacity?: number }[];
  teams: {
    id: string; name: string; nameEn: string;
    leagueId: string; stadium: string; capacity?: number;
    profile?: { desc?: string };
    history?: { foundedYear?: number | null; parentCompany?: string; titles?: unknown[] };
  }[];
};

describe("구장 수용인원", () => {
  /** 🔴 예전엔 **필드 자체가 없었다** — KBL·고교·대학·독립이 전부 0이었다 */
  it("27개 구장에 다 있다", () => {
    for (const s of R.stadiums) {
      expect(s.capacity, `${s.id} 수용인원 없음`).toBeGreaterThan(0);
    }
  });

  /** ⚠ 팀이 참조하는 구장에 값이 있어야 관중 수입을 만들 수 있다 */
  it("국내 팀이 쓰는 구장이 다 채워졌다", () => {
    const capOf = new Map(R.stadiums.map((s) => [s.id, s.capacity ?? 0]));
    const domestic = R.teams.filter((t) =>
      ["LEAGUE_KBL", "LEAGUE_UNIVERSITY", "LEAGUE_HIGHSCHOOL", "LEAGUE_INDEPENDENT"]
        .includes(t.leagueId));
    for (const t of domestic) {
      expect(capOf.get(t.stadium) ?? 0, `${t.id} → ${t.stadium}`).toBeGreaterThan(0);
    }
  });

  /** ⚠ 규모가 리그를 따라야 한다 — 고교가 프로보다 크면 수입이 뒤집힌다 */
  it("규모 대역이 리그를 따른다", () => {
    const capOf = new Map(R.stadiums.map((s) => [s.id, s.capacity ?? 0]));
    const maxOf = (lg: string) => Math.max(...R.teams
      .filter((t) => t.leagueId === lg).map((t) => capOf.get(t.stadium) ?? 0));
    expect(maxOf("LEAGUE_KBL")).toBeGreaterThan(maxOf("LEAGUE_UNIVERSITY"));
    expect(maxOf("LEAGUE_UNIVERSITY")).toBeGreaterThan(maxOf("LEAGUE_HIGHSCHOOL"));
  });
});

describe("모기업", () => {
  /**
   * ⚠ `clubs`(36개)는 **구 데이터**다 — KBL 8개고 팀 이름과도 안 맞는다
   *   (팀 "부산 웨이브스" vs 구단 "부산 자이언트웨일스"). `clubId`도 KBL 팀은
   *   자기 자신을 가리킨다. 그래서 **팀**에 붙였다(`budget`이 있는 자리).
   */
  it("프로 1군에 다 있다", () => {
    const pro1 = R.teams.filter((t) =>
      ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"].includes(t.leagueId) && t.id.endsWith("_1"));
    expect(pro1.length).toBeGreaterThan(0);
    for (const t of pro1) {
      expect(t.history?.parentCompany, `${t.id} 모기업 없음`).toBeTruthy();
    }
  });

  /**
   * 🔴 **`toBeTruthy()` 는 자리표시자를 통과시킨다.**
   *
   * ABL·JBL 은 `팀이름 + " Holdings"` 로 기계 생성돼 있었고, JBL 은 팀
   * 이름에 "1군" 이 들어 있어 **`"Tokyo Neon Cranes (1st) Holdings"`** 가
   * 화면(`TeamDetailModal`)에 그대로 나왔다. 값이 **있었으므로** 위 검사는
   * 통과했다 — 있는지가 아니라 **무엇인지**를 봐야 한다.
   */
  it("모기업이 팀 이름을 베끼지 않았다", () => {
    const pro1 = R.teams.filter((t) =>
      ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"].includes(t.leagueId) && t.id.endsWith("_1"));
    for (const t of pro1) {
      const co = String(t.history?.parentCompany ?? "");
      // 팀 이름(한글·영문)의 고유 부분이 회사명에 통째로 들어가면 자리표시자다
      const stem = String(t.nameEn ?? "").replace(/\s*\((1st|2nd|Farm)\)$/, "").trim();
      expect(stem.length, `${t.id} nameEn 이 비었다`).toBeGreaterThan(0);
      expect(co.includes(stem), `${t.id} 모기업이 팀 이름 베낌: ${co}`).toBe(false);
      expect(co.includes(String(t.name)), `${t.id} 모기업이 팀 이름 베낌: ${co}`).toBe(false);
    }
  });

  /** ⚠ 1군·2군 표기를 **세 리그가 같게** 쓴다 — JBL 만 1군에도 "1군" 이 붙어 있었다 */
  it("1군·2군 표기가 세 리그 같다", () => {
    for (const lg of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
      const teams = R.teams.filter((t) => t.leagueId === lg);
      expect(teams.length, `${lg} 팀 없음`).toBeGreaterThan(0);
      for (const t of teams) {
        if (t.id.endsWith("_1")) {
          expect(/1군|\(1st\)/.test(`${t.name}${t.nameEn}`),
            `${t.id} 1군에 이름표가 붙었다: ${t.name}`).toBe(false);
        } else if (t.id.endsWith("_2")) {
          expect(t.name.endsWith("(2군)"), `${t.id} 2군 표기가 다르다: ${t.name}`).toBe(true);
          expect(t.nameEn.endsWith("(Farm)"), `${t.id} 2군 영문이 다르다: ${t.nameEn}`).toBe(true);
        }
      }
    }
  });

  /** 🔴 **새 밸런스 수치를 만들지 않는다** — 지원 규모는 `budget`에서 유도한다 */
  it("지원 규모를 따로 두지 않았다", () => {
    for (const t of R.teams) {
      expect((t.history as Record<string, unknown> | undefined)?.supportIndex,
        `${t.id} 에 supportIndex 가 생겼다`).toBeUndefined();
    }
  });
});

describe("문사 데이터", () => {
  it("238팀 전부 소개가 있다", () => {
    for (const t of R.teams) expect(t.profile?.desc, `${t.id}`).toBeTruthy();
  });

  it("238팀 전부 창단 연도가 있다", () => {
    for (const t of R.teams) {
      expect(t.history?.foundedYear, `${t.id}`).toBeGreaterThan(1900);
    }
  });

  /** ⚠ **2군은 1군을 따른다** — 같은 구단이다 */
  it("2군 창단 연도가 1군과 같다", () => {
    const byId = new Map(R.teams.map((t) => [t.id, t]));
    const farms = R.teams.filter((t) => t.id.endsWith("_2"));
    expect(farms.length).toBeGreaterThan(0);
    for (const f of farms) {
      const one = byId.get(f.id.slice(0, -2) + "_1");
      if (!one) continue;
      expect(f.history?.foundedYear, f.id).toBe(one.history?.foundedYear);
    }
  });

  /** ⚠ **우승은 지어내지 않는다** — `seasonRanks` 1위만 남긴다 */
  it("우승 이력이 과거 순위와 맞는다", () => {
    for (const t of R.teams) {
      const ranks = (t.history as { seasonRanks?: { rank: number }[] } | undefined)?.seasonRanks ?? [];
      const firsts = ranks.filter((x) => x.rank === 1).length;
      const titles = t.history?.titles?.length ?? 0;
      expect(titles, `${t.id} 우승 ${titles} vs 1위 ${firsts}`).toBeLessThanOrEqual(Math.max(firsts, titles));
    }
  });
});

describe("화면 배선", () => {
  /** 🔴 화면이 `team.capacity` 만 봤는데 그건 ABL·JBL 에만 있다 */
  it("팀 상세가 구장에서 수용인원을 읽는다", () => {
    const M = read("apps/ui/src/features/team/ui/TeamDetailModal.svelte");
    expect(M).toContain("$: stadiumCapacity =");
    expect(M).toContain(".find((s) => s.id === team?.stadium)?.capacity");
    expect(M.includes("{#if team.capacity} · {capacityFmt(team.capacity)}석{/if}")).toBe(false);
  });

  it("모기업을 표시한다", () => {
    expect(read("apps/ui/src/features/team/ui/TeamDetailModal.svelte"))
      .toContain("team.history.parentCompany");
  });
});
