/**
 * migrate-pitches.mjs
 * 세이브 파일의 learnedPitchIds(구버전) → pitches 배열로 변환
 *
 * 실행: node scripts/migrate-pitches.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = resolve(__dirname, "../saves");

if (!existsSync(SAVES_DIR)) {
  console.log("saves/ 디렉터리가 없습니다. 마이그레이션 대상 없음.");
  process.exit(0);
}

const files = readdirSync(SAVES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => join(SAVES_DIR, f));

let migrated = 0;

for (const file of files) {
  const save = JSON.parse(readFileSync(file, "utf8"));
  const p = save?.protagonist;
  if (!p) continue;

  let changed = false;

  if (p.learnedPitchIds && !p.pitches) {
    p.pitches = p.learnedPitchIds.map((id) => ({ id, grade: 3 }));
    delete p.learnedPitchIds;
    changed = true;
  } else if (!p.pitches) {
    p.pitches = [{ id: "PITCH_FASTBALL", grade: 3 }];
    changed = true;
  }

  if (changed) {
    writeFileSync(file, JSON.stringify(save, null, 2) + "\n", "utf8");
    migrated++;
    console.log(`  변환: ${file}`);
  }
}

console.log(`\n완료: ${migrated}개 세이브 파일 마이그레이션`);
