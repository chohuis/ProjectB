/**
 * migrate-entities.mjs — 마이그레이션 / 증분 추가
 *
 * 기본 실행: npm run migrate:entities
 *   - 전체 people_*.json 을 재처리해 PLY_00001부터 재부여
 *
 * 추가 실행: npm run migrate:entities -- --append people_jbl.json
 *   - 기존 _index.json 의 최대 카운터를 읽어 이어서 번호 부여
 *   - 지정한 bulk 파일만 처리하고 _index.json 에 병합
 */
import {
  readFileSync, writeFileSync, readdirSync,
  existsSync, mkdirSync,
} from "node:fs";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT      = resolve(__dirname, "..");
const MASTER    = resolve(ROOT, "resource/data/master");
const PLAYERS   = join(MASTER, "entities/players");
const INDEX     = join(PLAYERS, "_index.json");

const SOURCE_FILES = [
  join(MASTER, "entities/people_hs.json"),
  join(MASTER, "entities/people_univ.json"),
  join(MASTER, "entities/people_ind.json"),
  join(MASTER, "entities/people_kbl.json"),
  join(MASTER, "entities/people_abl.json"),
];

const ROLE_PREFIX = { player: "PLY", coach: "COA", manager: "MNG", owner: "OWN" };

function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
function writeJson(p, d) { writeFileSync(p, JSON.stringify(d, null, 2), "utf8"); }

mkdirSync(PLAYERS, { recursive: true });

// ── CLI 파싱 ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const appendIdx = args.indexOf("--append");
const isAppend  = appendIdx !== -1;
const appendFiles = isAppend
  ? args.slice(appendIdx + 1).map(f =>
      f.startsWith("/") || f.includes(":\\") ? f : join(MASTER, "entities", f)
    )
  : [];

// ── 카운터 초기화 ─────────────────────────────────────────────
const counters = { PLY: 0, COA: 0, MNG: 0, OWN: 0 };
let byLeague = {};

if (isAppend && existsSync(INDEX)) {
  // 기존 index 로드 및 최대 카운터 계산
  const existing = readJson(INDEX);
  byLeague = existing.byLeague ?? {};
  for (const ids of Object.values(byLeague)) {
    for (const id of ids) {
      const [prefix, numStr] = id.split("_");
      if (counters[prefix] !== undefined) {
        counters[prefix] = Math.max(counters[prefix], parseInt(numStr, 10));
      }
    }
  }
  console.log(`[append] 기존 카운터: PLY=${counters.PLY} COA=${counters.COA} MNG=${counters.MNG} OWN=${counters.OWN}`);
}

// ── 처리할 소스 결정 ─────────────────────────────────────────
const targets = isAppend ? appendFiles : SOURCE_FILES;
let total = 0;

for (const srcPath of targets) {
  if (!existsSync(srcPath)) {
    console.log(`스킵 (없음): ${srcPath}`);
    continue;
  }
  const bulk = readJson(srcPath);
  const entities = bulk.entities ?? [];
  console.log(`처리 중: ${basename(srcPath)} — ${entities.length}개`);

  for (const ent of entities) {
    const role   = ent.role ?? "player";
    const prefix = ROLE_PREFIX[role] ?? "PLY";
    counters[prefix]++;
    const newId  = `${prefix}_${String(counters[prefix]).padStart(5, "0")}`;

    const updated = { ...ent, id: newId };
    writeJson(join(PLAYERS, `${newId}.json`), updated);

    const leagueId = ent.leagueId ?? "LEAGUE_UNKNOWN";
    if (!byLeague[leagueId]) byLeague[leagueId] = [];
    byLeague[leagueId].push(newId);
    total++;
  }
}

// ── _index.json 갱신 ─────────────────────────────────────────
writeJson(INDEX, { generated: new Date().toISOString(), byLeague });

console.log(`\n✓ ${isAppend ? "추가 " : ""}마이그레이션 완료 — ${total}개 엔티티`);
for (const [league, ids] of Object.entries(byLeague)) {
  console.log(`  ${league}: ${ids.length}개`);
}
console.log(`\n최종 카운터: PLY=${counters.PLY} COA=${counters.COA} MNG=${counters.MNG} OWN=${counters.OWN}`);
if (!isAppend) {
  console.log("\n⚠ 기존 people_*.json 파일은 삭제하지 않았습니다.");
  console.log("  정상 동작 확인 후 수동으로 삭제하세요.");
}
console.log("  npm run gen:manifest 도 실행하세요.");
