import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 병역은 한 번뿐이다 ───────────────────────────────────────────
//
// 설계(`docs/design/military.md §0`): **병역을 벗어나는 길은 둘뿐**이다 —
// 상무 2년 복무로 군필, 국제대회 입상으로 면제. 그 외엔 일반병으로 간다.
// 어느 쪽이든 **끝나면 다시 갈 일이 없다.**
//
// 그런데 입대 자체에 가드가 없었다:
//
//   화면  `CareerResultModal`의 "전원 탈락: 현역 입대" 버튼 조건이
//         "아무 데도 안 됐다"뿐이라 **군필자가 독립리그에서 갈 곳이 없으면
//         또 떴다.** 그 자리엔 "독립리그 계속"이 이미 있어서 막아도 안 막힌다
//   스토어 `enlistProtagonist`가 상태를 안 보고 그대로 현역으로 바꿨다
//
// 60회 진로 조사에서 **군 복무를 세 번 하는 커리어**가 나와 잡혔다:
//   고교 → 군 → 독립 → 군 → 독립 → 군
//
// ⚠ 두 곳 다 막는다. 화면만 막으면 헤드리스·이벤트 같은 다른 호출부가
// 그대로 통과한다 — 되돌릴 수 없는 상태 전이라 스토어가 마지막 방어선이다.

const read = (p: string) => readFileSync(resolve(__dirname, "../../../", p), "utf8");

describe("병역은 미필일 때만 진행된다", () => {
  it("스토어가 미필이 아니면 입대를 거부한다", () => {
    const s = read("shared/stores/game.ts");
    expect(s).toMatch(/if \(now\.militaryStatus !== "미필"\) return s;/);
  });

  it("입대 처리보다 가드가 먼저 온다 — 뒤에 있으면 이미 바뀐 뒤다", () => {
    const s = read("shared/stores/game.ts");
    const guard = s.indexOf('if (now.militaryStatus !== "미필") return s;');
    const apply = s.indexOf('careerStage: "military"', guard > 0 ? guard : 0);
    expect(guard).toBeGreaterThan(0);
    expect(apply).toBeGreaterThan(guard);
  });

  it("화면이 군필·면제에게 입대 버튼을 안 띄운다", () => {
    const s = read("features/career/ui/CareerResultModal.svelte");
    expect(s).toMatch(/militaryStatus === "미필"/);
  });

  it("전역은 군필로 바꾼다 — 안 그러면 가드가 있어도 또 간다", () => {
    const s = read("shared/stores/game.ts");
    expect(s).toMatch(/militaryStatus: "군필"/);
  });
});
