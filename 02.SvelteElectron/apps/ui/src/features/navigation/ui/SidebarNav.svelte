<script lang="ts">
  import type { MainTabId } from "../../../shared/types/main";

  export let currentTab: MainTabId;
  export let onSelectTab: (tab: MainTabId) => void;

  const tabs: { id: MainTabId; label: string }[] = [
    { id: "home", label: "홈" },
    { id: "roster", label: "로스터" },
    { id: "schedule", label: "일정" },
    { id: "training", label: "훈련" },
    { id: "finance", label: "재정" },
    { id: "test", label: "매치 엔진" },
    { id: "records", label: "기록" },
    { id: "messages", label: "메시지" },
    { id: "team", label: "팀" }
  ];
</script>

<nav class="nav">
  {#each tabs as tab}
    <button class:active={tab.id === currentTab} on:click={() => onSelectTab(tab.id)}>
      {tab.label}
    </button>
  {/each}
</nav>

<style>
  .nav {
    display: grid;
    gap: 8px;
  }

  button {
    background: #1c2438;
    color: #e8eefc;
    border: 1px solid #2e3b58;
    border-radius: 8px;
    padding: 10px;
    text-align: left;
    cursor: pointer;
  }

  button.active {
    background: #2d3f68;
    border-color: #6fa2ff;
  }
</style>
