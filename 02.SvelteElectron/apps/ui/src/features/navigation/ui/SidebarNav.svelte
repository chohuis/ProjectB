<script lang="ts">
  import type { MainTabId } from "../../../shared/types/main";
  import { t } from "../../../shared/i18n";
  import { NAV_GROUP_BREAK_AFTER } from "../../../shared/utils/navVisibility";
  import SettingsModal from "../../settings/ui/SettingsModal.svelte";
  import { nextPendingAction } from "../../../shared/stores/season";
  import { advancingStore } from "../../../shared/stores/uiLock";

  export let currentTab: MainTabId;
  /** 보이는 탭 — 노출 판정의 정본은 `utils/navVisibility`다 */
  export let tabs: MainTabId[] = [];
  export let unreadMessageCount = 0;
  export let pendingAchievementCount = 0;
  export let pendingByTab: Partial<Record<MainTabId, number>> = {};
  export let militaryCountdownLabel = "";
  export let onSelectTab: (tab: MainTabId) => void;

  /**
   * **진행 중이거나 경기 차례면 탭을 잠근다** (사용자 확정 2026-08-28).
   *
   * 🔴 예전엔 "다음 주 진행"을 누른 뒤에도 탭이 눌렸다 — 진행이 끝나기 전에
   *   화면을 바꾸면 반쯤 갱신된 상태를 본다. 경기 차례에도 마찬가지였다.
   *
   * ⚠ **여기서 판정을 만들지 않는다.** 진행 여부는 `advancingStore`가,
   *   경기 차례인지는 `nextPendingAction`이 이미 안다.
   */
  $: locked = $advancingStore || $nextPendingAction?.type === "game";

  let settingsOpen = false;

  const LABEL_KEY: Record<MainTabId, string> = {
    military: "nav.military",
    news: "nav.news",
    me: "nav.me",
    team: "nav.team",
    league: "nav.league",
    people: "nav.people",
    schedule: "nav.schedule",
  };

  /** 배지 — 안 읽은 소식은 소식에, 미확인 업적은 "나"에 붙는다(업적이 그 안에 있으므로) */
  function badgeOf(id: MainTabId): { n: number; kind: "info" | "gold" } | null {
    if (id === "news" && unreadMessageCount > 0) return { n: unreadMessageCount, kind: "info" };
    if (id === "me" && pendingAchievementCount > 0)
      return { n: pendingAchievementCount, kind: "gold" };
    return null;
  }
</script>

<nav class="nav">
  <div class="list">
    {#if militaryCountdownLabel}
      <div class="military">{militaryCountdownLabel}</div>
    {/if}

    {#each tabs as id (id)}
      {@const badge = badgeOf(id)}
      {@const pending = pendingByTab[id] ?? 0}
      <button
        class="tab"
        class:on={id === currentTab}
        class:locked
        type="button"
        disabled={locked}
        on:click={() => onSelectTab(id)}
      >
        <span class="label">{$t(LABEL_KEY[id])}</span>
        {#if pending > 0}
          <strong class="badge red">{pending > 99 ? "99+" : pending}</strong>
        {:else if badge}
          <strong class="badge" class:gold={badge.kind === "gold"}
            >{badge.n > 99 ? "99+" : badge.n}</strong
          >
        {/if}
      </button>
      <!-- "나"와 "세계"를 가르는 선. 글자를 안 늘리면서 성격이 갈리는 걸 보여준다 -->
      {#if id === NAV_GROUP_BREAK_AFTER}<div class="split"></div>{/if}
    {/each}
  </div>

  <div class="settings">
    <button
      class="gear"
      type="button"
      on:click={() => (settingsOpen = true)}
      aria-label={$t("settings.title")}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 0 0 .12-.63l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.07 7.07 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.49.42l-.38 2.65c-.61.24-1.17.56-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.63L4.57 11c-.05.32-.07.65-.07 1s.03.68.08 1l-2.11 1.65a.5.5 0 0 0-.12.63l2 3.46a.5.5 0 0 0 .61.22l2.49-1c.52.42 1.08.75 1.69.99l.38 2.64a.5.5 0 0 0 .49.42h4a.5.5 0 0 0 .49-.42l.38-2.64c.61-.24 1.17-.57 1.69-.99l2.49 1a.5.5 0 0 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.63L19.43 13zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"
        ></path>
      </svg>
    </button>
  </div>
</nav>

<SettingsModal open={settingsOpen} on:close={() => (settingsOpen = false)} />

<style>
  .nav {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--radius);
    padding: 12px 10px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-content: start;
    min-height: 0;
  }

  .military {
    background: var(--panel);
    border-left: 3px solid var(--warn);
    border-radius: var(--radius);
    color: var(--ink-mid);
    padding: 7px 9px;
    font-size: 11.5px;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .tab {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: none;
    border: 0;
    border-left: 3px solid transparent;
    border-radius: 0 var(--radius) var(--radius) 0;
    color: var(--ink-mid);
    font-size: 13.5px;
    text-align: left;
    padding: 9px 10px;
    cursor: pointer;
  }
  .tab:hover:not(:disabled) {
    background: var(--panel);
    color: var(--ink);
  }

  /* 잠김 — 진행 중이거나 경기 차례다. **왜 안 눌리는지 보여야** 한다.
     아무 반응이 없으면 고장으로 읽힌다 */
  .tab.locked {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .tab.locked.on {
    opacity: 0.75;
  }

  /* 선택은 **왼쪽 띠**로 표시한다. 칸 전체를 팀 색으로 채우면 여섯 칸 중
     하나가 늘 어둡게 떠서 지면의 밝은 인상을 깨뜨린다 */
  .tab.on {
    background: var(--panel);
    border-left-color: var(--t-accent);
    color: var(--t-dark);
    font-weight: 800;
  }

  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .split {
    height: 1px;
    background: var(--line);
    margin: 8px 4px 8px 13px;
  }

  .badge {
    min-width: 19px;
    height: 19px;
    border-radius: 999px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--t-dark);
    color: var(--ink-on-dark);
    font-size: 10.5px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .badge.gold {
    background: var(--warn);
  }
  /* 빨강은 **막혀 있다**는 뜻이다 — 처리하기 전엔 주가 안 넘어간다 */
  .badge.red {
    background: var(--bad);
  }

  .settings {
    position: relative;
    display: flex;
  }

  .gear {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
    padding: 0;
  }
  .gear:hover {
    border-color: var(--t-dark);
  }
  .gear svg {
    width: 16px;
    height: 16px;
    fill: var(--ink-mute);
  }
  .gear:hover svg {
    fill: var(--t-dark);
  }
</style>
