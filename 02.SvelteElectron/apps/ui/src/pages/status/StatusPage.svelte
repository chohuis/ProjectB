<script lang="ts">
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { teamMap } from "../../shared/stores/master";
  import { t } from "../../shared/i18n";
  import type { PitcherGameLine } from "../../shared/types/season";
  import type { CareerSeasonRecord } from "../../shared/types/save";
  import { INJURY_LABEL } from "../../shared/types/save";
  import { getFaThreshold } from "../../shared/utils/faEngine";

  type StatusTab = "stats" | "record" | "career";
  let activeTab: StatusTab = "stats";

  // ── 레이더 차트 ──────────────────────────────────────────────
  const R_CX = 80, R_CY = 80, R_R = 56, R_MAX = 99;
  const RADAR_LABELS = ["구위", "커맨드", "제구", "무브먼트", "멘탈", "스태미나"];
  const radarAxes = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (-90 + i * 60);
    return { x: +(R_CX + R_R * Math.cos(a)).toFixed(1), y: +(R_CY + R_R * Math.sin(a)).toFixed(1) };
  });
  const radarLPos = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (-90 + i * 60);
    const r = R_R + 15;
    return { x: +(R_CX + r * Math.cos(a)).toFixed(1), y: +(R_CY + r * Math.sin(a)).toFixed(1) };
  });
  function gridPts(ratio: number): string {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (-90 + i * 60);
      return `${(R_CX + R_R * ratio * Math.cos(a)).toFixed(1)},${(R_CY + R_R * ratio * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  }
  function radarPts(vals: number[]): string {
    return vals.map((v, i) => {
      const a = (Math.PI / 180) * (-90 + i * 60);
      const ratio = Math.min(v / R_MAX, 1);
      return `${(R_CX + R_R * ratio * Math.cos(a)).toFixed(1)},${(R_CY + R_R * ratio * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  }

  // ── 구종 ─────────────────────────────────────────────────────
  function pitchStars(grade: number): string {
    return "★".repeat(grade) + "☆".repeat(5 - grade);
  }
  function pitchStarClass(grade: number): string {
    if (grade >= 5) return "ps-5";
    if (grade >= 4) return "ps-4";
    if (grade >= 3) return "ps-3";
    if (grade >= 2) return "ps-2";
    return "ps-1";
  }
  const PITCH_NAMES: Record<string, string> = {
    PITCH_FASTBALL: "패스트볼", PITCH_SINKER: "싱커",     PITCH_CUTTER:    "커터",
    PITCH_SLIDER:   "슬라이더", PITCH_CURVE:  "커브",     PITCH_CHANGEUP:  "체인지업",
    PITCH_SPLITTER: "스플리터", PITCH_FORKBALL: "포크볼", PITCH_SCREWBALL: "스크루볼",
    PITCH_KNUCKLEBALL: "너클볼",
  };

  // ── 능력치 트렌드 / 색조 ──────────────────────────────────────
  function statTrend(current: number, snapshot: number | undefined): "up" | "down" | "none" {
    if (snapshot == null) return "none";
    if (current - snapshot >= 1) return "up";
    if (snapshot - current >= 1) return "down";
    return "none";
  }
  function statTone(value: number): "good" | "mid" | "low" {
    if (value >= 70) return "good";
    if (value >= 50) return "mid";
    return "low";
  }

  // ── 공통 파생 ─────────────────────────────────────────────────
  $: p   = $gameStore.protagonist;
  $: pit = p.pitching;
  $: sp  = p.seasonStartPitching;

  $: radarVals = [pit.velocity, pit.command, pit.control, pit.movement, pit.mentality, pit.stamina];

  $: pitchingStats = [
    { label: "OVR",      value: pit.ovr,         trend: statTrend(pit.ovr,         sp?.ovr) },
    { label: "구위",     value: pit.velocity,    trend: statTrend(pit.velocity,    sp?.velocity) },
    { label: "커맨드",   value: pit.command,     trend: statTrend(pit.command,     sp?.command) },
    { label: "제구",     value: pit.control,     trend: statTrend(pit.control,     sp?.control) },
    { label: "무브먼트", value: pit.movement,    trend: statTrend(pit.movement,    sp?.movement) },
    { label: "멘탈",     value: pit.mentality,   trend: statTrend(pit.mentality,   sp?.mentality) },
    { label: "스태미나", value: pit.stamina,     trend: statTrend(pit.stamina,     sp?.stamina) },
    { label: "회복력",   value: pit.recovery,    trend: statTrend(pit.recovery,    sp?.recovery) },
    { label: "위기집중", value: pit.clutch,      trend: statTrend(pit.clutch,      sp?.clutch) },
    { label: "견제력",   value: pit.holdRunners, trend: statTrend(pit.holdRunners, sp?.holdRunners) },
  ];

  // ── 신체 상태 ─────────────────────────────────────────────────
  $: injury        = p.injury;
  $: injuryHistory = (p.injuryHistory ?? []).slice().reverse();

  const SEV_LABEL: Record<string, string> = {
    light: "경상", moderate: "중상", severe: "중증", surgery: "수술",
  };
  const TREATMENT_LABEL: Record<string, string> = {
    rest: "자연 휴식", conservative: "보존 치료", steroid: "스테로이드",
    prp: "PRP 주사", surgery: "수술", counseling: "심리 상담", self: "자가 극복",
  };

  // ── 계약 / 병역 ───────────────────────────────────────────────
  $: contract            = p.contract ?? null;
  $: showContractSection = p.careerStage === "pro_kbl" || p.careerStage === "pro_abl" || p.careerStage === "independent";
  $: showMilitarySection = p.careerStage !== "highschool";
  $: contractExpireYear  = contract ? ($seasonStore.seasonYear + contract.remainingYears) : null;
  $: faYearsLeft         = Math.max(0, getFaThreshold(p.leagueId) - (p.proServiceYears ?? 0));

  const LEAGUE_SHORT: Record<string, string> = {
    LEAGUE_KBL: "KBL", LEAGUE_ABL: "ABL", LEAGUE_INDEPENDENT: "독립리그",
  };
  function formatSalary(s: number): string {
    if (s >= 10000) return `${(s / 10000).toFixed(1)}억 원`;
    return `${s.toLocaleString()}만 원`;
  }

  $: milStatusDisplay = (() => {
    if (p.militaryStatus === "군필") return { text: "병역 완료", cls: "mil-done" };
    if (p.militaryStatus === "면제") return { text: "병역 면제", cls: "mil-exempt" };
    if (p.militaryStatus === "현역") {
      const unit = p.sportsUnitSelected ? "체육부대" : "일반부대";
      return { text: `복무 중 (${unit})`, cls: "mil-active" };
    }
    if (p.age >= 26) return { text: `병역 미이행 ⚠ 누적 패널티 -${p.militaryDeferPenalty ?? 0}pt`, cls: "mil-warn" };
    return { text: "병역 미이행 (패널티 없음)", cls: "mil-pending" };
  })();

  // ── 성적 탭 — 시즌 선택 ───────────────────────────────────────
  let selectedYearStr = "current";

  $: availableYears = [...($gameStore.protagonist.careerRecords ?? [])]
    .map(r => r.year)
    .sort((a, b) => b - a);

  $: selectedRecord = selectedYearStr !== "current"
    ? ($gameStore.protagonist.careerRecords ?? []).find(r => r.year === +selectedYearStr) ?? null
    : null;

  $: selectedSeasonStats = selectedYearStr === "current"
    ? ($seasonStore.stats[$gameStore.protagonist.id] ?? null)
    : (selectedRecord?.stats ?? null);

  $: selectedSeasonGames = (() => {
    if (selectedYearStr === "current") {
      const pid   = $gameStore.protagonist.id;
      const myTid = $gameStore.protagonist.teamId;
      return $seasonStore.schedule
        .filter(e => e.result && e.result.playerLines.some(l => l.playerId === pid))
        .sort((a, b) => b.week - a.week)
        .map(e => {
          const line   = e.result!.playerLines.find(l => l.playerId === pid) as PitcherGameLine;
          const isHome = e.homeTeamId === myTid;
          return {
            week:       e.week,
            opponentId: isHome ? e.awayTeamId : e.homeTeamId,
            myScore:    isHome ? e.result!.homeScore : e.result!.awayScore,
            oppScore:   isHome ? e.result!.awayScore : e.result!.homeScore,
            ip: line.ip, er: line.er, h: line.h, k: line.k, bb: line.bb,
            decision: line.decision, pitchCount: line.pitchCount,
          };
        });
    }
    return [...(selectedRecord?.gameLog ?? [])].sort((a, b) => b.week - a.week);
  })();

  const GAME_LOG_PAGE_SIZE = 5;
  let gameLogPage = 0;
  $: if (selectedYearStr) gameLogPage = 0;
  $: totalGamePages = Math.ceil(selectedSeasonGames.length / GAME_LOG_PAGE_SIZE);
  $: pagedGames = selectedSeasonGames.slice(
    gameLogPage * GAME_LOG_PAGE_SIZE,
    (gameLogPage + 1) * GAME_LOG_PAGE_SIZE,
  );

  // ── 기록 탭 ───────────────────────────────────────────────────
  $: careerRecords = ($gameStore.protagonist.careerRecords ?? []).slice().reverse();

  function leagueShortName(lid: string): string {
    const map: Record<string, string> = {
      LEAGUE_HIGHSCHOOL: "고교", LEAGUE_UNIVERSITY: "대학",
      LEAGUE_INDEPENDENT: "독립", LEAGUE_KBL: "KBL", LEAGUE_ABL: "ABL", LEAGUE_JBL: "JBL",
    };
    return map[lid] ?? lid;
  }
  function psLabel(r: CareerSeasonRecord["psResult"]): string {
    if (!r || r === "notQualified") return "";
    if (r === "champion") return "우승";
    if (r === "runnerUp") return "준우승";
    return "4강";
  }
  $: timelineEntries = (() => {
    const records = ($gameStore.protagonist.careerRecords ?? []).slice().reverse();
    return records.map((rec, i) => {
      const prev = records[i + 1];
      return {
        rec,
        teamChanged:   !!(prev && prev.teamId   !== rec.teamId),
        leagueChanged: !!(prev && prev.leagueId !== rec.leagueId),
      };
    });
  })();
</script>

<section class="page">

  <!-- ── 신체 상태 카드 ── -->
  <article class="card body-card">
    <div class="body-header">
      <span class="body-title">신체 상태</span>
      {#if injury}
        <span class="sev-badge sev-{injury.severity}">{SEV_LABEL[injury.severity] ?? injury.severity}</span>
        <span class="inj-name-text">{INJURY_LABEL[injury.type] ?? injury.type}</span>
        {#if injury.treatmentChoice}
          <span class="treat-tag">{TREATMENT_LABEL[injury.treatmentChoice] ?? injury.treatmentChoice}</span>
        {/if}
        {#if injury.rehabPhase}
          <span class="rehab-tag">재활 {injury.rehabPhase}단계</span>
        {/if}
      {:else}
        <span class="no-injury">이상 없음</span>
      {/if}
    </div>
    {#if injury}
      <div class="recovery-row">
        <span class="rec-left-label">회복</span>
        <div class="rec-bar-wrap">
          <div class="rec-bar-fill" style="width:{Math.round((1 - injury.recoveryWeeksLeft / injury.totalRecoveryWeeks) * 100)}%"></div>
        </div>
        <span class="rec-weeks">{injury.recoveryWeeksLeft}주 남음</span>
      </div>
    {/if}
    {#if injuryHistory.length > 0}
      <div class="inj-history">
        <span class="hist-title">부상 이력</span>
        <div class="hist-list">
          {#each injuryHistory as h}
            <div class="hist-row">
              <span class="hist-when">{h.year}년 {h.week}주</span>
              <span class="hist-sev sev-{h.severity}">{SEV_LABEL[h.severity] ?? h.severity}</span>
              <span class="hist-name">{INJURY_LABEL[h.type] ?? h.type}</span>
              {#if h.permanentLoss && Object.keys(h.permanentLoss).length > 0}
                <span class="hist-loss">{Object.entries(h.permanentLoss).map(([k, v]) => `${k} ${v}`).join(" / ")}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </article>

  <!-- ── 계약 / 병역 카드 ── -->
  {#if showContractSection || showMilitarySection}
    <article class="card info-card">
      {#if showContractSection && contract}
        <div class="info-section">
          <span class="info-title">계약 정보</span>
          <div class="info-rows">
            <div class="info-row">
              <span>소속</span>
              <strong>{$teamMap.get(p.teamId)?.name ?? p.teamId} · {LEAGUE_SHORT[p.leagueId] ?? p.leagueId}</strong>
            </div>
            <div class="info-row"><span>연봉</span><strong>{formatSalary(contract.salary)}</strong></div>
            <div class="info-row">
              <span>잔여 기간</span>
              <strong>{contract.remainingYears}년{contractExpireYear ? ` (만료: ${contractExpireYear}년)` : ""}</strong>
            </div>
            <div class="info-row">
              <span>FA 자격</span>
              <strong>{faYearsLeft > 0 ? `${faYearsLeft}년 후` : "FA 자격 보유"}</strong>
            </div>
            {#if (p.proServiceYears ?? 0) > 0}
              <div class="info-row"><span>프로 경력</span><strong>{p.proServiceYears}년차</strong></div>
            {/if}
            {#if p.militaryStatus === "현역"}
              <div class="info-row">
                <span></span>
                <span class="contract-extend-badge">군 복무 계약 +2년 적용됨</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}
      {#if showMilitarySection}
        {#if showContractSection && contract}<div class="info-divider"></div>{/if}
        <div class="info-section">
          <span class="info-title">병역 정보</span>
          <div class="info-rows">
            <div class="info-row">
              <span>상태</span>
              <strong class={milStatusDisplay.cls}>{milStatusDisplay.text}</strong>
            </div>
            {#if p.militaryEnlistYear}
              <div class="info-row"><span>입대</span><strong>{p.militaryEnlistYear}년</strong></div>
            {/if}
            {#if p.militaryStatus === "현역" && p.militaryDischargeYear}
              <div class="info-row"><span>전역 예정</span><strong>{p.militaryDischargeYear}년 W48</strong></div>
            {/if}
            {#if p.militaryStatus === "현역" && (p.militaryServiceWeeks ?? 0) > 0}
              <div class="info-row"><span>복무 기간</span><strong>{p.militaryServiceWeeks}주 경과</strong></div>
            {/if}
          </div>
        </div>
      {/if}
    </article>
  {/if}

  <!-- ── 탭 바 ── -->
  <nav class="tab-bar">
    <button class:tab-active={activeTab === "stats"}  on:click={() => (activeTab = "stats")}>능력치</button>
    <button class:tab-active={activeTab === "record"} on:click={() => (activeTab = "record")}>성적</button>
    <button class:tab-active={activeTab === "career"} on:click={() => (activeTab = "career")}>기록</button>
  </nav>

  <div class="tab-content">

    <!-- ══ 능력치 탭 ══ -->
    {#if activeTab === "stats"}
      <div class="stats-layout">

        <!-- 좌측: 레이더 차트 + 구종 -->
        <div class="stats-left-panel card">
          <div class="radar-wrap">
            <svg viewBox="0 0 160 160" class="radar-svg">
              {#each [0.33, 0.66, 1] as ratio}
                <polygon points={gridPts(ratio)} fill="none" stroke="#1a2e4a" stroke-width="0.8"/>
              {/each}
              {#each radarAxes as ax, i}
                <line x1={R_CX} y1={R_CY} x2={ax.x} y2={ax.y} stroke="#1a2e4a" stroke-width="0.8"/>
                <text x={radarLPos[i].x} y={radarLPos[i].y}
                      text-anchor="middle" dominant-baseline="middle"
                      font-size="7.5" fill="#4a6a8a">{RADAR_LABELS[i]}</text>
              {/each}
              <polygon
                points={radarPts(radarVals)}
                fill="rgba(74,138,244,0.18)"
                stroke="#4a8af4"
                stroke-width="1.6"
              />
            </svg>
          </div>

          {#if (p.pitches ?? []).length > 0}
            <div class="pitches-panel">
              <h5 class="panel-title">구종</h5>
              <div class="pitch-list">
                {#each p.pitches as pitch}
                  <div class="pitch-row">
                    <span class="pitch-name">{PITCH_NAMES[pitch.id] ?? pitch.id}</span>
                    <span class="pitch-stars {pitchStarClass(pitch.grade)}">{pitchStars(pitch.grade)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- 우측: 투구 능력치 -->
        <article class="card stat-card">
          <h3>투구 능력치</h3>
          <div class="stat-list">
            {#each pitchingStats as stat}
              <div class="stat-item">
                <span class="label">{stat.label}</span>
                <span class="value {statTone(stat.value)}">
                  {stat.value}
                  {#if stat.trend === "up"}<span class="trend-arrow up">↑</span>
                  {:else if stat.trend === "down"}<span class="trend-arrow down">↓</span>{/if}
                </span>
              </div>
            {/each}
          </div>
        </article>

      </div>

    <!-- ══ 성적 탭 ══ -->
    {:else if activeTab === "record"}
      <div class="season-selector">
        <select bind:value={selectedYearStr} class="season-select">
          <option value="current">현재 시즌 ({$seasonStore.seasonYear})</option>
          {#each availableYears as yr}
            <option value={String(yr)}>{yr}년</option>
          {/each}
        </select>
      </div>

      <article class="card record-card">
        <h3>{selectedYearStr === "current" ? $seasonStore.seasonYear : +selectedYearStr}년 시즌 누적</h3>
        {#if selectedSeasonStats?.type === "pitcher"}
          <div class="record-grid">
            {#each [
              ["G",    selectedSeasonStats.g],
              ["W",    selectedSeasonStats.w],
              ["L",    selectedSeasonStats.l],
              ["SV",   selectedSeasonStats.sv],
              ["HD",   selectedSeasonStats.hd],
              ["IP",   selectedSeasonStats.ip],
              ["ERA",  selectedSeasonStats.era?.toFixed(2)],
              ["WHIP", selectedSeasonStats.whip?.toFixed(2)],
              ["K",    selectedSeasonStats.k],
              ["BB",   selectedSeasonStats.bb],
              ["H",    selectedSeasonStats.h],
              ["ER",   selectedSeasonStats.er],
            ] as [lbl, val]}
              <div class="record-item">
                <span class="rec-label">{lbl}</span>
                <strong class="rec-value">{val ?? "-"}</strong>
              </div>
            {/each}
          </div>
        {:else if selectedRecord?.statLine}
          <p class="stat-line-text">{selectedRecord.statLine}</p>
        {:else}
          <p class="pending">{selectedYearStr === "current" ? "시즌 누적 집계 중" : "상세 기록 없음"}</p>
        {/if}
      </article>

      <article class="card recent-card">
        <div class="recent-header">
          <h3>경기 기록{selectedSeasonGames.length > 0 ? ` (${selectedSeasonGames.length}경기)` : ""}</h3>
          {#if totalGamePages > 1}
            <div class="page-nav">
              <button class="page-btn" disabled={gameLogPage === 0} on:click={() => gameLogPage--}>◀</button>
              <span class="page-label">{gameLogPage + 1} / {totalGamePages}</span>
              <button class="page-btn" disabled={gameLogPage >= totalGamePages - 1} on:click={() => gameLogPage++}>▶</button>
            </div>
          {/if}
        </div>
        {#if selectedSeasonGames.length === 0}
          <p class="pending">
            {selectedYearStr === "current" ? "아직 출전 기록이 없습니다." : "경기 기록이 저장되지 않은 시즌입니다."}
          </p>
        {:else}
          <div class="recent-table-wrap">
            <table class="recent-table">
              <thead>
                <tr>
                  <th>주차</th><th>상대</th><th>결과</th><th>점수</th>
                  <th>IP</th><th>H</th><th>BB</th><th>K</th><th>ER</th><th>투구수</th>
                </tr>
              </thead>
              <tbody>
                {#each pagedGames as g}
                  <tr>
                    <td>W{g.week}</td>
                    <td class="opp-name">{$teamMap.get(g.opponentId)?.name ?? g.opponentId}</td>
                    <td><span class="decision decision-{g.decision}">{g.decision}</span></td>
                    <td class="score">{g.myScore}:{g.oppScore}</td>
                    <td>{g.ip ?? '-'}</td>
                    <td>{g.h ?? '-'}</td>
                    <td>{g.bb ?? '-'}</td>
                    <td>{g.k ?? '-'}</td>
                    <td>{g.er ?? '-'}</td>
                    <td>{g.pitchCount ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </article>

    <!-- ══ 기록 탭 ══ -->
    {:else if activeTab === "career"}
      {#if careerRecords.length === 0}
        <article class="card record-card">
          <p class="pending">시즌을 마치면 기록이 쌓입니다.</p>
        </article>
      {:else}
        <article class="card career-card">
          <h3>시즌별 성적</h3>
          <div class="career-table-wrap">
            <table class="career-table">
              <thead>
                <tr>
                  <th>연도</th><th>리그</th><th>팀</th><th>성적</th>
                  <th>순위</th><th>OVR</th><th>포스트시즌</th>
                </tr>
              </thead>
              <tbody>
                {#each careerRecords as rec}
                  <tr>
                    <td class="year-cell">{rec.year}</td>
                    <td>{leagueShortName(rec.leagueId)}</td>
                    <td class="team-cell">{$teamMap.get(rec.teamId)?.name ?? rec.teamId}</td>
                    <td class="stat-cell">{rec.statLine || "-"}</td>
                    <td>{rec.rank != null ? `${rec.rank}/${rec.totalTeams}위` : "-"}</td>
                    <td class="ovr-cell">{rec.ovr}</td>
                    <td class="ps-cell">{psLabel(rec.psResult)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </article>

        {#if careerRecords.some(r => r.awards.length > 0)}
          <article class="card career-card">
            <h3>수상 내역</h3>
            <div class="awards-list">
              {#each careerRecords as rec}
                {#each rec.awards as award}
                  <div class="award-chip">
                    <span class="award-year">{rec.year}</span>
                    <span class="award-label">{award.label}</span>
                    {#if award.value}<span class="award-val">{award.value}</span>{/if}
                  </div>
                {/each}
              {/each}
            </div>
          </article>
        {/if}

        <article class="card career-card">
          <h3>커리어 타임라인</h3>
          <div class="timeline">
            {#each timelineEntries as entry}
              <div class="tl-item" class:tl-change={entry.teamChanged || entry.leagueChanged}>
                <div class="tl-dot"></div>
                <div class="tl-body">
                  <div class="tl-header">
                    <span class="tl-year">{entry.rec.year}</span>
                    <span class="tl-league">{leagueShortName(entry.rec.leagueId)}</span>
                    <span class="tl-team">{$teamMap.get(entry.rec.teamId)?.name ?? entry.rec.teamId}</span>
                    {#if entry.leagueChanged}
                      <span class="tl-badge tl-badge-league">리그 이동</span>
                    {:else if entry.teamChanged}
                      <span class="tl-badge tl-badge-team">팀 이적</span>
                    {/if}
                  </div>
                  {#if entry.rec.statLine}
                    <p class="tl-stat">{entry.rec.statLine}</p>
                  {/if}
                  {#if entry.rec.awards.length > 0}
                    <div class="tl-awards">
                      {#each entry.rec.awards as a}
                        <span class="tl-award">{a.label}{a.value ? ` ${a.value}` : ""}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </article>

        {#if ($gameStore.protagonist.careerEvents?.length ?? 0) > 0}
          <article class="card career-card">
            <h3>주요 이벤트</h3>
            <table class="career-table">
              <thead><tr><th>연도</th><th>유형</th><th>내용</th></tr></thead>
              <tbody>
                {#each [...($gameStore.protagonist.careerEvents ?? [])].reverse() as ev}
                  <tr>
                    <td class="year-cell">{ev.year}</td>
                    <td>{
                      ev.eventType === "trade" ? "트레이드" :
                      ev.eventType === "fa_signed" ? "FA 계약" :
                      ev.eventType === "military_enlist" ? "입대" :
                      ev.eventType === "military_discharge" ? "전역" :
                      ev.eventType === "draft_picked" ? "드래프트" :
                      ev.eventType === "retirement" ? "은퇴" : ev.eventType
                    }</td>
                    <td>{
                      ev.eventType === "trade"
                        ? `${$teamMap.get(ev.fromTeamId ?? "")?.name ?? ev.fromTeamId ?? ""} → ${$teamMap.get(ev.toTeamId ?? "")?.name ?? ev.toTeamId ?? ""}`
                        : ev.eventType === "fa_signed"
                        ? `${$teamMap.get(ev.toTeamId ?? "")?.name ?? ev.toTeamId ?? ""} 입단`
                        : ev.detail ?? ""
                    }</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </article>
        {/if}
      {/if}
    {/if}

  </div>
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h3, p { margin: 0; }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
  }

  /* ── 탭 바 ── */
  .tab-bar {
    display: flex;
    gap: 6px;
    border-bottom: 1px solid #253451;
    padding-bottom: 8px;
  }
  .tab-bar button {
    background: none; border: 1px solid transparent;
    border-radius: 7px; color: #7a9ac8;
    font-size: 13px; padding: 5px 20px; cursor: pointer;
  }
  .tab-bar button.tab-active {
    background: #1d3760; border-color: #3a5a96;
    color: #d8e8ff; font-weight: 600;
  }

  .tab-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ══ 능력치 탭 ══ */
  .stats-layout {
    display: grid;
    grid-template-columns: 210px 1fr;
    gap: 12px;
    align-items: start;
  }

  /* 좌측 패널 */
  .stats-left-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* 레이더 차트 */
  .radar-wrap { display: flex; justify-content: center; }
  .radar-svg  { width: 160px; height: 160px; }

  /* 구종 */
  .pitches-panel { display: flex; flex-direction: column; gap: 7px; }
  .panel-title {
    margin: 0;
    font-size: 11px; font-weight: 700; letter-spacing: 1px;
    color: #4a6a8a; text-transform: uppercase;
    padding-bottom: 5px; border-bottom: 1px solid #1e3050;
  }
  .pitch-list { display: flex; flex-direction: column; gap: 5px; }
  .pitch-row  { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
  .pitch-name { font-size: 13px; color: #b8d4f8; font-weight: 500; }
  .pitch-stars { font-size: 11px; letter-spacing: 1.5px; }
  .ps-5 { color: #f0c830; }
  .ps-4 { color: #4ed080; }
  .ps-3 { color: #4a8af4; }
  .ps-2 { color: #4a6888; }
  .ps-1 { color: #2a3e56; }

  /* 우측 스탯 카드 */
  .stat-card h3 { font-size: 16px; margin-bottom: 10px; color: #ebf2ff; }
  .stat-list {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  .stat-item {
    border: 1px solid #2e486f; border-radius: 8px;
    background: #152b4f; padding: 8px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .label { color: #9eb6de; font-size: 11px; }
  .value { font-size: 18px; font-weight: 700; }
  .value.good { color: #68de92; }
  .value.mid  { color: #d8e8ff; }
  .value.low  { color: #ffb58a; }
  .trend-arrow { font-size: 12px; font-weight: 700; margin-left: 2px; vertical-align: middle; }
  .trend-arrow.up   { color: #ff6b6b; }
  .trend-arrow.down { color: #74b9ff; }

  /* ══ 성적 탭 ══ */
  .season-selector { display: flex; align-items: center; }
  .season-select {
    background: #161f33; border: 1px solid #2d3956;
    border-radius: 8px; color: #d8e8ff;
    font-size: 13px; font-weight: 600;
    padding: 6px 12px; cursor: pointer;
    outline: none;
  }
  .season-select:hover { border-color: #4a6a9a; }

  .record-card h3 { font-size: 16px; margin-bottom: 12px; color: #ebf2ff; }
  .record-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }
  .record-item {
    background: #0f1830; border: 1px solid #314362;
    border-radius: 8px; padding: 10px 8px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .rec-label { font-size: 11px; color: #92a8ce; }
  .rec-value { font-size: 18px; font-weight: 700; color: #f1f6ff; }

  .stat-line-text { color: #d8e8ff; font-size: 14px; }
  .pending { color: #9db2d8; font-size: 13px; }

  .recent-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .recent-header h3 { font-size: 16px; color: #ebf2ff; }
  .page-nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .page-btn {
    background: #1a2d4a;
    border: 1px solid #2e4a70;
    color: #a0b8d8;
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
    line-height: 1.4;
  }
  .page-btn:hover:not(:disabled) { background: #233a5e; color: #d0e4ff; }
  .page-btn:disabled { opacity: 0.35; cursor: default; }
  .page-label { font-size: 12px; color: #7a9ac8; min-width: 36px; text-align: center; }
  .recent-table-wrap { overflow-x: auto; }
  .recent-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    color: #c8d8f0;
  }
  .recent-table th {
    padding: 6px 10px;
    text-align: center;
    color: #7a9ac8; font-weight: 600; font-size: 11px;
    border-bottom: 1px solid #253451;
    white-space: nowrap;
  }
  .recent-table td {
    padding: 8px 10px;
    text-align: center;
    border-bottom: 1px solid #1a2640;
  }
  .recent-table tbody tr:last-child td { border-bottom: none; }
  .recent-table tbody tr:hover { background: #0f1d35; }
  .opp-name { text-align: left; color: #d5e2fd; }
  .score { font-weight: 700; color: #edf2ff; }
  .decision {
    display: inline-block;
    padding: 2px 8px; border-radius: 999px;
    font-size: 12px; font-weight: 700;
  }
  .decision-W   { background: rgba(55,214,122,0.12);  color: #37d67a; border: 1px solid #2a5a3a; }
  .decision-L   { background: rgba(255,74,74,0.10);   color: #ff6a6a; border: 1px solid #5a2a2a; }
  .decision-SV  { background: rgba(80,180,255,0.12);  color: #60c8ff; border: 1px solid #1a4a6a; }
  .decision-HD  { background: rgba(160,120,255,0.12); color: #b88fff; border: 1px solid #3a2a6a; }
  .decision-ND  { background: rgba(160,180,210,0.10); color: #90a8c8; border: 1px solid #2a3a50; }

  /* ══ 기록 탭 ══ */
  .career-card h3 { font-size: 16px; margin-bottom: 12px; color: #ebf2ff; }
  .career-table-wrap { overflow-x: auto; }
  .career-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    color: #c8d8f0;
  }
  .career-table th {
    padding: 6px 10px; text-align: center;
    color: #7a9ac8; font-weight: 600; font-size: 11px;
    border-bottom: 1px solid #253451; white-space: nowrap;
  }
  .career-table td {
    padding: 7px 10px; text-align: center;
    border-bottom: 1px solid #1a2640; white-space: nowrap;
  }
  .career-table tbody tr:hover { background: #0f1d35; }
  .year-cell  { font-weight: 700; color: #a8c4f0; }
  .team-cell  { text-align: left; color: #d5e2fd; }
  .stat-cell  { text-align: left; color: #e0e8ff; font-size: 11px; }
  .ovr-cell   { font-weight: 700; color: #68de92; }
  .ps-cell    { color: #f0c860; font-weight: 700; }

  .awards-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .award-chip {
    display: flex; align-items: center; gap: 6px;
    background: #1e2c4a; border: 1px solid #4a6898;
    border-radius: 20px; padding: 5px 12px;
  }
  .award-year  { font-size: 11px; color: #7a9ac8; }
  .award-label { font-size: 12px; font-weight: 700; color: #f0c060; }
  .award-val   { font-size: 12px; color: #80d8ff; }

  .timeline {
    display: flex; flex-direction: column;
    padding-left: 8px;
    border-left: 2px solid #2a3f62;
  }
  .tl-item {
    display: flex; gap: 14px;
    padding: 10px 0;
    position: relative;
  }
  .tl-dot {
    position: absolute;
    left: -9px; top: 16px;
    width: 10px; height: 10px;
    border-radius: 50%;
    background: #2a4a80; border: 2px solid #5c8fd8;
    flex-shrink: 0;
  }
  .tl-item.tl-change .tl-dot { background: #805020; border-color: #f0a040; }
  .tl-body  { flex: 1; padding-left: 6px; }
  .tl-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .tl-year   { font-size: 13px; font-weight: 700; color: #a8c4f0; }
  .tl-league { font-size: 11px; color: #6a8ab8; }
  .tl-team   { font-size: 13px; color: #d5e2fd; font-weight: 600; }
  .tl-badge  { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 6px; }
  .tl-badge-league { background: rgba(240,160,64,0.15); color: #f0a040; border: 1px solid #805020; }
  .tl-badge-team   { background: rgba(90,160,255,0.10); color: #70b0ff; border: 1px solid #2a4a80; }
  .tl-stat   { margin: 4px 0 0; font-size: 12px; color: #9eb6de; }
  .tl-awards { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
  .tl-award  {
    font-size: 11px; color: #f0c060; font-weight: 700;
    background: rgba(240,192,64,0.1);
    border: 1px solid rgba(240,192,64,0.3);
    border-radius: 4px; padding: 2px 7px;
  }

  /* ── 신체 상태 카드 ── */
  .body-card   { display: grid; gap: 8px; }
  .body-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .body-title  { font-size: 13px; color: #7a9ac8; font-weight: 600; margin-right: 4px; }
  .sev-badge   { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 2px 8px; }
  .sev-badge.sev-light    { background: rgba(100,180,255,0.10); color: #80c8ff; border: 1px solid #2a4a6a; }
  .sev-badge.sev-moderate { background: rgba(255,160,50,0.15);  color: #ffa030; border: 1px solid #7a4010; }
  .sev-badge.sev-severe   { background: rgba(220,60,60,0.15);   color: #e05050; border: 1px solid #7a2020; }
  .sev-badge.sev-surgery  { background: rgba(180,80,255,0.15);  color: #d080ff; border: 1px solid #5a2080; }
  .inj-name-text { font-size: 14px; font-weight: 600; color: #e8f0ff; }
  .treat-tag {
    font-size: 11px; color: #9eb6de;
    border: 1px solid #2d3956; border-radius: 4px; padding: 2px 7px;
  }
  .rehab-tag {
    font-size: 11px; color: #d080ff;
    border: 1px solid #5a2080; border-radius: 4px; padding: 2px 7px;
    background: rgba(180,80,255,0.08);
  }
  .no-injury { font-size: 13px; color: #68de92; }
  .recovery-row { display: flex; align-items: center; gap: 8px; }
  .rec-left-label { font-size: 12px; color: #7a9ac8; width: 24px; flex-shrink: 0; }
  .rec-bar-wrap   { flex: 1; height: 6px; background: #1e3054; border-radius: 999px; overflow: hidden; }
  .rec-bar-fill   { height: 100%; border-radius: inherit; background: #68de92; transition: width 0.3s; }
  .rec-weeks      { font-size: 12px; color: #9eb6de; white-space: nowrap; }
  .inj-history    { display: grid; gap: 6px; }
  .hist-title     { font-size: 12px; color: #6a8ab8; font-weight: 600; }
  .hist-list      { display: grid; gap: 4px; }
  .hist-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    font-size: 12px; padding: 4px 8px;
    background: #0f1830; border: 1px solid #1e3050; border-radius: 6px;
  }
  .hist-when { color: #6a8ab8; }
  .hist-sev  { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
  .hist-sev.sev-light    { color: #80c8ff; }
  .hist-sev.sev-moderate { color: #ffa030; }
  .hist-sev.sev-severe   { color: #e05050; }
  .hist-sev.sev-surgery  { color: #d080ff; }
  .hist-name { color: #c8d8f0; }
  .hist-loss { color: #ff9b8a; font-size: 11px; margin-left: auto; }

  /* ── 계약 / 병역 카드 ── */
  .info-card    { display: flex; flex-direction: column; gap: 10px; }
  .info-section { display: grid; gap: 6px; }
  .info-title   {
    font-size: 11px; font-weight: 700; color: #6a8ab8;
    letter-spacing: 0.5px; text-transform: uppercase;
  }
  .info-rows  { display: grid; gap: 4px; }
  .info-row   { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .info-row span:first-child { color: #7a9ac8; width: 64px; flex-shrink: 0; }
  .info-row strong { color: #d8e8ff; }
  .info-divider { height: 1px; background: #1e3058; }
  .mil-done    { color: #68de92; }
  .mil-exempt  { color: #9eb6de; }
  .mil-active  { color: #60c0ff; }
  .mil-warn    { color: #ff9060; }
  .mil-pending { color: #9eb6de; }
  .contract-extend-badge {
    font-size: 11px; color: #ffd060;
    background: rgba(255,200,60,0.10);
    border: 1px solid rgba(255,200,60,0.3);
    border-radius: 4px; padding: 2px 8px;
  }

  /* ── 반응형 ── */
  @media (max-width: 960px) {
    .profile-card  { grid-template-columns: 1fr; }
    .summary-grid  { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .stats-layout  { grid-template-columns: 1fr; }
    .stat-list     { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .record-grid   { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
