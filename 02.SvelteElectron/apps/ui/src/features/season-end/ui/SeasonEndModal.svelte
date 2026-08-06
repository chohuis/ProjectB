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
  import TeamMark from "../../team/ui/TeamMark.svelte";
  import { qualificationOf } from "../../../shared/utils/leaderboard";
  import { splitByGroup } from "../../../shared/utils/standingsGroups";
  import { TOURNAMENTS } from "../../../shared/utils/leagueTeams.generated";
  import { teamRun, runSummary, tournamentPhase } from "../../../shared/utils/tournamentView";
  import { rispSplit, rispTone } from "../../../shared/utils/playerTraits";
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

  // ── 순위: 권역 / 전체 ───────────────────────────────────────
  //
  // ⚠ **평면 순위표 하나뿐이었다.** 고교는 8권역으로 나뉘어 도는데 결산은
  // 102교를 한 줄로 세워서, 내 팀이 3위인지 47위인지가 실제 경쟁 상대와
  // 무관한 숫자였다. 리그 화면은 이미 권역별로 나눠 본다(`splitByGroup`) —
  // 같은 유틸을 쓴다. 여기서 다시 나누면 둘이 어긋난다.
  let rankScope: "group" | "all" = "group";
  $: stadiumName = (id: string) =>
    $masterStore.stadiums.find((x) => x.id === id)?.name ?? id.replace(/^STADIUM_/, "");
  $: groupsView = splitByGroup($seasonStore.leagueId, $currentStandings, stadiumName);
  $: myGroup = groupsView.find((g) => g.rows.some((r) => r.teamId === myTeamId)) ?? null;
  // 권역이 없는 리그(프로 등)는 토글 자체를 안 그린다
  $: hasGroups = groupsView.length > 1 && myGroup !== null;
  $: shownStandings = hasGroups && rankScope === "group"
    ? (myGroup?.rows ?? []) : $currentStandings;
  $: shownRank = shownStandings.findIndex((r) => r.teamId === myTeamId) + 1;

  // ── 대회 ────────────────────────────────────────────────────
  //
  // ⚠ **결산에 대회가 통째로 없었다.** 그래서 안 나간 건지 져서 떨어진
  // 건지 화면에서 구분이 안 됐다. 미참가도 한 줄로 적는다.
  $: myTours = TOURNAMENTS
    .filter((def) => def.leagueId === $seasonStore.leagueId)
    .map((def) => {
      const bracket = $seasonStore.tournaments?.[def.id] ?? null;
      const group   = $seasonStore.groupStages?.[def.id] ?? null;
      const phase   = tournamentPhase(def, $seasonStore.currentWeek, bracket, group);
      const run     = teamRun(bracket, myTeamId);
      return { def, phase, run, summary: runSummary(run, phase) };
    });

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

  // ── 리그 대비 · 득점권 (U9-c) ─────────────────────────────────
  //
  // **혼자만의 숫자로는 잘한 시즌인지 모른다.** ERA 4.20이 좋은 해인지는
  // 그 리그가 어땠는지에 달렸다 — 고교와 KBL은 득점 환경이 다르다.
  //
  // 규정 미달 선수를 평균에 넣으면 리그가 나빠 보인다(한 경기 5실점 한 투수가
  // ERA 45로 들어온다). `leaderboard`가 쓰는 것과 같은 기준으로 거른다.
  $: leagueComparison = (() => {
    const all = Object.values(leagueStatsOf($seasonStore, $seasonStore.leagueId));
    const games = $seasonStore.schedule.filter((e) => !e.isFriendly && !!e.result).length;
    const q = qualificationOf(Math.max(1, Math.round(games / 2)));

    if (myPitchingStats) {
      const peers = all.filter(
        (s): s is PitcherSeasonStats => s.type === "pitcher" && (s.ip ?? 0) >= q.ip,
      );
      if (peers.length < 3) return null;
      const er = peers.reduce((a, s) => a + (s.er ?? 0), 0);
      const ip = peers.reduce((a, s) => a + (s.ip ?? 0), 0);
      if (ip <= 0) return null;
      const lgEra = (er * 9) / ip;
      const rank = peers.filter((s) => (s.era ?? 99) < myPitchingStats!.era).length + 1;
      return {
        kind: "pitcher" as const, label: "ERA",
        mine: myPitchingStats.era.toFixed(2),
        league: lgEra.toFixed(2),
        // 투수는 낮을수록 좋다
        better: myPitchingStats.era < lgEra,
        rank, of: peers.length,
      };
    }
    if (myBattingStats) {
      const peers = all.filter(
        (s): s is BatterSeasonStats => s.type === "batter" && (s.pa ?? 0) >= q.pa,
      );
      if (peers.length < 3) return null;
      const h = peers.reduce((a, s) => a + (s.h ?? 0), 0);
      const ab = peers.reduce((a, s) => a + (s.ab ?? 0), 0);
      if (ab <= 0) return null;
      const lgAvg = h / ab;
      const rank = peers.filter((s) => (s.avg ?? 0) > myBattingStats!.avg).length + 1;
      return {
        kind: "batter" as const, label: "타율",
        mine: pct(myBattingStats.avg),
        league: pct(lgAvg),
        better: myBattingStats.avg > lgAvg,
        rank, of: peers.length,
      };
    }
    return null;
  })();

  /** 득점권 — 엔진이 재는데 시즌 결산에도 안 나오고 있었다 */
  $: myRisp = (() => {
    const st = mySeasonStats as (typeof mySeasonStats & { rispAb?: number; rispH?: number }) | null;
    if (!st) return null;
    const kind = st.type === "pitcher" ? "pitcher" as const : "batter" as const;
    const base = kind === "batter"
      ? (myBattingStats?.avg ?? null)
      : (myPitchingStats && myPitchingStats.ip > 0
          ? myPitchingStats.h / (myPitchingStats.ip * 3 + myPitchingStats.h)
          : null);
    const s = rispSplit(st, kind, base);
    return s ? { ...s, kind, tone: rispTone(s.delta, kind) } : null;
  })();

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
          <div class="sec-head">
            <h4>리그 순위표</h4>
            {#if hasGroups}
              <div class="scope">
                <button class:on={rankScope === "group"} type="button"
                        on:click={() => (rankScope = "group")}>{myGroup?.label ?? "권역"}</button>
                <button class:on={rankScope === "all"} type="button"
                        on:click={() => (rankScope = "all")}>전체</button>
              </div>
            {/if}
          </div>
          {#if hasGroups}
            <p class="scope-note">
              {rankScope === "group"
                ? `${myGroup?.label} ${shownStandings.length}팀 중 ${shownRank}위`
                : `전체 ${$currentStandings.length}팀 중 ${myRank}위`}
            </p>
          {/if}

          <table>
            <thead><tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>득실</th></tr></thead>
            <tbody>
              {#each shownStandings as s, i}
                <tr class:my-row={s.teamId === myTeamId}>
                  <td class="rank-cell">
                    {i + 1}
                    {#if postseasonResult?.champion === s.teamId}
                      <span class="badge badge-champ">우승</span>
                    {:else if postseasonTeams.has(s.teamId)}
                      <span class="badge badge-ps">PS</span>
                    {/if}
                  </td>
                  <td class="team-name">
                    <TeamMark teamId={s.teamId} size={16} />
                    <span>{tName(s.teamId)}</span>
                  </td>
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

        <!-- 대회 — 미참가도 적는다 -->
        {#if myTours.length > 0}
          <section class="section">
            <h4>대회</h4>
            <ul class="tours">
              {#each myTours as t}
                <li class:champ={t.run?.champion === true}>
                  <span class="t-name">{t.def.name}</span>
                  <span class="t-res" data-none={!t.run?.reached}>
                    {t.phase === "upcoming" ? "안 열림" : (t.summary || "미참가")}
                  </span>
                  {#if t.run?.champion}<span class="t-star">우승</span>{/if}
                </li>
              {/each}
            </ul>
          </section>
        {/if}

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

            <!--
              혼자만의 숫자로는 잘한 시즌인지 모른다. ERA 4.20이 좋은 해인지는
              그 리그 득점 환경에 달렸다 — 고교와 KBL이 다르다.
            -->
            {#if leagueComparison}
              <div class="lg-compare">
                <span class="lg-lbl">리그 대비 {leagueComparison.label}</span>
                <b class="lg-mine" class:good={leagueComparison.better} class:bad={!leagueComparison.better}>
                  {leagueComparison.mine}
                </b>
                <span class="lg-vs">vs 리그 {leagueComparison.league}</span>
                <span class="lg-rank">규정 {leagueComparison.of}명 중 {leagueComparison.rank}위</span>
              </div>
            {/if}

            {#if myRisp}
              <div class="lg-compare">
                <span class="lg-lbl">{myRisp.label}</span>
                <b class="lg-mine {myRisp.tone}">{myRisp.text}</b>
                {#if myRisp.delta != null && myRisp.tone !== "flat"}
                  <span class="lg-vs">
                    시즌 대비 {myRisp.delta > 0 ? "+" : ""}{myRisp.delta.toFixed(3).replace(/^(-?)0/, "$1")}
                  </span>
                {/if}
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
  .invest-lead { font-size: 12px; color: var(--ink); margin: 0 0 8px; line-height: 1.6; }
  .invest-lead strong { color: var(--ink); }
  .invest-warn { color: var(--warn); }

  .invest-amounts { display: flex; gap: 6px; margin-bottom: 8px; }
  .invest-amt {
    border: 1px solid var(--ink-mute);
    background: var(--panel-sunk);
    color: var(--ink);
    border-radius: 8px;
    padding: 5px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .invest-amt.active { background: var(--ink-mute); border-color: var(--ink); }
  .invest-amt:disabled { opacity: 0.5; cursor: default; }

  .invest-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .invest-opt {
    display: grid;
    gap: 3px;
    text-align: left;
    border: 1px solid var(--line);
    background: var(--panel-sunk);
    color: var(--ink);
    border-radius: 10px;
    padding: 10px;
    cursor: pointer;
  }
  .invest-opt:hover:not(:disabled) { border-color: var(--ink); background: var(--line); }
  .invest-opt:disabled { opacity: 0.5; cursor: default; }
  .invest-opt strong { color: var(--ink); font-size: 13px; }
  .invest-stat { color: var(--ink); font-size: 11px; }
  .invest-desc { color: var(--ink-mid); font-size: 11px; line-height: 1.4; }

  .invest-result {
    display: grid;
    gap: 4px;
    border: 1px solid var(--ok);
    background: rgba(31, 122, 71, 0.10);
    border-radius: 10px;
    padding: 12px;
  }
  .invest-result.invest-loss { border-color: rgba(179, 49, 31, 0.26); background: var(--panel); }
  .invest-result strong { color: var(--ink); font-size: 14px; }
  .invest-result span { color: var(--ink); font-size: 12px; }
  .invest-note { color: var(--ink); font-size: 11px; }

  @media (max-width: 900px) {
    .invest-options { grid-template-columns: 1fr; }
  }

  /* ── 오버레이 ─────────────────────────────────────────────────── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 18, 38, 0.52);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  /* ── 모달 ────────────────────────────────────────────────────── */
  .modal {
    background: var(--panel);
    border: 1px solid var(--ink-mute);
    border-radius: 16px;
    width: min(680px, 92vw);
    max-height: 88vh;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    overflow: hidden;
  }

  .modal.is-champion {
    border-color: var(--warn);
    box-shadow: 0 0 24px rgba(240, 180, 40, 0.25);
  }

  /* ── 헤더 ────────────────────────────────────────────────────── */
  .modal-header {
    padding: 18px 24px 12px;
    text-align: center;
    border-bottom: 1px solid var(--panel-sunk);
    display: grid;
    gap: 3px;
  }

  .season-label {
    margin: 0;
    font-size: 11px;
    color: var(--ink-mid);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  h2 { margin: 0; font-size: 21px; color: var(--ink); }

  .sub { margin: 0; font-size: 12px; color: var(--ink-mid); }

  /* ── 탭바 ────────────────────────────────────────────────────── */
  .tabbar {
    display: flex;
    border-bottom: 1px solid var(--panel-sunk);
    background: var(--panel);
  }

  .tabbar button {
    flex: 1;
    padding: 10px 0;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--ink-mute);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
  }

  .tabbar button:hover { color: var(--ink); }

  .tabbar button.active {
    color: var(--ink);
    border-bottom-color: var(--ink-mid);
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


  /* ── 섹션 공통 ───────────────────────────────────────────────── */
  .section { display: grid; gap: 10px; }

  h4 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-mid);
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--panel-sunk);
  }

  .sub-count { font-size: 10px; color: var(--ink-mute); font-weight: 400; text-transform: none; letter-spacing: 0; }

  .empty-state { color: var(--ink-mute); font-size: 13px; text-align: center; padding: 24px 0; margin: 0; }

  /* ── 우승 배너 ───────────────────────────────────────────────── */
  .champion-banner {
    background: linear-gradient(90deg, rgba(154, 101, 16, 0.12), rgba(154, 101, 16, 0.12), rgba(154, 101, 16, 0.12));
    border: 1px solid var(--warn);
    border-radius: 8px;
    padding: 10px 16px;
    color: var(--warn);
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
    background: var(--panel-sunk);
    border: 1px solid var(--panel-sunk);
    border-radius: 10px;
    padding: 10px 16px;
    display: grid;
    gap: 4px;
    min-width: 100px;
  }

  .ps-card-champ { border-color: var(--warn); background: rgba(154, 101, 16, 0.12); }

  .ps-card.ps-mine-runner { border-color: var(--ink-mute); }

  .ps-card-label { font-size: 10px; color: var(--ink-mid); }

  .ps-card-team { font-size: 14px; color: var(--ink); }

  .ps-card-champ .ps-card-team { color: var(--warn); }

  /* ── KPI ─────────────────────────────────────────────────────── */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .kpi {
    background: var(--panel-sunk);
    border: 1px solid var(--panel-sunk);
    border-radius: 10px;
    padding: 10px 8px;
    display: grid;
    gap: 4px;
    text-align: center;
  }

  .kpi span   { font-size: 10px; color: var(--ink-mid); }
  .kpi strong { font-size: 15px; color: var(--ink); }
  .kpi strong.gold   { color: var(--warn); }
  .kpi strong.silver { color: var(--ink); }
  .kpi strong.bronze { color: var(--warn); }

  /* ── 팀 베스트 ───────────────────────────────────────────────── */
  .best-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .best-card {
    background: var(--panel-sunk);
    border: 1px solid var(--panel-sunk);
    border-radius: 10px;
    padding: 12px 14px;
    display: grid;
    gap: 6px;
  }

  .best-label { font-size: 10px; color: var(--ink-mute); }
  .best-name  { font-size: 15px; color: var(--ink); }

  .best-stats {
    display: flex;
    gap: 10px;
    font-size: 11px;
    color: var(--ink-mid);
    flex-wrap: wrap;
  }

  .best-stats strong { color: var(--ink); }

  /* ── 개인 스탯 그리드 ────────────────────────────────────────── */
  .stat-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .stat-item {
    background: var(--panel-sunk);
    border: 1px solid var(--panel-sunk);
    border-radius: 8px;
    padding: 7px 12px;
    display: grid;
    gap: 2px;
    text-align: center;
    min-width: 52px;
  }

  .stat-item span   { font-size: 10px; color: var(--ink-mid); }
  .stat-item strong { font-size: 15px; color: var(--ink); }

  /* 리그 대비 · 득점권 — 스탯 격자 아래 한 줄씩 */
  .lg-compare {
    display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;
    margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--panel-sunk);
  }
  .lg-lbl  { font-size: 11px; color: var(--ink-mid); }
  .lg-mine { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ink); }
  .lg-mine.good { color: var(--ok); }
  .lg-mine.bad  { color: var(--bad); }
  .lg-mine.flat { color: var(--ink); }
  .lg-vs   { font-size: 11px; color: var(--ink-mid); font-variant-numeric: tabular-nums; }
  .lg-rank { font-size: 11px; color: var(--ink-mid); margin-left: auto; }

  .era-good { color: var(--ok) !important; }
  .era-bad  { color: var(--bad) !important; }

  /* ── 경기 기록 테이블 공통 ───────────────────────────────────── */
  .game-log-wrap { overflow-x: auto; }

  .game-log {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    white-space: nowrap;
  }

  .game-log thead th {
    color: var(--ink-mid);
    padding: 5px 8px;
    text-align: center;
    border-bottom: 1px solid var(--panel-sunk);
    font-weight: 600;
  }

  .game-log tbody td {
    padding: 5px 8px;
    text-align: center;
    color: var(--ink);
    border-bottom: 1px solid var(--panel-sunk);
  }

  .opp-name   { text-align: left; color: var(--ink); }
  .score-cell { font-variant-numeric: tabular-nums; }
  .loc-cell   { font-size: 10px; color: var(--ink-mid); }

  .row-won  td { background: rgba(40, 100, 50, 0.18); }
  .row-lost td { background: rgba(100, 30, 30, 0.15); }

  .dec-cell { font-weight: 700; }
  .dec-w { color: var(--ok); }
  .dec-l { color: var(--bad); }
  .dec-d { color: var(--ink); }

  .no-entry { color: #456 !important; font-style: italic; }

  /* ── 시상 ────────────────────────────────────────────────────── */
  .awards-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .award {
    background: var(--panel-sunk);
    border: 1px solid var(--panel-sunk);
    border-radius: 10px;
    padding: 10px 8px;
    display: grid;
    gap: 4px;
    text-align: center;
  }

  .award.award-mine { border-color: var(--warn); background: rgba(154, 101, 16, 0.12); }

  .award-label { font-size: 10px; color: var(--warn); font-weight: 700; letter-spacing: 0.5px; }
  .award-name  { font-size: 12px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .award-val   { font-size: 14px; color: var(--ink); font-weight: 700; }

  /* ── 순위표 공통 ─────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; font-size: 11px; }

  thead th {
    color: var(--ink-mid);
    padding: 5px 8px;
    text-align: center;
    border-bottom: 1px solid var(--panel-sunk);
    font-weight: 600;
  }

  tbody td {
    padding: 5px 8px;
    text-align: center;
    color: var(--ink);
    border-bottom: 1px solid var(--panel);
  }

  .team-name {
    text-align: left; color: var(--ink);
    display: flex; align-items: center; gap: 7px;
  }
  .rank-cell { white-space: nowrap; }

  .sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .scope { display: flex; gap: 4px; }
  .scope button {
    border: 1px solid var(--line); background: var(--panel); color: var(--ink-mid);
    border-radius: 999px; font-size: 11px; padding: 2px 10px; cursor: pointer;
  }
  .scope button.on { background: var(--t-dark); border-color: var(--t-dark); color: var(--ink-on-dark); }
  .scope-note { margin: 4px 0 0; font-size: 11.5px; color: var(--ink-mute); }

  .tours { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .tours li { display: flex; align-items: baseline; gap: 9px; font-size: 12.5px; }
  .t-name { color: var(--ink); min-width: 88px; }
  .t-res { color: var(--ink-mid); }
  /* 미참가·안 열림은 성적이 아니다 — 같은 굵기로 두면 8강처럼 읽힌다 */
  .t-res[data-none="true"] { color: var(--ink-mute); }
  .t-star {
    font-size: 10px; font-weight: 800; color: #6B4200;
    background: var(--t-gold); border-radius: 2px; padding: 1px 6px;
  }
  .tours li.champ .t-res { color: var(--ink); font-weight: 700; }

  tr.my-row td { color: var(--warn); font-weight: 700; background: rgba(60, 80, 20, 0.25); }

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

  .badge-champ  { background: rgba(154, 101, 16, 0.12); color: var(--warn); border: 1px solid var(--warn); }
  .badge-runner { background: var(--panel-sunk); color: var(--ink); border: 1px solid var(--ink-mute); }
  .badge-ps     { background: var(--panel-sunk); color: var(--ink-mid); border: 1px solid var(--line); }

  /* ── 푸터 ────────────────────────────────────────────────────── */
  .modal-footer {
    padding: 12px 24px 18px;
    border-top: 1px solid var(--panel-sunk);
    display: flex;
    justify-content: center;
  }

  .btn-next {
    padding: 11px 48px;
    background: rgba(31, 122, 71, 0.28);
    color: var(--ok);
    border: 1px solid var(--ok);
    border-radius: 10px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-next:hover:not(:disabled) { background: var(--ok); }
  .btn-next:disabled { opacity: 0.5; cursor: default; }
</style>
