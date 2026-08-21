"use strict";
/**
 * 소식 id가 실제로 겹치는가 — `npm run check:msgdup`
 *
 * `messageIdUnique.test.ts`가 이미 있지만 **소스를 정규식으로 훑는다.**
 * 이 프로젝트는 그 한계로 `get is not defined`를 놓친 적이 있다 —
 * 검사는 통과하는데 새 게임이 2주차에서 죽었다.
 *
 * 그래서 **돌려서 잰다.** 여러 시즌을 자동 진행하며 소식함을 주마다 훑어
 * 같은 id가 **다른 내용**으로 나타나는지 본다.
 *
 * ⚠ **id가 같고 내용도 같으면 중복이 아니다.** 같은 소식을 두 번 본 것이다
 * (소식함은 상한 50이라 들락날락한다). 내용이 다른데 id가 같은 것만 잡는다 —
 * 그게 `each_key_duplicate`를 내고 **세이브가 안 열리게** 만든다.
 *
 * ⚠ **소식함 상한이 50이라 다 못 본다.** 주마다 훑어도 그 사이 밀려난 건
 * 놓친다 — 여기서 0건이 나와도 "없다"는 증명은 아니다. **있으면 확실하다.**
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 3);
const SEED = arg("seed", 20260731);

/** id → 처음 본 내용(제목) */
const seen = new Map();
const clashes = [];

function sample(app) {
  let rows = [];
  try { rows = app.mailboxRaw() || []; } catch { return; }
  for (const r of rows) {
    if (!r || typeof r.id !== "string") continue;
    const subject = String(r.subject ?? "");
    const before = seen.get(r.id);
    if (before === undefined) { seen.set(r.id, subject); continue; }
    if (before !== subject) {
      clashes.push({ id: r.id, before, now: subject });
      seen.set(r.id, subject);   // 같은 걸 계속 세지 않는다
    }
  }
}

async function main() {
  const { app, tmp } = await headless.boot("msgdup");
  try {
    await app.boot({ slotId: "MD", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;

    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < start + SEASONS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); sample(app); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) { sample(app); continue; }
      if (app.isSeasonEnded()) { await app.seasonRollover(); sample(app); continue; }
      await app.autoRun();
      sample(app);
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }

    console.log(`[소식 id] 씨앗 ${SEED} · ${SEASONS}시즌 · 본 id ${seen.size}개`);
    if (clashes.length === 0) {
      console.log("  ok  같은 id로 다른 소식이 온 적이 없다");
      console.log("      ⚠ 소식함 상한(50) 때문에 다 본 건 아니다 — 없다는 증명은 아니다");
    } else {
      console.log(`  FAIL  id 충돌 ${clashes.length}건 — \`each_key_duplicate\`로 세이브가 안 열린다`);
      for (const c of clashes.slice(0, 8)) {
        console.log(`    ${c.id}`);
        console.log(`      전: ${c.before.slice(0, 40)}`);
        console.log(`      후: ${c.now.slice(0, 40)}`);
      }
    }
    process.exit(clashes.length === 0 ? 0 : 1);
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[check-msgdup] 실패:", e); process.exit(1); });
