import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * **데이터가 코드와 어긋나도 아무도 안 죽고 로그도 안 남는다.**
 *
 * 게임은 돌고 콘텐츠만 사라진다. 이 트랙이 겪은 결함이 대부분 그 부류였고,
 * 여기 셋은 2026-08-25에 전체 공용 11종을 하나씩 펼쳐 보다 나왔다.
 *
 * 셋 다 지금은 0건이다. **이 검사는 다시 0이 아니게 되는 걸 막는다.**
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".json") ? [p] : [];
  });
}

type Rule = {
  id: string;
  poolId?: string | null;
  conditions?: unknown[];
  messageTemplateId?: string | null;
  decisionTemplateId?: string | null;
};
type Tmpl = { id: string; subject?: string; body?: string; bodies?: string[] };

const RULES: Rule[] = ["mandatory", "conditional", "random"]
  .flatMap((lane) => walk(join(MASTER, "events", lane)))
  .map((p) => JSON.parse(readFileSync(p, "utf8")) as Rule);

const TMPL = new Map<string, Tmpl>(
  (JSON.parse(readFileSync(join(MASTER, "messages/templates.json"), "utf8")).templates as Tmpl[])
    .map((t) => [t.id, t]),
);

const bodiesOf = (t: Tmpl | undefined): string[] =>
  !t ? [] : Array.isArray(t.bodies) && t.bodies.length > 0 ? t.bodies : t.body ? [t.body] : [];

describe("이벤트 데이터 위생", () => {
  /**
   * 🔴 `MSG_RAND_FRIEND_VISIT`이 본문 끝에 `[사기 +5]`라 써놓고 **아무것도
   * 안 줬다.** 선택지가 없으면 효과를 실을 자리가 없다 — 규칙 단위 `effects`는
   * 엔진에 없고, `ruleToOutput`은 `options[].effects`만 읽는다.
   *
   * 힌트를 쓸 자리는 선택지의 `effectHint`다. 본문은 이야기만 한다.
   */
  it("본문이 효과를 약속하면 선택지가 있다", () => {
    const HINT = /\[[^\]\n]*[+\-]\s*\d+[^\]\n]*\]/;
    const liars = RULES
      .filter((r) => !r.decisionTemplateId)
      .filter((r) => bodiesOf(TMPL.get(r.messageTemplateId ?? "")).some((b) => HINT.test(b)))
      .map((r) => r.id);
    expect(liars).toEqual([]);
  });

  /**
   * 🔴 `EVT_RAND_SOCIAL_MEDIA_MENTION`의 `conditions`가 **빈 배열**이었다.
   * 고교 1학년 첫 주 무명 선수의 경기 하이라이트가 SNS에서 돌았고, 쿨다운이
   * 1주라 매주 후보에 올라 6시즌 31회 떴다 — 보상은 없다.
   *
   * ⚠ 조건이 없다는 건 "언제나 참"이다. 그건 의도일 수 없다 — 적어도 무대
   * 하나는 정해야 한다. 진짜 전체 공용이라도 상태 조건 하나는 붙는다.
   */
  it("조건이 하나도 없는 규칙은 없다", () => {
    const bare = RULES.filter((r) => (r.conditions ?? []).length === 0).map((r) => r.id);
    expect(bare).toEqual([]);
  });

  /**
   * 🔴 `EVT_RAND_FRIEND_VISIT`(공용)과 `EVT_HS_LIFE_FRIEND_VISIT`(고교)이
   * **같은 풀에서 같은 템플릿**을 썼다. 고교생은 같은 글을 두 규칙에서 받았고,
   * 조건만 다르고 글자는 한 자도 안 달랐다.
   *
   * ⚠ **풀이 없는(`poolId` 없는) 것끼리는 겹쳐도 된다.** 중간고사·개강처럼
   * 학년으로 갈리는 연간 행사가 그렇다 — 같은 주에 같이 뽑히지 않는다.
   * 문제는 **같은 풀 안**이다. 거기선 매주 같은 상자에서 함께 뽑힌다.
   *
   * ⚠ 지금 14건(규칙 41개)이 남아 있고 **거의 다 고교·대학 칸**이다.
   * 최악은 `MSG_RAND_TEAM_MEAL`·`MSG_RAND_SENIOR_ADVICE`로 각각 6개가
   * 같은 상자에서 뽑힌다. 칸을 내려가며 푼다 — 여기서는 **더 늘지 않는
   * 것**만 지킨다.
   */
  it("같은 풀 + 같은 템플릿 겹침이 14건을 넘지 않는다", () => {
    const byKey = new Map<string, string[]>();
    for (const r of RULES) {
      if (!r.poolId) continue;
      const k = `${r.messageTemplateId}|${r.poolId}`;
      byKey.set(k, [...(byKey.get(k) ?? []), r.id]);
    }
    const dup = [...byKey.entries()].filter(([, v]) => v.length > 1);
    expect(dup.length).toBeLessThanOrEqual(14);
  });
});
