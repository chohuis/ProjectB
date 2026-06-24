/**
 * migrate-entities.mjs ??留덉씠洹몃젅?댁뀡 / 利앸텇 異붽?
 *
 * 湲곕낯 ?ㅽ뻾: npm run migrate:entities
 *   - ?꾩껜 people_*.json ???ъ쿂由ы빐 PLY_00001遺???щ??? *
 * 異붽? ?ㅽ뻾: npm run migrate:entities -- --append people_jbl.json
 *   - 湲곗〈 _index.json ??理쒕? 移댁슫?곕? ?쎌뼱 ?댁뼱??踰덊샇 遺?? *   - 吏?뺥븳 bulk ?뚯씪留?泥섎━?섍퀬 _index.json ??蹂묓빀
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
  join(ROOT, "resource/data/staging/people_hs.json"),
  join(ROOT, "resource/data/staging/people_univ.json"),
  join(ROOT, "resource/data/staging/people_ind.json"),
  join(ROOT, "resource/data/staging/people_kbl.json"),
  join(ROOT, "resource/data/staging/people_abl.json"),
];

const ROLE_PREFIX = { player: "PLY", coach: "COA", manager: "MNG", owner: "OWN" };

function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
function writeJson(p, d) { writeFileSync(p, JSON.stringify(d, null, 2), "utf8"); }

mkdirSync(PLAYERS, { recursive: true });

// ?? CLI ?뚯떛 ??????????????????????????????????????????????????
const args = process.argv.slice(2);
const appendIdx = args.indexOf("--append");
const isAppend  = appendIdx !== -1;
const appendFiles = isAppend
  ? args.slice(appendIdx + 1).map(f =>
      f.startsWith("/") || f.includes(":\\") ? f : join(ROOT, "resource/data/staging", f)
    )
  : [];

// ?? 移댁슫??珥덇린???????????????????????????????????????????????
const counters = { PLY: 0, COA: 0, MNG: 0, OWN: 0 };
let byLeague = {};

if (isAppend && existsSync(INDEX)) {
  // 湲곗〈 index 濡쒕뱶 諛?理쒕? 移댁슫??怨꾩궛
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
  console.log(`[append] 湲곗〈 移댁슫?? PLY=${counters.PLY} COA=${counters.COA} MNG=${counters.MNG} OWN=${counters.OWN}`);
}

// ?? 泥섎━???뚯뒪 寃곗젙 ?????????????????????????????????????????
const targets = isAppend ? appendFiles : SOURCE_FILES;
let total = 0;

for (const srcPath of targets) {
  if (!existsSync(srcPath)) {
    console.log(`?ㅽ궢 (?놁쓬): ${srcPath}`);
    continue;
  }
  const bulk = readJson(srcPath);
  const entities = bulk.entities ?? [];
  console.log(`泥섎━ 以? ${basename(srcPath)} ??${entities.length}媛?);

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

// ?? _index.json 媛깆떊 ?????????????????????????????????????????
writeJson(INDEX, { generated: new Date().toISOString(), byLeague });

console.log(`\n??${isAppend ? "異붽? " : ""}留덉씠洹몃젅?댁뀡 ?꾨즺 ??${total}媛??뷀떚??);
for (const [league, ids] of Object.entries(byLeague)) {
  console.log(`  ${league}: ${ids.length}媛?);
}
console.log(`\n理쒖쥌 移댁슫?? PLY=${counters.PLY} COA=${counters.COA} MNG=${counters.MNG} OWN=${counters.OWN}`);
if (!isAppend) {
  console.log("\n??湲곗〈 people_*.json ?뚯씪? ??젣?섏? ?딆븯?듬땲??");
  console.log("  ?뺤긽 ?숈옉 ?뺤씤 ???섎룞?쇰줈 ??젣?섏꽭??");
}
console.log("  npm run gen:manifest ???ㅽ뻾?섏꽭??");
