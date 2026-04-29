<script lang="ts">
  import { tick } from "svelte";
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";

  type ContactCategory = "팀" | "학교" | "개인";

  interface ContactItem {
    id: string;
    name: string;
    category: ContactCategory;
    relation: string;
    unlocked: boolean;
    recent: string;
    affinity: number;
  }

  interface ChatMessage {
    from: "me" | "contact";
    text: string;
    time: string;
  }

  const PRESET_REPLIES: Record<string, Record<string, string>> = {
    "coach-oh": {
      greet: "오늘 훈련 마무리 잘 했나. 내일도 집중하자.",
      advice: "릴리스 포인트 안정화가 먼저다. 구속은 그 다음이야.",
      plan: "오전 9시에 불펜에서 보자."
    },
    "captain-kim": {
      greet: "어이, 잘 지냈어? 다음 경기 같이 준비하자.",
      advice: "상대 2번 타자 분석 같이 할까? 자료 있어.",
      plan: "토요일 미팅 OK. 연락할게."
    },
    "manager-im": {
      greet: "수고했다. 컨디션 관리 잘 해라.",
      advice: "다음 경기까지 초구 스트라이크 비율 높여라.",
      plan: "일정은 코치에게 확인해라."
    }
  };

  const CATEGORY_REPLIES: Record<ContactCategory, Record<string, string>> = {
    팀: {
      greet: "수고했어. 팀 분위기 잘 유지하자.",
      advice: "훈련 열심히 하고 있군. 계속 그렇게 해.",
      plan: "일정은 다시 확인하고 연락할게."
    },
    학교: {
      greet: "안녕! 학교생활 잘 되고 있어?",
      advice: "학업이랑 운동 균형 잘 잡고 있는 거 맞지?",
      plan: "시간 맞춰서 만나자."
    },
    개인: {
      greet: "야, 잘 지냈어?",
      advice: "고민 있으면 언제든지 말해.",
      plan: "그래, 나중에 시간 맞춰보자."
    }
  };

  const ACTION_TEMPLATES: Record<string, { me: string; key: keyof typeof CATEGORY_REPLIES["팀"] }> = {
    greet:  { me: "안녕하세요! 잘 지내셨나요?", key: "greet" },
    advice: { me: "훈련/학업 관련해서 조언 부탁드려도 될까요?", key: "advice" },
    plan:   { me: "시간 되실 때 약속 잡을 수 있을까요?", key: "plan" }
  };

  const contacts: ContactItem[] = [
    { id: "coach-oh",    name: "오지경 코치", category: "팀",  relation: "투수 코치", unlocked: true,  recent: "불펜 이후 팔각도 확인하자.", affinity: 68 },
    { id: "captain-kim", name: "김준호",      category: "팀",  relation: "주장",      unlocked: true,  recent: "주말 경기 전 미팅 가능?",    affinity: 57 },
    { id: "manager-im",  name: "임우현 감독", category: "팀",  relation: "감독",      unlocked: true,  recent: "컨디션 체크 리포트 올려라.", affinity: 49 },
    { id: "campus-han",  name: "한서윤",      category: "학교", relation: "학업 멘토", unlocked: false, recent: "학업 상담 이벤트 해금 시 연락처 획득", affinity: 0 },
    { id: "friend-lee",  name: "이도현",      category: "개인", relation: "친구",      unlocked: false, recent: "주말 리그 결승 진출 시 해금",  affinity: 0 }
  ];

  let chatLog: Record<string, ChatMessage[]> = {
    "coach-oh": [
      { from: "contact", text: "오늘 불펜에서 릴리스 타이밍 좋았다.", time: "오늘 18:11" },
      { from: "me",      text: "감사합니다. 내일 추가 점검 가능할까요?", time: "오늘 18:13" },
      { from: "contact", text: "가능하다. 10분 일찍 와라.", time: "오늘 18:14" }
    ],
    "captain-kim": [
      { from: "contact", text: "주말 상대팀 2번 타자 분석 끝냈어.", time: "오늘 16:09" },
      { from: "me",      text: "좋아. 미팅 때 공유해줘.", time: "오늘 16:10" }
    ],
    "manager-im": [
      { from: "contact", text: "내일은 초반부터 공격적으로 들어간다.", time: "어제 20:03" },
      { from: "me",      text: "네, 초구 스트라이크 비율 높이겠습니다.", time: "어제 20:07" }
    ]
  };

  let selectedContactId = contacts.find((c) => c.unlocked)?.id ?? "";
  let activeFilter: ContactCategory | "전체" = "전체";
  let inputText = "";
  let chatEl: HTMLDivElement;

  $: visibleContacts = contacts.filter((c) =>
    activeFilter === "전체" ? true : c.category === activeFilter
  );
  $: selectedContact =
    visibleContacts.find((c) => c.id === selectedContactId) ??
    visibleContacts.find((c) => c.unlocked) ??
    visibleContacts[0];
  $: currentChat = selectedContact?.unlocked
    ? (chatLog[selectedContact.id] ?? [])
    : [];

  function nowTime(): string {
    const d = new Date();
    return `오늘 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  async function pushMessages(meText: string, contactText: string) {
    if (!selectedContact?.unlocked) return;
    const id = selectedContact.id;
    const t = nowTime();
    chatLog = {
      ...chatLog,
      [id]: [...(chatLog[id] ?? []), { from: "me", text: meText, time: t }]
    };
    await tick();
    chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: "smooth" });

    setTimeout(async () => {
      chatLog = {
        ...chatLog,
        [id]: [...(chatLog[id] ?? []), { from: "contact", text: contactText, time: nowTime() }]
      };
      await tick();
      chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: "smooth" });
    }, 800);
  }

  function getReply(actionKey: string): string {
    if (!selectedContact) return "";
    const contactReplies = PRESET_REPLIES[selectedContact.id];
    if (contactReplies?.[actionKey]) return contactReplies[actionKey];
    return CATEGORY_REPLIES[selectedContact.category]?.[actionKey] ?? "알겠어.";
  }

  function handleAction(actionKey: string) {
    const tpl = ACTION_TEMPLATES[actionKey];
    if (!tpl) return;
    pushMessages(tpl.me, getReply(tpl.key));
  }

  async function sendInput() {
    const text = inputText.trim();
    if (!text || !selectedContact?.unlocked) return;
    gameStore.recordSocialFirstKakao();
    inputText = "";
    await pushMessages(text, getReply("greet"));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendInput();
    }
  }

  function relationTone(value: number): string {
    if (value >= 70) return "high";
    if (value >= 50) return "mid";
    return "low";
  }
</script>

<section class="page">
  <header class="top">
    <h2>{$t("page.messenger")}</h2>
    <p>연락처를 해금해 대화/교류/관계 이벤트를 진행합니다.</p>
  </header>

  <div class="filters">
    {#each ["전체", "팀", "학교", "개인"] as f}
      <button class:active={activeFilter === f} on:click={() => (activeFilter = f as ContactCategory | "전체")}>
        {f}
      </button>
    {/each}
  </div>

  <div class="layout">
    <section class="panel contact-list">
      <div class="head">
        <strong>연락처</strong>
        <span>{visibleContacts.length}명</span>
      </div>
      <div class="rows">
        {#each visibleContacts as contact}
          <button
            class:selected={selectedContact?.id === contact.id}
            disabled={!contact.unlocked}
            on:click={() => (selectedContactId = contact.id)}
          >
            <div>
              <p class="name">{contact.name}</p>
              <p class="meta">{contact.relation} · {contact.category}</p>
              <p class="recent">{contact.recent}</p>
            </div>
            <div class="right">
              {#if contact.unlocked}
                <span class={`affinity ${relationTone(contact.affinity)}`}>관계 {contact.affinity}</span>
              {:else}
                <span class="locked">잠금</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </section>

    <section class="panel chat-panel">
      {#if selectedContact}
        <div class="chat-head">
          <div>
            <strong>{selectedContact.name}</strong>
            <p>{selectedContact.relation}</p>
          </div>
          {#if selectedContact.unlocked}
            <span class={`affinity ${relationTone(selectedContact.affinity)}`}>관계 {selectedContact.affinity}</span>
          {:else}
            <span class="locked">연락처 미해금</span>
          {/if}
        </div>

        {#if selectedContact.unlocked}
          <div class="messages" bind:this={chatEl}>
            {#each currentChat as msg}
              <div class={`bubble ${msg.from}`}>
                <p>{msg.text}</p>
                <small>{msg.time}</small>
              </div>
            {/each}
          </div>

          <div class="actions">
            <button on:click={() => handleAction("greet")}>안부 대화</button>
            <button on:click={() => handleAction("advice")}>훈련/학업 상담</button>
            <button on:click={() => handleAction("plan")}>약속 잡기</button>
          </div>

          <div class="input-row">
            <input
              type="text"
              placeholder="메시지 입력…"
              bind:value={inputText}
              on:keydown={handleKeydown}
            />
            <button class="send-btn" on:click={sendInput} disabled={!inputText.trim()}>보내기</button>
          </div>
        {:else}
          <div class="locked-state">
            <p>해당 인물은 아직 연락처를 획득하지 못했습니다.</p>
            <p>경기 결과/이벤트/메시지 선택에 따라 해금됩니다.</p>
          </div>
        {/if}
      {/if}
    </section>
  </div>
</section>

<style>
  .page {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
  }

  .top h2,
  .top p {
    margin: 0;
  }

  .top h2 {
    font-size: 22px;
  }

  .top p {
    margin-top: 4px;
    color: #a9bddf;
    font-size: 13px;
  }

  .filters {
    display: flex;
    gap: 8px;
  }

  .filters button {
    border: 1px solid #30466f;
    background: #172741;
    color: #d7e4ff;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .filters button.active {
    border-color: #76a6ff;
    background: #233a64;
  }

  .layout {
    min-height: 0;
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 10px;
  }

  .panel {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .contact-list {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #c8d9fb;
    font-size: 13px;
  }

  .rows {
    min-height: 0;
    overflow: auto;
    display: grid;
    gap: 7px;
    align-content: start;
  }

  .rows button {
    background: #0f1a2d;
    border: 1px solid #2d3f61;
    border-radius: 8px;
    color: #deebff;
    padding: 8px;
    text-align: left;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    cursor: pointer;
    width: 100%;
  }

  .rows button.selected {
    border-color: #7aa8f4;
    background: #1c2e4c;
  }

  .rows button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .name,
  .meta,
  .recent {
    margin: 0;
  }

  .name {
    font-size: 14px;
    font-weight: 700;
  }

  .meta {
    margin-top: 2px;
    color: #9db4dd;
    font-size: 12px;
  }

  .recent {
    margin-top: 4px;
    color: #c4d3ef;
    font-size: 12px;
  }

  .right {
    display: flex;
    align-items: start;
    flex-shrink: 0;
  }

  .affinity {
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 700;
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .affinity.high {
    color: #83e8a4;
    border-color: #3c8255;
    background: #1a3324;
  }

  .affinity.mid {
    color: #9ac6ff;
    border-color: #3a5f98;
    background: #18263f;
  }

  .affinity.low {
    color: #ffcc84;
    border-color: #7a5a2f;
    background: #332513;
  }

  .locked {
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 11px;
    color: #ffcf8e;
    border: 1px solid #7a5b31;
    background: #2f2314;
    white-space: nowrap;
  }

  .chat-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    gap: 8px;
  }

  .chat-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2b3a57;
    padding-bottom: 8px;
  }

  .chat-head strong {
    color: #f2f7ff;
  }

  .chat-head p {
    margin: 3px 0 0;
    font-size: 12px;
    color: #9eb4dc;
  }

  .messages {
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 4px;
  }

  .bubble {
    max-width: 72%;
    border-radius: 10px;
    padding: 8px 10px;
    border: 1px solid #2c3d5e;
  }

  .bubble p,
  .bubble small {
    margin: 0;
  }

  .bubble p {
    color: #e7f0ff;
    font-size: 13px;
    line-height: 1.45;
  }

  .bubble small {
    margin-top: 4px;
    color: #9eb4dc;
    font-size: 11px;
    display: block;
  }

  .bubble.contact {
    background: #13233f;
    align-self: flex-start;
  }

  .bubble.me {
    background: #1f3d70;
    border-color: #486da8;
    align-self: flex-end;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .actions button {
    border: 1px solid #355083;
    background: #1d355e;
    color: #e0ebff;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .actions button:hover {
    background: #274878;
    border-color: #4a6fa8;
  }

  .input-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .input-row input {
    background: #0f1a2d;
    border: 1px solid #2d3f61;
    border-radius: 8px;
    color: #e0ebff;
    padding: 8px 10px;
    font-size: 13px;
    min-width: 0;
  }

  .input-row input:focus {
    outline: none;
    border-color: #5b86c8;
  }

  .send-btn {
    border: 1px solid #4a6fa8;
    background: #1f3d6a;
    color: #c8dfff;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }

  .send-btn:hover:not(:disabled) {
    background: #2a4f88;
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .locked-state {
    border: 1px dashed #3a507b;
    border-radius: 10px;
    padding: 12px;
    color: #c9d9f7;
    font-size: 13px;
    line-height: 1.5;
    display: grid;
    gap: 4px;
    align-content: center;
  }

  .locked-state p {
    margin: 0;
  }

  @media (max-width: 1280px) {
    .layout {
      grid-template-columns: 280px minmax(0, 1fr);
    }
  }
</style>
