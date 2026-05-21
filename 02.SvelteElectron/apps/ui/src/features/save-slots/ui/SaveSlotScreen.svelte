<script lang="ts">
  import { onMount } from "svelte";
  import type { SaveSlotMeta } from "../../../shared/types/projectb.d";

  export let onSelect: (slotId: string, isEmpty: boolean) => void;
  export let onBack: () => void;

  let slots: (SaveSlotMeta | null)[] = [null, null, null, null];
  let loading = true;
  let renamingSlotId: string | null = null;
  let renameValue = "";
  let confirmDeleteSlotId: string | null = null;
  let busy = false;

  const SLOT_IDS = ["slot_1", "slot_2", "slot_3", "slot_4"];

  onMount(async () => {
    await refreshSlots();
  });

  async function refreshSlots() {
    loading = true;
    try {
      const list = (await window.projectB?.listSlots?.()) ?? [];
      const map = new Map(list.map((s) => [s.slotId, s]));
      slots = SLOT_IDS.map((id) => map.get(id) ?? null);
    } catch {}
    loading = false;
  }

  function handleSelect(slotId: string, isEmpty: boolean) {
    if (busy) return;
    onSelect(slotId, isEmpty);
  }

  function startRename(meta: SaveSlotMeta) {
    renamingSlotId = meta.slotId;
    renameValue = meta.name;
  }

  async function confirmRename() {
    if (!renamingSlotId || !renameValue.trim()) { renamingSlotId = null; return; }
    busy = true;
    await window.projectB?.renameSlot?.({ slotId: renamingSlotId, name: renameValue.trim() });
    renamingSlotId = null;
    await refreshSlots();
    busy = false;
  }

  async function confirmDelete() {
    if (!confirmDeleteSlotId) return;
    busy = true;
    await window.projectB?.deleteSlot?.(confirmDeleteSlotId);
    confirmDeleteSlotId = null;
    await refreshSlots();
    busy = false;
  }

  const STAGE_LABELS: Record<string, string> = {
    highschool: "고등학교", university: "대학교", independent: "독립리그",
    kbl: "KBL", abl: "ABL", retired: "은퇴",
  };

  function stageLabel(stage: string | null) {
    return stage ? (STAGE_LABELS[stage] ?? stage) : "";
  }

  function fmtDate(iso: string) {
    return iso ? iso.slice(0, 10) : "";
  }
</script>

<div class="screen">
  <div class="panel">
    <div class="header">
      <button class="back-btn" on:click={onBack}>← 뒤로</button>
      <h2 class="title">세이브 슬롯</h2>
    </div>

    {#if loading}
      <p class="hint">불러오는 중...</p>
    {:else}
      <div class="slot-list">
        {#each SLOT_IDS as slotId, i}
          {@const meta = slots[i]}
          <div class="slot" class:filled={!!meta}>
            <div class="slot-info" on:click={() => handleSelect(slotId, !meta)}>
              {#if meta}
                <div class="slot-name">{meta.name}</div>
                <div class="slot-detail">
                  {stageLabel(meta.preview.careerStage)}
                  {#if meta.preview.seasonYear} · {meta.preview.seasonYear}시즌{/if}
                  {#if meta.preview.currentWeek} {meta.preview.currentWeek}주차{/if}
                </div>
                <div class="slot-date">{fmtDate(meta.updatedAt)}</div>
              {:else}
                <div class="slot-empty">비어있음 — 새 게임</div>
              {/if}
            </div>

            {#if meta}
              <div class="slot-actions">
                {#if renamingSlotId === slotId}
                  <input
                    class="rename-input"
                    bind:value={renameValue}
                    on:keydown={(e) => e.key === "Enter" && confirmRename()}
                    on:blur={confirmRename}
                    autofocus
                  />
                {:else}
                  <button class="act-btn" on:click|stopPropagation={() => startRename(meta)}>이름변경</button>
                  <button class="act-btn danger" on:click|stopPropagation={() => (confirmDeleteSlotId = slotId)}>삭제</button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if confirmDeleteSlotId}
  <div class="overlay" on:click={() => (confirmDeleteSlotId = null)}>
    <div class="confirm-box" on:click|stopPropagation>
      <p>이 슬롯을 삭제하시겠습니까?<br/>되돌릴 수 없습니다.</p>
      <div class="confirm-btns">
        <button class="btn-cancel" on:click={() => (confirmDeleteSlotId = null)}>취소</button>
        <button class="btn-confirm" on:click={confirmDelete}>삭제</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .screen {
    width: 100vw; height: 100vh;
    background: #080f1e;
    display: flex; align-items: center; justify-content: center;
  }
  .panel {
    width: 480px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .header {
    display: flex; align-items: center; gap: 16px;
  }
  .back-btn {
    background: none; border: none; color: #6a8fc4;
    font-size: 14px; cursor: pointer; padding: 4px 0;
  }
  .back-btn:hover { color: #9bbce8; }
  .title {
    margin: 0; font-size: 22px; font-weight: 700; color: #e8f2ff;
  }
  .hint { color: #5a7aa8; font-size: 14px; }
  .slot-list { display: flex; flex-direction: column; gap: 10px; }
  .slot {
    display: flex; align-items: center;
    background: #0e1829; border: 1px solid #1e3050;
    border-radius: 10px; overflow: hidden;
    transition: border-color 0.15s;
  }
  .slot.filled { border-color: #2e4872; }
  .slot-info {
    flex: 1; padding: 16px 18px; cursor: pointer;
  }
  .slot-info:hover { background: #121f35; }
  .slot-name { font-size: 15px; font-weight: 600; color: #e8f2ff; margin-bottom: 4px; }
  .slot-detail { font-size: 13px; color: #6a8fc4; margin-bottom: 2px; }
  .slot-date { font-size: 11px; color: #3d5a8a; }
  .slot-empty { font-size: 14px; color: #3d5270; font-style: italic; }
  .slot-actions {
    display: flex; flex-direction: column; gap: 4px;
    padding: 10px 12px; border-left: 1px solid #1e3050;
  }
  .act-btn {
    background: #1a2840; border: 1px solid #2e4872;
    color: #9bbce8; font-size: 12px; padding: 5px 10px;
    border-radius: 6px; cursor: pointer; white-space: nowrap;
  }
  .act-btn:hover { background: #243655; }
  .act-btn.danger { color: #e07070; border-color: #5a2222; }
  .act-btn.danger:hover { background: #2a1a1a; }
  .rename-input {
    background: #0e1829; border: 1px solid #2b5aaa;
    color: #e8f2ff; font-size: 13px; padding: 4px 8px;
    border-radius: 6px; width: 110px; outline: none;
  }
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
  }
  .confirm-box {
    background: #0e1829; border: 1px solid #2e4872;
    border-radius: 12px; padding: 24px 28px;
    text-align: center; color: #c8daf4; font-size: 14px; line-height: 1.6;
  }
  .confirm-btns { display: flex; gap: 12px; justify-content: center; margin-top: 16px; }
  .btn-cancel {
    background: #1a2840; border: 1px solid #2e4872;
    color: #9bbce8; font-size: 14px; padding: 8px 20px;
    border-radius: 8px; cursor: pointer;
  }
  .btn-confirm {
    background: #5a1a1a; border: 1px solid #8a3030;
    color: #e07070; font-size: 14px; padding: 8px 20px;
    border-radius: 8px; cursor: pointer;
  }
</style>
