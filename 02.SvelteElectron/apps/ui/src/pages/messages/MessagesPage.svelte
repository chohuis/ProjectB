<script lang="ts">
  import type { MessageCategory, MessageItem } from "../../shared/types/main";

  type FilterId = "all" | "unread" | MessageCategory;

  export let messages: MessageItem[] = [];
  export let onReadMessage: (messageId: string) => void = () => {};
  export let onResolveDecision: (messageId: string, optionId: string) => void = () => {};

  const filters: Array<{ id: FilterId; label: string }> = [
    { id: "all", label: "전체" },
    { id: "unread", label: "읽지 않음" },
    { id: "system", label: "시스템" },
    { id: "news", label: "뉴스" },
    { id: "coach", label: "코치" },
    { id: "manager", label: "감독" }
  ];

  const categoryLabel: Record<MessageCategory, string> = {
    system: "시스템",
    news: "뉴스",
    coach: "코치",
    manager: "감독"
  };

  let activeFilter: FilterId = "all";
  let selectedMessageId: string | null = null;

  $: selectedMessage =
    selectedMessageId === null
      ? null
      : messages.find((message) => message.id === selectedMessageId) ?? null;

  $: filteredMessages = messages.filter((message) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "unread") return message.readAt === null;
    return message.category === activeFilter;
  });

  function openMessage(message: MessageItem) {
    selectedMessageId = message.id;
    const waitingDecision =
      message.decision !== undefined && message.decision.selectedOptionId === null;
    if (message.readAt === null && !waitingDecision) {
      onReadMessage(message.id);
    }
  }

  function closeModal() {
    selectedMessageId = null;
  }

  function handleDecision(optionId: string) {
    if (!selectedMessage) return;
    onResolveDecision(selectedMessage.id, optionId);
  }
</script>

<section class="page">
  <h2>메시지</h2>

  <article class="card inbox-card">
    <header class="inbox-header">
      <h3>수신함</h3>
      <p>총 {filteredMessages.length}건</p>
    </header>

    <div class="filter-row">
      {#each filters as filter}
        <button
          class:active={activeFilter === filter.id}
          on:click={() => (activeFilter = filter.id)}
          type="button"
        >
          {filter.label}
        </button>
      {/each}
    </div>

    <ul class="mail-list">
      {#if filteredMessages.length === 0}
        <li class="empty">표시할 메시지가 없습니다.</li>
      {:else}
        {#each filteredMessages as message}
          <li>
            <button
              class="mail-item"
              class:unread={message.readAt === null}
              on:click={() => openMessage(message)}
              type="button"
            >
              <span class="head">
                <span class="meta">
                  <em>[{categoryLabel[message.category]}]</em>
                  <strong>{message.sender}</strong>
                </span>
                <span class="time">{message.createdAt}</span>
              </span>
              <span class="subject">
                {#if message.readAt === null}<i class="dot" aria-hidden="true"></i>{/if}
                <b>{message.subject}</b>
              </span>
              <span class="preview">{message.preview}</span>
              {#if message.decision && message.decision.selectedOptionId === null}
                <span class="decision-chip">선택 대기</span>
              {:else if message.decision && message.decision.selectedOptionId !== null}
                <span class="decision-chip done">선택 완료</span>
              {/if}
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  </article>

  {#if selectedMessage}
    <div class="modal-backdrop" role="presentation" on:click={closeModal}></div>
    <section class="modal" role="dialog" aria-modal="true" aria-label="메시지 상세">
      <header>
        <p class="title">{selectedMessage.subject}</p>
        <button type="button" class="close-btn" on:click={closeModal}>닫기</button>
      </header>
      <p class="sub">
        [{categoryLabel[selectedMessage.category]}] {selectedMessage.sender} · {selectedMessage.createdAt}
      </p>
      <article class="body-text">
        {#each selectedMessage.body.split("\n") as line}
          <p>{line}</p>
        {/each}
      </article>
      {#if selectedMessage.decision}
        <section class="decision-panel">
          <p class="decision-title">{selectedMessage.decision.prompt}</p>
          {#if selectedMessage.decision.selectedOptionId === null}
            <div class="decision-actions">
              {#each selectedMessage.decision.options as option}
                <button type="button" on:click={() => handleDecision(option.id)}>
                  <strong>{option.label}</strong>
                  <span>{option.effect}</span>
                </button>
              {/each}
            </div>
          {:else}
            {@const chosen = selectedMessage.decision.options.find(
              (option) => option.id === selectedMessage.decision?.selectedOptionId
            )}
            <p class="decision-result">
              선택 완료: {chosen?.label} ({chosen?.effect})
            </p>
          {/if}
        </section>
      {/if}
    </section>
  {/if}
</section>

<style>
  .page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 22px;
  }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .inbox-card {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
  }

  .inbox-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .inbox-header p {
    color: #9fb3d9;
    font-size: 13px;
  }

  .filter-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .filter-row button {
    border: 1px solid #355184;
    background: #1f2f4f;
    color: #d8e7ff;
    border-radius: 999px;
    font-size: 12px;
    padding: 4px 10px;
    cursor: pointer;
  }

  .filter-row button.active {
    background: #315ca5;
    border-color: #6d9bf3;
    color: #f1f7ff;
  }

  .mail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    min-height: 0;
    overflow: hidden;
    display: grid;
    gap: 8px;
    align-content: start;
  }

  .empty {
    color: #9fb3d9;
    padding: 10px;
  }

  .mail-item {
    width: 100%;
    border: 1px solid #2d4268;
    background: #14213a;
    border-radius: 10px;
    padding: 10px;
    cursor: pointer;
    text-align: left;
    color: #e3edff;
    display: grid;
    gap: 4px;
  }

  .mail-item.unread {
    border-color: #5f8ddd;
    background: #1a2b4a;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .meta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .meta em {
    color: #9db7e8;
    font-style: normal;
  }

  .meta strong {
    color: #cdddff;
    font-weight: 600;
  }

  .time {
    color: #8ea7d3;
    white-space: nowrap;
  }

  .subject {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .subject b {
    color: #f0f5ff;
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #7fb0ff;
    flex: 0 0 auto;
  }

  .preview {
    color: #a9bcde;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .decision-chip {
    width: fit-content;
    border-radius: 999px;
    border: 1px solid #557fbe;
    background: #264171;
    color: #d8e8ff;
    font-size: 11px;
    padding: 2px 8px;
  }

  .decision-chip.done {
    border-color: #4c9f78;
    background: #1f5a43;
    color: #d4ffe9;
  }

  .modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(5, 10, 22, 0.72);
    z-index: 5;
  }

  .modal {
    position: absolute;
    z-index: 6;
    inset: 10% 8%;
    border: 1px solid #41639a;
    background: #12203b;
    border-radius: 12px;
    padding: 14px;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
    overflow: hidden;
  }

  .modal header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .title {
    font-size: 18px;
    font-weight: 700;
    color: #f1f6ff;
  }

  .close-btn {
    border: 1px solid #3f6099;
    background: #254173;
    color: #e9f1ff;
    border-radius: 8px;
    padding: 5px 10px;
    cursor: pointer;
  }

  .sub {
    color: #a5bce4;
    font-size: 13px;
  }

  .body-text {
    min-height: 0;
    overflow: hidden;
  }

  .body-text p {
    margin: 0 0 8px;
    color: #dde9ff;
    line-height: 1.45;
    font-size: 14px;
  }

  .decision-panel {
    border-top: 1px solid #355180;
    padding-top: 10px;
    display: grid;
    gap: 8px;
  }

  .decision-title {
    color: #cfe2ff;
    font-weight: 600;
    font-size: 14px;
  }

  .decision-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .decision-actions button {
    border: 1px solid #4b6da5;
    background: #213a66;
    color: #e4efff;
    border-radius: 10px;
    padding: 8px 10px;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 4px;
  }

  .decision-actions button strong {
    font-size: 14px;
  }

  .decision-actions button span {
    color: #b9ceef;
    font-size: 12px;
  }

  .decision-result {
    color: #cde5ff;
    font-size: 13px;
  }
</style>
