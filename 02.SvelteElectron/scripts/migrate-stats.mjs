/**
 * migrate-stats.mjs
 * PLY / MNG / COA JSON 파일을 새 능력치 구조로 일괄 마이그레이션
 *
 * 실행: node scripts/migrate-stats.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLAYERS_DIR = resolve(__dirname, "../resource/data/master/entities/players");

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function getFiles(dir) {
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
}

// experienceYears → 코치 experience 레벨 (1~5)
function expToLevel(years) {
  if (years >= 20) return 5;
  if (years >= 15) return 4;
  if (years >= 10) return 3;
  if (years >= 5)  return 2;
  return 1;
}

// specialty 한글 → enum 변환
function normalizeSpecialty(raw) {
  const map = {
    "투구": "pitching",
    "타격": "batting",
    "수비": "fielding",
    "주루": "running",
    "pitching": "pitching",
    "batting": "batting",
    "fielding": "fielding",
    "running": "running",
  };
  return map[raw] ?? "-";
}

// ─────────────────────────────────────────────────────────────
// PLY 마이그레이션
// ─────────────────────────────────────────────────────────────
function migratePly(data) {
  const p = data.details?.player;
  if (!p) return data;

  // pitching — clutch, holdRunners 추가
  if (p.pitching) {
    if (p.pitching.clutch      === undefined) p.pitching.clutch      = 50;
    if (p.pitching.holdRunners === undefined) p.pitching.holdRunners = 50;
    // ovr 재계산 (9개 스탯 평균)
    const keys = ["velocity","command","control","movement","mentality","stamina","recovery","clutch","holdRunners"];
    p.pitching.ovr = Math.round(keys.reduce((s, k) => s + (p.pitching[k] ?? 50), 0) / keys.length);
  }

  // batting — baseInstinct, bunting, platoon 추가
  if (p.batting) {
    if (p.batting.baseInstinct === undefined) p.batting.baseInstinct = 50;
    if (p.batting.bunting      === undefined) p.batting.bunting      = 45;
    if (p.batting.platoon      === undefined) p.batting.platoon      = 50;
    // ovr 재계산 (8개 핵심 스탯 평균)
    const keys = ["contact","power","eye","discipline","speed","fielding","arm","battingClutch"];
    p.batting.ovr = Math.round(keys.reduce((s, k) => s + (p.batting[k] ?? 50), 0) / keys.length);
  }

  // 포지션 숙련도
  if (!p.primaryPosition) {
    p.primaryPosition = p.position ?? "SP";
  }
  if (!p.positionRatings) {
    const pos = p.primaryPosition;
    const baseRating = p.playerType === "pitcher"
      ? (p.pitching?.ovr ?? 50)
      : (p.batting?.ovr  ?? 50);
    p.positionRatings = { [pos]: baseRating };
  }

  // 캐릭터 속성
  if (data.diligence  === undefined) data.diligence  = 60;
  if (data.popularity === undefined) data.popularity = 30;

  return data;
}

// ─────────────────────────────────────────────────────────────
// MNG 마이그레이션
// ─────────────────────────────────────────────────────────────
function migrateMng(data) {
  const m = data.details?.manager;
  if (!m) return data;

  const old = m.stats ?? {};

  m.stats = {
    motivation:      old.moraleMgmt      ?? old.motivation      ?? 50,
    development:     old.development                            ?? 50,
    strategy:        old.tactics         ?? old.strategy        ?? 50,
    handlePressure:  old.decision        ?? old.handlePressure  ?? 50,
    handlePersonnel: old.rotationMgmt    ?? old.handlePersonnel ?? 50,
  };
  // bullpenMgmt는 handlePersonnel에 통합되어 제거

  return data;
}

// ─────────────────────────────────────────────────────────────
// COA 마이그레이션
// ─────────────────────────────────────────────────────────────
function migrateCoa(data) {
  const c = data.details?.coach;
  if (!c) return data;

  const old = c.stats ?? {};
  const expLevel = expToLevel(c.experienceYears ?? 0);

  c.stats = {
    teaching:   old.teaching   ?? 50,
    analytics:  old.analysis   ?? old.analytics  ?? 50,
    experience: expLevel,
  };
  c.specialty = normalizeSpecialty(c.specialty ?? "-");
  // communication, discipline, leadership 필드 제거

  return data;
}

// ─────────────────────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────────────────────
const files = getFiles(PLAYERS_DIR);

let plyCount = 0;
let mngCount = 0;
let coaCount = 0;
let skipCount = 0;

for (const file of files) {
  const data = readJson(file);
  const id   = data.id ?? "";
  let migrated = null;

  if (id.startsWith("PLY_")) {
    migrated = migratePly(data);
    plyCount++;
  } else if (id.startsWith("MNG_")) {
    migrated = migrateMng(data);
    // MNG도 PLY 마이그레이션(pitching/batting 구조) 적용
    migrated = migratePly(migrated);
    mngCount++;
  } else if (id.startsWith("COA_")) {
    migrated = migrateCoa(data);
    migrated = migratePly(migrated);
    coaCount++;
  } else {
    skipCount++;
    continue;
  }

  writeJson(file, migrated);
}

console.log(`마이그레이션 완료`);
console.log(`  PLY: ${plyCount}개`);
console.log(`  MNG: ${mngCount}개`);
console.log(`  COA: ${coaCount}개`);
console.log(`  SKIP: ${skipCount}개`);
