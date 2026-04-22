<script lang="ts">
  import type { MainTabId } from "../../../shared/types/main";

  export let currentTab: MainTabId;
  export let unreadMessageCount = 0;
  export let onSelectTab: (tab: MainTabId) => void;

  const tabs: { id: MainTabId; label: string }[] = [
    { id: "home", label: "홈" },
    { id: "status", label: "상태" },
    { id: "messages", label: "메시지" },
    { id: "roster", label: "로스터" },
    { id: "schedule", label: "일정" },
    { id: "training", label: "훈련" },
    { id: "finance", label: "재정" },
    { id: "test", label: "매치 엔진" },
    { id: "records", label: "기록" },
    { id: "team", label: "팀" }
  ];
</script>

<nav class="nav">
  {#each tabs as tab}
    <button class:active={tab.id === currentTab} on:click={() => onSelectTab(tab.id)}>
      <span>{tab.label}</span>
      {#if tab.id === "messages" && unreadMessageCount > 0}
        <strong class="badge">{unreadMessageCount > 99 ? "99+" : unreadMessageCount}</strong>
      {/if}
    </button>
  {/each}
</nav>

<style>
  .nav {
    display: grid;
    gap: 6px;
    align-content: start;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  button {
    background: #1c2438;
    color: #e8eefc;
    border: 1px solid #2e3b58;
    border-radius: 8px;
    padding: 8px 9px;
    font-size: 13px;
    line-height: 1.25;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  button.active {
    background: #2d3f68;
    border-color: #6fa2ff;
  }

  .badge {
    min-width: 20px;
    height: 20px;
    border-radius: 999px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #4f86e8;
    color: #f3f8ff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    border: 1px solid #7aa8f6;
  }
</style>
