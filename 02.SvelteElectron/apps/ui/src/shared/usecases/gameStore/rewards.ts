// ── 선택지 효과를 주인공에게 적는다 (스토어 덩이 5) ───────────
//
// `applyEffectToProtagonist` 는 `stores/game.ts` 의 **최상위 함수**였다(205줄).
// store 안에 있을 이유가 처음부터 없었다 — **순수 함수**다(`get(`·`update(`·
// `this.` 전부 0자리). 상태를 적는 것이 아니라 새 주인공을 만들어 돌려준다.
//
// **옮긴 본문은 한 글자도 안 바뀌었다.** 이름·시그니처·순서 불변이고,
// `stores/game.ts` 가 **그 이름으로 다시 내보낸다** — `import { … } from
// "../game"` 로 부르던 열 자리가 그대로 산다.
//
// ⚠ 검사는 `gamePathSrc()` 가 이 파일을 `game.ts` 와 한 덩이로 읽는다.

import { pitchingOvrOf, battingOvrOf } from "../../utils/ovr";
import type { PitchEntry, PitchingStatKey, ProtagonistSave } from "../../types/save";

export function applyTags(cur: string[], add?: string[], remove?: string[]): string[] {
  if (!add && !remove) return cur;
  const out = new Set(add ? [...cur, ...add] : cur);
  for (const r of remove ?? []) out.delete(r);
  return [...out];
}

/**
 * 선택지 효과를 주인공에게 적용한다 — **효과 계산의 정본이다.**
 *
 * ⚠ 예전엔 `resolveDecision`(화면 선택)과 `applyEventEffect`(자동 진행)가
 * 같은 `DecisionEffect`를 받으면서 **각자 계산을 갖고 있었고, 적용하는 필드가
 * 달랐다**:
 *
 *   resolveDecision   컨디션·피로·사기·돈·명성·인기·성실·태그·XP·스탯
 *   applyEventEffect  컨디션·피로·사기·돈·XP·스탯          ← 넷이 빠졌다
 *
 * 당시 데이터가 우연히 그 넷을 안 써서 안 터졌을 뿐이다. 병역 이벤트에
 * "성실도 +5"를 하나 넣는 순간 **에러 없이 조용히 무시된다** — 이 프로젝트가
 * 반복해 겪은 "아무 일도 안 일어남" 형태다. 계산을 한 곳에 둬서 한쪽만
 * 고치는 일이 생기지 않게 한다.
 *
 * 관계도·사치품은 여기서 못 한다(slot.db·Rust 왕복이라 비동기다) —
 * `usecases/decisions.ts`의 `applySideEffects`가 맡는다.
 */
export function applyEffectToProtagonist(
  p: ProtagonistSave,
  fx: import("../../types/main").DecisionEffect,
): ProtagonistSave {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const clampStat = (v: number) => Math.max(1, Math.min(99, v));

  // ── 보상 대상: 투구 / 타격 (2026-08-24) ──────────────────────
  //
  // 🔴 **예전엔 투구만 건드렸다.** `xp`·`statDelta`가 `pitchingXP`·`pitching`
  // 고정이라 **타자 주인공이 이벤트로 성장할 길이 아예 없었다.**
  //
  // 키 이름으로 가른다:
  //   "command"          → 투구 (예전 그대로. 데이터 296곳이 이 형태다)
  //   "pitching.command" → 투구 (명시)
  //   "batting.contact"  → 타격
  //
  // ⚠ **접두사 없는 키를 타격으로 보내면 안 된다.** `ovr`처럼 양쪽에 다 있는
  //   이름이 있어서, 기존 데이터가 조용히 타격으로 새면 아무도 모른다.
  const pitchingXP = { ...p.pitchingXP };
  const battingXP = { ...p.battingXP };
  if (fx.xp) {
    for (const [key, amt] of Object.entries(fx.xp)) {
      const [bucket, stat] = key.includes(".") ? key.split(".") : ["pitching", key];
      if (bucket === "batting") {
        (battingXP as Record<string, number>)[stat] =
          ((battingXP as Record<string, number>)[stat] ?? 0) + amt;
      } else {
        pitchingXP[stat as PitchingStatKey] = (pitchingXP[stat as PitchingStatKey] ?? 0) + amt;
      }
    }
  }

  const pitching = { ...p.pitching };
  // ⚠ **`batting`이 없는 세이브가 있다.** 옛 저장·검사 픽스처가 그렇다 —
  // 스프레드가 undefined를 만나면 빈 객체가 되고, 그 상태로 `stat in target`을
  // 물으면 조용히 아무것도 안 하는 대신 **위쪽에서 터진다.** 빈 객체로 받는다
  const batting = { ...(p.batting ?? {}) } as typeof p.batting;
  // 🔴 **파생값을 다시 계산한다** (2026-09-06). 예전엔 능력치만 올리고
  //   `ovr`은 그대로 뒀다 — 아래 주석이 "능력치에서 계산된다"고 적어 놓고
  //   **계산하는 코드가 없었다.** 그래서 이벤트로 오른 만큼 OVR 이 뒤처졌고
  //   **불러오기 전까지 안 맞았다**(`normalizeProtagonist` 가 그때 고쳐 준다).
  //   왕복 검사가 `batting.ovr 30 → 35` 로 잡았다.
  //   ⚠ 화면만의 문제가 아니다 — `pitching.ovr` 은 주인공의 `overall` 로
  //     나가 스카우트·드래프트 순위가 읽는다.
  let pTouched = false,
    bTouched = false;
  if (fx.statDelta) {
    for (const [key, amt] of Object.entries(fx.statDelta)) {
      const [bucket, stat] = key.includes(".") ? key.split(".") : ["pitching", key];
      // `ovr`은 파생값이라 못 바꾼다 — 능력치에서 계산된다
      if (stat === "ovr") continue;
      const target = bucket === "batting" ? batting : pitching;
      if (stat in target) {
        (target as unknown as Record<string, number>)[stat] = clampStat(
          (target as unknown as Record<string, number>)[stat] + amt,
        );
        if (bucket === "batting") bTouched = true;
        else pTouched = true;
      }
    }
  }
  if (pTouched) pitching.ovr = pitchingOvrOf(pitching);
  // ⚠ 옛 세이브엔 `batting`이 통째로 없다(바로 위 주석) — 빈 객체에 식을
  //   돌리면 NaN 이 된다. 실제로 값이 바뀐 때만 다시 계산한다
  if (bTouched) batting.ovr = battingOvrOf(batting);

  // ── 새 보상 열쇠 (2026-09-08 · PLAN_EVENT_TIERS §5 · A 4-3) ────
  //
  // 🔴 **상한은 커리어 누계로 잰다.** 「한 번에 +3 까지」로 재면 +1 짜리를
  //   세 번 받아 넘는다 — 이 저장소가 「한 해에 한 번」 가드에서 두 번 밟은
  //   형태다. 준 만큼(`potentialGranted`·`devRateGranted`)을 적어 둔다.
  const POTENTIAL_CAREER_CAP = 3;
  const DEVRATE_CAREER_CAP = 10;

  let potentialHidden = p.potentialHidden;
  let potentialGranted = p.potentialGranted ?? 0;
  if (fx.potentialDelta) {
    const room = Math.max(0, POTENTIAL_CAREER_CAP - potentialGranted);
    const give = Math.min(fx.potentialDelta, room);
    if (give > 0) {
      // 잠재력은 99 가 상한이다(생성 규칙과 같은 눈금)
      potentialHidden = Math.min(99, potentialHidden + give);
      potentialGranted += give;
    }
    if (give < fx.potentialDelta) {
      // ⚠ **조용히 버리지 않는다.** 「아무 일도 안 일어남」이 이 저장소의 단골이다
      console.warn(
        `[보상] 잠재력 커리어 상한(+${POTENTIAL_CAREER_CAP}) — ` +
          `${fx.potentialDelta} 중 ${give}만 반영 (누계 ${potentialGranted})`,
      );
    }
  }

  let developmentRate = p.developmentRate;
  let devRateGranted = p.devRateGranted ?? 0;
  if (fx.devRateDelta) {
    const room = Math.max(0, DEVRATE_CAREER_CAP - devRateGranted);
    const give = Math.min(fx.devRateDelta, room);
    if (give > 0) {
      developmentRate += give;
      devRateGranted += give;
    }
    if (give < fx.devRateDelta) {
      console.warn(
        `[보상] 성장률 커리어 상한(+${DEVRATE_CAREER_CAP}) — ` +
          `${fx.devRateDelta} 중 ${give}만 반영 (누계 ${devRateGranted})`,
      );
    }
  }

  // 훈련 효율·부상 위험 — **겹치면 긴 쪽이 남는다**(§5). 짧은 쪽으로 덮으면
  // 준 보상을 뺏는 꼴이고, 더하면 같은 이벤트 두 번에 무한이 된다
  const longerOf = (
    cur: { pct: number; weeksLeft: number } | undefined,
    add: { pct: number; weeks: number } | undefined,
  ) => {
    if (!add) return cur;
    if (!cur || add.weeks >= cur.weeksLeft) return { pct: add.pct, weeksLeft: add.weeks };
    return cur;
  };

  // 구종 — 습득·등급·진행도. 규칙은 `startPitchTraining`/`completePitchLearning`
  // 과 같은 눈금이다(상한 5 · 보유 5종)
  let pitches = p.pitches ?? [];
  if (fx.pitchGrant) {
    const has = pitches.find((e) => e.id === fx.pitchGrant!.id);
    if (has) {
      // 🔴 이미 있으면 **등급 +1** 이다(§5) — 「배웠다」가 아무 일도 안 하면 안 된다
      pitches = pitches.map((e) =>
        e.id === fx.pitchGrant!.id
          ? { ...e, grade: Math.min(5, e.grade + 1) as PitchEntry["grade"] }
          : e,
      );
    } else if (pitches.length < 5) {
      pitches = [...pitches, { id: fx.pitchGrant.id, grade: 1 }];
    } else {
      console.warn(`[보상] 구종 5종이 차서 ${fx.pitchGrant.id} 습득을 못 했다`);
    }
  }
  if (fx.pitchGradeUp) {
    const has = pitches.find((e) => e.id === fx.pitchGradeUp!.id);
    if (has) {
      // 🔴 **단계 수를 받는다** (2026-09-09). 히든은 두 단계다(보상안 §1) —
      //   없으면 1 이라 옛 데이터는 그대로 돈다. 상한 5 는 그대로 걸린다
      const steps = Math.max(1, Math.round(fx.pitchGradeUp.steps ?? 1));
      pitches = pitches.map((e) =>
        e.id === fx.pitchGradeUp!.id
          ? { ...e, grade: Math.min(5, e.grade + steps) as PitchEntry["grade"] }
          : e,
      );
    } else {
      console.warn(`[보상] 없는 구종의 등급을 올리려 했다: ${fx.pitchGradeUp.id}`);
    }
  }
  // ⚠ 훈련 중이 아니면 아무 일도 안 한다 — 없는 훈련을 만들어 주지 않는다
  const trainingPitchState =
    fx.pitchProgressJump && p.trainingPitchState
      ? {
          ...p.trainingPitchState,
          progress: Math.min(100, p.trainingPitchState.progress + fx.pitchProgressJump.pct),
        }
      : p.trainingPitchState;

  // 특성 — **중복은 무시한다.** 같은 특성을 두 번 받아도 계수가 두 번 곱하면 안 된다
  const traits =
    fx.trait && !(p.traits ?? []).includes(fx.trait.id)
      ? [...(p.traits ?? []), fx.trait.id]
      : p.traits;

  // 누적 카운터 — `count` 조건의 입력(§12). 이름 표는 `eventCounters.COUNTERS`
  let counters = p.counters;
  if (fx.counterDelta) {
    counters = { ...(counters ?? {}) };
    for (const [k, v] of Object.entries(fx.counterDelta)) {
      if (typeof v === "number" && Number.isFinite(v)) counters[k] = (counters[k] ?? 0) + v;
    }
  }

  return {
    ...p,
    potentialHidden,
    potentialGranted,
    developmentRate,
    devRateGranted,
    trainEffBoost: longerOf(p.trainEffBoost, fx.trainEffBoost),
    injuryRiskMod: longerOf(p.injuryRiskMod, fx.injuryRiskMod),
    // 멘토는 **한 명**이다 — 둘째가 오면 덮는다(§5). 쌓으면 보너스가 무한이 된다
    mentor: fx.mentor
      ? {
          id: fx.mentor.npcId ?? fx.mentor.role ?? "mentor",
          role: fx.mentor.role,
          pct: fx.mentor.pct,
        }
      : p.mentor,
    // 선발 보장은 **더한다** — 「N경기 더 보장」이 두 번 오면 그만큼 더 보장이다
    startGuaranteeGames: fx.startGuarantee
      ? (p.startGuaranteeGames ?? 0) + Math.max(0, fx.startGuarantee.games)
      : p.startGuaranteeGames,
    pitches,
    trainingPitchState,
    traits,
    counters,
    condition: clamp(p.condition + (fx.conditionDelta ?? 0)),
    fatigue: clamp(p.fatigue + (fx.fatigueDelta ?? 0)),
    morale: clamp(p.morale + (fx.moraleDelta ?? 0)),
    money: Math.max(0, p.money + (fx.moneyDelta ?? 0)),
    fame: Math.max(0, Math.min(200, p.fame + (fx.fameDelta ?? 0))),
    popularity: Math.max(0, Math.min(100, p.popularity + (fx.popularityDelta ?? 0))),
    diligence: Math.max(1, Math.min(99, p.diligence + (fx.diligenceDelta ?? 0))),
    // ⚠ **더한 뒤 뺀다.** 한 선택지가 같은 태그를 넣고 빼면 결과는 "없음"이다 —
    //   반대로 하면 넣은 것이 남아 연계가 안 닫힌다
    tags: applyTags(p.tags, fx.addTag, fx.removeTag),
    pitchingXP,
    battingXP,
    pitching,
    batting,
  };
}
