<script lang="ts">
  import { hasPendingAction, nextPendingAction } from "../../../shared/stores/season";
  import { advanceWeek } from "../../../shared/usecases/advanceWeek";
  import TeamMark from "../../team/ui/TeamMark.svelte";

  export let dayLabel: string;
  /** 시즌 주차. 0이면 표시하지 않는다(비시즌·초기화 직후) */
  export let weekLabel: string = "";
  export let teamName: string;
  export let teamId: string = "";
  export let playerName: string;
  export let playerYear: string = "";
  export let playerPosition: string = "";
  export let playerThrows: string = "";
  export let playerBats: string = "";
  export let jerseyNumber: number = 0;
  export let onOpenPending: () => void = () => {};

  // ⚠ 등번호·컨디션·피로·사기·태그는 **우측 패널로 옮겼다.**
  // 헤더는 모든 화면 위에 항상 떠 있으므로 "지금 누구이고 언제인가"만 남긴다.
  // 변하는 수치를 여기 두면 화면을 볼 때마다 눈이 위로 끌려간다.

  let advancing = false;

  $: btnDisabled = advancing;

  $: btnLabel =
    $nextPendingAction?.type === "game"            ? "경기 대기 중" :
    $nextPendingAction?.type === "preGameBriefing" ? "경기 전 브리핑" :
    $nextPendingAction?.type === "message"         ? "메시지 확인" :
    $nextPendingAction?.type === "event"           ? "이벤트 처리" :
    advancing ? "진행 중..." : "다음 주 진행";

  /** 메타 줄 — 빈 값이 있어도 가운뎃점이 겹치지 않게 조립한다 */
  $: metaParts = [
    teamName,
    playerYear,
    playerPosition,
    playerThrows && playerBats ? `${playerThrows}/${playerBats}` : "",
  ].filter(Boolean);

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

<header class="hdr">
  <div class="id">
    {#if teamId}
      <TeamMark {teamId} size={34} />
    {/if}
    {#if jerseyNumber > 0}
      <span class="num u-num">{jerseyNumber}</span>
    {/if}
    <div class="who">
      <h1>{playerName}</h1>
      <p class="meta">
        {#each metaParts as part, i}
          {#if i > 0}<span class="sep">·</span>{/if}{part}
        {/each}
      </p>
    </div>
  </div>

  <div class="when">
    <div class="date">
      <strong class="u-num">{dayLabel}</strong>
      {#if weekLabel}<span class="wk u-num">{weekLabel}</span>{/if}
    </div>
    <button
      class="go"
      on:click={handleAdvance}
      disabled={btnDisabled}
      class:advancing
      class:pending={$hasPendingAction}
    >
      {btnLabel}
    </button>
  </div>
</header>

<style>
  /* 유니폼 상의 — 팀 주색을 어둡게 내린 바탕에 금색 트림 한 줄 */
  .hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    background: var(--t-dark);
    border-bottom: 3px solid var(--t-gold);
    color: var(--ink-on-dark);
    padding: 10px 18px;
  }

  .id { display: flex; align-items: center; gap: 14px; min-width: 0; }

  /* 등번호 — 데이터는 계속 있었는데 화면에 한 번도 안 나왔다 */
  .num {
    font-size: 34px;
    font-weight: 800;
    font-style: italic;
    letter-spacing: -0.04em;
    line-height: 1;
    color: var(--t-gold);
    /* 유니폼 번호처럼 세로 가운데가 아니라 글자 바닥에 맞춘다 */
    padding-right: 14px;
    border-right: 1px solid rgba(255, 255, 255, 0.18);
  }

  .who { min-width: 0; }

  h1 {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    margin: 2px 0 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
    white-space: nowrap;
  }
  .sep { opacity: 0.45; margin: 0 5px; }

  .when {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
  }

  .date { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
  .date strong { font-size: 14px; font-weight: 700; }
  .wk {
    font-size: 10px;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.6);
  }

  .go {
    background: var(--t-gold);
    color: var(--t-dark);
    border: 0;
    border-radius: var(--radius);
    padding: 9px 18px;
    font-size: 13.5px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    transition: filter 0.12s;
  }
  .go:hover:not(:disabled) { filter: brightness(1.06); }
  .go:disabled { cursor: default; }

  .go.advancing { background: rgba(255, 255, 255, 0.16); color: rgba(255, 255, 255, 0.55); }

  /* 처리할 게 남았을 때. **팀 색이 아니라 고정 호박색** —
     "할 일이 있다"는 뜻은 팀이 바뀌어도 같아야 한다 */
  .go.pending {
    background: var(--attn);
    color: #3A2600;
    box-shadow: 0 0 0 3px rgba(240, 182, 92, 0.22);
  }
</style>
