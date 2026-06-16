/**
 * generate-pitcher-pitches.mjs
 * pitches 필드가 없는 NPC 투수에게 능력치 기반 구종 자동 배정
 *
 * 배정 규칙:
 *   패스트볼 (항상)   : velocity → grade (80↑=5, 70↑=4, 60↑=3, 50↑=2, else=1)
 *   2번째 구종        : movement≥65 → 슬라이더/스플리터, control≥65 → 체인지업/커브, else → 커브 grade1
 *   3번째 구종(ovr≥70): 나머지 변화구 1개 추가
 *
 * 실행: node scripts/generate-pitcher-pitches.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT    = join(__dirname, "..");
const PLY_DIR = join(ROOT, "resource/data/master/entities/players");
const IDX     = join(PLY_DIR, "_index.json");
const DRY_RUN = process.argv.includes("--dry-run");

function readJson(fp) {
  return JSON.parse(readFileSync(fp, "utf8").replace(/^﻿/, ""));
}

function velocityGrade(vel) {
  if (vel >= 80) return 5;
  if (vel >= 70) return 4;
  if (vel >= 60) return 3;
  if (vel >= 50) return 2;
  return 1;
}

// 투수 유형 분류 (포지션 기반)
function pitcherType(position) {
  if (position === "SP") return "starter";
  if (position === "RP" || position === "CP") return "reliever";
  return "starter";
}

function generatePitches(pitching, position) {
  const { velocity = 50, movement = 50, control = 50, ovr = 50 } = pitching;
  const type = pitcherType(position);
  const pitches = [];

  // 1. 패스트볼 (항상)
  pitches.push({ id: "PITCH_FASTBALL", grade: velocityGrade(velocity) });

  // 2번째 구종
  const highMovement = movement >= 65;
  const highControl  = control  >= 65;

  if (highMovement && highControl) {
    // 양쪽 다 높으면 슬라이더 + 체인지업
    const movGrade = movement >= 75 ? 4 : movement >= 65 ? 3 : 2;
    const ctlGrade = control  >= 75 ? 4 : control  >= 65 ? 3 : 2;
    pitches.push({ id: "PITCH_SLIDER",   grade: movGrade });
    pitches.push({ id: "PITCH_CHANGEUP", grade: ctlGrade });
  } else if (highMovement) {
    const grade = movement >= 75 ? 4 : 3;
    // 선발은 스플리터, 불펜은 슬라이더 선호
    pitches.push({ id: type === "reliever" ? "PITCH_SLIDER" : "PITCH_SPLITTER", grade });
  } else if (highControl) {
    const grade = control >= 75 ? 4 : 3;
    // 선발은 커브, 불펜은 체인지업 선호
    pitches.push({ id: type === "reliever" ? "PITCH_CHANGEUP" : "PITCH_CURVE", grade });
  } else {
    // 평범한 투수 → 커브 grade 1
    pitches.push({ id: "PITCH_CURVE", grade: 1 });
  }

  // 3번째 구종 (OVR 70 이상)
  if (ovr >= 70 && pitches.length < 3) {
    const usedIds = new Set(pitches.map((p) => p.id));
    const candidates = ["PITCH_SLIDER", "PITCH_CHANGEUP", "PITCH_CURVE", "PITCH_SINKER", "PITCH_CUTTER"];
    const pick = candidates.find((id) => !usedIds.has(id));
    if (pick) {
      const grade = ovr >= 80 ? 3 : 2;
      pitches.push({ id: pick, grade });
    }
  }

  return pitches;
}

// ── 실행 ────────────────────────────────────────────────────
const idx    = readJson(IDX);
const allIds = Object.values(idx.byLeague ?? {}).flat().filter((id) => id.startsWith("PLY"));

let updated = 0, skipped = 0, missing = 0;

for (const id of allIds) {
  const fp = join(PLY_DIR, `${id}.json`);
  if (!existsSync(fp)) { missing++; continue; }

  const data   = readJson(fp);
  const player = data.details?.player;
  if (!player || player.playerType !== "pitcher") continue;
  if (player.pitches && player.pitches.length > 0) { skipped++; continue; }

  const pitches = generatePitches(player.pitching ?? {}, player.position ?? "SP");
  player.pitches = pitches;

  if (!DRY_RUN) {
    writeFileSync(fp, JSON.stringify(data, null, 2) + "\n", "utf8");
  }
  updated++;
}

console.log(DRY_RUN ? "[DRY RUN]" : "[완료]");
console.log(`  업데이트: ${updated}명`);
console.log(`  이미 있음: ${skipped}명 (유지)`);
if (missing > 0) console.log(`  파일 없음: ${missing}명`);
