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

  type StatGroup = {
    title: string;
    items: Array<{ label: string; value: number; trend: "up" | "down" | "none" }>;
  };

  function statTrend(current: number, snapshot: number | undefined): "up" | "down" | "none" {
    if (snapshot == null) return "none";
    if (current - snapshot >= 1) return "up";
    if (snapshot - current >= 1) return "down";
    return "none";
  }

  $: statGroups = buildStatGroups($gameStore.protagonist);
  $: myStats = $seasonStore.stats[$gameStore.protagonist.id] ?? null;

  $: recentGames = (() => {
    const protagonistId = $gameStore.protagonist.id;
    const myTeamId = $gameStore.protagonist.teamId;
    return $seasonStore.schedule
      .filter(e => e.result && e.result.playerLines.some(l => l.playerId === protagonistId))
      .sort((a, b) => b.week - a.week)
      .slice(0, 5)
      .map(e => {
        const line = e.result!.playerLines.find(l => l.playerId === protagonistId) as PitcherGameLine;
        const isHome = e.homeTeamId === myTeamId;
        const opponentId = isHome ? e.awayTeamId : e.homeTeamId;
        const myScore = isHome ? e.result!.homeScore : e.result!.awayScore;
        const oppScore = isHome ? e.result!.awayScore : e.result!.homeScore;
        return { week: e.week, opponentId, myScore, oppScore, line };
      });
  })();

  function buildStatGroups(p: typeof $gameStore.protagonist): StatGroup[] {
    const pit  = p.pitching;
    const bat  = p.batting;
    const sp   = p.seasonStartPitching;
    const sb   = p.seasonStartBatting;
    const groups: StatGroup[] = [];

    if (p.playerType === "pitcher" || p.playerType === "twoWay") {
      groups.push({
        title: "투구",
        items: [
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
        ],
      });
    }

    if (p.playerType === "batter" || p.playerType === "twoWay") {
      groups.push({
        title: "타격",
        items: [
          { label: "OVR",    value: bat.ovr,          trend: statTrend(bat.ovr,          sb?.ovr) },
          { label: "컨택",   value: bat.contact,      trend: statTrend(bat.contact,      sb?.contact) },
          { label: "장타력", value: bat.power,        trend: statTrend(bat.power,        sb?.power) },
          { label: "선구안", value: bat.eye,          trend: statTrend(bat.eye,          sb?.eye) },
          { label: "극기",   value: bat.discipline,   trend: statTrend(bat.discipline,   sb?.discipline) },
          { label: "클러치", value: bat.battingClutch,trend: statTrend(bat.battingClutch,sb?.battingClutch) },
          { label: "플래툰", value: bat.platoon,      trend: statTrend(bat.platoon,      sb?.platoon) },
          { label: "번트",   value: bat.bunting,      trend: statTrend(bat.bunting,      sb?.bunting) },
        ],
      });
      groups.push({
        title: "주루·수비",
        items: [
          { label: "주력",     value: bat.speed,        trend: statTrend(bat.speed,        sb?.speed) },
          { label: "주루판단", value: bat.baseInstinct, trend: statTrend(bat.baseInstinct, sb?.baseInstinct) },
          { label: "수비",     value: bat.fielding,     trend: statTrend(bat.fielding,     sb?.fielding) },
          { label: "어깨",     value: bat.arm,          trend: statTrend(bat.arm,          sb?.arm) },
        ],
      });
    }

    return groups;
  }

  function statTone(value: number): "good" | "mid" | "low" {
    if (value >= 70) return "good";
    if (value >= 50) return "mid";
    return "low";
  }

  function formatBirthday(bd: string): string {
    const [y, m, d] = bd.split("-");
    return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
  }

  // XP 진행도 계산 (Rust xp_threshold와 동일: 7.5 + v * 0.35)
  function xpThreshold(v: number): number { return 7.5 + v * 0.35; }
  function xpPct(xp: number, v: number): number {
    return Math.min(99, Math.round(xp / xpThreshold(v) * 100));
  }

  const PITCH_STAT_LABELS: [keyof typeof $gameStore.protagonist.pitching, string][] = [
    ["velocity","구위"], ["command","커맨드"], ["control","제구"],
    ["movement","무브먼트"], ["stamina","스태미나"], ["mentality","멘탈"],
    ["recovery","회복력"], ["clutch","위기집중"], ["holdRunners","견제력"],
  ];
  const BATTING_STAT_LABELS: [keyof typeof $gameStore.protagonist.batting, string][] = [
    ["contact","컨택"], ["power","장타력"], ["eye","선구안"],
    ["discipline","극기"], ["battingClutch","클러치"], ["speed","주력"],
    ["fielding","수비"],
  ];

  const PITCH_NAMES: Record<string, string> = {
    PITCH_FASTBALL: "패스트볼", PITCH_SINKER: "싱커", PITCH_CUTTER: "커터",
    PITCH_SLIDER: "슬라이더", PITCH_CURVE: "커브", PITCH_CHANGEUP: "체인지업",
    PITCH_SPLITTER: "스플리터", PITCH_FORKBALL: "포크볼",
    PITCH_SCREWBALL: "스크루볼", PITCH_KNUCKLEBALL: "너클볼",
  };

  const GRADE_LABEL: Record<number, string> = {
    1: "습득중", 2: "기초", 3: "보통", 4: "능숙", 5: "마스터",
  };

  $: p = $gameStore.protagonist;
  $: injury        = p.injury;
  $: injuryHistory = (p.injuryHistory ?? []).slice().reverse();

  // ── 계약 / 병역 섹션 ─────────────────────────────────────────
  $: contract = p.contract ?? null;
  $: showContractSection =
    p.careerStage === "pro_kbl" || p.careerStage === "pro_abl" || p.careerStage === "independent";
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

  const TREATMENT_LABEL: Record<string, string> = {
    rest: "자연 휴식", conservative: "보존 치료", steroid: "스테로이드",
    prp: "PRP 주사", surgery: "수술", counseling: "심리 상담", self: "자가 극복",
  };
  const SEV_LABEL: Record<string, string> = {
    light: "경상", moderate: "중상", severe: "중증", surgery: "수술",
  };

  $: careerRecords = ($gameStore.protagonist.careerRecords ?? []).slice().reverse();

  function leagueShortName(lid: string): string {
    const map: Record<string, string> = {
      LEAGUE_HIGHSCHOOL: "고교", LEAGUE_UNIVERSITY: "대학",
      LEAGUE_INDEPENDENT: "독립", LEAGUE_KBL: "KBL",
      LEAGUE_ABL: "ABL", LEAGUE_JBL: "JBL",
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
      const teamChanged  = prev && prev.teamId   !== rec.teamId;
      const leagueChanged = prev && prev.leagueId !== rec.leagueId;
      return { rec, teamChanged, leagueChanged };
    });
  })();
</script>

<section class="page">
  <h2>{$t("page.status")}</h2>

  <article class="card profile-card">
    <div class="identity">
      <p class="name">{$gameStore.player.name}</p>
      {#if $gameStore.protagonist.birthday}
        <p class="meta birthday">{formatBirthday($gameStore.protagonist.birthday)}</p>
      {/if}
      <p class="meta">
        {$teamMap.get($gameStore.protagonist.teamId)?.name ?? $gameStore.player.team} · {$gameStore.player.year} · {$gameStore.player.position} · {$gameStore.player.role}
      </p>
      <p class="meta">{$gameStore.player.throws} / {$gameStore.player.bats}</p>
      <div class="tags">
        {#each $gameStore.player.tags as tag}
          <span>{tag}</span>
        {/each}
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-item">
        <span>OVR</span>
        <strong>{$gameStore.player.overall}</strong>
      </div>
      <div class="summary-item">
        <span>컨디션</span>
        <strong>{$gameStore.player.condition}</strong>
      </div>
      <div class="summary-item">
        <span>피로도</span>
        <strong>{$gameStore.player.fatigue}</strong>
      </div>
      <div class="summary-item">
        <span>사기</span>
        <strong>{$gameStore.player.morale}</strong>
      </div>
    </div>
  </article>

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
            <div class="info-row">
              <span>연봉</span>
              <strong>{formatSalary(contract.salary)}</strong>
            </div>
            <div class="info-row">
              <span>잔여 기간</span>
              <strong>{contract.remainingYears}년{contractExpireYear ? ` (만료: ${contractExpireYear}년)` : ""}</strong>
            </div>
            <div class="info-row">
              <span>FA 자격</span>
              <strong>{faYearsLeft > 0 ? `${faYearsLeft}년 후` : "FA 자격 보유"}</strong>
            </div>
            {#if (p.proServiceYears ?? 0) > 0}
              <div class="info-row">
                <span>프로 경력</span>
                <strong>{p.proServiceYears}년차</strong>
              </div>
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
              <div class="info-row">
                <span>입대</span>
                <strong>{p.militaryEnlistYear}년</strong>
              </div>
            {/if}
            {#if p.militaryStatus === "현역" && p.militaryDischargeYear}
              <div class="info-row">
                <span>전역 예정</span>
                <strong>{p.militaryDischargeYear}년 W48</strong>
              </div>
            {/if}
            {#if p.militaryStatus === "현역" && (p.militaryServiceWeeks ?? 0) > 0}
              <div class="info-row">
                <span>복무 기간</span>
                <strong>{p.militaryServiceWeeks}주 경과</strong>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </article>
  {/if}

  <nav class="tab-bar">
    <button class:tab-active={activeTab === "stats"}  on:click={() => (activeTab = "stats")}>능력치</button>
    <button class:tab-active={activeTab === "record"} on:click={() => (activeTab = "record")}>성적</button>
    <button class:tab-active={activeTab === "career"} on:click={() => (activeTab = "career")}>기록</button>
  </nav>

  <div class="tab-content">
    {#if activeTab === "stats"}
      <div class="stats-grid">
        {#each statGroups as group}
          <article class="card stat-card">
            <h3>{group.title}</h3>
            <div class="stat-list">
              {#each group.items as stat}
                <div class="stat-item">
                  <span class="label">{stat.label}</span>
                  <span class={`value ${statTone(stat.value)}`}>
                    {stat.value}
                    {#if stat.trend === "up"}
                      <span class="trend-arrow up">↑</span>
                    {:else if stat.trend === "down"}
                      <span class="trend-arrow down">↓</span>
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          </article>
        {/each}
      </div>

      {#if $gameStore.protagonist.playerType === "pitcher" || $gameStore.protagonist.playerType === "twoWay"}
        {#if ($gameStore.protagonist.pitches ?? []).length > 0}
          <article class="card pitches-card">
            <h3>보유 구종</h3>
            <div class="pitch-list">
              {#each $gameStore.protagonist.pitches as pitch}
                <div class="pitch-item grade-{pitch.grade}">
                  <span class="pitch-name">{PITCH_NAMES[pitch.id] ?? pitch.id}</span>
                  <span class="pitch-grade">{GRADE_LABEL[pitch.grade] ?? pitch.grade}</span>
                </div>
              {/each}
            </div>
          </article>
        {/if}
      {/if}

      <!-- XP 진행도 카드 -->
      {#if $gameStore.protagonist.playerType === "pitcher" || $gameStore.protagonist.playerType === "twoWay"}
        {@const xp = $gameStore.protagonist.pitchingXP ?? {}}
        {@const pit = $gameStore.protagonist.pitching}
        <article class="card xp-card">
          <h3>훈련 XP 진행도</h3>
          <div class="xp-list">
            {#each PITCH_STAT_LABELS as [key, label]}
              {@const val = (pit as Record<string, number>)[key as string] ?? 0}
              {@const pct = xpPct((xp as Record<string, number>)[key as string] ?? 0, val)}
              <div class="xp-row">
                <span class="xp-label">{label}</span>
                <div class="xp-track">
                  <div class="xp-fill" style="width:{pct}%"></div>
                </div>
                <span class="xp-pct">{pct}%</span>
              </div>
            {/each}
          </div>
        </article>
      {/if}
      {#if $gameStore.protagonist.playerType === "batter" || $gameStore.protagonist.playerType === "twoWay"}
        {@const xp = $gameStore.protagonist.battingXP ?? {}}
        {@const bat = $gameStore.protagonist.batting}
        <article class="card xp-card">
          <h3>훈련 XP 진행도 (타격)</h3>
          <div class="xp-list">
            {#each BATTING_STAT_LABELS as [key, label]}
              {@const val = (bat as Record<string, number>)[key as string] ?? 0}
              {@const pct = xpPct((xp as Record<string, number>)[key as string] ?? 0, val)}
              <div class="xp-row">
                <span class="xp-label">{label}</span>
                <div class="xp-track">
                  <div class="xp-fill" style="width:{pct}%"></div>
                </div>
                <span class="xp-pct">{pct}%</span>
              </div>
            {/each}
          </div>
        </article>
      {/if}

    {:else}
      <article class="card record-card">
        <h3>시즌 누적 성적</h3>
        {#if myStats?.type === "pitcher"}
          <div class="record-grid">
            {#each [
              ["G",    myStats.g],
              ["W",    myStats.w],
              ["L",    myStats.l],
              ["SV",   myStats.sv],
              ["HD",   myStats.hd],
              ["IP",   myStats.ip],
              ["ERA",  myStats.era?.toFixed(2)],
              ["WHIP", myStats.whip?.toFixed(2)],
              ["K",    myStats.k],
              ["BB",   myStats.bb],
              ["H",    myStats.h],
              ["ER",   myStats.er],
            ] as [lbl, val]}
              <div class="record-item">
                <span class="rec-label">{lbl}</span>
                <strong class="rec-value">{val ?? "-"}</strong>
              </div>
            {/each}
          </div>
        {:else if myStats?.type === "batter"}
          <div class="record-grid">
            {#each [
              ["G",   myStats.g],
              ["AVG", myStats.avg?.toFixed(2)],
              ["OPS", myStats.ops?.toFixed(2)],
              ["HR",  myStats.hr],
              ["RBI", myStats.rbi],
              ["SB",  myStats.sb],
              ["BB",  myStats.bb],
              ["K",   myStats.k],
              ["H",   myStats.h],
              ["AB",  myStats.ab],
              ["PA",  myStats.pa],
              ["OBP", myStats.obp?.toFixed(2)],
            ] as [lbl, val]}
              <div class="record-item">
                <span class="rec-label">{lbl}</span>
                <strong class="rec-value">{val ?? "-"}</strong>
              </div>
            {/each}
          </div>
        {:else}
          <p class="pending">시즌 누적 집계 중</p>
        {/if}
      </article>

      {#if myStats?.type === "pitcher"}
        <article class="card recent-card">
          <h3>최근 5경기</h3>
          {#if recentGames.length === 0}
            <p class="pending">아직 출전 기록이 없습니다.</p>
          {:else}
            <div class="recent-table-wrap">
              <table class="recent-table">
                <thead>
                  <tr>
                    <th>주차</th>
                    <th>상대</th>
                    <th>결과</th>
                    <th>점수</th>
                    <th>IP</th>
                    <th>H</th>
                    <th>BB</th>
                    <th>K</th>
                    <th>ER</th>
                    <th>투구수</th>
                  </tr>
                </thead>
                <tbody>
                  {#each recentGames as g}
                    <tr>
                      <td>W{g.week}</td>
                      <td class="opp-name">{$teamMap.get(g.opponentId)?.name ?? g.opponentId}</td>
                      <td><span class="decision decision-{g.line.decision}">{g.line.decision}</span></td>
                      <td class="score">{g.myScore}:{g.oppScore}</td>
                      <td>{g.line.ip ?? '-'}</td>
                      <td>{g.line.h ?? '-'}</td>
                      <td>{g.line.bb ?? '-'}</td>
                      <td>{g.line.k ?? '-'}</td>
                      <td>{g.line.er ?? '-'}</td>
                      <td>{g.line.pitchCount ?? '—'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </article>
      {/if}

    {:else if activeTab === "career"}
      {#if careerRecords.length === 0}
        <article class="card record-card">
          <p class="pending">시즌을 마치면 기록이 쌓입니다.</p>
        </article>
      {:else}
        <!-- 시즌별 성적 -->
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

        <!-- 수상 내역 -->
        {#if careerRecords.some((r) => r.awards.length > 0)}
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

        <!-- 커리어 타임라인 -->
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
                    {#if entry.leagueChanged}<span class="tl-badge tl-badge-league">리그 이동</span>{:else if entry.teamChanged}<span class="tl-badge tl-badge-team">팀 이적</span>{/if}
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

  h2, h3, p { margin: 0; }
  h2 { font-size: 22px; }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
  }

  .profile-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
  }

  .name { font-size: 22px; font-weight: 700; color: #f1f6ff; }
  .meta { margin-top: 4px; color: #aebddd; font-size: 14px; }
  .meta.birthday { color: #7a9ac8; font-size: 13px; }

  .tags { margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; }
  .tags span {
    font-size: 12px; color: #d5e2fd;
    border: 1px solid #3c4f74; background: #233250;
    border-radius: 999px; padding: 4px 8px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(70px, 1fr));
    gap: 8px;
  }
  .summary-item {
    background: #0f1830; border: 1px solid #314362;
    border-radius: 8px; padding: 8px; text-align: center;
  }
  .summary-item span { font-size: 12px; color: #92a8ce; }
  .summary-item strong { display: block; margin-top: 4px; font-size: 20px; color: #f1f6ff; }

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

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }

  .stat-card h3 { font-size: 16px; margin-bottom: 10px; color: #ebf2ff; }

  .stat-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
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

  /* XP 진행도 카드 */
  .xp-card h3 { font-size: 16px; margin-bottom: 10px; color: #ebf2ff; }
  .xp-list { display: flex; flex-direction: column; gap: 6px; }
  .xp-row {
    display: grid;
    grid-template-columns: 52px 1fr 36px;
    align-items: center;
    gap: 8px;
  }
  .xp-label { font-size: 12px; color: #8aabda; text-align: right; }
  .xp-track {
    height: 5px;
    background: #1a2d4a;
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid #243a58;
  }
  .xp-fill {
    height: 100%;
    background: linear-gradient(90deg, #2a6cb8, #4d9ef5);
    border-radius: 3px;
    min-width: 2px;
  }
  .xp-pct { font-size: 11px; color: #6a8ab0; text-align: right; font-variant-numeric: tabular-nums; }

  .pitches-card h3 { margin-bottom: 10px; }
  .pitch-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .pitch-item {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: #152b4f; border: 1px solid #2e486f;
    border-radius: 8px; padding: 8px 12px; min-width: 72px;
  }
  .pitch-name { font-size: 13px; font-weight: 700; color: #d5e2fd; }
  .pitch-grade { font-size: 11px; color: #7a9ac8; }
  .pitch-item.grade-5 { border-color: #c8a030; background: #2a1e06; }
  .pitch-item.grade-5 .pitch-name { color: #f0c860; }
  .pitch-item.grade-5 .pitch-grade { color: #c8a030; }
  .pitch-item.grade-4 { border-color: #3a7ad8; background: #0e2040; }
  .pitch-item.grade-4 .pitch-name { color: #88b8f8; }
  .pitch-item.grade-4 .pitch-grade { color: #5a8fd8; }
  .pitch-item.grade-1 { border-color: #3a4060; background: #10142a; }
  .pitch-item.grade-1 .pitch-name { color: #6878a8; }
  .pitch-item.grade-1 .pitch-grade { color: #485878; }

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

  .pending { color: #9db2d8; font-size: 13px; }

  .recent-card h3 { font-size: 16px; margin-bottom: 12px; color: #ebf2ff; }

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
    color: #7a9ac8;
    font-weight: 600;
    font-size: 11px;
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
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
  }

  .decision-W   { background: rgba(55, 214, 122, 0.12); color: #37d67a; border: 1px solid #2a5a3a; }
  .decision-L   { background: rgba(255,  74,  74, 0.10); color: #ff6a6a; border: 1px solid #5a2a2a; }
  .decision-SV  { background: rgba( 80, 180, 255, 0.12); color: #60c8ff; border: 1px solid #1a4a6a; }
  .decision-HD  { background: rgba(160, 120, 255, 0.12); color: #b88fff; border: 1px solid #3a2a6a; }
  .decision-ND  { background: rgba(160, 180, 210, 0.10); color: #90a8c8; border: 1px solid #2a3a50; }

  /* 커리어 탭 */
  .career-card h3 { font-size: 16px; margin-bottom: 12px; color: #ebf2ff; }

  .career-table-wrap { overflow-x: auto; }

  .career-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    color: #c8d8f0;
  }

  .career-table th {
    padding: 6px 10px;
    text-align: center;
    color: #7a9ac8;
    font-weight: 600;
    font-size: 11px;
    border-bottom: 1px solid #253451;
    white-space: nowrap;
  }

  .career-table td {
    padding: 7px 10px;
    text-align: center;
    border-bottom: 1px solid #1a2640;
    white-space: nowrap;
  }

  .career-table tbody tr:hover { background: #0f1d35; }

  .year-cell  { font-weight: 700; color: #a8c4f0; }
  .team-cell  { text-align: left; color: #d5e2fd; }
  .stat-cell  { text-align: left; color: #e0e8ff; font-size: 11px; }
  .ovr-cell   { font-weight: 700; color: #68de92; }
  .ps-cell    { color: #f0c860; font-weight: 700; }

  /* 수상 내역 */
  .awards-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .award-chip {
    display: flex; align-items: center; gap: 6px;
    background: #1e2c4a; border: 1px solid #4a6898;
    border-radius: 20px; padding: 5px 12px;
  }
  .award-year  { font-size: 11px; color: #7a9ac8; }
  .award-label { font-size: 12px; font-weight: 700; color: #f0c060; }
  .award-val   { font-size: 12px; color: #80d8ff; }

  /* 타임라인 */
  .timeline {
    display: flex; flex-direction: column; gap: 0;
    padding-left: 8px;
    border-left: 2px solid #2a3f62;
  }

  .tl-item {
    display: flex; gap: 14px;
    padding: 10px 0 10px 0;
    position: relative;
  }

  .tl-dot {
    position: absolute;
    left: -9px; top: 16px;
    width: 10px; height: 10px;
    border-radius: 50%;
    background: #2a4a80;
    border: 2px solid #5c8fd8;
    flex-shrink: 0;
  }

  .tl-item.tl-change .tl-dot {
    background: #805020;
    border-color: #f0a040;
  }

  .tl-body { flex: 1; padding-left: 6px; }

  .tl-header {
    display: flex; align-items: center; gap: 8px;
    flex-wrap: wrap;
  }

  .tl-year  { font-size: 13px; font-weight: 700; color: #a8c4f0; }
  .tl-league { font-size: 11px; color: #6a8ab8; }
  .tl-team  { font-size: 13px; color: #d5e2fd; font-weight: 600; }

  .tl-badge {
    font-size: 10px; font-weight: 700; border-radius: 4px;
    padding: 2px 6px;
  }
  .tl-badge-league { background: rgba(240,160,64,0.15); color: #f0a040; border: 1px solid #805020; }
  .tl-badge-team   { background: rgba(90,160,255,0.10); color: #70b0ff; border: 1px solid #2a4a80; }

  .tl-stat { margin: 4px 0 0; font-size: 12px; color: #9eb6de; }

  .tl-awards { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
  .tl-award {
    font-size: 11px; color: #f0c060; font-weight: 700;
    background: rgba(240,192,64,0.1);
    border: 1px solid rgba(240,192,64,0.3);
    border-radius: 4px; padding: 2px 7px;
  }

  /* 신체 상태 카드 */
  .body-card {
    display: grid;
    gap: 8px;
  }

  .body-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .body-title {
    font-size: 13px;
    color: #7a9ac8;
    font-weight: 600;
    margin-right: 4px;
  }

  .sev-badge {
    font-size: 11px;
    font-weight: 700;
    border-radius: 6px;
    padding: 2px 8px;
  }
  .sev-badge.sev-light    { background: rgba(100,180,255,0.10); color: #80c8ff; border: 1px solid #2a4a6a; }
  .sev-badge.sev-moderate { background: rgba(255,160,50,0.15);  color: #ffa030; border: 1px solid #7a4010; }
  .sev-badge.sev-severe   { background: rgba(220,60,60,0.15);   color: #e05050; border: 1px solid #7a2020; }
  .sev-badge.sev-surgery  { background: rgba(180,80,255,0.15);  color: #d080ff; border: 1px solid #5a2080; }

  .inj-name-text { font-size: 14px; font-weight: 600; color: #e8f0ff; }

  .treat-tag {
    font-size: 11px;
    color: #9eb6de;
    border: 1px solid #2d3956;
    border-radius: 4px;
    padding: 2px 7px;
  }

  .rehab-tag {
    font-size: 11px;
    color: #d080ff;
    border: 1px solid #5a2080;
    border-radius: 4px;
    padding: 2px 7px;
    background: rgba(180,80,255,0.08);
  }

  .no-injury { font-size: 13px; color: #68de92; }

  .recovery-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rec-left-label { font-size: 12px; color: #7a9ac8; width: 24px; flex-shrink: 0; }
  .rec-bar-wrap {
    flex: 1;
    height: 6px;
    background: #1e3054;
    border-radius: 999px;
    overflow: hidden;
  }
  .rec-bar-fill {
    height: 100%;
    border-radius: inherit;
    background: #68de92;
    transition: width 0.3s;
  }
  .rec-weeks { font-size: 12px; color: #9eb6de; white-space: nowrap; }

  .inj-history { display: grid; gap: 6px; }
  .hist-title  { font-size: 12px; color: #6a8ab8; font-weight: 600; }

  .hist-list { display: grid; gap: 4px; }

  .hist-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
    padding: 4px 8px;
    background: #0f1830;
    border: 1px solid #1e3050;
    border-radius: 6px;
  }
  .hist-when { color: #6a8ab8; }
  .hist-sev  { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
  .hist-sev.sev-light    { color: #80c8ff; }
  .hist-sev.sev-moderate { color: #ffa030; }
  .hist-sev.sev-severe   { color: #e05050; }
  .hist-sev.sev-surgery  { color: #d080ff; }
  .hist-name { color: #c8d8f0; }
  .hist-loss { color: #ff9b8a; font-size: 11px; margin-left: auto; }

  /* ── 계약 / 병역 카드 ───────────────────────────────────────── */
  .info-card { display: flex; flex-direction: column; gap: 10px; }

  .info-section { display: grid; gap: 6px; }

  .info-title {
    font-size: 11px; font-weight: 700; color: #6a8ab8;
    letter-spacing: 0.5px; text-transform: uppercase;
  }

  .info-rows { display: grid; gap: 4px; }

  .info-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
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

  @media (max-width: 960px) {
    .profile-card { grid-template-columns: 1fr; }
    .summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .stats-grid { grid-template-columns: 1fr; }
    .record-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
