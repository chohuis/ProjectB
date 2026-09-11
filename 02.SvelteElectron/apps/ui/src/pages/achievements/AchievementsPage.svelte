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
    strikeoutTotal: (t) => `누적 삼진 ${t}개 달성`,
    saveTotal: (t) => `누적 세이브 ${t}개 달성`,
    winsTotal: (t) => `누적 승리 ${t}회 달성`,
    gamesPlayedTotal: (t) => `경기 ${t}회 출전`,
    messagesReadTotal: (t) => `메시지 ${t}개 읽기`,
    // 이벤트 등급 업적 (2026-09-08 · §9 · C 4-5). **정의는 데이터(B)** 이고
    // 여기 있는 것은 설명 문장뿐이다 — 키가 없으면 아래 `desc` 가 「조건 달성」이다
    eventUniqueTotal: (t) => (t === 1 ? "유니크 이벤트를 처음 만나기" : `유니크 이벤트 ${t}회`),
    eventHiddenTotal: (t) => `히든 이벤트 ${t}회`,
    eventRareSeasonMax: (t) => `한 시즌에 레어 이벤트 ${t}회`,
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
      const claimed = !!rt?.claimedAt;
      const pct = Math.min((progress / d.targetValue) * 100, 100);
      return { ...d, progress, unlocked, claimed, pct, unlockedAt: rt?.unlockedAt ?? null };
    })
    .filter((x) => category === "all" || x.category === category);

  $: totalActive = $masterStore.achievements.filter((d) => d.status === "active").length;
  $: doneCount = items.filter((x) => x.unlocked).length;
  $: claimable = items.filter((x) => x.unlocked && !x.claimed).length;
</script>

<!-- ⚠ 제목("업적")을 뺐다 — "나"의 상위 탭이 이미 그 이름이다 -->
<section class="page">
  <header class="head">
    <div class="u-subtabs">
      {#each ["all", "baseball", "growth", "social", "hidden"] as Category[] as c}
        <button class:on={category === c} on:click={() => (category = c)}>
          {CAT_LABELS[c]}
        </button>
      {/each}
    </div>
    <div class="counts">
      <span class="cnt"><i>달성</i><b class="u-num">{doneCount}</b><s>/ {totalActive}</s></span>
      {#if claimable > 0}
        <span class="cnt warn"><i>미수령</i><b class="u-num">{claimable}</b></span>
      {/if}
    </div>
  </header>

  <div class="list">
    {#each items as a (a.id)}
      {@const isHiddenLocked = !!a.hidden && !a.unlocked}
      <article class="item" class:unlocked={a.unlocked}>
        <div class="row-title">
          <span class="badge-status" class:done={a.unlocked} class:claimed={a.claimed}>
            {a.claimed ? "수령 완료" : a.unlocked ? "달성" : "진행중"}
          </span>
          <strong class="title">{isHiddenLocked ? "???" : a.title}</strong>
          {#if a.reward && a.unlocked}
            <span class="reward-tag">{a.reward}</span>
          {/if}
        </div>

        <p class="item-desc">
          {isHiddenLocked ? "숨겨진 업적입니다." : desc(a.metricKey, a.targetValue)}
        </p>

        <div class="progress-row">
          <div class="bar-wrap">
            <div class="bar-fill" style="width:{a.pct}%"></div>
          </div>
          <span class="prog-text">{Math.min(a.progress, a.targetValue)} / {a.targetValue}</span>
        </div>

        {#if a.unlocked && !a.claimed}
          <button
            class="btn-claim"
            on:click={() => {
              gameStore.claimAchievement(a.id);
              gameStore.save();
            }}
          >
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
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    overflow: hidden;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .counts {
    display: flex;
    gap: 14px;
    align-items: baseline;
  }
  .cnt {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }
  .cnt i {
    font-style: normal;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: var(--ink-mute);
  }
  .cnt b {
    font-size: 15px;
    font-weight: 800;
    color: var(--ink);
  }
  .cnt s {
    text-decoration: none;
    font-size: 11px;
    color: var(--ink-mute);
  }
  .cnt.warn b {
    color: var(--warn);
  }

  .list {
    min-height: 0;
    overflow-y: auto;
    display: grid;
    gap: 6px;
    align-content: start;
    padding-right: 2px;
  }

  .item {
    background: var(--panel);
    border-left: 3px solid var(--line-strong);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.14);
    padding: 10px 13px;
    display: grid;
    gap: 6px;
  }
  /* 달성한 줄만 초록 띠 — 목록을 훑을 때 끝난 것과 남은 것이 즉시 갈린다 */
  .item.unlocked {
    border-left-color: var(--ok);
  }

  .row-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge-status {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    border-radius: 2px;
    background: var(--panel-sunk);
    color: var(--ink-mute);
    white-space: nowrap;
  }
  .badge-status.done {
    background: var(--ok);
    color: var(--ink-on-dark);
  }
  .badge-status.claimed {
    background: var(--panel-sunk);
    color: var(--ink-mid);
  }

  .title {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
    flex: 1;
  }

  .reward-tag {
    font-size: 10.5px;
    background: var(--panel-sunk);
    border-radius: 2px;
    padding: 2px 7px;
    color: var(--ink-mid);
    white-space: nowrap;
  }

  .item-desc {
    margin: 0;
    font-size: 12px;
    color: var(--ink-mute);
  }

  .progress-row {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .bar-wrap {
    flex: 1;
    height: 5px;
    background: var(--panel-sunk);
    border-radius: 3px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--t-dark);
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .item.unlocked .bar-fill {
    background: var(--ok);
  }

  .prog-text {
    font-size: 11px;
    color: var(--ink-mute);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    min-width: 52px;
    text-align: right;
  }

  /* 받을 게 남아 있다는 건 "챙길 것"이다 — 팀 색이 아니라 고정 의미색 */
  .btn-claim {
    align-self: start;
    background: var(--warn);
    border: 0;
    color: var(--ink-on-dark);
    border-radius: var(--radius);
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .btn-claim:hover {
    filter: brightness(1.1);
  }

  .claimed-label {
    font-size: 11px;
    color: var(--ok);
    font-weight: 700;
  }

  .empty {
    margin: 24px auto;
    color: var(--ink-mute);
    font-size: 13px;
  }

  @media (prefers-reduced-motion: reduce) {
    .bar-fill {
      transition: none;
    }
  }
</style>
