/**
 * generate-pitch-repertoire.mjs
 * 투수 PLY JSON에 pitches 배열 생성
 *
 * - 이미 pitches가 있는 파일은 건너뜀
 * - SP: 3~5구종, RP: 2~3구종, CP: 2구종
 * - 스탯 기반 자격 판정 + 랜덤 선택으로 개성 부여
 * - 숙련도(grade): 관련 스탯 수치 기반 1~5
 *
 * 실행: node scripts/generate-pitch-repertoire.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAYERS_DIR = resolve(__dirname, "../resource/data/master/entities/players");

// ── 구종 카탈로그 ──────────────────────────────────────────────
// threshold: 해당 스탯이 이 값 이상이면 자격 부여
// relaxed:   threshold - relaxed 이상이면 50% 확률로 자격 부여 (경계 유연성)
// gradeKey:  숙련도 계산에 쓸 스탯
const CATALOG = [
  { id: "PITCH_FASTBALL",    gradeKey: "velocity",  threshold: 0,  relaxed: 0,  alwaysInclude: true },
  { id: "PITCH_SINKER",      gradeKey: "movement",  threshold: 50, relaxed: 5  },
  { id: "PITCH_CUTTER",      gradeKey: "command",   threshold: 55, relaxed: 5  },
  { id: "PITCH_SLIDER",      gradeKey: "command",   threshold: 52, relaxed: 5  },
  { id: "PITCH_CURVE",       gradeKey: "movement",  threshold: 52, relaxed: 5  },
  { id: "PITCH_CHANGEUP",    gradeKey: "mentality", threshold: 50, relaxed: 5  },
  { id: "PITCH_SPLITTER",    gradeKey: "control",   threshold: 55, relaxed: 5  },
  { id: "PITCH_FORKBALL",    gradeKey: "control",   threshold: 58, relaxed: 5  },
  { id: "PITCH_SCREWBALL",   gradeKey: "movement",  threshold: 60, relaxed: 0, extra: (pit) => pit.command >= 55 },
  { id: "PITCH_KNUCKLEBALL", gradeKey: "command",   threshold: 65, relaxed: 0  },
];

// ── 포지션별 구종 수 범위 ──────────────────────────────────────
const PITCH_COUNT = {
  SP: [3, 5],
  RP: [2, 3],
  CP: [2, 2],
};

// ── 숙련도: 관련 스탯 → 1~5 ───────────────────────────────────
function calcGrade(statVal) {
  if (statVal >= 75) return 5;
  if (statVal >= 65) return 4;
  if (statVal >= 55) return 3;
  if (statVal >= 45) return 2;
  return 1;
}

// ── 시드 기반 결정론적 난수 (파일명 기반) ─────────────────────
function seededRand(seed, index) {
  const x = Math.sin(seed * 9301 + index * 49297 + 233720) * 46656;
  return Math.abs(x) % 1;
}

function generatePitches(pit, position, seed) {
  const [minCount, maxCount] = PITCH_COUNT[position] ?? [2, 3];

  // 자격 있는 구종 목록 수집
  const eligible = [];
  for (const entry of CATALOG) {
    if (entry.alwaysInclude) continue;
    const statVal = pit[entry.gradeKey] ?? 50;
    if (statVal >= entry.threshold) {
      if (entry.extra && !entry.extra(pit)) continue;
      eligible.push({ ...entry, statVal });
    } else if (statVal >= entry.threshold - entry.relaxed) {
      // 경계 구종: 50% 확률
      if (seededRand(seed, eligible.length + 100) < 0.5) {
        if (entry.extra && !entry.extra(pit)) continue;
        eligible.push({ ...entry, statVal });
      }
    }
  }

  // 자격 구종을 시드 기반으로 셔플
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(seededRand(seed, i) * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  // 구종 수 결정 (범위 내 랜덤)
  const targetCount = minCount + Math.floor(seededRand(seed, 999) * (maxCount - minCount + 1));

  // 패스트볼 + 선택된 구종 조합
  const fastballEntry = CATALOG[0];
  const pitches = [
    { id: fastballEntry.id, grade: calcGrade(pit[fastballEntry.gradeKey] ?? 50) },
  ];

  for (const entry of eligible.slice(0, targetCount - 1)) {
    pitches.push({ id: entry.id, grade: calcGrade(entry.statVal) });
  }

  return pitches;
}

// ── 실행 ──────────────────────────────────────────────────────
const files = readdirSync(PLAYERS_DIR)
  .filter((f) => f.startsWith("PLY_") && f.endsWith(".json"))
  .map((f) => join(PLAYERS_DIR, f));

let generated = 0;
let skipped = 0;

for (const file of files) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const player = data.details?.player;
  if (!player || player.playerType !== "pitcher") continue;
  if (player.pitches) { skipped++; continue; }

  const pit = player.pitching ?? {};
  const position = player.position ?? "RP";
  // 파일명에서 숫자 추출해서 시드로 사용
  const seed = parseInt(file.replace(/\D/g, "").slice(-5)) || 1;

  player.pitches = generatePitches(pit, position, seed);
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  generated++;
}

console.log(`완료: ${generated}개 생성, ${skipped}개 건너뜀`);

// ── 샘플 출력 ──────────────────────────────────────────────────
console.log("\n샘플 (처음 5명):");
let shown = 0;
for (const file of files) {
  if (shown >= 5) break;
  const data = JSON.parse(readFileSync(file, "utf8"));
  const player = data.details?.player;
  if (!player || player.playerType !== "pitcher") continue;
  const pitchList = (player.pitches ?? []).map((p) => `${p.id.replace("PITCH_","")}(${p.grade})`).join(", ");
  console.log(`  ${data.name} [${player.position}] : ${pitchList}`);
  shown++;
}
