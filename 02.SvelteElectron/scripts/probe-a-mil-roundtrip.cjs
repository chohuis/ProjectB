"use strict";
// A 세션 — 은퇴자 왕복(불러오기 → 저장)이 값을 지우는지 잰다.
// 좁게 읽고 넓게 쓰면 안 읽은 칼럼이 폴백값으로 덮인다. 그 폭을 숫자로 남긴다.
const path = require("node:path");
const fs = require("node:fs");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SLOT = process.env.PB_SLOT || "slot_1";
const USERDATA = process.env.PB_USERDATA;
const OUT = process.env.PB_OUT;      // 저장 뒤 db 를 여기로 복사한다(cleanup 전)
if (!USERDATA || !OUT) throw new Error("PB_USERDATA · PB_OUT 필요");

(async () => {
  const { app } = await headless.boot("a-mil-roundtrip", { userDataDir: USERDATA });
  if (!await app.bootContinue(SLOT)) throw new Error("bootContinue false");
  const a = app.npcMilitaryStatusAudit();
  console.log(`[로드직후] 전체=${a.total} militaryStatus결측=${a.missing}`);
  await app.saveSlot();
  console.log("[저장] 완료");
  // ⚠ **WAL 을 같이 옮긴다.** `journal_mode = WAL` 이라 방금 쓴 것이 아직
  //   `-wal` 에 있다 — `.db` 만 복사하면 **저장 전 상태를 검사하게 된다**
  //   (2026-09-05 에 실제로 한 번 속았다: 고치기 전/후가 똑같이 나왔다).
  const src = path.join(USERDATA, "saves", `slot3_${SLOT}.db`);
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(src + ext)) fs.copyFileSync(src + ext, OUT + ext);
  }
  console.log(`[사본] ${OUT} (+wal)`);
  await headless.cleanup(USERDATA);
})();
