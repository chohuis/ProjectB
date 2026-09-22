// 편성 성향 진입점 (2026-09-22 · 2단계 ⑤).
//
// **규칙을 여기 다시 적지 않는다.** `test-roster-gen.cjs` 는 `.cjs` 라
// `newGameV3.ts` 의 `squadPlanOf`·`budgetOf` 를 그냥 못 부른다. 그래서
// 하네스가 **자기 표를 손으로 적을 뻔했고**, 그러면 코드 표와 하네스 표가
// 두 벌이 되어 "검사는 초록인데 게임은 다른 값"이 난다.
//
// `measure-role.cjs` ↔ `roleEntry.ts` 와 같은 수법이다 — 진입점만 말아서
// esbuild 로 번들해 쓴다. 여기에 로직은 한 줄도 없다.
export {
  squadPlanOf,
  budgetOf,
  buildSalaryIndex,
  QUALITY_BY_PHILOSOPHY,
  SPEND_BY_RESOURCE,
} from "../../apps/ui/src/shared/repo/newGameV3";
