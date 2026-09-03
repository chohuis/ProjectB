import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRoleChoiceCopy } from "../../utils/roleChoiceCopy";
import {
  buildRoleChoiceMessage, buildRoleConfirmMessage,
  roleChoiceMessageId, roleChoiceGuardKey, roleConfirmMessageId, parseRoleChoiceGuardKey,
  roleChoicePolicyPick, aheadOfTeam, positionOfChoice, choiceOfPosition,
  type RoleRecommendation,
} from "../pitcherRole";
import type { RoleChoiceMetadata } from "../../types/main";

/**
 * 보직 소식 — **id · 가드 · 헤드리스 갈래**.
 *
 * 🔴 **소식 id 가 겹치면 세이브가 아예 안 열린다.** 목록이
 * `{#each sorted as msg (msg.id)}` 로 id 를 키로 잡아 `each_key_duplicate` 로
 * 죽고, 로드 화면에서 멈춘 채 화면엔 단서가 없다(CLAUDE.md).
 *
 * 🔴 **id 와 가드가 같은 세 조각이어야 한다**(연도·팀·주차). 한쪽만 주차를
 * 빼면 갈래가 둘로 깨진다 — 가드에만 없으면 같은 주에 소식이 계속 생기고,
 * id 에만 없으면 키가 겹친다.
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const COPY = parseRoleChoiceCopy(
  JSON.parse(readFileSync(resolve(MASTER, "messages/role_choice.json"), "utf8")),
)!;

const REC: RoleRecommendation = { recommended: "sp", ahead: { sp: 2, rp: 4, cp: 1 } };

function ask(year: number, teamId: string, week: number) {
  return buildRoleChoiceMessage({
    copy: COPY, year, teamId, week,
    reason: "season", stage: "pro", managerName: "한동석", rec: REC,
  });
}

describe("소식 id 와 가드 — 같은 세 조각", () => {
  it("id 가 연도·팀·주차 셋을 다 쓴다", () => {
    expect(roleChoiceMessageId(2029, "TEAM_KBL_A_1", 1)).toBe("msg-role-2029-TEAM_KBL_A_1-w1");
  });

  it("가드가 id 와 같은 세 조각을 쓴다", () => {
    const key = roleChoiceGuardKey(2029, "TEAM_KBL_A_1", 1);
    const parsed = parseRoleChoiceGuardKey(key)!;
    expect(parsed.year).toBe(2029);
    expect(parsed.teamId).toBe("TEAM_KBL_A_1");
    expect(parsed.week).toBe(1);
    // id 와 가드가 같은 셋에서 나온다 — 한쪽만 조각이 빠지면 여기가 깨진다
    expect(roleChoiceMessageId(parsed.year, parsed.teamId, parsed.week))
      .toBe("msg-role-2029-TEAM_KBL_A_1-w1");
  });

  it("1군 → 2군 → 1군 왕복에서 id 가 안 겹친다", () => {
    // 강등 잠금 2주 · 프로 정규 W5~26 이라 한 시즌에 왕복이 남는다
    const ids = [
      ask(2029, "TEAM_KBL_A_1", 1).id,
      ask(2029, "TEAM_KBL_A_2", 9).id,
      ask(2029, "TEAM_KBL_A_1", 14).id,
    ];
    expect(new Set(ids).size).toBe(3);
  });

  it("연도만 쓰면 겹친다 — 왜 세 조각인지의 대조군", () => {
    const yearOnly = [1, 9, 14].map(() => "msg-role-2029");
    expect(new Set(yearOnly).size).toBe(1);
  });

  it("확정 소식 id 는 묻는 소식과 다르다", () => {
    expect(roleConfirmMessageId(2029, "TEAM_KBL_A_1", 1))
      .not.toBe(roleChoiceMessageId(2029, "TEAM_KBL_A_1", 1));
  });
});

describe("묻는 소식의 모양", () => {
  const msg = ask(2029, "TEAM_KBL_A_1", 1);

  it("미결 선택지로 들어간다 — advanceWeek 이 이걸 보고 멈춘다", () => {
    expect(msg.decision?.selectedOptionId).toBeNull();
  });

  it("선택지가 셋이고 늘 셋이다", () => {
    expect(msg.decision?.options.map((o) => o.id)).toEqual(["sp", "rp", "cp"]);
  });

  it("부제를 안 단다 — effectHint 가 전부 빈 문자열", () => {
    for (const o of msg.decision!.options) expect(o.effectHint).toBe("");
  });

  it("prompt 가 비어 있다 — 본문이 이미 물음이다", () => {
    expect(msg.decision?.prompt).toBe("");
  });

  it("효과에 roleChoice 가 실린다", () => {
    expect(msg.decision?.options.map((o) => o.effects?.roleChoice)).toEqual(["SP", "RP", "CP"]);
  });

  it("본문에 감독 이름이 없다 — 보낸이 칸이 든다", () => {
    expect(msg.sender).toBe("한동석");
    expect(msg.body.includes("한동석")).toBe(false);
  });

  it("본문이 머리말 + 추천 한 줄 + 물음 세 줄이다", () => {
    expect(msg.body.split("\n").length).toBe(3);
    expect(msg.body.split("\n")[0]).toBe(COPY.lead.season);
    expect(msg.body.split("\n")[1]).toBe(COPY.recommend.pro.SP);
    // 물음은 `decision.prompt` 가 아니라 본문 끝이다 — prompt 를 채우면
    // 굵은 줄이 하나 더 그려진다
    expect(msg.body.split("\n")[2]).toBe(COPY.tail.ask);
  });

  it("metadata 가 추천과 ahead 를 싣는다 — 화면은 다시 계산하지 않는다", () => {
    const meta = msg.metadata as RoleChoiceMetadata;
    expect(meta.type).toBe("roleChoice");
    expect(meta.recommended).toBe("sp");
    expect(meta.ahead).toEqual({ sp: 2, rp: 4, cp: 1 });
  });

  it("적합도(fits)는 안 싣는다 — 화면이 안 그리는 값을 세이브에 안 넣는다", () => {
    expect(Object.keys(msg.metadata as object)).not.toContain("fits");
    expect(Object.keys(msg.metadata as object)).not.toContain("ranks");
  });

  it("무대마다 추천 문안이 갈린다", () => {
    const hs = buildRoleChoiceMessage({
      copy: COPY, year: 2026, teamId: "TEAM_HS_A", week: 6,
      reason: "season", stage: "highschool", managerName: "코칭스태프", rec: REC,
    });
    expect(hs.body.split("\n")[1]).toBe(COPY.recommend.highschool.SP);
    expect(hs.body.split("\n")[1]).not.toBe(msg.body.split("\n")[1]);
  });

  it("콜업·강등은 머리말이 다르다", () => {
    const up = buildRoleChoiceMessage({
      copy: COPY, year: 2029, teamId: "TEAM_KBL_A_1", week: 9,
      reason: "callup", stage: "pro", managerName: "한동석", rec: REC,
    });
    expect(up.body.split("\n")[0]).toBe(COPY.lead.callup);
    expect(up.body.split("\n")[0]).not.toBe(COPY.lead.season);
  });
});

describe("확정 소식", () => {
  it("추천대로면 굴절형으로 한 줄", () => {
    const m = buildRoleConfirmMessage({
      copy: COPY, year: 2029, teamId: "T", week: 1,
      pick: "rp", recommended: "rp", role: "중간계투", managerName: "한동석",
    });
    expect(m.body).toBe("올해는 중계로 갑니다.");
    expect(m.subject).toBe("2029시즌 보직 — 중계");
  });

  it("거스르면 추천을 이름으로만 적는다 — 「감독은 …」 을 안 쓴다", () => {
    const m = buildRoleConfirmMessage({
      copy: COPY, year: 2029, teamId: "T", week: 1,
      pick: "cp", recommended: "sp", role: "마무리", managerName: "한동석",
    });
    expect(m.body.split("\n")[0]).toBe("추천은 선발이었습니다. 마무리를 택했습니다.");
    expect(m.body.includes("감독은")).toBe(false);
    expect(m.body.includes("한동석")).toBe(false);
  });

  // 🔴 서술격을 코드가 붙이면 「중계이었습니다」가 나온다 — 굴절형 표를 쓰는지 본다
  it("추천이 중계면 「중계였습니다」다", () => {
    const m = buildRoleConfirmMessage({
      copy: COPY, year: 2029, teamId: "T", week: 1,
      pick: "sp", recommended: "rp", role: "3선발", managerName: "한동석",
    });
    expect(m.body.split("\n")[0]).toBe("추천은 중계였습니다. 선발을 택했습니다.");
    expect(m.body.includes("중계이었습니다")).toBe(false);
  });
});

describe("ahead — 그 자리를 지금 차지한 같은 팀 투수 수", () => {
  const rows = [
    { id: "A", teamId: "T1", role: "player", status: "active",  details: { player: { playerType: "pitcher", position: "SP" } } },
    { id: "B", teamId: "T1", role: "player", status: "active",  details: { player: { playerType: "pitcher", position: "SP" } } },
    { id: "C", teamId: "T1", role: "player", status: "active",  details: { player: { playerType: "pitcher", position: "CP" } } },
    { id: "D", teamId: "T1", role: "player", status: "retired", details: { player: { playerType: "pitcher", position: "RP" } } },
    { id: "E", teamId: "T1", role: "player", status: "active",  details: { player: { playerType: "batter",  position: "C"  } } },
    { id: "F", teamId: "T2", role: "player", status: "active",  details: { player: { playerType: "pitcher", position: "RP" } } },
    { id: "ME", teamId: "T1", role: "player", status: "active", details: { player: { playerType: "pitcher", position: "SP" } } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any[];

  it("자기 팀 · 현역 투수만 센다 (자기 자신 제외)", () => {
    expect(aheadOfTeam("T1", "ME", rows)).toEqual({ sp: 2, rp: 0, cp: 1 });
  });

  it("다른 팀은 안 센다", () => {
    expect(aheadOfTeam("T2", "ME", rows)).toEqual({ sp: 0, rp: 1, cp: 0 });
  });
});

describe("헤드리스 정책 — __PB_ROLE_CHOICE", () => {
  const meta = { type: "roleChoice", recommended: "rp" } as RoleChoiceMetadata;
  const g = globalThis as { __PB_ROLE_CHOICE?: unknown };

  beforeEach(() => { delete g.__PB_ROLE_CHOICE; });
  afterEach(()  => { delete g.__PB_ROLE_CHOICE; });

  it("기본은 추천대로다 (확정 10)", () => {
    expect(roleChoicePolicyPick(meta)).toBe("rp");
  });

  it("recommend 를 적어도 추천대로다", () => {
    g.__PB_ROLE_CHOICE = "recommend";
    expect(roleChoicePolicyPick(meta)).toBe("rp");
  });

  it("sp · rp · cp 를 그대로 고른다", () => {
    for (const v of ["sp", "rp", "cp"] as const) {
      g.__PB_ROLE_CHOICE = v;
      expect(roleChoicePolicyPick(meta)).toBe(v);
    }
  });

  it("모르는 값이면 추천으로 떨어진다 — 피로 휴리스틱을 안 탄다", () => {
    g.__PB_ROLE_CHOICE = "무언가";
    expect(roleChoicePolicyPick(meta)).toBe("rp");
  });
});

describe("눈금 환산", () => {
  it("옵션 id ↔ position", () => {
    expect(positionOfChoice("sp")).toBe("SP");
    expect(positionOfChoice("cp")).toBe("CP");
    expect(choiceOfPosition("CP")).toBe("cp");
    // 모르는 값은 선발로 떨어진다 — 구 세이브의 빈 position 이 그렇다
    expect(choiceOfPosition("")).toBe("sp");
  });
});
