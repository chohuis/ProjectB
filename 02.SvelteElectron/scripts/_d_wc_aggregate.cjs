"use strict";
// D 계측 집계 — resource/logs/d-weekly-choices/raw-*.json 을 표로 뭉친다 (일회성 스크립트)
const fs = require("node:fs");
const path = require("node:path");
const DIR = path.join(process.cwd(), "resource/logs/d-weekly-choices");

const files = {
  univ: "raw-univ.json",
  pro: "raw-pro.json",
  mil: "raw-mil.json",
  indieA: "raw-indie-overseas-mislabel.json",
  indieB: "raw-indie-landed-profarm.json",
};
const runs = {};
for (const [k, f] of Object.entries(files)) {
  runs[k] = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
}

// stageKey -> list of {report, weight(=weeks)}
const collected = {}; // stageKey -> [reportObj,...]
function add(stageKey, r) {
  if (!collected[stageKey]) collected[stageKey] = [];
  collected[stageKey].push(r);
}
for (const [runKey, d] of Object.entries(runs)) {
  for (const [sk, r] of Object.entries(d.report)) {
    add(sk, r);
  }
}

function weightedAvg(list, field, weightField = "weeks") {
  let sw = 0, sv = 0;
  for (const r of list) { sw += r[weightField]; sv += r[field] * r[weightField]; }
  return sw ? sv / sw : 0;
}
function sumPools(list) {
  const out = {};
  for (const r of list) {
    for (const [pid, n] of Object.entries(r.poolSums || {})) out[pid] = (out[pid] || 0) + n;
  }
  return out;
}

const FINAL_ORDER = ["hs_g1", "hs_g2", "hs_g3", "university", "independent", "pro_top", "pro_farm", "military"];
const LABELS = {
  hs_g1: "고교 1학년", hs_g2: "고교 2학년", hs_g3: "고교 3학년",
  university: "대학", independent: "독립", pro_top: "프로 1군",
  pro_farm: "2군(해외 2군 표본)", military: "군(옛 갈래)",
};

const rows = [];
for (const sk of FINAL_ORDER) {
  const list = collected[sk];
  if (!list) continue;
  const totalWeeks = list.reduce((s, r) => s + r.weeks, 0);
  const runsN = list.length;
  const avgEvent = weightedAvg(list, "avgEventChoice");
  const avgSystem = weightedAvg(list, "avgSystemChoice");
  const avgReadonly = weightedAvg(list, "avgReadonly");
  const stalledRatio = weightedAvg(list, "stalledRatio");
  const maxChoice = Math.max(...list.map((r) => r.maxChoice));
  rows.push({
    stageKey: sk, label: LABELS[sk], runs: runsN, weeksTotal: totalWeeks,
    avgEvent, avgSystem, avgReadonly, stalledRatio, maxChoice,
  });
}

// 레인별 전체 평균 — 최종 표의 무대 행(중복 제거된 hs_g1/2/3 포함)을 주 수로 가중 평균
const laneRows = FINAL_ORDER.filter((sk) => collected[sk]).map((sk) => collected[sk]);
function laneWeightedAvg(field) {
  let sw = 0, sv = 0;
  for (const list of laneRows) {
    // 무대별 대표값 = 그 무대의 run별 평균(가중), 가중치는 무대의 총 주수(러닝 총합, hs 중복 방지 위해 러닝 평균 하나로 취급)
    const w = list.reduce((s, r) => s + r.weeks, 0) / list.length; // 무대당 평균 표본 주수(중복계산 방지)
    const v = weightedAvg(list, field);
    sw += w; sv += v * w;
  }
  return sw ? sv / sw : 0;
}
const laneMandatory = laneWeightedAvg("avgMandatory");
const laneConditional = laneWeightedAvg("avgConditional");
const laneUrgent = laneWeightedAvg("avgUrgent");
const laneRandom = laneWeightedAvg("avgRandom");

// 풀별 — 무대마다 poolSums 합, 무대 대표 주수로 나눈 뒤 무대 간 가중평균
const poolIds = ["POOL_BODY_DAILY", "POOL_MEDIA_DAILY", "POOL_SOCIAL_DAILY", "POOL_TEAM_LIFE_DAILY", "POOL_TRAIN_DAILY"];
const poolAvg = {};
for (const pid of poolIds) {
  let sw = 0, sv = 0;
  for (const sk of FINAL_ORDER) {
    const list = collected[sk];
    if (!list) continue;
    const w = list.reduce((s, r) => s + r.weeks, 0) / list.length;
    let sumP = 0, sumW = 0;
    for (const r of list) { sumP += (r.poolSums[pid] || 0); sumW += r.weeks; }
    const rate = sumW ? sumP / sumW : 0;
    sw += w; sv += rate * w;
  }
  poolAvg[pid] = sw ? sv / sw : 0;
}

console.log("=== 표 ===");
console.log("무대 | 표본판수 | 주수(합) | 선택지 있는 소식/주(이벤트/시스템) | 읽기만/주 | 멈춘주비율 | 최대선택");
for (const r of rows) {
  console.log(`${r.label} | ${r.runs} | ${r.weeksTotal} | ${r.avgEvent.toFixed(2)}/${r.avgSystem.toFixed(2)} | ${r.avgReadonly.toFixed(2)} | ${(r.stalledRatio*100).toFixed(1)}% | ${r.maxChoice}`);
}
console.log("");
console.log("=== 레인별 주당 평균 (무대 가중평균) ===");
console.log("conditional:", laneConditional.toFixed(3));
console.log("mandatory:", laneMandatory.toFixed(3));
console.log("urgent:", laneUrgent.toFixed(3));
console.log("random(합):", laneRandom.toFixed(3));
for (const pid of poolIds) console.log(`  ${pid}:`, poolAvg[pid].toFixed(3));

fs.writeFileSync(path.join(DIR, "final-table.json"), JSON.stringify({ rows, lane: { laneMandatory, laneConditional, laneUrgent, laneRandom, poolAvg } }, null, 2));
