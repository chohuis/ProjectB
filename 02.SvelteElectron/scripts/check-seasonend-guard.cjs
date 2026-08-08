#!/usr/bin/env node
// 시즌 종료 중복 실행 가드가 **재시작을 견디는가**.
//
//   npm run check:seasonendguard
//
// `processSeasonEnd`에는 `lastSeasonEndYear` 가드가 있고 주석에 위험이 적혀
// 있다 — "가드가 없으면 학년이 두 번 오르고 나이가 두 살 는다." 그런데 그
// 필드는 `SaveGame`에 없어서 **앱을 껐다 켜면 사라진다.**
//
// ⚠ 실제 피해는 주인공 학년이 아니라 **NPC 전원의 나이**다. NPC 진급·나이는
// slot.db에 즉시 쓰이므로 되돌릴 수 없다. 가드가 막으려는 결과는 영구인데
// 가드 자신은 세션 한정이라는 게 이 결함의 모양이다.

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const log = (s) => process.stdout.write(s + "\n");

(async () => {
  log("");
  log("── 시즌 종료 가드 · 재시작 내성 ──────────────────────────");

  let tmp = null;
  let failed = 0;
  try {
    const boot = await headless.boot("seguard");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "SEG", worldSeed: 20260803, seasonYear: 2026 });

    const r = await app.seasonEndGuardProbe();

    log(`      ${r.연도} 시즌`);
    log(`      NPC 표본 나이   처음 ${r["①처음"].npc[0]?.age} → 1회 ${r["②1회 실행"].npc[0]?.age}`
      + ` → 같은세션재실행 ${r["③같은 세션 재실행"].npc[0]?.age}`
      + ` → 재시작후 ${r["④재시작 후 재실행"].npc[0]?.age}`);
    log(`      주인공 학년     처음 ${r["①처음"].proto.grade} → 1회 ${r["②1회 실행"].proto.grade}`
      + ` → 같은세션 ${r["③같은 세션 재실행"].proto.grade}`
      + ` → 재시작후 ${r["④재시작 후 재실행"].proto.grade}`);
    log("");

    const ok = (name, cond, detail) => {
      log(`  ${cond ? " ok " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
      if (!cond) failed++;
    };

    ok("1회 실행은 나이를 올린다",
       r["나이 증가 — 1회"] === 1, `+${r["나이 증가 — 1회"]}`);
    ok("같은 세션에서 재실행하면 안 오른다 (가드 동작)",
       r["나이 증가 — 같은 세션 재실행"] === 0, `+${r["나이 증가 — 같은 세션 재실행"]}`);
    ok("**재시작 후 재실행해도 안 오른다**",
       r["나이 증가 — 재시작 후"] === 0, `+${r["나이 증가 — 재시작 후"]}`);

    log("");
    log(`  판정: ${r.판정}`);
    log("");
    log("  읽는 법");
    log("    · 세 번째가 실패하면 `lastSeasonEndYear`가 세이브에 없다는 뜻이다");
    log("    · 재시작은 `toSaveGame()` → `hydrateFromSlot()` 왕복으로 재현한다");
    log("      (실제 로드가 쓰는 바로 그 경로다)");
  } finally {
    if (tmp) headless.cleanup(tmp);
  }
  process.exit(failed > 0 ? 1 : 0);
})();
