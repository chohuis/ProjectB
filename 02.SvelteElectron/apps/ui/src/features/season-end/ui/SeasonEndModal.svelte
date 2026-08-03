<script lang="ts">
  import { onMount } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import {
    loadFinanceRules, applyInvestment,
    type FinanceRulesFile, type InvestmentResult,
  } from "../../../shared/usecases/finance";
  import { seasonStore, currentStandings } from "../../../shared/stores/season";
  import { masterStore, teamMap } from "../../../shared/stores/master";
  import { runSeasonRollover } from "../../../shared/usecases/seasonRollover";
  import {
    computeAwards, loadAwardRules, type AwardRules,
  } from "../../../shared/usecases/seasonAwards";
  import { leagueStatsOf } from "../../../shared/utils/season-helpers";
  import type { PitcherSeasonStats, BatterSeasonStats, CareerAward, CareerGameLogEntry } from "../../../shared/types/save";
  import type { PitcherGameLine } from "../../../shared/types/season";

  export let onExit: () => void;

  let isProcessing = false;
  let activeTab: "season" | "team" | "personal" = "season";

  // ── 시즌말 투자 (§7-5 F-3) ────────────────────────────────────
  //
  // **여기가 유일한 투자 시점이다.** 상시 화면에 두면 매주 눌러보는 도박이 되고,
  // DESIGN §7.3의 "가계부 없이 상시 잔액만" 원칙과도 어긋난다.
  let financeRules: FinanceRulesFile | null = null;
  let awardRules: AwardRules | null = null;
  let investAmount = 0;
  let investDone: InvestmentResult | null = null;
  let investBusy = false;

  $: investCash = p.money;
  $: canInvest = !!financeRules
    && !investDone
    && (p.careerStage === "pro" || p.careerStage.startsWith("pro_"))
    && investCash >= financeRules.investment.minCash;

  onMount(async () => {
    try {
      financeRules = await loadFinanceRules();
      // 기본 제안액 = 현금의 1/4. 전액을 기본값으로 두면 실수로 다 넣는다
      investAmount = Math.max(
        financeRules.investment.minCash,
        Math.floor(p.money / 4 / 100) * 100,
      );
    } catch (e) {
      console.warn("[SeasonEnd] 재정 규칙 로드 실패 — 투자 선택지를 숨긴다", e);
    }
    try {
      awardRules = await loadAwardRules();
    } catch (e) {
      console.warn("[SeasonEnd] 수상 규칙 로드 실패 — 시상 항목을 숨긴다", e);
    }
  });

  async function chooseInvestment(optionId: string): Promise<void> {
    if (investBusy || !canInvest) return;
    investBusy = true;
    try {
      investDone = await applyInvestment({
        optionId,
        amount: Math.min(investAmount, p.money),
        seasonYear: $seasonStore.seasonYear,
      });
    } catch (e) {
      console.warn("[SeasonEnd] 투자 정산 실패", e);
    } finally {
      investBusy = false;
    }
  }

  function moneyLabel(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 10_000) {
      const eok = v / 10_000;
      return `${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(2)}억`;
    }
    return `${Math.round(v).toLocaleString()}만`;
  }

  $: p = $gameStore.protagonist;
  $: myTeamId = p.teamId;
  $: myStanding = $seasonStore.standings.find((s) => s.teamId === myTeamId);
  $: myRank = $currentStandings.findIndex((s) => s.teamId === myTeamId) + 1;
  $: totalTeams = $seasonStore.standings.length;

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

  // ⚠ **여기서 직접 계산하지 않는다.** 예전엔 이 자리에 자체 집계가 있었고
  // 자격선이 `ip>=20` / `ab>=50`이라 규칙 파일(`minIp` 60~70, `minPa` 120~200)과
  // 달랐다. `minValue` 하한도 없어서 **화면에 뜬 수상자와 경력기록에 남는
  // 수상자가 서로 달랐다.** 게다가 `$seasonStore.stats`를 읽었는데 그건
  // 주인공 개인 버킷이라 승강하면 1군·2군이 합산된다.
  //
  // 정본은 `usecases/seasonAwards.ts`의 `computeAwards` 하나다.
  $: seasonAwards = awardRules
    ? computeAwards(awardRules, leagueStatsOf($seasonStore, $seasonStore.leagueId))
    : [];

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

  async function handleNewSeason() {
    if (isProcessing) return;
    isProcessing = true;

    // grade는 processSeasonEnd 호출 전 값을 기준으로 reinit 여부 판단
    const gradeBeforeAdvance = p.grade;

    try {
    const now = $seasonStore.seasonYear;
    const pid = p.id;
    const mySeasonSt = $seasonStore.stats[pid];

    // 부문 목록이 규칙 파일에서 오므로 여기 if문을 늘릴 일이 없다 —
    // 예전엔 4개만 하드코딩돼 있어 탈삼진왕·세이브왕·타점왕·도루왕이 빠졌다
    const protagonistAwards: CareerAward[] = seasonAwards
      .filter((a) => a.playerId === pid)
      .map((a) => ({ id: a.defId, label: a.label, value: a.valueText }));

    let statLine = "";
    if (mySeasonSt?.type === "pitcher") {
      const ps = mySeasonSt as PitcherSeasonStats;
      statLine = `${ps.w}승 ${ps.l}패 ERA ${ps.era.toFixed(2)} ${ps.ip.toFixed(1)}이닝 ${ps.k}K`;
    } else if (mySeasonSt?.type === "batter") {
      const bs = mySeasonSt as BatterSeasonStats;
      statLine = `타율 ${pct(bs.avg)} ${bs.hr}홈런 ${bs.rbi}타점`;
    }

    const gameLog: CareerGameLogEntry[] = protagonistGames
      .filter(g => g.line != null)
      .map(g => ({
        week:       g.entry.week,
        opponentId: g.oppTeamId,
        myScore:    g.myScore,
        oppScore:   g.oppScore,
        ip:         g.line!.ip,
        er:         g.line!.er,
        h:          g.line!.h,
        k:          g.line!.k,
        bb:         g.line!.bb,
        decision:   g.line!.decision,
        pitchCount: g.line!.pitchCount,
      }));

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
      gameLog,
    }, mySeasonSt ?? undefined);
    // ── 세계 처리는 usecase로 ─────────────────────────────────
    // 학년 진급·드래프트·오프시즌·에이징·새 시즌 초기화는 전부
    // `usecases/seasonRollover.ts`에 있다. 여기 두면 헤드리스로 못 부르고,
    // 실제로 Phase 8 계측이 오프시즌만 통째로 비워둔 채 진행됐다.
    //
    // 이 컴포넌트에 남는 건 **표시와 사용자 선택**뿐이다.
    await runSeasonRollover({ seasonYear: now, gradeBeforeAdvance });
    } finally {
      isProcessing = false;
    }
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
        </section>

        <!-- 시즌 시상 -->
        {#if seasonAwards.length > 0}
          <section class="section">
            <h4>시즌 시상</h4>
            <div class="awards-grid">
              {#each seasonAwards as a (a.defId)}
                <div class="award" class:award-mine={a.playerId === p.id}>
                  <span class="award-label">{a.label}</span>
                  <strong class="award-name">{entityName(a.playerId)}</strong>
                  <span class="award-val">{a.valueText}</span>
                </div>
              {/each}
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
              <span>최종 순위</span>
              <strong class:gold={myRank === 1} class:silver={myRank === 2} class:bronze={myRank === 3}>
                {myRank > 0 ? `${myRank} / ${totalTeams}위` : "—"}
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

        <!-- ── 시즌말 투자 (§7-5 F-3) ───────────────────────────── -->
        {#if investDone}
          <section class="section">
            <h4>투자 결과</h4>
            <div class="invest-result" class:invest-loss={investDone.profit < 0}>
              <strong>{investDone.name}</strong>
              <span>
                {moneyLabel(investDone.principal)} 투자 →
                {investDone.profit >= 0 ? "+" : ""}{moneyLabel(investDone.profit)}
                ({(investDone.rate * 100).toFixed(1)}%)
              </span>
              <span class="invest-note">
                {investDone.profit >= 0 ? "자산에 반영됐습니다." : "손실이 자산에서 차감됐습니다."}
              </span>
            </div>
          </section>
        {:else if canInvest && financeRules}
          <section class="section">
            <h4>시즌말 투자</h4>
            <p class="invest-lead">
              보유 현금 {moneyLabel(investCash)} 중
              <strong>{moneyLabel(Math.min(investAmount, investCash))}</strong>을 굴립니다.
              <span class="invest-warn">고위험 선택지는 원금을 잃을 수 있습니다.</span>
            </p>
            <div class="invest-amounts">
              {#each [4, 2, 1] as div}
                <button
                  class="invest-amt"
                  class:active={investAmount === Math.floor(investCash / div / 100) * 100}
                  disabled={investBusy}
                  on:click={() => (investAmount = Math.max(
                    financeRules?.investment.minCash ?? 0,
                    Math.floor(investCash / div / 100) * 100,
                  ))}
                >
                  {div === 1 ? "전액" : `1/${div}`}
                </button>
              {/each}
            </div>
            <div class="invest-options">
              {#each financeRules.investment.options as opt}
                <button class="invest-opt" disabled={investBusy} on:click={() => chooseInvestment(opt.id)}>
                  <strong>{opt.name}</strong>
                  <span class="invest-stat">
                    평균 {(opt.mean * 100).toFixed(0)}%
                    {#if opt.sd > 0}· 변동 ±{(opt.sd * 100).toFixed(0)}%{:else}· 확정{/if}
                  </span>
                  <span class="invest-desc">{opt.desc}</span>
                </button>
              {/each}
            </div>
          </section>
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
  /* ── 시즌말 투자 (§7-5 F-3) ───────────────────────────────────── */
  .invest-lead { font-size: 12px; color: #aac0e4; margin: 0 0 8px; line-height: 1.6; }
  .invest-lead strong { color: #eef4ff; }
  .invest-warn { color: #ffb68a; }

  .invest-amounts { display: flex; gap: 6px; margin-bottom: 8px; }
  .invest-amt {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 5px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .invest-amt.active { background: #3262b0; border-color: #6da1f7; }
  .invest-amt:disabled { opacity: 0.5; cursor: default; }

  .invest-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .invest-opt {
    display: grid;
    gap: 3px;
    text-align: left;
    border: 1px solid #2f486f;
    background: #152b4f;
    color: #dce5f7;
    border-radius: 10px;
    padding: 10px;
    cursor: pointer;
  }
  .invest-opt:hover:not(:disabled) { border-color: #6da1f7; background: #1b3762; }
  .invest-opt:disabled { opacity: 0.5; cursor: default; }
  .invest-opt strong { color: #eef4ff; font-size: 13px; }
  .invest-stat { color: #9eb6de; font-size: 11px; }
  .invest-desc { color: #7f96bd; font-size: 11px; line-height: 1.4; }

  .invest-result {
    display: grid;
    gap: 4px;
    border: 1px solid #3a6b4c;
    background: #16301f;
    border-radius: 10px;
    padding: 12px;
  }
  .invest-result.invest-loss { border-color: #7a3b3b; background: #2a1620; }
  .invest-result strong { color: #eef4ff; font-size: 14px; }
  .invest-result span { color: #cfe0ff; font-size: 12px; }
  .invest-note { color: #9eb6de; font-size: 11px; }

  @media (max-width: 900px) {
    .invest-options { grid-template-columns: 1fr; }
  }

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
