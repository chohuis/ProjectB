/**
 * deploy-staging.mjs
 * resource/data/staging/ 에 놓인 JSON 파일을 올바른 위치로 자동 배포
 *
 * 사용법: npm run deploy
 *
 * 라우팅 규칙 (파일명 접두사 기준):
 *   EVT_*      → events/mandatory|conditional|random/{pool}/  (파일 내 type/poolId 참조)
 *   ACH_*      → achievements/{category}/                     (파일 내 category 참조)
 *   CONTACT_*  → characters/
 *   MSG_*      → messages/templates.json  (templates 배열에 추가)
 *   DEC_*      → messages/decision_templates.json  (decisions 배열에 추가)
 *   SCRIPT_*   → messenger/scripts.json  (scripts 배열에 추가)
 *   PLY_* MNG_* COA_* OWN_*  → entities/players/ (자동 번호 부여, _index.json 갱신)
 */
import {
  readFileSync, writeFileSync, readdirSync,
  existsSync, mkdirSync, unlinkSync,
} from "node:fs";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname  = fileURLToPath(new URL(".", import.meta.url));
const ROOT       = resolve(__dirname, "..");
const STAGING    = resolve(ROOT, "resource/data/staging");
const MASTER     = resolve(ROOT, "resource/data/master");
const PLAYERS    = join(MASTER, "entities/players");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  mkdirSync(resolve(filePath, ".."), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ── 엔티티 자동 번호 부여 ─────────────────────────────────────

function nextEntityId(prefix) {
  if (!existsSync(PLAYERS)) return `${prefix}_00001`;
  const existing = readdirSync(PLAYERS)
    .filter((f) => f.startsWith(`${prefix}_`) && f.endsWith(".json"))
    .map((f) => parseInt(basename(f, ".json").slice(prefix.length + 1), 10))
    .filter((n) => !isNaN(n));
  const max = existing.length > 0 ? Math.max(...existing) : 0;
  return `${prefix}_${String(max + 1).padStart(5, "0")}`;
}

function updateEntityIndex(id, leagueId) {
  const indexPath = join(PLAYERS, "_index.json");
  const index = existsSync(indexPath)
    ? readJson(indexPath)
    : { generated: "", byLeague: {} };
  index.generated = new Date().toISOString();
  if (!index.byLeague[leagueId]) index.byLeague[leagueId] = [];
  if (!index.byLeague[leagueId].includes(id)) {
    index.byLeague[leagueId].push(id);
    index.byLeague[leagueId].sort();
  }
  writeJson(indexPath, index);
}

// ── 배열 파일 삽입 (중복 id 무시) ────────────────────────────

function appendToArrayFile(filePath, arrayKey, entry) {
  const data = existsSync(filePath) ? readJson(filePath) : { [arrayKey]: [] };
  if (!Array.isArray(data[arrayKey])) data[arrayKey] = [];
  const existing = data[arrayKey].findIndex((x) => x.id === entry.id);
  if (existing !== -1) {
    console.log(`  ⚠ 중복 id 덮어쓰기: ${entry.id}`);
    data[arrayKey][existing] = entry;
  } else {
    data[arrayKey].push(entry);
  }
  writeJson(filePath, data);
}

// ── EVT_ 라우팅 ───────────────────────────────────────────────

const POOL_TO_FOLDER = {
  POOL_MEDIA_WEEKLY:   "media",
  POOL_SOCIAL_DAILY:   "social",
  POOL_TEAMLIFE_DAILY: "team_life",
};

function routeEvent(data, srcFile) {
  const type = data.type;
  let destDir;
  if (type === "mandatory") {
    destDir = join(MASTER, "events/mandatory");
  } else if (type === "conditional") {
    destDir = join(MASTER, "events/conditional");
  } else if (type === "random") {
    const folder = POOL_TO_FOLDER[data.poolId];
    if (!folder) throw new Error(`알 수 없는 poolId: ${data.poolId} (${srcFile})`);
    destDir = join(MASTER, "events/random", folder);
  } else {
    throw new Error(`알 수 없는 event type: ${type} (${srcFile})`);
  }
  mkdirSync(destDir, { recursive: true });
  writeJson(join(destDir, basename(srcFile)), data);
  console.log(`  → events/${type === "random" ? `random/${POOL_TO_FOLDER[data.poolId]}` : type}/${basename(srcFile)}`);
}

// ── 메인 ─────────────────────────────────────────────────────

const files = existsSync(STAGING)
  ? readdirSync(STAGING).filter((f) => f.endsWith(".json"))
  : [];

if (files.length === 0) {
  console.log("staging/ 폴더에 배포할 파일이 없습니다.");
  process.exit(0);
}

console.log(`\n배포 시작 — ${files.length}개 파일\n`);

let deployed = 0;
const errors = [];

for (const file of files) {
  const srcPath = join(STAGING, file);
  let data;
  try {
    data = readJson(srcPath);
  } catch (e) {
    errors.push(`JSON 파싱 오류: ${file} — ${e.message}`);
    continue;
  }

  const prefix = file.split("_")[0] + "_" + (file.split("_")[1] ?? "");
  const simplePrefix = file.split("_")[0];

  try {
    if (file.startsWith("EVT_")) {
      routeEvent(data, file);
    } else if (file.startsWith("ACH_")) {
      const cat = data.category;
      if (!cat) throw new Error("category 필드 없음");
      const destDir = join(MASTER, "achievements", cat);
      mkdirSync(destDir, { recursive: true });
      writeJson(join(destDir, file), data);
      console.log(`  → achievements/${cat}/${file}`);
    } else if (file.startsWith("CONTACT_")) {
      writeJson(join(MASTER, "characters", file), data);
      console.log(`  → characters/${file}`);
    } else if (file.startsWith("MSG_")) {
      appendToArrayFile(join(MASTER, "messages/templates.json"), "templates", data);
      console.log(`  → messages/templates.json [${data.id}]`);
    } else if (file.startsWith("DEC_")) {
      appendToArrayFile(join(MASTER, "messages/decision_templates.json"), "decisions", data);
      console.log(`  → messages/decision_templates.json [${data.id}]`);
    } else if (file.startsWith("SCRIPT_")) {
      appendToArrayFile(join(MASTER, "messenger/scripts.json"), "scripts", data);
      console.log(`  → messenger/scripts.json [${data.id}]`);
    } else if (["PLY", "MNG", "COA", "OWN"].includes(simplePrefix)) {
      mkdirSync(PLAYERS, { recursive: true });
      const newId   = nextEntityId(simplePrefix);
      data.id       = newId;
      const leagueId = data.leagueId ?? "LEAGUE_UNKNOWN";
      writeJson(join(PLAYERS, `${newId}.json`), data);
      updateEntityIndex(newId, leagueId);
      console.log(`  → entities/players/${newId}.json  (리그: ${leagueId})`);
    } else {
      console.log(`  ⚠ 인식 불가 접두사, 건너뜀: ${file}`);
      continue;
    }

    unlinkSync(srcPath);
    deployed++;
  } catch (e) {
    errors.push(`${file}: ${e.message}`);
  }
}

// ── gen:manifest 실행 ────────────────────────────────────────

if (deployed > 0) {
  console.log("\n매니페스트 재생성 중...");
  try {
    execSync("node scripts/gen-manifest.mjs", { cwd: ROOT, stdio: "inherit" });
  } catch {
    console.warn("⚠ gen-manifest 실패 — 수동으로 npm run gen:manifest 실행하세요.");
  }
}

// ── 결과 출력 ────────────────────────────────────────────────

console.log(`\n완료: ${deployed}개 배포됨`);
if (errors.length > 0) {
  console.error("\n오류:");
  errors.forEach((e) => console.error("  ✗", e));
  process.exit(1);
}
