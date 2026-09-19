import type { DecisionEffect } from "../types/main";
import type { CareerStage } from "../types/save";

/**
 * **계측 플레이어의 성향 셋** (2026-09-09 · 계측 2-3 · 사용자 확정).
 *
 * 🔴 왜 필요했나. 사용자 지적이다 — 계측이 재는 「플레이어」가 **하나뿐이고
 *   대부분의 주에 첫 갈래를 고른다.** 첫 갈래는 사람의 취향이 아니라
 *   **데이터 작성 순서**다. 그걸로 잰 밸런스는 「JSON 에 먼저 적힌 쪽」의 밸런스다.
 *
 * | 성향 | 무엇을 보나 | 쓰는 자리 |
 * |---|---|---|
 * | `growth` | **즉시 스탯 상승이 있으면 그것 먼저**, 없으면 그 시기 주력 스탯 | 🔴 **밸런스의 기준** |
 * | `safe` | 몸을 지킨다 — 피로·부상 위험·컨디션 | 하한 확인 |
 * | `lazy` | **씨앗 고정 무작위** | 바닥 확인 |
 *
 * ⚠ `lazy` 는 「첫 갈래」가 아니다. 그건 사람이 아니라 데이터 순서를 재는 꼴이라
 *   **씨앗으로 고정한 무작위**로 바꿨다 — 재현되면서 순서에 안 매인다.
 * ⚠ **구종 관리는 셋 다 같다**(사용자 확정) — `ensurePitchTraining` 규칙 그대로.
 *   구종은 취향이 아니라 이 게임의 축이라 성향으로 가르면 축이 흔들린다.
 * ⚠ 성향은 **계측 전용**이다. 실제 플레이는 사람이 고른다.
 */
export type SimPersona = "growth" | "safe" | "lazy";

export const SIM_PERSONAS: readonly SimPersona[] = ["growth", "safe", "lazy"];

/**
 * 무대별 주력 스탯 — `BALANCE_BACKLOG §16-2`(B 실측)가 정본이다.
 *
 * ⚠ 여기 표를 늘릴 때 그 문서도 같이 고쳐라. 두 벌이 되면 한쪽만 고쳐진 채 남는다.
 * ⚠ 위기집중력·견제는 뺐다 — OVR 가중 0.3·0.2 에 에이징에도 안 걸려
 *   **값이 거의 안 남는 스탯**이다(§16-2 꼬리).
 */
export function primaryStatsFor(stage: CareerStage, farm: boolean): readonly string[] {
  if (farm) return ["velocity", "movement", "stamina", "control"];
  switch (stage) {
    case "highschool":
    case "university":
    case "independent":
      return ["velocity", "command", "control"];
    case "pro_kbl":
    case "pro_abl":
    case "pro_jbl":
      return ["stamina", "control", "command"];
    default:
      return ["velocity", "command", "control"];
  }
}

/** 이 효과가 **몸에 나쁜** 정도 — 클수록 나쁘다. `safe` 가 작은 쪽을 고른다 */
export function bodyCost(fx: DecisionEffect | undefined): number {
  if (!fx) return 0;
  return (
    (fx.fatigueDelta ?? 0) -
    // 컨디션은 **낮아지는 것이 나쁘다** — 부호를 뒤집어 더한다
    (fx.conditionDelta ?? 0) +
    // 부상 위험은 음수가 「덜 다친다」다(`types/main`) — 그대로 더하면 부호가 맞는다
    (fx.injuryRiskMod ? fx.injuryRiskMod.pct : 0)
  );
}

/**
 * 🔴 **성장형이 몸값을 본다** (2026-09-10 · 사용자 확정).
 *
 * 30판 실측에서 성장형이 안전형에 **모든 칸에서 졌다** — 통산승 36 대 73,
 * 그리고 **최고 OVR 마저 81 대 83**. 성장을 고르는 쪽이 성장에서 지면,
 * 그건 잘 고르는 게 아니라 **자해다.**
 *
 * 사슬은 이랬다: 몸값을 아예 안 봄 → 부상 중앙 13(안전형 7) → 수술 난 판
 * **6/20**(안전형 0/5) → 커리어 중단 → 프로 시즌 6(안전형 8) → 등판 87 대 153.
 * 사람이면 12년 동안 매주 「몸을 갈아 넣는다」를 고르지 않는다.
 *
 * ⚠ **세게 걸면 안 된다**(사용자 확정). 몸을 재는 순간 `safe` 와 같아지면
 *   성향 셋이 둘이 된다. 성장형은 여전히 **밀어붙이는 쪽**이되 자해만 안 하면 된다.
 *   계수는 실제 갈래 데이터로 재서 골랐다 — `GROWTH_BODY_WEIGHT` 머리말.
 */
/**
 * 성장형이 몸값에 매기는 값. **제안값**(`BALANCE_BACKLOG`) — 5단계에서 D 가 다시 잰다.
 *
 * ── 어떻게 골랐나 (`npm run probe:a:bodyweight` · 실제 갈래 559묶음) ──
 *
 * 판을 돌리기 전에 **갈래 데이터로** 쟀다. 계수마다 ① 안전형과 같은 답을 내는
 * 비율(=성향이 무너지는가) ② 고른 갈래의 몸값 평균(=자해하는가) ③ 스탯 갈래를
 * 고른 비율(=성장을 포기하는가):
 *
 * ```
 *   계수    안전형과 같은 답   몸값 평균   스탯 갈래
 *   0            41.9%          +2.56       12.7%   ← 고치기 전. **자해한다**
 *   0.25         63.7%          -0.13       12.7%
 *   0.5          69.9%          -0.97       12.7%   ← 골랐다
 *   1            76.0%          -1.66       12.7%
 *   3            86.0%          -2.39       12.9%
 *   20           90.3%          -2.83       10.2%   ← 성향이 둘로 무너진다
 * ```
 *
 * 🔴 **0 에서는 몸값 평균이 +2.56 이다** — 안전형과 같은 답이 41.9% 로 **동전보다
 *   낮다.** 그냥 몸을 안 보는 게 아니라 **적극적으로 해로운 쪽을 골랐다.**
 *   그것이 수술 6/20 을 만들었다.
 *
 * **0.5 를 고른 이유** — 평균만 보면 0.25 가 딱 중립(−0.13)이지만, 수술을 만든 것은
 * 평균이 아니라 **꼬리**다(피로 +15 에 부상위험 +20 같은 갈래). 0.5 면 그런
 * 갈래(몸값 35)의 벌점이 17.5 라 **XP 8 짜리 보상으로는 못 산다** — 스탯이 걸렸을
 * 때만 산다. 그러면서 안전형과 **30% 는 다르게** 고르고, 스탯 갈래를 고르는 비율은
 * 12.7% 로 **하나도 안 줄었다**(성장을 포기한 게 아니다).
 *
 * ⚠ 눈금 감각: 주력 스탯 +1 = **120**. 이 값이 12 를 넘으면 스탯 +1 도 못 이긴다.
 */
export const GROWTH_BODY_WEIGHT = 0.5;

/**
 * 이 효과가 **성장에 좋은** 정도 — 클수록 좋다.
 *
 * 사용자 확정 순서: **즉시 스탯 상승이 있으면 그것 먼저**, 없으면 그 시기 주력 스탯.
 * 그래서 즉시 스탯(`statDelta`)에 큰 자리값을 준다 — XP 몇 점으로는 못 뒤집는다.
 * 거기서 **몸값을 뺀다**(위 머리말).
 */
export function growthValue(
  fx: DecisionEffect | undefined,
  primary: readonly string[],
  /** 몸값 계수. 재보려고 열어 둔다 — 게임 코드는 기본값을 쓴다 */
  bodyWeight: number = GROWTH_BODY_WEIGHT,
): number {
  if (!fx) return 0;
  const key = (k: string) => (k.includes(".") ? k.split(".")[1] : k);
  let v = 0;
  // ① 즉시 스탯 — 자리값을 크게 준다(「있으면 그것 먼저」)
  for (const [k, amt] of Object.entries(fx.statDelta ?? {})) {
    if (key(k) === "ovr") continue; // 파생값이라 안 오른다
    v += amt * (primary.includes(key(k)) ? 120 : 80);
  }
  // ② 잠재력·성장률 — 스탯은 아니지만 성장의 상한을 민다
  v += (fx.potentialDelta ?? 0) * 60 + (fx.devRateDelta ?? 0) * 12;
  // ③ 구종 — 이 게임의 축이다. 다만 성향으로 가르지 않기로 했으므로(구종 관리는
  //    셋 다 같다) **고르는 자리에서만** 값을 준다
  if (fx.pitchGrant) v += 90;
  if (fx.pitchGradeUp) v += 70;
  if (fx.pitchProgressJump) v += fx.pitchProgressJump.pct * 0.8;
  // ④ 훈련 효율 — 주 수만큼 곱한다(레어의 주력 보상)
  if (fx.trainEffBoost) v += fx.trainEffBoost.pct * fx.trainEffBoost.weeks * 0.15;
  // ⑤ XP — 주력이면 더 친다
  for (const [k, amt] of Object.entries(fx.xp ?? {})) {
    v += amt * (primary.includes(key(k)) ? 1.5 : 1.0);
  }
  // ⑥ 🔴 **몸값을 뺀다** — 스탯을 좇되 수술까지 가는 갈래는 피한다.
  //    `bodyCost` 는 `safe` 가 쓰는 것과 **같은 자**다(정본이 둘이 되면 안 된다).
  v -= bodyWeight * bodyCost(fx);
  return v;
}

/**
 * 씨앗 고정 무작위 — `lazy` 가 쓴다.
 *
 * ⚠ `Math.random()` 금지(CLAUDE.md)라 **씨앗에서 뽑는다.** 같은 판을 다시 돌리면
 *   같은 선택이 나와야 계측이 재현된다.
 */
export function seededIndex(seed: number, n: number): number {
  if (n <= 1) return 0;
  // xorshift 한 바퀴 — 값이 아니라 흩어짐만 필요하다
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;
  x >>>= 0;
  return x % n;
}

/**
 * **지금 입대할까** — 성향이 고른다 (2026-09-10 · 사용자 확정 ②).
 *
 * 화면 모달(`MilitaryEnlistAskModal`)은 갈래가 둘이다(입대 · 연기). 자동 진행은
 * **늘 연기**를 골랐고 그래서 12시즌 30판에서 군을 한 판도 안 밟았다.
 *
 *   성장형  미룬다  — 프로에서 뛸 해를 안 버린다
 *   안전형  간다    — 미루면 `militaryDeferPenalty` 가 쌓인다
 *   대충    무작위  — 씨앗 고정(재현된다)
 *
 * 🔴 **안전형이 대학을 한 학년도 못 다니고 있었다** (2026-09-19 · A 실측 ·
 *   `docs/SIM_102_UNIV_MIL_2026-09-19.md` ①).
 *
 * 24판 재계측에서 안전형 세 판(#8 #14 #20)이 `대학 17주` 뒤 곧장 입대했다.
 * 사슬은 이랬다 — 진학해서 무대가 `university` 로 바뀌는 순간 `advanceWeek` 의
 * `isMilUnresolved`(미필 · 고교 아님)가 **그해에 바로** 참이 되고, W46 체육부대
 * 공개 → 자동 진행이 신청 → W50 탈락 → `militaryEnlistAsk(rejected)` →
 * 여기서 안전형이 **무조건 참**을 내 19세 1학년이 입대했다. 전역자는 학교로
 * 안 돌아가므로(게임 규칙 · `stores/game.ts completeMilitaryService`) 대학은
 * 그걸로 끝이다.
 *
 * **성향의 뜻이 자기모순이었다.** 바로 위 `careerRoutePriority` 가 안전형이
 * 대학을 1순위로 두는 이유를 "4년이 보장되고 재지명 기회가 네 번 더 생긴다"고
 * 적어 뒀는데, 그 4년을 이 결정이 첫해에 지웠다 — **대학 성향을 잰다면서
 * 대학을 안 다니는 표본**을 냈다.
 *
 * ⚠ **미루는 값이 0 이다.** `militaryDeferPenalty` 는 26세부터만 쌓이고
 *   (`advanceWeek` 의 `weekInYear === 1 && p.age >= 26`), 체육부대 신청 자격도
 *   27세까지다. 19~22세 대학생에게 "미루면 대가가 쌓인다"는 성립하지 않는다.
 * ⚠ **게임 로직이 아니다.** 화면은 갈래 둘을 그대로 보여 주고 사람이 고른다.
 *   실제 플레이의 기본값은 `growth`(미룬다)라 한 줄도 안 바뀐다.
 * ⚠ 대충형은 그대로 둔다 — 무작위가 그 성향의 정의다(바닥 확인).
 */
export function militaryEnlistPick(
  persona: SimPersona,
  ctx: {
    /** 지금 무대 */
    stage: CareerStage;
    /** 대학 최종 학년인가 — 판정은 `careerTransition.isUniversityFinalYear` 하나가 갖는다 */
    universityFinalYear: boolean;
    /** 대충형이 굴릴 씨앗 */
    seed: number;
  },
): boolean {
  if (persona === "growth") return false;
  if (persona === "safe") {
    // 학업이 남아 있으면 안 간다 — 안전형이 대학을 고른 이유가 그 4년이다
    if (ctx.stage === "university" && !ctx.universityFinalYear) return false;
    return true;
  }
  return seededIndex(ctx.seed, 2) === 1;
}

/** 미지명 뒤에 갈 수 있는 갈래 셋 — 지명은 늘 이것들보다 위다 */
export type SimCareerRoute = "overseas" | "university" | "independent";

/**
 * **성향이 진로도 고른다** (2026-09-12 · 1.0.2 0단계 뒤).
 *
 * 🔴 **왜 고쳤나.** 계측 드라이버가 `overseas > university > independent` 를
 *   **박아 두고** 있었고, 드라이버가 고르는 대학은 전력★이 가장 낮은 셋이라
 *   (`perfEntry` 「약팀부터 고른다」) 입시가 사실상 없는 것과 같다. 그래서
 *   미지명이 나는 즉시 예외 없이 대학으로 샜고 — **12판에서 독립 0, 성향 셋을
 *   따로 돌린 3판에서도 0** 이었다(D 0단계 · `SIM_102_STAGE0_2026-09-12.md`).
 *   한 갈래가 구조적으로 0 인 것은 계측이 아니라 **편향**이다.
 *
 * ⚠ **게임 결함이 아니다.** 화면(`CareerResultModal`)은 붙은 곳을 나란히
 *   보여 주고 사람이 고른다 — 강제하는 자리가 없다. 고칠 자리는 계기뿐이다.
 *
 * | 성향 | 차례 | 왜 |
 * |---|---|---|
 * | `growth` | 해외 → **독립** → 대학 | 즉시 실전이 곧 성장이다. 대학 4년은 **던지는 해를 미루는** 선택이라 제일 뒤 |
 * | `safe` | **대학** → 해외 → 독립 | 4년이 보장되고 재지명 기회가 네 번 더 생긴다. 옛 차례와 같다 — **기준선이 안 흔들린다** |
 * | `lazy` | 씨앗 고정 무작위 | 군 결정과 같은 방식이다. 순열 여섯 중 하나를 씨앗으로 고른다 |
 *
 * ⚠ **해외는 성장·안전 둘 다 맨 앞이다.** 해외 2군은 프로 계약이라 다른 둘과
 *   결이 다르고, 문턱이 높아(★3 = OVR 78) 실제로 뜨는 판이 드물다 —
 *   여기서 차례를 흔들면 「독립이 뽑히나」를 재는 데 잡음만 는다.
 * ⚠ **계측 전용이다.** 실제 플레이는 사람이 고른다.
 */
export function careerRoutePriority(persona: SimPersona, seed: number): readonly SimCareerRoute[] {
  if (persona === "growth") return ["overseas", "independent", "university"];
  if (persona === "safe") return ["university", "overseas", "independent"];
  // lazy — 순열 여섯 중 하나. 씨앗이 같으면 늘 같은 차례다
  const perms: readonly (readonly SimCareerRoute[])[] = [
    ["overseas", "university", "independent"],
    ["overseas", "independent", "university"],
    ["university", "overseas", "independent"],
    ["university", "independent", "overseas"],
    ["independent", "overseas", "university"],
    ["independent", "university", "overseas"],
  ];
  return perms[seededIndex(seed, perms.length)];
}

/** 지원 후보 한 곳 — 계측 드라이버가 대학·독립을 고를 때 쓴다 */
export interface SimSchoolOption {
  id: string;
  /** 전력★ — 클수록 좋은 학교이고 문턱도 높다(`universityUtils.requirementOfPower`) */
  power: number;
  /** 내 학점·야구점수로 지금 붙을 수 있나(`checkUniversityEligibility`) */
  eligible: boolean;
}

/**
 * **성향이 어느 등급 대학에 지원할지도 고른다** (2026-09-13 · 사용자 확정).
 *
 * 🔴 **드라이버가 D등급에만 지원하고 있었다** (D 실측). `perfEntry` 가 전력★
 *   **오름차순 세 곳**을 고정으로 골라, 대학 50팀 중 **★1 네 팀 가운데 셋**에만
 *   늘 원서를 냈다. C~S 에는 한 번도 안 갔으니 **사다리를 올려도 실측이
 *   불가능**했다 — 진로 우선순위가 박혀 독립이 0/12 이던 것과 같은 편향이다.
 *
 * ⚠ **게임 결함이 아니다.** 화면은 50팀을 다 보여 주고 사람이 고른다.
 *   고칠 자리는 계기뿐이고, 뜻은 여기 하나가 갖는다.
 *
 * | 성향 | 무엇을 고르나 | 왜 |
 * |---|---|---|
 * | `growth` | **붙을 수 있는 것 중 가장 높은 셋** · 모자라면 한 단계 위로 도전 | 좋은 학교가 드래프트 평가(스카우트 보너스 S +15)에 그대로 얹힌다 |
 * | `safe` | 붙을 수 있는 것에서 **낮은·가운데·높은 하나씩** | 한 곳이라도 붙는 것이 목적이다. 전부 상향이면 전원 탈락한다 |
 * | `lazy` | **씨앗 고정 무작위 셋** | 군·진로 차례와 같은 방식이다 |
 *
 * ⚠ **붙을 곳이 셋이 안 되면 셋 다 채운다** — 빈 자리를 남기면 「지원을 덜 했다」가
 *   「못 붙었다」로 섞여 불합격률이 거짓이 된다. 채우는 순서만 성향이 정한다.
 * ⚠ 독립·해외에는 안 쓴다 — 거기는 등급 사다리가 없다.
 * ⚠ **계측 전용이다.** 실제 플레이는 사람이 고른다.
 */
export function schoolPicksFor(
  persona: SimPersona,
  schools: readonly SimSchoolOption[],
  seed: number,
  max = 3,
): string[] {
  if (schools.length === 0) return [];
  const byPowerAsc = [...schools].sort((a, b) => a.power - b.power || a.id.localeCompare(b.id));
  const ok = byPowerAsc.filter((s) => s.eligible);
  const no = byPowerAsc.filter((s) => !s.eligible);
  const take = (xs: readonly SimSchoolOption[]): string[] => xs.slice(0, max).map((s) => s.id);

  if (persona === "lazy") {
    // 씨앗 고정 섞기 — 같은 씨앗이면 늘 같은 셋이다
    const pool = [...byPowerAsc];
    const out: SimSchoolOption[] = [];
    for (let i = 0; out.length < max && pool.length > 0; i++) {
      out.push(pool.splice(seededIndex(seed + i * 7919, pool.length), 1)[0]);
    }
    return take(out);
  }

  if (persona === "growth") {
    // 붙는 것 중 높은 순 → 모자라면 **바로 위**(못 붙는 것 중 낮은 순)로 도전
    return take([...ok].reverse().concat(no));
  }

  // safe — 낮은·가운데·높은 하나씩. 한 곳은 반드시 안전하게 잡는다
  const spread: SimSchoolOption[] = [];
  if (ok.length <= max) spread.push(...ok);
  else {
    const idx = [0, Math.floor((ok.length - 1) / 2), ok.length - 1];
    for (const i of idx) if (!spread.includes(ok[i])) spread.push(ok[i]);
  }
  // 모자라면 **낮은 쪽부터** 채운다 — 안전형은 위로 안 뻗는다
  return take(spread.concat(no));
}
