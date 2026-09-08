"use strict";
/**
 * **주간 리포트 제목이 은행에서 나오는가** — `npm run check:reportbank`
 *
 * 🔴 왜 필요한가 (C2 배선 · 2026-09-07):
 *
 *   `messages/reports.json` 은 만들어졌는데 **아무 코드도 안 읽고** 있었다.
 *   그 상태의 증상이 아무것도 아니다 — 소식은 오고, 개수도 맞고, 제목만
 *   「W12 주간 훈련 결과」로 15년 내내 같다. 배선을 하고 나서도 같은 모양의
 *   결함이 두 가지 더 난다:
 *
 *     ① 은행은 읽었는데 **한 문장만** 나온다 (난수가 늘 같은 값)
 *     ② 뽑은 인덱스를 **세이브에 안 돌려** 매주 「직전 제외」가 초기화된다
 *
 *   ①은 `가짓수`, ②는 `연속반복` 이 잡는다. 둘 다 소식함을 눈으로 봐서는
 *   여러 해를 넘겨야 겨우 보인다.
 *
 * ⚠ **소식함이 아니라 생산 시점을 센다** (`mailboxProduceStats`). 상한(200)에
 *   밀려 사라진 통까지 세야 15년치가 온전히 잡힌다 — `measure:mailbox` 가
 *   먼저 그은 선이다.
 *
 * ⚠ **한 경로로는 무대를 다 못 본다.** 본문의 무대×성과 열다섯은 진로가
 *   갈리는 만큼만 돈다 — 그쪽 덮개는 `reportCopy.test.ts` 가 파일을 직접
 *   읽어 본다. 여기가 보는 것은 **제목이 실제로 흔들리는가**다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 15);
const SEED = arg("seed", 20260802);

/** 은행을 단 소식 셋. `messages/reports.json` 의 세 묶음과 짝이다 */
const WATCHED = {
  "msg-train":  { 이름: "주간 훈련", 최소가짓수: 3 },
  "msg-injury": { 이름: "부상 리포트", 최소가짓수: 3 },
  "msg-mybody": { 이름: "내 몸 리포트", 최소가짓수: 3 },
};

async function main() {
  const { app, tmp } = await headless.boot("reportbank");
  try {
    await app.boot({ slotId: "RB", worldSeed: SEED, seasonYear: 2026 });

    const start = app.currentSeason();
    let guard = 0;
    const stallGuard = makeStallGuard();
    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < start + SEASONS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      // 한 바퀴 안 움직인 것은 정지 pending 을 민 정상 경로일 수 있다 — `perf/weekLoop.cjs` 머리말
      if (stallGuard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
    }

    const years = app.currentSeason() - start;
    const kinds = app.reportBankProbe()["종류별제목"] ?? {};
    console.log(`[리포트 문안 은행] 씨앗 ${SEED} · ${years}시즌 · 진행 ${guard}회`);

    let bad = 0;
    for (const [kind, want] of Object.entries(WATCHED)) {
      const row = kinds[kind];
      if (!row || row["통수"] === 0) {
        // ⚠ **없는 것을 통과로 치지 않는다.** 소식이 아예 안 왔으면 배선이
        //   아니라 그 소식 자체가 죽은 것이고, 그건 더 큰 결함이다
        console.log(`  FAIL  ${want.이름} — 15년에 한 통도 안 왔다 (${kind})`);
        bad++;
        continue;
      }
      const n = row["통수"], v = row["가짓수"], rep = row["연속반복"];
      const ok = v >= want.최소가짓수 && rep === 0;
      console.log(
        `  ${ok ? "ok  " : "FAIL"}  ${want.이름.padEnd(10)} ${String(n).padStart(4)}통 · ` +
        `제목 ${v}가지 · 연속반복 ${rep}`
      );
      if (v < want.최소가짓수) {
        console.log(`          → 제목이 ${v}가지뿐이다 — 은행을 안 읽었거나 난수가 늘 같다`);
        const top = Object.entries(row["제목"]).sort((a, b) => b[1] - a[1]).slice(0, 4);
        for (const [s, c] of top) console.log(`            ${String(c).padStart(4)}회  ${s}`);
      }
      if (rep !== 0) {
        console.log(`          → 같은 제목이 ${rep}번 연달아 났다 — 뽑은 인덱스가`);
        console.log(`            sentenceMemory 로 안 돌아간다(직전 제외가 매주 초기화된다)`);
      }
      if (!ok) bad++;
    }

    if (bad === 0) console.log("  ok  셋 다 은행에서 나오고 연속 반복이 없다");
    process.exit(bad === 0 ? 0 : 1);
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[check-reportbank] 실패:", e); process.exit(1); });
