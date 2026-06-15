// scripts/rebuild_entity_index.cjs
// entities/players/ 디렉토리 전체 스캔 → _index.json 재생성
// 실행: node scripts/rebuild_entity_index.cjs

const path = require("node:path");
const fs   = require("node:fs");

const DIR   = path.resolve(__dirname, "../resource/data/master/entities/players");
const OUT   = path.join(DIR, "_index.json");

function main() {
  const files = fs.readdirSync(DIR)
    .filter(f => f.endsWith(".json") && !f.startsWith("_"))
    .sort();

  const byLeague = {};
  let total = 0;
  let errors = 0;

  for (const f of files) {
    const id = f.replace(".json", "");
    try {
      const raw = fs.readFileSync(path.join(DIR, f), "utf8").replace(/^﻿/, "");
      const d   = JSON.parse(raw);
      const league = d.leagueId || "UNKNOWN";
      if (!byLeague[league]) byLeague[league] = [];
      byLeague[league].push(id);
      total++;
    } catch (e) {
      console.warn(`  [skip] ${f}: ${e.message}`);
      errors++;
    }
  }

  const index = {
    generated: new Date().toISOString(),
    byLeague,
    contacts: [],
  };

  fs.writeFileSync(OUT, JSON.stringify(index, null, 2) + "\n", "utf8");

  console.log(`[rebuild_entity_index] 완료: ${total}개 entity, ${errors}개 오류`);
  for (const [league, ids] of Object.entries(byLeague).sort()) {
    console.log(`  ${league}: ${ids.length}개`);
  }
  console.log(`\n→ 다음 실행: npm run dev`);
}

main();
