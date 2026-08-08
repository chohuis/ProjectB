#!/usr/bin/env node
// 관계도가 실제로 움직이는가 — **화면이 전원 "중립"이었다.**
//
//   npm run measure:relations
//   node scripts/measure-relations.cjs --weeks 60
//
// 48주(한 시즌)를 함께 뛴 36명이 전부 중립이었다. 산수로는 그럴 수 없다:
// 초기값은 −10~+10이고 팀 승리마다 동료 +1인데, 15승이면 +15 → 우호다.
//
// 코드를 층층이 읽었더니 **전 구간이 맞았다** — 배선도, serde 이름도, 델타
// 적용도. 그래서 읽는 것으로는 더 못 간다. 주마다 값을 찍어서 어디서
// 끊기는지 본다.
//
// ⚠ 판정이 아니라 계측이다. 규칙 수치를 짐작으로 올리지 않는다.

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const WEEKS = arg("weeks", 60);
const SEED = arg("seed", 20260808);

const log = (s) => process.stdout.write(s + "\n");
const pad = (s, n) => String(s).padEnd(n);

(async () => {
  log("");
  log("── 관계도 실측 ───────────────────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("relations");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "REL", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const first = await app.relationProbe();
    log(`  시작   행 ${first.rows}개 · ${JSON.stringify(first.byLabel)}`);

    // ⚠ **`currentWeek()`은 누적이 아니다 — 시즌마다 1로 리셋된다.**
    // 처음엔 `if (currentWeek() >= WEEKS) break`로 썼는데, 52를 넘는 값을
    // 요구하면 **영원히 참이 안 돼서** 가드가 소진될 때까지 돌았다.
    // `--weeks 220`이 220주가 아니었다는 뜻이고, 그 상태로 나온 숫자에
    // "220주"라는 이름을 붙일 뻔했다. **경과 주는 내가 센다.**
    const marks = [];
    let guard = 0;
    let elapsed = 0;
    let lastWeek = -1;
    // autoRun은 선택 대기·경기 대기에서 자주 선다 — 헛도는 회차가 진행한 회차보다
    // 훨씬 많다(60주에 480회로는 47주까지밖에 못 갔다). 한도는 넉넉히 준다
    while (guard++ < WEEKS * 40 && elapsed < WEEKS) {
      const w0 = app.currentWeek();
      const s0 = app.currentSeason();
      if (app.retired()) { log(`  (은퇴 — ${elapsed}주에서 멈춤)`); break; }
      // ⚠ **`autoRun`만으로는 W47을 못 넘는다.** 배경 드래프트 관전과 진로
      // 선택은 사람이 답해야 하는 정지라, 이걸 안 풀면 가드를 4,800으로
      // 올려도 **매번 47주에서 선다** — "긴 실측"이라 이름 붙은 짧은 실측이 된다.
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      // ⚠ 시즌 종료는 **pendingAction이 아니라 정지 사유**로 온다
      // ("결산 화면을 확인해주세요"). pendingKind만 보면 "정지 없음"인데
      // 진행은 안 되는 상태라 원인을 못 찾는다 — 실제로 52주에서 계속 섰다.
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      const w = app.currentWeek();
      const s = app.currentSeason();
      if (w === w0 && s === s0) continue;
      // 시즌이 넘어가면 주차가 되감기므로 차이가 아니라 "한 주 진행"으로 센다
      elapsed += (s > s0) ? Math.max(1, w) : (w - w0);
      if (w === lastWeek && s === s0) continue;
      lastWeek = w;
      if (elapsed % 20 === 0) {
        const p = await app.relationProbe();
        marks.push({ elapsed, ...p });
        log(`  누적${pad(elapsed, 4)}주 (${s} W${pad(w, 3)}) 행 ${pad(p.rows, 4)} ${JSON.stringify(p.byLabel)}`);
      }
    }
    // ⚠ **요청한 만큼 못 갔으면 왜인지 말한다.** 조용히 짧게 끝나면 그
    // 숫자에 "160주"라는 이름이 붙는다 — 계측기가 거짓말을 하는 자리다.
    log(`  경과 ${elapsed}주 · ${app.currentSeason()} W${app.currentWeek()}` +
      ` (가드 ${guard}/${WEEKS * 40})`);
    if (elapsed < WEEKS) {
      log(`  ⚠ 요청 ${WEEKS}주를 못 채웠다 — 정지 ${app.pendingKind() ?? "없음"}` +
        ` · 사유 ${app.stopReason() ?? "없음"}`);
    }

    const last = await app.relationProbe();
    log("");
    log("  ── 마지막 상태 ──");
    log(`  행 ${last.rows}개 · contact ${JSON.stringify(last.contacts)}`);
    for (const [kind, s] of Object.entries(last.byKind ?? {})) {
      log(`    ${pad(kind, 10)} ${pad(s.n + "명", 6)} 값 ${s.min} ~ ${s.max}` +
        ` (평균 ${(s.sum / s.n).toFixed(1)})`);
    }
    log(`  라벨 ${JSON.stringify(last.byLabel)}`);
    log("  표본:");
    for (const s of last.sample ?? []) log(`    ${s}`);

    // 라벨 변화가 한 주에 몰리는가 — 선택지 달린 것이 몰리면 그 주가 막힌다
    log("");
    log("  ── 관계 소식 몰림 ──");
    log("    " + JSON.stringify(app.relationBurstProbe(), null, 0));

    // 같은 "한 칸 어긋남"이 의심되는 소식 — 전주 NPC 경기 결과
    log("");
    log("  ── 소식이 실제로 오는가 ──");
    for (const pat of ["league-results", "msg-train", "msg-mybody"]) {
      const hits = app.dumpMessages(pat, 2);
      log("    " + pad(pat, 16) + (hits.length ? hits.join(" / ") : "없음"));
    }

    log("");
    const moved = Object.entries(last.byLabel ?? {})
      .filter(([k]) => k !== "중립")
      .reduce((a, [, v]) => a + v, 0);
    if (moved === 0) {
      log("  ✗ 전원 중립이다 — 값이 한 칸도 안 움직였다.");
      log("    엔진이 델타를 안 만드는지, 만드는데 저장이 안 되는지 갈라야 한다.");
      process.exitCode = 1;
    } else {
      log(`  ○ ${moved}명이 중립을 벗어났다.`);
    }
  } catch (e) {
    log(`  실패: ${e && e.stack ? e.stack : e}`);
    process.exitCode = 1;
  } finally {
    if (tmp) await headless.cleanup(tmp);
  }
})();
