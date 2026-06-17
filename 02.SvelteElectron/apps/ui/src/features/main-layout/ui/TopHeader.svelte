<script lang="ts">
  import { hasPendingAction, nextPendingAction } from "../../../shared/stores/season";
  import { advanceWeek } from "../../../shared/usecases/advanceWeek";
  import { t } from "../../../shared/i18n";

  export let dayLabel: string;
  export let teamName: string;
  export let playerName: string;
  export let playerYear: string = "";
  export let playerPosition: string = "";
  export let playerRole: string = "";
  export let playerThrows: string = "";
  export let playerBats: string = "";
  export let playerBirthday: string = "";
  export let playerTags: string[] = [];
  export let playerOverall: number = 0;
  export let playerCondition: number = 0;
  export let playerFatigue: number = 0;
  export let playerMorale: number = 0;
  export let onOpenPending: () => void = () => {};

  function formatBirthday(bd: string): string {
    const [y, m, d] = bd.split("-");
    return `${y}.${m.padStart(2, "0")}.${d.padStart(2, "0")}생`;
  }

  let advancing = false;

  $: btnDisabled = advancing;

  $: btnLabel =
    $nextPendingAction?.type === "game"            ? "경기 대기 중" :
    $nextPendingAction?.type === "preGameBriefing" ? "경기 전 브리핑 확인" :
    $nextPendingAction?.type === "message"         ? "메시지 확인 필요" :
    $nextPendingAction?.type === "event"           ? "이벤트 처리 필요" :
    advancing ? "진행 중..." : "다음 주 진행";

  async function handleAdvance() {
    if (btnDisabled) return;
    if ($hasPendingAction) {
      onOpenPending();
      return;
    }
    advancing = true;
    try {
      await advanceWeek();
    } finally {
      advancing = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.code !== "Space") return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
    e.preventDefault();
    handleAdvance();
  }
</script>

<svelte:window on:keydown={handleKeydown} />
<header class="header">
  <div class="left">
    <h1>{playerName}</h1>
    <p class="meta-line">{teamName} · {playerYear} · {playerPosition} · {playerRole} · {playerThrows}/{playerBats}{playerBirthday ? ` · ${formatBirthday(playerBirthday)}` : ""}</p>
    {#if playerTags.length > 0}
      <div class="tag-row">
        {#each playerTags as tag}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    {/if}
    <div class="stat-chips">
      <span class="chip"><em>OVR</em><strong>{playerOverall}</strong></span>
      <span class="chip"><em>컨디션</em><strong>{playerCondition}</strong></span>
      <span class="chip"><em>피로도</em><strong>{playerFatigue}</strong></span>
      <span class="chip"><em>사기</em><strong>{playerMorale}</strong></span>
    </div>
  </div>
  <div class="right">
    <strong>{dayLabel}</strong>
    <div class="controls">
      <button
        class="advance-button"
        on:click={handleAdvance}
        disabled={btnDisabled}
        class:advancing
        class:pending={$hasPendingAction}
      >
        {btnLabel}
      </button>
    </div>
  </div>
</header>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    background: #121a2b;
    border: 1px solid #2d3852;
    border-radius: 10px;
    padding: 12px 16px;
  }

  .left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #f1f6ff;
  }

  .meta-line {
    margin: 0;
    color: #aebad7;
    font-size: 13px;
  }

  .tag-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .tag {
    font-size: 11px;
    color: #c8d8f8;
    border: 1px solid #3a5074;
    background: #1e3050;
    border-radius: 999px;
    padding: 2px 8px;
  }

  .stat-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #0f1830;
    border: 1px solid #2e4262;
    border-radius: 7px;
    padding: 4px 10px;
    min-width: 52px;
  }

  .chip em {
    font-style: normal;
    font-size: 10px;
    color: #7a9ac8;
  }

  .chip strong {
    font-size: 16px;
    color: #f1f6ff;
    line-height: 1.2;
  }

  .right {
    display: grid;
    gap: 8px;
    justify-items: end;
    flex-shrink: 0;
    padding-left: 16px;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .advance-button {
    background: #2b4b80;
    color: #fff;
    border: 0;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.12s;
    white-space: nowrap;
  }

  .advance-button:hover:not(:disabled) {
    background: #3a5f9e;
  }

  .advance-button:disabled {
    cursor: default;
  }

  .advance-button.advancing {
    background: #1e3356;
    color: #6a8aaa;
  }

  .advance-button.pending {
    background: #5c3a1a;
    color: #f0b060;
    border: 1px solid #8a5a28;
  }
</style>
