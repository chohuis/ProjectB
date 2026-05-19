import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PLAYERS_DIR = path.join(ROOT, "resource/data/master/entities/players");
const INDEX_PATH = path.join(PLAYERS_DIR, "_index.json");
const REPORT_DIR = path.join(ROOT, "docs/reports");

const LEAGUE_ORDER = [
  "LEAGUE_HIGHSCHOOL",
  "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL",
  "LEAGUE_ABL",
  "LEAGUE_JBL",
];

const TARGET_RATIO_DEFAULT = {
  elite: 8,
  high: 20,
  mid: 45,
  low: 15,
  bottom: 12,
};

const TARGET_RATIO_BY_GROUP = {
  default: TARGET_RATIO_DEFAULT,
};

const TARGET_MEAN_BY_GROUP = {
  "LEAGUE_ABL::first": [77.5, 78.5],
  "LEAGUE_JBL::first": [75.5, 76.5],
  "LEAGUE_KBL::first": [73.0, 74.0],
  "LEAGUE_ABL::second": [69.0, 70.0],
  "LEAGUE_JBL::second": [66.5, 67.5],
  "LEAGUE_KBL::second": [64.0, 65.0],
  "LEAGUE_HIGHSCHOOL::single": [54.5, 55.5],
  "LEAGUE_UNIVERSITY::single": [59.5, 60.5],
  "LEAGUE_INDEPENDENT::single": [58.5, 59.5],
};

const RANK_CONSTRAINTS = [
  ["LEAGUE_ABL::first", ">", "LEAGUE_JBL::first"],
  ["LEAGUE_JBL::first", ">", "LEAGUE_KBL::first"],
  ["LEAGUE_ABL::second", ">", "LEAGUE_JBL::second"],
  ["LEAGUE_JBL::second", ">", "LEAGUE_KBL::second"],
];

function groupKey(leagueId, teamId) {
  if (leagueId === "LEAGUE_KBL" || leagueId === "LEAGUE_ABL" || leagueId === "LEAGUE_JBL") {
    if (/_1$/.test(teamId || "")) return `${leagueId}::first`;
    if (/_2$/.test(teamId || "")) return `${leagueId}::second`;
    return `${leagueId}::other`;
  }
  return `${leagueId}::single`;
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function std(values, m) {
  const v = values.reduce((a, b) => a + (b - m) * (b - m), 0) / values.length;
  return Math.sqrt(v);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function classifyByStats(v, m, s) {
  if (v >= m + s) return "elite";
  if (v >= m + 0.3 * s) return "high";
  if (v >= m - 0.3 * s) return "mid";
  if (v >= m - s) return "low";
  return "bottom";
}

function ratioFromCount(count, total) {
  if (total === 0) return 0;
  return +((count / total) * 100).toFixed(2);
}

function classifyByQuantileRanks(values, targetCounts) {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  const result = new Array(values.length);
  let cursor = 0;

  const fill = (count, label) => {
    for (let i = 0; i < count && cursor < indexed.length; i += 1, cursor += 1) {
      result[indexed[cursor].i] = label;
    }
  };

  fill(targetCounts.bottom, "bottom");
  fill(targetCounts.low, "low");
  fill(targetCounts.mid, "mid");
  fill(targetCounts.high, "high");
  fill(targetCounts.elite, "elite");

  while (cursor < indexed.length) {
    result[indexed[cursor].i] = "mid";
    cursor += 1;
  }
  return result;
}

function loadRows() {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  const rows = [];
  for (const leagueId of LEAGUE_ORDER) {
    const ids = index.byLeague?.[leagueId] ?? [];
    for (const id of ids) {
      const filePath = path.join(PLAYERS_DIR, `${id}.json`);
      if (!fs.existsSync(filePath)) continue;
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (raw.role !== "player") continue;
      const detail = raw.details?.player ?? {};
      const playerType = detail.playerType ?? "";
      const ovr = playerType === "pitcher" ? detail.pitching?.ovr : detail.batting?.ovr;
      if (typeof ovr !== "number") continue;
      rows.push({
        id: raw.id,
        filePath,
        leagueId,
        teamId: raw.teamId ?? "",
        group: groupKey(leagueId, raw.teamId ?? ""),
        playerType,
        ovr,
      });
    }
  }
  return rows;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function buildTargetCounts(total, ratio) {
  const base = {
    elite: Math.floor((total * ratio.elite) / 100),
    high: Math.floor((total * ratio.high) / 100),
    mid: Math.floor((total * ratio.mid) / 100),
    low: Math.floor((total * ratio.low) / 100),
  };
  base.bottom = Math.max(0, total - (base.elite + base.high + base.mid + base.low));

  const eliteMax = Math.floor((total * 8) / 100);
  if (base.elite > eliteMax) {
    const extra = base.elite - eliteMax;
    base.elite = eliteMax;
    base.mid += extra;
  }
  const sum = base.elite + base.high + base.mid + base.low + base.bottom;
  if (sum < total) base.mid += total - sum;
  if (sum > total) {
    const d = sum - total;
    base.mid = Math.max(0, base.mid - d);
  }
  return base;
}

function fillRange(count, start, end) {
  if (count <= 0) return [];
  if (count === 1) return [Math.round((start + end) / 2)];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    out.push(Math.round(start + (end - start) * t));
  }
  return out;
}

function buildTargetValues(total, targetMean, counts) {
  const m = targetMean;
  const ranges = {
    // Wider lower tail + denser center to reduce elite share under mean/std banding.
    bottom: [m - 28, m - 10],
    low: [m - 10, m - 4],
    mid: [m - 4, m + 4],
    high: [m + 4, m + 9],
    elite: [m + 9, m + 13],
  };
  const vals = [
    ...fillRange(counts.bottom, ranges.bottom[0], ranges.bottom[1]),
    ...fillRange(counts.low, ranges.low[0], ranges.low[1]),
    ...fillRange(counts.mid, ranges.mid[0], ranges.mid[1]),
    ...fillRange(counts.high, ranges.high[0], ranges.high[1]),
    ...fillRange(counts.elite, ranges.elite[0], ranges.elite[1]),
  ].map((v) => clamp(v, 18, 95));

  if (vals.length !== total) {
    while (vals.length < total) vals.push(clamp(Math.round(m), 18, 95));
    while (vals.length > total) vals.pop();
  }
  return vals.sort((a, b) => a - b);
}

function applyGroupRebalance(rows, groupSummary) {
  const byGroup = new Map();
  for (const row of rows) {
    if (!byGroup.has(row.group)) byGroup.set(row.group, []);
    byGroup.get(row.group).push(row);
  }

  const assignments = [];
  for (const s of groupSummary) {
    const groupRows = byGroup.get(s.group) ?? [];
    if (groupRows.length === 0) continue;
    const sorted = [...groupRows].sort((a, b) => a.ovr - b.ovr);
    const targetRatio = TARGET_RATIO_BY_GROUP[s.group] ?? TARGET_RATIO_BY_GROUP.default;
    const targetCounts = buildTargetCounts(sorted.length, targetRatio);
    const range = TARGET_MEAN_BY_GROUP[s.group];
    const targetMean = range ? (range[0] + range[1]) / 2 : s.ovr.mean;
    const targetValues = buildTargetValues(sorted.length, targetMean, targetCounts);

    for (let i = 0; i < sorted.length; i += 1) {
      const row = sorted[i];
      const nextOvr = targetValues[i];
      assignments.push({ ...row, from: row.ovr, to: nextOvr });
    }
  }
  return assignments;
}

function clampStat(v) {
  return clamp(Math.round(v), 20, 99);
}

function seeded01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function jitter(base, amp, seedBase, key) {
  const r = seeded01(`${seedBase}:${key}`);
  return base + (r * 2 - 1) * amp;
}

function syncPrimaryPitching(player, targetOvr, seedBase) {
  const base = targetOvr;
  player.pitching.ovr = clampStat(base);
  player.pitching.stamina = clampStat(jitter(base + 1.2, 5, seedBase, "stamina"));
  player.pitching.velocity = clampStat(jitter(base + 0.6, 6, seedBase, "velocity"));
  player.pitching.command = clampStat(jitter(base + 0.8, 5, seedBase, "command"));
  player.pitching.control = clampStat(jitter(base + 0.4, 5, seedBase, "control"));
  player.pitching.movement = clampStat(jitter(base + 0.2, 5, seedBase, "movement"));
  player.pitching.mentality = clampStat(jitter(base + 0.7, 5, seedBase, "mentality"));
  player.pitching.recovery = clampStat(jitter(base + 0.5, 5, seedBase, "recovery"));
  player.pitching.clutch = clampStat(jitter(Math.max(40, base - 6), 6, seedBase, "clutch"));
  player.pitching.holdRunners = clampStat(jitter(Math.max(38, base - 7), 6, seedBase, "holdRunners"));
}

function syncPrimaryBatting(player, targetOvr, seedBase) {
  const base = targetOvr;
  player.batting.ovr = clampStat(base);
  player.batting.contact = clampStat(jitter(base + 0.7, 6, seedBase, "contact"));
  player.batting.power = clampStat(jitter(base + 0.3, 6, seedBase, "power"));
  player.batting.eye = clampStat(jitter(base + 0.6, 6, seedBase, "eye"));
  player.batting.discipline = clampStat(jitter(base + 0.5, 6, seedBase, "discipline"));
  player.batting.speed = clampStat(jitter(base + 0.1, 7, seedBase, "speed"));
  player.batting.fielding = clampStat(jitter(base + 0.4, 6, seedBase, "fielding"));
  player.batting.arm = clampStat(jitter(base + 0.2, 6, seedBase, "arm"));
  player.batting.battingClutch = clampStat(jitter(Math.max(40, base - 5), 6, seedBase, "battingClutch"));
  player.batting.baseInstinct = clampStat(jitter(Math.max(40, base - 6), 6, seedBase, "baseInstinct"));
  player.batting.bunting = clampStat(jitter(Math.max(35, base - 10), 7, seedBase, "bunting"));
  player.batting.platoon = clampStat(jitter(Math.max(38, base - 8), 6, seedBase, "platoon"));
}

function syncSecondaryBatting(player, primaryOvr, seedBase) {
  const secondary = clamp(primaryOvr - 18, 22, 72);
  syncPrimaryBatting(player, secondary, `${seedBase}:secondaryBat`);
}

function syncSecondaryPitching(player, primaryOvr, seedBase) {
  const secondary = clamp(primaryOvr - 20, 20, 70);
  syncPrimaryPitching(player, secondary, `${seedBase}:secondaryPit`);
}

function writePlayerOvr(change) {
  const raw = JSON.parse(fs.readFileSync(change.filePath, "utf8"));
  const player = raw?.details?.player;
  if (!player) return;
  const seedBase = `${raw.id}:${raw.teamId ?? ""}`;

  if (change.playerType === "pitcher") {
    syncPrimaryPitching(player, change.to, `${seedBase}:P`);
    syncSecondaryBatting(player, change.to, `${seedBase}:B`);
  } else {
    syncPrimaryBatting(player, change.to, `${seedBase}:B`);
    syncSecondaryPitching(player, change.to, `${seedBase}:P`);
  }

  if (player.primaryPosition && player.positionRatings && player.positionRatings[player.primaryPosition] != null) {
    player.positionRatings[player.primaryPosition] = clampStat(change.to);
  }

  fs.writeFileSync(change.filePath, JSON.stringify(raw, null, 2) + "\n", "utf8");
}

function analyze(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.group)) grouped.set(row.group, []);
    grouped.get(row.group).push(row);
  }

  const result = [];
  for (const [group, list] of grouped.entries()) {
    const values = list.map((x) => x.ovr);
    const m = mean(values);
    const s = std(values, m);
    const sorted = [...values].sort((a, b) => a - b);
    const targetRatio = TARGET_RATIO_BY_GROUP[group] ?? TARGET_RATIO_BY_GROUP.default;
    const targetCounts = buildTargetCounts(values.length, targetRatio);
    const quantileLabels = classifyByQuantileRanks(values, targetCounts);
    const counts = { elite: 0, high: 0, mid: 0, low: 0, bottom: 0 };
    for (const label of quantileLabels) counts[label] += 1;
    result.push({
      group,
      players: list.length,
      ovr: {
        min: Math.min(...values),
        max: Math.max(...values),
        mean: +m.toFixed(2),
        std: +s.toFixed(2),
      },
      cuts: {
        p92: percentile(sorted, 92),
        p72: percentile(sorted, 72),
        p27: percentile(sorted, 27),
        p12: percentile(sorted, 12),
      },
      ratio: {
        elite: ratioFromCount(counts.elite, list.length),
        high: ratioFromCount(counts.high, list.length),
        mid: ratioFromCount(counts.mid, list.length),
        low: ratioFromCount(counts.low, list.length),
        bottom: ratioFromCount(counts.bottom, list.length),
      },
      targetRatio,
      targetCounts,
      targetMeanRange: TARGET_MEAN_BY_GROUP[group] ?? null,
    });
  }

  result.sort((a, b) => {
    const [la, ta] = a.group.split("::");
    const [lb, tb] = b.group.split("::");
    const lo = LEAGUE_ORDER.indexOf(la) - LEAGUE_ORDER.indexOf(lb);
    if (lo !== 0) return lo;
    const tOrder = { single: 1, first: 2, second: 3, other: 4 };
    return (tOrder[ta] ?? 99) - (tOrder[tb] ?? 99);
  });

  return result;
}

function validateRankConstraints(summary) {
  const byGroup = new Map(summary.map((r) => [r.group, r.ovr.mean]));
  const violations = [];
  for (const [left, op, right] of RANK_CONSTRAINTS) {
    const lv = byGroup.get(left);
    const rv = byGroup.get(right);
    if (typeof lv !== "number" || typeof rv !== "number") continue;
    if (op === ">" && !(lv > rv)) violations.push(`${left} (${lv}) must be > ${right} (${rv})`);
  }
  return violations;
}

function writeReport(summary) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const rankViolations = validateRankConstraints(summary);
  const out = {
    generatedAt,
    mode: "phase2-dryrun",
    policy: {
      targetRatio: TARGET_RATIO_DEFAULT,
      targetMeanByGroup: TARGET_MEAN_BY_GROUP,
      rankConstraints: RANK_CONSTRAINTS,
    },
    rankViolations,
    groups: summary,
  };

  const jsonPath = path.join(REPORT_DIR, "ovr_rebalance_phase2_targets_dryrun.json");
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), "utf8");

  const lines = [];
  lines.push("# OVR Rebalance Phase 2 Target Dry-Run");
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  if (rankViolations.length > 0) {
    lines.push("## Rank Constraint Violations");
    for (const v of rankViolations) lines.push(`- ${v}`);
    lines.push("");
  }
  lines.push("| Group | Players | Mean | Std | Elite% | High% | Mid% | Low% | Bottom% | Target Mean |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const r of summary) {
    const target = r.targetMeanRange ? `${r.targetMeanRange[0]}~${r.targetMeanRange[1]}` : "-";
    lines.push(
      `| ${r.group} | ${r.players} | ${r.ovr.mean} | ${r.ovr.std} | ${r.ratio.elite} | ${r.ratio.high} | ${r.ratio.mid} | ${r.ratio.low} | ${r.ratio.bottom} | ${target} |`
    );
  }
  const mdPath = path.join(REPORT_DIR, "ovr_rebalance_phase2_targets_dryrun.md");
  fs.writeFileSync(mdPath, lines.join("\n") + "\n", "utf8");

  return { jsonPath, mdPath, rankViolations };
}

function main() {
  const mode = process.argv.includes("--apply") ? "apply" : "dry-run";
  const rows = loadRows();
  const summary = analyze(rows);
  let appliedChanges = [];
  if (mode === "apply") {
    appliedChanges = applyGroupRebalance(rows, summary);
    for (const c of appliedChanges) writePlayerOvr(c);
  }

  const afterSummary = mode === "apply" ? analyze(loadRows()) : summary;
  const report = writeReport(afterSummary);
  console.log(`[rebalance] mode=${mode}`);
  console.log(`[rebalance] groups=${afterSummary.length}, players=${rows.length}`);
  console.log(`[rebalance] report=${report.jsonPath}`);
  console.log(`[rebalance] report=${report.mdPath}`);
  if (mode === "apply") {
    const ovrOnlyChanged = appliedChanges.filter((c) => c.from !== c.to).length;
    console.log(`[rebalance] assignments=${appliedChanges.length}`);
    console.log(`[rebalance] ovr_changed=${ovrOnlyChanged}`);
  }
  if (report.rankViolations.length > 0) {
    console.log("[rebalance] rank violations detected:");
    for (const v of report.rankViolations) console.log(`  - ${v}`);
  } else {
    console.log("[rebalance] rank constraints: ok");
  }
}

main();
