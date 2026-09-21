import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **부대원 성격을 문안이 읽는다** (C-3 · 2026-09-21 · 죽은 칸 1).
 *
 * `members.json` 의 15명은 성격을 하나씩 갖고 장면 배정도 그걸 타는데
 * (`grades_perf`·`mentor`·`ball_partner` 태그) **문안에는 길이 없었다** —
 * 성격은 부대원 탭 카드 한 줄에만 떴고, 열다섯 명이 계급과 자리로만 남았다.
 *
 * 여기가 지키는 것은 셋이다:
 *
 * ① **열쇠가 열려 있는가** — `{member.trait}` 가 치환표에 있다. 없으면 B 가
 *    성격을 쓰는 문안을 **아예 못 쓴다**(자리표가 그대로 화면에 남는다).
 * ② **성격이 한 꼴인가** — 15명 전부 「…다」로 끝나야 뒤에 어미(`-는`·`-고`)가
 *    받침과 무관하게 붙는다. 한 명이라도 명사로 끝나면 문안이 그 사람만
 *    깨지고, 그건 데이터를 늘릴 때(B) 알아야 하는 계약이다.
 * ③ **사람이 드나드는 장면이 성격을 말하는가** — 전입·전역은 그 사람을 처음
 *    보고 마지막 보는 자리다. 거기서도 계급만 말하면 성격은 영영 안 읽힌다.
 *
 * ⚠ **낱말을 여기 박지 않는다.** 성격 문장은 데이터가 갖는다 — 검사가
 *   「말이 짧다」를 적으면 문안을 고칠 때 검사부터 빨개진다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const LIFE = read("apps/ui/src/shared/usecases/militaryLife.ts");
const MEMBERS = JSON.parse(read("resource/data/master/military/members.json")) as
  { members: { id: string; trait: string }[] } | { id: string; trait: string }[];
const members = Array.isArray(MEMBERS) ? MEMBERS : MEMBERS.members;

describe("치환 키 — 문안이 성격을 부를 수 있다", () => {
  it("`member.trait` 가 이벤트 치환표에 있다", () => {
    expect(LIFE).toContain('"member.trait"');
    // 이름과 **같은 표**에서 온다 — 표가 둘이면 한쪽만 늘어난다
    const table = LIFE.slice(LIFE.indexOf("const vars = {"));
    expect(table.slice(0, 400)).toContain('"member.name"');
    expect(table.slice(0, 400)).toContain('"member.trait"');
  });

  it("성격이 빈 칸이면 키를 안 싣는다 — 자리표가 화면에 남아야 틀린 게 보인다", () => {
    // 빈 문자열로 채우면 「성격이 없다」와 「문안이 틀렸다」가 같아 보인다
    expect(LIFE).toContain("memberOf?.trait || undefined");
  });
});

describe("성격 문장의 계약 — 15명이 한 꼴이다", () => {
  it("전부 채워져 있다", () => {
    expect(members.length).toBeGreaterThan(0);
    for (const m of members) expect(m.trait, `${m.id} 의 성격이 비었다`).toBeTruthy();
  });

  /**
   * 🔴 **이것이 굴절표를 안 만든 이유다.** 「…다」로 끝나면 `-는`·`-고` 같은
   *   어미가 받침과 무관하게 붙는다(「잘 챙긴다는 사람입니다」). 명사로 끝나는
   *   성격이 하나 섞이면 그 사람만 문안이 깨지고, 그때는 15명 × 조사 표가
   *   필요해진다 — `MILITARY_COPY_REVIEW_2026-09-03.md` §2 가 (나)로 적어 둔 길이다.
   */
  it("전부 「다」로 끝난다 — 어미가 받침과 무관하게 붙는 꼴", () => {
    for (const m of members) {
      expect(m.trait.endsWith("다"), `${m.id}: ${m.trait}`).toBe(true);
      // 마침표를 데이터가 들면 문안이 이어 쓸 때 문장 가운데 점이 찍힌다
      expect(m.trait.includes("."), `${m.id}: 마침표는 문안이 붙인다`).toBe(false);
    }
  });

  it("성격이 서로 다르다 — 같은 말이 둘이면 사람이 안 갈린다", () => {
    expect(new Set(members.map((m) => m.trait)).size).toBe(members.length);
  });
});

describe("사람이 드나드는 장면이 성격을 말한다", () => {
  /** 전입 — 그 사람을 **처음** 보는 자리다 */
  it("후임 도착 소식이 성격을 싣는다", () => {
    const at = LIFE.indexOf("msg-mil-unit-join-");
    expect(at).toBeGreaterThan(0);
    expect(LIFE.slice(at, at + 300)).toContain("mem.trait");
  });

  /** 전역 — 마지막으로 보는 자리. 관계는 남는다고 말하는 소식이라 더 그렇다 */
  it("전역 소식이 성격을 싣는다", () => {
    const at = LIFE.indexOf("msg-mil-unit-leave-");
    expect(at).toBeGreaterThan(0);
    expect(LIFE.slice(at, at + 400)).toContain("mem.trait");
  });

  /**
   * ⚠ **성격은 제 줄로 선다.** 앞 문장에 이어 붙이려면 어미를 지어내야 하고,
   *   그러면 이 파일이 문안을 갖게 된다 — 성격 문장은 데이터의 것이다.
   */
  it("성격 문장을 이 파일이 짓지 않는다 — 데이터 문장에 마침표만 붙인다", () => {
    expect(LIFE).toContain("${mem.trait}.");
  });
});

describe("게이트가 점 든 자리표시자를 본다", () => {
  /**
   * 🔴 `check:josa` 의 스캔이 `\w` 라 `{member.name}` 꼴을 통째로 건너뛰었다 —
   *    이 게이트가 잡으라고 만들어진 바로 그 결함(「포반장 하사이」)을 사람이
   *    눈으로 찾았다. `{member.trait}` 가 열리면서 그 꼴이 늘 자리라 넓혔다.
   */
  it("`check-josa` 가 점이 든 열쇠를 스캔한다", () => {
    expect(read("scripts/check-josa.cjs")).toContain("[\\w.]+");
  });
});
