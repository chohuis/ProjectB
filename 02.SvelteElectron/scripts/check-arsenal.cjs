#!/usr/bin/env node
// ── 배운 구종이 경기에 나오는가 (Phase 3 게이트) ────────────────
//
//   npm run check:arsenal
//
// 예전엔 **안 나왔다.** `PitcherStats`에 구종 배열 자체가 없었고
// `auto_pick_decision`이 Fastball/Slider/Changeup을 하드코딩으로 뽑았다.
// 너클볼을 마스터해도 자동 경기에서 던지지 않았고, 숙련도는 화면에 적힌
// 숫자였을 뿐 결과에 안 닿았다.
//
// ⚠ **배선이 하나만 빠져도 그 경로는 조용히 옛날처럼 돈다.** 엔진이 빈 배열을
// 받으면 패스트볼 하나로 폴백하는데, 그 모습이 "배선 누락"과 똑같다.
// 그래서 이 게이트는 값이 아니라 **연결**을 본다.
//
// 설계: docs/design/training.md §3-3

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const log = (s) => process.stdout.write(s + "\n");

let failed = 0;
const check = (name, ok, detail) => {
  log(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : "  — " + detail}`);
  if (!ok) failed++;
};

log("");
log("── 구종이 엔진까지 가는가 ────────────────────────────────");

// ── ① 엔진이 구종을 받는가 ───────────────────────────────────
const types = read("packages/engine-native/src/types.rs");
check("PitcherStats에 arsenal이 있다", /pub arsenal: Vec<ArsenalPitch>/.test(types),
  "구종 배열이 없으면 엔진은 구종을 알 수 없다");
check("ArsenalPitch에 grade가 있다", /pub struct ArsenalPitch[\s\S]{0,200}pub grade: u8/.test(types),
  "숙련도가 없으면 '주무기'가 안 생긴다");

// ── ② 하드코딩 선택이 돌아오지 않았는가 ──────────────────────
const engine = read("packages/engine-native/src/match_engine.rs");
const HARDCODED = /let types = \[PitchType::Fastball, PitchType::Fastball, PitchType::Slider/;
check("구종 선택이 하드코딩이 아니다", !HARDCODED.test(engine),
  "auto_pick_decision이 다시 고정 목록에서 뽑는다");
check("보유 구종에서 뽑는다", /pick_from_arsenal\(/.test(engine),
  "pick_from_arsenal을 안 쓴다");

// ── ③ 숙련도가 결과에 닿는가 ─────────────────────────────────
// ⚠ **곱셈이 아니라 덧셈이어야 한다.** 처음에 `pitch_base × 배수`로 걸었더니
// 1등급 패스트볼이 매 투구 −7.1을 먹어 주인공 ERA가 8.78 → 19.86으로 튀었다.
// 품질은 여러 항의 합이고 다른 보정은 ±5 규모다.
check("숙련도가 공의 품질에 걸린다", /pitch_base\(decision\.pitch_type\) \+ grade_bonus/.test(engine),
  "숙련도가 품질에 안 걸리면 화면의 '숙련도 4/5'는 장식이다");
check("숙련도가 선택 빈도에 걸린다", /grade_pick_weight/.test(engine),
  "빈도에 안 걸리면 주무기가 안 생긴다");

const tuning = read("packages/engine-native/src/tuning.rs");
check("숙련도 계수가 tuning에 있다",
  /grade_quality_bonus/.test(tuning) && /grade_pick_weight/.test(tuning),
  "계수가 엔진 로직에 흩어져 있다");

// ── ④ TS가 실제로 넘기는가 ───────────────────────────────────
// **여기가 제일 잘 빠지는 자리다.** 엔진은 준비됐는데 아무도 안 넘기면
// 전부 패스트볼 폴백으로 돌고, 겉보기엔 아무 문제가 없다.
const auto = read("apps/ui/src/shared/usecases/runAutoAdvance.ts");
check("자동 경기가 주인공 구종을 넘긴다", /arsenal:\s*toEngineArsenal\(p\.pitches\)/.test(auto),
  "주인공이 배운 구종이 자동 경기에 안 나온다");

const lineup = read("apps/ui/src/shared/utils/matchLineupBuilder.ts");
check("NPC 선발 구종도 넘긴다", /arsenal:\s*toEngineArsenal\(/.test(lineup),
  "상대 에이스가 전부 패스트볼만 던지는 세계가 된다");

// ── ⑤ 변환표가 하나인가 ──────────────────────────────────────
const files = [
  "apps/ui/src/pages/match/MatchPage.svelte",
  "apps/ui/src/shared/usecases/runAutoAdvance.ts",
  "apps/ui/src/shared/utils/matchLineupBuilder.ts",
];
const dup = files.filter((f) => /PITCH_FASTBALL:\s*"fastball"/.test(read(f)));
check("구종 ID→엔진 변환표가 한 곳뿐이다", dup.length === 0,
  `표가 복제된 곳: ${dup.join(", ")}`);
check("공용 변환표가 있다",
  /PITCH_ID_TO_ENGINE/.test(read("apps/ui/src/shared/utils/arsenal.ts")),
  "arsenal.ts에 정본이 없다");

// ── ⑥ 폼 무너짐이 화면과 경기 **양쪽에** 가는가 (Phase 4) ────
//
// 한쪽만 가면 결함이다:
//   경기에만  → 조용한 너프. 왜 못 던지는지 알 수 없다
//   화면에만  → "표시는 있는데 효과가 없는" 값. 이 프로젝트가 이미 여러 번 당했다
check("폼 무너짐 식이 tuning에 있다", /pub fn form_penalty/.test(tuning),
  "식이 흩어져 있으면 화면과 경기가 갈린다");
// ⚠ **부르는 것과 적용하는 것은 다르다.** 처음엔 `form_penalty(...)` 호출만
// 봤는데, 결과를 안 쓰게 바꿔도 게이트가 통과했다(변이 검증에서 잡음).
// 깎은 값이 실제로 들어가는지 본다.
check("경기가 실제로 제구를 깎는다",
  /command:\s*\(base_cmd - cmd_pen\)/.test(engine)
  && /control:\s*\(base_ctl - ctl_pen\)/.test(engine),
  "build_pitcher가 안 깎으면 폼 무너짐은 화면 장식이다");
check("자동 경기가 개발 중 구종을 넘긴다",
  /developingDifficulty:\s*developingDifficultyOf\(/.test(auto),
  "안 넘기면 페널티가 조용히 사라진다");

const trainPage = read("apps/ui/src/pages/training/TrainingPage.svelte");
check("훈련 화면이 폼 교정을 표시한다", /폼 교정 중/.test(trainPage),
  "경기에만 걸고 화면에 안 적으면 조용한 너프다");
check("표시 하락폭도 엔진에서 받는다", /formPenalty\(/.test(trainPage),
  "화면이 자기 식으로 적으면 표시와 실제가 갈린다");

const catalog = JSON.parse(read("resource/data/master/training/pitch_catalog.json"));
const noDiff = (catalog.pitches ?? []).filter((x) => x.formDifficulty === undefined);
check("모든 구종에 formDifficulty가 있다", noDiff.length === 0,
  `없는 구종: ${noDiff.map((x) => x.id).join(", ")}`);

log("");
if (failed > 0) {
  log(`구종 배선 점검 실패 ${failed}건`);
  log("설계: docs/design/training.md §3-3");
} else {
  log("구종 배선 점검 통과 — 배운 구종이 경기까지 간다");
}
process.exit(failed > 0 ? 1 : 0);
