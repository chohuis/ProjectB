/**
 * fix-pitcher-pitches.mjs
 * 기존 데이터의 투수 구종 수/등급 재조정
 *
 * 대상: 전 구종 동일 grade이거나 4개 이상 구종을 가진 투수 (기존 일괄 생성 패턴)
 * 방침:
 *   - 기존 구종 ID 유지 (어떤 구종 던지는지는 보존), count·grade만 조정
 *   - 구종 수 상한: OVR 기반 (55미만=1, 55~64=2, 65~74=2~3, 75~84=3, 85+=3~4)
 *   - 등급 상한: OVR 기반 (55미만 max2, 55~64 max3, 65~74 max4, 75+ max5)
 *   - 구종 간 차등: 주구종 velocity 기반, 2번째 -1~2, 3번째 -1
 *   - 패스트볼 없으면 1번째로 추가
 *
 * 실행: node scripts/fix-pitcher-pitches.mjs [--dry-run]
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

// OVR 기반 최대 구종 수
function maxPitchCount(ovr) {
  if (ovr >= 85) return 4;
  if (ovr >= 75) return 3;
  if (ovr >= 65) return 3; // 2~3, 아래에서 랜덤
  if (ovr >= 55) return 2;
  return 1;
}

// OVR + 슬롯 기반 grade 상한
function gradeCapForSlot(ovr, slot) {
  // slot: 0=주구종, 1=2번째, 2=3번째
  const caps = (() => {
    if (ovr >= 85) return [5, 5, 4];
    if (ovr >= 75) return [5, 4, 3];
    if (ovr >= 65) return [4, 3, 2];
    if (ovr >= 55) return [3, 2, 1];
    return [2, 1, 1];
  })();
  return caps[slot] ?? 1;
}

// velocity → 주구종 grade (OVR cap 적용 전 기본값)
function velocityGrade(vel) {
  if (vel >= 80) return 5;
  if (vel >= 70) return 4;
  if (vel >= 60) return 3;
  if (vel >= 50) return 2;
  return 1;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function shouldFix(pitches) {
  if (!pitches || pitches.length === 0) return false;
  // 4구종 이상이거나 전 구종 동일 grade인 경우
  if (pitches.length >= 4) return true;
  if (pitches.length >= 2 && pitches.every(p => p.grade === pitches[0].grade)) return true;
  return false;
}

function fixPitches(pitching, existingPitches) {
  const ovr = pitching?.ovr ?? 50;
  const vel = pitching?.velocity ?? 50;
  const mov = pitching?.movement ?? 50;
  const ctl = pitching?.control ?? 50;

  // 기존 구종 ID 목록 (패스트볼 우선 정렬)
  let ids = existingPitches.map(p => p.id);
  // 패스트볼 없으면 앞에 추가
  if (!ids.includes("PITCH_FASTBALL")) {
    ids = ["PITCH_FASTBALL", ...ids];
  } else {
    // 패스트볼을 맨 앞으로
    ids = ["PITCH_FASTBALL", ...ids.filter(id => id !== "PITCH_FASTBALL")];
  }

  // 이 선수가 가질 수 있는 구종 수 결정
  let count = maxPitchCount(ovr);
  // OVR 65~74는 2~3 중 결정: movement 높으면 3개
  if (ovr >= 65 && ovr < 75) {
    count = (mov >= 65 || ctl >= 65) ? 3 : 2;
  }
  count = Math.min(count, ids.length);

  // 슬롯별 grade 계산
  const result = [];
  for (let slot = 0; slot < count; slot++) {
    const id = ids[slot];
    const cap = gradeCapForSlot(ovr, slot);

    let grade;
    if (slot === 0) {
      // 주구종: velocity 기반
      grade = clamp(velocityGrade(vel), 1, cap);
    } else if (slot === 1) {
      // 2번째: 주구종보다 1~2 낮음, mov/ctl 기반 상단 보정
      const base = result[0].grade - (mov >= 70 ? 1 : 2);
      grade = clamp(base, 1, cap);
    } else {
      // 3번째: 2번째보다 1 낮음
      const base = result[1].grade - 1;
      grade = clamp(base, 1, cap);
    }

    result.push({ id, grade });
  }

  return result;
}

// ── 실행 ────────────────────────────────────────────────────
const idx    = readJson(IDX);
const allIds = Object.values(idx.byLeague ?? {}).flat().filter(id => id.startsWith("PLY"));

let fixed = 0, skipped = 0, missing = 0;

for (const id of allIds) {
  const fp = join(PLY_DIR, `${id}.json`);
  if (!existsSync(fp)) { missing++; continue; }

  const data   = readJson(fp);
  const player = data.details?.player;
  if (!player || player.playerType !== "pitcher") continue;

  const pitches = player.pitches ?? [];
  if (!shouldFix(pitches)) { skipped++; continue; }

  const newPitches = fixPitches(player.pitching, pitches);

  if (!DRY_RUN) {
    player.pitches = newPitches;
    writeFileSync(fp, JSON.stringify(data, null, 2) + "\n", "utf8");
  }
  fixed++;
}

console.log(DRY_RUN ? "[DRY RUN]" : "[완료]");
console.log(`  재조정: ${fixed}명`);
console.log(`  건너뜀 (정상): ${skipped}명`);
if (missing > 0) console.log(`  파일 없음: ${missing}명`);
