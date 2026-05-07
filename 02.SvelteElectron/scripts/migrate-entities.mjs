/**
 * migrate-entities.mjs — 일회성 마이그레이션
 * 기존 people_*.json 벌크 파일을 entities/players/ 개별 파일로 분리
 *
 * 실행: npm run migrate:entities
 *
 * - PLY_00001, MNG_00001, COA_00001, OWN_00001 형식으로 ID 재부여
 * - entities/players/_index.json (leagueId → id 목록) 자동 생성
 * - 기존 bulk 파일은 삭제하지 않음 (수동 확인 후 제거)
 */
import {
  readFileSync, writeFileSync, readdirSync,
  existsSync, mkdirSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT      = resolve(__dirname, "..");
const MASTER    = resolve(ROOT, "resource/data/master");
const PLAYERS   = join(MASTER, "entities/players");

const SOURCE_FILES = [
  join(MASTER, "entities/people_hs.json"),
  join(MASTER, "entities/people_univ.json"),
  join(MASTER, "entities/people_ind.json"),
  join(MASTER, "entities/people_kbl.json"),
  join(MASTER, "entities/people_abl.json"),
];

const ROLE_PREFIX = {
  player:  "PLY",
  coach:   "COA",
  manager: "MNG",
  owner:   "OWN",
};

function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
function writeJson(p, d) { writeFileSync(p, JSON.stringify(d, null, 2), "utf8"); }

mkdirSync(PLAYERS, { recursive: true });

const counters  = { PLY: 0, COA: 0, MNG: 0, OWN: 0 };
const byLeague  = {};
let total = 0;

for (const srcPath of SOURCE_FILES) {
  if (!existsSync(srcPath)) {
    console.log(`스킵 (없음): ${srcPath}`);
    continue;
  }
  const bulk = readJson(srcPath);
  const entities = bulk.entities ?? [];
  console.log(`처리 중: ${srcPath} — ${entities.length}개`);

  for (const ent of entities) {
    const role = ent.role ?? "player";
    const prefix = ROLE_PREFIX[role] ?? "PLY";
    counters[prefix]++;
    const newId = `${prefix}_${String(counters[prefix]).padStart(5, "0")}`;

    const updated = { ...ent, id: newId };
    writeJson(join(PLAYERS, `${newId}.json`), updated);

    const leagueId = ent.leagueId ?? "LEAGUE_UNKNOWN";
    if (!byLeague[leagueId]) byLeague[leagueId] = [];
    byLeague[leagueId].push(newId);
    total++;
  }
}

// _index.json 생성
const index = {
  generated: new Date().toISOString(),
  byLeague,
};
writeJson(join(PLAYERS, "_index.json"), index);

console.log(`\n✓ 마이그레이션 완료 — ${total}개 엔티티`);
for (const [league, ids] of Object.entries(byLeague)) {
  console.log(`  ${league}: ${ids.length}개`);
}
console.log("\n⚠ 기존 people_*.json 파일은 삭제하지 않았습니다.");
console.log("  정상 동작 확인 후 수동으로 삭제하세요.");
console.log("  npm run gen:manifest 도 실행하세요.");
