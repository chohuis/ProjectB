/**
 * migrate-to-content.mjs
 * 기존 집합형 JSON → 파일-per-엔티티 구조로 1회성 마이그레이션
 * 실행: node scripts/migrate-to-content.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT   = resolve(__dirname, "..");
const MASTER = resolve(ROOT, "resource/data/master");

function write(filePath, data) {
  mkdirSync(resolve(filePath, ".."), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function read(relPath) {
  return JSON.parse(readFileSync(join(MASTER, relPath), "utf8"));
}

let created = 0;

// ── 1. mandatory 이벤트 분리 ─────────────────────────────────
const mandatory = read("events/rules/mandatory.json");
for (const evt of mandatory.events) {
  write(join(MASTER, "events/mandatory", `${evt.id}.json`), evt);
  created++;
}
console.log(`  mandatory 이벤트: ${mandatory.events.length}개`);

// ── 2. conditional 이벤트 분리 ──────────────────────────────
const conditional = read("events/rules/conditional.json");
for (const evt of conditional.events) {
  write(join(MASTER, "events/conditional", `${evt.id}.json`), evt);
  created++;
}
console.log(`  conditional 이벤트: ${conditional.events.length}개`);

// ── 3. random 이벤트 분리 (poolId → 서브디렉토리) ───────────
const poolDirMap = {
  POOL_MEDIA_DAILY:     "media",
  POOL_SOCIAL_DAILY:    "social",
  POOL_TEAM_LIFE_DAILY: "team_life",
};
const random = read("events/rules/random.json");
for (const evt of random.events) {
  const sub = poolDirMap[evt.poolId] ?? "misc";
  write(join(MASTER, "events/random", sub, `${evt.id}.json`), evt);
  created++;
}
console.log(`  random 이벤트: ${random.events.length}개`);

// ── 4. 업적 분리 (category → 서브디렉토리) ──────────────────
const achievements = read("achievements/achievements.json");
for (const ach of achievements.achievements) {
  write(join(MASTER, "achievements", ach.category, `${ach.id}.json`), ach);
  created++;
}
console.log(`  업적: ${achievements.achievements.length}개`);

// ── 5. contacts → characters + arcs 분리 ────────────────────
const index = read("contacts/index.json");
for (const contactId of index.contacts) {
  const contact = read(`contacts/${contactId}.json`);
  const { arcs, ...meta } = contact;

  // characters/CONTACT_*.json (아크 제외)
  write(join(MASTER, "characters", `${contactId}.json`), meta);
  created++;

  // arcs/CONTACT_*/ARC_ID.json
  if (Array.isArray(arcs)) {
    for (const arc of arcs) {
      write(join(MASTER, "arcs", contactId, `${arc.id}.json`), arc);
      created++;
    }
    console.log(`  ${contactId}: 아크 ${arcs.length}개`);
  }
}

console.log(`\n✓ 마이그레이션 완료 — 총 ${created}개 파일 생성`);
console.log("  다음 단계: node scripts/gen-manifest.mjs");
