<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore, currentStandings } from "../../../shared/stores/season";
  import { masterStore, teamMap } from "../../../shared/stores/master";
  import type { EntityRow } from "../../../shared/stores/master";
  import type { HighSchoolMaster, NamedNpcMeta, PitcherSeasonStats, BatterSeasonStats, SchoolScenario, CareerAward } from "../../../shared/types/save";
  import type { PitcherGameLine } from "../../../shared/types/season";

  export let onExit: () => void;

  let isProcessing = false;
  let activeTab: "season" | "team" | "personal" = "season";

  $: p = $gameStore.protagonist;
  $: myTeamId = p.teamId;
  $: myStanding = $seasonStore.standings.find((s) => s.teamId === myTeamId);
  $: myRank = $currentStandings.findIndex((s) => s.teamId === myTeamId) + 1;
  $: totalTeams = $seasonStore.standings.length;

  // ── A/B조 분리 ─────────────────────────────────────────────────
  $: isHighschool = p.careerStage === "highschool";
  $: groupA = $seasonStore.hsGroupA ?? [];
  $: groupB = $seasonStore.hsGroupB ?? [];
  $: myIsGroupA = groupA.includes(myTeamId);
  $: standingsA = $currentStandings.filter((s) => groupA.includes(s.teamId));
  $: standingsB = $currentStandings.filter((s) => groupB.includes(s.teamId));
  $: myGroupStandings = myIsGroupA ? standingsA : standingsB;
  $: myGroupRank = myGroupStandings.findIndex((s) => s.teamId === myTeamId) + 1;
  $: myGroupTotal = myGroupStandings.length;

  // ── 포스트시즌 결과 ─────────────────────────────────────────────
  $: postseasonResult = (() => {
    const psEntries = $seasonStore.schedule.filter((e) => e.phase === "postseason");
    if (psEntries.length === 0) return null;
    const finalEntry = psEntries.find((e) => e.id.startsWith("PS_FINAL_"));
    if (!finalEntry?.result) return null;
    const champion = finalEntry.result.winnerId;
    const runnerUp = finalEntry.result.loserId ?? "";
    let myResult: "champion" | "runnerUp" | "semiFinal" | "notQualified" = "notQualified";
    if (champion === myTeamId) myResult = "champion";
    else if (runnerUp === myTeamId) myResult = "runnerUp";
    else if (psEntries.some((e) => e.id.startsWith("PS_SEMI") && (e.homeTeamId === myTeamId || e.awayTeamId === myTeamId))) myResult = "semiFinal";
    return { champion, runnerUp, myResult };
  })();

  $: postseasonTeams = (() => {
    const teams = new Set<string>();
    for (const e of $seasonStore.schedule) {
      if (e.phase === "postseason" && e.id.startsWith("PS_SEMI")) {
        teams.add(e.homeTeamId);
        teams.add(e.awayTeamId);
      }
    }
    return teams;
  })();

  // ── 시즌 시상 (리그 전체) ───────────────────────────────────────
  function entityName(id: string): string {
    return $masterStore.entities.find((e) => e.id === id)?.name ?? id;
  }

  $: seasonAwards = (() => {
    const stats = $seasonStore.stats;
    let eraKing: { id: string; name: string; era: number } | null = null;
    let winKing: { id: string; name: string; w:   number } | null = null;
    let avgKing: { id: string; name: string; avg: number } | null = null;
    let hrKing:  { id: string; name: string; hr:  number } | null = null;
    for (const [id, s] of Object.entries(stats)) {
      if (s.type === "pitcher") {
        const ps = s as PitcherSeasonStats;
        if (ps.ip >= 20) {
          if (!eraKing || ps.era < eraKing.era) eraKing = { id, name: entityName(id), era: ps.era };
          if (!winKing || ps.w   > winKing.w)   winKing = { id, name: entityName(id), w:   ps.w   };
        }
      } else {
        const bs = s as BatterSeasonStats;
        if (bs.ab >= 50) {
          if (!avgKing || bs.avg > avgKing.avg) avgKing = { id, name: entityName(id), avg: bs.avg };
          if (!hrKing  || bs.hr  > hrKing.hr)  hrKing  = { id, name: entityName(id), hr:  bs.hr  };
        }
      }
    }
    return { eraKing, winKing, avgKing, hrKing };
  })();

  // ── 팀 경기 기록 ────────────────────────────────────────────────
  $: teamGames = $seasonStore.schedule
    .filter((e) =>
      (e.homeTeamId === myTeamId || e.awayTeamId === myTeamId) &&
      !e.isFriendly && !!e.result && e.phase !== "offseason",
    )
    .sort((a, b) => a.week - b.week)
    .map((e) => {
      const isHome   = e.homeTeamId === myTeamId;
      const oppTeamId = isHome ? e.awayTeamId : e.homeTeamId;
      const myScore  = isHome ? e.result!.homeScore : e.result!.awayScore;
      const oppScore = isHome ? e.result!.awayScore : e.result!.homeScore;
      return { entry: e, isHome, oppTeamId, myScore, oppScore, won: myScore > oppScore, draw: myScore === oppScore };
    });

  // ── 팀 내 베스트 선수 ───────────────────────────────────────────
  $: teamMemberIds = new Set(
    $masterStore.entities.filter((e) => e.teamId === myTeamId && e.id !== p.id).map((e) => e.id),
  );

  $: teamBestPitcher = (() => {
    let best: { id: string; name: string; era: number; w: number; ip: number } | null = null;
    for (const [id, s] of Object.entries($seasonStore.stats)) {
      if (!teamMemberIds.has(id) || s.type !== "pitcher") continue;
      const ps = s as PitcherSeasonStats;
      if (ps.ip < 10) continue;
      if (!best || ps.era < best.era) best = { id, name: entityName(id), era: ps.era, w: ps.w, ip: ps.ip };
    }
    return best;
  })();

  $: teamBestBatter = (() => {
    let best: { id: string; name: string; avg: number; hr: number; rbi: number } | null = null;
    for (const [id, s] of Object.entries($seasonStore.stats)) {
      if (!teamMemberIds.has(id) || s.type !== "batter") continue;
      const bs = s as BatterSeasonStats;
      if (bs.ab < 20) continue;
      if (!best || bs.avg > best.avg) best = { id, name: entityName(id), avg: bs.avg, hr: bs.hr, rbi: bs.rbi };
    }
    return best;
  })();

  // ── 개인 통합 스탯 ──────────────────────────────────────────────
  $: mySeasonStats = $seasonStore.stats[p.id] ?? null;
  $: myPitchingStats = mySeasonStats?.type === "pitcher" ? (mySeasonStats as PitcherSeasonStats) : null;
  $: myBattingStats  = mySeasonStats?.type === "batter"  ? (mySeasonStats as BatterSeasonStats)  : null;

  // ── 개인 경기별 기록 (공식경기만) ────────────────────────────────
  $: protagonistGames = $seasonStore.schedule
    .filter((e) => e.isProtagonistGame && !e.isFriendly && !!e.result)
    .sort((a, b) => a.week - b.week)
    .map((e) => {
      const line = e.result!.playerLines.find(
        (l) => l.playerId === p.id && l.role === "pitcher",
      ) as PitcherGameLine | undefined;
      const isHome    = e.homeTeamId === myTeamId;
      const oppTeamId = isHome ? e.awayTeamId : e.homeTeamId;
      const myScore   = isHome ? e.result!.homeScore : e.result!.awayScore;
      const oppScore  = isHome ? e.result!.awayScore : e.result!.homeScore;
      return { entry: e, line, oppTeamId, myScore, oppScore };
    });

  function tName(id: string): string {
    return $teamMap.get(id)?.name ?? id;
  }

  function decisionLabel(d: string): string {
    if (d === "W") return "승";
    if (d === "L") return "패";
    if (d === "SV") return "SV";
    if (d === "HD") return "HD";
    return "무";
  }

  function pct(n: number): string {
    return n.toFixed(3).replace(/^0\./, ".");
  }

  // ── 새 시즌 처리 ────────────────────────────────────────────────
  async function loadHighschoolContext(schoolId: string): Promise<{
    school: HighSchoolMaster;
    scenario: SchoolScenario;
    namedRegistry: NamedNpcMeta[];
    entities: EntityRow[];
  } | null> {
    if (!window.projectB?.masterFetch) return null;
    try {
      const [school, scenario, namedWrap, entityIndex] = await Promise.all([
        window.projectB.masterFetch(`schools/highschool/${schoolId}.json`) as Promise<HighSchoolMaster | null>,
        window.projectB.masterFetch(`schools/highschool/school_scenarios/${schoolId}_scenario.json`) as Promise<SchoolScenario | null>,
        window.projectB.masterFetch("schools/highschool/named_npc_registry.json") as Promise<{ list?: NamedNpcMeta[] } | NamedNpcMeta[] | null>,
        window.projectB.masterFetch("entities/players/_index.json") as Promise<{ byLeague?: Record<string, string[]> } | null>,
      ]);
      if (!school || !scenario || !entityIndex?.byLeague) return null;
      const namedRegistry = Array.isArray(namedWrap) ? namedWrap : (namedWrap?.list ?? []);
      const ids  = entityIndex.byLeague.LEAGUE_HIGHSCHOOL ?? [];
      const rows = (await Promise.all(
        ids.map((id) => window.projectB!.masterFetch!("entities/players/" + id + ".json") as Promise<EntityRow | null>),
      )).filter((r): r is EntityRow => !!r);
      return { school, scenario, namedRegistry, entities: rows };
    } catch {
      return null;
    }
  }

  async function handleNewSeason() {
    if (isProcessing) return;
    isProcessing = true;

    const now = $seasonStore.seasonYear;
    const pid = p.id;
    const mySeasonSt = $seasonStore.stats[pid];

    const protagonistAwards: CareerAward[] = [];
    if (seasonAwards.eraKing?.id === pid) protagonistAwards.push({ id: "era_king", label: "ERA왕",  value: seasonAwards.eraKing.era.toFixed(2) });
    if (seasonAwards.winKing?.id === pid) protagonistAwards.push({ id: "win_king", label: "다승왕", value: `${seasonAwards.winKing.w}승` });
    if (seasonAwards.avgKing?.id === pid) protagonistAwards.push({ id: "avg_king", label: "타격왕", value: pct(seasonAwards.avgKing.avg) });
    if (seasonAwards.hrKing?.id  === pid) protagonistAwards.push({ id: "hr_king",  label: "홈런왕", value: `${seasonAwards.hrKing.hr}홈런` });

    let statLine = "";
    if (mySeasonSt?.type === "pitcher") {
      const ps = mySeasonSt as PitcherSeasonStats;
      statLine = `${ps.w}승 ${ps.l}패 ERA ${ps.era.toFixed(2)} ${ps.ip.toFixed(1)}이닝 ${ps.k}K`;
    } else if (mySeasonSt?.type === "batter") {
      const bs = mySeasonSt as BatterSeasonStats;
      statLine = `타율 ${pct(bs.avg)} ${bs.hr}홈런 ${bs.rbi}타점`;
    }

    gameStore.appendCareerRecord({
      year: now,
      leagueId: p.leagueId,
      teamId:   p.teamId,
      rank:       myRank    > 0 ? myRank    : undefined,
      totalTeams: totalTeams > 0 ? totalTeams : undefined,
      wins:   myStanding?.wins,
      losses: myStanding?.losses,
      draws:  myStanding?.draws,
      statLine,
      ovr:    p.pitching.ovr,
      awards: protagonistAwards,
      psResult: postseasonResult?.myResult,
    }, mySeasonSt ?? undefined);

    // ── 프로(KBL/ABL/JBL): pendingNextContract 적용 후 새 시즌 초기화 ──
    const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(p.careerStage);
    if (isProStage) {
      const leagueStats2: Record<string, Record<string, import("../../../shared/types/save").PlayerSeasonStats>> = {};
      for (const [lid, ls] of Object.entries($seasonStore.leagueState)) leagueStats2[lid] = ls.stats;
      gameStore.applySeasonHistory($seasonStore.stats, leagueStats2, now);
      await seasonStore.flushAllLeagueStatsToDb(now);
      await gameStore.processAllLeaguesSeasonEnd(now);
      await gameStore.applyAgingDecay();
      gameStore.advanceSeasonYear($seasonStore.seasonYear);

      // ── 2군 리그 우승팀 발표 메시지 ────────────────────────────
      const FARM_LEAGUE_NAMES: Record<string, string> = {
        LEAGUE_KBL_FARM: "KBL 2군", LEAGUE_ABL_FARM: "ABL 마이너", LEAGUE_JBL_FARM: "JBL 2군",
      };
      for (const [lid, label] of Object.entries(FARM_LEAGUE_NAMES)) {
        const ls = $seasonStore.leagueState[lid];
        if (!ls || ls.standings.length === 0) continue;
        const sorted = [...ls.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
        if (!sorted.some((s) => s.wins + s.losses > 0)) continue;
        const champion = $masterStore.teams.find((t) => t.id === sorted[0].teamId)?.name ?? sorted[0].teamId;
        const runnerUp = sorted[1]
          ? ($masterStore.teams.find((t) => t.id === sorted[1].teamId)?.name ?? sorted[1].teamId)
          : "-";
        gameStore.addMessage({
          id: `msg-farm-champion-${lid}-${now}`,
          category: "news", sender: "리그 사무국",
          subject: `${now} ${label} 시즌 종료`,
          preview: `${label} 우승: ${champion}`,
          body: [
            `${now} ${label} 정규리그가 종료되었습니다.`,
            ``,
            `우승: ${champion}  (${sorted[0].wins}승 ${sorted[0].losses}패)`,
            `준우승: ${runnerUp}`,
          ].join("\n"),
          createdAt: `W${$seasonStore.currentWeek}`, readAt: null,
        });
      }

      const pending = p.pendingNextContract;
      if (pending) {
        gameStore.applyPendingNextContract();
        const proTeamIds = $masterStore.teams
          .filter((t) => t.leagueId === pending.leagueId)
          .map((t) => t.id);
        const seasonYear = ($seasonStore.seasonYear || 2026) + 1;
        const { generateKblSchedule, generateAblSchedule, generateJblSchedule } = await import("../../../shared/utils/scheduleGen");
        const { shuffleAblConferences } = await import("../../../shared/utils/postseasonEngine");
        const isAbl = pending.leagueId === "LEAGUE_ABL";
        const isJbl = pending.leagueId === "LEAGUE_JBL";
        seasonStore.initSeason(pending.leagueId, seasonYear, 52, proTeamIds);
        seasonStore.setSchedule(
          isAbl ? await generateAblSchedule(proTeamIds, pending.teamId) :
          isJbl ? await generateJblSchedule(proTeamIds, pending.teamId) :
                  await generateKblSchedule(proTeamIds, pending.teamId),
        );
        if (isAbl) {
          const { east, west } = await shuffleAblConferences(proTeamIds);
          seasonStore.setAblConferences(east, west);
        }
      } else {
        // 미서명 상태 — 최소 계약 강제 (Step 3에서 정상 처리, 여기는 폴백)
        seasonStore.startNewSeason();
      }

      await gameStore.save();
      await seasonStore.save();
      isProcessing = false;
      return;
    }

    // ── 독립리그: 오프시즌 W39~W47에 careerChoiceHub로 이미 처리됨 ──
    // SeasonEndModal에서는 연간 정산만 진행

    let progressedByHighschoolSync = false;
    if (p.careerStage === "highschool" && p.schoolId) {
      const ctx = await loadHighschoolContext(p.schoolId);
      if (ctx) {
        await gameStore.processSeasonEnd(now, ctx.school, ctx.namedRegistry, ctx.entities, now * 100);
        progressedByHighschoolSync = true;
        gameStore.addMessage({
          id: `msg-season-hs-sync-${Date.now()}`,
          category: "news",
          sender: "연감",
          subject: `${now} 시즌 졸업/승급 반영`,
          preview: "고교 선수 학년 승급과 졸업 대상 정리가 반영되었습니다.",
          body: ["고교 시즌 종료 동기화가 완료되었습니다.", "NPC 학년 승급과 졸업 처리가 반영되었습니다.", "졸업 대상은 드래프트/진로 처리 풀로 이관되었습니다."].join("\n"),
          createdAt: `Y${now}`,
          readAt: null,
        });
      }
    }

    const leagueStats: Record<string, Record<string, import("../../../shared/types/save").PlayerSeasonStats>> = {};
    for (const [lid, ls] of Object.entries($seasonStore.leagueState)) leagueStats[lid] = ls.stats;
    gameStore.applySeasonHistory($seasonStore.stats, leagueStats, now);

    // ── 연간 병역 현황 메시지 (매년 발송) ─────────────────────
    type OffseasonSummary = { militaryEnlistedSports?: string[]; militaryEnlistedGeneral?: string[]; militaryDischargedNames?: string[] };
    const offseasonSummary = (window as Window & { __lastOffseasonSummary?: OffseasonSummary | null }).__lastOffseasonSummary ?? null;
    if (offseasonSummary) {
      const sports   = offseasonSummary.militaryEnlistedSports ?? [];
      const general  = offseasonSummary.militaryEnlistedGeneral ?? [];
      const discharged = offseasonSummary.militaryDischargedNames ?? [];
      if (sports.length + general.length + discharged.length > 0) {
        const lines: string[] = [];
        if (sports.length)    lines.push(`◆ 체육부대 입대 (${sports.length}명)\n  ${sports.slice(0, 5).join(", ")}${sports.length > 5 ? ` 외 ${sports.length - 5}명` : ""}`);
        if (general.length)   lines.push(`◆ 일반부대 입대 (${general.length}명)\n  ${general.slice(0, 3).join(", ")}${general.length > 3 ? ` 외 ${general.length - 3}명` : ""}`);
        if (discharged.length) lines.push(`◆ 전역 (${discharged.length}명)\n  ${discharged.slice(0, 3).join(", ")}${discharged.length > 3 ? ` 외 ${discharged.length - 3}명` : ""}`);
        gameStore.addMessage({
          id: `msg-military-annual-${now}`,
          category: "news", sender: "병무청",
          subject: `${now} 시즌 병역 현황`,
          preview: `입대 ${sports.length + general.length}명, 전역 ${discharged.length}명`,
          body: lines.join("\n\n"),
          createdAt: `Y${now}`, readAt: null,
        });
      }
      (window as Window & { __lastOffseasonSummary?: unknown }).__lastOffseasonSummary = null;
    }
    await seasonStore.flushAllLeagueStatsToDb(now);
    await gameStore.processAllLeaguesSeasonEnd(now);
    await gameStore.applyAgingDecay();
    if (!progressedByHighschoolSync) gameStore.advanceSeasonYear($seasonStore.seasonYear);
    seasonStore.startNewSeason();

    if (p.careerStage === "highschool" && p.grade != null && p.grade < 3) {
      const allHsIds = $masterStore.teams.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL").map((t) => t.id);
      await seasonStore.reinitHighschoolSeason(p.teamId, allHsIds);
    }

    await gameStore.save();
    await seasonStore.save();
    isProcessing = false;
  }
</script>

<div class="overlay">
  <div class="modal" class:is-champion={postseasonResult?.myResult === "champion"}>

    <!-- ── 헤더 ───────────────────────────────────────────────── -->
    <header class="modal-header">
      <p class="season-label">{$seasonStore.seasonYear} 시즌 종료</p>
      <h2>{postseasonResult?.myResult === "champion" ? "🏆 우승" : "시즌 결산"}</h2>
      <p class="sub">
        {p.grade ? `${p.grade}학년` : p.careerStage}
        · {tName(myTeamId)}
        {#if isHighschool}&nbsp;· {myIsGroupA ? "A조" : "B조"}{/if}
      </p>
    </header>

    <!-- ── 탭바 ──────────────────────────────────────────────── -->
    <nav class="tabbar">
      <button class:active={activeTab === "season"}   on:click={() => (activeTab = "season")}>시즌</button>
      <button class:active={activeTab === "team"}     on:click={() => (activeTab = "team")}>팀</button>
      <button class:active={activeTab === "personal"} on:click={() => (activeTab = "personal")}>개인</button>
    </nav>

    <!-- ── 바디 (스크롤) ──────────────────────────────────────── -->
    <div class="modal-body">

      <!-- ══════════════ 시즌 탭 ══════════════ -->
      {#if activeTab === "season"}

        <!-- 포스트시즌 결과 -->
        {#if postseasonResult}
          <section class="section">
            <h4>포스트시즌</h4>
            {#if postseasonResult.myResult === "champion"}
              <div class="champion-banner">🏆 {tName(myTeamId)} — {$seasonStore.seasonYear} 시즌 우승</div>
            {:else}
              <div class="ps-cards">
                <div class="ps-card ps-card-champ">
                  <span class="ps-card-label">우승</span>
                  <strong class="ps-card-team">🏆 {tName(postseasonResult.champion)}</strong>
                </div>
                {#if postseasonResult.runnerUp}
                  <div class="ps-card">
                    <span class="ps-card-label">준우승</span>
                    <strong class="ps-card-team">{tName(postseasonResult.runnerUp)}</strong>
                  </div>
                {/if}
                <div class="ps-card ps-card-mine"
                  class:ps-mine-runner={postseasonResult.myResult === "runnerUp"}
                  class:ps-mine-semi={postseasonResult.myResult === "semiFinal"}
                >
                  <span class="ps-card-label">우리 팀</span>
                  <strong class="ps-card-team">
                    {postseasonResult.myResult === "runnerUp"  ? "준우승" :
                     postseasonResult.myResult === "semiFinal" ? "4강 탈락" : "미진출"}
                  </strong>
                </div>
              </div>
            {/if}
          </section>
        {/if}

        <!-- 리그 순위표 -->
        <section class="section">
          <h4>리그 순위표</h4>

          {#if isHighschool && standingsA.length > 0 && standingsB.length > 0}
            <div class="two-col">
              {#each [{ label: "A조", rows: standingsA, isMine: myIsGroupA }, { label: "B조", rows: standingsB, isMine: !myIsGroupA }] as grp}
                <div class="group-block">
                  <p class="group-label" class:my-group={grp.isMine}>{grp.label}{grp.isMine ? " ★" : ""}</p>
                  <table>
                    <thead><tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>승률</th></tr></thead>
                    <tbody>
                      {#each grp.rows as s, i}
                        <tr class:my-row={s.teamId === myTeamId}>
                          <td class="rank-cell">
                            {i + 1}
                            {#if postseasonResult?.champion === s.teamId}
                              <span class="badge badge-champ">우승</span>
                            {:else if postseasonResult?.runnerUp === s.teamId}
                              <span class="badge badge-runner">준우승</span>
                            {:else if postseasonTeams.has(s.teamId)}
                              <span class="badge badge-ps">PS</span>
                            {/if}
                          </td>
                          <td class="team-name">{tName(s.teamId)}</td>
                          <td>{s.wins}</td>
                          <td>{s.losses}</td>
                          <td>{pct(s.winPct)}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/each}
            </div>
          {:else}
            <table>
              <thead><tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>득실</th></tr></thead>
              <tbody>
                {#each $currentStandings as s, i}
                  <tr class:my-row={s.teamId === myTeamId}>
                    <td class="rank-cell">
                      {i + 1}
                      {#if postseasonResult?.champion === s.teamId}
                        <span class="badge badge-champ">우승</span>
                      {:else if postseasonTeams.has(s.teamId)}
                        <span class="badge badge-ps">PS</span>
                      {/if}
                    </td>
                    <td class="team-name">{tName(s.teamId)}</td>
                    <td>{s.wins}</td>
                    <td>{s.losses}</td>
                    <td>{s.draws ?? 0}</td>
                    <td>{pct(s.winPct)}</td>
                    <td>{s.runsFor}–{s.runsAgainst}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </section>

        <!-- 시즌 시상 -->
        {#if seasonAwards.eraKing || seasonAwards.winKing || seasonAwards.avgKing || seasonAwards.hrKing}
          <section class="section">
            <h4>시즌 시상</h4>
            <div class="awards-grid">
              {#if seasonAwards.eraKing}
                <div class="award" class:award-mine={seasonAwards.eraKing.id === p.id}>
                  <span class="award-label">ERA왕</span>
                  <strong class="award-name">{seasonAwards.eraKing.name}</strong>
                  <span class="award-val">{seasonAwards.eraKing.era.toFixed(2)}</span>
                </div>
              {/if}
              {#if seasonAwards.winKing}
                <div class="award" class:award-mine={seasonAwards.winKing.id === p.id}>
                  <span class="award-label">다승왕</span>
                  <strong class="award-name">{seasonAwards.winKing.name}</strong>
                  <span class="award-val">{seasonAwards.winKing.w}승</span>
                </div>
              {/if}
              {#if seasonAwards.avgKing}
                <div class="award" class:award-mine={seasonAwards.avgKing.id === p.id}>
                  <span class="award-label">타격왕</span>
                  <strong class="award-name">{seasonAwards.avgKing.name}</strong>
                  <span class="award-val">{pct(seasonAwards.avgKing.avg)}</span>
                </div>
              {/if}
              {#if seasonAwards.hrKing}
                <div class="award" class:award-mine={seasonAwards.hrKing.id === p.id}>
                  <span class="award-label">홈런왕</span>
                  <strong class="award-name">{seasonAwards.hrKing.name}</strong>
                  <span class="award-val">{seasonAwards.hrKing.hr}홈런</span>
                </div>
              {/if}
            </div>
          </section>
        {/if}

      <!-- ══════════════ 팀 탭 ══════════════ -->
      {:else if activeTab === "team"}

        <!-- 팀 시즌 요약 -->
        <section class="section">
          <h4>팀 최종 성적</h4>
          <div class="kpi-row">
            <div class="kpi">
              <span>{isHighschool ? (myIsGroupA ? "A조 순위" : "B조 순위") : "최종 순위"}</span>
              <strong class:gold={myGroupRank === 1} class:silver={myGroupRank === 2} class:bronze={myGroupRank === 3}>
                {myGroupRank > 0 ? `${myGroupRank} / ${myGroupTotal}위` : "—"}
              </strong>
            </div>
            <div class="kpi">
              <span>시즌 성적</span>
              <strong>{myStanding?.wins ?? 0}승 {myStanding?.losses ?? 0}패{myStanding?.draws ? ` ${myStanding.draws}무` : ""}</strong>
            </div>
            <div class="kpi">
              <span>승률</span>
              <strong>{myStanding ? pct(myStanding.winPct) : "—"}</strong>
            </div>
            <div class="kpi">
              <span>득실</span>
              <strong>{myStanding?.runsFor ?? 0}–{myStanding?.runsAgainst ?? 0}</strong>
            </div>
          </div>
        </section>

        <!-- 팀 내 베스트 -->
        {#if teamBestPitcher || teamBestBatter}
          <section class="section">
            <h4>팀 내 베스트</h4>
            <div class="best-grid">
              {#if teamBestPitcher}
                <div class="best-card">
                  <span class="best-label">최우수 투수</span>
                  <strong class="best-name">{teamBestPitcher.name}</strong>
                  <div class="best-stats">
                    <span>ERA <strong>{teamBestPitcher.era.toFixed(2)}</strong></span>
                    <span>{teamBestPitcher.w}승</span>
                    <span>{teamBestPitcher.ip.toFixed(1)}IP</span>
                  </div>
                </div>
              {/if}
              {#if teamBestBatter}
                <div class="best-card">
                  <span class="best-label">최우수 타자</span>
                  <strong class="best-name">{teamBestBatter.name}</strong>
                  <div class="best-stats">
                    <span>타율 <strong>{pct(teamBestBatter.avg)}</strong></span>
                    <span>{teamBestBatter.hr}홈런</span>
                    <span>{teamBestBatter.rbi}타점</span>
                  </div>
                </div>
              {/if}
            </div>
          </section>
        {/if}

        <!-- 팀 경기 기록 -->
        {#if teamGames.length > 0}
          <section class="section">
            <h4>팀 경기 기록 <span class="sub-count">{teamGames.length}경기</span></h4>
            <div class="game-log-wrap">
              <table class="game-log">
                <thead>
                  <tr>
                    <th>주차</th>
                    <th>홈/원정</th>
                    <th>상대팀</th>
                    <th>점수</th>
                    <th>결과</th>
                  </tr>
                </thead>
                <tbody>
                  {#each teamGames as g}
                    <tr class:row-won={g.won} class:row-draw={g.draw} class:row-lost={!g.won && !g.draw}>
                      <td>W{g.entry.week}</td>
                      <td class="loc-cell">{g.isHome ? "홈" : "원정"}</td>
                      <td class="opp-name">{tName(g.oppTeamId)}</td>
                      <td class="score-cell">{g.myScore} – {g.oppScore}</td>
                      <td class="dec-cell"
                        class:dec-w={g.won}
                        class:dec-l={!g.won && !g.draw}
                        class:dec-d={g.draw}
                      >{g.won ? "승" : g.draw ? "무" : "패"}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </section>
        {/if}

      <!-- ══════════════ 개인 탭 ══════════════ -->
      {:else}

        <!-- 개인 통합 스탯 -->
        {#if myPitchingStats || myBattingStats}
          <section class="section">
            <h4>시즌 통합 스탯</h4>
            {#if myPitchingStats}
              <div class="stat-grid">
                <div class="stat-item"><span>등판</span><strong>{myPitchingStats.g}</strong></div>
                <div class="stat-item"><span>선발</span><strong>{myPitchingStats.gs}</strong></div>
                <div class="stat-item"><span>승</span><strong>{myPitchingStats.w}</strong></div>
                <div class="stat-item"><span>패</span><strong>{myPitchingStats.l}</strong></div>
                <div class="stat-item"><span>ERA</span>
                  <strong class:era-good={myPitchingStats.era < 3.0} class:era-bad={myPitchingStats.era >= 5.0}>
                    {myPitchingStats.era.toFixed(2)}
                  </strong>
                </div>
                <div class="stat-item"><span>IP</span><strong>{myPitchingStats.ip.toFixed(1)}</strong></div>
                <div class="stat-item"><span>K</span><strong>{myPitchingStats.k}</strong></div>
                <div class="stat-item"><span>BB</span><strong>{myPitchingStats.bb}</strong></div>
                <div class="stat-item"><span>WHIP</span><strong>{myPitchingStats.whip.toFixed(2)}</strong></div>
              </div>
            {:else if myBattingStats}
              <div class="stat-grid">
                <div class="stat-item"><span>타율</span><strong>{pct(myBattingStats.avg)}</strong></div>
                <div class="stat-item"><span>G</span><strong>{myBattingStats.g}</strong></div>
                <div class="stat-item"><span>타수</span><strong>{myBattingStats.ab}</strong></div>
                <div class="stat-item"><span>홈런</span><strong>{myBattingStats.hr}</strong></div>
                <div class="stat-item"><span>타점</span><strong>{myBattingStats.rbi}</strong></div>
                <div class="stat-item"><span>OPS</span><strong>{myBattingStats.ops.toFixed(3)}</strong></div>
              </div>
            {/if}
          </section>
        {/if}

        <!-- 경기별 기록 -->
        {#if protagonistGames.length > 0}
          <section class="section">
            <h4>경기별 기록 <span class="sub-count">{protagonistGames.length}경기 · 친선경기 제외</span></h4>
            <div class="game-log-wrap">
              <table class="game-log">
                <thead>
                  <tr>
                    <th>주차</th>
                    <th>상대팀</th>
                    <th>점수</th>
                    <th>IP</th>
                    <th>ER</th>
                    <th>K</th>
                    <th>BB</th>
                    <th>결과</th>
                  </tr>
                </thead>
                <tbody>
                  {#each protagonistGames as g}
                    {@const won  = g.myScore > g.oppScore}
                    {@const draw = g.myScore === g.oppScore}
                    <tr class:row-won={won} class:row-draw={draw} class:row-lost={!won && !draw}>
                      <td>W{g.entry.week}</td>
                      <td class="opp-name">{tName(g.oppTeamId)}</td>
                      <td class="score-cell">{g.myScore} – {g.oppScore}</td>
                      {#if g.line}
                        <td>{g.line.ip.toFixed(1)}</td>
                        <td>{g.line.er}</td>
                        <td>{g.line.k}</td>
                        <td>{g.line.bb}</td>
                        <td class="dec-cell"
                          class:dec-w={g.line.decision === "W"}
                          class:dec-l={g.line.decision === "L"}
                        >{decisionLabel(g.line.decision)}</td>
                      {:else}
                        <td colspan="5" class="no-entry">미등판</td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </section>
        {:else}
          <p class="empty-state">기록된 경기가 없습니다.</p>
        {/if}

      {/if}

    </div><!-- /modal-body -->

    <!-- ── 푸터 (고정) ─────────────────────────────────────────── -->
    <footer class="modal-footer">
      <button class="btn-next" on:click={handleNewSeason} disabled={isProcessing}>
        {isProcessing ? "처리 중…" : "새 시즌 시작"}
      </button>
    </footer>

  </div>
</div>

<style>
  /* ── 오버레이 ─────────────────────────────────────────────────── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  /* ── 모달 ────────────────────────────────────────────────────── */
  .modal {
    background: #0e1a30;
    border: 1px solid #3a5888;
    border-radius: 16px;
    width: min(680px, 92vw);
    max-height: 88vh;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    overflow: hidden;
  }

  .modal.is-champion {
    border-color: #a08020;
    box-shadow: 0 0 24px rgba(240, 180, 40, 0.25);
  }

  /* ── 헤더 ────────────────────────────────────────────────────── */
  .modal-header {
    padding: 18px 24px 12px;
    text-align: center;
    border-bottom: 1px solid #1e3058;
    display: grid;
    gap: 3px;
  }

  .season-label {
    margin: 0;
    font-size: 11px;
    color: #6a8ab8;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  h2 { margin: 0; font-size: 21px; color: #e8f0ff; }

  .sub { margin: 0; font-size: 12px; color: #7a9ac8; }

  /* ── 탭바 ────────────────────────────────────────────────────── */
  .tabbar {
    display: flex;
    border-bottom: 1px solid #1e3058;
    background: #0c1828;
  }

  .tabbar button {
    flex: 1;
    padding: 10px 0;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #5a7aa8;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
  }

  .tabbar button:hover { color: #a0c0e8; }

  .tabbar button.active {
    color: #d0e8ff;
    border-bottom-color: #4a90e0;
  }

  /* ── 바디 ────────────────────────────────────────────────────── */
  .modal-body {
    overflow-y: auto;
    padding: 16px 24px;
    display: grid;
    gap: 18px;
    align-content: start;
    min-height: 0;
  }

  .modal-body::-webkit-scrollbar { width: 6px; }
  .modal-body::-webkit-scrollbar-track { background: transparent; }
  .modal-body::-webkit-scrollbar-thumb { background: #2a4068; border-radius: 3px; }

  /* ── 섹션 공통 ───────────────────────────────────────────────── */
  .section { display: grid; gap: 10px; }

  h4 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    color: #6a8ab8;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding-bottom: 6px;
    border-bottom: 1px solid #1a2e50;
  }

  .sub-count { font-size: 10px; color: #506888; font-weight: 400; text-transform: none; letter-spacing: 0; }

  .empty-state { color: #506888; font-size: 13px; text-align: center; padding: 24px 0; margin: 0; }

  /* ── 우승 배너 ───────────────────────────────────────────────── */
  .champion-banner {
    background: linear-gradient(90deg, #2a1e04, #3a2a06, #2a1e04);
    border: 1px solid #a08020;
    border-radius: 8px;
    padding: 10px 16px;
    color: #f5d050;
    font-size: 15px;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.5px;
  }

  /* ── 포스트시즌 카드 ─────────────────────────────────────────── */
  .ps-cards {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .ps-card {
    background: #111e38;
    border: 1px solid #1e3458;
    border-radius: 10px;
    padding: 10px 16px;
    display: grid;
    gap: 4px;
    min-width: 100px;
  }

  .ps-card-champ { border-color: #a08020; background: #1e1a04; }

  .ps-card.ps-mine-runner { border-color: #608090; }

  .ps-card-label { font-size: 10px; color: #6a8ab8; }

  .ps-card-team { font-size: 14px; color: #d8e8ff; }

  .ps-card-champ .ps-card-team { color: #f5d050; }

  /* ── KPI ─────────────────────────────────────────────────────── */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .kpi {
    background: #111e38;
    border: 1px solid #1e3458;
    border-radius: 10px;
    padding: 10px 8px;
    display: grid;
    gap: 4px;
    text-align: center;
  }

  .kpi span   { font-size: 10px; color: #6a8ab8; }
  .kpi strong { font-size: 15px; color: #d8e8ff; }
  .kpi strong.gold   { color: #f5d050; }
  .kpi strong.silver { color: #c8d8f0; }
  .kpi strong.bronze { color: #e0a060; }

  /* ── 팀 베스트 ───────────────────────────────────────────────── */
  .best-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .best-card {
    background: #111e38;
    border: 1px solid #1e3458;
    border-radius: 10px;
    padding: 12px 14px;
    display: grid;
    gap: 6px;
  }

  .best-label { font-size: 10px; color: #5a7a9a; }
  .best-name  { font-size: 15px; color: #d8e8ff; }

  .best-stats {
    display: flex;
    gap: 10px;
    font-size: 11px;
    color: #7a9ab8;
    flex-wrap: wrap;
  }

  .best-stats strong { color: #a0d0f8; }

  /* ── 개인 스탯 그리드 ────────────────────────────────────────── */
  .stat-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .stat-item {
    background: #111e38;
    border: 1px solid #1e3458;
    border-radius: 8px;
    padding: 7px 12px;
    display: grid;
    gap: 2px;
    text-align: center;
    min-width: 52px;
  }

  .stat-item span   { font-size: 10px; color: #6a8ab8; }
  .stat-item strong { font-size: 15px; color: #d8e8ff; }

  .era-good { color: #60e890 !important; }
  .era-bad  { color: #f07060 !important; }

  /* ── 경기 기록 테이블 공통 ───────────────────────────────────── */
  .game-log-wrap { overflow-x: auto; }

  .game-log {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    white-space: nowrap;
  }

  .game-log thead th {
    color: #6a8ab8;
    padding: 5px 8px;
    text-align: center;
    border-bottom: 1px solid #1e3458;
    font-weight: 600;
  }

  .game-log tbody td {
    padding: 5px 8px;
    text-align: center;
    color: #9ab4d8;
    border-bottom: 1px solid #141f38;
  }

  .opp-name   { text-align: left; color: #b8ccec; }
  .score-cell { font-variant-numeric: tabular-nums; }
  .loc-cell   { font-size: 10px; color: #6a8ab8; }

  .row-won  td { background: rgba(40, 100, 50, 0.18); }
  .row-lost td { background: rgba(100, 30, 30, 0.15); }

  .dec-cell { font-weight: 700; }
  .dec-w { color: #60e890; }
  .dec-l { color: #f07060; }
  .dec-d { color: #9ab4d8; }

  .no-entry { color: #456 !important; font-style: italic; }

  /* ── 시상 ────────────────────────────────────────────────────── */
  .awards-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .award {
    background: #111e38;
    border: 1px solid #1e3458;
    border-radius: 10px;
    padding: 10px 8px;
    display: grid;
    gap: 4px;
    text-align: center;
  }

  .award.award-mine { border-color: #f0c040; background: #1e1a04; }

  .award-label { font-size: 10px; color: #f0c060; font-weight: 700; letter-spacing: 0.5px; }
  .award-name  { font-size: 12px; color: #e8f0ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .award-val   { font-size: 14px; color: #80d8ff; font-weight: 700; }

  /* ── 순위표 공통 ─────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; font-size: 11px; }

  thead th {
    color: #6a8ab8;
    padding: 5px 8px;
    text-align: center;
    border-bottom: 1px solid #1e3458;
    font-weight: 600;
  }

  tbody td {
    padding: 5px 8px;
    text-align: center;
    color: #9ab4d8;
    border-bottom: 1px solid #111d34;
  }

  .team-name { text-align: left; color: #b8ccec; }
  .rank-cell { white-space: nowrap; }

  tr.my-row td { color: #f0e060; font-weight: 700; background: rgba(60, 80, 20, 0.25); }

  /* ── 뱃지 ────────────────────────────────────────────────────── */
  .badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    border-radius: 3px;
    padding: 1px 4px;
    margin-left: 3px;
    vertical-align: middle;
  }

  .badge-champ  { background: #3a2a04; color: #f5d050; border: 1px solid #a08020; }
  .badge-runner { background: #1a2a40; color: #a0b8d8; border: 1px solid #607090; }
  .badge-ps     { background: #1a2a40; color: #7090b8; border: 1px solid #304a68; }

  /* ── A/B조 2열 ───────────────────────────────────────────────── */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .group-block { display: grid; gap: 6px; }

  .group-label {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    color: #506888;
    letter-spacing: 0.5px;
  }

  .group-label.my-group { color: #80b0e0; }

  /* ── 푸터 ────────────────────────────────────────────────────── */
  .modal-footer {
    padding: 12px 24px 18px;
    border-top: 1px solid #1e3058;
    display: flex;
    justify-content: center;
  }

  .btn-next {
    padding: 11px 48px;
    background: #1a4a2a;
    color: #60e890;
    border: 1px solid #2e8050;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-next:hover:not(:disabled) { background: #235c34; }
  .btn-next:disabled { opacity: 0.5; cursor: default; }
</style>
