<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";

  export let entityId: string = "";

  const dispatch = createEventDispatcher<{ close: void }>();
  function close() { dispatch("close"); }
  function handleOverlayClick(e: MouseEvent) { if (e.target === e.currentTarget) close(); }
  function handleKeydown(e: KeyboardEvent) { if (e.key === "Escape") close(); }

  type ModalTab = "stats" | "record";
  let modalTab: ModalTab = "stats";
  $: if (entityId) modalTab = "stats";

  function roleLabel(role: string): string {
    if (role === "coach") return "코치";
    if (role === "manager") return "감독";
    if (role === "owner") return "구단주";
    return "선수";
  }
  function conditionLabel(v: number): string { return v >= 70 ? "좋음" : v >= 40 ? "보통" : "주의"; }
  function conditionClass(v: number): string { return v >= 70 ? "good" : v >= 40 ? "mid" : "low"; }
  function fatigueLabel(v: number): string { return v >= 70 ? "높음" : v >= 40 ? "보통" : "낮음"; }
  function fatigueClass(v: number): string { return v >= 70 ? "low" : v >= 40 ? "mid" : "good"; }
  function formatSalary(salary: number): string {
    if (salary >= 10000) return `${(salary / 10000).toFixed(1)}억 원`;
    return `${salary.toLocaleString()}만 원`;
  }
  function outcomeClass(o: string): string {
    if (o === "W") return "outcome-w";
    if (o === "L") return "outcome-l";
    return "outcome-d";
  }
  function statTone(v: number): string {
    if (v >= 70) return "good";
    if (v >= 50) return "mid";
    return "low";
  }

  const PITCH_NAMES: Record<string, string> = {
    PITCH_FASTBALL: "패스트볼", PITCH_SINKER: "싱커", PITCH_CUTTER: "커터",
    PITCH_SLIDER: "슬라이더", PITCH_CURVE: "커브", PITCH_CHANGEUP: "체인지업",
    PITCH_SPLITTER: "스플리터", PITCH_FORKBALL: "포크볼",
    PITCH_SCREWBALL: "스크루볼", PITCH_KNUCKLEBALL: "너클볼",
  };
  const GRADE_LABEL: Record<number, string> = { 1: "습득중", 2: "기초", 3: "보통", 4: "능숙", 5: "마스터" };
  const LEAGUE_DISPLAY: Record<string, string> = {
    LEAGUE_HIGHSCHOOL: "고교 리그", LEAGUE_UNIVERSITY: "대학 리그",
    LEAGUE_KBL: "KBL", LEAGUE_ABL: "ABL", LEAGUE_JBL: "JBL", LEAGUE_IND: "독립 리그",
  };

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
      } as any,
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
            .map((ls) => (ls as any).stats?.[modalEntity!.id])
            .find(Boolean)
        ?? null)
    : null;

  $: teamById = new Map(($masterStore.teams ?? []).map((tm) => [tm.id, tm.name]));

  $: modalRecentGames = (() => {
    if (!entityId || !modalEntity) return [];
    if (isProtagonistModal) {
      return $seasonStore.schedule
        .filter((e) => e.result?.playerLines.some((l) => l.playerId === $gameStore.protagonist.id))
        .sort((a, b) => b.week - a.week)
        .slice(0, 5);
    }
    const teamId   = modalEntity.teamId ?? "";
    const leagueId = (modalEntity as any)?.leagueId ?? (modalEntity as any)?.originLeagueId ?? "";
    const entries = [
      ...($seasonStore.leagueSchedules[leagueId] ?? []),
      ...$seasonStore.schedule.filter((e) => e.leagueId === leagueId),
    ];
    const seen = new Set<string>();
    return entries
      .filter((e) => {
        if (!e.result || seen.has(e.id)) return false;
        seen.add(e.id);
        return e.homeTeamId === teamId || e.awayTeamId === teamId;
      })
      .sort((a, b) => b.week - a.week)
      .slice(0, 5);
  })();

  $: modalTeamRank = (() => {
    if (!modalEntity) return null;
    const teamId   = modalEntity.teamId;
    const leagueId = (modalEntity as any)?.leagueId ?? (modalEntity as any)?.originLeagueId ?? "";
    let standings = $seasonStore.standings;
    if (!standings.find((s) => s.teamId === teamId)) {
      const ls = ($seasonStore.leagueState ?? {})[leagueId];
      if (ls?.standings?.length) standings = ls.standings;
    }
    const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    const idx = sorted.findIndex((s) => s.teamId === teamId);
    if (idx < 0) return null;
    const s = sorted[idx];
    return { rank: idx + 1, wins: s.wins, losses: s.losses, draws: s.draws, winPct: s.winPct };
  })();

  $: modalNpcSave = modalEntity && !isProtagonistModal
    ? (($gameStore.npcs ?? []).find((n) => n.npcId === modalEntity!.id) ?? null)
    : null;

  $: faInfo = isProtagonistModal
    ? (() => {
        const p = $gameStore.protagonist;
        if (p.careerStage !== "pro_kbl" && p.careerStage !== "pro_abl") return null;
        const years = p.proServiceYears ?? 0;
        return { eligible: years >= 9, years, yearsLeft: Math.max(0, 9 - years) };
      })()
    : null;
</script>

<svelte:window on:keydown={handleKeydown} />

{#if modalEntity}
  {@const mp = (modalEntity.details as any)?.player}
  {@const mc = (modalEntity.details as any)?.coach}
  {@const mm = (modalEntity.details as any)?.manager}
  {@const isPlayer = modalEntity.role === "player" && !!mp}
  {@const isPitcher = isPlayer && (mp.playerType === "pitcher" || mp.playerType === "twoWay")}
  {@const isBatter  = isPlayer && (mp.playerType === "batter"  || mp.playerType === "twoWay")}
  {@const protagonist = $gameStore.protagonist}

  <div class="modal-overlay" on:click={handleOverlayClick} role="dialog" aria-modal="true">
    <div class="modal-box">
      <button class="modal-close" on:click={close}>✕</button>

      <header class="modal-header">
        <div class="modal-title-block">
          <h3 class="modal-name">{modalEntity.name}</h3>
          <p class="modal-meta">
            {roleLabel(modalEntity.role)} · {modalEntity.age}세
            {#if mp?.position} · {mp.position}{/if}
            {#if mp?.handedness} · {mp.handedness}투{/if}
          </p>
        </div>
        <div class="status-badges">
          {#if isPlayer}
            {#if isProtagonistModal}
              <span class="badge badge-{conditionClass(protagonist.condition)}">컨디션 {conditionLabel(protagonist.condition)}</span>
              <span class="badge badge-{fatigueClass(protagonist.fatigue)}">피로 {fatigueLabel(protagonist.fatigue)}</span>
              {#if protagonist.injury}
                <span class="badge badge-injury">부상 · {protagonist.injury.recoveryWeeksLeft}주</span>
              {/if}
            {:else}
              <span class="badge badge-mid">{modalEntity.status ?? "활성"}</span>
            {/if}
          {/if}
        </div>
      </header>

      <nav class="modal-tabs">
        <button class:mtab-active={modalTab === "stats"} on:click={() => (modalTab = "stats")}>능력치</button>
        <button class:mtab-active={modalTab === "record"} on:click={() => (modalTab = "record")}>
          {isPlayer ? "기록" : "경력"}
        </button>
      </nav>

      {#if modalTab === "stats"}
        {#if isPlayer}
          {#if isProtagonistModal && (protagonist.tags?.length ?? 0) > 0}
            <div class="tag-row">
              {#each protagonist.tags as tag}<span class="tag-badge">{tag}</span>{/each}
            </div>
          {/if}
          {#if modalEntity.notes}<p class="modal-notes">{modalEntity.notes}</p>{/if}

          {#if isPitcher}
            <section class="modal-section">
              <h4>투구 능력치</h4>
              <div class="modal-stat-grid cols-5">
                {#each [
                  ["OVR", mp.pitching?.ovr], ["구위", mp.pitching?.velocity],
                  ["커맨드", mp.pitching?.command], ["제구", mp.pitching?.control],
                  ["무브먼트", mp.pitching?.movement], ["멘탈", mp.pitching?.mentality],
                  ["스태미나", mp.pitching?.stamina], ["회복력", mp.pitching?.recovery],
                  ["위기집중", mp.pitching?.clutch], ["견제력", mp.pitching?.holdRunners],
                ] as [lbl, val]}
                  <div class="modal-stat-item">
                    <span class="ms-label">{lbl}</span>
                    <span class="ms-value {statTone(typeof val === 'number' ? val : 50)}">{val ?? "-"}</span>
                  </div>
                {/each}
              </div>
            </section>
          {/if}

          {#if isBatter}
            <section class="modal-section">
              <h4>타격 능력치</h4>
              <div class="modal-stat-grid cols-4">
                {#each [
                  ["OVR", mp.batting?.ovr], ["컨택", mp.batting?.contact],
                  ["장타력", mp.batting?.power], ["선구안", mp.batting?.eye],
                  ["극기", mp.batting?.discipline], ["클러치", mp.batting?.battingClutch],
                  ["플래툰", mp.batting?.platoon], ["번트", mp.batting?.bunting],
                ] as [lbl, val]}
                  <div class="modal-stat-item">
                    <span class="ms-label">{lbl}</span>
                    <span class="ms-value {statTone(typeof val === 'number' ? val : 50)}">{val ?? "-"}</span>
                  </div>
                {/each}
              </div>
            </section>
            <section class="modal-section">
              <h4>주루·수비</h4>
              <div class="modal-stat-grid cols-4">
                {#each [
                  ["주력", mp.batting?.speed], ["주루판단", mp.batting?.baseInstinct],
                  ["수비", mp.batting?.fielding], ["어깨", mp.batting?.arm],
                ] as [lbl, val]}
                  <div class="modal-stat-item">
                    <span class="ms-label">{lbl}</span>
                    <span class="ms-value {statTone(typeof val === 'number' ? val : 50)}">{val ?? "-"}</span>
                  </div>
                {/each}
              </div>
            </section>
          {/if}

          {#if isPitcher && (mp.pitches ?? []).length > 0}
            <section class="modal-section">
              <h4>보유 구종</h4>
              <div class="pitch-badge-list">
                {#each mp.pitches as pitch}
                  <span class="pitch-badge grade-{pitch.grade}">
                    {PITCH_NAMES[pitch.id] ?? pitch.id}
                    <span class="badge-grade">{GRADE_LABEL[pitch.grade] ?? pitch.grade}</span>
                  </span>
                {/each}
              </div>
            </section>
          {/if}

        {:else if modalEntity.role === "coach" && mc}
          <section class="modal-section">
            <h4>코치 능력치</h4>
            <div class="modal-stat-grid cols-4">
              {#each [
                ["전문", mc.specialty], ["지도력", mc.stats?.teaching],
                ["분석", mc.stats?.analytics], ["경험레벨", mc.stats?.experience],
              ] as [lbl, val]}
                <div class="modal-stat-item">
                  <span class="ms-label">{lbl}</span>
                  <span class="ms-value {typeof val === 'number' ? statTone(val) : 'mid'}">{val ?? "-"}</span>
                </div>
              {/each}
            </div>
          </section>

        {:else if modalEntity.role === "manager" && mm}
          <section class="modal-section">
            <h4>감독 능력치</h4>
            <div class="modal-stat-grid cols-4">
              {#each [
                ["동기부여", mm.stats?.motivation], ["선수육성", mm.stats?.development],
                ["전술", mm.stats?.strategy], ["위기대처", mm.stats?.handlePressure],
                ["선수기용", mm.stats?.handlePersonnel],
              ] as [lbl, val]}
                <div class="modal-stat-item">
                  <span class="ms-label">{lbl}</span>
                  <span class="ms-value {typeof val === 'number' ? statTone(val) : 'mid'}">{val ?? "-"}</span>
                </div>
              {/each}
            </div>
          </section>

        {:else}
          <section class="modal-section">
            <p class="modal-pending">{modalEntity.notes || "정보 없음"}</p>
          </section>
        {/if}

      {:else if modalTab === "record"}
        {#if isPlayer}
          <section class="modal-section">
            <h4>시즌 누적</h4>
            {#if modalStats?.type === "pitcher"}
              <div class="modal-stat-grid cols-4">
                {#each [
                  ["G", modalStats.g], ["GS", modalStats.gs], ["W", modalStats.w], ["L", modalStats.l],
                  ["SV", modalStats.sv ?? 0], ["HD", modalStats.hd ?? 0],
                  ["IP", modalStats.ip], ["ER", modalStats.er], ["H", modalStats.h], ["K", modalStats.k],
                  ["BB", modalStats.bb], ["ERA", modalStats.era?.toFixed(2)], ["WHIP", modalStats.whip?.toFixed(2)],
                ] as [lbl, val]}
                  <div class="modal-stat-item">
                    <span class="ms-label">{lbl}</span>
                    <span class="ms-value mid">{val ?? "-"}</span>
                  </div>
                {/each}
              </div>
            {:else if modalStats?.type === "batter"}
              <div class="modal-stat-grid cols-4">
                {#each [
                  ["G", modalStats.g], ["PA", modalStats.pa], ["AB", modalStats.ab], ["H", modalStats.h],
                  ["HR", modalStats.hr], ["RBI", modalStats.rbi], ["SB", modalStats.sb], ["BB", modalStats.bb],
                  ["K", modalStats.k], ["AVG", modalStats.avg?.toFixed(3)],
                  ["OBP", modalStats.obp?.toFixed(3)], ["SLG", modalStats.slg?.toFixed(3)],
                  ["OPS", modalStats.ops?.toFixed(3)],
                ] as [lbl, val]}
                  <div class="modal-stat-item">
                    <span class="ms-label">{lbl}</span>
                    <span class="ms-value mid">{val ?? "-"}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="modal-pending">미집계</p>
            {/if}
          </section>

          <section class="modal-section">
            <h4>최근 5경기</h4>
            {#if modalRecentGames.length === 0}
              <p class="modal-pending">경기 없음</p>
            {:else if isProtagonistModal}
              <table class="game-table">
                <thead>
                  <tr>
                    <th>상대팀</th><th>결과</th>
                    {#if isPitcher}<th>IP</th><th>ER</th><th>K</th><th>BB</th>
                    {:else}<th>AB</th><th>H</th><th>AVG</th><th>HR</th><th>RBI</th>{/if}
                  </tr>
                </thead>
                <tbody>
                  {#each modalRecentGames as entry}
                    {@const line = entry.result?.playerLines.find((l) => l.playerId === protagonist.id)}
                    {@const isHome = entry.homeTeamId === protagonist.teamId}
                    {@const oppId = isHome ? entry.awayTeamId : entry.homeTeamId}
                    {@const isDraw = entry.result?.loserId === null}
                    {@const won = !isDraw && entry.result?.winnerId === protagonist.teamId}
                    {@const outcome = isDraw ? "D" : won ? "W" : "L"}
                    <tr>
                      <td>{teamById.get(oppId) ?? oppId}</td>
                      <td class={outcomeClass(outcome)}><strong>{outcome}</strong></td>
                      {#if line?.role === "pitcher"}
                        <td>{line.ip}</td><td>{line.er}</td><td>{line.k}</td><td>{line.bb}</td>
                      {:else if line?.role === "batter"}
                        <td>{line.ab}</td><td>{line.h}</td>
                        <td>{line.ab > 0 ? (line.h / line.ab).toFixed(2) : "---"}</td>
                        <td>{line.hr}</td><td>{line.rbi}</td>
                      {:else}
                        <td colspan={isPitcher ? 4 : 5} class="modal-pending">기록 없음</td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <table class="game-table">
                <thead>
                  <tr>
                    <th>상대팀</th><th>결과</th>
                    {#if isPitcher}<th>IP</th><th>ER</th><th>K</th><th>BB</th>
                    {:else}<th>AB</th><th>H</th><th>AVG</th><th>HR</th><th>RBI</th>{/if}
                  </tr>
                </thead>
                <tbody>
                  {#each modalRecentGames as entry}
                    {@const line = entry.result?.playerLines.find((l) => l.playerId === entityId)}
                    {@const isHome = entry.homeTeamId === (modalEntity?.teamId ?? "")}
                    {@const oppId  = isHome ? entry.awayTeamId : entry.homeTeamId}
                    {@const isDraw = entry.result?.loserId === null}
                    {@const won = !isDraw && entry.result?.winnerId === (modalEntity?.teamId ?? "")}
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
            <section class="modal-section">
              <h4>리그 현황</h4>
              <div class="rank-bar">
                <span class="rank-num">{modalTeamRank.rank}위</span>
                <span class="rank-record">
                  {modalTeamRank.wins}승 {modalTeamRank.losses}패{modalTeamRank.draws > 0 ? ` ${modalTeamRank.draws}무` : ""}
                </span>
                <span class="rank-pct">승률 .{String(Math.round(modalTeamRank.winPct * 1000)).padStart(3, "0")}</span>
              </div>
            </section>
          {/if}

          <section class="modal-section">
            <h4>계약 · 경력</h4>
            {#if isProtagonistModal}
              {@const contract = protagonist.contract}
              {#if contract}
                <div class="contract-grid">
                  <div class="contract-item"><span>리그</span><strong>{LEAGUE_DISPLAY[contract.leagueId] ?? contract.leagueId}</strong></div>
                  <div class="contract-item"><span>계약 기간</span><strong>{contract.durationYears}년 중 {contract.remainingYears}년 잔여</strong></div>
                  <div class="contract-item"><span>연봉</span><strong>{formatSalary(contract.salary)}</strong></div>
                  {#if contract.signingBonus > 0}
                    <div class="contract-item"><span>사이닝보너스</span><strong>{formatSalary(contract.signingBonus)}</strong></div>
                  {/if}
                  <div class="contract-item"><span>노트레이드</span><strong>{contract.noTrade ? "있음" : "없음"}</strong></div>
                  {#if contract.teamOptionYears > 0 || contract.playerOptionYears > 0}
                    <div class="contract-item">
                      <span>옵션</span>
                      <strong>
                        {contract.teamOptionYears > 0 ? `팀 ${contract.teamOptionYears}년` : ""}
                        {contract.playerOptionYears > 0 ? `선수 ${contract.playerOptionYears}년` : ""}
                      </strong>
                    </div>
                  {/if}
                  {#if (contract.incentives ?? []).length > 0}
                    <div class="contract-item contract-full">
                      <span>인센티브</span>
                      <strong>{contract.incentives?.map((i) => `${i.condition} +${formatSalary(i.bonus)}`).join(" / ")}</strong>
                    </div>
                  {/if}
                </div>
              {:else}
                <p class="modal-pending">계약 정보 없음</p>
              {/if}
              {#if faInfo}
                <div class="fa-bar {faInfo.eligible ? 'fa-ok' : 'fa-wait'}">
                  {#if faInfo.eligible}FA 자격 보유 · 프로 {faInfo.years}년
                  {:else}FA까지 {faInfo.yearsLeft}년 남음 (프로 {faInfo.years}년 / 9년 기준){/if}
                </div>
              {/if}
            {:else}
              {#if (modalNpcSave?.careerHistory?.length ?? 0) > 0}
                <table class="career-table">
                  <thead><tr><th>연도</th><th>팀</th><th>기록</th><th>수상</th></tr></thead>
                  <tbody>
                    {#each [...(modalNpcSave?.careerHistory ?? [])].reverse() as entry}
                      <tr>
                        <td>{entry.year}</td>
                        <td>{teamById.get(entry.teamId) ?? entry.teamId}</td>
                        <td>{entry.statLine}</td>
                        <td class="highlight-cell">{entry.highlights.length > 0 ? entry.highlights.join(", ") : "-"}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <p class="modal-pending">경력 정보 없음</p>
              {/if}
            {/if}
          </section>

        {:else}
          {#if mc?.trainingBuffs}
            <section class="modal-section">
              <h4>훈련 버프</h4>
              <p class="modal-buff">{mc.trainingBuffs}</p>
            </section>
          {/if}
          <section class="modal-section">
            <h4>경력</h4>
            {#if (modalNpcSave?.careerHistory?.length ?? 0) > 0}
              <table class="career-table">
                <thead><tr><th>연도</th><th>팀</th><th>기록</th><th>수상</th></tr></thead>
                <tbody>
                  {#each [...(modalNpcSave?.careerHistory ?? [])].reverse() as entry}
                    <tr>
                      <td>{entry.year}</td>
                      <td>{teamById.get(entry.teamId) ?? entry.teamId}</td>
                      <td>{entry.statLine}</td>
                      <td class="highlight-cell">{entry.highlights.length > 0 ? entry.highlights.join(", ") : "-"}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else if modalEntity.notes}
              <p class="modal-notes">{modalEntity.notes}</p>
            {:else}
              <p class="modal-pending">경력 정보 없음</p>
            {/if}
          </section>
        {/if}
      {/if}

    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center;
    z-index: 220;
  }
  .modal-box {
    position: relative;
    background: #111d34; border: 1px solid #3a5a96; border-radius: 14px;
    padding: 22px 26px 26px;
    width: 720px; max-width: 94vw; max-height: 88vh;
    overflow-y: auto;
    display: grid; align-content: start; gap: 12px;
  }
  .modal-close {
    position: absolute; top: 12px; right: 14px;
    background: none; border: none; color: #7a9ac8; font-size: 16px; cursor: pointer;
  }
  .modal-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .modal-title-block { min-width: 0; }
  .modal-name { margin: 0; font-size: 20px; font-weight: 700; color: #f1f6ff; }
  .modal-meta { margin: 4px 0 0; color: #aebddd; font-size: 13px; }
  .modal-notes { margin: 0; color: #8ca8cc; font-size: 12px; font-style: italic; }
  .status-badges { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; flex-shrink: 0; }
  .badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 12px; white-space: nowrap; }
  .badge-good   { background: #152a18; color: #68de92; border: 1px solid #2a5a30; }
  .badge-mid    { background: #192338; color: #c8daf8; border: 1px solid #2a4060; }
  .badge-low    { background: #2e1818; color: #ff9090; border: 1px solid #5a2828; }
  .badge-injury { background: #2e1f08; color: #ffc040; border: 1px solid #5a3a10; }
  .modal-tabs { display: flex; gap: 4px; border-bottom: 1px solid #253451; padding-bottom: 8px; }
  .modal-tabs button {
    background: none; border: 1px solid transparent;
    border-radius: 7px; color: #7a9ac8;
    font-size: 13px; padding: 5px 18px; cursor: pointer;
  }
  .modal-tabs button.mtab-active { background: #1d3760; border-color: #3a5a96; color: #d8e8ff; font-weight: 600; }
  .modal-section { display: grid; gap: 8px; }
  .modal-section h4 { margin: 0; color: #dbe8ff; font-size: 13px; border-bottom: 1px solid #253451; padding-bottom: 4px; }
  .modal-pending { margin: 0; color: #9db2d8; font-size: 12px; }
  .modal-buff { margin: 0; color: #8acf9a; font-size: 12px; }
  .modal-stat-grid { display: grid; gap: 6px; grid-template-columns: repeat(4, minmax(0,1fr)); }
  .modal-stat-grid.cols-5 { grid-template-columns: repeat(5, minmax(0,1fr)); }
  .modal-stat-item {
    border: 1px solid #2e486f; border-radius: 8px; background: #152b4f;
    padding: 8px 6px; display: flex; flex-direction: column; align-items: center; gap: 3px;
  }
  .ms-label { color: #9eb6de; font-size: 10px; }
  .ms-value { font-size: 16px; font-weight: 700; }
  .ms-value.good { color: #68de92; }
  .ms-value.mid  { color: #d8e8ff; }
  .ms-value.low  { color: #ffb58a; }
  .tag-row { display: flex; gap: 5px; flex-wrap: wrap; }
  .tag-badge { font-size: 11px; padding: 3px 9px; border-radius: 10px; background: #1f2f60; color: #90b8f8; border: 1px solid #2a4a8a; }
  .pitch-badge-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .pitch-badge {
    display: inline-flex; align-items: center; gap: 5px;
    background: #152b4f; border: 1px solid #2e486f;
    border-radius: 6px; padding: 4px 9px; font-size: 12px; font-weight: 600; color: #d5e2fd;
  }
  .badge-grade { font-size: 10px; color: #7a9ac8; font-weight: 400; }
  .pitch-badge.grade-5 { border-color: #c8a030; background: #2a1e06; color: #f0c860; }
  .pitch-badge.grade-5 .badge-grade { color: #c8a030; }
  .pitch-badge.grade-4 { border-color: #3a7ad8; background: #0e2040; color: #88b8f8; }
  .pitch-badge.grade-4 .badge-grade { color: #5a8fd8; }
  .pitch-badge.grade-1 { border-color: #3a4060; background: #10142a; color: #6878a8; }
  .pitch-badge.grade-1 .badge-grade { color: #485878; }
  .game-table, .career-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .game-table th, .career-table th { color: #9fb4d8; padding: 5px 8px; text-align: left; border-bottom: 1px solid #253451; font-weight: 500; }
  .game-table td, .career-table td { color: #d8e8ff; padding: 6px 8px; border-bottom: 1px solid #1a2e4a; }
  .game-table tr:last-child td, .career-table tr:last-child td { border-bottom: none; }
  .outcome-w { color: #68de92; }
  .outcome-l { color: #ff9090; }
  .outcome-d { color: #888; }
  .highlight-cell { color: #ffc040; font-size: 11px; }
  .rank-bar { display: flex; align-items: center; gap: 14px; background: #162a4a; border: 1px solid #2e486f; border-radius: 10px; padding: 10px 16px; }
  .rank-num  { font-size: 22px; font-weight: 700; color: #79abf6; }
  .rank-record { font-size: 13px; color: #d8e8ff; }
  .rank-pct  { font-size: 12px; color: #9fb4d8; margin-left: auto; }
  .contract-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .contract-item { background: #152b4f; border: 1px solid #2e486f; border-radius: 8px; padding: 8px 12px; display: flex; flex-direction: column; gap: 3px; }
  .contract-item span { font-size: 10px; color: #9eb6de; }
  .contract-item strong { font-size: 13px; color: #d8e8ff; }
  .contract-full { grid-column: 1 / -1; }
  .fa-bar { margin-top: 4px; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; }
  .fa-ok   { background: #152a18; color: #68de92; border: 1px solid #2a5a30; }
  .fa-wait { background: #131f34; color: #9fb4d8; border: 1px solid #253451; }
</style>
