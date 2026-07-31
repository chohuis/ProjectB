"use strict";
/**
 * 저장 배치 회귀 (Phase 8 P8-2a)
 *
 * 실행: npm run test:savebatch
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────────
 * 자동 진행이 `gameStore.save()`를 주 경계까지 미룬다. 성능은 2배 넘게
 * 좋아지지만 **데이터 위험 두 가지**를 새로 만든다:
 *
 *  ① 조용한 유실 — 메모리엔 있는데 slot.db엔 없는 채로 끝난다
 *  ② 낡은 읽기 — 저장이 밀린 사이 slot.db를 읽으면 옛 값이 온다.
 *                `processTradeWindow`가 실제로 그랬다. 지연이 아니라
 *                **판단이 바뀌는** 자리다 (팀·연봉·계약연수·OVR로 트레이드 판정)
 *
 * 이 스크립트는 그 둘이 안 일어난다는 걸 확인하고, **감시기 자체가 울리는지도**
 * 확인한다 — 계측에서 "낡은 읽기 없음"이 나왔는데 알고 보니 감시기가 한 번도
 * 평가된 적이 없던 일이 실제로 있었다. 안 울리는 알람은 없는 알람이다.
 */

const headless = require("./perf/headless.cjs");

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

// ── 조회 감시 (measure-perf와 같은 규칙) ──────────────────────────
// gameStore.save()가 쓰지 않는 테이블만 통과시킨다. 기본은 거부다.
const READ_OK = new Set([
  "repo:getRelationships", "repo:getStaff", "repo:getMeta", "repo:listSlots",
  "league:getTransactions", "npc:getCareerStats", "npc:getRecentGames",
]);
const isReadCmd = (channel, args) =>
  channel === "repo:call" ? /^(get|count|list)/.test(String(args[0] ?? ""))
  : ["npc:getByLeague", "league:getTransactions", "npc:getCareerStats", "npc:getRecentGames"].includes(channel);
const keyOf = (channel, args) =>
  channel === "repo:call" ? `repo:${args[0]}` : channel;

let dirtyProbe = null;      // () => 저장이 밀려 있는가
const staleHits = [];

headless.setInterceptor(async (channel, args, call) => {
  if (dirtyProbe && isReadCmd(channel, args)) {
    const key = keyOf(channel, args);
    if (!READ_OK.has(key) && dirtyProbe()) staleHits.push(key);
  }
  return await call();
});

(async () => {
  const { app, tmp } = await headless.boot("savebatch");
  await app.boot({ slotId: "SB", worldSeed: 424242, seasonYear: 2026 });

  // ── ① 감시기가 실제로 울리는가 ────────────────────────────────
  //
  // 일부러 낡은 읽기를 만든다. 여기서 안 걸리면 아래 검사들은 전부 무의미하다.
  dirtyProbe = () => app.isSaveDirty();
  staleHits.length = 0;
  await app.probeStaleRead();
  check("감시기가 낡은 읽기를 잡는다 (일부러 만든 것)", staleHits.length > 0,
    `잡힌 게 없다 — 감시기가 죽어 있다`);
  check("  잡힌 대상이 npc 테이블 조회다", staleHits.includes("repo:getAllNpcs"),
    JSON.stringify(staleHits));

  // ── ② 배치는 예외로 빠져나가도 닫힌다 ─────────────────────────
  //
  // `runAutoAdvance`가 try/finally로 닫는데, 그게 없으면 "자동 진행을 멈췄더니
  // 마지막 처리가 사라짐"이 된다.
  const threw = await app.probeBatchException();
  check("배치 안에서 예외가 나도 저장이 확정된다", threw && !app.isSaveDirty(),
    `threw=${threw} dirty=${app.isSaveDirty()}`);

  // ── ③ 트레이드 윈도우가 낡은 값을 안 읽는다 ───────────────────
  //
  // 이게 P8-2a가 실제로 깨뜨렸던 자리다. 배치를 열어 더티로 만든 뒤
  // `processTradeWindow`를 부르고, 그 안의 slot.db 조회 시점에
  // 저장이 밀려 있지 않은지 본다.
  staleHits.length = 0;
  await app.probeTradeWindow();
  check("트레이드 윈도우가 저장 확정 후에 slot.db를 읽는다", staleHits.length === 0,
    `낡은 읽기 ${staleHits.length}건: ${[...new Set(staleHits)].join(", ")}`);

  // ── ④ 배치 밖에서는 즉시 쓴다 ─────────────────────────────────
  //
  // 모달·페이지 호출부 55곳의 의미가 그대로여야 한다.
  await app.probeImmediateSave();
  check("배치 밖 save()는 즉시 영속된다", !app.isSaveDirty());

  // ── ⑤ 유실 없음 — 메모리와 slot.db가 같다 ─────────────────────
  const mem = app.fingerprint();
  const db = await app.dbFingerprint("SB");
  check("메모리 == slot.db (유실 없음)", mem === db, `${mem} vs ${db}`);

  dirtyProbe = null;
  headless.cleanup(tmp);

  console.log(failed === 0 ? "\n저장 배치 회귀 통과" : `\n실패 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error("[test-savebatch] 실패:", e);
  process.exit(1);
});
