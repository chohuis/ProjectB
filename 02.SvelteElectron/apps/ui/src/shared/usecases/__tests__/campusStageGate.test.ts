import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allStarCopyOf, campusEventFor, campusStageKind } from "../campusEvents";
import { natlSquadSelfLine } from "../nationalTeam";

/**
 * **행사가 무대를 넘지 않는다** (2026-09-06).
 *
 * 🔴 `test:campus` 가 「학생 무대에서만 돈다」를 **정규식으로** 보고 있었다 —
 *   게이트 문장을 문자열로 찾는 검사였다. 2026-08-29 에 프로 올스타를 넣으면서
 *   그 문장이 바뀌자 빨강이 났는데, **정작 그때 실제로 샌 것은 게이트가 아니라
 *   문안이었다**(프로가 「대학야구연맹」의 「대학 올스타전」을 받았다).
 *   검사가 엉뚱한 것을 보고 있었던 것이다.
 *
 * 그래서 배분을 순수 함수(`campusEventFor`)로 뽑고 여기서 **직접 부른다.**
 * 무대 × 주차를 전부 돌려 「이 무대에 이 행사가 열리는가」를 값으로 확인한다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const RULES = JSON.parse(
  readFileSync(resolve(ROOT, "resource/data/master/players/generation_rules.json"), "utf8"),
);

/** 규칙 파일이 정본이다 — 주차를 여기 또 적지 않는다 */
const CE = RULES.campusEvents;
const WEEKS = {
  showcase: CE.showcase.week as number,
  allstar: CE.allstar.week as number,
  proAllstar: (CE.proAllstar?.week ?? null) as number | null,
};

const ALL_STAGES = [
  "highschool",
  "university",
  "independent",
  "military",
  "pro_kbl",
  "pro_abl",
  "pro_jbl",
  "retired",
];

describe("행사 주차가 서로 안 겹친다", () => {
  it("세 주차가 다르다 — 겹치면 하나가 묻힌다", () => {
    const ws = [WEEKS.showcase, WEEKS.allstar, WEEKS.proAllstar].filter((w) => w != null);
    expect(new Set(ws).size, `겹친다: ${ws.join(",")}`).toBe(ws.length);
  });
});

describe("무대 판정", () => {
  it("행사가 있는 무대는 셋뿐이다", () => {
    const kinds = Object.fromEntries(ALL_STAGES.map((s) => [s, campusStageKind(s)]));
    expect(kinds).toEqual({
      highschool: "highschool",
      university: "university",
      independent: null, // 🔴 독립은 학생도 프로도 아니다
      military: null, // 🔴 상무 복무 중에 올스타에 뽑히지 않는다
      pro_kbl: "pro",
      pro_abl: "pro",
      pro_jbl: "pro",
      retired: null,
    });
  });
});

describe("행사가 무대를 넘지 않는다", () => {
  /** 무대 × 주차 1~52 전부 — 열리는 행사를 값으로 모은다 */
  const opened = (stage: string) => {
    const out: Record<string, number[]> = {};
    for (let w = 1; w <= 52; w++) {
      const kind = campusEventFor(stage, w, WEEKS);
      if (kind) (out[kind] ??= []).push(w);
    }
    return out;
  };

  it("대학 — 쇼케이스와 대학 올스타만, 각각 한 주", () => {
    expect(opened("university")).toEqual({
      showcase: [WEEKS.showcase],
      allstar: [WEEKS.allstar],
    });
  });

  it("고교 — 스카우트 데이만, 쇼케이스와 같은 주", () => {
    expect(opened("highschool")).toEqual({ scout_day: [WEEKS.showcase] });
  });

  /** 🔴 이 검사가 원래 잡으려던 것 — 프로에게 대학 소식은 잡음이다 */
  it("프로 — 프로 올스타만. 대학 쇼케이스도 대학 올스타도 안 온다", () => {
    for (const stage of ["pro_kbl", "pro_abl", "pro_jbl"]) {
      expect(opened(stage), stage).toEqual({ pro_allstar: [WEEKS.proAllstar] });
      expect(campusEventFor(stage, WEEKS.showcase, WEEKS), stage).toBeNull();
      expect(campusEventFor(stage, WEEKS.allstar, WEEKS), stage).toBeNull();
    }
  });

  it("독립·상무·은퇴 — 52주 내내 아무것도 안 열린다", () => {
    for (const stage of ["independent", "military", "retired"]) {
      expect(opened(stage), stage).toEqual({});
    }
  });

  it("학생에게 프로 올스타가 안 간다", () => {
    expect(campusEventFor("university", WEEKS.proAllstar!, WEEKS)).toBeNull();
    expect(campusEventFor("highschool", WEEKS.proAllstar!, WEEKS)).toBeNull();
  });

  /** ⚠ 규칙이 없으면 안 연다 — 프로에게 빈 행사가 열리면 안 된다 */
  it("proAllstar 규칙이 없으면 프로에게 아무것도 안 열린다", () => {
    const noPro = { showcase: WEEKS.showcase, allstar: WEEKS.allstar, proAllstar: null };
    for (let w = 1; w <= 52; w++) {
      expect(campusEventFor("pro_kbl", w, noPro), `W${w}`).toBeNull();
    }
  });
});

describe("올스타 문안이 무대를 본다", () => {
  // 🔴 게이트가 아니라 **문안**이 새고 있었다. 기계는 2026-08-29 에 리그 중립이
  //   됐는데 발신자·제목·꼬리말이 "대학"으로 박혀 있어, 프로 올스타전을 뛴
  //   주인공이 「대학야구연맹」의 「2030 대학 올스타전」을 받았다.

  it("대학만 대학 문안을 쓴다", () => {
    const univ = allStarCopyOf("LEAGUE_UNIVERSITY");
    expect(univ.org).toBe("대학야구연맹");
    expect(univ.unit).toBe("대학");
  });

  it("프로 세 리그에 대학이라는 말이 한 글자도 안 들어간다", () => {
    for (const lid of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
      const c = allStarCopyOf(lid);
      const all = `${c.org} ${c.title} ${c.unit}`;
      expect(all, `${lid} 문안: ${all}`).not.toContain("대학");
      expect(c.unit, lid).toBe("구단"); // 쿼터 단위는 구단이다
    }
  });

  it("모르는 리그도 대학으로 떨어지지 않는다", () => {
    // ⚠ 기본값이 대학이면 리그가 하나 늘 때마다 같은 결함이 다시 난다
    const c = allStarCopyOf("LEAGUE_WHATEVER");
    expect(`${c.org} ${c.title} ${c.unit}`).not.toContain("대학");
  });

  it("리그마다 소식 id 가 갈린다 — 같은 해에 두 판이 겹치지 않는다", () => {
    const slugs = ["LEAGUE_UNIVERSITY", "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"].map(
      (l) => allStarCopyOf(l).slug,
    );
    expect(new Set(slugs).size, slugs.join(",")).toBe(slugs.length);
    // 대시보드 배선은 `msg-allstar-` 접두사로 걸린다 — slug 가 그걸 안 깬다
    for (const s of slugs) expect(`msg-allstar-${s}-2030-w21`).toMatch(/^msg-allstar-/);
  });
});

describe("대표팀 발표 문안이 후보 여부를 본다", () => {
  // 🔴 후보 풀은 **국내 프로 한국인 현역**뿐인데(`callUpNationalSquad`)
  //   본문이 「이번에는 명단에 들지 못했다」를 고교 1학년·복무 중·은퇴에게도
  //   보냈다. 그들은 떨어진 게 아니라 **잴 자리에 없었다.**
  //
  //   0통으로 막지 않고 문안을 갈랐다 — 새 게임은 고교 3년 + 대학 4년이라
  //   플레이어가 처음 만나는 몇 시간이 전부 아마추어 무대다. 거기서 대회를
  //   통째로 감추면 그 해에 올림픽이 없었던 것처럼 보인다.

  it("후보가 아니면 낙방으로 안 읽힌다 — 세계 소식이다", () => {
    const line = natlSquadSelfLine(false, false);
    expect(line).not.toContain("명단에 들지 못했다");
    expect(line).not.toContain("내 이름");
    // 「누가 뽑혔나」가 보여야 세계 소식으로 읽힌다
    expect(line).toContain("프로");
  });

  it("후보인데 안 뽑히면 낙방 문안이다", () => {
    expect(natlSquadSelfLine(true, false)).toContain("명단에 들지 못했다");
  });

  it("뽑히면 발탁 문안이다 — 후보 여부와 무관하게 같은 문장이다", () => {
    expect(natlSquadSelfLine(true, true)).toContain("내 이름");
  });

  it("세 갈래가 서로 다른 문장이다 — 하나로 뭉개지지 않는다", () => {
    const lines = [
      natlSquadSelfLine(false, false),
      natlSquadSelfLine(true, false),
      natlSquadSelfLine(true, true),
    ];
    expect(new Set(lines).size, lines.join(" / ")).toBe(3);
  });
});
