<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { seasonLabel } from "../../../shared/utils/baseballFormat";
  import { masterStore, entitiesL10n, teamsL10n } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import { gameStore } from "../../../shared/stores/game";
  // `EntityDetails`는 파일 곳곳에서 캐스팅에 쓰는데 **import가 빠져 있었다** —
  // 이름이 안 풀려 svelte-check 오류 7건이 조용히 나고 있었다
  import type {
    EntityRow, EntityDetails, EntityPlayerDetails, EntityManagerDetails,
  } from "../../../shared/stores/master";
  import PlayerDetailModal from "../../player/ui/PlayerDetailModal.svelte";
  import TeamMark from "./TeamMark.svelte";
  import { rotationSizeForLeague } from "../../../shared/utils/rosterEngine";
  import {
    growthRoom, growthGrade, gradeTone, scoutedGrade, foreignBadge,
  } from "../../../shared/utils/playerTraits";
  import { clubKeyOfTeam } from "../../../shared/utils/ids";

  export let teamId: string = "";
  export let open: boolean = false;

  const dispatch = createEventDispatcher<{ close: void }>();
  let playerModalId = "";

  type DetailTab = "info" | "roster" | "lineup";
  let activeTab: DetailTab = "info";

  $: if (open) activeTab = "info";

  function close() { dispatch("close"); }
  function handleOverlayClick(e: MouseEvent) { if (e.target === e.currentTarget) close(); }
  function handleKeydown(e: KeyboardEvent) { if (e.key === "Escape") close(); }

  $: team = $teamsL10n.find((t) => t.id === teamId) ?? null;

  /**
   * 구장 이름. **ID를 그대로 찍고 있었다** — 화면에 `🏟 STADIUM_HANGANG`이
   * 나왔다. 앱을 띄워 보고서야 보인 종류의 결함이다.
   * 해외 팀은 구장을 한글 이름 문자열로 참조하므로 그건 그대로 통과시킨다.
   */
  function stadiumName(id: string): string {
    return ($masterStore.stadiums ?? []).find((s) => s.id === id)?.name ?? id;
  }

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

  // ── 팀 역사 (v2 refs 기준) ──────────────────────────────────
  // Phase 5-1에서 refs를 시드 CSV로 다시 만들며 history 모양이 바뀌었는데
  // 이 화면은 v1 필드(founded·nationalTitles·recentRecords·rival)를 계속 읽어
  // **전부 빈 값을 보여주고 있었다.** v2 필드에서 파생한다.
  $: rivals = (team?.history?.rivals ?? [])
    .map((r) => ({
      team: $teamsL10n.find((t) => t.id === r.with) ?? null,
      desc: r.desc ?? "",
    }))
    .filter((r) => r.team !== null);

  /** 우승 = titles 중 result가 "우승"인 것 */
  $: championships = (team?.history?.titles ?? []).filter((t) => t.result === "우승");
  /** 대회별 우승 횟수 — "개나리기 2회" 처럼 묶어서 보여준다 */
  $: titlesByCompetition = (() => {
    const m = new Map<string, number>();
    for (const t of championships) m.set(t.competition, (m.get(t.competition) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  })();
  /** 과거 5시즌 순위 — S-5(가장 오래된)부터 S-1(직전) 순으로 */
  $: seasonRanks = [...(team?.history?.seasonRanks ?? [])]
    .sort((a, b) => b.season.localeCompare(a.season));
  /** 그 시즌에 딴 타이틀 (최근 성적 줄에 붙인다) */
  function titlesOfSeason(season: string): string[] {
    return (team?.history?.titles ?? [])
      .filter((t) => t.season === season && t.result === "우승")
      .map((t) => t.competition.replace(/^(고교|대학|프로|독립)\s*/, ""));
  }
  function rankColor(rank: number): string {
    if (rank === 1) return "#9A6510";
    if (rank <= 3) return "#1F5FA8";
    if (rank <= 6) return "#5A6478";
    return "#8A93A6";
  }

  // ── 로스터 ──────────────────────────────────────────────────
  $: allMembers = (() => {
    const p = $gameStore.protagonist;
    const rows: EntityRow[] = [
      ...(p.teamId === teamId ? [{
        id: p.id, name: p.name, role: "player" as const,
        teamId: p.teamId, age: p.age, status: "active" as const,
        originLeagueId: p.leagueId, leagueId: p.leagueId,
        clubId: "", schoolId: p.schoolId ?? "", grade: p.grade, notes: "",
        details: { player: { position: p.position, playerType: p.playerType, pitching: p.pitching, batting: p.batting, developmentRate: p.developmentRate, potentialHidden: p.potentialHidden, handedness: p.handedness, jerseyNumber: p.jerseyNumber }, coach: null, manager: null, owner: null },
      }] : []),
      ...$entitiesL10n.filter((e) => e.teamId === teamId),
    ];
    const roleOrder: Record<string, number> = { owner: 0, manager: 1, coach: 2, player: 3 };
    return rows.sort((a, b) => {
      const diff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "ko");
    });
  })();

  $: manager = allMembers.find((e) => e.role === "manager");
  $: managerDetails = manager ? (manager.details as EntityDetails).manager : null;

  function playerOvr(row: EntityRow): number {
    const d = (row.details as EntityDetails)?.player;
    if (!d) return 0;
    return d.playerType === "batter" ? (d.batting?.ovr ?? 0) : (d.pitching?.ovr ?? 0);
  }
  function playerPos(row: EntityRow): string {
    return (row.details as EntityDetails)?.player?.position ?? "-";
  }
  function playerType(row: EntityRow): "pitcher" | "batter" | "twoWay" {
    return (row.details as EntityDetails)?.player?.playerType ?? "pitcher";
  }

  // ── 성장 여지 · 국적 (U9-b) ───────────────────────────────────
  //
  // 판정 규칙은 전부 `playerTraits`가 정본이다 — 선수 상세와 같은 등급이
  // 나와야 한다. 여기서 임계값을 다시 적으면 두 화면이 다른 말을 한다.

  /** 내 구단(2군 포함)이면 정확한 등급을 본다 */
  $: sameClub = clubKeyOfTeam(teamId) === clubKeyOfTeam($gameStore.protagonist.teamId);

  $: npcById = new Map(($gameStore.npcs ?? []).map((n) => [n.npcId, n]));

  function growthOf(row: EntityRow) {
    if (row.role !== "player") return null;
    const isMe = row.id === $gameStore.protagonist.id;
    const d = (row.details as EntityDetails)?.player;
    const pot = isMe
      ? $gameStore.protagonist.potentialHidden
      : npcById.get(row.id)?.potentialHidden ?? d?.potentialHidden;
    const grade = growthGrade(growthRoom(pot, playerOvr(row) || undefined));
    const s = scoutedGrade(grade, row.id, isMe || sameClub);
    return s ? { ...s, tone: gradeTone(grade) } : null;
  }

  function natOf(row: EntityRow) {
    if (row.role !== "player" || row.id === $gameStore.protagonist.id) return null;
    return foreignBadge(team?.leagueId, npcById.get(row.id)?.nationality);
  }

  // ── 선발라인업 ────────────────────────────────────────────────
  interface RotationEntry { player: EntityRow; isTemp: boolean; }
  interface BullpenData {
    rp:    EntityRow[];   // RP 포지션
    cp:    EntityRow[];   // CP 포지션
    extra: EntityRow[];   // 로테이션에 못 든 나머지 후보
  }

  $: maxRot = rotationSizeForLeague(team?.leagueId ?? "");

  function buildRotation(
    members: EntityRow[],
    max: number,
  ): { rotation: RotationEntry[]; bullpen: BullpenData } {
    const all = members
      .filter((e) => e.role === "player" && playerType(e) !== "batter")
      .sort((a, b) => playerOvr(b) - playerOvr(a));

    const sps  = all.filter((e) => playerPos(e) === "SP");
    const rps  = all.filter((e) => playerPos(e) === "RP");
    const cps  = all.filter((e) => playerPos(e) === "CP");

    const rotation: RotationEntry[] = [];
    sps.slice(0, max).forEach((p) => rotation.push({ player: p, isTemp: false }));
    // SP 부족 시 RP/CP로 임시 보충
    if (rotation.length < max) {
      [...rps, ...cps]
        .slice(0, max - rotation.length)
        .forEach((p) => rotation.push({ player: p, isTemp: true }));
    }

    const usedIds = new Set(rotation.map((r) => r.player.id));

    return {
      rotation,
      bullpen: {
        rp:    rps.filter((e) => !usedIds.has(e.id)),
        cp:    cps.filter((e) => !usedIds.has(e.id)),
        extra: sps.filter((e) => !usedIds.has(e.id)),  // 로테이션에 못 든 SP
      },
    };
  }

  $: ({ rotation: spRotation, bullpen: bullpenData } = buildRotation(allMembers, maxRot));

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
      const b = (p.details as EntityDetails)?.player?.batting;
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
    S: "#9A6510", A: "#1F7A47", B: "#1F5FA8", C: "#5A6478", D: "#8A93A6",
  };
  const PRESTIGE_BG: Record<string, string> = {
    S: "rgba(240,192,96,0.15)", A: "rgba(104,222,146,0.12)",
    B: "rgba(128,180,248,0.12)", C: "rgba(176,200,238,0.08)", D: "rgba(128,144,168,0.08)",
  };
  const FANBASE_ICON: Record<string, string> = {
    "소규모": "●", "지역": "●●", "광역": "●●●", "전국": "●●●●", "메가": "●●●●●",
  };
  function stars(n: number): string {
    return "★".repeat(n) + "☆".repeat(5 - n);
  }
  function capacityFmt(n: number): string {
    return n >= 10000 ? `${(n / 10000).toFixed(1)}만` : `${n.toLocaleString()}`;
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
          <!-- 마크가 팀 색을 이미 담는다 — 색 조각을 따로 두면 같은 말을 두 번 한다 -->
          <TeamMark teamId={team.id} size={30} />
          <h2>{team.name}</h2>
          <span class="league-badge">{leagueLabel(team.leagueId)}</span>
          {#if team.tier}<span class="tier-badge">{team.tier}</span>{/if}
        </div>

        <div class="header-meta">
          {#if team.nameEn}<span class="name-en">{team.nameEn}</span>{/if}
          {#if team.city}<span class="meta-chip">📍 {team.city}</span>{/if}
          {#if team.stadium}<span class="meta-chip">🏟 {stadiumName(team.stadium)}{#if team.capacity} · {capacityFmt(team.capacity)}석{/if}</span>{/if}
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
                    {#if team.history.foundedYear}<div><span>창단</span><strong>{team.history.foundedYear}년</strong></div>{/if}
                    {#if championships.length}<div><span>대회 우승</span><strong>{championships.length}회</strong></div>{/if}
                    {#if team.history.budget}<div><span>운영 예산</span><strong>{Math.round(team.history.budget / 100000000)}억</strong></div>{/if}
                  </div>

                  {#if titlesByCompetition.length}
                    <div class="title-years">
                      {#each titlesByCompetition as [competition, count]}
                        <span class="year-pill">{competition.replace(/^(고교|대학|프로|독립)\s*/, "")} {count}회</span>
                      {/each}
                    </div>
                  {/if}

                  {#if team.profile?.desc}
                    <p class="desc">{team.profile.desc}</p>
                  {/if}

                  {#each rivals as r}
                    <div class="rival-row">
                      <span class="rival-label">라이벌</span>
                      <span class="rival-name">{r.team?.name}</span>
                      {#if r.desc}<span class="rival-desc">{r.desc}</span>{/if}
                    </div>
                  {/each}
                </section>

                {#if seasonRanks.length}
                  <section class="section">
                    <h4>과거 5시즌</h4>
                    <div class="records-list">
                      {#each seasonRanks as sr}
                        <div class="record-row">
                          <span class="rec-year">{seasonLabel(sr.season, $seasonStore.seasonYear ?? 2026)}</span>
                          <span class="rec-national" style="color:{rankColor(sr.rank)};">{sr.rank}위</span>
                          <span class="rec-regional">{titlesOfSeason(sr.season).join(" · ")}</span>
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
                  <tr>
                    <th>#</th><th>이름</th><th>역할/포지션</th><th>나이</th><th>OVR</th>
                    <!-- 남의 팀은 관측이 흐리다 — 헤더에 그렇게 적어 둔다 -->
                    <th class="gcol">성장{#if !sameClub}<span class="ghint">관측</span>{/if}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each allMembers.filter(e => e.role !== "owner") as row}
                    {@const d = (row.details as EntityDetails)?.player}
                    <tr
                      class:hero={row.id === $gameStore.protagonist.id}
                      class:clickable={row.role === "player"}
                      on:dblclick={() => { if (row.role === "player") playerModalId = row.id; }}
                      title={row.role === "player" ? "더블클릭: 선수 상세 보기" : undefined}
                    >
                      <td class="num">{d?.jerseyNumber ?? "-"}</td>
                      <td class="name-cell">
                        {row.name}
                        {#if row.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                        {#if natOf(row)}<span class="nat-tag">{natOf(row)?.label}</span>{/if}
                      </td>
                      <td>
                        {#if row.role === "player"}{playerPos(row)}
                        {:else if row.role === "manager"}<span class="role-badge role-mgr">감독</span>
                        {:else if row.role === "coach"}<span class="role-badge role-coach">코치</span>
                        {/if}
                      </td>
                      <td>{row.age}</td>
                      <td class="ovr-cell">{row.role === "player" ? playerOvr(row) : "-"}</td>
                      <td class="gcol">
                        {#if growthOf(row)}
                          {@const g = growthOf(row)}
                          <span class="gval {g?.tone}" class:fuzzy={!g?.exact}>{g?.label}</span>
                        {:else}
                          <span class="gnone">-</span>
                        {/if}
                      </td>
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
            <div class="pitcher-col">
              <!-- 선발 로테이션 -->
              <section class="lineup-section">
                <h4>선발 로테이션</h4>
                {#if spRotation.length === 0}
                  <p class="empty">투수 데이터 없음</p>
                {:else}
                  <div class="lineup-rows">
                    {#each spRotation as entry, i}
                      <div
                        class="lineup-row"
                        class:hero={entry.player.id === $gameStore.protagonist.id}
                        on:dblclick={() => { playerModalId = entry.player.id; }}
                        title="더블클릭: 선수 상세 보기"
                        style="cursor:pointer"
                      >
                        <span class="slot-label">{SP_LABELS[i] ?? `${i + 1}선발`}</span>
                        <span class="player-name">
                          {entry.player.name}
                          {#if entry.player.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                        </span>
                        <span class="pos-tag" class:pos-temp={entry.isTemp}>{playerPos(entry.player)}{entry.isTemp ? "*" : ""}</span>
                        <span class="ovr-tag">{playerOvr(entry.player)}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </section>

              <!-- 중계 투수 -->
              <section class="lineup-section">
                <h4>중계 투수 (RP)</h4>
                {#if bullpenData.rp.length === 0}
                  <p class="empty-sm">없음</p>
                {:else}
                  <div class="lineup-rows">
                    {#each bullpenData.rp as player}
                      <div
                        class="lineup-row"
                        class:hero={player.id === $gameStore.protagonist.id}
                        on:dblclick={() => { playerModalId = player.id; }}
                        title="더블클릭: 선수 상세 보기"
                        style="cursor:pointer"
                      >
                        <span class="slot-label rp-label">중계</span>
                        <span class="player-name">
                          {player.name}
                          {#if player.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                        </span>
                        <span class="pos-tag">RP</span>
                        <span class="ovr-tag">{playerOvr(player)}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </section>

              <!-- 마무리 투수 -->
              <section class="lineup-section">
                <h4>마무리 (CP)</h4>
                {#if bullpenData.cp.length === 0}
                  <p class="empty-sm">없음</p>
                {:else}
                  <div class="lineup-rows">
                    {#each bullpenData.cp as player}
                      <div
                        class="lineup-row"
                        class:hero={player.id === $gameStore.protagonist.id}
                        on:dblclick={() => { playerModalId = player.id; }}
                        title="더블클릭: 선수 상세 보기"
                        style="cursor:pointer"
                      >
                        <span class="slot-label cp-label">마무리</span>
                        <span class="player-name">
                          {player.name}
                          {#if player.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                        </span>
                        <span class="pos-tag">CP</span>
                        <span class="ovr-tag">{playerOvr(player)}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </section>

              <!-- 불펜 후보 (로테이션 외 SP) -->
              {#if bullpenData.extra.length > 0}
                <section class="lineup-section">
                  <h4>불펜 후보</h4>
                  <div class="lineup-rows">
                    {#each bullpenData.extra as player}
                      <div
                        class="lineup-row"
                        class:hero={player.id === $gameStore.protagonist.id}
                        on:dblclick={() => { playerModalId = player.id; }}
                        title="더블클릭: 선수 상세 보기"
                        style="cursor:pointer"
                      >
                        <span class="slot-label extra-label">후보</span>
                        <span class="player-name">
                          {player.name}
                          {#if player.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                        </span>
                        <span class="pos-tag pos-temp">SP</span>
                        <span class="ovr-tag">{playerOvr(player)}</span>
                      </div>
                    {/each}
                  </div>
                </section>
              {/if}
            </div>

            <section class="lineup-section">
              <h4>타순</h4>
              {#if lineupEntries.length === 0}
                <p class="empty">타자 데이터 없음</p>
              {:else}
                <div class="lineup-rows">
                  {#each lineupEntries as entry}
                    <div
                      class="lineup-row"
                      class:hero={entry.player.id === $gameStore.protagonist.id}
                      on:dblclick={() => { playerModalId = entry.player.id; }}
                      title="더블클릭: 선수 상세 보기"
                      style="cursor:pointer"
                    >
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

<PlayerDetailModal entityId={playerModalId} on:close={() => (playerModalId = "")} />

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(10, 18, 38, 0.52);
    display: flex; align-items: center; justify-content: center;
    z-index: 150;
  }

  .modal {
    background: var(--panel);
    border: 1px solid var(--ink-mute);
    border-radius: 14px;
    width: min(860px, 96vw);
    max-height: 90vh;
    display: grid;
    grid-template-rows: 4px auto minmax(0,1fr);
    overflow: hidden;
  }

  /* 컬러 바 */
  .color-bar { height: 4px; width: 100%; }
  .color-bar-default { background: linear-gradient(90deg, var(--ink-mute), var(--line)); }

  /* 헤더 */
  .modal-header {
    padding: 16px 24px 0;
    border-bottom: 1px solid var(--panel-sunk);
    display: grid; gap: 4px;
    position: relative;
  }

  .title-row {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding-right: 40px;
  }

  .team-colors-swatch { display: flex; gap: 3px; align-items: center; }
  .swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.15); display: inline-block; }

  h2 { margin: 0; font-size: 20px; color: var(--ink); }
  h4 { margin: 0 0 8px; font-size: 11px; color: var(--ink-mid); text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; }

  .league-badge {
    font-size: 11px; font-weight: 700;
    background: var(--panel-sunk); border: 1px solid var(--ink-mute);
    color: var(--ink); border-radius: 6px; padding: 3px 8px;
  }
  .tier-badge {
    font-size: 11px;
    background: rgba(154, 101, 16, 0.12); border: 1px solid var(--warn);
    color: var(--warn); border-radius: 6px; padding: 3px 8px;
  }

  .header-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .name-en { font-size: 12px; color: var(--ink-mute); }
  .meta-chip { font-size: 11px; color: var(--ink-mid); }

  .close-btn {
    position: absolute; top: 14px; right: 18px;
    background: none; border: none; color: var(--ink-mid);
    font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
  }
  .close-btn:hover { color: var(--ink); background: var(--panel-sunk); }

  .sub-tabs { display: flex; gap: 0; margin-top: 10px; }
  .sub-tabs button {
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--ink-mid); font-size: 13px; padding: 8px 16px; cursor: pointer;
  }
  .sub-tabs button:hover { color: var(--ink); }
  .sub-tabs button.active { color: var(--ink); border-bottom-color: var(--ink); font-weight: 600; }

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
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 8px 12px;
    display: grid; gap: 2px; text-align: center; min-width: 52px;
  }
  .kpi.kpi-wide { min-width: 90px; }
  .kpi span { font-size: 10px; color: var(--ink); }
  .kpi strong { font-size: 14px; color: var(--ink); }
  .win  { color: var(--ok); }
  .lose { color: var(--warn); }

  /* 팀 평가 */
  .eval-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .eval-item {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 7px 10px;
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
  }
  .eval-item span { font-size: 10px; color: var(--ink); white-space: nowrap; }
  .eval-item strong { font-size: 12px; color: var(--ink); text-align: right; }

  .prestige-badge {
    font-size: 13px !important; font-weight: 800 !important;
    border-radius: 4px; padding: 1px 6px;
  }

  .stars { font-size: 11px !important; color: var(--warn) !important; letter-spacing: 1px; }

  .fan-dots { font-style: normal; font-size: 8px; color: var(--ink-mid); letter-spacing: 1px; margin-left: 3px; }

  /* 팀 특성 */
  .desc { margin: 0; font-size: 12px; color: var(--ink); line-height: 1.65; }
  .tag-row { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag {
    font-size: 11px; color: var(--ink);
    border: 1px solid var(--line); background: var(--panel-sunk);
    border-radius: 999px; padding: 3px 8px;
  }
  .tag-style { color: var(--ink); border-color: var(--line); background: var(--panel-sunk); font-weight: 700; }

  .strength-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .strength-chip {
    font-size: 10px; color: var(--ok);
    border: 1px solid rgba(31, 122, 71, 0.28); background: rgba(31, 122, 71, 0.10);
    border-radius: 4px; padding: 2px 7px;
  }

  /* 팀 역사 */
  .history-kpi { display: flex; flex-wrap: wrap; gap: 8px; }
  .history-kpi > div {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 7px 12px;
    display: grid; gap: 2px; text-align: center;
  }
  .history-kpi span { font-size: 10px; color: var(--ink); }
  .history-kpi strong { font-size: 14px; color: var(--ink); }

  .title-years { display: flex; flex-wrap: wrap; gap: 4px; }
  .year-pill {
    font-size: 11px; color: var(--warn); font-weight: 700;
    background: rgba(240,192,96,0.12); border: 1px solid rgba(240,192,96,0.3);
    border-radius: 4px; padding: 2px 7px;
  }

  .peak-era {
    margin: 0; font-size: 12px; color: var(--ink-mid);
    font-style: italic; border-left: 2px solid var(--line); padding-left: 8px;
  }

  .rival-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 7px 10px; margin-bottom: 4px;
  }
  .rival-label { font-size: 10px; color: var(--ink); }
  .rival-name { font-size: 12px; color: var(--bad); font-weight: 700; }
  .rival-desc { font-size: 10px; color: var(--ink); }

  /* 최근 성적 */
  .records-list { display: grid; gap: 4px; }
  .record-row {
    display: grid; grid-template-columns: 44px 64px 56px 1fr;
    align-items: center; gap: 8px;
    background: var(--panel); border: 1px solid var(--panel-sunk);
    border-radius: 7px; padding: 6px 10px; font-size: 12px;
  }
  .rec-year { color: var(--ink-mid); font-size: 11px; font-weight: 700; }
  .rec-national { font-weight: 700; font-size: 12px; }
  .rec-regional { color: var(--ink); font-size: 11px; }
  .rec-note { color: var(--ink-mute); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* 공통 테이블 */
  .stbl { width: 100%; border-collapse: collapse; font-size: 12px; }
  .stbl th {
    color: var(--ink-mid); padding: 5px 8px; text-align: center;
    border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  .stbl td {
    padding: 5px 8px; text-align: center;
    color: var(--ink); border-bottom: 1px solid var(--panel-sunk); white-space: nowrap;
  }

  /* 로스터 */
  .roster-wrap { overflow-x: auto; }
  .roster-table tr.clickable { cursor: pointer; }
  .roster-table tr.clickable:hover td { background: rgba(80,120,200,0.08); }
  .roster-table td.num { color: var(--ink-mid); width: 32px; }
  .roster-table td.name-cell { text-align: left; color: var(--ink); }
  .roster-table td.ovr-cell { font-weight: 700; color: var(--ok); }
  .roster-table tr.hero td { color: var(--warn); font-weight: 700; background: rgba(240,224,96,0.05); }

  .role-badge { font-size: 10px; border-radius: 4px; padding: 2px 6px; font-weight: 700; }
  .role-mgr   { background: rgba(120,100,200,0.2); color: #5B3AA8; border: 1px solid rgba(90, 58, 168, 0.26); }
  .role-coach { background: rgba(80,160,220,0.15); color: var(--ink); border: 1px solid var(--line); }

  .hero-tag {
    font-size: 9px; background: rgba(240,224,96,0.2);
    color: var(--warn); border: 1px solid rgba(240,224,96,0.4);
    border-radius: 3px; padding: 0 4px; margin-left: 4px; vertical-align: middle;
  }

  /* 국적 — 외국인 슬롯 보유자만 붙는다 */
  .nat-tag {
    font-size: 9px; background: rgba(90, 58, 168, 0.10); color: #5B3AA8;
    border: 1px solid rgba(90, 58, 168, 0.10); border-radius: 3px;
    padding: 0 4px; margin-left: 4px; vertical-align: middle;
  }

  /* 성장 여지 — "잠재력"이 아니다. 천장까지 남은 거리다 */
  .gcol { width: 62px; }
  .ghint {
    display: block; font-size: 8px; font-weight: 400;
    color: var(--ink-mid); letter-spacing: 0;
  }
  .gval { font-weight: 800; font-size: 12px; }
  .gval.good { color: var(--ok); }
  .gval.mid  { color: var(--ink); }
  .gval.low  { color: var(--ink-mid); }
  /* 범위(B~D)는 글자가 길다 */
  .gval.fuzzy { font-size: 10.5px; font-weight: 700; letter-spacing: -0.02em; }
  .gnone { color: var(--ink-mute); }

  /* 선발라인업 */
  .mgr-banner {
    display: flex; align-items: center; gap: 10px;
    background: var(--panel-sunk); border: 1px solid var(--line);
    border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;
  }
  .mgr-label { font-size: 11px; color: var(--ink); }
  .mgr-banner strong { font-size: 14px; color: var(--ink); }
  .mgr-style {
    font-size: 11px; color: var(--ink);
    background: var(--panel-sunk); border: 1px solid var(--line);
    border-radius: 999px; padding: 2px 8px;
  }

  .lineup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  .pitcher-col { display: flex; flex-direction: column; gap: 14px; }
  .lineup-section { display: grid; gap: 6px; align-content: start; }
  .lineup-rows { display: grid; gap: 4px; }
  .lineup-row {
    display: grid; grid-template-columns: 52px 1fr 36px 32px;
    align-items: center; gap: 6px;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 7px; padding: 6px 8px; font-size: 12px;
  }
  .lineup-row.hero { border-color: rgba(240,224,96,0.4); background: rgba(240,224,96,0.05); }
  .slot-label { font-size: 11px; color: var(--ink-mid); font-weight: 700; white-space: nowrap; }
  .rp-label   { color: var(--ink); }
  .cp-label   { color: var(--warn); }
  .extra-label { color: var(--ink-mid); }
  .player-name { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pos-tag { text-align: center; font-size: 10px; color: var(--ink-mid); }
  .pos-temp { color: var(--warn); }
  .ovr-tag { text-align: right; font-weight: 700; color: var(--ok); font-size: 12px; }
  .empty-sm { margin: 0; font-size: 11px; color: var(--ink-mute); padding: 2px 0; }

  .empty { color: var(--ink); font-size: 13px; margin: 0; }

  @media (max-width: 700px) {
    .info-grid { grid-template-columns: 1fr; }
    .lineup-grid { grid-template-columns: 1fr; }
    .pitcher-col { gap: 10px; }
  }
</style>
