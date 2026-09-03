import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  buildBars, buildCards, buildRankList, buildTimeline, cardsNote,
  type NameLookup,
} from "../dashboardView";
import {
  barsCopy, cardsCopy, parseDashboardLabels, rankCopy, rankText, timelineCopy,
} from "../dashboardCopy";
import type {
  BarsMetadata, CardsMetadata, RankListMetadata, TimelineMetadata, Top10Metadata,
} from "../../types/main";

/**
 * 묶음 3·4 표시부 — 표가 아닌 형태 넷 (`PLAN_MESSAGE_DASHBOARDS.md` §1-2 ~ §1-5).
 *
 * ```
 * 순위 3    tourChamp · tourAward · farmChampion
 * 막대 2    exam · teamMood
 * 카드 6    seasonBrief · friendlyPlan · natlSquad · scoutDay · showcase · allstar
 * 타임라인 3 milRecord · militaryAnnual · seasonHsSync
 * ```
 *
 * 🔴 **여기는 표시부만이다.** 값을 배열로 싣는 생산부는 A 몫이라 안 건드렸다 —
 *    그래서 검사는 **값이 없거나 낯설 때 화면이 어떻게 서는가**를 본다.
 *
 * 🔴 **컴포넌트를 새로 안 만들었다** (§2 — 신설은 `StatTable`·`TimelinePanel`
 *    둘뿐이다). 막대는 `TrainingStatBars`, 카드는 `DigestCards` 를 그대로 쓴다.
 *    갈라 두면 숫자 크기·간격·색이 곧 어긋난다 — 그 재사용을 아래 배선 검사가
 *    못박는다.
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const LABELS = parseDashboardLabels(
  JSON.parse(readFileSync(join(MASTER, "messages/dashboard_labels.json"), "utf8")),
);

const SRC_DIR = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(SRC_DIR, p), "utf8");
const NEWS = read("pages/news/NewsPage.svelte");
const CARDS_SRC = read("features/messages/ui/DigestCards.svelte");
const BARS_SRC = read("features/messages/ui/TrainingStatBars.svelte");
const RANK_SRC = read("features/messages/ui/RankListPanel.svelte");
const TIMELINE_SRC = read("features/messages/ui/TimelinePanel.svelte");

/** 이름표 — 아는 id 만 답한다. 모르는 id 는 화면이 그대로 둬야 한다 */
const NAMES: NameLookup = {
  team:   (id) => ({ TEAM_A: "북악고", TEAM_B: "한성고" })[id],
  person: (id) => ({ NPC_1: "김민수", PLY_HERO: "나" })[id],
};

// ── 문안 자리 ──────────────────────────────────────────────────

describe("문안이 열넷을 다 갖는다", () => {
  it("순위 3 · 막대 2 · 카드 6 · 타임라인 3 이 dashboard_labels.json 에 있다", () => {
    for (const k of ["tourChamp", "tourAward", "farmChampion"]) {
      expect(rankCopy(LABELS, k).title, `rankList.${k} 문안이 없다`).not.toBe("");
    }
    for (const k of ["exam", "teamMood"]) {
      expect(barsCopy(LABELS, k).title, `bars.${k} 문안이 없다`).not.toBe("");
    }
    for (const k of ["seasonBrief", "friendlyPlan", "natlSquad", "scoutDay", "showcase", "allstar"]) {
      expect(cardsCopy(LABELS, k).title, `cards.${k} 문안이 없다`).not.toBe("");
    }
    for (const k of ["milRecord", "militaryAnnual", "seasonHsSync"]) {
      expect(timelineCopy(LABELS, k).title, `timeline.${k} 문안이 없다`).not.toBe("");
    }
  });

  /** ⚠ 뿌리를 달고 와도 같은 자리를 찾아야 한다 — 소식이 어느 꼴로 부를지 모른다 */
  it("뿌리를 달고 온 kind 도 같은 문안을 찾는다", () => {
    expect(rankCopy(LABELS, "rankList.tourChamp")).toEqual(rankCopy(LABELS, "tourChamp"));
    expect(barsCopy(LABELS, "bars.exam")).toEqual(barsCopy(LABELS, "exam"));
    expect(cardsCopy(LABELS, "cards.allstar")).toEqual(cardsCopy(LABELS, "allstar"));
    expect(timelineCopy(LABELS, "timeline.milRecord"))
      .toEqual(timelineCopy(LABELS, "milRecord"));
  });

  it("빈 목록 한 줄은 종류마다 뜻이 다르다", () => {
    // 「순위가 아직 안 나왔다」와 「치른 시험이 없다」는 다른 말이다
    expect(rankCopy(LABELS, "tourChamp").empty)
      .not.toBe(barsCopy(LABELS, "exam").empty);
    expect(cardsCopy(LABELS, "friendlyPlan").empty)
      .not.toBe(cardsCopy(LABELS, "allstar").empty);
  });

  /** ⚠ 못 읽어도 화면이 서야 한다 — 문안이 없으면 빈 문자열이고 화면이 키를 쓴다 */
  it("문안을 못 읽으면 빈 문자열이다 — 코드가 문장을 지어내지 않는다", () => {
    expect(rankCopy(null, "tourChamp").title).toBe("");
    expect(barsCopy(null, "exam").title).toBe("");
    expect(cardsCopy(null, "allstar").title).toBe("");
    expect(timelineCopy(null, "milRecord").title).toBe("");
  });
});

// ── 순위 3 ─────────────────────────────────────────────────────

describe("순위 — 등수 이름은 문안이 갖는다", () => {
  const copy = rankCopy(LABELS, "tourChamp");

  it("1·2·3 등은 「우승」·「준우승」·「3위」다", () => {
    expect(rankText(1, copy)).toBe("우승");
    expect(rankText(2, copy)).toBe("준우승");
    expect(rankText(3, copy)).toBe("3위");
  });

  /** 🔴 「4위」를 코드가 만들면 데이터와 두 벌이 된다 */
  it("문안에 없는 등수는 숫자 그대로다", () => {
    expect(rankText(4, copy)).toBe("4");
    expect(rankText(1, rankCopy(LABELS, "tourAward")), "상 목록엔 등수 이름이 없다").toBe("1");
  });

  const md: RankListMetadata = {
    type: "rankList", kind: "tourChamp",
    items: [
      { rank: 1, labelId: "TEAM_A", delta: 2 },
      { rank: 2, labelId: "TEAM_B" },
      { rank: 3, labelId: "TEAM_UNKNOWN" },
    ],
  };

  it("id 를 이름으로 바꾸는 자리가 화면이다", () => {
    const v = buildRankList(md, copy, NAMES);
    expect(v.columns[0].entries.map((e) => e.name)).toEqual(["북악고", "한성고", "TEAM_UNKNOWN"]);
    expect(v.columns[0].entries.map((e) => e.rankText)).toEqual(["우승", "준우승", "3위"]);
  });

  /** ⚠ 이름을 못 찾으면 id 를 그대로 둔다 — 줄을 없애면 순위에 구멍이 난다 */
  it("모르는 id 도 줄을 지우지 않는다", () => {
    expect(buildRankList(md, copy, NAMES).columns[0].entries).toHaveLength(3);
  });

  it("이름표가 없어도 그린다 — 화면이 스토어를 못 받을 때다", () => {
    const v = buildRankList(md, copy);
    expect(v.columns[0].entries[0].name).toBe("TEAM_A");
  });

  it("사람과 소속을 같이 싣는다 — 상 목록이 그 자리다", () => {
    const v = buildRankList({
      type: "rankList", kind: "tourAward",
      items: [{ rank: 1, labelId: "NPC_1", subId: "TEAM_A" }],
    }, rankCopy(LABELS, "tourAward"), NAMES);
    expect(v.columns[0].entries[0].name).toBe("김민수");
    expect(v.columns[0].entries[0].sub).toBe("북악고");
    expect(v.columns[0].entries[0].id, "상세를 못 연다").toBe("NPC_1");
  });

  it("빈 목록 한 줄이 문안에서 온다", () => {
    const v = buildRankList({ type: "rankList", kind: "tourChamp", items: [] }, copy, NAMES);
    expect(v.columns[0].entries).toHaveLength(0);
    expect(v.empty).toBe(copy.empty);
  });

  /**
   * 🔴 **제목의 정본은 문안이다** (`rankList.<kind>.title`). 예전엔 소식이
   *    실어 보낸 말이 이겼는데, 생산부가 한글 제목을 굳혀 실으면 표시
   *    언어를 바꿔도 그 소식만 한글로 남는다 — 이름을 id 로 싣게 한 규칙과
   *    같은 이유다.
   */
  it("문안이 제목을 이긴다 — 소식이 실어 보내도", () => {
    expect(buildRankList({ ...md, title: "8강 최종" }, copy, NAMES).subtitle).toBe(copy.title);
  });

  it("문안이 없는 종류만 소식이 실어 온 말로 떨어진다", () => {
    const bare = rankCopy(LABELS, "없는종류");
    expect(bare.title, "문안이 있으면 이 검사가 뜻을 잃는다").toBe("");
    expect(buildRankList({ ...md, title: "8강 최종" }, bare, NAMES).subtitle).toBe("8강 최종");
  });

  /** ⚠ 유망주 랭킹은 등수 이름이 없다 — 「우승」이 붙으면 안 된다 */
  it("유망주 랭킹은 등수가 숫자로 남는다", () => {
    // ⚠ 규격이 네 칸 짜리 튜플이고 이름표도 넷으로 못 박혀 있다
    const md10: Top10Metadata = {
      type: "top10", playerType: "pitcher", week: 12, seasonYear: 2026,
      columns: [
        {
          label: "1학년", heroRank: 3,
          entries: [{ id: "PLY_HERO", rank: 1, name: "나", teamName: "북악고" }],
        },
        { label: "2학년", heroRank: null, entries: [] },
        { label: "3학년", heroRank: null, entries: [] },
        { label: "통합", heroRank: null, entries: [] },
      ],
    };
    const v = buildRankList(md10);
    expect(v.columns[0].entries[0].rankText).toBe("1");
    expect(v.columns[0].entries[0].isMe).toBe(true);
    expect(v.empty, "학년별 빈 줄은 화면이 갖고 있던 말이다").toBe("");
  });
});

// ── 막대 2 ─────────────────────────────────────────────────────

describe("막대 — 눈금을 화면이 짐작하지 않는다", () => {
  const copy = barsCopy(LABELS, "exam");

  it("눈금이 문안에서 온다", () => {
    expect(copy.min).toBe(0);
    expect(copy.max).toBe(100);
    expect(BARS_SRC, "막대가 눈금을 스스로 계산한다").not.toContain("/ 100 * 100");
  });

  const md: BarsMetadata = {
    type: "bars", kind: "exam",
    bars: [{ label: "국어", value: 87 }, { label: "수학", value: 42, delta: -5 }],
    foot: [{ key: "gpa", value: "3.4" }],
  };

  it("이름이 값인 자리는 소식이 싣는다 — 과목명이 그 자리다", () => {
    const v = buildBars(md, copy);
    expect(v.bars.map((b) => b.label)).toEqual(["국어", "수학"]);
    expect(v.bars.map((b) => b.pct)).toEqual([87, 42]);
    expect(v.bars[1].delta).toEqual({ dir: "down", n: 5, text: "↓5" });
    expect(v.bars[0].delta, "모르는 변동은 칸을 안 그린다").toBeNull();
  });

  it("막대 아래 한 줄의 이름표는 문안이 준다", () => {
    expect(buildBars(md, copy).foot).toEqual([{ label: "학점", value: "3.4" }]);
  });

  it("정해진 자리는 문안이 이름을 준다 — 팀 분위기가 그 자리다", () => {
    const mood = barsCopy(LABELS, "teamMood");
    const v = buildBars({
      type: "bars", kind: "teamMood", bars: [{ key: "mood", value: 68, delta: 3 }],
    }, mood);
    expect(v.bars[0].label).toBe("분위기");
    expect(v.title).toBe("팀 분위기");
  });

  /** ⚠ 이름표가 없으면 키를 그대로 쓴다 — 값은 이미 실려 왔으니 줄을 지우지 않는다 */
  it("모르는 키도 막대를 지우지 않는다", () => {
    const v = buildBars({ type: "bars", kind: "exam", bars: [{ key: "zzz", value: 5 }] }, copy);
    expect(v.bars[0].label).toBe("zzz");
  });

  /** ⚠ 막대가 칸을 넘으면 옆 열을 밀어낸다 (1366×768) */
  it("눈금 밖 값은 끝에 붙인다", () => {
    const v = buildBars({
      type: "bars", kind: "exam",
      bars: [{ label: "체육", value: 140 }, { label: "음악", value: -20 }],
    }, copy);
    expect(v.bars.map((b) => b.pct)).toEqual([100, 0]);
    expect(v.bars[0].value, "값 자체는 안 깎는다").toBe(140);
  });

  it("눈금이 0 폭이면 막대를 안 채운다 — 0 나누기를 안 한다", () => {
    const v = buildBars({ type: "bars", kind: "exam", bars: [{ label: "x", value: 5 }] },
      { ...copy, min: 5, max: 5 });
    expect(v.bars[0].pct).toBe(0);
  });

  it("막대가 하나도 없으면 문안의 한 줄이 선다", () => {
    const v = buildBars({ type: "bars", kind: "exam", bars: [] }, copy);
    expect(v.bars).toHaveLength(0);
    expect(v.empty).toBe(copy.empty);
  });
});

// ── 카드 6 ─────────────────────────────────────────────────────

describe("카드 — id 는 이름으로, 참·거짓은 말로", () => {
  it("대표팀 명단의 선수 id 가 이름으로 선다", () => {
    const v = buildCards({
      type: "cards", kind: "natlSquad",
      items: [{ key: "playerId", value: "NPC_1" }, { key: "pos", value: "SP" }],
    }, cardsCopy(LABELS, "natlSquad"), NAMES);
    expect(v.cards[0].value).toBe("김민수");
    expect(v.cards[0].caption).toBe("선수");
    expect(v.cards[0].numeric, "이름은 숫자가 아니다").toBe(false);
    expect(v.cards[1].value).toBe("SP");
  });

  it("모르는 id 는 그대로 둔다", () => {
    const v = buildCards({
      type: "cards", kind: "natlSquad", items: [{ key: "playerId", value: "NPC_9" }],
    }, cardsCopy(LABELS, "natlSquad"), NAMES);
    expect(v.cards[0].value).toBe("NPC_9");
  });

  it("올스타의 참·거짓이 「선정」·「미선정」이 된다", () => {
    const copy = cardsCopy(LABELS, "allstar");
    const yes = buildCards({
      type: "cards", kind: "allstar",
      items: [{ key: "selected", value: true }, { key: "votes", value: 12043 }],
    }, copy);
    expect(yes.cards[0].value).toBe("선정");
    expect(yes.cards[1].value).toBe("12043");
    expect(yes.cards[1].numeric, "득표는 숫자라 폭이 안 흔들려야 한다").toBe(true);

    const no = buildCards({
      type: "cards", kind: "allstar", items: [{ key: "selected", value: false }],
    }, copy);
    expect(no.cards[0].value, "○ 와 빈 칸으로 그리면 뜻이 안 보인다").toBe("미선정");
  });

  it("이름표는 소식이 실어 보내면 그게 이기고, 없으면 문안이다", () => {
    const copy = cardsCopy(LABELS, "friendlyPlan");
    const v = buildCards({
      type: "cards", kind: "friendlyPlan",
      items: [{ key: "week", value: "W21", caption: "첫 경기" }, { key: "opp", value: "한성고" }],
    }, copy, NAMES);
    expect(v.cards.map((c) => c.caption)).toEqual(["첫 경기", "상대"]);
  });

  it("모르는 키는 키를 그대로 쓴다 — 카드를 지우지 않는다", () => {
    const v = buildCards({
      type: "cards", kind: "allstar", items: [{ key: "zzz", value: 1 }],
    }, cardsCopy(LABELS, "allstar"));
    expect(v.cards[0].caption).toBe("zzz");
  });

  it("카드가 하나도 없으면 문안의 한 줄이 선다", () => {
    const copy = cardsCopy(LABELS, "scoutDay");
    const v = buildCards({ type: "cards", kind: "scoutDay", items: [] }, copy);
    expect(v.cards).toHaveLength(0);
    expect(v.empty).toBe(copy.empty);
  });
});

describe("카드 아래 한 줄 — 조사를 코드로 붙이지 않는다", () => {
  const copy = cardsCopy(LABELS, "seasonBrief");

  /**
   * ⚠ **`parseDashboardLabels` 가 `roleAs` 를 안 실으면 이 줄이 통째로
   *   사라진다.** 굴절형을 못 찾을 때 줄을 지우는 규칙이라 조용히 없어진다 —
   *   첫 판이 실제로 그랬다(뿌리 목록에만 넣고 `roleAs` 를 빠뜨렸다).
   */
  it("문안을 읽으면 굴절 표가 살아 있다", () => {
    expect(Object.keys(LABELS?.roleAs ?? {}).length, "roleAs 가 파싱에서 사라졌다")
      .toBeGreaterThan(0);
  });

  /** 🔴 `{role}` 을 그대로 끼우면 「중계으로 시작합니다」가 된다 */
  it("굴절형은 roleAs 표가 갖는다", () => {
    expect(copy.roleAs.SP).toBe("선발로");
    expect(copy.roleAs.RP).toBe("중계로");
    const note = cardsNote({
      type: "cards", kind: "seasonBrief", items: [{ key: "role", value: "RP" }],
    }, copy);
    expect(note).toBe("올해는 중계로 시작합니다.");
    expect(note, "자리표가 남았다").not.toContain("{");
  });

  it("굴절형을 못 찾으면 그 줄을 안 그린다", () => {
    expect(cardsNote({
      type: "cards", kind: "seasonBrief", items: [{ key: "role", value: "XX" }],
    }, copy)).toBe("");
    expect(cardsNote({ type: "cards", kind: "seasonBrief", items: [] }, copy)).toBe("");
  });

  it("소식이 문장을 실어 보내면 그게 이긴다", () => {
    expect(cardsNote({
      type: "cards", kind: "seasonBrief", note: "부상에서 돌아왔습니다.",
      items: [{ key: "role", value: "SP" }],
    }, copy)).toBe("부상에서 돌아왔습니다.");
  });

  it("틀이 없는 종류엔 줄이 없다", () => {
    expect(cardsNote({
      type: "cards", kind: "allstar", items: [{ key: "role", value: "SP" }],
    }, cardsCopy(LABELS, "allstar"))).toBe("");
  });
});

// ── 타임라인 3 ─────────────────────────────────────────────────

describe("타임라인 — 이름표는 문안이 준다", () => {
  const copy = timelineCopy(LABELS, "milRecord");

  it("부대·보직·계급이 문안에서 온다", () => {
    const md: TimelineMetadata = {
      type: "timeline", kind: "milRecord",
      entries: [
        { when: "W1", key: "unit", detail: "제1보병사단" },
        { when: "W52", key: "rank", detail: "상병" },
      ],
    };
    const v = buildTimeline(md, copy);
    expect(v.entries.map((e) => e.label)).toEqual(["부대", "계급"]);
    expect(v.entries.map((e) => e.detail)).toEqual(["제1보병사단", "상병"]);
    expect(v.title).toBe("군 경력");
  });

  it("소식이 이름표를 실어 보내면 그게 이긴다 — 연감의 요약이 그 자리다", () => {
    const v = buildTimeline({
      type: "timeline", kind: "seasonHsSync",
      entries: [{ when: "2026", label: "1학년", detail: "8강" }],
    }, timelineCopy(LABELS, "seasonHsSync"));
    expect(v.entries[0].label).toBe("1학년");
  });

  /** ⚠ 값은 이미 실려 왔다 — 이름표를 못 찾아도 항목을 안 없앤다 */
  it("모르는 키도 항목을 지우지 않는다", () => {
    const v = buildTimeline({
      type: "timeline", kind: "milRecord", entries: [{ when: "W3", key: "zzz" }],
    }, copy);
    expect(v.entries).toHaveLength(1);
    expect(v.entries[0].label).toBe("zzz");
  });

  /**
   * 🔴 **여기서 순서를 다시 정하지 않는다.** `when` 이 `W21`·`2031`·`상병` 처럼
   *    꼴이 제각각이라 비교할 수도 없다 — 만드는 쪽 차례가 정본이다.
   */
  it("실어 온 차례를 그대로 둔다", () => {
    const v = buildTimeline({
      type: "timeline", kind: "milRecord",
      entries: [{ when: "W52", key: "rank" }, { when: "W1", key: "unit" }],
    }, copy);
    expect(v.entries.map((e) => e.when)).toEqual(["W52", "W1"]);
  });

  it("빈 목록 한 줄이 문안에서 온다", () => {
    const v = buildTimeline({ type: "timeline", kind: "milRecord", entries: [] }, copy);
    expect(v.empty).toBe(copy.empty);
  });
});

// ── 배선 ───────────────────────────────────────────────────────

describe("배선 — 네 갈래가 다 이어졌다", () => {
  it("NewsPage 에 막대·카드 갈래가 있다", () => {
    for (const t of ["bars", "cards"]) {
      expect(NEWS, `metadata.type "${t}" 갈래가 없다 — 구조가 잡힌 값이 본문 텍스트로 나간다`)
        .toContain(`selected.metadata?.type === "${t}"`);
    }
    expect(NEWS, "막대를 화면이 스스로 만든다").toContain("buildBars(");
    expect(NEWS, "카드를 화면이 스스로 만든다").toContain("buildCards(");
  });

  /**
   * 🔴 **컴포넌트를 새로 안 만든다** (§2). 막대는 `TrainingStatBars`,
   *    카드는 `DigestCards` 다 — 갈라 두면 숫자 크기·간격이 곧 어긋난다.
   */
  it("막대·카드에 새 컴포넌트를 안 만들었다", () => {
    expect(NEWS, "막대에 컴포넌트를 하나 더 만들었다").toContain("<TrainingStatBars showStatus={false}");
    expect(NEWS, "카드에 컴포넌트를 하나 더 만들었다").toContain("<DigestCards interactive={false}");
    expect(BARS_SRC, "훈련 막대가 소식 막대를 안 받는다").toContain("export let bars");
    expect(CARDS_SRC, "카드가 못 누르는 꼴을 안 받는다").toContain("export let interactive");
  });

  /**
   * ⚠ **못 누를 때는 `<button>` 을 안 쓴다.** 누를 수 없는 버튼을 두면
   *   키보드가 거기서 멈추고 읽어 주기가 「버튼」이라 읽는다.
   */
  it("못 누르는 카드는 버튼이 아니다", () => {
    expect(CARDS_SRC).toContain("{#if interactive}");
    expect(CARDS_SRC, "누를 수 없는 자리에 div 를 안 쓴다").toContain('<div class="card">');
  });

  /** ⚠ 시험 결과에 「컨디션 좋음」이 붙으면 안 된다 — 훈련만 갖는 줄이다 */
  it("컨디션 줄은 훈련에만 뜬다", () => {
    expect(BARS_SRC).toContain("export let showStatus");
    expect(BARS_SRC).toContain("{#if showStatus}");
  });

  it("순위·타임라인이 문안을 읽는다", () => {
    expect(RANK_SRC, "등수 이름을 화면이 짓는다").toContain("rankCopy(");
    expect(RANK_SRC, "id 를 이름으로 바꾸는 자리가 화면이 아니다").toContain("entityMap");
    expect(TIMELINE_SRC, "이름표를 화면이 짓는다").toContain("timelineCopy(");
  });

  it("규격에 막대·카드 자리가 있다", () => {
    const types = read("shared/types/main.ts");
    expect(types).toContain("BarsMetadata");
    expect(types).toContain("CardsMetadata");
  });
});

// ── 말은 문안에 (2026-09-04) ───────────────────────────────────

describe("코드가 들고 있던 말을 문안으로 옮겼다", () => {
  /**
   * 🔴 **유망주 랭킹에는 `kind` 가 없다** (`Top10Metadata`). 그래서 문안을
   *    못 찾고 「해당 학년 선수 없음」을 **화면이** 들고 있었다 —
   *    `rankList.top10` 자리를 만들어 옮겼다.
   */
  it("유망주 랭킹의 빈 학년 한 줄이 문안에 있다", () => {
    expect(rankCopy(LABELS, "top10").empty, "rankList.top10 문안이 없다").not.toBe("");
  });

  it("화면이 그 말을 코드에 안 들고 있다", () => {
    // ⚠ 낱말이 아니라 **폴백 연산자**를 본다 — 왜 옮겼는지는 주석에 남아야 한다
    expect(RANK_SRC, "빈 줄을 화면이 말로 채운다").not.toContain('view.empty || "');
    expect(RANK_SRC, "kind 가 없는 규격을 문안으로 못 잇는다").toContain('"top10"');
  });

  /** ⚠ 타임라인의 빈 줄도 같은 규칙이다 — 「기록이 없다」가 코드에 있었다 */
  it("타임라인의 빈 줄도 문안에서 온다", () => {
    expect(TIMELINE_SRC).not.toContain("기록이 없다");
    expect(TIMELINE_SRC).toContain("view.empty");
  });

  /**
   * 🔴 **본문을 패널이 대신하지 않는다** (사용자 확정 2026-09-04). 예전엔
   *    `{:else}` 라 패널이 있으면 본문이 통째로 사라졌다 — 표는 값만 그리는데
   *    본문에는 안내 문장이 같이 있었다.
   */
  it("소식 상세가 패널과 본문을 같이 그린다", () => {
    expect(NEWS, "본문을 패널이 대신한다 — 안내 문장이 사라진다")
      .toContain("{#if selected.body}");
    expect(NEWS).toContain("m-text-after");
  });
});
