<script lang="ts">
  import { t } from "../../shared/i18n";
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

  const contacts: ContactItem[] = [
    {
      id: "coach-oh",
      name: "오지경 코치",
      category: "팀",
      relation: "투수 코치",
      unlocked: true,
      recent: "불펜 이후 팔각도 확인하자.",
      affinity: 68
    },
    {
      id: "captain-kim",
      name: "김준호",
      category: "팀",
      relation: "주장",
      unlocked: true,
      recent: "주말 경기 전 미팅 가능?",
      affinity: 57
    },
    {
      id: "manager-im",
      name: "임우현 감독",
      category: "팀",
      relation: "감독",
      unlocked: true,
      recent: "컨디션 체크 리포트 올려라.",
      affinity: 49
    },
    {
      id: "campus-han",
      name: "한서윤",
      category: "학교",
      relation: "학업 멘토",
      unlocked: false,
      recent: "학업 상담 이벤트 해금 시 연락처 획득",
      affinity: 0
    },
    {
      id: "friend-lee",
      name: "이도현",
      category: "개인",
      relation: "친구",
      unlocked: false,
      recent: "주말 리그 결승 진출 시 해금",
      affinity: 0
    }
  ];

  const chatByContact: Record<string, ChatMessage[]> = {
    "coach-oh": [
      { from: "contact", text: "오늘 불펜에서 릴리스 타이밍 좋았다.", time: "오늘 18:11" },
      { from: "me", text: "감사합니다. 내일 추가 점검 가능할까요?", time: "오늘 18:13" },
      { from: "contact", text: "가능하다. 10분 일찍 와라.", time: "오늘 18:14" }
    ],
    "captain-kim": [
      { from: "contact", text: "주말 상대팀 2번 타자 분석 끝냈어.", time: "오늘 16:09" },
      { from: "me", text: "좋아. 미팅 때 공유해줘.", time: "오늘 16:10" }
    ],
    "manager-im": [
      { from: "contact", text: "내일은 초반부터 공격적으로 들어간다.", time: "어제 20:03" },
      { from: "me", text: "네, 초구 스트라이크 비율 높이겠습니다.", time: "어제 20:07" }
    ]
  };

  let selectedContactId = contacts.find((item) => item.unlocked)?.id ?? "";
  let activeFilter: ContactCategory | "전체" = "전체";

  $: visibleContacts = contacts.filter((item) => {
    if (activeFilter === "전체") return true;
    return item.category === activeFilter;
  });
  $: selectedContact =
    visibleContacts.find((item) => item.id === selectedContactId) ??
    visibleContacts.find((item) => item.unlocked) ??
    visibleContacts[0];
  $: chatLog = selectedContact && selectedContact.unlocked
    ? chatByContact[selectedContact.id] ?? []
    : [];

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
    <button class:active={activeFilter === "전체"} on:click={() => (activeFilter = "전체")}>전체</button>
    <button class:active={activeFilter === "팀"} on:click={() => (activeFilter = "팀")}>팀</button>
    <button class:active={activeFilter === "학교"} on:click={() => (activeFilter = "학교")}>학교</button>
    <button class:active={activeFilter === "개인"} on:click={() => (activeFilter = "개인")}>개인</button>
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
          <div class="messages">
            {#each chatLog as msg}
              <div class={`bubble ${msg.from}`}>
                <p>{msg.text}</p>
                <small>{msg.time}</small>
              </div>
            {/each}
          </div>
          <div class="actions">
            <button>안부 대화</button>
            <button>훈련/학업 상담</button>
            <button>약속 잡기</button>
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
  }

  .affinity {
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 700;
    border: 1px solid transparent;
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
  }

  .chat-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 10px;
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
    overflow: auto;
    display: grid;
    align-content: start;
    gap: 8px;
    padding-right: 2px;
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
    justify-self: start;
  }

  .bubble.me {
    background: #1f3d70;
    border-color: #486da8;
    justify-self: end;
  }

  .actions {
    display: flex;
    gap: 8px;
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
