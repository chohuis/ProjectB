"use strict";
/**
 * D 세션 §4 실측 — 새 게임 · 씨앗 20260802 · 헤드리스 3시즌.
 *
 *   ① 넉아웃 무승부 0            knockoutDrawAudit()
 *   ② 대회가 라운드를 끝까지 진행 tournamentState() — done === 총 대진(부전승 제외) · champ 존재
 *   ③ check:msgdupid 사본 0      mailboxDupProbe()
 *
 * ④(왕복)은 check:roundtrip 이 새 프로세스 왕복까지 재현하므로 여기서는
 *   안 겹친다 — 별도로 `node scripts/check-roundtrip.cjs --seed 20260802 --seasons 3`.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = 20260802;
const SEASONS = 3;
const SLOT = "D3";

async function main() {
  const { app, tmp } = await headless.boot("d3season");
  try {
    await app.boot({ slotId: SLOT, worldSeed: SEED, seasonYear: 2026 });
    app.resetMailboxDup();

    // 🔴 **시즌이 넘어가면 `s.tournaments`(브래킷 라이브 상태)가 지워진다.**
    //   그래서 루프가 끝난 뒤 한 번만 읽으면 마지막 시즌 것만 남고 앞선
    //   시즌들의 완주 기록을 놓친다 — `seasonRollover()` 직전마다 걷는다.
    //
    // ⚠ **매 시즌 스냅샷을 전부 쌓는다.** 같은 tourId 로 최댓값만 남기면
    //   해마다 대진 크기가 같을 때(예: 32강 고정) 1년차 스냅샷만 남고
    //   2·3년차의 무승부는 조용히 가려진다 — "0" 이라는 결론이 실은
    //   한 시즌만 본 것이 된다. 시즌마다 따로 적재해 전부 합산한다.
    const drawSnapshots = []; // [{season, list: knockoutDrawAudit()}]
    const stateSnapshots = []; // [{season, list: tournamentState()}]
    const collect = () => {
      const season = app.currentSeason();
      drawSnapshots.push({ season, list: app.knockoutDrawAudit() });
      stateSnapshots.push({ season, list: app.tournamentState() });
    };

    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < start + SEASONS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { collect(); await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    collect(); // 마지막 시즌 몫(아직 롤오버 전일 수 있다) — 중복이면 아래서 그대로 더 보인다

    console.log(`[진행] season=${app.currentSeason()} week=${app.currentWeek()} guard=${guard} · 스냅샷 ${drawSnapshots.length}개`);

    // ① 넉아웃 무승부 — 시즌마다 전부 합산
    let drawTotal = 0;
    for (const snap of drawSnapshots) {
      for (const t of snap.list) {
        drawTotal += t.draws.length;
        console.log(`[①넉아웃] S${snap.season} ${t.tournamentId} 경기${t.total} 무승부${t.draws.length} ${t.draws.join(",")}`);
      }
    }
    console.log(`[①합계] 넉아웃 무승부 = ${drawTotal} (스냅샷 ${drawSnapshots.length}개 × 대회 ${drawSnapshots[0]?.list.length ?? 0}개)`);

    // ② 대회 라운드 완주 — 시즌마다
    for (const snap of stateSnapshots) {
      for (const s of snap.list) {
        console.log(`[②대회] S${snap.season} ${s.id} rounds=${s.rounds} done=${s.done} champ=${s.champ ?? "(없음)"}`);
      }
    }

    // ③ 소식 id 사본
    const r = app.mailboxDupProbe();
    console.log(`[③사본] 버려진사본=${r["버려진사본"] ?? 0} id별=${JSON.stringify(r["id별"] ?? {})}`);

    // ── 대조: 저장된 `history_tournaments` (S2028 등 라이브 스냅샷을 놓친
    //   시즌까지 포함해 전 시즌을 본다). `bracket_json` 의 부전승 아닌
    //   경기가 전부 winnerTeamId 를 가졌는지, 우승팀이 비어 있지 않은지 —
    //   비어 있으면(고졸1년차라 대회가 아직 없는 것 말고) 그 라운드가
    //   끝까지 못 간 것이다.
    let dbStuck = 0;
    try {
      const Database = require(path.join(process.cwd(), "node_modules", "better-sqlite3"));
      // history_tournaments 는 슬롯 파일이 아니라 공용 db(projectb_v2.db)에
      // slot_id 로만 구분돼 있다 (`apps/desktop/main.cjs` dbPath 머리말)
      const sharedDbFile = path.join(tmp, "saves", "projectb_v2.db");
      const db = new Database(sharedDbFile, { readonly: true });
      for (let y = 2026; y < 2026 + SEASONS; y++) {
        const rows = db.prepare(
          "SELECT tour_id, champion_name, bracket_json FROM history_tournaments WHERE slot_id = ? AND season_year = ?"
        ).all(SLOT, y);
        for (const row of rows) {
          let unresolved = 0, matches = 0, withTeams = 0, won = 0, maxRound = 0;
          if (row.bracket_json) {
            const b = JSON.parse(row.bracket_json);
            const ms = b.matches ?? [];
            matches = ms.length;
            maxRound = b.totalRounds ?? 0;
            withTeams = ms.filter((m) => !m.isBye && m.homeTeamId && m.awayTeamId).length;
            won = ms.filter((m) => m.winnerTeamId).length;
            unresolved = ms.filter((m) => !m.isBye && m.homeTeamId && m.awayTeamId && !m.winnerTeamId).length;
          }
          // "미해결"만 이 결함(넉아웃 무승부로 라운드가 못 넘어간다)의 신호다.
          // 우승팀 칸이 비어 있어도 unresolved=0 이면 그 라운드 자체가 아직
          // 대진을 못 받은 것(예: 1년차라 시드가 없다)이지 무승부로 막힌 게
          // 아니다 — 따로 적는다.
          const stuck = unresolved > 0;
          const notStarted = !row.champion_name && matches === 0;
          if (stuck) dbStuck++;
          const tag = stuck ? " 🔴 미해결" : (notStarted ? " (미개최)" : (!row.champion_name ? " ⚠ 대진있는데 우승팀없음" : ""));
          console.log(`[DB대조] S${y} ${row.tour_id} champ=${row.champion_name || "(없음)"} 대진${matches}(${maxRound}R) 대진확정${withTeams} 승자${won} 미해결${unresolved}${tag}`);
        }
      }
      db.close();
    } catch (e) {
      console.log(`[DB대조] 못 열었다 — ${e.message}`);
    }

    const fail = drawTotal > 0 || (r["버려진사본"] ?? 0) > 0 || dbStuck > 0;
    console.log(fail ? "[END] FAIL" : "[END] OK");
    process.exit(fail ? 1 : 0);
  } finally {
    headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
