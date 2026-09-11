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
      .map((p) => {
        try {
          return JSON.parse(readFileSync(p, "utf8")) as Rule;
        } catch {
          return {};
        }
      })
      .map((r) => r.id);
    expect(ids).not.toContain("EVT_TRADE_RUMOR");
    expect(ids).not.toContain("EVT_TRADE_CONFIRMED");
  });
});

/**
 * **정본이 둘이 되는 것을 막는다** (2026-08-24).
 *
 * 이 프로젝트가 반복해 겪은 형태다 — `CLAUDE.md`: *"코드에 표를 두 번 적지 말 것 —
 * Phase 7에서 이 결함만 15건 나왔다."*
 *
 * 풀의 `eventIds`가 정확히 그랬다. 엔진은 규칙 자신의 `poolId`로 풀을
 * 만들고(`eventEngine` §3 `poolRuleMap`) 그 목록을 **안 읽는데**, 목록은
 * 22/2/60이고 실제 규칙은 50/13/109였다 — **절반만 담긴 채 아무도 모르게
 * 낡아 있었다.** 지웠고, 다시 생기면 여기서 잡는다.
 */
describe("정본이 하나인가", () => {
  it("풀이 자기 이벤트 목록을 따로 들지 않는다", () => {
    const bad: string[] = [];
    for (const p of ["media", "social", "team_life"]) {
      const j = JSON.parse(readFileSync(join(MASTER, "events/pools", `${p}.json`), "utf8"));
      if (j.eventIds !== undefined) bad.push(`${j.id}: eventIds ${j.eventIds.length}건`);
    }
    expect(bad).toEqual([]);
  });

  it("아무 규칙도 안 쓰는 템플릿이 없다", () => {
    const used = new Set<string>();
    for (const lane of ["mandatory", "conditional", "random"]) {
      for (const p of walk(join(MASTER, "events", lane))) {
        const r = JSON.parse(readFileSync(p, "utf8")) as Rule;
        if (r.messageTemplateId) used.add(r.messageTemplateId);
        if (r.decisionTemplateId) used.add(r.decisionTemplateId);
      }
    }
    const msgs = JSON.parse(readFileSync(join(MASTER, "messages/templates.json"), "utf8"))
      .templates as { id: string }[];
    const decs = JSON.parse(readFileSync(join(MASTER, "messages/decision_templates.json"), "utf8"))
      .decisions as { id: string }[];

    // 고아는 화면에 닿을 길이 없다 — 쓸 생각이면 규칙을 잇고, 아니면 지운다
    expect([
      ...msgs.filter((t) => !used.has(t.id)).map((t) => `msg:${t.id}`),
      ...decs.filter((d) => !used.has(d.id)).map((d) => `dec:${d.id}`),
    ]).toEqual([]);
  });
});

/**
 * 🔴 **가리키는 템플릿이 실제로 있는가.**
 *
 * 2026-08-26에 대학 학년 서사 24종을 만들면서 규칙 파일만 쓰고 **템플릿·선택지를
 * 디스크에 안 썼다.** 24종이 없는 템플릿을 가리킨 채 매니페스트에 실렸고,
 * `check:eventconditions`·`check:effectkeys`·`npm test` **전부 통과했다.**
 *
 * 런타임에선 `ruleToOutput`이 빈 메시지로 버린다 — 트리거만 소비하고
 * 아무것도 안 나간다. 이 트랙이 여섯 번째로 만난 "조용한 결함"이다.
 */
describe("규칙이 가리키는 템플릿이 실재하는가", () => {
  const MASTER2 = resolve(__dirname, "../../../../../../resource/data/master");
  const TMPL_IDS = new Set(
    (
      JSON.parse(readFileSync(join(MASTER2, "messages/templates.json"), "utf8")).templates as {
        id: string;
      }[]
    ).map((t) => t.id),
  );
  const DEC_IDS = new Set(
    (
      JSON.parse(readFileSync(join(MASTER2, "messages/decision_templates.json"), "utf8"))
        .decisions as { id: string }[]
    ).map((d) => d.id),
  );

  for (const lane of ["mandatory", "conditional", "random"]) {
    it(`${lane} — 없는 템플릿을 가리키는 규칙이 없다`, () => {
      const orphans: string[] = [];
      for (const f of walk(join(MASTER2, "events", lane))) {
        const r = JSON.parse(readFileSync(f, "utf8")) as Rule & {
          messageTemplateId?: string | null;
          decisionTemplateId?: string | null;
        };
        if (r.messageTemplateId && !TMPL_IDS.has(r.messageTemplateId))
          orphans.push(`${r.id} → ${r.messageTemplateId}`);
        if (r.decisionTemplateId && !DEC_IDS.has(r.decisionTemplateId))
          orphans.push(`${r.id} → ${r.decisionTemplateId}`);
      }
      expect(orphans).toEqual([]);
    });
  }
});
