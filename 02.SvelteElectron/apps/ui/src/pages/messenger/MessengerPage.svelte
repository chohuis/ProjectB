<script lang="ts">
  import { tick } from "svelte";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { masterStore } from "../../shared/stores/master";
  import type { ChatContact } from "../../shared/types/save";

  type FilterKey = "전체" | "team" | "school" | "personal";

  const FILTER_LABELS: Record<FilterKey, string> = {
    "전체": "전체",
    "team": "팀",
    "school": "학교",
    "personal": "개인",
  };

  const ACTIONS: { key: string; label: string; affinityDelta: number; myText: string }[] = [
    { key: "greet",  label: "안부 인사",      affinityDelta: 1, myText: "안녕하세요! 잘 지내셨나요?" },
    { key: "advice", label: "훈련/학업 상담",  affinityDelta: 2, myText: "조언을 구해도 될까요?" },
    { key: "plan",   label: "약속 잡기",       affinityDelta: 3, myText: "시간 되실 때 한번 만날 수 있을까요?" },
  ];

  let activeFilter: FilterKey = "전체";
  let selectedContactId = "";
  let chatEl: HTMLDivElement;
  let sending = false;

  $: currentWeek = $seasonStore.currentWeek;
  $: unlockedContacts = $gameStore.contacts.filter((c) => c.unlocked);
  $: filteredContacts =
    activeFilter === "전체"
      ? unlockedContacts
      : unlockedContacts.filter((c) => c.category === activeFilter);

  // 필터 변경 시 선택 유지 또는 첫 항목으로
  $: {
    if (!filteredContacts.some((c) => c.id === selectedContactId)) {
      selectedContactId = filteredContacts[0]?.id ?? "";
    }
  }

  $: selectedContact = filteredContacts.find((c) => c.id === selectedContactId) ?? null;

  function canAct(contact: ChatContact): boolean {
    return currentWeek > contact.lastActionWeek;
  }

  function cooldownLabel(contact: ChatContact): string {
    if (canAct(contact)) return "";
    return `W${contact.lastActionWeek + 1} 이후`;
  }

  function affinityTier(v: number): string {
    if (v >= 80) return "top";
    if (v >= 60) return "high";
    if (v >= 40) return "mid";
    return "low";
  }

  function affinityLabel(v: number): string {
    if (v >= 80) return "친밀";
    if (v >= 60) return "우호";
    if (v >= 40) return "보통";
    if (v >= 20) return "소원";
    return "냉담";
  }

  function getReply(actionKey: string, category: string): string {
    const pool = $masterStore.contactReplies?.[actionKey]?.[category] ?? [];
    if (!pool.length) return "알겠어.";
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function handleAction(actionKey: string, myText: string, affinityDelta: number) {
    if (!selectedContact || !canAct(selectedContact) || sending) return;
    sending = true;

    const contactId = selectedContact.id;
    const category  = selectedContact.category;
    const week      = currentWeek;

    if (!$gameStore.achievementMetrics.kakaoFirstContact) {
      gameStore.recordSocialFirstKakao();
    }

    gameStore.addChatMessage(contactId, { from: "me", text: myText, week, affinityDelta });
    gameStore.setLastActionWeek(contactId, week);
    gameStore.updateAffinity(contactId, affinityDelta);

    await tick();
    chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: "smooth" });

    setTimeout(async () => {
      const replyText = getReply(actionKey, category);
      gameStore.addChatMessage(contactId, { from: "contact", text: replyText, week });
      gameStore.save();
      sending = false;
      await tick();
      chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: "smooth" });
    }, 700);
  }
</script>

<section class="page">
  <header class="top-bar">
    <h2>메신저</h2>
    <nav class="filters">
      {#each (["전체", "team", "school", "personal"] as FilterKey[]) as f}
        <button class:active={activeFilter === f} on:click={() => (activeFilter = f)}>
          {FILTER_LABELS[f]}
        </button>
      {/each}
    </nav>
  </header>

  <div class="layout">
    <!-- 연락처 목록 -->
    <aside class="contact-list">
      {#if filteredContacts.length === 0}
        <div class="empty-contacts">
          <p>연락처 없음</p>
          <p>이벤트나 경기 결과에 따라 연락처가 해금됩니다.</p>
        </div>
      {:else}
        {#each filteredContacts as contact (contact.id)}
          <button
            class="contact-item"
            class:selected={selectedContact?.id === contact.id}
            on:click={() => (selectedContactId = contact.id)}
          >
            <div class="contact-avatar" data-tier={affinityTier(contact.affinity)}>
              {contact.name[0]}
            </div>
            <div class="contact-info">
              <p class="contact-name">{contact.name}</p>
              <p class="contact-meta">{contact.relation}</p>
              {#if contact.chatHistory.length > 0}
                {@const last = contact.chatHistory[contact.chatHistory.length - 1]}
                <p class="contact-preview">{last.from === "me" ? "나: " : ""}{last.text}</p>
              {/if}
            </div>
            <div class="contact-right">
              <span class="affinity-badge" data-tier={affinityTier(contact.affinity)}>
                {affinityLabel(contact.affinity)}
              </span>
              <span class="affinity-num">{contact.affinity}</span>
            </div>
          </button>
        {/each}
      {/if}
    </aside>

    <!-- 채팅 패널 -->
    <div class="chat-panel">
      {#if selectedContact}
        <!-- 헤더 -->
        <div class="chat-header">
          <div class="chat-header-info">
            <strong>{selectedContact.name}</strong>
            <span>{selectedContact.relation}</span>
          </div>
          <div class="affinity-section">
            <div class="affinity-bar-wrap">
              <div
                class="affinity-bar-fill"
                data-tier={affinityTier(selectedContact.affinity)}
                style="width:{selectedContact.affinity}%"
              ></div>
            </div>
            <span class="affinity-value" data-tier={affinityTier(selectedContact.affinity)}>
              {affinityLabel(selectedContact.affinity)} {selectedContact.affinity}
            </span>
          </div>
        </div>

        <!-- 메시지 목록 -->
        <div class="messages" bind:this={chatEl}>
          {#if selectedContact.chatHistory.length === 0}
            <div class="no-messages">
              아직 대화가 없습니다. 아래 버튼으로 대화를 시작해보세요.
            </div>
          {:else}
            {#each selectedContact.chatHistory as msg}
              <div class="bubble {msg.from}">
                <p>{msg.text}</p>
                <small>
                  W{msg.week}
                  {#if msg.affinityDelta && msg.affinityDelta > 0}
                    · 친밀도 +{msg.affinityDelta}
                  {/if}
                </small>
              </div>
            {/each}
          {/if}
        </div>

        <!-- 액션 버튼 -->
        <div class="actions">
          {#if !canAct(selectedContact)}
            <p class="cooldown-notice">
              {cooldownLabel(selectedContact)}까지 대화 쿨다운 중
            </p>
          {/if}
          {#each ACTIONS as action}
            {@const disabled = !canAct(selectedContact) || sending}
            <button
              class="action-btn"
              class:disabled
              {disabled}
              on:click={() => handleAction(action.key, action.myText, action.affinityDelta)}
            >
              <span class="action-label">{action.label}</span>
              <span class="action-delta">+{action.affinityDelta}</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="no-contact-selected">
          {#if unlockedContacts.length === 0}
            <p>아직 해금된 연락처가 없습니다.</p>
            <p>게임을 진행하면 새로운 연락처가 등록됩니다.</p>
          {:else}
            <p>왼쪽에서 연락처를 선택하세요.</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .page {
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    overflow: hidden;
  }

  .top-bar {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    color: #dce8ff;
    flex-shrink: 0;
  }

  .filters {
    display: flex;
    gap: 6px;
  }

  .filters button {
    border: 1px solid #2d4470;
    background: #111d34;
    color: #9bb4d8;
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
  }

  .filters button.active {
    background: #2b5aaa;
    border-color: #5a8fe8;
    color: #f0f6ff;
  }

  .layout {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
  }

  /* ── 연락처 목록 ── */
  .contact-list {
    background: #0d1928;
    border: 1px solid #1e3050;
    border-radius: 10px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
  }

  .empty-contacts {
    padding: 20px 12px;
    text-align: center;
    color: #3d5880;
    font-size: 12px;
    line-height: 1.7;
  }

  .empty-contacts p { margin: 0; }

  .contact-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: #111e34;
    border: 1px solid #1e3050;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.12s;
  }

  .contact-item.selected {
    background: #1a3060;
    border-color: #3a6ab0;
  }

  .contact-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #1c2f4e;
    border: 2px solid #253650;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: #7aa0d8;
    flex-shrink: 0;
  }

  .contact-avatar[data-tier="top"]  { border-color: #d4a000; color: #f8d060; }
  .contact-avatar[data-tier="high"] { border-color: #2d8050; color: #60d890; }
  .contact-avatar[data-tier="mid"]  { border-color: #2a5a98; color: #70a8f0; }
  .contact-avatar[data-tier="low"]  { border-color: #3a3a50; color: #8888a8; }

  .contact-info {
    flex: 1;
    min-width: 0;
  }

  .contact-name {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #d8e8ff;
  }

  .contact-meta {
    margin: 2px 0 0;
    font-size: 11px;
    color: #5a7a9a;
  }

  .contact-preview {
    margin: 3px 0 0;
    font-size: 11px;
    color: #7a94b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .contact-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .affinity-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid transparent;
  }

  .affinity-badge[data-tier="top"]  { background: #2a1e06; border-color: #b87800; color: #f8d060; }
  .affinity-badge[data-tier="high"] { background: #0e2418; border-color: #2d6040; color: #60d890; }
  .affinity-badge[data-tier="mid"]  { background: #0e1a30; border-color: #2a5080; color: #70a8f0; }
  .affinity-badge[data-tier="low"]  { background: #1a1a28; border-color: #303050; color: #7878a0; }

  .affinity-num {
    font-size: 11px;
    color: #4a6888;
  }

  /* ── 채팅 패널 ── */
  .chat-panel {
    background: #0d1928;
    border: 1px solid #1e3050;
    border-radius: 10px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    border-bottom: 1px solid #1e3050;
    gap: 12px;
  }

  .chat-header-info {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .chat-header-info strong {
    font-size: 14px;
    color: #d8e8ff;
  }

  .chat-header-info span {
    font-size: 12px;
    color: #4a6888;
  }

  .affinity-section {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .affinity-bar-wrap {
    width: 80px;
    height: 6px;
    background: #1c2f4e;
    border-radius: 3px;
    overflow: hidden;
  }

  .affinity-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .affinity-bar-fill[data-tier="top"]  { background: #d4a000; }
  .affinity-bar-fill[data-tier="high"] { background: #2d9e58; }
  .affinity-bar-fill[data-tier="mid"]  { background: #2a6ab8; }
  .affinity-bar-fill[data-tier="low"]  { background: #505070; }

  .affinity-value {
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .affinity-value[data-tier="top"]  { color: #f8d060; }
  .affinity-value[data-tier="high"] { color: #60d890; }
  .affinity-value[data-tier="mid"]  { color: #70a8f0; }
  .affinity-value[data-tier="low"]  { color: #7878a0; }

  /* ── 메시지 ── */
  .messages {
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .no-messages {
    text-align: center;
    color: #3d5880;
    font-size: 13px;
    margin: auto;
    padding: 20px;
  }

  .bubble {
    max-width: 70%;
    border-radius: 10px;
    padding: 8px 12px;
  }

  .bubble p { margin: 0; font-size: 13px; color: #e0eeff; line-height: 1.5; }

  .bubble small {
    display: block;
    margin-top: 4px;
    font-size: 10px;
    color: #4a6888;
  }

  .bubble.contact {
    background: #111e38;
    border: 1px solid #1e3050;
    align-self: flex-start;
  }

  .bubble.me {
    background: #1a3a6a;
    border: 1px solid #2a5098;
    align-self: flex-end;
  }

  .bubble.me small { text-align: right; }

  /* ── 액션 영역 ── */
  .actions {
    padding: 10px 14px;
    border-top: 1px solid #1e3050;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .cooldown-notice {
    width: 100%;
    margin: 0 0 4px;
    font-size: 11px;
    color: #7a5030;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: #1a2e50;
    border: 1px solid #2a4878;
    border-radius: 8px;
    color: #9bbce8;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.12s;
  }

  .action-btn:hover:not(.disabled) {
    background: #243a60;
    border-color: #4a6898;
  }

  .action-btn.disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .action-delta {
    font-size: 10px;
    color: #60d890;
    font-weight: 700;
  }

  /* ── 빈 상태 ── */
  .no-contact-selected {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #3d5880;
    font-size: 13px;
    gap: 6px;
  }

  .no-contact-selected p { margin: 0; }

  @media (max-width: 1280px) {
    .layout { grid-template-columns: 220px minmax(0, 1fr); }
  }
</style>
