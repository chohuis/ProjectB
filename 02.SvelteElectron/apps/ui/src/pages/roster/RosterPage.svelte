<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore } from "../../shared/stores/master";
  import { seasonStore } from "../../shared/stores/season";

  type RosterTab = "all" | "pitcher" | "batter" | "staff";
  type RoleTab = "player" | "coach" | "manager" | "owner";
  type ModalTab = "stats" | "record";

  export let filterTeamId: string = "";

  let tab: RosterTab = "all";
  let keyword = "";
  let selectedId = "";
  let modalEntityId = "";
  let modalTab: ModalTab = "stats";

  function toLeagueId(stage: string): string {
    if (stage === "highschool") return "LEAGUE_HIGHSCHOOL";
    if (stage === "university") return "LEAGUE_UNIVERSITY";
    if (stage === "pro_kbl") return "LEAGUE_KBL";
    if (stage === "pro_abl") return "LEAGUE_ABL";
    return "LEAGUE_HIGHSCHOOL";
  }

  function isPitcherPosition(position: string): boolean {
    return position === "SP" || position === "RP" || position === "CP";
  }

  function roleLabel(role: RoleTab): string {
    if (role === "coach") return "코치";
    if (role === "manager") return "감독";
    if (role === "owner") return "구단주";
    return "선수";
  }

  function conditionLabel(v: number): string {
    return v >= 70 ? "좋음" : v >= 40 ? "보통" : "주의";
  }
  function conditionClass(v: number): string {
    return v >= 70 ? "good" : v >= 40 ? "mid" : "low";
  }
  function fatigueLabel(v: number): string {
    return v >= 70 ? "높음" : v >= 40 ? "보통" : "낮음";
  }
  function fatigueClass(v: number): string {
    return v >= 70 ? "low" : v >= 40 ? "mid" : "good";
  }

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

  async function loadLeagueEntities() {
    const leagueId = toLeagueId($gameStore.protagonist.careerStage);
    await masterStore.loadEntities(leagueId);
  }

  onMount(async () => {
    await loadLeagueEntities();
  });

  $: currentLeagueId = toLeagueId($gameStore.protagonist.careerStage);
  $: if (currentLeagueId) loadLeagueEntities();

  $: myTeamId = $gameStore.protagonist.teamId;
  $: activeTeamId = filterTeamId || myTeamId;

  $: protagonistRow = (() => {
    const p = $gameStore.protagonist;
    return {
      id: p.id,
      name: p.name,
      nameEn: p.nameEn,
      role: "player" as const,
      age: p.age,
      status: "active" as const,
      originLeagueId: p.leagueId,
      leagueId: p.leagueId,
      clubId: "",
      teamId: p.teamId,
      schoolId: p.schoolId ?? "",
      grade: p.grade,
      notes: "",
      details: {
        player: {
          playerType: p.playerType,
          handedness: p.handedness,
          position: p.position,
          jerseyNumber: p.jerseyNumber,
          pitching: p.pitching,
          batting: p.batting,
          positionRatings: p.positionRatings,
          primaryPosition: p.primaryPosition,
          diligence: p.diligence,
          popularity: p.popularity,
          developmentRate: p.developmentRate,
          potentialHidden: p.potentialHidden,
        },
      } as any,
    };
  })();

  $: teamRows = [
    ...(protagonistRow.teamId === activeTeamId ? [protagonistRow] : []),
    ...$masterStore.entities.filter((e) => e.teamId === activeTeamId),
  ];
  $: modalEntity = modalEntityId
    ? (modalEntityId === $gameStore.protagonist.id
        ? protagonistRow
        : $masterStore.entities.find((e) => e.id === modalEntityId) ?? null)
    : null;
  $: normalized = keyword.trim().toLowerCase();
  $: searchedRows = teamRows.filter((e) => e.name.toLowerCase().includes(normalized));

  $: filteredRows = searchedRows.filter((e) => {
    if (tab === "all") return true;
    if (tab === "staff") return e.role !== "player";
    if (tab === "pitcher") return e.role === "player" && isPitcherPosition(String((e.details as any)?.player?.position ?? ""));
    if (tab === "batter") return e.role === "player" && !isPitcherPosition(String((e.details as any)?.player?.position ?? ""));
    return true;
  });

  const ROLE_ORDER: Record<string, number> = { owner: 0, manager: 1, coach: 2, player: 3 };

  $: sortedRows = [...filteredRows].sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
    if (roleDiff !== 0) return roleDiff;
    return a.name.localeCompare(b.name, "ko");
  });
  $: if (sortedRows.length > 0 && !sortedRows.some((x) => x.id === selectedId)) selectedId = sortedRows[0].id;
  $: selected = sortedRows.find((x) => x.id === selectedId) ?? null;

  $: selectedStats = selected
    ? ($seasonStore.stats[selected.id]
        ?? Object.values($seasonStore.leagueState ?? {}).map((ls) => ls.stats?.[selected!.id]).find(Boolean)
        ?? null)
    : null;
  $: modalStats = modalEntity
    ? ($seasonStore.stats[modalEntity.id]
        ?? Object.values($seasonStore.leagueState ?? {})
            .map((ls) => (ls as any).stats?.[modalEntity!.id])
            .find(Boolean)
        ?? null)
    : null;

  // 모달 열릴 때 탭 초기화
  $: if (modalEntityId) modalTab = "stats";

  // 팀명 맵
  $: teamById = new Map(($masterStore.teams ?? []).map((tm) => [tm.id, tm.name]));

  // 주인공 여부
  $: isProtagonistModal = !!modalEntityId && modalEntityId === $gameStore.protagonist.id;

  // 최근 5경기
  $: modalRecentGames = (() => {
    if (!modalEntityId) return [];
    if (isProtagonistModal) {
      return $seasonStore.schedule
        .filter((e) => e.result?.playerLines.some((l) => l.playerId === $gameStore.protagonist.id))
        .sort((a, b) => b.week - a.week)
        .slice(0, 5);
    }
    const teamId   = modalEntity?.teamId ?? "";
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

  // 리그 순위
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

  // NPC 저장 데이터
  $: modalNpcSave = modalEntity && !isProtagonistModal
    ? (($gameStore.npcs ?? []).find((n) => n.npcId === modalEntity!.id) ?? null)
    : null;

  // FA 자격
  $: faInfo = isProtagonistModal
    ? (() => {
        const p = $gameStore.protagonist;
        if (p.careerStage !== "pro_kbl" && p.careerStage !== "pro_abl") return null;
        const years = p.proServiceYears ?? 0;
        return { eligible: years >= 9, years, yearsLeft: Math.max(0, 9 - years) };
      })()
    : null;

  const PITCH_NAMES: Record<string, string> = {
    PITCH_FASTBALL: "패스트볼", PITCH_SINKER: "싱커", PITCH_CUTTER: "커터",
    PITCH_SLIDER: "슬라이더", PITCH_CURVE: "커브", PITCH_CHANGEUP: "체인지업",
    PITCH_SPLITTER: "스플리터", PITCH_FORKBALL: "포크볼",
    PITCH_SCREWBALL: "스크루볼", PITCH_KNUCKLEBALL: "너클볼",
  };

  const GRADE_LABEL: Record<number, string> = {
    1: "습득중", 2: "기초", 3: "보통", 4: "능숙", 5: "마스터",
  };

  const LEAGUE_DISPLAY: Record<string, string> = {
    LEAGUE_HIGHSCHOOL: "고교 리그",
    LEAGUE_UNIVERSITY: "대학 리그", LEAGUE_KBL: "KBL",
    LEAGUE_ABL: "ABL", LEAGUE_JBL: "JBL", LEAGUE_IND: "독립 리그",
  };

  const SEV_BADGE: Record<string, string> = {
    light: "경상", moderate: "부상", severe: "중상", surgery: "수술",
  };

  $: npcInjuries = $seasonStore.npcInjuries ?? {};

  function getRowInjury(rowId: string): { severity: string; weeksLeft: number; playingThrough: boolean } | null {
    if (rowId === $gameStore.protagonist.id) {
      const inj = $gameStore.protagonist.injury;
      if (!inj) return null;
      return { severity: inj.severity, weeksLeft: inj.recoveryWeeksLeft, playingThrough: false };
    }
    const npcInj = npcInjuries[rowId];
    if (!npcInj) return null;
    return { severity: npcInj.severity, weeksLeft: npcInj.weeksLeft, playingThrough: npcInj.isPlayingThrough };
  }
</script>

<section class="page">
  <h2>{$t("page.roster")}</h2>

  <article class="card board">
    <header class="tools">
      <div class="tabs">
        <button class:active={tab === "all"} on:click={() => (tab = "all")}>전체</button>
        <button class:active={tab === "pitcher"} on:click={() => (tab = "pitcher")}>투수</button>
        <button class:active={tab === "batter"} on:click={() => (tab = "batter")}>타자</button>
        <button class:active={tab === "staff"} on:click={() => (tab = "staff")}>스태프</button>
      </div>
      <input bind:value={keyword} placeholder="이름 검색" />
    </header>

    <div class="content-grid">
      <section class="list-wrap">
        <div class="head-row">
          <span>이름</span><span>역할</span><span>포지션</span><span>나이</span><span>상태</span>
        </div>
        <div class="rows">
          {#if sortedRows.length === 0}
            <p class="empty">검색 결과가 없습니다.</p>
          {:else}
            {#each sortedRows as row}
              {@const p = (row.details as any)?.player}
              {@const rowInj = getRowInjury(row.id)}
              <button
                class="data-row"
                class:selected={selected?.id === row.id}
                on:click={() => (selectedId = row.id)}
                on:dblclick={() => (modalEntityId = row.id)}
                title="더블클릭: 상세 보기"
              >
                <strong class="row-name">
                  {row.name}
                  {#if rowInj}
                    <span class="inj-badge inj-badge-{rowInj.severity}" title="{SEV_BADGE[rowInj.severity]} {rowInj.weeksLeft}주{rowInj.playingThrough ? ' (출전중)' : ''}">
                      {SEV_BADGE[rowInj.severity] ?? rowInj.severity}
                    </span>
                  {/if}
                </strong>
                <span>{roleLabel(row.role as RoleTab)}</span>
                <span>{row.role === "player" ? (p?.position ?? "-") : "-"}</span>
                <span>{row.age}</span>
                <span>{rowInj ? (rowInj.playingThrough ? "출전중" : "부상") : row.status}</span>
              </button>
            {/each}
          {/if}
        </div>
      </section>

      <aside class="detail-card">
        {#if selected}
          {@const p = (selected.details as any)?.player}
          {@const c = (selected.details as any)?.coach}
          {@const m = (selected.details as any)?.manager}
          <h3>{selected.name}</h3>
          <p>{roleLabel(selected.role as RoleTab)} · {selected.age}세</p>

          {#if selected.role === "player"}
            <section class="detail-section">
              <h4>기본 능력치</h4>
              <div class="ability-grid">
                <div><span>OVR(투구)</span><strong>{p?.pitching?.ovr ?? "-"}</strong></div>
                <div><span>OVR(타격)</span><strong>{p?.batting?.ovr ?? "-"}</strong></div>
                <div><span>컨디션</span><strong>{conditionLabel($gameStore.protagonist.condition)}</strong></div>
              </div>
            </section>

            <section class="detail-section">
              <h4>시즌 누적</h4>
              {#if selectedStats}
                {#if selectedStats.type === "pitcher"}
                  <ul class="stat-list">
                    <li>G: {selectedStats.g}</li><li>W: {selectedStats.w}</li>
                    <li>L: {selectedStats.l}</li><li>SV: {selectedStats.sv ?? 0}</li>
                    <li>IP: {selectedStats.ip}</li><li>ERA: {selectedStats.era.toFixed(2)}</li>
                    <li>WHIP: {selectedStats.whip.toFixed(2)}</li><li>K: {selectedStats.k}</li>
                  </ul>
                {:else}
                  <ul class="stat-list">
                    <li>G: {selectedStats.g}</li><li>AVG: {selectedStats.avg.toFixed(3)}</li>
                    <li>OPS: {selectedStats.ops.toFixed(3)}</li><li>HR: {selectedStats.hr}</li>
                    <li>RBI: {selectedStats.rbi}</li><li>SB: {selectedStats.sb}</li>
                  </ul>
                {/if}
              {:else}
                <p class="pending">시즌 누적 집계 중</p>
              {/if}
            </section>
          {:else}
            <section class="detail-section">
              <h4>스태프 정보</h4>
              <div class="ability-grid">
                <div><span>전문</span><strong>{c?.specialty ?? m?.style ?? "-"}</strong></div>
                {#if selected.role === "coach"}
                  <div><span>지도력</span><strong>{c?.stats?.teaching ?? "-"}</strong></div>
                  <div><span>경험</span><strong>Lv.{c?.stats?.experience ?? "-"}</strong></div>
                {:else if selected.role === "manager"}
                  <div><span>전술</span><strong>{m?.stats?.strategy ?? "-"}</strong></div>
                  <div><span>동기부여</span><strong>{m?.stats?.motivation ?? "-"}</strong></div>
                {:else}
                  <div><span>메모</span><strong>{selected.notes || "-"}</strong></div>
                {/if}
              </div>
            </section>
          {/if}
        {:else}
          <p class="empty">선택된 인물이 없습니다.</p>
        {/if}
      </aside>
    </div>
  </article>
</section>

<!-- ══════════════════ 상세 모달 ══════════════════ -->
{#if modalEntity}
  {@const mp = (modalEntity.details as any)?.player}
  {@const mc = (modalEntity.details as any)?.coach}
  {@const mm = (modalEntity.details as any)?.manager}
  {@const isPlayer = modalEntity.role === "player" && !!mp}
  {@const isPitcher = isPlayer && (mp.playerType === "pitcher" || mp.playerType === "twoWay")}
  {@const isBatter  = isPlayer && (mp.playerType === "batter"  || mp.playerType === "twoWay")}
  {@const protagonist = $gameStore.protagonist}

  <div class="modal-overlay" on:click|self={() => (modalEntityId = "")}>
    <div class="modal-box">
      <button class="modal-close" on:click={() => (modalEntityId = "")}>✕</button>

      <!-- 헤더 -->
      <header class="modal-header">
        <div class="modal-title-block">
          <h3 class="modal-name">{modalEntity.name}</h3>
          <p class="modal-meta">
            {roleLabel(modalEntity.role as RoleTab)} · {modalEntity.age}세
            {#if mp?.position} · {mp.position}{/if}
            {#if mp?.handedness} · {mp.handedness}투{/if}
          </p>
        </div>
        <!-- 아이디어 1: 상태 배지 -->
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

      <!-- 탭 바 -->
      <nav class="modal-tabs">
        <button class:mtab-active={modalTab === "stats"} on:click={() => (modalTab = "stats")}>
          능력치
        </button>
        <button class:mtab-active={modalTab === "record"} on:click={() => (modalTab = "record")}>
          {isPlayer ? "기록" : "경력"}
        </button>
      </nav>

      <!-- ══ TAB 1: 능력치 ══ -->
      {#if modalTab === "stats"}
        {#if isPlayer}
          <!-- 아이디어 2: 특성 태그 & 메모 -->
          {#if isProtagonistModal && (protagonist.tags?.length ?? 0) > 0}
            <div class="tag-row">
              {#each protagonist.tags as tag}
                <span class="tag-badge">{tag}</span>
              {/each}
            </div>
          {/if}
          {#if modalEntity.notes}
            <p class="modal-notes">{modalEntity.notes}</p>
          {/if}

          {#if isPitcher}
            <section class="modal-section">
              <h4>투구 능력치</h4>
              <div class="modal-stat-grid cols-5">
                {#each [
                  ["OVR",    mp.pitching?.ovr],
                  ["구위",   mp.pitching?.velocity],
                  ["커맨드", mp.pitching?.command],
                  ["제구",   mp.pitching?.control],
                  ["무브먼트", mp.pitching?.movement],
                  ["멘탈",   mp.pitching?.mentality],
                  ["스태미나", mp.pitching?.stamina],
                  ["회복력", mp.pitching?.recovery],
                  ["위기집중", mp.pitching?.clutch],
                  ["견제력", mp.pitching?.holdRunners],
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
                  ["OVR",    mp.batting?.ovr],
                  ["컨택",   mp.batting?.contact],
                  ["장타력", mp.batting?.power],
                  ["선구안", mp.batting?.eye],
                  ["극기",   mp.batting?.discipline],
                  ["클러치", mp.batting?.battingClutch],
                  ["플래툰", mp.batting?.platoon],
                  ["번트",   mp.batting?.bunting],
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
                  ["주력",     mp.batting?.speed],
                  ["주루판단", mp.batting?.baseInstinct],
                  ["수비",     mp.batting?.fielding],
                  ["어깨",     mp.batting?.arm],
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
                ["전문",     mc.specialty],
                ["지도력",   mc.stats?.teaching],
                ["분석",     mc.stats?.analytics],
                ["경험레벨", mc.stats?.experience],
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
                ["동기부여",   mm.stats?.motivation],
                ["선수육성",   mm.stats?.development],
                ["전술",       mm.stats?.strategy],
                ["위기대처",   mm.stats?.handlePressure],
                ["선수기용",   mm.stats?.handlePersonnel],
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

      <!-- ══ TAB 2: 기록 / 경력 ══ -->
      {:else if modalTab === "record"}
        {#if isPlayer}

          <!-- 시즌 누적 -->
          <section class="modal-section">
            <h4>시즌 누적</h4>
            {#if modalStats?.type === "pitcher"}
              <div class="modal-stat-grid cols-4">
                {#each [
                  ["G",    modalStats.g],
                  ["GS",   modalStats.gs],
                  ["W",    modalStats.w],
                  ["L",    modalStats.l],
                  ["SV",   modalStats.sv ?? 0],
                  ["HD",   modalStats.hd ?? 0],
                  ["IP",   modalStats.ip],
                  ["ER",   modalStats.er],
                  ["H",    modalStats.h],
                  ["K",    modalStats.k],
                  ["BB",   modalStats.bb],
                  ["ERA",  modalStats.era?.toFixed(2)],
                  ["WHIP", modalStats.whip?.toFixed(2)],
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
                  ["G",   modalStats.g],
                  ["PA",  modalStats.pa],
                  ["AB",  modalStats.ab],
                  ["H",   modalStats.h],
                  ["HR",  modalStats.hr],
                  ["RBI", modalStats.rbi],
                  ["SB",  modalStats.sb],
                  ["BB",  modalStats.bb],
                  ["K",   modalStats.k],
                  ["AVG", modalStats.avg?.toFixed(3)],
                  ["OBP", modalStats.obp?.toFixed(3)],
                  ["SLG", modalStats.slg?.toFixed(3)],
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

          <!-- 최근 5경기 -->
          <section class="modal-section">
            <h4>최근 5경기</h4>
            {#if modalRecentGames.length === 0}
              <p class="modal-pending">경기 없음</p>
            {:else if isProtagonistModal}
              <table class="game-table">
                <thead>
                  <tr>
                    <th>상대팀</th><th>결과</th>
                    {#if isPitcher}
                      <th>IP</th><th>ER</th><th>K</th><th>BB</th>
                    {:else}
                      <th>AB</th><th>H</th><th>AVG</th><th>HR</th><th>RBI</th>
                    {/if}
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
                        <td>{line.ab}</td>
                        <td>{line.h}</td>
                        <td>{line.ab > 0 ? (line.h / line.ab).toFixed(2) : "---"}</td>
                        <td>{line.hr}</td>
                        <td>{line.rbi}</td>
                      {:else}
                        <td colspan={isPitcher ? 4 : 5} class="modal-pending">기록 없음</td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <!-- NPC: 개인 스탯 라인 (있으면) + 팀 결과 -->
              <table class="game-table">
                <thead>
                  <tr>
                    <th>상대팀</th><th>결과</th>
                    {#if isPitcher}
                      <th>IP</th><th>ER</th><th>K</th><th>BB</th>
                    {:else}
                      <th>AB</th><th>H</th><th>AVG</th><th>HR</th><th>RBI</th>
                    {/if}
                  </tr>
                </thead>
                <tbody>
                  {#each modalRecentGames as entry}
                    {@const line = entry.result?.playerLines.find((l) => l.playerId === modalEntityId)}
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
                        <td>{line.ab}</td>
                        <td>{line.h}</td>
                        <td>{line.ab > 0 ? (line.h / line.ab).toFixed(3) : "---"}</td>
                        <td>{line.hr}</td>
                        <td>{line.rbi}</td>
                      {:else}
                        <td colspan={isPitcher ? 4 : 5} class="modal-pending">기록 없음</td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </section>

          <!-- 아이디어 3: 리그 현황 -->
          {#if modalTeamRank}
            <section class="modal-section">
              <h4>리그 현황</h4>
              <div class="rank-bar">
                <span class="rank-num">{modalTeamRank.rank}위</span>
                <span class="rank-record">
                  {modalTeamRank.wins}승 {modalTeamRank.losses}패{modalTeamRank.draws > 0 ? ` ${modalTeamRank.draws}무` : ""}
                </span>
                <span class="rank-pct">
                  승률 .{String(Math.round(modalTeamRank.winPct * 1000)).padStart(3, "0")}
                </span>
              </div>
            </section>
          {/if}

          <!-- 계약 · 경력 -->
          <section class="modal-section">
            <h4>계약 · 경력</h4>
            {#if isProtagonistModal}
              {@const contract = protagonist.contract}
              {#if contract}
                <div class="contract-grid">
                  <div class="contract-item">
                    <span>리그</span>
                    <strong>{LEAGUE_DISPLAY[contract.leagueId] ?? contract.leagueId}</strong>
                  </div>
                  <div class="contract-item">
                    <span>계약 기간</span>
                    <strong>{contract.durationYears}년 중 {contract.remainingYears}년 잔여</strong>
                  </div>
                  <div class="contract-item">
                    <span>연봉</span>
                    <strong>{formatSalary(contract.salary)}</strong>
                  </div>
                  {#if contract.signingBonus > 0}
                    <div class="contract-item">
                      <span>사이닝보너스</span>
                      <strong>{formatSalary(contract.signingBonus)}</strong>
                    </div>
                  {/if}
                  <div class="contract-item">
                    <span>노트레이드</span>
                    <strong>{contract.noTrade ? "있음" : "없음"}</strong>
                  </div>
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

              <!-- 아이디어 5: FA 자격 -->
              {#if faInfo}
                <div class="fa-bar {faInfo.eligible ? 'fa-ok' : 'fa-wait'}">
                  {#if faInfo.eligible}
                    FA 자격 보유 · 프로 {faInfo.years}년
                  {:else}
                    FA까지 {faInfo.yearsLeft}년 남음 (프로 {faInfo.years}년 / 9년 기준)
                  {/if}
                </div>
              {/if}

            {:else}
              <!-- NPC 경력 이력 -->
              {#if (modalNpcSave?.careerHistory?.length ?? 0) > 0}
                <table class="career-table">
                  <thead>
                    <tr><th>연도</th><th>팀</th><th>기록</th><th>수상</th></tr>
                  </thead>
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
          <!-- 스태프 경력 탭 (아이디어 4) -->
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
                <thead>
                  <tr><th>연도</th><th>팀</th><th>기록</th><th>수상</th></tr>
                </thead>
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
  /* ── 페이지 레이아웃 ── */
  .page { display:grid; grid-template-rows:auto minmax(0,1fr); gap:12px; height:100%; min-height:0; overflow:hidden; }
  .card { background:#161f33; border:1px solid #2d3956; border-radius:10px; padding:12px; min-height:0; overflow:hidden; }
  .board { display:grid; grid-template-rows:auto minmax(0,1fr); gap:10px; }
  .tools { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .tabs { display:flex; gap:6px; }
  .tabs button, .tools input { border:1px solid #355182; background:#1f2f4f; color:#dbe8ff; border-radius:8px; padding:5px 10px; font-size:12px; }
  .tabs button.active { background:#3262b0; border-color:#6da1f7; }
  .tools input { width:160px; }
  .content-grid { min-height:0; display:grid; grid-template-columns:minmax(0,1.5fr) minmax(260px,1fr); gap:10px; }
  .list-wrap { min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr); gap:6px; border:1px solid #2f486f; border-radius:10px; padding:8px; background:#13223d; }
  .head-row, .data-row { display:grid; grid-template-columns:1fr 0.7fr 0.6fr 0.5fr 0.6fr; gap:6px; align-items:center; font-size:12px; }
  .head-row { color:#9fb4d8; padding:0 6px; }
  .rows { min-height:0; overflow:auto; display:grid; align-content:start; gap:4px; }
  .data-row { border:1px solid #284269; background:#162a4a; border-radius:8px; padding:6px; color:#e4edff; text-align:left; cursor:pointer; }
  .data-row.selected { border-color:#79abf6; background:#1d3760; }
  .data-row strong { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .detail-card { border:1px solid #2f486f; border-radius:10px; background:#13223d; padding:10px; display:grid; align-content:start; gap:8px; min-height:0; overflow:auto; }
  .detail-card p { margin:0; color:#b4c8ea; font-size:13px; }
  .detail-section { display:grid; gap:6px; }
  .detail-section h4 { margin:0; color:#dbe8ff; font-size:13px; }
  .ability-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
  .ability-grid div { border:1px solid #2e486f; border-radius:8px; background:#152b4f; padding:6px; display:grid; gap:2px; }
  .ability-grid span { color:#9eb6de; font-size:11px; }
  .ability-grid strong { color:#eff5ff; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .stat-list { margin:0; padding-left:16px; color:#d7e5ff; font-size:12px; display:grid; gap:3px; }
  .pending { color:#9db2d8; font-size:12px; }
  .empty { color:#9db2d8; font-size:12px; padding:8px; }
  @media (max-width:1180px) { .content-grid { grid-template-columns:1fr; } .detail-card { display:none; } }

  /* ── 모달 기본 ── */
  .modal-overlay {
    position:fixed; inset:0;
    background:rgba(0,0,0,0.75);
    display:flex; align-items:center; justify-content:center;
    z-index:200;
  }
  .modal-box {
    position:relative;
    background:#111d34; border:1px solid #3a5a96; border-radius:14px;
    padding:22px 26px 26px;
    width:720px; max-width:94vw; max-height:88vh;
    overflow-y:auto;
    display:grid; align-content:start; gap:12px;
  }
  .modal-close {
    position:absolute; top:12px; right:14px;
    background:none; border:none; color:#7a9ac8; font-size:16px; cursor:pointer;
  }

  /* ── 모달 헤더 ── */
  .modal-header {
    display:flex; justify-content:space-between; align-items:flex-start; gap:12px;
  }
  .modal-title-block { min-width:0; }
  .modal-name { margin:0; font-size:20px; font-weight:700; color:#f1f6ff; }
  .modal-meta { margin:4px 0 0; color:#aebddd; font-size:13px; }
  .modal-notes { margin:0; color:#8ca8cc; font-size:12px; font-style:italic; }

  /* ── 상태 배지 (아이디어 1) ── */
  .status-badges { display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end; flex-shrink:0; }
  .badge {
    font-size:11px; font-weight:600;
    padding:3px 9px; border-radius:12px;
    white-space:nowrap;
  }
  .badge-good  { background:#152a18; color:#68de92; border:1px solid #2a5a30; }
  .badge-mid   { background:#192338; color:#c8daf8; border:1px solid #2a4060; }
  .badge-low   { background:#2e1818; color:#ff9090; border:1px solid #5a2828; }
  .badge-injury{ background:#2e1f08; color:#ffc040; border:1px solid #5a3a10; }

  /* ── 탭 바 ── */
  .modal-tabs {
    display:flex; gap:4px;
    border-bottom:1px solid #253451; padding-bottom:8px;
  }
  .modal-tabs button {
    background:none; border:1px solid transparent;
    border-radius:7px; color:#7a9ac8;
    font-size:13px; padding:5px 18px; cursor:pointer;
    transition:background 0.15s;
  }
  .modal-tabs button.mtab-active {
    background:#1d3760; border-color:#3a5a96; color:#d8e8ff; font-weight:600;
  }

  /* ── 섹션 공통 ── */
  .modal-section { display:grid; gap:8px; }
  .modal-section h4 { margin:0; color:#dbe8ff; font-size:13px; border-bottom:1px solid #253451; padding-bottom:4px; }
  .modal-pending { margin:0; color:#9db2d8; font-size:12px; }
  .modal-buff { margin:0; color:#8acf9a; font-size:12px; }

  /* ── 능력치 그리드 ── */
  .modal-stat-grid {
    display:grid; gap:6px;
    grid-template-columns:repeat(4, minmax(0,1fr));
  }
  .modal-stat-grid.cols-5 { grid-template-columns:repeat(5, minmax(0,1fr)); }
  .modal-stat-item {
    border:1px solid #2e486f; border-radius:8px; background:#152b4f;
    padding:8px 6px; display:flex; flex-direction:column; align-items:center; gap:3px;
  }
  .ms-label { color:#9eb6de; font-size:10px; }
  .ms-value { font-size:16px; font-weight:700; }
  .ms-value.good { color:#68de92; }
  .ms-value.mid  { color:#d8e8ff; }
  .ms-value.low  { color:#ffb58a; }

  /* ── 특성 태그 (아이디어 2) ── */
  .tag-row { display:flex; gap:5px; flex-wrap:wrap; }
  .tag-badge {
    font-size:11px; padding:3px 9px; border-radius:10px;
    background:#1f2f60; color:#90b8f8; border:1px solid #2a4a8a;
  }

  /* ── 구종 배지 ── */
  .pitch-badge-list { display:flex; flex-wrap:wrap; gap:6px; }
  .pitch-badge {
    display:inline-flex; align-items:center; gap:5px;
    background:#152b4f; border:1px solid #2e486f;
    border-radius:6px; padding:4px 9px; font-size:12px;
    font-weight:600; color:#d5e2fd;
  }
  .badge-grade { font-size:10px; color:#7a9ac8; font-weight:400; }
  .pitch-badge.grade-5 { border-color:#c8a030; background:#2a1e06; color:#f0c860; }
  .pitch-badge.grade-5 .badge-grade { color:#c8a030; }
  .pitch-badge.grade-4 { border-color:#3a7ad8; background:#0e2040; color:#88b8f8; }
  .pitch-badge.grade-4 .badge-grade { color:#5a8fd8; }
  .pitch-badge.grade-1 { border-color:#3a4060; background:#10142a; color:#6878a8; }
  .pitch-badge.grade-1 .badge-grade { color:#485878; }

  /* ── 최근 경기 테이블 ── */
  .game-table, .career-table {
    width:100%; border-collapse:collapse; font-size:12px;
  }
  .game-table th, .career-table th {
    color:#9fb4d8; padding:5px 8px; text-align:left;
    border-bottom:1px solid #253451; font-weight:500;
  }
  .game-table td, .career-table td {
    color:#d8e8ff; padding:6px 8px;
    border-bottom:1px solid #1a2e4a;
  }
  .game-table tr:last-child td, .career-table tr:last-child td { border-bottom:none; }
  .outcome-w { color:#68de92; }
  .outcome-l { color:#ff9090; }
  .outcome-d { color:#888; }
  .highlight-cell { color:#ffc040; font-size:11px; }

  /* ── 리그 현황 (아이디어 3) ── */
  .rank-bar {
    display:flex; align-items:center; gap:14px;
    background:#162a4a; border:1px solid #2e486f;
    border-radius:10px; padding:10px 16px;
  }
  .rank-num  { font-size:22px; font-weight:700; color:#79abf6; }
  .rank-record { font-size:13px; color:#d8e8ff; }
  .rank-pct  { font-size:12px; color:#9fb4d8; margin-left:auto; }

  /* ── 계약 정보 ── */
  .contract-grid {
    display:grid; grid-template-columns:1fr 1fr; gap:6px;
  }
  .contract-item {
    background:#152b4f; border:1px solid #2e486f; border-radius:8px;
    padding:8px 12px; display:flex; flex-direction:column; gap:3px;
  }
  .contract-item span { font-size:10px; color:#9eb6de; }
  .contract-item strong { font-size:13px; color:#d8e8ff; }
  .contract-full { grid-column:1 / -1; }

  /* ── FA 자격 (아이디어 5) ── */
  .fa-bar {
    margin-top:4px; padding:8px 14px;
    border-radius:8px; font-size:12px; font-weight:600;
  }
  .fa-ok   { background:#152a18; color:#68de92; border:1px solid #2a5a30; }
  .fa-wait { background:#131f34; color:#9fb4d8; border:1px solid #253451; }

  /* ── 부상 배지 (로스터 리스트) ── */
  .row-name { display:flex; align-items:center; gap:5px; min-width:0; overflow:hidden; }
  .inj-badge {
    flex-shrink:0;
    font-size:9px; font-weight:700;
    padding:1px 5px; border-radius:6px;
    white-space:nowrap;
  }
  .inj-badge-light    { background:#1c2a18; color:#80e880; border:1px solid #2a5a30; }
  .inj-badge-moderate { background:#2a1f08; color:#ffc040; border:1px solid #5a3a10; }
  .inj-badge-severe   { background:#2e1010; color:#ff8080; border:1px solid #6a2020; }
  .inj-badge-surgery  { background:#200e2e; color:#d090ff; border:1px solid #5a2a7a; }
</style>
