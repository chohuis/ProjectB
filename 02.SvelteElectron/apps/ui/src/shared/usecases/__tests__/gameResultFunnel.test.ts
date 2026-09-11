import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 경기 결과는 **깔때기 하나로만** 지나가야 한다.
 *
 * 🔴 **낱개로 막다 네 번 실패했다.** `seasonStore.apply*Result`를 호출부
 * 20곳이 제각기 부르는데 경기 로그를 남기는 자리는 절반뿐이라 기록이 샜다.
 * 고칠 때마다 "이번엔 다 됐다"고 읽었지만 매번 다른 갈래가 남아 있었다
 * (적재율이 5% → 84% → 100%로 보였다가 또 샜다).
 *
 * 그래서 **구조로 막는다.** `recordGameResult` 밖에서 `apply*Result`를 부르면
 * 이 검사가 실패한다. 새 갈래가 생겨도 깔때기를 지날 수밖에 없다.
 *
 * ⚠ **소스를 훑는 검사라 배선까지는 못 본다.** 이 프로젝트에서 그 한계로
 * `get is not defined`를 놓친 적이 있다. 실제 적재는 `check:recentgames`가
 * 경기 단위로 잰다 — 둘이 짝이다.
 */

const SRC = join(__dirname, "../../../../..", "ui/src");
const FUNNEL = "shared/usecases/recordGameResult.ts";

/** 깔때기를 지나지 않아도 되는 자리 — **줄일 대상이지 늘릴 대상이 아니다** */
const ALLOWED = [
  FUNNEL,
  // 사용자가 직접 뛴 경기. 화면에서 바로 반영한다
  "pages/main/MainPage.svelte",
  // 주인공 경기 — 이미 자기 자리에서 로그를 남긴다. 옮길 땐 그 호출을 같이 걷어야 한다
  "shared/usecases/applyGameOutcome.ts",
];

const APPLY =
  /seasonStore\.apply(MatchResult|ProtagonistGroupNpcResult|TournamentResult|FriendlyResult)\s*\(/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|svelte)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(SRC).map((p) => ({
  rel: p.slice(SRC.length + 1).replace(/\\/g, "/"),
  text: readFileSync(p, "utf8"),
}));

describe("경기 결과 깔때기", () => {
  it("`apply*Result`를 깔때기 밖에서 부르지 않는다", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (ALLOWED.includes(f.rel)) continue;
      const hits = f.text.match(APPLY);
      if (hits) offenders.push(`${f.rel} (${hits.length}곳)`);
    }
    expect(
      offenders,
      "깔때기를 건너뛰면 경기 로그가 샌다 — `recordGameResult`를 쓴다:\n" + offenders.join("\n"),
    ).toEqual([]);
  });

  it("예외 목록이 늘지 않았다 — 늘리려면 왜인지 여기 적는다", () => {
    // 셋이 정원이다. 하나 늘 때마다 샐 자리가 하나 는다
    expect(ALLOWED.length).toBe(3);
  });

  it("예외로 둔 파일들이 실제로 존재한다 — 사라진 예외는 죽은 가드다", () => {
    for (const rel of ALLOWED) {
      expect(
        files.some((f) => f.rel === rel),
        `${rel}이 없다`,
      ).toBe(true);
    }
  });

  it("깔때기가 네 갈래를 다 다룬다", () => {
    const funnel = files.find((f) => f.rel === FUNNEL);
    expect(funnel).toBeTruthy();
    for (const kind of ["friendly", "tournament", "group", "league"]) {
      expect(funnel!.text, `${kind} 갈래가 없다`).toContain(`case "${kind}"`);
    }
  });

  it("깔때기가 경기 로그를 남긴다 — 대조군", () => {
    // 이 줄이 사라지면 깔때기가 통과 지점일 뿐 아무 일도 안 하게 된다
    const funnel = files.find((f) => f.rel === FUNNEL)!;
    expect(funnel.text).toContain("recordGameLogs(");
  });
});
