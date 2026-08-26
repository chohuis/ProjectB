"use strict";
/** KBL 외국인 선수 이름이 한글로 나오는가 — **영문이 그대로 뜨던 것**(실플 ⑨) */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
(async () => {
  const { app, tmp } = await headless.boot("fname");
  try {
    await app.boot({ slotId: "PN", worldSeed: 20260826, seasonYear: 2026 });
    const rows = app.foreignNameProbe();
    console.log(`[외국인] ${JSON.stringify(rows)}`);
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  await headless.cleanup(tmp);
})();
