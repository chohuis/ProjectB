<script lang="ts">
  import type { MessageCategory, MessageItem } from "../../shared/types/main";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";

  type FilterId = "all" | "unread" | MessageCategory;

  interface CatConfig { label: string; accent: string; bg: string; text: string }

  const CAT: Record<MessageCategory, CatConfig> = {
    system:  { label: "시스템", accent: "#4d6fa3", bg: "#192840", text: "#8fb8e8" },
    news:    { label: "뉴스",   accent: "#b07c18", bg: "#28200a", text: "#e0b870" },
    coach:   { label: "코치",   accent: "#2870bf", bg: "#0d2038", text: "#7ab8f0" },
    manager: { label: "감독",   accent: "#7c3aed", bg: "#1c1040", text: "#c4a0f8" },
  };

  const FILTERS: Array<{ id: FilterId; label: string }> = [
    { id: "all",     label: "전체"     },
    { id: "unread",  label: "읽지 않음" },
    { id: "coach",   label: "코치"     },
    { id: "manager", label: "감독"     },
    { id: "news",    label: "뉴스"     },
    { id: "system",  label: "시스템"   },
  ];

  let activeFilter: FilterId = "all";
  let selectedId: string | null = null;
  let sortAsc = false;

  $: msgs = $gameStore.mailbox;

  $: counts: Record<FilterId, number> = {
    all:     msgs.length,
    unread:  msgs.filter((m) => m.readAt === null).length,
    system:  msgs.filter((m) => m.category === "system").length,
    news:    msgs.filter((m) => m.category === "news").length,
    coach:   msgs.filter((m) => m.category === "coach").length,
    manager: msgs.filter((m) => m.category === "manager").length,
  };

  $: filtered = msgs.filter((m) => {
    if (activeFilter === "all")    return true;
    if (activeFilter === "unread") return m.readAt === null;
    return m.category === activeFilter;
  });

  // 미결 선택지 → 최상단 고정 / 나머지 정렬
  $: pending = filtered.filter((m) => m.decision?.selectedOptionId === null);
  $: rest    = filtered.filter((m) => !m.decision || m.decision.selectedOptionId !== null);
  $: sorted  = [...pending, ...(sortAsc ? [...rest].reverse() : rest)];

  $: selected = selectedId ? msgs.find((m) => m.id === selectedId) ?? null : null;

  function open(msg: MessageItem) {
    selectedId = msg.id;
    if (msg.readAt === null && !(msg.decision && msg.decision.selectedOptionId === null)) {
      gameStore.markMessageRead(msg.id);
    }
  }

  function close() { selectedId = null; }

  async function choose(optionId: string) {
    if (!selected) return;
    gameStore.resolveDecision(selected.id, optionId);
    seasonStore.resolvePendingAction("message", selected.id);
    await gameStore.save();
  }

  // effectHint에서 양수/음수 판단 (+숫자 / -숫자 패턴)
  function effectTone(hint: string): "pos" | "neg" | "mixed" | "none" {
    const hasPos = /\+\d/.test(hint);
    const hasNeg = /-\d/.test(hint);
    if (hasPos && hasNeg) return "mixed";
    if (hasPos) return "pos";
    if (hasNeg) return "neg";
    return "none";
  }
</script>

<section class="page">
  <header class="page-head">
    <h2>수신함</h2>
    <div class="sort-toggle">
      <button
        class="sort-btn"
        class:active={!sortAsc}
        on:click={() => (sortAsc = false)}
        type="button"
      >최신순</button>
      <button
        class="sort-btn"
        class:active={sortAsc}
        on:click={() => (sortAsc = true)}
        type="button"
      >오래된순</button>
    </div>
  </header>

  <div class="inbox">
    <div class="filter-row">
      {#each FILTERS as f}
        <button
          class="filter-btn"
          class:active={activeFilter === f.id}
          on:click={() => (activeFilter = f.id)}
          type="button"
        >
          {f.label}
          {#if counts[f.id] > 0}
            <span class="cnt">{counts[f.id]}</span>
          {/if}
        </button>
      {/each}
    </div>

    <ul class="mail-list">
      {#if sorted.length === 0}
        <li class="empty">표시할 메시지가 없습니다.</li>
      {:else}
        {#each sorted as msg (msg.id)}
          {@const cat = CAT[msg.category]}
          {@const isPending = msg.decision?.selectedOptionId === null}
          <li>
            <button
              class="mail-item"
              class:unread={msg.readAt === null}
              class:pending={isPending}
              style="--accent:{cat.accent}"
              on:click={() => open(msg)}
              type="button"
            >
              <div class="item-head">
                <span
                  class="cat-badge"
                  style="background:{cat.bg}; color:{cat.text}; border-color:{cat.accent}"
                >{cat.label}</span>
                <span class="sender">{msg.sender}</span>
                <span class="spacer"></span>
                <span class="time">{msg.createdAt}</span>
              </div>
              <div class="item-subject">
                {#if msg.readAt === null}<span class="dot" aria-hidden="true"></span>{/if}
                <span class="subject-text">{msg.subject}</span>
              </div>
              <div class="item-preview">{msg.preview}</div>
              {#if isPending}
                <span class="chip chip-pending">선택 대기</span>
              {:else if msg.decision?.selectedOptionId}
                <span class="chip chip-done">선택 완료</span>
              {/if}
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  </div>

  {#if selected}
    {@const cat = CAT[selected.category]}
    {@const dec = selected.decision}
    <div class="backdrop" role="presentation" on:click={close}></div>
    <article class="modal" role="dialog" aria-modal="true" aria-label="메시지 상세">

      <header class="modal-head" style="border-bottom-color:{cat.accent}20">
        <span
          class="modal-cat"
          style="background:{cat.bg}; color:{cat.text}; border-color:{cat.accent}"
        >{cat.label}</span>
        <p class="modal-title">{selected.subject}</p>
        <button class="close-btn" type="button" on:click={close}>✕</button>
      </header>

      <p class="modal-meta">{selected.sender} · {selected.createdAt}</p>

      <div class="modal-body">
        {#each selected.body.split("\n") as line}
          <p>{line || " "}</p>
        {/each}
      </div>

      {#if dec}
        <section class="dec-panel">
          <p class="dec-prompt">{dec.prompt}</p>

          {#if dec.selectedOptionId === null}
            <div class="dec-options">
              {#each dec.options as opt}
                {@const tone = effectTone(opt.effectHint)}
                <button
                  class="opt-btn tone-{tone}"
                  type="button"
                  on:click={() => choose(opt.id)}
                >
                  <span class="opt-label">{opt.label}</span>
                  {#if opt.effectHint}
                    <span class="opt-hint">{opt.effectHint}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {:else}
            {@const chosen = dec.options.find((o) => o.id === dec.selectedOptionId)}
            <div class="dec-result">
              <span class="result-check">✓</span>
              <span class="result-label">{chosen?.label}</span>
              {#if chosen?.effectHint}
                <span class="result-hint">{chosen.effectHint}</span>
              {/if}
            </div>
          {/if}
        </section>
      {/if}

    </article>
  {/if}
</section>

<style>
  /* ── 페이지 레이아웃 ──────────────────────────────────────────── */
  .page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  h2 { margin: 0; font-size: 22px; color: #f0f6ff; }

  /* ── 정렬 토글 ───────────────────────────────────────────────── */
  .sort-toggle {
    display: flex;
    gap: 4px;
  }

  .sort-btn {
    border: 1px solid #2d4268;
    background: #14213a;
    color: #8ea7d3;
    border-radius: 6px;
    font-size: 12px;
    padding: 4px 10px;
    cursor: pointer;
  }

  .sort-btn.active {
    background: #243d6a;
    border-color: #4d79c0;
    color: #d8ecff;
  }

  /* ── 인박스 카드 ─────────────────────────────────────────────── */
  .inbox {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
    min-height: 0;
  }

  /* ── 필터 행 ─────────────────────────────────────────────────── */
  .filter-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .filter-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #2d4268;
    background: #14213a;
    color: #9db7de;
    border-radius: 999px;
    font-size: 12px;
    padding: 4px 10px;
    cursor: pointer;
  }

  .filter-btn.active {
    background: #243d6a;
    border-color: #5580c8;
    color: #e0eeff;
  }

  .cnt {
    background: #2a3e68;
    color: #8fb8e8;
    border-radius: 999px;
    font-size: 10px;
    padding: 1px 5px;
    line-height: 1.4;
  }

  .filter-btn.active .cnt {
    background: #3a5590;
    color: #c4daff;
  }

  /* ── 메일 목록 ───────────────────────────────────────────────── */
  .mail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    gap: 8px;
    align-content: start;
  }

  .empty {
    color: #6a86b8;
    padding: 12px 4px;
    font-size: 14px;
  }

  /* ── 메일 아이템 ─────────────────────────────────────────────── */
  .mail-item {
    width: 100%;
    border: 1px solid #2d4268;
    border-left: 3px solid var(--accent);
    background: #0f1c31;
    border-radius: 8px;
    padding: 10px 12px;
    cursor: pointer;
    text-align: left;
    display: grid;
    gap: 4px;
    transition: background 0.1s;
  }

  .mail-item:hover { background: #172540; }

  .mail-item.unread {
    background: #131f38;
    border-color: #3a5a90;
  }

  .mail-item.pending {
    border-color: #8a6010;
    border-left-color: #d4900a;
    background: #1a1508;
  }

  .mail-item.pending:hover { background: #221c08; }

  .item-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .cat-badge {
    border: 1px solid;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    flex: 0 0 auto;
  }

  .sender {
    color: #b0c8e8;
    font-size: 12px;
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spacer { flex: 1; }

  .time {
    color: #6a86b8;
    font-size: 11px;
    white-space: nowrap;
    flex: 0 0 auto;
  }

  .item-subject {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #6ca8ff;
    flex: 0 0 auto;
  }

  .subject-text {
    font-size: 14px;
    font-weight: 700;
    color: #e8f2ff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-preview {
    color: #7a96c0;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip {
    width: fit-content;
    border-radius: 999px;
    font-size: 11px;
    padding: 2px 8px;
    border: 1px solid;
  }

  .chip-pending {
    border-color: #b07010;
    background: #2a1c04;
    color: #f0c060;
  }

  .chip-done {
    border-color: #3a7a5a;
    background: #0f2a1e;
    color: #80e0b0;
  }

  /* ── 모달 백드롭 ─────────────────────────────────────────────── */
  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(4, 8, 20, 0.75);
    z-index: 5;
  }

  /* ── 모달 ────────────────────────────────────────────────────── */
  .modal {
    position: absolute;
    z-index: 6;
    inset: 4% 6%;
    background: #0d1b34;
    border: 1px solid #304d7a;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    max-height: 92%;
  }

  .modal-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid #1e3050;
  }

  .modal-cat {
    flex: 0 0 auto;
    border: 1px solid;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
  }

  .modal-title {
    flex: 1;
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: #eef4ff;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close-btn {
    flex: 0 0 auto;
    border: 1px solid #2e4870;
    background: #182d50;
    color: #a0b8d8;
    border-radius: 6px;
    width: 28px;
    height: 28px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover { background: #213d6a; color: #d8eaff; }

  .modal-meta {
    flex: 0 0 auto;
    padding: 8px 16px;
    color: #6888b4;
    font-size: 12px;
    border-bottom: 1px solid #162440;
  }

  /* ── 모달 본문 (스크롤) ──────────────────────────────────────── */
  .modal-body {
    flex: 1 1 0;
    overflow-y: auto;
    padding: 14px 16px;
  }

  .modal-body p {
    margin: 0 0 10px;
    color: #c8dcf8;
    font-size: 14px;
    line-height: 1.65;
  }

  .modal-body p:last-child { margin-bottom: 0; }

  /* ── 선택지 패널 (하단 고정) ─────────────────────────────────── */
  .dec-panel {
    flex: 0 0 auto;
    border-top: 1px solid #1e3050;
    padding: 12px 16px 16px;
    display: grid;
    gap: 10px;
  }

  .dec-prompt {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #b8d0f0;
  }

  .dec-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 8px;
  }

  .opt-btn {
    border-radius: 8px;
    padding: 9px 12px;
    cursor: pointer;
    text-align: left;
    display: grid;
    gap: 3px;
    transition: background 0.1s, border-color 0.1s;
  }

  /* 톤별 색상 */
  .tone-pos  { background: #0d2418; border: 1px solid #2a5c38; }
  .tone-neg  { background: #1e0d10; border: 1px solid #5c2030; }
  .tone-mixed{ background: #1a1508; border: 1px solid #5c4010; }
  .tone-none { background: #101e38; border: 1px solid #2a4070; }

  .tone-pos:hover  { background: #112e1e; border-color: #3a7a4a; }
  .tone-neg:hover  { background: #261018; border-color: #7a2840; }
  .tone-mixed:hover{ background: #221c08; border-color: #7a5418; }
  .tone-none:hover { background: #162844; border-color: #3a5898; }

  .opt-label {
    font-size: 13px;
    font-weight: 600;
    color: #e0ecff;
  }

  .opt-hint {
    font-size: 11px;
    color: #7a98c4;
  }

  .tone-pos  .opt-hint { color: #70c090; }
  .tone-neg  .opt-hint { color: #d08080; }
  .tone-mixed .opt-hint{ color: #c0a040; }

  /* ── 선택 완료 결과 ──────────────────────────────────────────── */
  .dec-result {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #0d2418;
    border: 1px solid #2a5c38;
    border-radius: 8px;
  }

  .result-check {
    color: #60c880;
    font-size: 14px;
    flex: 0 0 auto;
  }

  .result-label {
    font-size: 13px;
    font-weight: 600;
    color: #c0e8d8;
  }

  .result-hint {
    font-size: 12px;
    color: #70a890;
    margin-left: auto;
  }
</style>
