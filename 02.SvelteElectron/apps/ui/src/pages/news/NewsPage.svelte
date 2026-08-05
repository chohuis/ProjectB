<script lang="ts">
  import type { MessageCategory, MessageItem, Top10Metadata, TrainingMetadata } from "../../shared/types/main";
  import { applyDecision } from "../../shared/usecases/decisions";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { teamMap } from "../../shared/stores/master";
  import { categoryMeta, CATEGORY_ORDER } from "../../shared/utils/messageCategory";
  import { recentResults, gaugeTone } from "../../shared/utils/myStatus";
  import TrainingStatBars from "../../features/messages/ui/TrainingStatBars.svelte";
  import ProspectTop10Panel from "../../features/messages/ui/ProspectTop10Panel.svelte";
  import TeamMark from "../../features/team/ui/TeamMark.svelte";

  /**
   * C1 소식 — 홈 대시보드와 수신함을 하나로 합친 화면.
   *
   * 둘을 나눠 두면 **같은 걸 두 번 본다.** 대시보드의 "선택 대기 메시지 N건"은
   * 수신함으로 가라는 안내였고, 대시보드의 컨디션·피로·순위 KPI 다섯 개는
   * 이제 우측 패널(B3)에 상시로 떠 있다.
   *
   * 그래서 여기 남는 건 **읽을 거리(메시지)와 챙길 것(경고)** 둘이다.
   *
   * ⚠ 홈 대시보드의 "부상위험 %"는 옮기지 않았다. `(피로-55)*0.9`로 UI가
   * 지어낸 값이라 엔진의 부상 판정과 아무 관계가 없었다 — 피로 게이지가
   * 이미 우측 패널에 있으므로 같은 정보를 가짜 확률로 포장할 이유가 없다.
   */

  type FilterId = "all" | "unread" | MessageCategory;

  let activeFilter: FilterId = "all";
  let selectedId: string | null = null;
  let sortAsc = false;

  $: msgs = $gameStore.mailbox;
  $: p = $gameStore.protagonist;

  $: counts = {
    all:     msgs.length,
    unread:  msgs.filter((m) => m.readAt === null).length,
    system:  msgs.filter((m) => m.category === "system").length,
    news:    msgs.filter((m) => m.category === "news").length,
    coach:   msgs.filter((m) => m.category === "coach").length,
    manager: msgs.filter((m) => m.category === "manager").length,
  } as Record<FilterId, number>;

  $: FILTERS = [
    { id: "all" as FilterId,    label: "전체" },
    { id: "unread" as FilterId, label: "안 읽음" },
    ...CATEGORY_ORDER.map((c) => ({ id: c as FilterId, label: categoryMeta(c).label })),
  ];

  $: filtered = msgs.filter((m) => {
    if (activeFilter === "all")    return true;
    if (activeFilter === "unread") return m.readAt === null;
    return m.category === activeFilter;
  });

  // 미결 선택지는 정렬과 무관하게 항상 위 — 게임이 멈춰 있는 이유이기 때문이다
  $: pendingMsgs = filtered.filter((m) => m.decision?.selectedOptionId === null);
  $: rest    = filtered.filter((m) => !m.decision || m.decision.selectedOptionId !== null);
  $: sorted  = [...pendingMsgs, ...(sortAsc ? [...rest].reverse() : rest)];

  $: selected = selectedId ? msgs.find((m) => m.id === selectedId) ?? null : null;

  $: unreadNonDecisionCount = msgs.filter(
    (m) => m.readAt === null && !(m.decision?.selectedOptionId === null),
  ).length;

  // ── 챙길 것 ──
  // ⚠ 경계는 `gaugeTone` 하나다. 예전 대시보드는 자기 표(피로>70·사기<40·
  // 컨디션<50)를 따로 들고 있어서 우측 패널 게이지가 빨간데 경고는 없는
  // 구간이 생겼다.
  $: alerts = [
    ...($gameStore.schoolState.eligibilityBlocked
      ? [{ tone: "bad" as const, text: "학사 경고 — 이번 주 경기 출전 정지" }] : []),
    ...(gaugeTone(p.fatigue, true) === "bad"
      ? [{ tone: "bad" as const, text: `피로 ${p.fatigue} — 훈련 강도를 낮추는 게 좋다` }] : []),
    ...(gaugeTone(p.condition) === "bad"
      ? [{ tone: "bad" as const, text: `컨디션 ${p.condition} — 회복에 집중할 시점` }] : []),
    ...(gaugeTone(p.morale) === "bad"
      ? [{ tone: "warn" as const, text: `사기 ${p.morale} — 반등할 계기가 필요하다` }] : []),
    ...(pendingMsgs.length > 0
      ? [{ tone: "warn" as const, text: `선택을 기다리는 소식 ${pendingMsgs.length}건` }] : []),
  ];

  // ── 옆단: 최근 경기 · 예정 ──
  $: recent = recentResults($seasonStore.schedule, p.teamId, 5);

  $: isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(p.careerStage);
  $: hasRemainingGames = $seasonStore.schedule.some(
    (e) => !e.result && !e.isFriendly && (e.phase === "season" || e.phase === "postseason"),
  );
  $: isOffseason = isProStage && !hasRemainingGames && $seasonStore.currentWeek > 0;
  $: pendingNextTeam = p.pendingNextContract
    ? ($teamMap.get(p.pendingNextContract.teamId)?.name ?? p.pendingNextContract.teamId)
    : null;

  function tName(id: string): string {
    return $teamMap.get(id)?.name ?? id;
  }

  async function markAllRead() {
    gameStore.markAllMessagesRead();
    await gameStore.save();
  }

  function open(msg: MessageItem) {
    selectedId = msg.id;
    if (msg.readAt === null && !(msg.decision && msg.decision.selectedOptionId === null)) {
      gameStore.markMessageRead(msg.id);
    }
  }

  function close() { selectedId = null; }

  /** Esc로 닫는다. `<svelte:window>`는 블록 안에 못 두므로 여기서 열림을 본다 */
  function onEsc(e: KeyboardEvent) {
    if (e.key === "Escape" && selectedId) close();
  }

  async function choose(optionId: string) {
    if (!selected) return;
    void applyDecision(selected.id, optionId);
    seasonStore.resolvePendingAction("message", selected.id);
    await gameStore.save();
    await seasonStore.save();
  }

  /** effectHint의 부호로 색을 정한다 (+3 / -2 같은 표기) */
  function effectTone(hint: string): "pos" | "neg" | "mixed" | "none" {
    const hasPos = /\+\d/.test(hint);
    const hasNeg = /-\d/.test(hint);
    if (hasPos && hasNeg) return "mixed";
    if (hasPos) return "pos";
    if (hasNeg) return "neg";
    return "none";
  }
</script>

<svelte:window on:keydown={onEsc} />

<section class="news">
  <!-- ── 챙길 것 ── -->
  {#if alerts.length > 0}
    <section class="alerts">
      <span class="u-label">챙길 것</span>
      <ul>
        {#each alerts as a}
          <li data-tone={a.tone}>{a.text}</li>
        {/each}
      </ul>
    </section>
  {/if}

  <div class="cols">
    <!-- ── 소식 목록 ── -->
    <section class="feed u-card">
      <header class="feed-head">
        <div class="filters">
          {#each FILTERS as f}
            <button
              class="chip"
              class:on={activeFilter === f.id}
              type="button"
              on:click={() => (activeFilter = f.id)}
            >
              {f.label}{#if counts[f.id] > 0}<span class="cnt u-num">{counts[f.id]}</span>{/if}
            </button>
          {/each}
        </div>
        <div class="feed-tools">
          <button class="tool" type="button" on:click={() => (sortAsc = !sortAsc)}>
            {sortAsc ? "오래된순" : "최신순"}
          </button>
          <button class="tool" type="button" disabled={unreadNonDecisionCount === 0} on:click={markAllRead}>
            모두 읽음
          </button>
        </div>
      </header>

      <ul class="list">
        {#if sorted.length === 0}
          <li class="empty">표시할 소식이 없습니다.</li>
        {:else}
          {#each sorted as msg (msg.id)}
            {@const cat = categoryMeta(msg.category)}
            {@const isPending = msg.decision?.selectedOptionId === null}
            <li>
              <button
                class="item"
                class:unread={msg.readAt === null}
                class:pending={isPending}
                style="--cat:{cat.accent}"
                type="button"
                on:click={() => open(msg)}
              >
                <div class="item-head">
                  <span class="cat">{cat.label}</span>
                  <span class="sender">{msg.sender}</span>
                  <span class="grow"></span>
                  {#if isPending}<span class="tag-pending">선택 대기</span>
                  {:else if msg.decision?.selectedOptionId}<span class="tag-done">선택 완료</span>{/if}
                  <span class="time u-num">{msg.createdAt}</span>
                </div>
                <p class="subject">
                  {#if msg.readAt === null}<span class="dot" aria-hidden="true"></span>{/if}{msg.subject}
                </p>
                <p class="preview">{msg.preview}</p>
              </button>
            </li>
          {/each}
        {/if}
      </ul>
    </section>

    <!-- ── 옆단 ── -->
    <aside class="side">
      {#if isOffseason}
        <section class="u-card">
          <span class="u-label">오프시즌</span>
          {#if pendingNextTeam}
            <p class="side-line"><b>{pendingNextTeam}</b> 계약 완료</p>
            <p class="side-sub">W52에 새 시즌이 시작된다</p>
          {:else}
            <p class="side-sub">W43 연봉협상·FA · W50 체육부대 · W52 시즌 시작</p>
          {/if}
        </section>
      {/if}

      <section class="u-card">
        <span class="u-label">최근 경기</span>
        {#if recent.length === 0}
          <p class="side-sub">아직 기록이 없다</p>
        {:else}
          <ul class="recent">
            {#each recent as r}
              <li>
                <span class="wl" data-r={r.drew ? "d" : r.won ? "w" : "l"}>{r.drew ? "무" : r.won ? "승" : "패"}</span>
                <span class="score u-num">{r.my}-{r.opp}</span>
                <TeamMark teamId={r.opponentId} size={16} />
                <span class="opp">{tName(r.opponentId)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="u-card">
        <span class="u-label">예정</span>
        {#if $gameStore.upcoming.length === 0}
          <p class="side-sub">예정된 일정이 없다</p>
        {:else}
          <ul class="upcoming">
            {#each $gameStore.upcoming.slice(0, 4) as item}<li>{item}</li>{/each}
          </ul>
        {/if}
      </section>
    </aside>
  </div>
</section>

<!-- ── 상세 ── -->
{#if selected}
  {@const cat = categoryMeta(selected.category)}
  {@const dec = selected.decision}
  <div class="backdrop" role="presentation" on:click={close}></div>
  <div class="modal" role="dialog" tabindex="-1" aria-modal="true" aria-label="소식 상세" style="--cat:{cat.accent}">
    <header class="m-head">
      <span class="m-cat">{cat.label}</span>
      <p class="m-title">{selected.subject}</p>
      <button class="m-close" type="button" on:click={close} aria-label="닫기">✕</button>
    </header>
    <p class="m-meta">{selected.sender} · {selected.createdAt}</p>

    <div class="m-body">
      {#if selected.metadata?.type === "training"}
        {@const tm = selected.metadata as TrainingMetadata}
        <TrainingStatBars stats={tm.stats} condition={tm.condition} fatigue={tm.fatigue}
                          morale={tm.morale} extraLogs={tm.extraLogs} />
      {:else if selected.metadata?.type === "top10"}
        <ProspectTop10Panel metadata={selected.metadata as Top10Metadata} />
      {:else}
        {#each selected.body.replace(/\\n/g, "\n").split("\n") as line}
          <p>{line || " "}</p>
        {/each}
      {/if}
    </div>

    {#if dec}
      <section class="dec">
        <p class="dec-prompt">{dec.prompt}</p>
        {#if dec.selectedOptionId === null}
          <div class="dec-opts">
            {#each dec.options as opt}
              <button class="opt" data-tone={effectTone(opt.effectHint)} type="button" on:click={() => choose(opt.id)}>
                <span class="opt-label">{opt.label}</span>
                {#if opt.effectHint}<span class="opt-hint">{opt.effectHint}</span>{/if}
              </button>
            {/each}
          </div>
        {:else}
          <!-- ⚠ 예전 화면은 여기에 `{:else if metadata.type === "top10"}` 가지가
               끼어 있어서, **TOP10 소식은 선택을 마쳐도 고른 답이 안 보였다.**
               본문에서 이미 그린 패널을 한 번 더 그리고 있었다 -->
          {@const chosen = dec.options.find((o) => o.id === dec.selectedOptionId)}
          <div class="dec-done">
            <span class="check">✓</span>
            <span class="done-label">{chosen?.label}</span>
            {#if chosen?.effectHint}<span class="done-hint">{chosen.effectHint}</span>{/if}
          </div>
        {/if}
      </section>
    {/if}
  </div>
{/if}

<style>
  .news {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
    border-radius: var(--radius);
    overflow: hidden;
  }

  /* ── 챙길 것 ── */
  .alerts {
    background: var(--panel);
    border-left: 3px solid var(--warn);
    border-radius: var(--radius);
    padding: 9px 12px;
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
  }
  .alerts ul { list-style: none; margin: 5px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 18px; }
  .alerts li { font-size: 12.5px; color: var(--ink-mid); }
  .alerts li::before { content: "·"; margin-right: 6px; font-weight: 700; }
  .alerts li[data-tone="bad"]::before  { color: var(--bad); }
  .alerts li[data-tone="warn"]::before { color: var(--warn); }

  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 10px;
    min-height: 0;
  }

  /* ── 소식 목록 ── */
  .feed {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
    padding: 11px 12px;
  }

  .feed-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .filters { display: flex; gap: 5px; flex-wrap: wrap; }

  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink-mid);
    border-radius: 999px;
    font-size: 12px;
    padding: 4px 11px;
    cursor: pointer;
  }
  .chip:hover { border-color: var(--line-strong); }
  .chip.on { background: var(--t-dark); border-color: var(--t-dark); color: var(--ink-on-dark); }
  .cnt { font-size: 10px; color: var(--ink-mute); }
  .chip.on .cnt { color: var(--t-gold); }

  .feed-tools { display: flex; gap: 5px; }
  .tool {
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-mute);
    border-radius: var(--radius);
    font-size: 11.5px;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tool:hover:not(:disabled) { border-color: var(--t-dark); color: var(--t-dark); }
  .tool:disabled { opacity: 0.35; cursor: default; }

  .list {
    list-style: none; margin: 0; padding: 0;
    min-height: 0; overflow-y: auto;
    display: flex; flex-direction: column; gap: 6px;
  }
  .empty { color: var(--ink-mute); font-size: 13px; padding: 14px 2px; }

  .item {
    width: 100%; text-align: left; cursor: pointer;
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 3px solid var(--cat);
    border-radius: var(--radius);
    padding: 9px 12px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .item:hover { background: var(--panel-sunk); }

  .item-head { display: flex; align-items: baseline; gap: 7px; }
  .cat { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; color: var(--cat); }
  .sender { font-size: 11.5px; color: var(--ink-mute); }
  .grow { flex: 1; }
  .time { font-size: 10.5px; color: var(--ink-mute); }

  .subject {
    margin: 0; font-size: 13.5px; color: var(--ink); font-weight: 600;
    display: flex; align-items: center; gap: 6px;
  }
  .item.unread .subject { font-weight: 800; }
  .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--cat); flex-shrink: 0; }

  .preview {
    margin: 0; font-size: 12px; color: var(--ink-mute);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* 선택 대기는 목록에서 즉시 구분돼야 한다 — 게임이 여기서 멈춰 있다 */
  .item.pending { border-color: var(--warn); background: #FFFBF2; }
  .tag-pending {
    font-size: 10px; font-weight: 800; color: #6B4200;
    background: var(--attn); border-radius: 2px; padding: 1px 6px;
  }
  .tag-done { font-size: 10px; color: var(--ok); font-weight: 700; }

  /* ── 옆단 ── */
  .side { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; }
  .side .u-card { padding: 11px 12px; }
  .side-line { margin: 5px 0 0; font-size: 13px; color: var(--ink); }
  .side-sub { margin: 5px 0 0; font-size: 11.5px; color: var(--ink-mute); line-height: 1.5; }

  .recent { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .recent li { display: flex; align-items: baseline; gap: 7px; font-size: 12px; }
  .wl {
    width: 17px; text-align: center; font-size: 10px; font-weight: 800;
    border-radius: 2px; padding: 1px 0; color: var(--ink-on-dark); flex-shrink: 0;
  }
  .wl[data-r="w"] { background: var(--ok); }
  .wl[data-r="l"] { background: var(--bad); }
  .wl[data-r="d"] { background: var(--ink-mute); }
  .score { font-weight: 700; color: var(--ink); }
  .opp { color: var(--ink-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .upcoming { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
  .upcoming li {
    font-size: 11.5px; color: var(--ink-mid);
    padding-left: 8px; border-left: 2px solid var(--line);
  }

  /* ── 상세 ── */
  .backdrop { position: fixed; inset: 0; background: rgba(10, 18, 34, 0.5); z-index: 90; }
  .modal {
    position: fixed; z-index: 91;
    top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(760px, 92vw); max-height: 84vh;
    background: var(--panel);
    border-top: 4px solid var(--cat);
    border-radius: var(--radius);
    box-shadow: 0 24px 60px -28px rgba(8, 16, 36, 0.75);
    padding: 16px 18px;
    display: flex; flex-direction: column; gap: 8px;
    color: var(--ink);
  }

  .m-head { display: flex; align-items: center; gap: 10px; }
  .m-cat { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; color: var(--cat); }
  .m-title { margin: 0; flex: 1; font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
  .m-close {
    background: none; border: 0; cursor: pointer;
    color: var(--ink-mute); font-size: 14px; padding: 2px 6px;
  }
  .m-close:hover { color: var(--ink); }

  .m-meta { margin: 0; font-size: 11.5px; color: var(--ink-mute); }

  .m-body {
    margin-top: 4px; padding-top: 10px;
    border-top: 1px solid var(--line);
    min-height: 0; overflow-y: auto;
    font-size: 13.5px; line-height: 1.65; color: var(--ink-mid);
  }
  .m-body :global(p) { margin: 0; }

  .dec {
    border-top: 1px solid var(--line);
    padding-top: 11px;
  }
  .dec-prompt { margin: 0 0 9px; font-size: 13px; font-weight: 700; color: var(--ink); }

  .dec-opts { display: flex; flex-direction: column; gap: 6px; }
  .opt {
    display: flex; align-items: baseline; gap: 10px;
    width: 100%; text-align: left; cursor: pointer;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 10px 13px;
    font-size: 13px; color: var(--ink);
  }
  .opt:hover { border-color: var(--t-dark); background: var(--panel-sunk); }
  .opt-label { font-weight: 700; }
  .opt-hint { font-size: 11.5px; margin-left: auto; }
  .opt[data-tone="pos"]   .opt-hint { color: var(--ok); }
  .opt[data-tone="neg"]   .opt-hint { color: var(--bad); }
  .opt[data-tone="mixed"] .opt-hint { color: var(--warn); }
  .opt[data-tone="none"]  .opt-hint { color: var(--ink-mute); }

  .dec-done {
    display: flex; align-items: baseline; gap: 9px;
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 9px 13px;
    font-size: 13px;
  }
  .check { color: var(--ok); font-weight: 800; }
  .done-label { font-weight: 700; color: var(--ink); }
  .done-hint { font-size: 11.5px; color: var(--ink-mute); margin-left: auto; }

  @media (max-width: 1280px) {
    .cols { grid-template-columns: minmax(0, 1fr); }
    .side { flex-direction: row; overflow-x: auto; }
    .side .u-card { flex: 1; min-width: 180px; }
  }
</style>
