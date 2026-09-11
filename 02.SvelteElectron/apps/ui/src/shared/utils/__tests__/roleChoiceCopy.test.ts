import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseRoleChoiceCopy,
  roleConfirmLine,
  roleCopyStageOf,
  fillRoleCopy,
  ROLE_ASK_REASONS,
  ROLE_COPY_STAGES,
  ROLE_POSITIONS,
} from "../roleChoiceCopy";

/**
 * 보직 문안 — **정본은 데이터다** (B-12 · `messages/role_choice.json`).
 *
 * ⚠ **데이터가 코드와 어긋나도 아무도 안 죽고 로그도 안 남는다.** 게임은 돌고
 * 문장만 사라진다 — 이 저장소가 이벤트 로더에서 겪은 형태다(CLAUDE.md).
 * 그래서 파일을 직접 읽어 모양을 본다.
 *
 * 🔴 여기서 보는 것 넷:
 *   ① 로더(`parseRoleChoiceCopy`)가 실제 파일을 통과시킨다
 *   ② 조사를 코드가 안 붙인다 — 굴절형(`roleAs`·`roleObj`)이 데이터에 있다
 *   ③ 본문에 감독 이름이 안 들어간다 (보낸이 칸이 든다)
 *   ④ 확인 문구가 `ahead ≥ 1` / `ahead = 0` **두 갈래뿐**이다
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const RAW = JSON.parse(readFileSync(resolve(MASTER, "messages/role_choice.json"), "utf8"));

describe("보직 문안 데이터", () => {
  it("로더가 실제 파일을 통과시킨다", () => {
    expect(parseRoleChoiceCopy(RAW)).not.toBeNull();
  });

  it("머리말이 다섯 상황을 다 덮는다", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    for (const r of ROLE_ASK_REASONS) expect(copy.lead[r].length).toBeGreaterThan(0);
  });

  it("추천 문안이 무대 다섯 × 보직 셋 = 15칸을 다 채운다", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    let n = 0;
    for (const st of ROLE_COPY_STAGES) {
      for (const pos of ROLE_POSITIONS) {
        expect(copy.recommend[st][pos].length).toBeGreaterThan(0);
        n++;
      }
    }
    expect(n).toBe(15);
  });

  it("한 칸이라도 비면 로더가 null 을 낸다 — 대조군", () => {
    const broken = JSON.parse(JSON.stringify(RAW));
    delete broken.recommend.farm.CP;
    expect(parseRoleChoiceCopy(broken)).toBeNull();
  });

  // ── ② 조사 ──────────────────────────────────────────────────
  //
  // 🔴 코드가 「{role}으로」를 이어 붙이면 「중계으로」·「마무리을」이 나온다.
  //   받침 ㄹ 은 '로' 를 쓰므로(선발로) 받침 유무만 보는 규칙으로도 틀린다.
  it("굴절형이 데이터에 있고 보직마다 다르다", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    expect(copy.roleAs.SP).toBe("선발로");
    expect(copy.roleAs.RP).toBe("중계로");
    expect(copy.roleAs.CP).toBe("마무리로");
    expect(copy.roleObj.SP).toBe("선발을");
    expect(copy.roleObj.RP).toBe("중계를");
    expect(copy.roleObj.CP).toBe("마무리를");
    // 서술격 — 받침이 있어야 「이었습니다」다(선발이었습니다 / 중계였습니다).
    // 받침 유무만 보는 규칙으로도 못 만든다 → 표다
    expect(copy.roleWas.SP).toBe("선발이었습니다");
    expect(copy.roleWas.RP).toBe("중계였습니다");
    expect(copy.roleWas.CP).toBe("마무리였습니다");
  });

  it("확정 문안이 굴절형 자리표를 쓴다 — 코드가 조사를 안 붙인다", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    expect(copy.decided.follow.includes("{roleAs}")).toBe(true);
    expect(copy.decided.defy.includes("{roleObj}")).toBe(true);
    expect(copy.decided.defy.includes("{recWas}")).toBe(true);
    // 조사·서술격이 붙은 채로 박힌 자리표가 없어야 한다
    expect(copy.decided.follow.includes("{role}으로")).toBe(false);
    expect(copy.decided.defy.includes("{role}을")).toBe(false);
    expect(copy.decided.defy.includes("{rec}이었습니다")).toBe(false);
  });

  it("채우면 조사·서술격이 맞는 문장이 된다", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    expect(fillRoleCopy(copy.decided.follow, { roleAs: copy.roleAs.RP })).toBe(
      "올해는 중계로 갑니다.",
    );
    expect(
      fillRoleCopy(copy.decided.defy, { recWas: copy.roleWas.SP, roleObj: copy.roleObj.CP }).split(
        "\n",
      )[0],
    ).toBe("추천은 선발이었습니다. 마무리를 택했습니다.");
  });

  // ── ③ 감독 이름 ────────────────────────────────────────────
  it("본문 문안에 감독 이름 자리표가 없다", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    const bodies = [
      ...ROLE_ASK_REASONS.map((r) => copy.lead[r]),
      ...ROLE_COPY_STAGES.flatMap((st) => ROLE_POSITIONS.map((pos) => copy.recommend[st][pos])),
      copy.decided.follow,
      copy.decided.defy,
      copy.tail.ask,
    ];
    for (const b of bodies) {
      expect(b.includes("{manager}")).toBe(false);
      expect(b.includes("감독은")).toBe(false);
      expect(b.includes("감독이")).toBe(false);
    }
  });

  // ── ④ 확인 두 갈래 ─────────────────────────────────────────
  it("ahead ≥ 1 과 ahead = 0 이 서로 다른 문장이다", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    expect(roleConfirmLine(copy, 3)).toBe("지금 그 자리에 3명 있습니다. 거기에 더해 들어갑니다.");
    expect(roleConfirmLine(copy, 0)).toBe("그 자리는 비어 있습니다. 감독 생각과는 다릅니다.");
    // 0 에 "0명 있다" 가 나오면 안 된다 — 갈래가 있는 이유 그 자체다
    expect(roleConfirmLine(copy, 0).includes("0명")).toBe(false);
  });

  // ── ⑤ 말투 (사용자 확정 2026-09-03) ────────────────────────
  //
  // 본문은 **합쇼체**이고 버튼만 평서체다 — 게임의 기존 선택지가 전부 그 꼴이라
  // (「훈련한다」·「오늘은 쉰다」) 버튼까지 바꾸면 이 소식만 튄다.
  it("본문은 합쇼체다", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    const bodies = [
      ...ROLE_ASK_REASONS.map((r) => copy.lead[r]),
      ...ROLE_COPY_STAGES.flatMap((st) => ROLE_POSITIONS.map((pos) => copy.recommend[st][pos])),
      copy.tail.ask,
      copy.confirm.crowded,
      copy.confirm.empty,
      copy.decided.follow,
      copy.decided.defy,
    ];
    for (const b of bodies) {
      const last = b.split("\n").pop()!.trim();
      expect(
        last.endsWith("다.") ||
          last.endsWith("까.") ||
          last.endsWith("다") ||
          last.endsWith("시다."),
      ).toBe(true);
      // 평서체 어미가 남아 있으면 안 된다
      for (const bad of [
        "봤다.",
        "낫다.",
        "싶다.",
        "간다.",
        "택했다.",
        "있다.",
        "다르다.",
        "던지겠나.",
      ]) {
        expect(b.includes(bad)).toBe(false);
      }
    }
  });

  it("버튼만 평서체다 — 기존 선택지 관례", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    expect(copy.confirm.buttons.back).toBe("다시 고른다");
    expect(copy.confirm.buttons.go).toBe("그래도 간다");
  });

  it("물음 한 줄이 따로 있다 — 열다섯 변형에 안 섞는다", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    expect(copy.tail.ask).toBe("어디서 던지겠습니까.");
    for (const st of ROLE_COPY_STAGES) {
      for (const pos of ROLE_POSITIONS) {
        expect(copy.recommend[st][pos].includes(copy.tail.ask)).toBe(false);
      }
    }
  });

  it("숫자는 ahead 하나뿐이다 — 확인 문구에 다른 자리표가 없다", () => {
    const copy = parseRoleChoiceCopy(RAW)!;
    for (const key of ["{rank}", "{seats}", "{fit}", "{rate}"]) {
      expect(copy.confirm.crowded.includes(key)).toBe(false);
      expect(copy.confirm.empty.includes(key)).toBe(false);
    }
  });
});

describe("무대 고르기", () => {
  it("2군은 리그 접미사로 갈린다 — careerStage 로는 못 가른다", () => {
    expect(roleCopyStageOf("pro_kbl", "LEAGUE_KBL")).toBe("pro");
    expect(roleCopyStageOf("pro_kbl", "LEAGUE_KBL_FARM")).toBe("farm");
    expect(roleCopyStageOf("pro_abl", "LEAGUE_ABL_FARM")).toBe("farm");
  });

  it("아마추어 셋", () => {
    expect(roleCopyStageOf("highschool", "LEAGUE_HIGHSCHOOL")).toBe("highschool");
    expect(roleCopyStageOf("university", "LEAGUE_UNIVERSITY")).toBe("university");
    expect(roleCopyStageOf("independent", "LEAGUE_INDEPENDENT")).toBe("independent");
  });

  it("해외 1군도 pro 문안을 쓴다", () => {
    expect(roleCopyStageOf("pro_jbl", "LEAGUE_JBL")).toBe("pro");
  });
});
