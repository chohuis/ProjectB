/**
 * gen-manifest.mjs
 * resource/data/master/ 디렉토리를 스캔해 _manifest.json 자동 생성
 * 실행: node scripts/gen-manifest.mjs
 * 자동: npm run dev / npm run build 시 선행 실행
 */
import {
  readFileSync, writeFileSync, readdirSync,
  existsSync, statSync,
} from "node:fs";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT   = resolve(__dirname, "..");
const MASTER = resolve(ROOT, "resource/data/master");

/** 디렉토리에서 JSON 파일명(확장자 제거)을 ID 목록으로 반환 */
function scanIds(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => basename(f, ".json"))
    .sort();
}

/** JSON 유효성 체크 (오류 시 경고 + 해당 ID 제외) */
function validateAndFilter(dir, ids) {
  return ids.filter((id) => {
    const filePath = join(dir, `${id}.json`);
    try {
      JSON.parse(readFileSync(filePath, "utf8"));
      return true;
    } catch (e) {
      console.warn(`[gen-manifest] ⚠ JSON 오류 — 스킵: ${id}.json\n    ${e.message}`);
      return false;
    }
  });
}

// ── 스캔 ────────────────────────────────────────────────────

const mandatoryIds   = validateAndFilter(join(MASTER, "events/mandatory"),  scanIds(join(MASTER, "events/mandatory")));
const conditionalIds = validateAndFilter(join(MASTER, "events/conditional"), scanIds(join(MASTER, "events/conditional")));
const randomMedia    = validateAndFilter(join(MASTER, "events/random/media"),      scanIds(join(MASTER, "events/random/media")));
const randomSocial   = validateAndFilter(join(MASTER, "events/random/social"),     scanIds(join(MASTER, "events/random/social")));
const randomTeamLife = validateAndFilter(join(MASTER, "events/random/team_life"),  scanIds(join(MASTER, "events/random/team_life")));

const achBaseball = validateAndFilter(join(MASTER, "achievements/baseball"), scanIds(join(MASTER, "achievements/baseball")));
const achGrowth   = validateAndFilter(join(MASTER, "achievements/growth"),   scanIds(join(MASTER, "achievements/growth")));
const achSocial   = validateAndFilter(join(MASTER, "achievements/social"),   scanIds(join(MASTER, "achievements/social")));
const achHidden   = validateAndFilter(join(MASTER, "achievements/hidden"),   scanIds(join(MASTER, "achievements/hidden")));

// ── 랜덤 풀 ──────────────────────────────────────────────────
// 🔴 풀 파일 경로가 `stores/master.ts`에 **한 줄씩 박혀 있었다.** 새 풀을
//    만들어도 아무도 안 읽고, 오류도 로그도 안 난다 — 이벤트가 그 풀에
//    들어간 채 영원히 안 뜬다. 이벤트·업적은 이미 매니페스트로 읽는데
//    풀만 빠져 있었다. (2026-08-25)
//
// ⚠ `military_*.json`은 모양이 다르다(`{events:[...]}` — 군 이벤트 표지
//    추첨 풀이 아니다). `baseRoll`이 있는 것만 고른다
const poolFiles = readdirSync(join(MASTER, "events/pools"))
  .filter((f) => f.endsWith(".json"))
  .filter((f) => {
    try {
      const j = JSON.parse(readFileSync(join(MASTER, "events/pools", f), "utf8"));
      return typeof j.id === "string" && j.id.startsWith("POOL_") && j.baseRoll;
    } catch { return false; }
  })
  .map((f) => f.replace(/.json$/, ""))
  .sort();

// ── 매니페스트 조립 ──────────────────────────────────────────

const manifest = {
  generatedAt: new Date().toISOString(),
  events: {
    mandatory:   mandatoryIds,
    conditional: conditionalIds,
    random: {
      media:     randomMedia,
      social:    randomSocial,
      team_life: randomTeamLife,
    },
  },
  pools: poolFiles,
  achievements: {
    baseball: achBaseball,
    growth:   achGrowth,
    social:   achSocial,
    hidden:   achHidden,
  },
};

writeFileSync(join(MASTER, "_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

// ── 통계 출력 ────────────────────────────────────────────────

const totalEvents =
  mandatoryIds.length + conditionalIds.length +
  randomMedia.length + randomSocial.length + randomTeamLife.length;
const totalAch = achBaseball.length + achGrowth.length + achSocial.length + achHidden.length;

// entities/players/_index.json — 선수 집계 + contacts[] 갱신
// contacts 스캔은 --force 플래그 또는 contacts가 없을 때만 실행
// (17,000+ 파일 개별 읽기로 인한 dev 기동 지연 방지)
const entityIndexPath = join(MASTER, "entities/players/_index.json");
const plyDir = join(MASTER, "entities/players");
const forceContacts = process.argv.includes("--force");
let totalEntities = 0;
let entityLeagueStats = "";
let totalContacts = 0;
if (existsSync(entityIndexPath)) {
  try {
    const idx = JSON.parse(readFileSync(entityIndexPath, "utf8"));
    const byLeague = idx.byLeague ?? {};
    const allIds = Object.values(byLeague).flat();
    totalEntities = allIds.length;
    entityLeagueStats = Object.entries(byLeague)
      .map(([k, v]) => `${k.replace("LEAGUE_", "")} ${v.length}`)
      .join(" / ");

    const needsScan = forceContacts || !Array.isArray(idx.contacts);
    let contactIds = needsScan ? [] : idx.contacts;

    if (needsScan) {
      if (forceContacts) console.log("  contacts[] 강제 재스캔 중...");
      for (const id of allIds) {
        const filePath = join(plyDir, `${id}.json`);
        if (!existsSync(filePath)) continue;
        try {
          const { contact } = JSON.parse(readFileSync(filePath, "utf8"));
          if (!contact) continue;
          const hasArcs = Array.isArray(contact.arcs) && contact.arcs.length > 0;
          const hasChat = contact.chat && Object.keys(contact.chat).some(
            (k) => Array.isArray(contact.chat[k]) && contact.chat[k].length > 0
          );
          if (hasArcs || hasChat) contactIds.push(id);
        } catch { /* JSON 오류 파일 스킵 */ }
      }
      contactIds.sort();
    }

    idx.contacts = contactIds;
    idx.generated = new Date().toISOString();
    writeFileSync(entityIndexPath, JSON.stringify(idx, null, 2) + "\n", "utf8");
    totalContacts = contactIds.length;
  } catch { /* 인덱스 파싱 실패 시 무시 */ }
}

console.log("✓ _manifest.json 생성 완료");
console.log(`  이벤트  ${totalEvents.toString().padStart(4)}개  (필수 ${mandatoryIds.length} / 조건부 ${conditionalIds.length} / 랜덤 ${randomMedia.length + randomSocial.length + randomTeamLife.length})`);
console.log(`  업적    ${totalAch.toString().padStart(4)}개`);
if (totalEntities > 0) {
  console.log(`  선수    ${totalEntities.toString().padStart(4)}개  (entities/players/_index.json — ${entityLeagueStats})`);
} else {
  // ⚠ **`migrate:entities` 는 없는 스크립트다** (2026-09-04 실측). 이름난
  //   선수 파일은 `npm run deploy`(scripts/deploy-staging.mjs)가 만들고,
  //   **폴더가 통째로 없는 것이 지금 정상**이다(Phase 6A — NPC 는 slot.db 가
  //   정본이다). 없는 명령을 가리키면 다음 사람이 그걸 찾느라 시간을 쓴다.
  console.log(`  선수       0개  (entities/players 없음 — Phase 6A 이후 정상 · 넣으려면 npm run deploy)`);
}
console.log(`  컨택트  ${totalContacts.toString().padStart(4)}개  (entities/players/_index.json#contacts)`);
