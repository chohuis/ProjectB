<script lang="ts">
  import { tick } from "svelte";
  import { masterStore } from "../../../shared/stores/master";
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import type { ScriptStep, ScriptOption } from "../../../shared/types/messenger";
  import type { ChatMessage } from "../../../shared/types/save";

  export let contactId: string;
  export let arcId: string;

  $: contactDef = $masterStore.contactDefs.find((d) => d.id === contactId) ?? null;
  $: arc = contactDef?.arcs.find((a) => a.id === arcId) ?? null;

  type DisplayMsg = { from: "contact" | "me"; text: string };
  let displayMessages: DisplayMsg[] = [];
  let currentStep: ScriptStep | null = null;
  let totalAffinityDelta = 0;
  let done = false;
  let started = false;
  let chatEl: HTMLElement;

  $: if (arc && !started) {
    started = true;
    initScript();
  }

  function initScript() {
    if (!arc) return;
    const step = arc.script.steps.find((s) => s.id === arc!.script.startStepId) ?? null;
    if (!step) return;
    currentStep = step;
    if (step.from === "contact") {
      displayMessages = [{ from: "contact", text: step.text }];
    }
  }

  async function scrollBottom() {
    await tick();
    chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: "smooth" });
  }

  function advance(nextId: string | null) {
    if (done || !arc) return;
    if (!nextId) { completeScript(); return; }
    const step = arc.script.steps.find((s) => s.id === nextId) ?? null;
    if (!step) { completeScript(); return; }
    currentStep = step;
    if (step.from === "contact") {
      displayMessages = [...displayMessages, { from: "contact", text: step.text }];
      scrollBottom();
    }
  }

  function clickContinue() {
    const step = currentStep;
    if (!step || step.from !== "contact") return;
    advance(step.next);
  }

  function chooseOption(opt: ScriptOption) {
    if (done) return;
    displayMessages = [...displayMessages, { from: "me", text: opt.text }];
    totalAffinityDelta += opt.affinityDelta ?? 0;
    currentStep = null;
    scrollBottom();
    setTimeout(() => advance(opt.next), 350);
  }

  async function completeScript() {
    if (done || !arc || !contactDef) return;
    done = true;
    currentStep = null;

    const week = $seasonStore.currentWeek;

    gameStore.unlockOrRegisterContact(contactDef);
    gameStore.setContactFlag(contactId, arc.flag);

    for (const m of displayMessages) {
      const msg: ChatMessage = { from: m.from, text: m.text, week };
      gameStore.addChatMessage(contactId, msg);
    }
    if (totalAffinityDelta !== 0) {
      gameStore.updateAffinity(contactId, totalAffinityDelta);
    }

    seasonStore.resolvePendingAction("messengerScript", arcId);
    await gameStore.save();
    await seasonStore.save();
  }
</script>

<div class="overlay">
  <section class="modal">
    {#if arc && contactDef}
      <header class="modal-header">
        <span class="badge">{contactDef.relation}</span>
        <p class="contact-name">{contactDef.name}</p>
      </header>

      <div class="chat-area" bind:this={chatEl}>
        {#each displayMessages as msg (msg)}
          <div class="bubble-row {msg.from}">
            <div class="bubble {msg.from}">{msg.text}</div>
          </div>
        {/each}
        {#if done}
          <p class="done-hint">대화가 저장되었습니다.</p>
        {/if}
      </div>

      <footer class="footer">
        {#if !done && currentStep?.from === "player"}
          <div class="options">
            {#each currentStep.options as opt}
              <button class="opt-btn" on:click={() => chooseOption(opt)}>
                <span class="opt-text">{opt.text}</span>
                {#if opt.affinityDelta && opt.affinityDelta > 0}
                  <span class="delta">+친밀</span>
                {/if}
              </button>
            {/each}
          </div>
        {:else if !done && currentStep?.from === "contact"}
          <button class="continue-btn" on:click={clickContinue}>계속</button>
        {:else if done}
          <p class="saving-hint">저장 중...</p>
        {/if}
      </footer>
    {:else}
      <div class="loading">로딩 중...</div>
    {/if}
  </section>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
    padding: 24px;
  }

  .modal {
    width: min(480px, 95vw);
    background: #0e1a2e;
    border: 1px solid #3a5a96;
    border-radius: 16px;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    max-height: 75vh;
  }

  .modal-header {
    padding: 14px 18px 12px;
    border-bottom: 1px solid #243550;
    display: grid;
    gap: 4px;
  }

  .badge {
    display: inline-block;
    width: fit-content;
    background: #1a3560;
    border: 1px solid #4a70a8;
    border-radius: 999px;
    color: #90b8e8;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    padding: 2px 10px;
  }

  .contact-name {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #e8f2ff;
  }

  .chat-area {
    padding: 14px 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 120px;
  }

  .bubble-row { display: flex; }
  .bubble-row.contact { justify-content: flex-start; }
  .bubble-row.me      { justify-content: flex-end; }

  .bubble {
    max-width: 78%;
    padding: 9px 13px;
    border-radius: 14px;
    font-size: 14px;
    line-height: 1.55;
  }

  .bubble.contact {
    background: #1a2e4a;
    border: 1px solid #2e4a72;
    color: #d0e8ff;
    border-bottom-left-radius: 4px;
  }

  .bubble.me {
    background: #1a4a3a;
    border: 1px solid #2a6a52;
    color: #c0eedc;
    border-bottom-right-radius: 4px;
  }

  .done-hint {
    margin: 4px 0 0;
    text-align: center;
    font-size: 12px;
    color: #4a6888;
  }

  .footer {
    padding: 12px 16px 16px;
    border-top: 1px solid #1e3050;
  }

  .options { display: grid; gap: 8px; }

  .opt-btn {
    background: #192d4e;
    border: 1px solid #3a5d94;
    border-radius: 10px;
    color: #ddeeff;
    padding: 10px 14px;
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    transition: background 0.12s, border-color 0.12s;
  }

  .opt-btn:hover { background: #24406a; border-color: #6494cc; }

  .opt-text { font-size: 14px; font-weight: 500; }

  .delta {
    font-size: 11px;
    color: #50d090;
    font-weight: 600;
    flex-shrink: 0;
  }

  .continue-btn {
    width: 100%;
    padding: 10px;
    background: #1a3a5e;
    border: 1px solid #3a6498;
    border-radius: 10px;
    color: #b8d8f8;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s;
  }

  .continue-btn:hover { background: #224a7a; }

  .saving-hint {
    margin: 0;
    text-align: center;
    font-size: 13px;
    color: #5a7898;
  }

  .loading {
    padding: 40px;
    text-align: center;
    color: #4a6888;
    font-size: 14px;
  }
</style>
