<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore } from "../../shared/stores/master";
  import { seasonStore } from "../../shared/stores/season";

  type RosterTab = "all" | "pitcher" | "batter" | "staff";
  type RoleTab = "player" | "coach" | "manager" | "owner";

  export let filterTeamId: string = "";

  let tab: RosterTab = "all";
  let keyword = "";
  let selectedId = "";
  let modalEntityId = "";

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

  function conditionLabel(value: number): string {
    if (value >= 70) return "좋음";
    if (value >= 40) return "보통";
    return "주의";
  }

  async function loadLeagueEntities() {
    const leagueId = toLeagueId($gameStore.protagonist.careerStage);
    await masterStore.loadEntities(leagueId);
  }

  onMount(async () => {
    await loadLeagueEntities();
  });

  $: currentLeagueId = toLeagueId($gameStore.protagonist.careerStage);
  $: if (currentLeagueId) {
    loadLeagueEntities();
  }

  $: myTeamId = $gameStore.protagonist.teamId;
  $: activeTeamId = filterTeamId || myTeamId;
  $: teamRows = $masterStore.entities.filter((e) => e.teamId === activeTeamId);
  $: modalEntity = modalEntityId ? $masterStore.entities.find((e) => e.id === modalEntityId) ?? null : null;
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

  $: selectedStats = selected ? $seasonStore.stats[selected.id] ?? null : null;
  $: modalStats = modalEntity ? $seasonStore.stats[modalEntity.id] ?? null : null;

  function statTone(v: number): string {
    if (v >= 70) return "good";
    if (v >= 50) return "mid";
    return "low";
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
          <span>이름</span>
          <span>역할</span>
          <span>포지션</span>
          <span>나이</span>
          <span>상태</span>
        </div>
        <div class="rows">
          {#if sortedRows.length === 0}
            <p class="empty">검색 결과가 없습니다.</p>
          {:else}
            {#each sortedRows as row}
              {@const p = (row.details as any)?.player}
              <button
                class="data-row"
                class:selected={selected?.id === row.id}
                on:click={() => (selectedId = row.id)}
                on:dblclick={() => (modalEntityId = row.id)}
                title="더블클릭: 상세 보기"
              >
                <strong>{row.name}</strong>
                <span>{roleLabel(row.role as RoleTab)}</span>
                <span>{row.role === "player" ? (p?.position ?? "-") : "-"}</span>
                <span>{row.age}</span>
                <span>{row.status}</span>
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
                    <li>G: {selectedStats.g}</li><li>IP: {selectedStats.ip}</li><li>ERA: {selectedStats.era.toFixed(2)}</li>
                    <li>WHIP: {selectedStats.whip.toFixed(2)}</li><li>K: {selectedStats.k}</li><li>BB: {selectedStats.bb}</li>
                  </ul>
                {:else}
                  <ul class="stat-list">
                    <li>G: {selectedStats.g}</li><li>AVG: {selectedStats.avg.toFixed(3)}</li><li>OPS: {selectedStats.ops.toFixed(3)}</li>
                    <li>HR: {selectedStats.hr}</li><li>RBI: {selectedStats.rbi}</li><li>SB: {selectedStats.sb}</li>
                  </ul>
                {/if}
              {:else}
                <p class="pending">시즌 누적 집계 중</p>
              {/if}
            </section>

            <section class="detail-section">
              <h4>최근 5경기</h4>
              <p class="pending">집계 중</p>
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

{#if modalEntity}
  {@const mp = (modalEntity.details as any)?.player}
  {@const mc = (modalEntity.details as any)?.coach}
  {@const mm = (modalEntity.details as any)?.manager}
  <div class="modal-overlay" on:click|self={() => (modalEntityId = "")}>
    <div class="modal-box">
      <button class="modal-close" on:click={() => (modalEntityId = "")}>✕</button>
      <h3 class="modal-name">{modalEntity.name}</h3>
      <p class="modal-meta">
        {roleLabel(modalEntity.role as RoleTab)} · {modalEntity.age}세
        {#if mp?.position} · {mp.position}{/if}
        {#if mp?.handedness} · {mp.handedness}투{/if}
      </p>
      {#if modalEntity.notes}
        <p class="modal-notes">{modalEntity.notes}</p>
      {/if}

      {#if modalEntity.role === "player" && mp}
        {@const isPitcher = mp.playerType === "pitcher" || mp.playerType === "twoWay"}
        {@const isBatter  = mp.playerType === "batter"  || mp.playerType === "twoWay"}

        {#if isPitcher}
          <section class="modal-section">
            <h4>투구 능력치</h4>
            <div class="modal-stat-grid">
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
            <div class="modal-stat-grid">
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
            <div class="modal-stat-grid">
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

        <section class="modal-section">
          <h4>시즌 누적</h4>
          {#if modalStats?.type === "pitcher"}
            <div class="modal-stat-grid">
              {#each [
                ["G",    modalStats.g],
                ["IP",   modalStats.ip],
                ["ERA",  modalStats.era?.toFixed(2)],
                ["WHIP", modalStats.whip?.toFixed(2)],
                ["K",    modalStats.k],
                ["BB",   modalStats.bb],
              ] as [lbl, val]}
                <div class="modal-stat-item">
                  <span class="ms-label">{lbl}</span>
                  <span class="ms-value mid">{val ?? "-"}</span>
                </div>
              {/each}
            </div>
          {:else if modalStats?.type === "batter"}
            <div class="modal-stat-grid">
              {#each [
                ["G",   modalStats.g],
                ["AVG", modalStats.avg?.toFixed(3)],
                ["OPS", modalStats.ops?.toFixed(3)],
                ["HR",  modalStats.hr],
                ["RBI", modalStats.rbi],
                ["SB",  modalStats.sb],
              ] as [lbl, val]}
                <div class="modal-stat-item">
                  <span class="ms-label">{lbl}</span>
                  <span class="ms-value mid">{val ?? "-"}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="modal-pending">집계 중</p>
          {/if}
        </section>
      {:else if modalEntity.role === "coach" && mc}
        <section class="modal-section">
          <h4>코치 능력치</h4>
          <div class="modal-stat-grid">
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
          {#if mc.trainingBuffs}
            <p class="modal-buff">{mc.trainingBuffs}</p>
          {/if}
        </section>
      {:else if modalEntity.role === "manager" && mm}
        <section class="modal-section">
          <h4>감독 능력치</h4>
          <div class="modal-stat-grid">
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
      {/if}
    </div>
  </div>
{/if}

<style>
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
  @media (max-width:1180px){ .content-grid { grid-template-columns:1fr; } .detail-card { display:none; } }

  /* ── 상세 모달 ── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center;
    z-index: 200;
  }
  .modal-box {
    position: relative;
    background: #111d34; border: 1px solid #3a5a96; border-radius: 14px;
    padding: 24px 28px; width: 520px; max-width: 90vw; max-height: 80vh;
    overflow-y: auto; display: grid; gap: 10px;
  }
  .modal-close {
    position: absolute; top: 12px; right: 14px;
    background: none; border: none; color: #7a9ac8; font-size: 16px; cursor: pointer;
  }
  .modal-name { margin: 0; font-size: 20px; font-weight: 700; color: #f1f6ff; }
  .modal-meta { margin: 0; color: #aebddd; font-size: 13px; }
  .modal-notes { margin: 0; color: #8ca8cc; font-size: 12px; font-style: italic; }
  .modal-buff { margin: 0; color: #8acf9a; font-size: 12px; }
  .modal-pending { margin: 0; color: #9db2d8; font-size: 12px; }
  .modal-section { display: grid; gap: 8px; }
  .modal-section h4 { margin: 0; color: #dbe8ff; font-size: 13px; border-bottom: 1px solid #253451; padding-bottom: 4px; }
  .modal-stat-grid {
    display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 6px;
  }
  .modal-stat-item {
    border: 1px solid #2e486f; border-radius: 8px; background: #152b4f;
    padding: 8px 6px; display: flex; flex-direction: column; align-items: center; gap: 3px;
  }
  .ms-label { color: #9eb6de; font-size: 10px; }
  .ms-value { font-size: 16px; font-weight: 700; }
  .ms-value.good { color: #68de92; }
  .ms-value.mid { color: #d8e8ff; }
  .ms-value.low { color: #ffb58a; }
</style>

