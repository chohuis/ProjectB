<script lang="ts">
  import { get } from "svelte/store";
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore } from "../../../shared/stores/master";

  type DrawPhase = "idle" | "drawing" | "complete";

  let phase: DrawPhase = "idle";
  let drawIndex = 0;
  let lastAssigned: { name: string; group: "A" | "B" } | null = null;

  // 팀 이름 조회
  function teamName(id: string): string {
    return $masterStore.teams.find((t) => t.id === id)?.name ?? id;
  }

  $: myTeamId = $gameStore.protagonist.teamId;
  $: groupA = $seasonStore.hsGroupA ?? [];
  $: groupB = $seasonStore.hsGroupB ?? [];

  // A/B 교차 배열: A1,B1,A2,B2,...
  $: drawSequence = (() => {
    const seq: Array<{ teamId: string; group: "A" | "B" }> = [];
    const len = Math.max(groupA.length, groupB.length);
    for (let i = 0; i < len; i++) {
      if (i < groupA.length) seq.push({ teamId: groupA[i], group: "A" });
      if (i < groupB.length) seq.push({ teamId: groupB[i], group: "B" });
    }
    return seq;
  })();

  // 현재까지 공개된 팀
  $: revealedA = drawSequence.slice(0, drawIndex).filter((e) => e.group === "A").map((e) => e.teamId);
  $: revealedB = drawSequence.slice(0, drawIndex).filter((e) => e.group === "B").map((e) => e.teamId);
  $: poolTeams = drawSequence.slice(drawIndex).map((e) => e.teamId);

  function startDraw() {
    phase = "drawing";
    drawIndex = 0;
    lastAssigned = null;
  }

  function next() {
    if (drawIndex >= drawSequence.length) return;
    const entry = drawSequence[drawIndex];
    lastAssigned = { name: teamName(entry.teamId), group: entry.group };
    drawIndex++;
    if (drawIndex >= drawSequence.length) {
      phase = "complete";
    }
  }

  async function confirm() {
    seasonStore.resolvePendingAction("hsGroupDraw");
    await gameStore.save();
    await seasonStore.save();
  }

  $: myGroup = groupA.includes(myTeamId) ? "A" : "B";
  $: myGroupLabel = myGroup === "A" ? "A조" : "B조";
</script>

<div class="overlay">
  <div class="modal">
    <header class="modal-head">
      <p class="year-label">{$seasonStore.seasonYear} 고교 주말리그</p>
      <h2>A / B 조 편성 추첨</h2>
      {#if phase === "complete"}
        <p class="complete-msg">내 팀({teamName(myTeamId)})은 <strong>{myGroupLabel}</strong>에 배정되었습니다.</p>
      {:else}
        <p class="sub">추첨 시작 후 [다음] 버튼으로 팀을 한 팀씩 배정합니다.</p>
      {/if}
    </header>

    <!-- A조 / B조 테이블 -->
    <div class="groups">
      <div class="group-panel">
        <div class="group-header group-a-header">A 조</div>
        <ul class="group-list">
          {#each revealedA as tid}
            <li class:my-team={tid === myTeamId} class:just-assigned={lastAssigned?.group === "A" && lastAssigned.name === teamName(tid) && phase === "drawing"}>
              {#if tid === myTeamId}<span class="star">★</span>{/if}
              {teamName(tid)}
            </li>
          {/each}
          {#each Array(Math.max(0, 8 - revealedA.length)) as _}
            <li class="empty-slot">—</li>
          {/each}
        </ul>
      </div>

      <div class="group-panel">
        <div class="group-header group-b-header">B 조</div>
        <ul class="group-list">
          {#each revealedB as tid}
            <li class:my-team={tid === myTeamId} class:just-assigned={lastAssigned?.group === "B" && lastAssigned.name === teamName(tid) && phase === "drawing"}>
              {#if tid === myTeamId}<span class="star">★</span>{/if}
              {teamName(tid)}
            </li>
          {/each}
          {#each Array(Math.max(0, 8 - revealedB.length)) as _}
            <li class="empty-slot">—</li>
          {/each}
        </ul>
      </div>
    </div>

    <!-- 대기 풀 -->
    {#if phase !== "complete"}
      <div class="pool-section">
        <p class="pool-label">대기 ({poolTeams.length}팀)</p>
        <div class="pool-chips">
          {#if phase === "idle"}
            {#each drawSequence as e}
              <span class="pool-chip" class:pool-my={e.teamId === myTeamId}>{teamName(e.teamId)}</span>
            {/each}
          {:else}
            {#each poolTeams as tid}
              <span class="pool-chip" class:pool-my={tid === myTeamId}>{teamName(tid)}</span>
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    <!-- 직전 배정 표시 -->
    {#if phase === "drawing" && lastAssigned}
      <div class="last-assigned">
        <span class="la-arrow">▶</span>
        <strong class="la-name">{lastAssigned.name}</strong>
        <span class="la-group" class:la-a={lastAssigned.group === "A"} class:la-b={lastAssigned.group === "B"}>
          {lastAssigned.group}조 배정
        </span>
      </div>
    {:else if phase === "drawing"}
      <div class="last-assigned last-assigned-placeholder">다음 버튼을 눌러 추첨을 진행하세요.</div>
    {/if}

    <!-- 버튼 영역 -->
    <footer class="modal-footer">
      {#if phase === "idle"}
        <button class="btn btn-start" on:click={startDraw}>추첨 시작</button>
      {:else if phase === "drawing"}
        <div class="progress-info">{drawIndex} / {drawSequence.length}</div>
        <button class="btn btn-next" on:click={next}>다음 ▶</button>
      {:else}
        <button class="btn btn-confirm" on:click={confirm}>확인</button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
  }

  .modal {
    background: #0c1828;
    border: 1px solid #3a5880;
    border-radius: 16px;
    padding: 28px 32px 24px;
    width: min(720px, 94vw);
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-height: 90vh;
    overflow-y: auto;
  }

  /* 헤더 */
  .modal-head {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .year-label {
    margin: 0;
    font-size: 11px;
    color: #6888b4;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-size: 22px;
    color: #e8f4ff;
    font-weight: 700;
    letter-spacing: 2px;
  }

  .sub {
    margin: 0;
    font-size: 12px;
    color: #6888b4;
  }

  .complete-msg {
    margin: 0;
    font-size: 14px;
    color: #a8c8f0;
  }

  .complete-msg strong {
    color: #f0e060;
    font-size: 16px;
  }

  /* A/B 조 */
  .groups {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .group-panel {
    border: 1px solid #2a4060;
    border-radius: 10px;
    overflow: hidden;
  }

  .group-header {
    padding: 8px 14px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 2px;
    text-align: center;
  }

  .group-a-header {
    background: #1a2e50;
    color: #7ab8f8;
    border-bottom: 1px solid #2a4a78;
  }

  .group-b-header {
    background: #1a3828;
    color: #70d898;
    border-bottom: 1px solid #2a5838;
  }

  .group-list {
    list-style: none;
    margin: 0;
    padding: 6px 0;
    display: flex;
    flex-direction: column;
    min-height: 180px;
  }

  .group-list li {
    padding: 6px 14px;
    font-size: 13px;
    color: #c8dcf8;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background 0.2s;
  }

  .group-list li.just-assigned {
    background: rgba(120, 180, 255, 0.12);
    color: #e8f4ff;
    font-weight: 700;
  }

  .group-list li.my-team {
    color: #f0e060;
    font-weight: 700;
  }

  .group-list li.empty-slot {
    color: #2a3e5a;
    font-size: 12px;
  }

  .star {
    font-size: 11px;
    color: #f0e060;
    flex: 0 0 auto;
  }

  /* 대기 풀 */
  .pool-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pool-label {
    margin: 0;
    font-size: 11px;
    color: #5878a8;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .pool-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 32px;
  }

  .pool-chip {
    background: #152238;
    border: 1px solid #2a4060;
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 12px;
    color: #88a8d8;
  }

  .pool-chip.pool-my {
    border-color: #a0c040;
    color: #d0e860;
    background: #1a2a10;
  }

  /* 직전 배정 */
  .last-assigned {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #101e36;
    border: 1px solid #2a4060;
    border-radius: 8px;
    min-height: 40px;
  }

  .last-assigned-placeholder {
    color: #4a6888;
    font-size: 12px;
  }

  .la-arrow {
    color: #5080c0;
    font-size: 14px;
    flex: 0 0 auto;
  }

  .la-name {
    font-size: 15px;
    color: #e0eeff;
    flex: 1;
  }

  .la-group {
    font-size: 13px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 6px;
    flex: 0 0 auto;
  }

  .la-a {
    background: #1a2e50;
    color: #7ab8f8;
    border: 1px solid #3a6090;
  }

  .la-b {
    background: #1a3828;
    color: #70d898;
    border: 1px solid #3a7050;
  }

  /* 버튼 */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .progress-info {
    font-size: 13px;
    color: #5878a8;
  }

  .btn {
    border: 0;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 700;
    padding: 12px 40px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-start {
    background: #2a5298;
    color: #e8f4ff;
  }
  .btn-start:hover { background: #3562b8; }

  .btn-next {
    background: #1a4a2a;
    color: #60e890;
    border: 1px solid #2e8050;
  }
  .btn-next:hover { background: #225c34; }

  .btn-confirm {
    background: #1a4a6a;
    color: #60c8f0;
    border: 1px solid #2a7aa0;
  }
  .btn-confirm:hover { background: #225880; }
</style>
