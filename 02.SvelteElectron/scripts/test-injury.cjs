// 부상 전조 회귀 (Phase 7-5 F-2)
//
// "임계 첫 주는 경고만"은 **확률 게이트라 눈으로 못 본다.** 한 번 돌려서
// 안 다쳤다고 유예가 도는 게 아니다 — 대량 시행으로 발생률을 재야 한다.
//
// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/test-injury.cjs

const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));

let fail = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "ok " : "FAIL"} ${msg}`);
  if (!cond) fail++;
};

// ⚠ **씨앗을 반복마다 다르게 고정한다.**
//
// 🔴 예전엔 씨앗을 안 넘겨서 엔진이 `thread_rng`로 돌았다 — 같은 검사가
// 실행마다 다른 표본을 뽑아 **확률 검사가 간헐적으로 실패**했다.
// 그렇다고 씨앗 하나로 고정하면 그 씨앗에서만 맞는 걸 보게 된다 —
// 반복 i마다 다른 씨앗을 주면 **재현되면서 표본은 그대로 다양하다.**
let _seedCounter = 0;
const nextSeed = () => (_seedCounter = (_seedCounter + 2654435761) >>> 0) || 1;

const calc = (over) => {
  const out = JSON.parse(native.weekCalcInjuryNative(JSON.stringify({
    seed: nextSeed(),
    fatigue: 92, consecutiveHighFatigueWeeks: 0,
    hasInjury: false, currentInjuryType: null, currentSeverity: null,
    recoveryWeeksLeft: null, playerType: "pitcher", age: 25,
    condition: 75, trainingIntensity: 0.5, consecutiveLowMoraleWeeks: 0,
    hasPriorInjurySameArea: false, priorSteroidUsed: false,
    ...over,
  })));
  if (out.error) throw new Error(out.error);
  return out;
};

const N = 4000;
const rate = (over) => {
  let hurt = 0, warned = 0;
  for (let i = 0; i < N; i++) {
    const r = calc(over);
    if (r.justOccurred) hurt++;
    if (r.warning) warned++;
  }
  return { hurt: hurt / N, warned: warned / N };
};

// ══ 1. 유예 주 — 경고만 나고 안 다친다 ═══════════════════════════
console.log("\n[1] 임계를 넘은 첫 주는 경고만 낸다");

const grace = rate({ consecutiveHighFatigueWeeks: 0 });
ok(grace.hurt === 0, `유예 주 부상률 0% (실측 ${(grace.hurt * 100).toFixed(2)}%)`);
ok(grace.warned > 0.99, `유예 주에는 거의 항상 경고가 온다 (${(grace.warned * 100).toFixed(1)}%)`);

const second = rate({ consecutiveHighFatigueWeeks: 1 });
ok(second.hurt > 0.20, `두 주째는 실제로 다친다 (${(second.hurt * 100).toFixed(1)}%, 피로92 기대 35%)`);
ok(second.warned === 0, `두 주째엔 경고가 아니라 판정이 돈다 (경고 ${(second.warned * 100).toFixed(1)}%)`);

// ══ 2. 유예가 무한 방패가 아니다 ═════════════════════════════════
console.log("\n[2] 유예는 한 번뿐이다 — 피로가 안 내려가면 계속 위험하다");

const third = rate({ consecutiveHighFatigueWeeks: 2 });
ok(third.hurt > 0.20 && third.warned === 0, `세 주째도 판정이 돈다 (${(third.hurt * 100).toFixed(1)}%)`);

// 임계 아래로 내려가면 카운터가 리셋된다 → 다음에 넘길 때 유예가 다시 생긴다
const cooled = calc({ fatigue: 60, consecutiveHighFatigueWeeks: 3 });
ok(cooled.newConsecutiveHighFatigueWeeks === 0,
   "임계 아래로 내려가면 누적이 리셋된다 (쉬면 유예가 되살아난다)");

// ══ 3. 훈련 무리는 유예를 안 탄다 ════════════════════════════════
console.log("\n[3] 유예 주에도 고강도 훈련은 다칠 수 있다");

// 쉬라고 경고했는데 훈련을 밀어붙인 경우 — 면죄부가 되면 안 된다
const pushed = rate({ consecutiveHighFatigueWeeks: 0, trainingIntensity: 1.0, condition: 55 });
ok(pushed.hurt > 0.05,
   `유예 주에도 고강도+저컨디션이면 다친다 (${(pushed.hurt * 100).toFixed(1)}%)`);

const restedGrace = rate({ consecutiveHighFatigueWeeks: 0, trainingIntensity: 0.0, condition: 80 });
ok(restedGrace.hurt === 0, `쉰 유예 주는 완전히 안전하다 (${(restedGrace.hurt * 100).toFixed(2)}%)`);
ok(pushed.hurt > restedGrace.hurt, "훈련을 밀어붙이면 유예 주에도 대가가 있다");

// ══ 4. 코치 관리력이 발생률을 낮춘다 (§7-5 F-1) ═════════════════
console.log("\n[4] 코치 discipline이 부상 발생을 억제한다");

const plain  = rate({ consecutiveHighFatigueWeeks: 1, injuryPrevention: 1.0 });
const guarded = rate({ consecutiveHighFatigueWeeks: 1, injuryPrevention: 1.10 });
ok(guarded.hurt < plain.hurt,
   `관리 좋은 코치진이 덜 다친다 (${(guarded.hurt * 100).toFixed(1)}% < ${(plain.hurt * 100).toFixed(1)}%)`);

const sloppy = rate({ consecutiveHighFatigueWeeks: 1, injuryPrevention: 0.90 });
ok(sloppy.hurt > guarded.hurt,
   `관리 나쁜 쪽이 더 다친다 (${(sloppy.hurt * 100).toFixed(1)}% > ${(guarded.hurt * 100).toFixed(1)}%)`);

// ══ 5. 시설이 회복 주차를 줄인다 ═════════════════════════════════
console.log("\n[5] 구단 시설이 복귀를 앞당긴다");

const weeksOf = (boost) => {
  let sum = 0, n = 0;
  for (let i = 0; i < N; i++) {
    const r = calc({ consecutiveHighFatigueWeeks: 1, recoveryBoost: boost });
    if (r.justOccurred) { sum += r.injuryUpdate.recoveryWeeksLeft; n++; }
  }
  return n > 0 ? sum / n : 0;
};
const wPlain = weeksOf(1.0);
const wRich  = weeksOf(1.15);
ok(wRich < wPlain, `시설 좋은 구단이 빨리 복귀한다 (${wRich.toFixed(2)}주 < ${wPlain.toFixed(2)}주)`);
ok(wRich > 0, "회복 주차가 0으로 무너지지 않는다 (하한 1주)");

// ══ 6. 경고의 risk가 실제 발생률과 맞는다 ════════════════════════
console.log("\n[6] 경고에 적힌 확률이 다음 주 실제 발생률과 맞는다");

// 화면이 "35% 확률로 부상"이라고 말하는데 실제가 5%면 거짓말이다
for (const [fatigue, label] of [[82, "80~85"], [87, "85~90"], [92, "90~95"], [97, "95+"]]) {
  const w = calc({ fatigue, consecutiveHighFatigueWeeks: 0 }).warning;
  let hurt = 0;
  for (let i = 0; i < N; i++) {
    if (calc({ fatigue, consecutiveHighFatigueWeeks: 1 }).justOccurred) hurt++;
  }
  const actual = hurt / N;
  const gap = Math.abs(actual - w.risk);
  ok(gap < 0.04,
     `피로 ${fatigue}(${label}) — 예고 ${(w.risk * 100).toFixed(1)}% vs 실측 ${(actual * 100).toFixed(1)}% (차 ${(gap * 100).toFixed(1)}%p)`);
}

// ══ 7. 부상 중이면 경고가 안 온다 ════════════════════════════════
console.log("\n[7] 이미 다친 선수에게는 경고를 안 낸다");

const injured = calc({
  fatigue: 95, consecutiveHighFatigueWeeks: 0,
  hasInjury: true, currentInjuryType: "ELBOW_INFLAM",
  currentSeverity: "moderate", recoveryWeeksLeft: 5,
});
ok(!injured.warning, "회복 중에는 전조가 없다 (이미 벌어진 일이다)");

// ══ 8. NPC 경로에는 경고가 없다 ══════════════════════════════════
console.log("\n[8] NPC는 경고 없이 기존대로 (DESIGN §7.3)");

const npcOut = JSON.parse(native.weekCalcNpcInjuriesNative(JSON.stringify({
  players: [{
    playerId: "NPC_1", role: "SP", age: 27, consecutiveApp: 6,
    hasPriorInjury: false, isPlayingThrough: false, playingThroughSeverity: null,
  }],
})));
ok(!npcOut.error, "NPC 배치 계산이 돈다");
ok(!("warning" in npcOut) && !npcOut.occurred?.some?.((o) => "warning" in o),
   "NPC 결과에 경고 필드가 없다 — 수천 명에게 경고를 내면 로그가 그것만 남는다");

console.log(fail === 0 ? "\nALL PASS" : `\n${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
