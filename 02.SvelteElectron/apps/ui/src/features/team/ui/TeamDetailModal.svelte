<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import { gameStore } from "../../../shared/stores/game";
  import type { EntityRow, EntityPlayerDetails, EntityManagerDetails } from "../../../shared/stores/master";

  export let teamId: string = "";
  export let open: boolean = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  type DetailTab = "info" | "roster" | "lineup";
  let activeTab: DetailTab = "info";

  $: if (open) activeTab = "info";

  function close() { dispatch("close"); }
  function handleOverlayClick(e: MouseEvent) { if (e.target === e.currentTarget) close(); }
  function handleKeydown(e: KeyboardEvent) { if (e.key === "Escape") close(); }

  $: team = $masterStore.teams.find((t) => t.id === teamId) ?? null;

  function leagueLabel(lid: string): string {
    const map: Record<string, string> = {
      LEAGUE_HIGHSCHOOL: "고교리그", LEAGUE_UNIVERSITY: "대학리그",
      LEAGUE_INDEPENDENT: "독립리그", LEAGUE_KBL: "KBL",
      LEAGUE_ABL: "ABL", LEAGUE_JBL: "JBL",
    };
    return map[lid] ?? lid;
  }

  $: standing = (() => {
    if (!teamId) return null;
    const myLeagueId = $gameStore.protagonist.leagueId;
    if (team?.leagueId === myLeagueId) {
      return $seasonStore.standings.find((s) => s.teamId === teamId) ?? null;
    }
    for (const ls of Object.values($seasonStore.leagueState)) {
      const s = ls.standings.find((s) => s.teamId === teamId);
      if (s) return s;
    }
    return null;
  })();

  $: rivalTeam = team?.history?.rival
    ? ($masterStore.teams.find((t) => t.id === team!.history!.rival) ?? null)
    : null;

  // ── 로스터 ──────────────────────────────────────────────────
  $: allMembers = (() => {
    const p = $gameStore.protagonist;
    const rows: EntityRow[] = [
      ...(p.teamId === teamId ? [{
        id: p.id, name: p.name, role: "player" as const,
        teamId: p.teamId, age: p.age, status: "active" as const,
        originLeagueId: p.leagueId, leagueId: p.leagueId,
        clubId: "", schoolId: p.schoolId ?? "", grade: p.grade, notes: "",
        details: { player: { position: p.position, playerType: p.playerType, pitching: p.pitching, batting: p.batting, developmentRate: p.developmentRate, potentialHidden: p.potentialHidden, handedness: p.handedness, jerseyNumber: p.jerseyNumber } } as any,
      }] : []),
      ...$masterStore.entities.filter((e) => e.teamId === teamId),
    ];
    const roleOrder: Record<string, number> = { owner: 0, manager: 1, coach: 2, player: 3 };
    return rows.sort((a, b) => {
      const diff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "ko");
    });
  })();

  $: manager = allMembers.find((e) => e.role === "manager");
  $: managerDetails = manager ? (manager.details as any).manager as EntityManagerDetails : null;

  function playerOvr(row: EntityRow): number {
    const d = (row.details as any)?.player as EntityPlayerDetails | undefined;
    if (!d) return 0;
    return d.playerType === "batter" ? (d.batting?.ovr ?? 0) : (d.pitching?.ovr ?? 0);
  }
  function playerPos(row: EntityRow): string {
    return ((row.details as any)?.player as EntityPlayerDetails | undefined)?.position ?? "-";
  }
  function playerType(row: EntityRow): "pitcher" | "batter" | "twoWay" {
    return ((row.details as any)?.player as EntityPlayerDetails | undefined)?.playerType ?? "pitcher";
  }

  // ── 선발라인업 ────────────────────────────────────────────────
  $: pitchers = allMembers.filter((e) => e.role === "player" && playerType(e) !== "batter")
    .sort((a, b) => playerOvr(b) - playerOvr(a));

  const SP_LABELS = ["1선발", "2선발", "3선발", "4선발", "5선발"];
  const LINEUP_POSITIONS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"] as const;
  type LineupPos = typeof LINEUP_POSITIONS[number];
  interface LineupEntry { player: EntityRow; assignedPos: LineupPos; slot: number; isTemp: boolean; }

  function buildLineup(members: EntityRow[]): LineupEntry[] {
    const candidates = members.filter((e) => e.role === "player" && playerType(e) !== "pitcher");
    if (candidates.length === 0) return [];

    const posMap = new Map<LineupPos, { player: EntityRow; isTemp: boolean }>();
    const used = new Set<string>();

    for (const pos of LINEUP_POSITIONS) {
      const match = candidates
        .filter((c) => !used.has(c.id) && playerPos(c) === pos)
        .sort((a, b) => playerOvr(b) - playerOvr(a));
      if (match.length > 0) { posMap.set(pos, { player: match[0], isTemp: false }); used.add(match[0].id); }
    }

    const rem = candidates.filter((c) => !used.has(c.id)).sort((a, b) => playerOvr(b) - playerOvr(a));
    let ri = 0;
    for (const pos of LINEUP_POSITIONS) {
      if (!posMap.has(pos) && ri < rem.length) { posMap.set(pos, { player: rem[ri], isTemp: true }); used.add(rem[ri].id); ri++; }
    }

    const bs = (p: EntityRow) => {
      const b = ((p.details as any)?.player as any)?.batting;
      return { spd: b?.speed ?? 50, con: b?.contact ?? 50, pow: b?.power ?? 50, eye: b?.eye ?? 50, ovr: b?.ovr ?? 50, clu: b?.battingClutch ?? 50 };
    };
    const scoreFns: Record<number, (p: EntityRow) => number> = {
      4: (p) => { const s = bs(p); return s.pow * 0.5 + s.ovr * 0.3 + s.clu * 0.2; },
      3: (p) => { const s = bs(p); return s.con * 0.4 + s.ovr * 0.4 + s.pow * 0.2; },
      5: (p) => { const s = bs(p); return s.pow * 0.4 + s.ovr * 0.4 + s.clu * 0.2; },
      1: (p) => { const s = bs(p); return s.spd * 0.4 + s.con * 0.3 + s.eye * 0.3; },
      2: (p) => { const s = bs(p); return s.con * 0.4 + s.eye * 0.3 + s.spd * 0.3; },
      6: (p) => playerOvr(p), 7: (p) => playerOvr(p), 8: (p) => playerOvr(p), 9: () => 0,
    };

    const SLOT_ORDER = [4, 3, 5, 1, 2, 6, 7, 8, 9];
    const unset = new Set(posMap.keys());
    const result: LineupEntry[] = [];

    for (const slot of SLOT_ORDER) {
      if (unset.size === 0) break;
      if (slot === 9) {
        const pos = unset.values().next().value as LineupPos;
        const e = posMap.get(pos)!;
        result.push({ player: e.player, assignedPos: pos, slot, isTemp: e.isTemp });
        unset.delete(pos); continue;
      }
      if (slot === 8 && unset.has("C")) {
        const e = posMap.get("C")!;
        result.push({ player: e.player, assignedPos: "C", slot, isTemp: e.isTemp });
        unset.delete("C"); continue;
      }
      const fn = scoreFns[slot];
      let best: LineupPos | null = null, bestScore = -Infinity;
      for (const pos of unset) { const sc = fn(posMap.get(pos)!.player); if (sc > bestScore) { bestScore = sc; best = pos; } }
      if (best !== null) {
        const e = posMap.get(best)!;
        result.push({ player: e.player, assignedPos: best, slot, isTemp: e.isTemp });
        unset.delete(best);
      }
    }
    return result.sort((a, b) => a.slot - b.slot);
  }

  $: lineupEntries = buildLineup(allMembers);

  // ── 헬퍼 ─────────────────────────────────────────────────────
  const PRESTIGE_COLOR: Record<string, string> = {
    S: "#f0c060", A: "#68de92", B: "#80b4f8", C: "#b0c8ee", D: "#8090a8",
  };
  const PRESTIGE_BG: Record<string, string> = {
    S: "rgba(240,192,96,0.15)", A: "rgba(104,222,146,0.12)",
    B: "rgba(128,180,248,0.12)", C: "rgba(176,200,238,0.08)", D: "rgba(128,144,168,0.08)",
  };
  const FANBASE_ICON: Record<string, string> = {
    "소규모": "●", "지역": "●●", "광역": "●●●", "전국": "●●●●", "메가": "●●●●●",
  };
  const NATIONAL_COLOR: Record<string, string> = {
    "우승": "#f0c060", "준우승": "#b0c8ee", "플레이오프": "#7a9ac8", "조별 리그": "#5a7a98",
  };

  function stars(n: number): string {
    return "★".repeat(n) + "☆".repeat(5 - n);
  }
  function capacityFmt(n: number): string {
    return n >= 10000 ? `${(n / 10000).toFixed(1)}만` : `${n.toLocaleString()}`;
  }
  function nationalColor(v: string): string {
    for (const [k, c] of Object.entries(NATIONAL_COLOR)) if (v.includes(k)) return c;
    return "#6080a0";
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open && team}
  <div class="overlay" on:click={handleOverlayClick} role="dialog" aria-modal="true">
    <div class="modal">

      <!-- 컬러 바 -->
      {#if team.colors}
        <div class="color-bar" style="background: linear-gradient(90deg, {team.colors[0]} 0%, {team.colors[1]} 100%);"></div>
      {:else}
        <div class="color-bar color-bar-default"></div>
      {/if}

      <!-- 헤더 -->
      <header class="modal-header">
        <div class="title-row">
          <div class="team-colors-swatch">
            {#if team.colors}
              <span class="swatch" style="background:{team.colors[0]};"></span>
              <span class="swatch" style="background:{team.colors[1]};"></span>
            {/if}
          </div>
          <h2>{team.name}</h2>
          <span class="league-badge">{leagueLabel(team.leagueId)}</span>
          {#if team.tier}<span class="tier-badge">{team.tier}</span>{/if}
        </div>

        <div class="header-meta">
          {#if team.nameEn}<span class="name-en">{team.nameEn}</span>{/if}
          {#if team.city}<span class="meta-chip">📍 {team.city}</span>{/if}
          {#if team.stadium}<span class="meta-chip">🏟 {team.stadium}{#if team.capacity} · {capacityFmt(team.capacity)}석{/if}</span>{/if}
        </div>

        <button class="close-btn" on:click={close} aria-label="닫기">✕</button>

        <nav class="sub-tabs">
          <button class:active={activeTab === "info"}   on:click={() => (activeTab = "info")}>기본정보</button>
          <button class:active={activeTab === "roster"} on:click={() => (activeTab = "roster")}>로스터</button>
          <button class:active={activeTab === "lineup"} on:click={() => (activeTab = "lineup")}>선발라인업</button>
        </nav>
      </header>

      <!-- ── 기본정보 ── -->
      {#if activeTab === "info"}
        <div class="modal-body">
          <div class="info-grid">

            <!-- 좌측 패널 -->
            <div class="info-left">

              {#if standing}
                <section class="section">
                  <h4>이번 시즌</h4>
                  <div class="kpi-row">
                    <div class="kpi"><span>승</span><strong class="win">{standing.wins}</strong></div>
                    <div class="kpi"><span>패</span><strong class="lose">{standing.losses}</strong></div>
                    <div class="kpi"><span>무</span><strong>{standing.draws}</strong></div>
                    <div class="kpi"><span>승률</span><strong>{standing.winPct.toFixed(2)}</strong></div>
                    <div class="kpi"><span>연속</span><strong>{standing.streak || "-"}</strong></div>
                  </div>
                </section>
              {/if}

              {#if team.profile}
                <section class="section">
                  <h4>팀 평가</h4>
                  <div class="eval-grid">
                    {#if team.profile.prestige}
                      <div class="eval-item">
                        <span>명성</span>
                        <strong class="prestige-badge"
                          style="color:{PRESTIGE_COLOR[team.profile.prestige]};background:{PRESTIGE_BG[team.profile.prestige]};">
                          {team.profile.prestige}
                        </strong>
                      </div>
                    {/if}
                    {#if team.profile.fanBase}
                      <div class="eval-item">
                        <span>팬덤</span>
                        <strong>{team.profile.fanBase}
                          <em class="fan-dots">{FANBASE_ICON[team.profile.fanBase] ?? ""}</em>
                        </strong>
                      </div>
                    {/if}
                    {#if team.profile.facilityLevel}
                      <div class="eval-item">
                        <span>시설</span>
                        <strong class="stars">{stars(team.profile.facilityLevel)}</strong>
                      </div>
                    {/if}
                    {#if team.profile.atmosphere}
                      <div class="eval-item">
                        <span>분위기</span>
                        <strong>{team.profile.atmosphere}</strong>
                      </div>
                    {/if}
                    {#if team.profile.mediaPressure}
                      <div class="eval-item">
                        <span>미디어 압박</span>
                        <strong>{team.profile.mediaPressure}</strong>
                      </div>
                    {/if}
                    {#if team.profile.funding}
                      <div class="eval-item">
                        <span>재정</span>
                        <strong>{team.profile.funding}</strong>
                      </div>
                    {/if}
                  </div>
                </section>

                <section class="section">
                  <h4>팀 특성</h4>
                  {#if team.profile.desc}<p class="desc">{team.profile.desc}</p>{/if}
                  <div class="tag-row">
                    {#if team.profile.style}<span class="tag tag-style">{team.profile.style}</span>{/if}
                    {#each (team.profile.tags ?? []) as tag}<span class="tag">{tag}</span>{/each}
                  </div>
                  {#if team.profile.strengths?.length}
                    <div class="strength-row">
                      {#each team.profile.strengths as s}<span class="strength-chip">{s}</span>{/each}
                    </div>
                  {/if}
                </section>
              {/if}

              <section class="section">
                <h4>구성원</h4>
                <div class="kpi-row">
                  <div class="kpi"><span>선수</span><strong>{allMembers.filter(e => e.role === "player").length}</strong></div>
                  <div class="kpi"><span>코치</span><strong>{allMembers.filter(e => e.role === "coach").length}</strong></div>
                  {#if manager}<div class="kpi kpi-wide"><span>감독</span><strong>{manager.name}</strong></div>{/if}
                </div>
              </section>
            </div>

            <!-- 우측 패널 -->
            <div class="info-right">

              {#if team.history}
                <section class="section">
                  <h4>팀 역사</h4>
                  <div class="history-kpi">
                    {#if team.history.founded}<div><span>창단</span><strong>{team.history.founded}년</strong></div>{/if}
                    {#if team.history.nationalTitles}<div><span>전국 우승</span><strong>{team.history.nationalTitles}회</strong></div>{/if}
                    {#if team.history.proPlayers}<div><span>프로 배출</span><strong>{team.history.proPlayers}명</strong></div>{/if}
                  </div>

                  {#if team.history.titleYears?.length}
                    <div class="title-years">
                      {#each team.history.titleYears as yr}
                        <span class="year-pill">{yr}</span>
                      {/each}
                    </div>
                  {/if}

                  {#if team.history.peakEra}
                    <p class="peak-era">"{team.history.peakEra}"</p>
                  {/if}

                  {#if team.history.summary}
                    <p class="desc">{team.history.summary}</p>
                  {/if}

                  {#if rivalTeam}
                    <div class="rival-row">
                      <span class="rival-label">라이벌</span>
                      <span class="rival-name">{rivalTeam.name}</span>
                    </div>
                  {/if}
                </section>

                {#if team.history.recentRecords?.length}
                  <section class="section">
                    <h4>최근 성적</h4>
                    <div class="records-list">
                      {#each [...team.history.recentRecords].reverse() as rec}
                        <div class="record-row">
                          <span class="rec-year">{rec.year}</span>
                          <span class="rec-national" style="color:{nationalColor(rec.national)};">{rec.national}</span>
                          <span class="rec-regional">{rec.regional}</span>
                          {#if rec.note}<span class="rec-note">{rec.note}</span>{/if}
                        </div>
                      {/each}
                    </div>
                  </section>
                {/if}
              {:else}
                <p class="empty">팀 역사 데이터가 없습니다.</p>
              {/if}
            </div>
          </div>
        </div>

      <!-- ── 로스터 ── -->
      {:else if activeTab === "roster"}
        <div class="modal-body">
          {#if allMembers.filter(e => e.role !== "owner").length === 0}
            <p class="empty">로스터 데이터가 없습니다.</p>
          {:else}
            <div class="roster-wrap">
              <table class="stbl roster-table">
                <thead>
                  <tr><th>#</th><th>이름</th><th>역할/포지션</th><th>나이</th><th>OVR</th></tr>
                </thead>
                <tbody>
                  {#each allMembers.filter(e => e.role !== "owner") as row}
                    {@const d = (row.details as any)?.player as EntityPlayerDetails | undefined}
                    <tr class:hero={row.id === $gameStore.protagonist.id}>
                      <td class="num">{d?.jerseyNumber ?? "-"}</td>
                      <td class="name-cell">
                        {row.name}
                        {#if row.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                      </td>
                      <td>
                        {#if row.role === "player"}{playerPos(row)}
                        {:else if row.role === "manager"}<span class="role-badge role-mgr">감독</span>
                        {:else if row.role === "coach"}<span class="role-badge role-coach">코치</span>
                        {/if}
                      </td>
                      <td>{row.age}</td>
                      <td class="ovr-cell">{row.role === "player" ? playerOvr(row) : "-"}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

      <!-- ── 선발라인업 ── -->
      {:else if activeTab === "lineup"}
        <div class="modal-body">
          {#if managerDetails}
            <div class="mgr-banner">
              <span class="mgr-label">감독</span>
              <strong>{manager?.name}</strong>
              <span class="mgr-style">{managerDetails.style || managerDetails.gamePlanBias || "-"}</span>
            </div>
          {/if}

          <div class="lineup-grid">
            <section class="lineup-section">
              <h4>선발 로테이션</h4>
              {#if pitchers.length === 0}
                <p class="empty">투수 데이터 없음</p>
              {:else}
                <div class="lineup-rows">
                  {#each pitchers.slice(0, 5) as row, i}
                    <div class="lineup-row" class:hero={row.id === $gameStore.protagonist.id}>
                      <span class="slot-label">{SP_LABELS[i] ?? `${i + 1}선발`}</span>
                      <span class="player-name">
                        {row.name}
                        {#if row.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                      </span>
                      <span class="pos-tag">{playerPos(row)}</span>
                      <span class="ovr-tag">{playerOvr(row)}</span>
                    </div>
                  {/each}
                  {#if pitchers.length > 5}
                    <div class="lineup-more">불펜 {pitchers.length - 5}명</div>
                  {/if}
                </div>
              {/if}
            </section>

            <section class="lineup-section">
              <h4>타순</h4>
              {#if lineupEntries.length === 0}
                <p class="empty">타자 데이터 없음</p>
              {:else}
                <div class="lineup-rows">
                  {#each lineupEntries as entry}
                    <div class="lineup-row" class:hero={entry.player.id === $gameStore.protagonist.id}>
                      <span class="slot-label">{entry.slot}번</span>
                      <span class="player-name">
                        {entry.player.name}
                        {#if entry.player.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                      </span>
                      <span class="pos-tag" class:pos-temp={entry.isTemp}>{entry.assignedPos}{entry.isTemp ? "*" : ""}</span>
                      <span class="ovr-tag">{playerOvr(entry.player)}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </section>
          </div>
        </div>
      {/if}

    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.68);
    display: flex; align-items: center; justify-content: center;
    z-index: 150;
  }

  .modal {
    background: #0e1a30;
    border: 1px solid #3a5a96;
    border-radius: 14px;
    width: min(860px, 96vw);
    max-height: 90vh;
    display: grid;
    grid-template-rows: 4px auto minmax(0,1fr);
    overflow: hidden;
  }

  /* 컬러 바 */
  .color-bar { height: 4px; width: 100%; }
  .color-bar-default { background: linear-gradient(90deg, #3262b0, #1a3f6f); }

  /* 헤더 */
  .modal-header {
    padding: 16px 24px 0;
    border-bottom: 1px solid #1e2e48;
    display: grid; gap: 4px;
    position: relative;
  }

  .title-row {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding-right: 40px;
  }

  .team-colors-swatch { display: flex; gap: 3px; align-items: center; }
  .swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.15); display: inline-block; }

  h2 { margin: 0; font-size: 20px; color: #e8f0ff; }
  h4 { margin: 0 0 8px; font-size: 11px; color: #7a9ac8; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; }

  .league-badge {
    font-size: 11px; font-weight: 700;
    background: #1a3058; border: 1px solid #3a5888;
    color: #80b4f0; border-radius: 6px; padding: 3px 8px;
  }
  .tier-badge {
    font-size: 11px;
    background: #2a1e08; border: 1px solid #8a6020;
    color: #f0c060; border-radius: 6px; padding: 3px 8px;
  }

  .header-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .name-en { font-size: 12px; color: #506080; }
  .meta-chip { font-size: 11px; color: #7a9ac8; }

  .close-btn {
    position: absolute; top: 14px; right: 18px;
    background: none; border: none; color: #6080a0;
    font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
  }
  .close-btn:hover { color: #c8d8f0; background: #1a2a44; }

  .sub-tabs { display: flex; gap: 0; margin-top: 10px; }
  .sub-tabs button {
    background: none; border: none; border-bottom: 2px solid transparent;
    color: #6080a0; font-size: 13px; padding: 8px 16px; cursor: pointer;
  }
  .sub-tabs button:hover { color: #a8c4f0; }
  .sub-tabs button.active { color: #80b4f8; border-bottom-color: #80b4f8; font-weight: 600; }

  /* 바디 */
  .modal-body {
    overflow-y: auto;
    padding: 16px 24px 24px;
  }

  /* 기본정보 2열 */
  .info-grid {
    display: grid;
    grid-template-columns: 300px minmax(0,1fr);
    gap: 20px;
    align-items: start;
  }

  .info-left, .info-right {
    display: flex; flex-direction: column; gap: 18px;
  }

  .section { display: grid; gap: 8px; }

  /* KPI */
  .kpi-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .kpi {
    background: #131f38; border: 1px solid #2a3f62;
    border-radius: 8px; padding: 8px 12px;
    display: grid; gap: 2px; text-align: center; min-width: 52px;
  }
  .kpi.kpi-wide { min-width: 90px; }
  .kpi span { font-size: 10px; color: #8aa4cc; }
  .kpi strong { font-size: 14px; color: #d8e8ff; }
  .win  { color: #68de92; }
  .lose { color: #ffb58a; }

  /* 팀 평가 */
  .eval-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .eval-item {
    background: #131f38; border: 1px solid #2a3f62;
    border-radius: 8px; padding: 7px 10px;
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
  }
  .eval-item span { font-size: 10px; color: #8aa4cc; white-space: nowrap; }
  .eval-item strong { font-size: 12px; color: #e8f0ff; text-align: right; }

  .prestige-badge {
    font-size: 13px !important; font-weight: 800 !important;
    border-radius: 4px; padding: 1px 6px;
  }

  .stars { font-size: 11px !important; color: #f0c060 !important; letter-spacing: 1px; }

  .fan-dots { font-style: normal; font-size: 8px; color: #5a8ad0; letter-spacing: 1px; margin-left: 3px; }

  /* 팀 특성 */
  .desc { margin: 0; font-size: 12px; color: #9eb6de; line-height: 1.65; }
  .tag-row { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag {
    font-size: 11px; color: #d5e2fd;
    border: 1px solid #3c4f74; background: #1a2a4a;
    border-radius: 999px; padding: 3px 8px;
  }
  .tag-style { color: #80c8ff; border-color: #1a4a6a; background: #0e2438; font-weight: 700; }

  .strength-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .strength-chip {
    font-size: 10px; color: #68de92;
    border: 1px solid #1e5030; background: #0e2a18;
    border-radius: 4px; padding: 2px 7px;
  }

  /* 팀 역사 */
  .history-kpi { display: flex; flex-wrap: wrap; gap: 8px; }
  .history-kpi > div {
    background: #131f38; border: 1px solid #2a3f62;
    border-radius: 8px; padding: 7px 12px;
    display: grid; gap: 2px; text-align: center;
  }
  .history-kpi span { font-size: 10px; color: #8aa4cc; }
  .history-kpi strong { font-size: 14px; color: #d8e8ff; }

  .title-years { display: flex; flex-wrap: wrap; gap: 4px; }
  .year-pill {
    font-size: 11px; color: #f0c060; font-weight: 700;
    background: rgba(240,192,96,0.12); border: 1px solid rgba(240,192,96,0.3);
    border-radius: 4px; padding: 2px 7px;
  }

  .peak-era {
    margin: 0; font-size: 12px; color: #7a9ac8;
    font-style: italic; border-left: 2px solid #2a4a70; padding-left: 8px;
  }

  .rival-row {
    display: flex; align-items: center; gap: 8px;
    background: #131f38; border: 1px solid #2a3f62;
    border-radius: 8px; padding: 7px 10px;
  }
  .rival-label { font-size: 10px; color: #8aa4cc; }
  .rival-name { font-size: 12px; color: #f08080; font-weight: 700; }

  /* 최근 성적 */
  .records-list { display: grid; gap: 4px; }
  .record-row {
    display: grid; grid-template-columns: 44px 64px 56px 1fr;
    align-items: center; gap: 8px;
    background: #131f38; border: 1px solid #1e2e48;
    border-radius: 7px; padding: 6px 10px; font-size: 12px;
  }
  .rec-year { color: #6080a0; font-size: 11px; font-weight: 700; }
  .rec-national { font-weight: 700; font-size: 12px; }
  .rec-regional { color: #8aa4cc; font-size: 11px; }
  .rec-note { color: #607090; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* 공통 테이블 */
  .stbl { width: 100%; border-collapse: collapse; font-size: 12px; }
  .stbl th {
    color: #7a9ac8; padding: 5px 8px; text-align: center;
    border-bottom: 1px solid #2a3f62; white-space: nowrap;
  }
  .stbl td {
    padding: 5px 8px; text-align: center;
    color: #b8ccec; border-bottom: 1px solid #1a2a44; white-space: nowrap;
  }

  /* 로스터 */
  .roster-wrap { overflow-x: auto; }
  .roster-table td.num { color: #6080a0; width: 32px; }
  .roster-table td.name-cell { text-align: left; color: #d5e2fd; }
  .roster-table td.ovr-cell { font-weight: 700; color: #68de92; }
  .roster-table tr.hero td { color: #f0e060; font-weight: 700; background: rgba(240,224,96,0.05); }

  .role-badge { font-size: 10px; border-radius: 4px; padding: 2px 6px; font-weight: 700; }
  .role-mgr   { background: rgba(120,100,200,0.2); color: #a898f8; border: 1px solid #4a3878; }
  .role-coach { background: rgba(80,160,220,0.15); color: #70b0f0; border: 1px solid #2a5080; }

  .hero-tag {
    font-size: 9px; background: rgba(240,224,96,0.2);
    color: #f0e060; border: 1px solid rgba(240,224,96,0.4);
    border-radius: 3px; padding: 0 4px; margin-left: 4px; vertical-align: middle;
  }

  /* 선발라인업 */
  .mgr-banner {
    display: flex; align-items: center; gap: 10px;
    background: #1a2a48; border: 1px solid #2e4870;
    border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;
  }
  .mgr-label { font-size: 11px; color: #8aa4cc; }
  .mgr-banner strong { font-size: 14px; color: #d8e8ff; }
  .mgr-style {
    font-size: 11px; color: #80c8ff;
    background: #0e2438; border: 1px solid #1a4a6a;
    border-radius: 999px; padding: 2px 8px;
  }

  .lineup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .lineup-section { display: grid; gap: 6px; align-content: start; }
  .lineup-rows { display: grid; gap: 4px; }
  .lineup-row {
    display: grid; grid-template-columns: 52px 1fr 36px 32px;
    align-items: center; gap: 6px;
    background: #131f38; border: 1px solid #2a3f62;
    border-radius: 7px; padding: 6px 8px; font-size: 12px;
  }
  .lineup-row.hero { border-color: rgba(240,224,96,0.4); background: rgba(240,224,96,0.05); }
  .slot-label { font-size: 11px; color: #6080a0; font-weight: 700; }
  .player-name { color: #d5e2fd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pos-tag { text-align: center; font-size: 10px; color: #6888a8; }
  .pos-temp { color: #f0a040; }
  .ovr-tag { text-align: right; font-weight: 700; color: #68de92; font-size: 12px; }
  .lineup-more { font-size: 11px; color: #6080a0; text-align: center; padding: 4px; }

  .empty { color: #9db2d8; font-size: 13px; margin: 0; }

  @media (max-width: 700px) {
    .info-grid { grid-template-columns: 1fr; }
    .lineup-grid { grid-template-columns: 1fr; }
  }
</style>
