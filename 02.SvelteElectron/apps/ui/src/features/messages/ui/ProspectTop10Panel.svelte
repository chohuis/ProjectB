<script lang="ts">
  import type { Top10Metadata } from "../../../shared/types/main";
  import PlayerDetailModal from "../../player/ui/PlayerDetailModal.svelte";

  export let metadata: Top10Metadata;

  let detailEntityId = "";

  const typeKr = metadata.playerType === "pitcher" ? "투수" : "타자";

  function openDetail(id: string) {
    if (id === "PLY_HERO") return;
    detailEntityId = id;
  }
  function closeDetail() { detailEntityId = ""; }
</script>

<div class="top10-wrap">
  <p class="top10-subtitle">
    고교 {typeKr} 유망주 월간 랭킹 · W{metadata.week} · {metadata.seasonYear}시즌
  </p>

  <div class="top10-grid">
    {#each metadata.columns as col}
      <div class="top10-col">
        <h4 class="col-title">{col.label}</h4>

        <ol class="rank-list">
          {#each col.entries as entry}
            {@const isHero = entry.id === "PLY_HERO"}
            <li
              class="rank-row"
              class:hero={isHero}
              class:clickable={!isHero}
              on:dblclick={() => openDetail(entry.id)}
              title={isHero ? "나" : "더블클릭으로 상세 보기"}
            >
              <span class="rank-num">{entry.rank}</span>
              <span class="rank-name">{entry.name}{#if isHero} ◀{/if}</span>
              <span class="rank-team">{entry.teamName}</span>
            </li>
          {/each}

          {#if col.entries.length === 0}
            <li class="rank-empty">해당 학년 선수 없음</li>
          {/if}
        </ol>

        {#if col.heroRank !== null}
          <p class="hero-outside">※ 내 순위: 약 {col.heroRank}위</p>
        {/if}
      </div>
    {/each}
  </div>
</div>

{#if detailEntityId}
  <PlayerDetailModal entityId={detailEntityId} on:close={closeDetail} />
{/if}

<style>
  .top10-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .top10-subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--ink-mute);
  }

  .top10-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .top10-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 10px 10px 8px;
  }

  .col-title {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 800;
    color: var(--ink);
    border-bottom: 2px solid var(--t-dark);
    padding-bottom: 6px;
    text-align: center;
  }

  .rank-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .rank-row {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    align-items: center;
    gap: 5px;
    padding: 5px 6px;
    border-radius: 6px;
    font-size: 12px;
    border: 1px solid transparent;
    transition: background 0.1s;
  }

  .rank-row.clickable {
    cursor: pointer;
  }
  .rank-row.clickable:hover {
    background: var(--panel);
    border-color: var(--line-strong);
  }

  /* 내 행은 팀 색으로 반전한다 — `.u-table tr.is-me`와 같은 규칙이다 */
  .rank-row.hero {
    background: var(--t-dark);
    color: var(--t-gold);
    font-weight: 800;
  }

  .rank-num {
    color: var(--ink-mute);
    font-size: 11px;
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .rank-row.hero .rank-num { color: var(--t-gold); }

  .rank-name {
    color: var(--ink);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rank-row.hero .rank-name { color: var(--t-gold); }

  .rank-team {
    color: var(--ink-mute);
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: right;
  }

  .rank-row.hero .rank-team { color: rgba(255, 255, 255, 0.7); }

  .rank-empty {
    color: var(--ink-mute);
    font-size: 11px;
    padding: 6px;
    text-align: center;
  }

  .hero-outside {
    margin: 4px 0 0;
    font-size: 11px;
    color: var(--ink-mid);
    text-align: center;
    border-top: 1px solid var(--line);
    padding-top: 5px;
  }
</style>
