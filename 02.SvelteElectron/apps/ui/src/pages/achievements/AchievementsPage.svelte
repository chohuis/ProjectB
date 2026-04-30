<script lang="ts">
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { masterStore } from "../../shared/stores/master";
  import { computeMetrics } from "../../shared/utils/achievementEngine";

  type Category = "all" | "baseball" | "growth" | "social" | "hidden";

  const CAT_LABELS: Record<Category, string> = {
    all: "전체",
    baseball: "야구",
    growth: "성장",
    social: "소셜",
    hidden: "히든",
  };

  const DESC_MAP: Record<string, (target: number) => string> = {
    strikeoutTotal:    (t) => `누적 삼진 ${t}개 달성`,
    saveTotal:         (t) => `누적 세이브 ${t}개 달성`,
    kakaoFirstContact: ()  => "첫 카카오톡 대화 달성",
    winsTotal:         (t) => `누적 승리 ${t}회 달성`,
    gamesPlayedTotal:  (t) => `경기 ${t}회 출전`,
    messagesReadTotal: (t) => `메시지 ${t}개 읽기`,
  };

  function desc(metricKey: string, targetValue: number): string {
    return DESC_MAP[metricKey]?.(targetValue) ?? "조건 달성";
  }

  let category: Category = "all";

  $: metrics = computeMetrics(
    $gameStore.achievementMetrics,
    $gameStore.mailbox,
    $seasonStore.standings,
    $seasonStore.schedule,
    $gameStore.protagonist.teamId,
  );

  $: items = $masterStore.achievements
    .filter((d) => d.status === "active")
    .map((d) => {
      const rt = $gameStore.achievements.find((x) => x.id === d.id);
      const liveVal = metrics[d.metricKey] ?? 0;
      const progress = Math.max(rt?.progress ?? 0, liveVal);
      const unlocked = !!rt?.unlockedAt;
      const claimed  = !!rt?.claimedAt;
      const pct = Math.min((progress / d.targetValue) * 100, 100);
      return { ...d, progress, unlocked, claimed, pct, unlockedAt: rt?.unlockedAt ?? null };
    })
    .filter((x) => category === "all" || x.category === category);

  $: totalActive  = $masterStore.achievements.filter((d) => d.status === "active").length;
  $: doneCount    = items.filter((x) => x.unlocked).length;
  $: claimable    = items.filter((x) => x.unlocked && !x.claimed).length;
</script>

<section class="page">
  <header class="top-bar">
    <h2>업적</h2>
    <div class="summary-chips">
      <span class="chip">달성 <strong>{doneCount}</strong> / {totalActive}</span>
      {#if claimable > 0}
        <span class="chip chip-gold">보상 미수령 <strong>{claimable}</strong></span>
      {/if}
    </div>
  </header>

  <nav class="filter-row">
    {#each (["all", "baseball", "growth", "social", "hidden"] as Category[]) as c}
      <button class:active={category === c} on:click={() => (category = c)}>
        {CAT_LABELS[c]}
      </button>
    {/each}
  </nav>

  <div class="list">
    {#each items as a (a.id)}
      {@const isHiddenLocked = !!a.hidden && !a.unlocked}
      <article class="item" class:unlocked={a.unlocked} >
        <div class="row-title">
          <span class="badge-status" class:done={a.unlocked} class:claimed={a.claimed}>
            {a.claimed ? "수령 완료" : a.unlocked ? "달성" : "진행중"}
          </span>
          <strong class="title">{isHiddenLocked ? "???" : a.title}</strong>
          {#if a.reward && a.unlocked}
            <span class="reward-tag">{a.reward}</span>
          {/if}
        </div>

        <p class="item-desc">{isHiddenLocked ? "숨겨진 업적입니다." : desc(a.metricKey, a.targetValue)}</p>

        <div class="progress-row">
          <div class="bar-wrap">
            <div class="bar-fill" style="width:{a.pct}%"></div>
          </div>
          <span class="prog-text">{Math.min(a.progress, a.targetValue)} / {a.targetValue}</span>
        </div>

        {#if a.unlocked && !a.claimed}
          <button class="btn-claim" on:click={() => { gameStore.claimAchievement(a.id); gameStore.save(); }}>
            보상 수령
          </button>
        {:else if a.claimed}
          <span class="claimed-label">수령 완료</span>
        {/if}
      </article>
    {:else}
      <p class="empty">표시할 업적이 없습니다.</p>
    {/each}
  </div>
</section>

<style>
  .page {
    height: 100%;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 8px;
    overflow: hidden;
  }

  h2 { margin: 0; font-size: 15px; color: #dce8ff; }

  .top-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #111d34;
    border: 1px solid #2e4568;
    border-radius: 10px;
    padding: 8px 12px;
  }

  .summary-chips {
    display: flex;
    gap: 8px;
    flex: 1;
  }

  .chip {
    background: #1c2f4e;
    border: 1px solid #3a5886;
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 12px;
    color: #9bb4d8;
  }

  .chip strong { color: #dce8ff; }

  .chip-gold {
    background: #2a1e06;
    border-color: #b87800;
    color: #e8b840;
  }

  .chip-gold strong { color: #ffd060; }


  .filter-row {
    display: flex;
    gap: 6px;
    background: #111d34;
    border: 1px solid #2e4568;
    border-radius: 10px;
    padding: 8px 10px;
  }

  .filter-row button {
    background: #1c2f4e;
    border: 1px solid #3a5886;
    color: #adc4e8;
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
  }

  .filter-row button.active {
    background: #3262b0;
    border-color: #6da1f7;
    color: #e8f0ff;
  }

  .list {
    overflow-y: auto;
    display: grid;
    gap: 6px;
    align-content: start;
    padding-right: 2px;
  }

  .item {
    background: #0f1929;
    border: 1px solid #253650;
    border-radius: 10px;
    padding: 10px 12px;
    display: grid;
    gap: 6px;
  }

  .item.unlocked {
    border-color: #2d6640;
    background: #0e1f14;
  }


  .row-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge-status {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #3a5886;
    background: #1c2f4e;
    color: #7a94bc;
    white-space: nowrap;
  }

  .badge-status.done {
    background: #174429;
    border-color: #2d8050;
    color: #5ed38a;
  }

   .badge-status.claimed {
    background: #1d2d4f;
    border-color: #4a6ca6;
    color: #9ec0ff;
  }

  .title {
    font-size: 13px;
    color: #dce8ff;
    flex: 1;
  }

  .reward-tag {
    font-size: 11px;
    background: #1a2e50;
    border: 1px solid #3a6ab0;
    border-radius: 4px;
    padding: 2px 6px;
    color: #7ab0f0;
    white-space: nowrap;
  }

  .item-desc {
    margin: 0;
    font-size: 12px;
    color: #7a94bc;
  }

  .progress-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bar-wrap {
    flex: 1;
    height: 6px;
    background: #1c2f4e;
    border-radius: 3px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: #3a7adc;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .item.unlocked .bar-fill {
    background: #2d9e58;
  }

  .prog-text {
    font-size: 11px;
    color: #6a88b8;
    white-space: nowrap;
    min-width: 48px;
    text-align: right;
  }

  .btn-claim {
    align-self: start;
    background: #b87800;
    border: 1px solid #e8a820;
    color: #fff8e0;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-claim:hover { background: #d08c00; }

  .claimed-label {
    font-size: 11px;
    color: #5e7a58;
  }

  .empty {
    margin: 20px auto;
    color: #4a6480;
    font-size: 13px;
  }
</style>
