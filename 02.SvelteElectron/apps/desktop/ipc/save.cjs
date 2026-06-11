"use strict";

function register(ipcMain, { db, dbListSlots, dbLoadSlot, dbSaveSlot, signSlot, verifySlot, DEFAULT_SLOT_ID, loadCoreModule }) {
  ipcMain.handle("game:load", () => {
    const data = dbLoadSlot(db, DEFAULT_SLOT_ID);
    if (data) {
      const v = verifySlot(db, DEFAULT_SLOT_ID);
      if (!v.ok) console.warn("[integrity] game:load 조작 감지:", v.reason);
    }
    return data?.game ?? null;
  });

  ipcMain.handle("game:save", (_event, data) => {
    if (!data || typeof data !== "object" || Array.isArray(data))
      return { ok: false, error: "invalid data" };
    try {
      const cur = dbLoadSlot(db, DEFAULT_SLOT_ID);
      dbSaveSlot(db, DEFAULT_SLOT_ID, data, cur?.season ?? null);
      signSlot(db, DEFAULT_SLOT_ID, data, cur?.season ?? null);
      return { ok: true };
    } catch (e) {
      console.error("[game:save] 저장 실패:", e);
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("season:load", () => {
    const data = dbLoadSlot(db, DEFAULT_SLOT_ID);
    if (data) {
      const v = verifySlot(db, DEFAULT_SLOT_ID);
      if (!v.ok) console.warn("[integrity] season:load 조작 감지:", v.reason);
    }
    return data?.season ?? null;
  });

  ipcMain.handle("season:save", (_event, data) => {
    if (!data || typeof data !== "object" || Array.isArray(data))
      return { ok: false, error: "invalid data" };
    try {
      const cur = dbLoadSlot(db, DEFAULT_SLOT_ID);
      dbSaveSlot(db, DEFAULT_SLOT_ID, cur?.game ?? null, data);
      signSlot(db, DEFAULT_SLOT_ID, cur?.game ?? null, data);
      return { ok: true };
    } catch (e) {
      console.error("[season:save] 저장 실패:", e);
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("save:listSlots", () => dbListSlots(db));

  ipcMain.handle("save:loadSlot", (_event, slotId) => {
    if (typeof slotId !== "string" || !slotId.trim()) return null;
    const id   = slotId.trim();
    const data = dbLoadSlot(db, id);
    if (!data) return null;
    const integrity = verifySlot(db, id);
    if (!integrity.ok) console.warn(`[integrity] 슬롯 '${id}' 조작 감지:`, integrity.reason);
    return { ...data, _integrity: integrity };
  });

  ipcMain.handle("save:saveSlot", (_event, payload) => {
    try {
      const slotId = String(payload?.slotId ?? DEFAULT_SLOT_ID).trim();
      if (!slotId) throw new Error("slotId is required");
      const game   = payload?.game   ?? null;
      const season = payload?.season ?? null;
      const slot = dbSaveSlot(db, slotId, game, season);
      signSlot(db, slotId, game, season);
      return { ok: true, slot };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("save:deleteSlot", (_event, slotId) => {
    try {
      const id = String(slotId ?? "").trim();
      if (!id) throw new Error("slotId is required");
      db.prepare("DELETE FROM save_slots WHERE slot_id = ?").run(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("save:renameSlot", (_event, payload) => {
    try {
      const slotId = String(payload?.slotId ?? "").trim();
      const name   = String(payload?.name   ?? "").trim();
      if (!slotId) throw new Error("slotId is required");
      if (!name)   throw new Error("name is required");
      const result = db.prepare("UPDATE save_slots SET name = ?, updated_at = ? WHERE slot_id = ?")
        .run(name, new Date().toISOString(), slotId);
      if (result.changes === 0) throw new Error("slot not found");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("stats:queryCareerHistory", (_event, payload) => {
    try {
      const slotId = String(payload?.slotId ?? DEFAULT_SLOT_ID);
      const npcId  = payload?.npcId ?? null;
      const year   = payload?.year  ?? null;
      const limit  = Math.min(500, Math.max(1, Number(payload?.limit ?? 200)));
      let sql2 = `SELECT h.npc_id, r.name as npc_name, h.year, h.league_id, h.team_id, h.stat_line FROM npc_career_history h LEFT JOIN npc_runtime r ON h.slot_id = r.slot_id AND h.npc_id = r.npc_id WHERE h.slot_id = ?`;
      const params = [slotId];
      if (npcId) { sql2 += " AND h.npc_id = ?"; params.push(npcId); }
      if (year)  { sql2 += " AND h.year = ?";   params.push(year); }
      sql2 += " ORDER BY h.year DESC LIMIT ?";
      params.push(limit);
      return db.prepare(sql2).all(...params).map((r) => ({
        npcId: r.npc_id, name: r.npc_name ?? "",
        year: r.year, leagueId: r.league_id, teamId: r.team_id, statLine: r.stat_line,
      }));
    } catch (e) {
      console.error("[stats:queryCareerHistory] 오류:", e);
      return [];
    }
  });

  ipcMain.handle("day:advance", async (_event, coreState) => {
    if (!coreState || typeof coreState !== "object" || Array.isArray(coreState)) {
      return { snapshot: null, logs: [] };
    }
    const core = await loadCoreModule();
    const result = core.advanceDay(coreState);
    return { snapshot: result.nextState, logs: result.logs };
  });
}

module.exports = { register };
