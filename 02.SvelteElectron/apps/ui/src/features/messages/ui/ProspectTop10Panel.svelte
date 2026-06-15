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
    color: #6a86b8;
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
    background: #0f1c31;
    border: 1px solid #2a3f68;
    border-radius: 10px;
    padding: 10px 10px 8px;
  }

  .col-title {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 700;
    color: #c8daff;
    border-bottom: 1px solid #253451;
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
    background: #172540;
    border-color: #304d80;
  }

  .rank-row.hero {
    background: #1c2e10;
    border-color: #4a7a28;
    color: #90e870;
    font-weight: 700;
  }

  .rank-num {
    color: #6a86b8;
    font-size: 11px;
    font-weight: 700;
    text-align: right;
  }

  .rank-row.hero .rank-num {
    color: #6acf40;
  }

  .rank-name {
    color: #d8e8ff;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rank-row.hero .rank-name {
    color: #a0f870;
  }

  .rank-team {
    color: #5a76a8;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: right;
  }

  .rank-empty {
    color: #4a5e88;
    font-size: 11px;
    padding: 6px;
    text-align: center;
  }

  .hero-outside {
    margin: 4px 0 0;
    font-size: 11px;
    color: #7090c0;
    text-align: center;
    border-top: 1px solid #1e3050;
    padding-top: 5px;
  }
</style>
