/**
 * 30-season DB performance verification script.
 * Simulates 30 seasons of NPC stat writes and measures query latency.
 *
 * Usage: node scripts/db-perf.mjs
 */
import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB_PATH = join(tmpdir(), `projectb_perf_${Date.now()}.db`);
const SEASONS  = 30;
const NPC_COUNT = 800;
const LEAGUES   = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_UNIV", "LEAGUE_IND"];
const THRESHOLDS_MS = { bulkInsert: 5000, seasonQuery: 50, careerQuery: 20, archiveQuery: 10 };

function makeDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS npc_season_stats (
      slot_id TEXT NOT NULL, npc_id TEXT NOT NULL, season INTEGER NOT NULL,
      league_id TEXT NOT NULL DEFAULT '', role TEXT NOT NULL,
      games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
      saves INTEGER NOT NULL DEFAULT 0, holds INTEGER NOT NULL DEFAULT 0,
      ip REAL NOT NULL DEFAULT 0, er INTEGER NOT NULL DEFAULT 0, hits_allowed INTEGER NOT NULL DEFAULT 0,
      strikeouts INTEGER NOT NULL DEFAULT 0, walks INTEGER NOT NULL DEFAULT 0, pitch_count INTEGER NOT NULL DEFAULT 0,
      at_bats INTEGER NOT NULL DEFAULT 0, hits INTEGER NOT NULL DEFAULT 0, home_runs INTEGER NOT NULL DEFAULT 0,
      rbi INTEGER NOT NULL DEFAULT 0, walks_bat INTEGER NOT NULL DEFAULT 0,
      strikeouts_bat INTEGER NOT NULL DEFAULT 0, stolen_bases INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, npc_id, season, league_id)
    );
    CREATE INDEX IF NOT EXISTS idx_nss_player ON npc_season_stats(slot_id, npc_id);

    CREATE TABLE IF NOT EXISTS npc_career_arc (
      slot_id TEXT NOT NULL, npc_id TEXT NOT NULL,
      retired_season INTEGER NOT NULL, peak_ovr INTEGER NOT NULL DEFAULT 0,
      career_war REAL NOT NULL DEFAULT 0, stat_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (slot_id, npc_id)
    );
    CREATE INDEX IF NOT EXISTS idx_nca_slot ON npc_career_arc(slot_id, retired_season DESC);
  `);
  return db;
}

function ms(label, fn) {
  const t0 = performance.now();
  const result = fn();
  const elapsed = performance.now() - t0;
  const limit = THRESHOLDS_MS[label];
  const ok = elapsed <= limit;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${elapsed.toFixed(1)} ms (limit ${limit} ms)`);
  if (!ok) process.exitCode = 1;
  return result;
}

function main() {
  const db = makeDb();
  const slotId = "perf_slot";
  const npcIds = Array.from({ length: NPC_COUNT }, (_, i) => `NPC_${String(i).padStart(4, "0")}`);

  console.log(`\n[db-perf] ${SEASONS} seasons × ${NPC_COUNT} NPCs × ${LEAGUES.length} leagues`);

  // ── Bulk insert: 30 seasons of season stats ─────────────────
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO npc_season_stats
      (slot_id, npc_id, season, league_id, role, games, wins, losses, ip, er,
       hits_allowed, strikeouts, walks, at_bats, hits, home_runs, rbi)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const bulkInsert = db.transaction(() => {
    for (let season = 2026; season < 2026 + SEASONS; season++) {
      for (const lid of LEAGUES) {
        for (const npcId of npcIds) {
          const isPitcher = npcId.charCodeAt(4) % 2 === 0;
          if (isPitcher) {
            stmt.run(slotId, npcId, season, lid, "pitcher",
              30, 12, 10, 180.0, 60, 150, 160, 50, 0, 0, 0, 0);
          } else {
            stmt.run(slotId, npcId, season, lid, "batter",
              130, 0, 0, 0, 0, 0, 0, 0, 480, 135, 20, 75);
          }
        }
      }
    }
  });

  ms("bulkInsert", () => bulkInsert());

  // ── Season stats query for one NPC ──────────────────────────
  const targetNpc = npcIds[Math.floor(NPC_COUNT / 2)];
  ms("careerQuery", () =>
    db.prepare("SELECT * FROM npc_season_stats WHERE slot_id = ? AND npc_id = ? ORDER BY season ASC")
      .all(slotId, targetNpc)
  );

  // ── Season-wide leaderboard query ───────────────────────────
  ms("seasonQuery", () =>
    db.prepare(`
      SELECT npc_id, SUM(wins) as w, SUM(losses) as l, SUM(ip) as ip, SUM(strikeouts) as k
      FROM npc_season_stats
      WHERE slot_id = ? AND season = ? AND role = 'pitcher'
      GROUP BY npc_id ORDER BY w DESC LIMIT 20
    `).all(slotId, 2040)
  );

  // ── Insert and query npc_career_arc ─────────────────────────
  const arcStmt = db.prepare(`
    INSERT OR REPLACE INTO npc_career_arc (slot_id, npc_id, retired_season, peak_ovr, career_war, stat_json)
    VALUES (?,?,?,?,?,?)
  `);
  const retiredCount = Math.floor(NPC_COUNT * 0.3);
  db.transaction(() => {
    for (let i = 0; i < retiredCount; i++) {
      arcStmt.run(slotId, npcIds[i], 2026 + Math.floor(i / 30), 80 + (i % 20), i * 0.8, "{}");
    }
  })();

  ms("archiveQuery", () =>
    db.prepare("SELECT * FROM npc_career_arc WHERE slot_id = ? ORDER BY retired_season DESC, peak_ovr DESC LIMIT 50")
      .all(slotId)
  );

  db.close();
  try { rmSync(DB_PATH); } catch {}

  console.log(`\n[db-perf] done — exit code ${process.exitCode ?? 0}\n`);
}

main();
