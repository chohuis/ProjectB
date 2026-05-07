/**
 * migrate-contacts-to-ply.mjs
 * characters/CONTACT_*.json + messenger/scripts.json → PLY 파일의 contact 필드로 병합
 * - 이름 매칭 PLY 있으면 기존 파일에 contact 필드 추가
 * - 없으면 리그별 NPC 파일(NPC_XXXXX) 신규 생성
 * 실행: node scripts/migrate-contacts-to-ply.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT   = resolve(__dirname, "..");
const MASTER = resolve(ROOT, "resource/data/master");

function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
function writeJson(p, obj) { writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8"); }

// ── 1. CONTACT_*.json 수집 ──────────────────────────────────────
const charDir = join(MASTER, "characters");
const contactFiles = existsSync(charDir)
  ? readdirSync(charDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  : [];
if (contactFiles.length === 0) { console.log("characters/ 에 파일 없음. 종료."); process.exit(0); }

const contacts = contactFiles.map((f) => readJson(join(charDir, f)));

// ── 2. scripts.json → contactId → messengerScript 맵 ───────────
const scriptsPath = join(MASTER, "messenger/scripts.json");
const scriptsByContactId = new Map();
if (existsSync(scriptsPath)) {
  const { scripts } = readJson(scriptsPath);
  for (const s of scripts) {
    const cid = s.contact?.id;
    if (cid) scriptsByContactId.set(cid, { startStepId: s.startStepId, steps: s.steps });
  }
}

// ── 3. _index.json 로드 ────────────────────────────────────────
const plyDir = join(MASTER, "entities/players");
const indexPath = join(plyDir, "_index.json");
if (!existsSync(indexPath)) {
  console.error("❌ _index.json 없음. npm run migrate:entities 를 먼저 실행하세요.");
  process.exit(1);
}
const index = readJson(indexPath);
const allPlyIds = Object.values(index.byLeague ?? {}).flat();

// 기존 PLY 이름 맵 (name → id)
const nameToId = new Map();
for (const id of allPlyIds) {
  const path = join(plyDir, `${id}.json`);
  if (!existsSync(path)) continue;
  const { name } = readJson(path);
  if (name) nameToId.set(name, id);
}

// NPC_ prefix 기존 최대 번호 파악 (신규 ID 생성용)
let npcCounter = allPlyIds
  .filter((id) => id.startsWith("NPC_"))
  .map((id) => parseInt(id.replace("NPC_", ""), 10))
  .reduce((max, n) => Math.max(max, n), 0);

function nextNpcId() {
  return `NPC_${String(++npcCounter).padStart(5, "0")}`;
}

// ── 4. CONTACT → PLY 병합 / 신규 생성 ─────────────────────────
const mergedIds = [];

for (const contact of contacts) {
  const { id: contactId, name, nameEn, ...contactFields } = contact;
  const messengerScript = scriptsByContactId.get(contactId);
  if (messengerScript) contactFields.messengerScript = messengerScript;

  const existingId = nameToId.get(name);

  if (existingId) {
    // 기존 PLY에 contact 필드 병합
    const plyPath = join(plyDir, `${existingId}.json`);
    const ply = readJson(plyPath);
    ply.contact = contactFields;
    writeJson(plyPath, ply);
    mergedIds.push(existingId);
    console.log(`  ✓ [업데이트] ${existingId} (${name}) ← ${contactId}`);
  } else {
    // 신규 NPC PLY 생성
    const newId = nextNpcId();
    const ply = {
      id: newId,
      name,
      ...(nameEn ? { nameEn } : {}),
      role: contactFields.category === "team" ? "coach" : "player",
      age: 0,
      status: "active",
      originLeagueId: "LEAGUE_HIGHSCHOOL",
      leagueId: "LEAGUE_HIGHSCHOOL",
      clubId: "",
      teamId: "",
      schoolId: "",
      notes: `Contact NPC (${contactId})`,
      details: {},
      contact: contactFields,
    };
    writeJson(join(plyDir, `${newId}.json`), ply);
    // _index 에도 추가 (LEAGUE_HIGHSCHOOL 기본)
    if (!index.byLeague["LEAGUE_HIGHSCHOOL"]) index.byLeague["LEAGUE_HIGHSCHOOL"] = [];
    index.byLeague["LEAGUE_HIGHSCHOOL"].push(newId);
    mergedIds.push(newId);
    console.log(`  ✓ [신규생성] ${newId} (${name}) ← ${contactId}`);
  }
}

// ── 5. _index.contacts 갱신 ────────────────────────────────────
const existingContacts = new Set(index.contacts ?? []);
for (const id of mergedIds) existingContacts.add(id);
index.contacts = [...existingContacts].sort();
index.generated = new Date().toISOString();
writeJson(indexPath, index);

console.log(`\n✓ 마이그레이션 완료: ${mergedIds.length}개 PLY 처리`);
console.log(`  _index.contacts: ${index.contacts.length}개`);
