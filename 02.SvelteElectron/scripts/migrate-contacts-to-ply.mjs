/**
 * migrate-contacts-to-ply.mjs
 * 1. NPC_*.json 삭제 + _index에서 제거
 * 2. characters/CONTACT_*.json → role에 맞는 PLY_/COA_/MNG_ 파일로 신규 생성 후 contact 필드 삽입
 *    (scripts.json의 messengerScript도 함께)
 * 3. 전체 PLY/COA/MNG 파일에 contact 빈 구조 추가 (이미 있으면 유지)
 * 실행: node scripts/migrate-contacts-to-ply.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT   = resolve(__dirname, "..");
const MASTER = resolve(ROOT, "resource/data/master");
const PLY_DIR = join(MASTER, "entities/players");
const INDEX_PATH = join(PLY_DIR, "_index.json");

function readJson(p)      { return JSON.parse(readFileSync(p, "utf8")); }
function writeJson(p, obj){ writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8"); }

const EMPTY_CONTACT = {
  category: "",
  relation: "",
  initialAffinity: 0,
  arcs: [],
  chat: {},
};

// ── 1. index 로드 ──────────────────────────────────────────────
if (!existsSync(INDEX_PATH)) {
  console.error("❌ _index.json 없음. npm run migrate:entities 를 먼저 실행하세요.");
  process.exit(1);
}
const index = readJson(INDEX_PATH);
const allIds = Object.values(index.byLeague ?? {}).flat();

// ── 2. NPC_*.json 삭제 ─────────────────────────────────────────
const npcIds = allIds.filter((id) => id.startsWith("NPC_"));
for (const id of npcIds) {
  const p = join(PLY_DIR, `${id}.json`);
  if (existsSync(p)) { rmSync(p); console.log(`  🗑 삭제: ${p}`); }
}
// index에서 NPC 제거
for (const league of Object.keys(index.byLeague)) {
  index.byLeague[league] = index.byLeague[league].filter((id) => !id.startsWith("NPC_"));
}
index.contacts = (index.contacts ?? []).filter((id) => !id.startsWith("NPC_"));

// ── 3. 현재 최대 번호 파악 ─────────────────────────────────────
const updatedIds = Object.values(index.byLeague).flat();
function maxNum(prefix) {
  return updatedIds
    .filter((id) => id.startsWith(prefix + "_"))
    .map((id) => parseInt(id.replace(prefix + "_", ""), 10))
    .reduce((m, n) => Math.max(m, n), 0);
}
const counters = {
  PLY: maxNum("PLY"),
  COA: maxNum("COA"),
  MNG: maxNum("MNG"),
  OWN: maxNum("OWN"),
};
function nextId(prefix) {
  return `${prefix}_${String(++counters[prefix]).padStart(5, "0")}`;
}

// ── 4. CONTACT_*.json 수집 ─────────────────────────────────────
const charDir = join(MASTER, "characters");
const contactFiles = existsSync(charDir)
  ? readdirSync(charDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  : [];

// scripts.json → contactId → messengerScript 맵
const scriptsPath = join(MASTER, "messenger/scripts.json");
const scriptsByContactId = new Map();
if (existsSync(scriptsPath)) {
  const { scripts } = readJson(scriptsPath);
  for (const s of scripts) {
    const cid = s.contact?.id;
    if (cid) scriptsByContactId.set(cid, { startStepId: s.startStepId, steps: s.steps });
  }
}

// 기존 PLY 이름 맵 (name → id) — NPC 제거 후 기준
const nameToId = new Map();
for (const id of updatedIds) {
  const p = join(PLY_DIR, `${id}.json`);
  if (!existsSync(p)) continue;
  const { name } = readJson(p);
  if (name) nameToId.set(name, id);
}

// role 문자열 → prefix 매핑
function roleToPrefix(role) {
  const map = { player: "PLY", coach: "COA", manager: "MNG", owner: "OWN" };
  return map[role] ?? "PLY";
}

// CONTACT category → role 추론 (characters 파일에 role 필드 없을 때)
function inferRole(contact) {
  if (contact.role) return contact.role;
  if (contact.relation?.includes("코치")) return "coach";
  if (contact.relation?.includes("감독")) return "manager";
  return "player"; // 주장, 선배 등은 선수
}

const newContactIds = [];

for (const f of contactFiles) {
  const contact = readJson(join(charDir, f));
  const { id: contactId, name, nameEn, ...contactFields } = contact;
  const messengerScript = scriptsByContactId.get(contactId);
  if (messengerScript) contactFields.messengerScript = messengerScript;

  const existingId = nameToId.get(name);

  if (existingId) {
    const plyPath = join(PLY_DIR, `${existingId}.json`);
    const ply = readJson(plyPath);
    ply.contact = contactFields;
    writeJson(plyPath, ply);
    newContactIds.push(existingId);
    console.log(`  ✓ [업데이트] ${existingId} (${name}) ← ${contactId}`);
  } else {
    const role    = inferRole(contact);
    const prefix  = roleToPrefix(role);
    const newId   = nextId(prefix);

    const ply = {
      id: newId,
      name,
      ...(nameEn ? { nameEn } : {}),
      role,
      age: 20,
      status: "active",
      originLeagueId: "LEAGUE_HIGHSCHOOL",
      leagueId: "LEAGUE_HIGHSCHOOL",
      clubId: "TEAM_HS_SEOUL_INNOVATION",
      teamId: "TEAM_HS_SEOUL_INNOVATION",
      schoolId: "SCHOOL_HS_SEOUL_INNOVATION",
      notes: `migrated from ${contactId}`,
      details: {},
      contact: contactFields,
    };
    writeJson(join(PLY_DIR, `${newId}.json`), ply);

    if (!index.byLeague["LEAGUE_HIGHSCHOOL"]) index.byLeague["LEAGUE_HIGHSCHOOL"] = [];
    index.byLeague["LEAGUE_HIGHSCHOOL"].push(newId);
    newContactIds.push(newId);
    console.log(`  ✓ [신규생성] ${newId} (${name}/${role}) ← ${contactId}`);
  }
}

// ── 5. _index.contacts 갱신 ────────────────────────────────────
const contactSet = new Set(index.contacts ?? []);
for (const id of newContactIds) contactSet.add(id);
index.contacts = [...contactSet].sort();
index.generated = new Date().toISOString();
writeJson(INDEX_PATH, index);

// ── 6. 전체 PLY/COA/MNG 파일에 빈 contact 구조 추가 ─────────
const finalIds = Object.values(index.byLeague).flat();
const CONTACT_ROLES = new Set(["player", "coach", "manager", "owner"]);
let addedCount = 0;

for (const id of finalIds) {
  const p = join(PLY_DIR, `${id}.json`);
  if (!existsSync(p)) continue;
  const ply = readJson(p);
  if (!CONTACT_ROLES.has(ply.role)) continue;
  if (ply.contact !== undefined) continue; // 이미 있으면 유지
  ply.contact = { ...EMPTY_CONTACT };
  writeJson(p, ply);
  addedCount++;
}

console.log(`\n✓ 완료`);
console.log(`  contact 신규 병합: ${newContactIds.length}개`);
console.log(`  빈 contact 구조 추가: ${addedCount}개 파일`);
console.log(`  _index.contacts: ${index.contacts.length}개`);
