<script lang="ts">
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { teamMap } from "../../shared/stores/master";
  import { t } from "../../shared/i18n";
  import type { PitcherGameLine } from "../../shared/types/season";
  import type { CareerSeasonRecord } from "../../shared/types/save";
  import { INJURY_LABEL } from "../../shared/types/save";
  import { getFaThreshold } from "../../shared/utils/faEngine";
  import { canRetireVoluntarily, isRetired, retireProtagonist } from "../../shared/usecases/retirement";
  import CareerEndScreen from "../../features/retirement/ui/CareerEndScreen.svelte";

  type StatusTab = "stats" | "record" | "career";
  let activeTab: StatusTab = "stats";

  // ── 자발적 은퇴 (05_히스토리_엔딩 §3) ────────────────────────
  //
  // ⚠ **트리거 셋 중 이것만 진입점이 없었다.** 노쇠·부상은 엔진이 상황을
  // 만들어 주지만 "이만하면 충분하다"는 플레이어만 결정할 수 있다.
  // 여기 둔 이유는 커리어 탭이 통산 기록을 보는 자리라서다 — 무엇을 남겼는지
  // 보고 나서 접는 게 자연스럽다.
  //
  // 되돌릴 수 없으므로 **확인을 한 번 받는다.**
  let retireConfirm = false;
  let retiring = false;
  /** 은퇴한 뒤 커리어 결산을 다시 여는 자리 */
  let showCareerEnd = false;
  async function doVoluntaryRetire(): Promise<void> {
    if (retiring) return;
    retiring = true;
    await retireProtagonist("voluntary");
    retireConfirm = false;
    retiring = false;
  }

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
  // ── 커리어 이벤트 표기 ──────────────────────────────────────
  //
  // ⚠ **Rust가 쓰는 문자열과 같아야 한다** (`NpcCareerEventType` 주석 참고).
  // 여기 없는 값이 오면 라벨 대신 원문이 뜨도록 두 — 조용히 사라지는 것보다 낫다.
  const EVENT_LABEL: Record<string, string> = {
    draft_picked: "드래프트 지명", draft_undrafted: "미지명",
    trade: "트레이드", fa_signed: "FA 계약", release: "방출",
    quit_baseball: "야구 포기", military_enlist: "입대",
    military_discharge: "전역", military_exempt: "병역 면제",
    retirement: "은퇴", graduation: "졸업",
  };
  function eventText(ev: import("../../shared/types/save").NpcCareerEvent): string {
    if (ev.eventType === "trade") {
      return `${$teamMap.get(ev.fromTeamId ?? "")?.name ?? ev.fromTeamId ?? ""}`
        + ` → ${$teamMap.get(ev.toTeamId ?? "")?.name ?? ev.toTeamId ?? ""}`;
    }
    if (ev.eventType === "fa_signed") {
      return `${$teamMap.get(ev.toTeamId ?? "")?.name ?? ev.toTeamId ?? ""} 입단`;
    }
    return ev.detail ?? "";
  }

  // ⚠ **한 해의 이야기가 두 곳에 나뉘어 있었다.** 성적·수상은 타임라인에,
  // 드래프트·트레이드·입대·은퇴는 아래 별도 표에 있어서 "그 해에 무슨 일이
  // 있었나"를 보려면 두 군데를 대조해야 했다. 연도별 타임라인이라면 같은
  // 줄에 붙는 게 맞다 (사용자 확정 "연도별 타임라인").
  $: timelineEntries = (() => {
    const records = ($gameStore.protagonist.careerRecords ?? []).slice().reverse();
    const events = $gameStore.protagonist.careerEvents ?? [];
    type Row = {
      year: number;
      // 기록 없는 해가 있다 — 아래 참고
      rec: CareerSeasonRecord | null;
      events: import("../../shared/types/save").NpcCareerEvent[];
      teamChanged: boolean; leagueChanged: boolean;
    };
    const rows: Row[] = records.map((rec, i) => {
      const prev = records[i + 1];
      return {
        year: rec.year,
        rec: rec as CareerSeasonRecord | null,
        events: events.filter((e) => e.year === rec.year),
        teamChanged:   !!(prev && prev.teamId   !== rec.teamId),
        leagueChanged: !!(prev && prev.leagueId !== rec.leagueId),
      };
    });
    // ⚠ **기록 없는 해가 통째로 빠진다.** 시즌 기록은 뛰어야 생기는데
    // 입대·전역·미지명은 안 뛴 해에도 일어난다 — 그 해만 이벤트로 채운다.
    // 이걸 안 하면 군 복무 2년이 인생 기록에서 사라진다.
    const covered = new Set(rows.map((r) => r.year));
    for (const y of [...new Set(events.map((e) => e.year))]) {
      if (covered.has(y)) continue;
      rows.push({ year: y, rec: null, events: events.filter((e) => e.year === y),
                  teamChanged: false, leagueChanged: false });
    }
    return rows.sort((a, b) => b.year - a.year);
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
  <nav class="u-subtabs">
    <button class:on={activeTab === "stats"}  on:click={() => (activeTab = "stats")}>능력치</button>
    <button class:on={activeTab === "record"} on:click={() => (activeTab = "record")}>성적</button>
    <button class:on={activeTab === "career"} on:click={() => (activeTab = "career")}>기록</button>
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
                <polygon points={gridPts(ratio)} fill="none" stroke="var(--line)" stroke-width="0.8"/>
              {/each}
              {#each radarAxes as ax, i}
                <line x1={R_CX} y1={R_CY} x2={ax.x} y2={ax.y} stroke="var(--line)" stroke-width="0.8"/>
                <text x={radarLPos[i].x} y={radarLPos[i].y}
                      text-anchor="middle" dominant-baseline="middle"
                      font-size="7.5" fill="var(--ink-mute)">{RADAR_LABELS[i]}</text>
              {/each}
              <polygon
                points={radarPts(radarVals)}
                fill="var(--t-wash)"
                stroke="var(--t-dark)"
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
            {#each timelineEntries as entry (entry.year)}
              <div class="tl-item" class:tl-change={entry.teamChanged || entry.leagueChanged}>
                <div class="tl-dot"></div>
                <div class="tl-body">
                  <div class="tl-header">
                    <span class="tl-year">{entry.year}</span>
                    {#if entry.rec}
                      <span class="tl-league">{leagueShortName(entry.rec.leagueId)}</span>
                      <span class="tl-team">{$teamMap.get(entry.rec.teamId)?.name ?? entry.rec.teamId}</span>
                    {/if}
                    {#if entry.leagueChanged}
                      <span class="tl-badge tl-badge-league">리그 이동</span>
                    {:else if entry.teamChanged}
                      <span class="tl-badge tl-badge-team">팀 이적</span>
                    {/if}
                  </div>
                  {#if entry.rec?.statLine}
                    <p class="tl-stat">{entry.rec.statLine}</p>
                  {/if}
                  {#if entry.rec && entry.rec.awards.length > 0}
                    <div class="tl-awards">
                      {#each entry.rec.awards as a}
                        <span class="tl-award">{a.label}{a.value ? ` ${a.value}` : ""}</span>
                      {/each}
                    </div>
                  {/if}
                  {#each entry.events as ev}
                    <p class="tl-event">
                      <span class="tl-event-kind">{EVENT_LABEL[ev.eventType] ?? ev.eventType}</span>
                      {eventText(ev)}
                    </p>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </article>

        {#if canRetireVoluntarily($gameStore.protagonist)}
          <article class="card career-card">
            <h3>선수 생활</h3>
            {#if !retireConfirm}
              <p class="retire-hint">언제든 스스로 그만둘 수 있습니다.</p>
              <button class="retire-btn" type="button" on:click={() => (retireConfirm = true)}>은퇴를 고려한다</button>
            {:else}
              <p class="retire-warn">은퇴하면 되돌릴 수 없습니다. 통산 {($gameStore.protagonist.careerRecords ?? []).length}시즌으로 마칩니다.</p>
              <div class="retire-actions">
                <button class="retire-cancel" type="button" disabled={retiring} on:click={() => (retireConfirm = false)}>더 뛴다</button>
                <button class="retire-btn" type="button" disabled={retiring} on:click={doVoluntaryRetire}>은퇴한다</button>
              </div>
            {/if}
          </article>
        {:else if isRetired($gameStore.protagonist)}
          <article class="card career-card">
            <h3>선수 생활</h3>
            <p class="retire-hint">
              {$gameStore.protagonist.retirement?.year}년 은퇴 — 통산 {($gameStore.protagonist.careerRecords ?? []).length}시즌
            </p>
            <!--
              예전엔 이 두 줄이 커리어의 전부였다. 19시즌치 기록이
              `careerRecords`에 그대로 있는데 아무도 안 읽었다.
            -->
            <button class="retire-btn" type="button" on:click={() => (showCareerEnd = true)}>
              커리어 결산 보기
            </button>
          </article>
        {/if}
      {/if}
    {/if}

  </div>
</section>

{#if showCareerEnd}
  <CareerEndScreen onClose={() => (showCareerEnd = false)} />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h3, p { margin: 0; }

  .card {
    background: var(--panel);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
    padding: 12px 14px;
  }

  .tab-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* == 능력치 == */
  .stats-layout {
    display: grid;
    grid-template-columns: 210px 1fr;
    gap: 10px;
    align-items: start;
  }

  .stats-left-panel { display: flex; flex-direction: column; gap: 14px; }

  .radar-wrap { display: flex; justify-content: center; }
  .radar-svg  { width: 160px; height: 160px; }

  .pitches-panel { display: flex; flex-direction: column; gap: 7px; }
  .panel-title {
    margin: 0;
    font-size: 10px; font-weight: 800; letter-spacing: 0.12em;
    color: var(--ink-mute); text-transform: uppercase;
    padding-bottom: 5px; border-bottom: 2px solid var(--t-dark);
  }
  .pitch-list { display: flex; flex-direction: column; gap: 5px; }
  .pitch-row  { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
  .pitch-name { font-size: 12.5px; color: var(--ink); font-weight: 600; }
  .pitch-stars { font-size: 11px; letter-spacing: 1.5px; }

  /* 구종 등급 5단계 — 색을 다 주면 아무것도 안 도드라진다.
     마스터만 금색이고 나머지는 명도로 간다 */
  .ps-5 { color: var(--warn); }
  .ps-4 { color: var(--t-dark); }
  .ps-3 { color: var(--ink-mid); }
  .ps-2 { color: var(--ink-mute); }
  .ps-1 { color: var(--line-strong); }

  .stat-card h3 { font-size: 13px; font-weight: 800; margin-bottom: 10px; color: var(--ink); }
  .stat-list { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .stat-item {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 9px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
  }
  .label { color: var(--ink-mute); font-size: 10.5px; }
  .value { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .value.good { color: var(--ok); }
  .value.mid  { color: var(--ink); }
  .value.low  { color: var(--bad); }

  /* 능력치는 오르는 게 좋다 — 위 초록 / 아래 빨강 */
  .trend-arrow { font-size: 11px; font-weight: 800; margin-left: 2px; vertical-align: middle; }
  .trend-arrow.up   { color: var(--ok); }
  .trend-arrow.down { color: var(--bad); }

  /* == 성적 == */
  .season-selector { display: flex; align-items: center; }
  .season-select {
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    color: var(--ink);
    font-size: 12.5px; font-weight: 700;
    padding: 6px 12px; cursor: pointer;
    outline: none;
  }
  .season-select:hover { border-color: var(--t-dark); }

  .record-card h3 { font-size: 13px; font-weight: 800; margin-bottom: 12px; color: var(--ink); }
  .record-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
  .record-item {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 10px 8px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
  }
  .rec-label { font-size: 10.5px; color: var(--ink-mute); }
  .rec-value {
    font-size: 18px; font-weight: 800; color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .stat-line-text { color: var(--ink-mid); font-size: 13px; }
  .pending { color: var(--ink-mute); font-size: 12.5px; }

  .recent-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px;
  }
  .recent-header h3 { font-size: 13px; font-weight: 800; color: var(--ink); }

  .page-nav { display: flex; align-items: center; gap: 6px; }
  .page-btn {
    background: none;
    border: 1px solid var(--line);
    color: var(--ink-mute);
    border-radius: var(--radius);
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
    line-height: 1.4;
  }
  .page-btn:hover:not(:disabled) { border-color: var(--t-dark); color: var(--t-dark); }
  .page-btn:disabled { opacity: 0.3; cursor: default; }
  .page-label {
    font-size: 11.5px; color: var(--ink-mute);
    min-width: 38px; text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .recent-table-wrap, .career-table-wrap { overflow-x: auto; }
  .recent-table, .career-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    color: var(--ink-mid);
    font-variant-numeric: tabular-nums;
  }
  .recent-table th, .career-table th {
    padding: 6px 10px;
    text-align: center;
    color: var(--ink-mute); font-weight: 800; font-size: 10px;
    letter-spacing: 0.06em;
    border-bottom: 2px solid var(--t-dark);
    white-space: nowrap;
  }
  .recent-table td, .career-table td {
    padding: 8px 10px;
    text-align: center;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  .recent-table tbody tr:last-child td,
  .career-table tbody tr:last-child td { border-bottom: none; }
  .recent-table tbody tr:hover,
  .career-table tbody tr:hover { background: var(--panel-sunk); }

  .opp-name { text-align: left; color: var(--ink); }
  .score { font-weight: 800; color: var(--ink); }

  /* 승·패·세이브·홀드는 야구에서 뜻이 고정이다 — 팀 색과 안 섞는다 */
  .decision {
    display: inline-block;
    padding: 2px 9px; border-radius: 999px;
    font-size: 11px; font-weight: 800;
    color: var(--ink-on-dark);
  }
  .decision-W  { background: var(--ok); }
  .decision-L  { background: var(--bad); }
  .decision-SV { background: var(--t-dark); }
  .decision-HD { background: var(--ink-mid); }
  .decision-ND { background: var(--line-strong); color: var(--ink-mid); }

  /* == 기록 == */
  .career-card h3 { font-size: 13px; font-weight: 800; margin-bottom: 12px; color: var(--ink); }
  .career-table { font-size: 11.5px; }
  .year-cell  { font-weight: 800; color: var(--ink); }
  .team-cell  { text-align: left; color: var(--ink); }
  .stat-cell  { text-align: left; color: var(--ink-mid); font-size: 11px; }
  .ovr-cell   { font-weight: 800; color: var(--t-dark); }
  .ps-cell    { color: var(--warn); font-weight: 800; }

  .awards-list { display: flex; flex-wrap: wrap; gap: 7px; }
  .award-chip {
    display: flex; align-items: center; gap: 6px;
    background: var(--panel-sunk);
    border-left: 3px solid var(--warn);
    border-radius: var(--radius); padding: 5px 12px;
  }
  .award-year  { font-size: 10.5px; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
  .award-label { font-size: 12px; font-weight: 800; color: var(--ink); }
  .award-val   { font-size: 11.5px; color: var(--ink-mid); font-variant-numeric: tabular-nums; }

  /* -- 연도별 타임라인 -- */
  .timeline {
    display: flex; flex-direction: column;
    padding-left: 8px;
    border-left: 2px solid var(--line);
  }
  .tl-item { display: flex; gap: 14px; padding: 10px 0; position: relative; }
  .tl-dot {
    position: absolute;
    left: -9px; top: 16px;
    width: 10px; height: 10px;
    border-radius: 50%;
    background: var(--panel);
    border: 2px solid var(--line-strong);
    flex-shrink: 0;
  }
  /* 팀·리그가 바뀐 해만 채운다 — 인생이 꺾인 지점이다 */
  .tl-item.tl-change .tl-dot { background: var(--t-accent); border-color: var(--t-accent); }

  .tl-body   { flex: 1; padding-left: 6px; }
  .tl-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .tl-year   { font-size: 13px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
  .tl-league { font-size: 10.5px; color: var(--ink-mute); }
  .tl-team   { font-size: 13px; color: var(--ink); font-weight: 700; }
  .tl-badge  {
    font-size: 9.5px; font-weight: 800; border-radius: 2px; padding: 2px 7px;
    color: var(--ink-on-dark);
  }
  .tl-badge-league { background: var(--t-accent); }
  .tl-badge-team   { background: var(--t-dark); }
  .tl-stat   { margin: 4px 0 0; font-size: 11.5px; color: var(--ink-mid); font-variant-numeric: tabular-nums; }
  .tl-awards { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 5px; }
  .tl-award  {
    font-size: 10.5px; color: var(--ink-on-dark); font-weight: 800;
    background: var(--warn);
    border-radius: 2px; padding: 2px 7px;
  }
  .tl-event { margin: 3px 0 0; color: var(--ink-mid); font-size: 11.5px; }
  .tl-event-kind { color: var(--t-accent); font-weight: 700; margin-right: 6px; }

  /* -- 은퇴 -- */
  .retire-hint { color: var(--ink-mute); font-size: 12px; }
  .retire-warn { color: var(--bad); font-size: 12px; line-height: 1.6; }
  .retire-actions { display: flex; gap: 8px; }
  .retire-btn {
    border: 0; background: var(--bad); color: var(--ink-on-dark);
    border-radius: var(--radius); padding: 8px 16px; cursor: pointer;
    font-size: 12px; font-weight: 700;
  }
  .retire-cancel {
    border: 1px solid var(--line-strong); background: none; color: var(--ink-mid);
    border-radius: var(--radius); padding: 8px 16px; cursor: pointer; font-size: 12px;
  }
  .retire-btn:disabled, .retire-cancel:disabled { opacity: .4; cursor: default; }

  /* -- 신체 상태 -- */
  .body-card   { display: grid; gap: 8px; }
  .body-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .body-title  {
    font-size: 10px; font-weight: 800; letter-spacing: 0.12em;
    color: var(--ink-mute); text-transform: uppercase; margin-right: 4px;
  }

  /* 부상 등급 — 경상에서 수술로 갈수록 진해진다 */
  .sev-badge {
    font-size: 10px; font-weight: 800; border-radius: 2px; padding: 2px 8px;
    color: var(--ink-on-dark);
  }
  .sev-badge.sev-light    { background: var(--ink-mute); }
  .sev-badge.sev-moderate { background: var(--warn); }
  .sev-badge.sev-severe   { background: var(--bad); }
  .sev-badge.sev-surgery  { background: #6B1E6B; }

  .inj-name-text { font-size: 13.5px; font-weight: 700; color: var(--ink); }
  .treat-tag, .rehab-tag {
    font-size: 10.5px; color: var(--ink-mid);
    background: var(--panel-sunk); border-radius: 2px; padding: 2px 8px;
  }
  .no-injury { font-size: 12.5px; color: var(--ok); font-weight: 700; }

  .recovery-row { display: flex; align-items: center; gap: 9px; }
  .rec-left-label { font-size: 11px; color: var(--ink-mute); width: 26px; flex-shrink: 0; }
  .rec-bar-wrap   { flex: 1; height: 5px; background: var(--panel-sunk); border-radius: 999px; overflow: hidden; }
  .rec-bar-fill   { height: 100%; border-radius: inherit; background: var(--ok); transition: width 0.3s; }
  .rec-weeks      { font-size: 11.5px; color: var(--ink-mid); white-space: nowrap; font-variant-numeric: tabular-nums; }

  .inj-history { display: grid; gap: 5px; }
  .hist-title  {
    font-size: 10px; font-weight: 800; letter-spacing: 0.12em;
    color: var(--ink-mute); text-transform: uppercase;
  }
  .hist-list { display: grid; gap: 1px; }
  .hist-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    font-size: 11.5px; padding: 6px 2px;
    border-bottom: 1px solid var(--line);
  }
  .hist-row:last-child { border-bottom: 0; }
  .hist-when { color: var(--ink-mute); font-variant-numeric: tabular-nums; }
  .hist-sev  { font-size: 10px; font-weight: 800; }
  .hist-sev.sev-light    { color: var(--ink-mute); }
  .hist-sev.sev-moderate { color: var(--warn); }
  .hist-sev.sev-severe   { color: var(--bad); }
  .hist-sev.sev-surgery  { color: #6B1E6B; }
  .hist-name { color: var(--ink); }
  .hist-loss { color: var(--bad); font-size: 11px; margin-left: auto; }

  /* -- 계약 / 병역 -- */
  .info-card    { display: flex; flex-direction: column; gap: 10px; }
  .info-section { display: grid; gap: 5px; }
  .info-title   {
    font-size: 10px; font-weight: 800; color: var(--ink-mute);
    letter-spacing: 0.12em; text-transform: uppercase;
  }
  .info-rows { display: grid; gap: 3px; }
  .info-row  { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
  .info-row span:first-child { color: var(--ink-mute); width: 64px; flex-shrink: 0; }
  .info-row strong { color: var(--ink); font-variant-numeric: tabular-nums; }
  .info-divider { height: 1px; background: var(--line); }

  .mil-done    { color: var(--ok); font-weight: 700; }
  .mil-exempt  { color: var(--ink-mid); }
  .mil-active  { color: var(--t-dark); font-weight: 700; }
  .mil-warn    { color: var(--bad); font-weight: 700; }
  .mil-pending { color: var(--ink-mute); }

  .contract-extend-badge {
    font-size: 10.5px; color: var(--ink-on-dark); font-weight: 700;
    background: var(--warn);
    border-radius: 2px; padding: 2px 8px;
  }

  @media (max-width: 960px) {
    .profile-card  { grid-template-columns: 1fr; }
    .summary-grid  { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .stats-layout  { grid-template-columns: 1fr; }
    .stat-list     { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .record-grid   { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  @media (prefers-reduced-motion: reduce) {
    .rec-bar-fill { transition: none; }
  }
</style>
