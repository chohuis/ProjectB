import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * **본문도 선택지도 없는 이벤트 규칙은 등록될 수 없다.**
 *
 * `EVT_TRADE_RUMOR`·`EVT_TRADE_CONFIRMED`가 정확히 그랬다. 둘은 트레이드
 * 코드가 `pushPendingAction({type:"event", ...})`으로 **제목·본문을 직접 들고**
 * 띄우는 통보인데, `conditional/`에도 규칙으로 등록돼 있었다. 조건이
 * `week_gte 12` 하나뿐이라 12주차 뒤로 항상 후보였고, 템플릿이 없으니
 * 엔진이 뽑아도 아무것도 안 나갔다.
 *
 * ⚠ **피해는 빈 메시지가 아니다.** conditional은 조건 통과분 중 **주당 하나만**
 * 시도한다. 이 둘이 뽑히면 그 주는 이야기 소식이 **0건**이다 — 292주 실측에서
 * **37주**가 그렇게 지나갔다(`scripts/measure-eventfunnel.cjs`).
 *
 * 그래서 "빈 메시지를 걸러낸다"로는 안 풀린다. 애초에 **큐에 들어오면 안 된다.**
 * 규칙 파일 쪽에서 막는 이유다.
 *
 * ⚠ 레거시 스텁(`events/rules/*.json`)도 같이 본다. `_manifest.json`이 없으면
 * 로더가 조용히 그쪽으로 폴백하므로, 한쪽만 고치면 **폴백 경로만 옛 상태로 돈다.**
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".json") ? [p] : [];
  });
}

type Rule = { id?: string; messageTemplateId?: string | null; decisionTemplateId?: string | null };

const hasOutput = (r: Rule) => Boolean(r.messageTemplateId) || Boolean(r.decisionTemplateId);

describe("이벤트 규칙 ↔ 템플릿 배선", () => {
  for (const lane of ["mandatory", "conditional", "random"]) {
    it(`${lane} — 규칙마다 messageTemplateId나 decisionTemplateId가 있다`, () => {
      const bad = walk(join(MASTER, "events", lane))
        .map((p) => JSON.parse(readFileSync(p, "utf8")) as Rule)
        .filter((r) => !hasOutput(r))
        .map((r) => r.id);
      expect(bad).toEqual([]);
    });
  }

  it("레거시 스텁(events/rules/*.json)도 같은 규칙을 지킨다", () => {
    const bad: string[] = [];
    for (const lane of ["mandatory", "conditional", "random"]) {
      const p = join(MASTER, "events", "rules", `${lane}.json`);
      const j = JSON.parse(readFileSync(p, "utf8")) as { events?: Rule[] };
      for (const r of j.events ?? []) if (!hasOutput(r)) bad.push(`${lane}:${r.id}`);
    }
    expect(bad).toEqual([]);
  });

  it("트레이드 통보는 규칙이 아니라 pendingAction으로만 온다", () => {
    // 되돌아오면 여기서 잡는다 — 위 검사들과 달리 이름을 못박는 게 목적이다
    const ids = walk(join(MASTER, "events"))
      .map((p) => { try { return JSON.parse(readFileSync(p, "utf8")) as Rule; } catch { return {}; } })
      .map((r) => r.id);
    expect(ids).not.toContain("EVT_TRADE_RUMOR");
    expect(ids).not.toContain("EVT_TRADE_CONFIRMED");
  });
});
