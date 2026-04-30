<script lang="ts">
  import type { MainTabId } from "../../../shared/types/main";
  import { language, languageOptions, t, type Language } from "../../../shared/i18n";

  export let currentTab: MainTabId;
  export let unreadMessageCount = 0;
  export let pendingAchievementCount = 0;
  export let showAcademicsTab = false;
  export let onSelectTab: (tab: MainTabId) => void;
  let settingsOpen = false;

  const tabs: { id: MainTabId; labelKey: string }[] = [
    { id: "home", labelKey: "nav.home" },
    { id: "messages", labelKey: "nav.messages" },
    { id: "messenger", labelKey: "nav.messenger" },
    { id: "status", labelKey: "nav.status" },
    { id: "team", labelKey: "nav.team" },
    { id: "roster", labelKey: "nav.roster" },
    { id: "schedule", labelKey: "nav.schedule" },
    { id: "training", labelKey: "nav.training" },
    { id: "finance", labelKey: "nav.finance" },
    { id: "test", labelKey: "nav.matchEngine" },
    { id: "records", labelKey: "nav.records" },
    { id: "achievements", labelKey: "nav.achievements" },
    { id: "academics", labelKey: "nav.academics" }
  ];

  // 학업 단계가 아닐 때는 학업 탭을 숨긴다.
  $: visibleTabs = showAcademicsTab ? tabs : tabs.filter((tab) => tab.id !== "academics");

  // 언어 변경 시 즉시 반영하고 팝업을 닫는다.
  function setLanguage(next: Language) {
    if (next === "ko" || next === "en") {
      language.set(next);
      settingsOpen = false;
    }
  }

  // 설정 버튼 토글 (이벤트 버블링 차단)
  function toggleSettings(event: MouseEvent) {
    event.stopPropagation();
    settingsOpen = !settingsOpen;
  }

  // 외부 클릭/ESC 입력 시 설정 팝업 닫기
  function closeSettings() {
    settingsOpen = false;
  }
</script>

<svelte:window on:click={closeSettings} on:keydown={(e) => e.key === "Escape" && closeSettings()} />

<nav class="nav">
  <div class="tab-list">
    {#each visibleTabs as tab}
      <button class:active={tab.id === currentTab} on:click={() => onSelectTab(tab.id)}>
        <span>{$t(tab.labelKey)}</span>
        {#if tab.id === "messages" && unreadMessageCount > 0}
          <strong class="badge">{unreadMessageCount > 99 ? "99+" : unreadMessageCount}</strong>
        {/if}
        {#if tab.id === "achievements" && pendingAchievementCount > 0}
          <strong class="badge badge-gold">{pendingAchievementCount > 99 ? "99+" : pendingAchievementCount}</strong>
        {/if}
      </button>
    {/each}
  </div>

  <div class="settings-wrap" on:click|stopPropagation>
    <button class="icon-button" type="button" on:click={toggleSettings} aria-label={$t("header.language")}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 0 0 .12-.63l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.07 7.07 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.49.42l-.38 2.65c-.61.24-1.17.56-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.63L4.57 11c-.05.32-.07.65-.07 1s.03.68.08 1l-2.11 1.65a.5.5 0 0 0-.12.63l2 3.46a.5.5 0 0 0 .61.22l2.49-1c.52.42 1.08.75 1.69.99l.38 2.64a.5.5 0 0 0 .49.42h4a.5.5 0 0 0 .49-.42l.38-2.64c.61-.24 1.17-.57 1.69-.99l2.49 1a.5.5 0 0 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.63L19.43 13zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"
        ></path>
      </svg>
    </button>
    {#if settingsOpen}
      <section class="settings-popup" role="dialog" aria-label={$t("header.language")}>
        <p>{$t("header.language")}</p>
        <div class="language-options">
          {#each languageOptions as option}
            <button type="button" class:active={$language === option.id} on:click={() => setLanguage(option.id)}>
              {option.label}
            </button>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</nav>

<style>
  .nav {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 8px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .tab-list {
    display: grid;
    gap: 6px;
    align-content: start;
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

  .badge-gold {
    background: #b87800;
    border-color: #e8a820;
    color: #fff8e0;
  }

  .settings-wrap {
    position: relative;
    display: flex;
    justify-content: flex-start;
  }

  .icon-button {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #1d2840;
    color: #e8eefc;
    border: 1px solid #395074;
    border-radius: 8px;
    cursor: pointer;
    padding: 0;
  }

  .icon-button svg {
    width: 18px;
    height: 18px;
    fill: #d5e3fd;
  }

  .settings-popup {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    width: 150px;
    border: 1px solid #355182;
    background: #142540;
    border-radius: 10px;
    padding: 8px;
    z-index: 20;
    display: grid;
    gap: 8px;
  }

  .settings-popup p {
    margin: 0;
    color: #9eb4d8;
    font-size: 12px;
  }

  .language-options {
    display: grid;
    gap: 6px;
  }

  .language-options button {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .language-options button.active {
    background: #3262b0;
    border-color: #6da1f7;
  }
</style>
