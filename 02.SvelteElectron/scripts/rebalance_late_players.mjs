/**
 * rebalance_late_players.mjs
 * 후기생성 선수(PLY_02882~) OVR 전면 재조정 스크립트
 *
 * 사용법:
 *   node scripts/rebalance_late_players.mjs           # dry-run (변경 없이 리포트만)
 *   node scripts/rebalance_late_players.mjs --apply   # 실 적용
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLY_DIR = path.join(__dirname, '../resource/data/master/entities/players');
const EARLY_MAX_ID = 2881; // 초기생성 상한
const DRY_RUN = !process.argv.includes('--apply');

// ─── 목표 OVR 범위 정의 ────────────────────────────────────────────
// { min, max } 로 정의. linear remap 적용.
const TARGETS = {
  LEAGUE_HIGHSCHOOL: {
    // grade=1, entry_year 미래 선수 전체. 초기생성 1학년 avg~45, max 58 기준.
    default: { min: 27, max: 62 },
  },
  LEAGUE_UNIVERSITY: {
    '0-2': { min: 45, max: 70 },
    '3-5': { min: 52, max: 73 },
    '6-9': { min: 55, max: 75 },
    '10+': { min: 58, max: 78 },
  },
  LEAGUE_ABL: {
    '0-2': { min: 48, max: 74 },
    '3-5': { min: 54, max: 80 },
    '6-9': { min: 57, max: 85 },
    '10+': { min: 62, max: 91 },
  },
  LEAGUE_JBL: {
    '0-2': { min: 45, max: 74 },
    '3-5': { min: 54, max: 78 },
    '6-9': { min: 57, max: 83 },
    '10+': { min: 62, max: 89 },
  },
};

// 투수 서브스탯 필드 (ovr 제외)
const PITCH_SUB = ['stamina', 'velocity', 'command', 'control', 'movement', 'mentality', 'recovery', 'clutch', 'holdRunners'];
// 타자 서브스탯 필드 (ovr 제외)
const BAT_SUB   = ['contact', 'power', 'eye', 'discipline', 'speed', 'fielding', 'arm', 'battingClutch', 'baseInstinct', 'bunting', 'platoon'];

// ─── 유틸 ─────────────────────────────────────────────────────────
function svcTier(s) {
  if (s <= 2)  return '0-2';
  if (s <= 5)  return '3-5';
  if (s <= 9)  return '6-9';
  return '10+';
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** OVR을 [srcMin~srcMax] → [dstMin~dstMax] 로 linear remap, 정수 반환 */
function remap(ovr, srcMin, srcMax, dstMin, dstMax) {
  if (srcMax === srcMin) return Math.round((dstMin + dstMax) / 2);
  const t = (ovr - srcMin) / (srcMax - srcMin);
  return clamp(Math.round(dstMin + t * (dstMax - dstMin)), dstMin, dstMax);
}

/** 서브스탯을 OVR 변화 비율로 스케일 */
function scaleSubStat(val, oldOvr, newOvr) {
  if (oldOvr === 0) return val;
  return clamp(Math.round(val * (newOvr / oldOvr)), 20, 99);
}

function getOvr(dp) {
  if (dp?.playerType === 'pitcher') return dp.pitching?.ovr ?? null;
  if (dp?.playerType === 'batter')  return dp.batting?.ovr ?? null;
  return null;
}

function getPlyNum(filename) {
  return parseInt(filename.replace('PLY_', '').replace('.json', ''), 10);
}

// ─── 대상 파일 수집 ────────────────────────────────────────────────
const allFiles = fs.readdirSync(PLY_DIR)
  .filter(f => f.startsWith('PLY_') && f.endsWith('.json'))
  .filter(f => getPlyNum(f) > EARLY_MAX_ID);

// ─── Pass 1: 그룹별 현재 OVR min/max 수집 ─────────────────────────
// key: "LEAGUE_ABL|3-5" 등
const groupOvrs = {};

for (const file of allFiles) {
  try {
    const raw = fs.readFileSync(path.join(PLY_DIR, file), 'utf-8');
    const pl  = JSON.parse(raw);
    const league = pl.leagueId;
    if (!TARGETS[league]) continue;

    const dp  = pl.details?.player;
    const ovr = getOvr(dp);
    if (ovr === null) continue;

    const svc  = dp?.proServiceYears ?? 0;
    const tier = (league === 'LEAGUE_HIGHSCHOOL') ? 'default' : svcTier(svc);
    const key  = `${league}|${tier}`;

    if (!groupOvrs[key]) groupOvrs[key] = { ovrs: [], league, tier };
    groupOvrs[key].ovrs.push(ovr);
  } catch (_) {}
}

// 그룹별 현재 min/max 계산
const groupStats = {};
for (const [key, g] of Object.entries(groupOvrs)) {
  groupStats[key] = {
    srcMin: Math.min(...g.ovrs),
    srcMax: Math.max(...g.ovrs),
    count: g.ovrs.length,
    avgBefore: g.ovrs.reduce((a,b)=>a+b,0) / g.ovrs.length,
  };
}

// ─── Pass 2: 파일 수정 ────────────────────────────────────────────
const report = {}; // key → { before: [], after: [] }

let processedCount = 0;
let changedCount   = 0;

for (const file of allFiles) {
  try {
    const filePath = path.join(PLY_DIR, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const pl  = JSON.parse(raw);
    const league = pl.leagueId;
    if (!TARGETS[league]) continue;

    const dp  = pl.details?.player;
    if (!dp) continue;
    const oldOvr = getOvr(dp);
    if (oldOvr === null) continue;

    const svc  = dp?.proServiceYears ?? 0;
    const tier = (league === 'LEAGUE_HIGHSCHOOL') ? 'default' : svcTier(svc);
    const key  = `${league}|${tier}`;

    const target = TARGETS[league][tier];
    if (!target) continue;

    const { srcMin, srcMax } = groupStats[key];
    const newOvr = remap(oldOvr, srcMin, srcMax, target.min, target.max);
    const ratio  = oldOvr > 0 ? newOvr / oldOvr : 1;

    if (!report[key]) report[key] = { before: [], after: [], league, tier };
    report[key].before.push(oldOvr);
    report[key].after.push(newOvr);

    processedCount++;
    if (newOvr === oldOvr) continue;
    changedCount++;

    if (DRY_RUN) continue; // dry-run 이면 파일 미수정

    // 실 적용: ovr + 서브스탯 스케일
    if (dp.playerType === 'pitcher' && dp.pitching) {
      dp.pitching.ovr = newOvr;
      for (const f of PITCH_SUB) {
        if (typeof dp.pitching[f] === 'number')
          dp.pitching[f] = scaleSubStat(dp.pitching[f], oldOvr, newOvr);
      }
    } else if (dp.playerType === 'batter' && dp.batting) {
      dp.batting.ovr = newOvr;
      for (const f of BAT_SUB) {
        if (typeof dp.batting[f] === 'number')
          dp.batting[f] = scaleSubStat(dp.batting[f], oldOvr, newOvr);
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(pl, null, 2), 'utf-8');
  } catch (_) {}
}

// ─── 리포트 출력 ───────────────────────────────────────────────────
const LBL = {
  LEAGUE_HIGHSCHOOL: '고교', LEAGUE_UNIVERSITY: '대학',
  LEAGUE_KBL: 'KBL', LEAGUE_ABL: 'ABL', LEAGUE_JBL: 'JBL',
};
function avg(a) { return a.length ? (a.reduce((x,y)=>x+y,0)/a.length).toFixed(1) : '-'; }

console.log('\n' + '═'.repeat(72));
console.log(`  OVR 재조정 ${DRY_RUN ? '[DRY-RUN — 파일 미수정]' : '[실 적용 완료]'}`);
console.log('═'.repeat(72));

const ORDER = [
  'LEAGUE_HIGHSCHOOL|default',
  'LEAGUE_UNIVERSITY|0-2','LEAGUE_UNIVERSITY|3-5','LEAGUE_UNIVERSITY|6-9','LEAGUE_UNIVERSITY|10+',
  'LEAGUE_ABL|0-2','LEAGUE_ABL|3-5','LEAGUE_ABL|6-9','LEAGUE_ABL|10+',
  'LEAGUE_JBL|0-2','LEAGUE_JBL|3-5','LEAGUE_JBL|6-9','LEAGUE_JBL|10+',
];

let lastLeague = '';
for (const key of ORDER) {
  const r = report[key];
  if (!r) continue;
  const [league, tier] = key.split('|');
  if (league !== lastLeague) {
    console.log(`\n▶ ${LBL[league] || league}`);
    console.log(`  ${'그룹'.padEnd(10)} ${'수'.padStart(5)} ${'전avg'.padStart(7)} ${'전범위'.padStart(9)} ${'후avg'.padStart(7)} ${'후범위'.padStart(9)} ${'차이'.padStart(6)} ${'목표범위'.padStart(10)}`);
    console.log('  ' + '─'.repeat(68));
    lastLeague = league;
  }
  const target = TARGETS[league]?.[tier];
  const tRange = target ? `${target.min}~${target.max}` : '-';
  const bMin = Math.min(...r.before), bMax = Math.max(...r.before);
  const aMin = Math.min(...r.after),  aMax = Math.max(...r.after);
  const diff = (parseFloat(avg(r.after)) - parseFloat(avg(r.before))).toFixed(1);
  const sign = parseFloat(diff) > 0 ? '+' : '';
  console.log(
    `  ${(tier === 'default' ? '전체' : tier + '년').padEnd(10)}` +
    `${String(r.before.length).padStart(5)}` +
    `${avg(r.before).padStart(7)}` +
    `${(bMin+'~'+bMax).padStart(9)}` +
    `${avg(r.after).padStart(7)}` +
    `${(aMin+'~'+aMax).padStart(9)}` +
    `${(sign+diff).padStart(6)}` +
    `${tRange.padStart(10)}`
  );
}

console.log(`\n  처리: ${processedCount}명  변경: ${changedCount}명  변경없음: ${processedCount - changedCount}명`);
if (DRY_RUN) {
  console.log('\n  ※ 실 적용하려면: node scripts/rebalance_late_players.mjs --apply');
}
console.log('═'.repeat(72) + '\n');
