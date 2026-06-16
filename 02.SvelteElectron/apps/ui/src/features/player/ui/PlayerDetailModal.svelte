<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import type { EntityDetails } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import { getFaThreshold } from "../../../shared/utils/faEngine";

  export let entityId: string = "";

  const dispatch = createEventDispatcher<{ close: void }>();
  function close() { dispatch("close"); }
  function handleOverlayClick(e: MouseEvent) { if (e.target === e.currentTarget) close(); }
  function handleKeydown(e: KeyboardEvent) { if (e.key === "Escape") close(); }

  type ModalTab = "stats" | "record" | "history";
  let modalTab: ModalTab = "stats";
  $: if (entityId) modalTab = "stats";

  // ── 라벨 헬퍼 ──────────────────────────────────────────
  function roleLabel(role: string) {
    if (role === "coach") return "코치";
    if (role === "manager") return "감독";
    if (role === "owner") return "구단주";
    return "선수";
  }
  function statusLabel(s: string) {
    if (s === "active")   return "활성";
    if (s === "inactive") return "비활성";
    if (s === "injured")  return "부상";
    if (s === "retired")  return "은퇴";
    return s;
  }
  function statusBadgeClass(s: string) {
    if (s === "active")            return "badge-good";
    if (s === "injured")           return "badge-injury";
    if (s === "inactive" || s === "retired") return "badge-low";
    return "badge-mid";
  }
  function conditionLabel(v: number) { return v >= 70 ? "좋음" : v >= 40 ? "보통" : "주의"; }
  function conditionClass(v: number) { return v >= 70 ? "good" : v >= 40 ? "mid" : "low"; }
  function fatigueLabel(v: number)   { return v >= 70 ? "높음" : v >= 40 ? "보통" : "낮음"; }
  function fatigueClass(v: number)   { return v >= 70 ? "low"  : v >= 40 ? "mid" : "good"; }
  function formatSalary(salary: number) {
    if (salary >= 10000) return `${(salary / 10000).toFixed(1)}억`;
    return `${salary.toLocaleString()}만`;
  }
  function outcomeClass(o: string) {
    if (o === "W") return "outcome-w";
    if (o === "L") return "outcome-l";
    return "outcome-d";
  }
  function statTone(v: number) {
    if (v >= 70) return "good";
    if (v >= 50) return "mid";
    return "low";
  }
  function ovrTone(v: number) {
    if (v >= 80) return "ovr-s";
    if (v >= 70) return "ovr-a";
    if (v >= 60) return "ovr-b";
    return "ovr-c";
  }
  function pitchStars(grade: number) {
    return "★".repeat(grade) + "☆".repeat(5 - grade);
  }
  function npcMilText(s: string) {
    if (s === "군필") return "군필";
    if (s === "면제") return "면제";
    if (s === "현역") return "현역";
    return "미필";
  }
  function npcMilClass(s: string) {
    if (s === "군필") return "mil-done";
    if (s === "면제") return "mil-exempt";
    if (s === "현역") return "mil-active";
    return "mil-pending";
  }
  function formatBirthday(bd: string) {
    const [, m, d] = bd.split("-");
    return `2010년 ${parseInt(m)}월 ${parseInt(d)}일`;
  }
  function formatNotes(entity: typeof modalEntity): string {
    if (!entity) return "";
    const raw = (entity as unknown as { notes?: string }).notes ?? "";
    if (!raw.includes("체육부대 복무 중")) return raw;
    const clubId = (entity as unknown as { clubId?: string }).clubId ?? "";
    const clubName = clubById.get(clubId) ?? clubId;
    return clubName ? `체육부대 복무 중|원 소속팀 ${clubName}` : raw;
  }

  const PITCH_NAMES: Record<string, string> = {
    PITCH_FASTBALL: "패스트볼", PITCH_SINKER: "싱커", PITCH_CUTTER: "커터",
    PITCH_SLIDER: "슬라이더", PITCH_CURVE: "커브", PITCH_CHANGEUP: "체인지업",
    PITCH_SPLITTER: "스플리터", PITCH_FORKBALL: "포크볼",
    PITCH_SCREWBALL: "스크루볼", PITCH_KNUCKLEBALL: "너클볼",
  };
  const LEAGUE_DISPLAY: Record<string, string> = {
    LEAGUE_HIGHSCHOOL: "고교", LEAGUE_UNIVERSITY: "대학",
    LEAGUE_KBL: "KBL", LEAGUE_ABL: "ABL", LEAGUE_JBL: "JBL", LEAGUE_IND: "독립",
  };
  const POS_LABEL: Record<string, string> = {
    C: "포수", "1B": "1루", "2B": "2루", "3B": "3루", SS: "유격",
    LF: "좌익", CF: "중견", RF: "우익", SP: "선발", RP: "불펜",
  };

  // ── 레이더 차트 상수 ──────────────────────────────────────
  const R_CX = 80, R_CY = 80, R_R = 56, R_MAX = 99;
  const PITCHER_LABELS = ["구위", "커맨드", "제구", "무브먼트", "멘탈", "스태미나"];
  const BATTER_LABELS  = ["컨택", "장타력", "선구안", "주력", "수비", "극기"];

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
  function radarPts(vals: (number | undefined)[]): string {
    return vals.map((v, i) => {
      const a = (Math.PI / 180) * (-90 + i * 60);
      const ratio = Math.min((v ?? 0) / R_MAX, 1);
      return `${(R_CX + R_R * ratio * Math.cos(a)).toFixed(1)},${(R_CY + R_R * ratio * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  }

  // ── 스토어 파생 ──────────────────────────────────────────
  $: protagonistRow = (() => {
    const p = $gameStore.protagonist;
    return {
      id: p.id, name: p.name, role: "player" as const,
      age: p.age, status: "active" as const,
      leagueId: p.leagueId, teamId: p.teamId, schoolId: p.schoolId ?? "",
      grade: p.grade, notes: "",
      details: {
        player: {
          playerType: p.playerType, handedness: p.handedness, position: p.position,
          jerseyNumber: p.jerseyNumber, pitching: p.pitching, batting: p.batting,
          positionRatings: p.positionRatings, primaryPosition: p.primaryPosition,
          diligence: p.diligence, popularity: p.popularity,
          developmentRate: p.developmentRate, potentialHidden: p.potentialHidden,
        },
        coach: null, manager: null, owner: null,
      },
    };
  })();

  $: isProtagonistModal = !!entityId && entityId === $gameStore.protagonist.id;

  $: modalEntity = entityId
    ? (isProtagonistModal
        ? protagonistRow
        : $masterStore.entities.find((e) => e.id === entityId) ?? null)
    : null;

  $: modalStats = modalEntity
    ? ($seasonStore.stats[modalEntity.id]
        ?? Object.values($seasonStore.leagueState ?? {})
            .map((ls) => (ls as { stats?: Record<string, unknown> }).stats?.[modalEntity!.id])
            .find(Boolean)
        ?? null)
    : null;

  $: teamById = new Map(($masterStore.teams ?? []).map((t) => [t.id, t.name]));
  $: clubById = new Map(($masterStore.clubs ?? []).map((c) => [c.id, c.name]));

  $: modalRecentGames = (() => {
    if (!entityId || !modalEntity) return [];
    if (isProtagonistModal) {
      return $seasonStore.schedule
        .filter((e) => e.result?.playerLines.some((l) => l.playerId === $gameStore.protagonist.id))
        .sort((a, b) => b.week - a.week)
        .slice(0, 5);
    }
    const tid = modalEntity.teamId ?? "";
    const lid = modalEntity?.leagueId ?? (modalEntity as any)?.originLeagueId ?? "";
    const entries = [
      ...($seasonStore.leagueSchedules[lid] ?? []),
      ...$seasonStore.schedule.filter((e) => e.leagueId === lid),
    ];
    const seen = new Set<string>();
    return entries
      .filter((e) => {
        if (!e.result || seen.has(e.id)) return false;
        seen.add(e.id);
        return (e.homeTeamId === tid || e.awayTeamId === tid)
          && e.result.playerLines.some((l) => l.playerId === entityId);
      })
      .sort((a, b) => b.week - a.week)
      .slice(0, 5);
  })();

  $: modalTeamRank = (() => {
    if (!modalEntity) return null;
    const tid = modalEntity.teamId;
    const lid = modalEntity?.leagueId ?? (modalEntity as any)?.originLeagueId ?? "";
    let standings = $seasonStore.standings;
    if (!standings.find((s) => s.teamId === tid)) {
      const ls = ($seasonStore.leagueState ?? {})[lid];
      if (ls?.standings?.length) standings = ls.standings;
    }
    const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    const idx = sorted.findIndex((s) => s.teamId === tid);
    if (idx < 0) return null;
    const s = sorted[idx];
    return { rank: idx + 1, wins: s.wins, losses: s.losses, draws: s.draws, winPct: s.winPct };
  })();

  $: modalNpcSave = modalEntity && !isProtagonistModal
    ? (($gameStore.npcs ?? []).find((n) => n.npcId === modalEntity!.id) ?? null)
    : null;

  $: npcLive = entityId ? ($seasonStore.npcLiveStats[entityId] ?? null) : null;

  $: livePitching = isProtagonistModal ? $gameStore.protagonist.pitching : (npcLive?.pitching ?? null);
  $: liveBatting  = isProtagonistModal ? $gameStore.protagonist.batting  : (npcLive?.batting  ?? null);
  $: snapPitch = isProtagonistModal ? $gameStore.protagonist.seasonStartPitching : npcLive?.seasonStartPitching;
  $: snapBat   = isProtagonistModal ? $gameStore.protagonist.seasonStartBatting  : npcLive?.seasonStartBatting;

  function statTrend(cur: number, snap: number | undefined): "up" | "down" | "none" {
    if (snap == null) return "none";
    if (cur - snap >= 1) return "up";
    if (snap - cur >= 1) return "down";
    return "none";
  }

  // ── 계약 요약 (팀명 + 연도 범위 + n년차) ──────────────────
  $: contractSummary = (() => {
    if (!modalEntity) return null;
    const curYear = $seasonStore.seasonYear ?? 2026;
    let teamId: string, dur: number;
    if (isProtagonistModal) {
      const c = $gameStore.protagonist.contract;
      if (!c) return null;
      teamId = $gameStore.protagonist.teamId;
      // 주인공은 실제 계약 잔여년수 사용
      const rem = c.remainingYears;
      const endYear   = curYear + rem - 1;
      const startYear = endYear - c.durationYears + 1;
      const yearsIn   = c.durationYears - rem + 1;
      return { teamName: teamById.get(teamId) ?? teamId, startYear, endYear, yearsIn };
    } else {
      const mp2 = (modalEntity.details as EntityDetails)?.player;
      teamId = modalEntity.teamId;
      // NPC: Rust가 매 오프시즌 계산한 contractYears 우선, 없으면 master 폴백
      dur = modalNpcSave?.contractYears ?? mp2?.contract?.durationYears ?? 1;
      const endYear   = curYear + dur - 1;
      const startYear = curYear;
      const yearsIn   = modalNpcSave?.proServiceYears ?? mp2?.proServiceYears ?? 1;
      return { teamName: teamById.get(teamId) ?? teamId, startYear, endYear, yearsIn };
    }
  })();

  // ── FA 정보 ──────────────────────────────────────────────
  $: faInfo = (() => {
    if (isProtagonistModal) {
      const p = $gameStore.protagonist;
      if (p.careerStage !== "pro_kbl" && p.careerStage !== "pro_abl") return null;
      const years = p.proServiceYears ?? 0;
      const threshold = getFaThreshold(p.leagueId);
      return { eligible: years >= threshold, years, yearsLeft: Math.max(0, threshold - years), threshold };
    }
    const mp2 = (modalEntity?.details as EntityDetails)?.player;
    // NpcSaveState 우선 (Rust가 매 시즌 업데이트), 없으면 master entity 폴백
    const proYears = modalNpcSave?.proServiceYears ?? mp2?.proServiceYears ?? 0;
    if (!proYears) return null;
    const threshold = getFaThreshold(modalEntity?.leagueId ?? "");
    return { eligible: proYears >= threshold, years: proYears, yearsLeft: Math.max(0, threshold - proYears), threshold };
  })();

  // ── 연도별 성적 ──────────────────────────────────────────
  $: historyEntries = (() => {
    if (!modalEntity) return [];
    if (isProtagonistModal) {
      return [...($gameStore.protagonist.careerRecords ?? [])]
        .reverse().slice(0, 5)
        .map((r) => ({ year: r.year, leagueId: r.leagueId, teamId: r.teamId, statLine: r.statLine, rank: r.rank, totalTeams: r.totalTeams, stats: r.stats }));
    }
    return [...(modalNpcSave?.careerHistory ?? [])]
      .reverse().slice(0, 5)
      .map((r) => ({ year: r.year, leagueId: r.leagueId, teamId: r.teamId, statLine: r.statLine, rank: undefined as number | undefined, totalTeams: undefined as number | undefined, stats: r.stats }));
  })();
  $: hasRank = historyEntries.some((e) => e.rank != null);
</script>

<svelte:window on:keydown={handleKeydown} />

{#if modalEntity}
  {@const mp = (modalEntity.details as EntityDetails)?.player}
  {@const mc = (modalEntity.details as EntityDetails)?.coach}
  {@const mm = (modalEntity.details as EntityDetails)?.manager}
  {@const isPlayer  = modalEntity.role === "player" && !!mp}
  {@const isPitcher = isPlayer && (mp.playerType === "pitcher" || mp.playerType === "twoWay")}
  {@const isBatter  = isPlayer && (mp.playerType === "batter"  || mp.playerType === "twoWay")}
  {@const protagonist = $gameStore.protagonist}

  {@const pitcherVals = isPitcher ? [
    livePitching?.velocity  ?? mp.pitching?.velocity  ?? 0,
    livePitching?.command   ?? mp.pitching?.command   ?? 0,
    livePitching?.control   ?? mp.pitching?.control   ?? 0,
    livePitching?.movement  ?? mp.pitching?.movement  ?? 0,
    livePitching?.mentality ?? mp.pitching?.mentality ?? 0,
    livePitching?.stamina   ?? mp.pitching?.stamina   ?? 0,
  ] : []}
  {@const pitcherSnap = isPitcher ? [
    snapPitch?.velocity, snapPitch?.command, snapPitch?.control,
    snapPitch?.movement, snapPitch?.mentality, snapPitch?.stamina,
  ] : []}
  {@const batterVals = isBatter ? [
    liveBatting?.contact    ?? mp.batting?.contact    ?? 0,
    liveBatting?.power      ?? mp.batting?.power      ?? 0,
    liveBatting?.eye        ?? mp.batting?.eye        ?? 0,
    liveBatting?.speed      ?? mp.batting?.speed      ?? 0,
    liveBatting?.fielding   ?? mp.batting?.fielding   ?? 0,
    liveBatting?.discipline ?? mp.batting?.discipline ?? 0,
  ] : []}
  {@const batterSnap = isBatter ? [
    snapBat?.contact, snapBat?.power, snapBat?.eye,
    snapBat?.speed,   snapBat?.fielding, snapBat?.discipline,
  ] : []}
  {@const radarVals   = isPitcher ? pitcherVals : batterVals}
  {@const radarSnap   = isPitcher ? pitcherSnap : batterSnap}
  {@const radarLabels = isPitcher ? PITCHER_LABELS : BATTER_LABELS}
  {@const ovrVal = isPitcher
    ? (livePitching?.ovr ?? mp.pitching?.ovr ?? 0)
    : isBatter
      ? (liveBatting?.ovr ?? mp.batting?.ovr ?? 0)
      : 0}

  {@const pid  = isProtagonistModal ? protagonist.id : entityId}
  {@const ptId = isProtagonistModal ? protagonist.teamId : (modalEntity?.teamId ?? "")}

  <div class="modal-overlay" on:click={handleOverlayClick} role="dialog" aria-modal="true">
    <div class="modal-box">
      <button class="modal-close" on:click={close}>✕</button>

      <!-- ── 헤더 (풀 너비) ── -->
      <header class="modal-header">
        <div class="title-block">
          <div class="name-row">
            {#if mp?.jerseyNumber != null}
              <span class="jersey"># {mp.jerseyNumber}</span>
            {/if}
            <h3 class="modal-name">{modalEntity.name}</h3>
          </div>
          {#if isProtagonistModal && protagonist.birthday}
            <p class="modal-birthday">{formatBirthday(protagonist.birthday)}</p>
          {/if}
          <p class="modal-meta">
            {roleLabel(modalEntity.role)} · {modalEntity.age}세
            {#if mp?.position} · {mp.position}{/if}
            {#if mp?.handedness} · {mp.handedness}투{/if}
          </p>
        </div>
        <div class="badge-row">
          {#if isPlayer}
            {#if isProtagonistModal}
              <span class="badge badge-{conditionClass(protagonist.condition)}">컨디션 {conditionLabel(protagonist.condition)}</span>
              <span class="badge badge-{fatigueClass(protagonist.fatigue)}">피로 {fatigueLabel(protagonist.fatigue)}</span>
              {#if protagonist.injury}
                <span class="badge badge-injury">부상 · {protagonist.injury.recoveryWeeksLeft}주</span>
              {/if}
            {:else}
              <span class="badge {statusBadgeClass(modalEntity.status ?? 'active')}">{statusLabel(modalEntity.status ?? "active")}</span>
            {/if}
          {/if}
        </div>
      </header>

      <!-- ── 2컬럼 바디 ── -->
      <div class="modal-body">

        <!-- 좌측 고정 패널 -->
        <aside class="left-panel">
          {#if isPlayer}

            <!-- OVR -->
            <div class="ovr-block">
              <span class="ovr-label">OVR</span>
              <span class="ovr-val {ovrTone(ovrVal)}">{ovrVal}</span>
            </div>

            <!-- 레이더 차트 -->
            {#if radarVals.length > 0}
              <div class="radar-wrap">
                <svg viewBox="0 0 160 160" class="radar-svg">
                  {#each [0.33, 0.66, 1] as ratio}
                    <polygon points={gridPts(ratio)} fill="none" stroke="#1a2e4a" stroke-width="0.8"/>
                  {/each}
                  {#each radarAxes as ax, i}
                    <line x1={R_CX} y1={R_CY} x2={ax.x} y2={ax.y} stroke="#1a2e4a" stroke-width="0.8"/>
                    <text x={radarLPos[i].x} y={radarLPos[i].y}
                          text-anchor="middle" dominant-baseline="middle"
                          font-size="7.5" fill="#4a6a8a">{radarLabels[i]}</text>
                  {/each}
                  {#if radarSnap.some((v) => v != null)}
                    <polygon
                      points={radarPts(radarSnap)}
                      fill="rgba(74,138,244,0.07)"
                      stroke="rgba(74,138,244,0.30)"
                      stroke-width="1"
                      stroke-dasharray="3 2"
                    />
                  {/if}
                  <polygon
                    points={radarPts(radarVals)}
                    fill="rgba(74,138,244,0.18)"
                    stroke="#4a8af4"
                    stroke-width="1.6"
                  />
                </svg>
              </div>
            {/if}

            <!-- 구종 (투수) -->
            {#if isPitcher && (mp.pitches ?? []).length > 0}
              <div class="lsec">
                <h5 class="lsec-title">구종</h5>
                <div class="pitch-list">
                  {#each mp.pitches as pitch}
                    <div class="pitch-row">
                      <span class="pitch-name">{PITCH_NAMES[pitch.id] ?? pitch.id}</span>
                      <span class="pitch-stars grade-{pitch.grade}">{pitchStars(pitch.grade)}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- 포지션 숙련도 (타자) -->
            {#if isBatter && mp.positionRatings && Object.keys(mp.positionRatings).length > 0}
              <div class="lsec">
                <h5 class="lsec-title">포지션 숙련도</h5>
                <div class="pos-grid">
                  {#each Object.entries(mp.positionRatings) as [pos, rating]}
                    {#if rating != null}
                      <div class="pos-item">
                        <span class="pos-name">{POS_LABEL[pos] ?? pos}</span>
                        <span class="pos-val {statTone(rating)}">{rating}</span>
                      </div>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}

            <!-- 소속·계약 요약 -->
            {#if contractSummary}
              <div class="lsec">
                <h5 class="lsec-title">소속 · 계약</h5>
                <div class="contract-pill">
                  <span class="cp-team">{contractSummary.teamName}</span>
                  <span class="cp-range">({contractSummary.startYear}~{contractSummary.endYear})</span>
                  <span class="cp-yrsin">{contractSummary.yearsIn}년차</span>
                </div>
              </div>
            {/if}

            <!-- FA -->
            {#if faInfo}
              <div class="fa-pill {faInfo.eligible ? 'fa-ok' : 'fa-wait'}">
                {#if faInfo.eligible}FA 자격 보유 · {faInfo.years}년
                {:else}FA까지 {faInfo.yearsLeft}년 ({faInfo.years}/{faInfo.threshold}년){/if}
              </div>
            {/if}

            <!-- 병역 (NPC) -->
            {#if !isProtagonistModal && modalNpcSave}
              <div class="lsec">
                <h5 class="lsec-title">병역</h5>
                <div class="mil-row">
                  <span class="mil-badge {npcMilClass(modalNpcSave.militaryStatus)}">{npcMilText(modalNpcSave.militaryStatus)}</span>
                  {#if modalNpcSave.militaryStatus === "현역" && modalNpcSave.militaryDischargeYear}
                    <span class="mil-note">전역 예정 {modalNpcSave.militaryDischargeYear}년</span>
                  {/if}
                </div>
              </div>
            {/if}

          {:else if modalEntity.role === "coach" && mc}
            <div class="lsec">
              <h5 class="lsec-title">전문분야</h5>
              <div class="cp-team">{mc.specialty ?? "-"}</div>
            </div>
          {:else if modalEntity.role === "manager" && mm}
            <div class="lsec">
              <h5 class="lsec-title">감독 스타일</h5>
              <div class="cp-team">{mm.style ?? "-"}</div>
            </div>
          {/if}
        </aside>

        <!-- 우측 탭 패널 -->
        <div class="right-panel">
          <nav class="modal-tabs">
            <button class:mtab-active={modalTab === "stats"} on:click={() => (modalTab = "stats")}>능력치</button>
            <button class:mtab-active={modalTab === "record"} on:click={() => (modalTab = "record")}>
              {isPlayer ? "기록" : "경력"}
            </button>
            {#if isPlayer}
              <button class:mtab-active={modalTab === "history"} on:click={() => (modalTab = "history")}>연도별 성적</button>
            {/if}
          </nav>

          <div class="tab-content">

            <!-- ══ 능력치 탭 ══ -->
            {#if modalTab === "stats"}
              {#if isPlayer}
                {#if isProtagonistModal && (protagonist.tags?.length ?? 0) > 0}
                  <div class="tag-row">
                    {#each protagonist.tags as tag}<span class="tag-badge">{tag}</span>{/each}
                  </div>
                {/if}
                {#if modalEntity.notes}<p class="modal-notes">{formatNotes(modalEntity)}</p>{/if}

                {#if isPitcher}
                  <section class="msec">
                    <h4>투구 능력치</h4>
                    <div class="stat-grid g5">
                      {#each ([
                        ["OVR",      livePitching?.ovr         ?? mp.pitching?.ovr,         snapPitch?.ovr],
                        ["구위",     livePitching?.velocity     ?? mp.pitching?.velocity,     snapPitch?.velocity],
                        ["커맨드",   livePitching?.command      ?? mp.pitching?.command,      snapPitch?.command],
                        ["제구",     livePitching?.control      ?? mp.pitching?.control,      snapPitch?.control],
                        ["무브먼트", livePitching?.movement     ?? mp.pitching?.movement,     snapPitch?.movement],
                        ["멘탈",     livePitching?.mentality    ?? mp.pitching?.mentality,    snapPitch?.mentality],
                        ["스태미나", livePitching?.stamina      ?? mp.pitching?.stamina,      snapPitch?.stamina],
                        ["회복력",   livePitching?.recovery     ?? mp.pitching?.recovery,     snapPitch?.recovery],
                        ["위기집중", livePitching?.clutch       ?? mp.pitching?.clutch,       snapPitch?.clutch],
                        ["견제력",   livePitching?.holdRunners  ?? mp.pitching?.holdRunners,  snapPitch?.holdRunners],
                      ] as [string, number|undefined, number|undefined][]) as item}
                        {@const lbl = item[0]} {@const val = item[1]} {@const snap = item[2]}
                        {@const trend = typeof val === "number" ? statTrend(val, snap) : "none"}
                        <div class="sc">
                          <span class="sc-lbl">{lbl}</span>
                          <span class="sc-val {statTone(typeof val === 'number' ? val : 50)}">
                            {val ?? "-"}
                            {#if trend === "up"}<span class="tr-arr up">↑</span>
                            {:else if trend === "down"}<span class="tr-arr dn">↓</span>{/if}
                          </span>
                        </div>
                      {/each}
                    </div>
                  </section>
                {/if}

                {#if isBatter}
                  <section class="msec">
                    <h4>타격 능력치</h4>
                    <div class="stat-grid g4">
                      {#each ([
                        ["OVR",    liveBatting?.ovr           ?? mp.batting?.ovr,           snapBat?.ovr],
                        ["컨택",   liveBatting?.contact       ?? mp.batting?.contact,       snapBat?.contact],
                        ["장타력", liveBatting?.power         ?? mp.batting?.power,         snapBat?.power],
                        ["선구안", liveBatting?.eye           ?? mp.batting?.eye,           snapBat?.eye],
                        ["극기",   liveBatting?.discipline    ?? mp.batting?.discipline,    snapBat?.discipline],
                        ["클러치", liveBatting?.battingClutch ?? mp.batting?.battingClutch, snapBat?.battingClutch],
                        ["플래툰", liveBatting?.platoon       ?? mp.batting?.platoon,       snapBat?.platoon],
                        ["번트",   liveBatting?.bunting       ?? mp.batting?.bunting,       snapBat?.bunting],
                      ] as [string, number|undefined, number|undefined][]) as item}
                        {@const lbl = item[0]} {@const val = item[1]} {@const snap = item[2]}
                        {@const trend = typeof val === "number" ? statTrend(val, snap) : "none"}
                        <div class="sc">
                          <span class="sc-lbl">{lbl}</span>
                          <span class="sc-val {statTone(typeof val === 'number' ? val : 50)}">
                            {val ?? "-"}
                            {#if trend === "up"}<span class="tr-arr up">↑</span>
                            {:else if trend === "down"}<span class="tr-arr dn">↓</span>{/if}
                          </span>
                        </div>
                      {/each}
                    </div>
                  </section>
                  <section class="msec">
                    <h4>주루 · 수비</h4>
                    <div class="stat-grid g4">
                      {#each ([
                        ["주력",     liveBatting?.speed        ?? mp.batting?.speed,        snapBat?.speed],
                        ["주루판단", liveBatting?.baseInstinct ?? mp.batting?.baseInstinct, snapBat?.baseInstinct],
                        ["수비",     liveBatting?.fielding     ?? mp.batting?.fielding,     snapBat?.fielding],
                        ["어깨",     liveBatting?.arm          ?? mp.batting?.arm,          snapBat?.arm],
                      ] as [string, number|undefined, number|undefined][]) as item}
                        {@const lbl = item[0]} {@const val = item[1]} {@const snap = item[2]}
                        {@const trend = typeof val === "number" ? statTrend(val, snap) : "none"}
                        <div class="sc">
                          <span class="sc-lbl">{lbl}</span>
                          <span class="sc-val {statTone(typeof val === 'number' ? val : 50)}">
                            {val ?? "-"}
                            {#if trend === "up"}<span class="tr-arr up">↑</span>
                            {:else if trend === "down"}<span class="tr-arr dn">↓</span>{/if}
                          </span>
                        </div>
                      {/each}
                    </div>
                  </section>
                {/if}

              {:else if modalEntity.role === "coach" && mc}
                <section class="msec">
                  <h4>코치 능력치</h4>
                  <div class="stat-grid g4">
                    {#each [
                      ["전문", mc.specialty], ["지도력", mc.stats?.teaching],
                      ["분석", mc.stats?.analytics], ["경험레벨", mc.stats?.experience],
                    ] as [lbl, val]}
                      <div class="sc">
                        <span class="sc-lbl">{lbl}</span>
                        <span class="sc-val {typeof val === 'number' ? statTone(val) : 'mid'}">{val ?? "-"}</span>
                      </div>
                    {/each}
                  </div>
                </section>
              {:else if modalEntity.role === "manager" && mm}
                <section class="msec">
                  <h4>감독 능력치</h4>
                  <div class="stat-grid g4">
                    {#each [
                      ["동기부여", mm.stats?.motivation], ["선수육성", mm.stats?.development],
                      ["전술", mm.stats?.strategy], ["위기대처", mm.stats?.handlePressure],
                      ["선수기용", mm.stats?.handlePersonnel],
                    ] as [lbl, val]}
                      <div class="sc">
                        <span class="sc-lbl">{lbl}</span>
                        <span class="sc-val {typeof val === 'number' ? statTone(val) : 'mid'}">{val ?? "-"}</span>
                      </div>
                    {/each}
                  </div>
                </section>
              {:else}
                <p class="modal-pending">{formatNotes(modalEntity) || "정보 없음"}</p>
              {/if}

            <!-- ══ 기록 탭 ══ -->
            {:else if modalTab === "record"}
              {#if isPlayer}

                <section class="msec">
                  <h4>시즌 누적</h4>
                  {#if modalStats?.type === "pitcher"}
                    <div class="stat-grid g4">
                      {#each [
                        ["G", modalStats.g], ["GS", modalStats.gs], ["W", modalStats.w], ["L", modalStats.l],
                        ["SV", modalStats.sv ?? 0], ["HD", modalStats.hd ?? 0],
                        ["IP", modalStats.ip], ["ER", modalStats.er],
                        ["H", modalStats.h], ["K", modalStats.k], ["BB", modalStats.bb],
                        ["ERA", modalStats.era?.toFixed(2)], ["WHIP", modalStats.whip?.toFixed(2)],
                      ] as [lbl, val]}
                        <div class="sc"><span class="sc-lbl">{lbl}</span><span class="sc-val mid">{val ?? "-"}</span></div>
                      {/each}
                    </div>
                  {:else if modalStats?.type === "batter"}
                    <div class="stat-grid g4">
                      {#each [
                        ["G", modalStats.g], ["PA", modalStats.pa], ["AB", modalStats.ab], ["H", modalStats.h],
                        ["HR", modalStats.hr], ["RBI", modalStats.rbi], ["SB", modalStats.sb], ["BB", modalStats.bb],
                        ["K", modalStats.k], ["AVG", modalStats.avg?.toFixed(3)],
                        ["OBP", modalStats.obp?.toFixed(3)], ["SLG", modalStats.slg?.toFixed(3)],
                        ["OPS", modalStats.ops?.toFixed(3)],
                      ] as [lbl, val]}
                        <div class="sc"><span class="sc-lbl">{lbl}</span><span class="sc-val mid">{val ?? "-"}</span></div>
                      {/each}
                    </div>
                  {:else}
                    <p class="modal-pending">미집계</p>
                  {/if}
                </section>

                <section class="msec">
                  <h4>최근 5경기</h4>
                  {#if modalRecentGames.length === 0}
                    <p class="modal-pending">경기 없음</p>
                  {:else}
                    <table class="gtable">
                      <thead>
                        <tr>
                          <th>상대팀</th><th>결과</th>
                          {#if isPitcher}<th>IP</th><th>ER</th><th>K</th><th>BB</th>
                          {:else}<th>AB</th><th>H</th><th>AVG</th><th>HR</th><th>RBI</th>{/if}
                        </tr>
                      </thead>
                      <tbody>
                        {#each modalRecentGames as entry}
                          {@const line  = entry.result?.playerLines.find((l) => l.playerId === pid)}
                          {@const isHome = entry.homeTeamId === ptId}
                          {@const oppId  = isHome ? entry.awayTeamId : entry.homeTeamId}
                          {@const isDraw = entry.result?.loserId === null}
                          {@const won    = !isDraw && entry.result?.winnerId === ptId}
                          {@const outcome = isDraw ? "D" : won ? "W" : "L"}
                          <tr>
                            <td>{teamById.get(oppId) ?? oppId}</td>
                            <td class={outcomeClass(outcome)}><strong>{outcome}</strong></td>
                            {#if line?.role === "pitcher"}
                              <td>{line.ip}</td><td>{line.er}</td><td>{line.k}</td><td>{line.bb}</td>
                            {:else if line?.role === "batter"}
                              <td>{line.ab}</td><td>{line.h}</td>
                              <td>{line.ab > 0 ? (line.h / line.ab).toFixed(3) : "---"}</td>
                              <td>{line.hr}</td><td>{line.rbi}</td>
                            {:else}
                              <td colspan={isPitcher ? 4 : 5} class="modal-pending">기록 없음</td>
                            {/if}
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {/if}
                </section>

                {#if modalTeamRank}
                  <section class="msec">
                    <h4>리그 현황</h4>
                    <div class="rank-bar">
                      <span class="rank-num">{modalTeamRank.rank}위</span>
                      <span class="rank-rec">{modalTeamRank.wins}승 {modalTeamRank.losses}패{modalTeamRank.draws > 0 ? ` ${modalTeamRank.draws}무` : ""}</span>
                      <span class="rank-pct">승률 .{String(Math.round(modalTeamRank.winPct * 1000)).padStart(3, "0")}</span>
                    </div>
                  </section>
                {/if}

                <!-- 계약 -->
                <section class="msec">
                  <h4>계약</h4>
                  {#if isProtagonistModal}
                    {@const contract = protagonist.contract}
                    {#if contract}
                      <div class="ci-grid">
                        <div class="ci"><span>리그</span><strong>{LEAGUE_DISPLAY[contract.leagueId] ?? contract.leagueId}</strong></div>
                        <div class="ci"><span>기간</span><strong>{contract.durationYears}년 · {contract.remainingYears}년 잔여</strong></div>
                        <div class="ci"><span>연봉</span><strong>{formatSalary(contract.salary)}</strong></div>
                        {#if contract.signingBonus > 0}
                          <div class="ci"><span>사이닝보너스</span><strong>{formatSalary(contract.signingBonus)}</strong></div>
                        {/if}
                        <div class="ci"><span>노트레이드</span><strong>{contract.noTrade ? "있음" : "없음"}</strong></div>
                        {#if contract.teamOptionYears > 0 || contract.playerOptionYears > 0}
                          <div class="ci">
                            <span>옵션</span>
                            <strong>
                              {contract.teamOptionYears   > 0 ? `팀 ${contract.teamOptionYears}년`    : ""}
                              {contract.playerOptionYears > 0 ? `선수 ${contract.playerOptionYears}년` : ""}
                            </strong>
                          </div>
                        {/if}
                        {#if (contract.incentives ?? []).length > 0}
                          <div class="ci ci-full">
                            <span>인센티브</span>
                            <strong>{contract.incentives?.map((i) => `${i.condition} +${formatSalary(i.bonus)}`).join(" / ")}</strong>
                          </div>
                        {/if}
                      </div>
                    {:else}
                      <p class="modal-pending">계약 정보 없음</p>
                    {/if}
                  {:else}
                    {@const npcSalary   = modalNpcSave?.currentSalary ?? mp?.contract?.salary}
                    {@const npcDuration = modalNpcSave?.contractYears  ?? mp?.contract?.durationYears}
                    {@const npcService  = modalNpcSave?.proServiceYears ?? mp?.proServiceYears}
                    {#if npcSalary != null || npcDuration != null}
                      <div class="ci-grid">
                        {#if npcSalary != null}
                          <div class="ci"><span>연봉</span><strong>{formatSalary(npcSalary)}</strong></div>
                        {/if}
                        {#if npcDuration != null}
                          <div class="ci"><span>계약 기간</span><strong>{npcDuration}년</strong></div>
                        {/if}
                        {#if npcService != null}
                          <div class="ci"><span>프로 경력</span><strong>{npcService}년차</strong></div>
                        {/if}
                        {#if mp?.contract?.noTrade}
                          <div class="ci"><span>노트레이드</span><strong>있음</strong></div>
                        {/if}
                      </div>
                    {:else}
                      <p class="modal-pending">계약 정보 없음</p>
                    {/if}
                  {/if}
                </section>

                <!-- NPC 경력 이력 (계약과 별도로 항상 표시) -->
                {#if !isProtagonistModal && (modalNpcSave?.careerHistory?.length ?? 0) > 0}
                  <section class="msec">
                    <h4>경력 이력</h4>
                    <table class="gtable">
                      <thead><tr><th>연도</th><th>팀</th><th>기록</th><th>수상</th></tr></thead>
                      <tbody>
                        {#each [...(modalNpcSave?.careerHistory ?? [])].reverse() as entry}
                          <tr>
                            <td>{entry.year}</td>
                            <td>{teamById.get(entry.teamId) ?? entry.teamId}</td>
                            <td>{entry.statLine}</td>
                            <td class="hl-cell">{entry.highlights.length > 0 ? entry.highlights.join(", ") : "-"}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </section>
                {/if}

                <!-- 수상 -->
                {#if !isProtagonistModal && (modalNpcSave?.achievements?.length ?? 0) > 0}
                  <section class="msec">
                    <h4>수상</h4>
                    <div class="ach-list">
                      {#each modalNpcSave?.achievements ?? [] as ach}
                        <span class="ach-badge">{ach}</span>
                      {/each}
                    </div>
                  </section>
                {/if}

              {:else}
                {#if mc?.trainingBuffs}
                  <section class="msec">
                    <h4>훈련 버프</h4>
                    <p class="modal-buff">{mc.trainingBuffs}</p>
                  </section>
                {/if}
                <section class="msec">
                  <h4>경력</h4>
                  {#if (modalNpcSave?.careerHistory?.length ?? 0) > 0}
                    <table class="gtable">
                      <thead><tr><th>연도</th><th>팀</th><th>기록</th><th>수상</th></tr></thead>
                      <tbody>
                        {#each [...(modalNpcSave?.careerHistory ?? [])].reverse() as entry}
                          <tr>
                            <td>{entry.year}</td>
                            <td>{teamById.get(entry.teamId) ?? entry.teamId}</td>
                            <td>{entry.statLine}</td>
                            <td class="hl-cell">{entry.highlights.length > 0 ? entry.highlights.join(", ") : "-"}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {:else if modalEntity.notes}
                    <p class="modal-notes">{formatNotes(modalEntity)}</p>
                  {:else}
                    <p class="modal-pending">경력 정보 없음</p>
                  {/if}
                </section>
              {/if}

            <!-- ══ 연도별 성적 탭 ══ -->
            {:else if modalTab === "history" && isPlayer}
              <section class="msec">
                <h4>연도별 성적 (최근 5년)</h4>
                {#if historyEntries.length === 0}
                  <p class="modal-pending">시즌 기록 없음</p>
                {:else}
                  {@const isPType = historyEntries[0]?.stats?.type === "pitcher" || (!historyEntries[0]?.stats && isPitcher)}
                  <table class="gtable hist-table">
                    <thead>
                      <tr>
                        <th>연도</th><th>리그</th><th>팀</th>
                        {#if isPType}
                          <th>G</th><th>W</th><th>L</th><th>SV</th><th>IP</th><th>ERA</th><th>K</th><th>BB</th><th>WHIP</th>
                        {:else}
                          <th>G</th><th>AVG</th><th>HR</th><th>RBI</th><th>OPS</th><th>SB</th>
                        {/if}
                        {#if hasRank}<th>순위</th>{/if}
                      </tr>
                    </thead>
                    <tbody>
                      {#each historyEntries as entry}
                        {@const st = entry.stats}
                        <tr>
                          <td>{entry.year}</td>
                          <td class="lg-cell">{LEAGUE_DISPLAY[entry.leagueId] ?? entry.leagueId}</td>
                          <td>{teamById.get(entry.teamId) ?? entry.teamId}</td>
                          {#if st?.type === "pitcher"}
                            <td>{st.g}</td><td>{st.w}</td><td>{st.l}</td><td>{st.sv ?? 0}</td>
                            <td>{st.ip?.toFixed(1) ?? "-"}</td>
                            <td class="era-cell">{st.era?.toFixed(2) ?? "-"}</td>
                            <td>{st.k}</td><td>{st.bb}</td><td>{st.whip?.toFixed(2) ?? "-"}</td>
                          {:else if st?.type === "batter"}
                            <td>{st.g}</td>
                            <td class="avg-cell">{st.avg?.toFixed(3)?.replace(/^0/,"") ?? "-"}</td>
                            <td>{st.hr}</td><td>{st.rbi}</td>
                            <td>{st.ops?.toFixed(3)?.replace(/^0/,"") ?? "-"}</td>
                            <td>{st.sb}</td>
                          {:else}
                            <td colspan="9" class="stat-sum">{entry.statLine || "-"}</td>
                          {/if}
                          {#if hasRank}
                            <td class="rk-cell">
                              {#if entry.rank && entry.totalTeams}{entry.rank}/{entry.totalTeams}
                              {:else if entry.rank}{entry.rank}위
                              {:else}-{/if}
                            </td>
                          {/if}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                {/if}
              </section>
            {/if}

          </div><!-- tab-content -->
        </div><!-- right-panel -->
      </div><!-- modal-body -->
    </div><!-- modal-box -->
  </div><!-- modal-overlay -->
{/if}

<style>
  /* ── 오버레이 ── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.84);
    display: flex; align-items: center; justify-content: center;
    z-index: 220;
  }
  .modal-box {
    position: relative;
    background: #0c1625;
    border: 1px solid #1c2e4a;
    border-radius: 16px;
    width: 960px; max-width: 96vw;
    height: 90vh; max-height: 90vh;
    overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 24px 60px rgba(0,0,0,0.6);
  }
  .modal-close {
    position: absolute; top: 14px; right: 16px; z-index: 10;
    background: none; border: none; color: #3a5a80; font-size: 16px; cursor: pointer;
    transition: color 0.15s;
  }
  .modal-close:hover { color: #c0d8f8; }

  /* ── 헤더 ── */
  .modal-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 22px 28px 18px;
    border-bottom: 1px solid #172440;
    flex-shrink: 0;
    background: #0e1a2e;
  }
  .title-block { min-width: 0; }
  .name-row    { display: flex; align-items: baseline; gap: 10px; margin-bottom: 2px; }
  .jersey      { font-size: 14px; font-weight: 700; color: #4a8af4; letter-spacing: 0.5px; }
  .modal-name  { margin: 0; font-size: 22px; font-weight: 700; color: #e6f0ff; }
  .modal-birthday { margin: 2px 0 0; color: #3a5878; font-size: 11px; }
  .modal-meta     { margin: 4px 0 0; color: #7090b8; font-size: 13px; }
  .badge-row { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; flex-shrink: 0; }
  .badge { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px; }
  .badge-good   { background: #0b1f14; color: #4ed080; border: 1px solid #1a4a28; }
  .badge-mid    { background: #0c1c34; color: #90b8e8; border: 1px solid #1a3058; }
  .badge-low    { background: #271010; color: #f07070; border: 1px solid #482020; }
  .badge-injury { background: #271c06; color: #e8b030; border: 1px solid #483010; }

  /* ── 2컬럼 바디 ── */
  .modal-body {
    display: grid;
    grid-template-columns: 230px 1fr;
    overflow: hidden;
    flex: 1 1 0;
    min-height: 0;
  }

  /* ── 좌측 패널 ── */
  .left-panel {
    background: #090f1c;
    border-right: 1px solid #172440;
    padding: 16px 14px 20px;
    overflow-y: auto;
    display: flex; flex-direction: column; gap: 14px;
  }
  .left-panel::-webkit-scrollbar { width: 4px; }
  .left-panel::-webkit-scrollbar-track { background: transparent; }
  .left-panel::-webkit-scrollbar-thumb { background: #1c3050; border-radius: 2px; }

  /* OVR */
  .ovr-block { display: flex; flex-direction: column; align-items: center; padding: 10px 0 6px; }
  .ovr-label { font-size: 11px; color: #4a6a8a; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 2px; }
  .ovr-val   { font-size: 54px; font-weight: 800; line-height: 1; }
  .ovr-s { color: #f0c830; text-shadow: 0 0 20px rgba(240,200,48,0.4); }
  .ovr-a { color: #4ed080; text-shadow: 0 0 20px rgba(78,208,128,0.35); }
  .ovr-b { color: #4a8af4; text-shadow: 0 0 20px rgba(74,138,244,0.35); }
  .ovr-c { color: #7090b8; }

  /* 레이더 */
  .radar-wrap { display: flex; justify-content: center; padding: 4px 0; }
  .radar-svg  { width: 160px; height: 160px; }

  /* 좌측 섹션 */
  .lsec { display: flex; flex-direction: column; gap: 7px; }
  .lsec-title {
    margin: 0;
    font-size: 11px; font-weight: 700; letter-spacing: 1px;
    color: #4a6a8a; text-transform: uppercase;
    padding-bottom: 5px; border-bottom: 1px solid #162038;
  }

  /* 구종 */
  .pitch-list { display: flex; flex-direction: column; gap: 5px; }
  .pitch-row  { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
  .pitch-name { font-size: 13px; color: #b8d4f8; font-weight: 500; }
  .pitch-stars { font-size: 11px; letter-spacing: 1.5px; }
  .grade-5 { color: #f0c830; }
  .grade-4 { color: #4ed080; }
  .grade-3 { color: #4a8af4; }
  .grade-2 { color: #4a6888; }
  .grade-1 { color: #2a3e56; }

  /* 포지션 숙련도 */
  .pos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .pos-item {
    display: flex; justify-content: space-between; align-items: center;
    background: #0e1e34; border-radius: 6px; padding: 5px 8px;
  }
  .pos-name { font-size: 12px; color: #6a88a8; }
  .pos-val  { font-size: 14px; font-weight: 700; }

  /* 계약 요약 */
  .contract-pill {
    background: #0e1e34; border: 1px solid #182c48; border-radius: 8px;
    padding: 9px 12px; display: flex; flex-direction: column; gap: 3px;
  }
  .cp-team  { font-size: 14px; font-weight: 600; color: #c0deff; }
  .cp-range { font-size: 12px; color: #5a78a0; margin-top: 2px; }
  .cp-yrsin { font-size: 12px; color: #6a88b8; }

  /* FA */
  .fa-pill { font-size: 11px; font-weight: 600; padding: 7px 10px; border-radius: 8px; text-align: center; }
  .fa-ok   { background: #0b1f14; color: #4ed080; border: 1px solid #1a4a28; }
  .fa-wait { background: #0c1c30; color: #4a6888; border: 1px solid #162038; }

  /* 병역 */
  .mil-row   { display: flex; align-items: center; gap: 8px; }
  .mil-badge { font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 6px; }
  .mil-done    { background: #0b1f14; color: #4ed080; }
  .mil-exempt  { background: #0c1c30; color: #7090b8; }
  .mil-active  { background: #0a1c38; color: #58a8f8; }
  .mil-pending { background: #1c1c08; color: #c8a030; }
  .mil-note    { font-size: 11px; color: #4a6888; }

  /* ── 우측 패널 ── */
  .right-panel {
    display: flex; flex-direction: column;
    overflow: hidden; min-height: 0;
  }

  /* 탭 */
  .modal-tabs {
    display: flex; gap: 2px;
    padding: 14px 20px 0;
    border-bottom: 1px solid #172440;
    background: #0c1625;
    flex-shrink: 0;
  }
  .modal-tabs button {
    background: none; border: 1px solid transparent; border-bottom: none;
    border-radius: 8px 8px 0 0;
    color: #3a5878; font-size: 13px; padding: 7px 20px; cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .modal-tabs button:hover { color: #8ab0d8; }
  .modal-tabs button.mtab-active {
    background: #0c1625; border-color: #1c2e4a;
    color: #c8e0ff; font-weight: 600;
  }

  /* 탭 컨텐츠 */
  .tab-content {
    flex: 1 1 0; overflow-y: auto;
    padding: 18px 20px 28px;
    display: flex; flex-direction: column; gap: 20px;
  }
  .tab-content::-webkit-scrollbar { width: 4px; }
  .tab-content::-webkit-scrollbar-track { background: transparent; }
  .tab-content::-webkit-scrollbar-thumb { background: #1c3050; border-radius: 2px; }

  /* ── 공통 섹션 ── */
  .msec { display: flex; flex-direction: column; gap: 10px; }
  .msec h4 {
    margin: 0; font-size: 11.5px; font-weight: 700; letter-spacing: 0.8px;
    color: #5a78a0; text-transform: uppercase;
    padding-bottom: 7px; border-bottom: 1px solid #172440;
  }
  .modal-pending { margin: 0; color: #3a5878; font-size: 12px; }
  .modal-notes   { margin: 0; color: #5a7898; font-size: 12px; font-style: italic; }
  .modal-buff    { margin: 0; color: #4ed080; font-size: 12px; }

  .tag-row   { display: flex; gap: 5px; flex-wrap: wrap; }
  .tag-badge { font-size: 11px; padding: 3px 9px; border-radius: 10px; background: #101e3a; color: #6080c0; border: 1px solid #1a2e5a; }

  /* ── 능력치 카드 그리드 ── */
  .stat-grid    { display: grid; gap: 6px; }
  .g4 { grid-template-columns: repeat(4, minmax(0,1fr)); }
  .g5 { grid-template-columns: repeat(5, minmax(0,1fr)); }
  .sc {
    background: #0e1e34; border: 1px solid #172440; border-radius: 9px;
    padding: 10px 6px; display: flex; flex-direction: column; align-items: center; gap: 4px;
    transition: border-color 0.15s;
  }
  .sc:hover { border-color: #284870; }
  .sc-lbl { color: #5a78a0; font-size: 11.5px; }
  .sc-val { font-size: 22px; font-weight: 700; }
  .sc-val.good { color: #4ed080; }
  .sc-val.mid  { color: #b8d0f0; }
  .sc-val.low  { color: #f07070; }
  .tr-arr { font-size: 11px; font-weight: 700; margin-left: 2px; vertical-align: middle; }
  .tr-arr.up { color: #f06060; }
  .tr-arr.dn { color: #4a8af4; }

  /* ── 테이블 ── */
  .gtable { width: 100%; border-collapse: collapse; font-size: 12px; }
  .gtable th {
    color: #5a78a0; padding: 6px 8px; text-align: left;
    border-bottom: 1px solid #172440; font-weight: 600; font-size: 11px; letter-spacing: 0.5px;
  }
  .gtable td {
    color: #9ac0e8; padding: 8px 8px; border-bottom: 1px solid #0f1c30; font-size: 13px;
  }
  .gtable tr:last-child td { border-bottom: none; }
  .gtable tbody tr:hover td { background: #0e1e34; }

  .outcome-w { color: #4ed080; font-weight: 700; }
  .outcome-l { color: #f07070; font-weight: 700; }
  .outcome-d { color: #3a5878; }
  .hl-cell   { color: #e8c030; font-size: 11px; }

  .hist-table th, .hist-table td { text-align: center; }
  .hist-table td:nth-child(3) { text-align: left; }
  .era-cell  { color: #4ed080; font-weight: 600; }
  .avg-cell  { color: #4a8af4; font-weight: 600; }
  .rk-cell   { color: #3a5878; font-size: 11px; }
  .lg-cell   { font-size: 11px; color: #284060; }
  .stat-sum  { color: #4a6888; text-align: left; font-style: italic; }

  /* ── 리그 현황 ── */
  .rank-bar {
    display: flex; align-items: center; gap: 16px;
    background: #0e1e34; border: 1px solid #182c48; border-radius: 10px;
    padding: 12px 18px;
  }
  .rank-num { font-size: 28px; font-weight: 800; color: #4a8af4; line-height: 1; }
  .rank-rec { font-size: 13px; color: #90b0d8; }
  .rank-pct { font-size: 12px; color: #4a6888; margin-left: auto; }

  /* ── 계약 ── */
  .ci-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .ci {
    background: #0e1e34; border: 1px solid #182c48; border-radius: 8px;
    padding: 9px 12px; display: flex; flex-direction: column; gap: 3px;
  }
  .ci span   { font-size: 11px; color: #5a78a0; }
  .ci strong { font-size: 14px; color: #a0c8f0; font-weight: 600; }
  .ci-full   { grid-column: 1 / -1; }

  /* ── 수상 ── */
  .ach-list  { display: flex; flex-wrap: wrap; gap: 6px; }
  .ach-badge {
    font-size: 12px; padding: 4px 11px; border-radius: 8px;
    background: #1c1808; color: #e8c030; border: 1px solid #3a2e08;
  }
</style>
