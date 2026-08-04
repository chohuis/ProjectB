<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { SaveSlotMeta } from "../../../shared/types/projectb.d";
  import { listSlotsV3, deleteSlotV3, renameSlotV3 } from "../../../shared/repo/slotLifecycleV3";
  import { masterStore } from "../../../shared/stores/master";
  import { careerStageLabel } from "../../../shared/utils/careerStageLabel";
  import { teamTokens } from "../../../shared/utils/teamTheme";

  export let onSelect: (slotId: string, isEmpty: boolean) => void;
  export let onBack: () => void;

  let slots: (SaveSlotMeta | null)[] = [null, null, null];
  let loading = true;
  let renamingSlotId: string | null = null;
  let renameValue = "";
  let confirmDeleteSlotId: string | null = null;
  let busy = false;
  let renameInputEl: HTMLInputElement | null = null;

  // 슬롯 3개 (사용자 확정). 한 커리어가 20시즌이라 여러 개를 동시에 미는 일이 드물다.
  //
  // ⚠ 줄이기 전에 `slot_4`를 쓰던 세이브가 있으면 **목록에서 사라진다.**
  // 파일은 디스크에 남지만 화면에서 닿을 수 없다. 출시 전이라 그대로 두되,
  // 나중에 늘릴 일이 생기면 이 배열만 고치면 된다.
  const SLOT_IDS = ["slot_1", "slot_2", "slot_3"];

  // ⚠ 단계 라벨의 정본은 `utils/careerStageLabel`이다. 여기 표를 따로 두면
  // 리그가 늘 때 조용히 어긋난다 — 실제로 이 화면은 `kbl`·`abl`을 키로 썼는데
  // 타입은 `pro_kbl`·`pro_abl`이라 **프로 선수의 라벨이 안 나왔다.**

  onMount(async () => {
    await refreshSlots();
  });

  async function refreshSlots() {
    loading = true;
    try {
      // R3a-4: v3 슬롯만 (클린 브레이크)
      const list = await listSlotsV3();
      const map = new Map(list.map((slot) => [slot.slotId, slot]));
      slots = SLOT_IDS.map((id) => map.get(id) ?? null);
    } catch {}
    loading = false;
  }

  function handleSelect(slotId: string, isEmpty: boolean) {
    if (busy) return;
    onSelect(slotId, isEmpty);
  }

  /** 슬롯의 팀 — 카드 색과 이름에 쓴다 */
  function teamOf(meta: SaveSlotMeta | null) {
    const id = meta?.preview.teamId;
    return id ? ($masterStore.teams ?? []).find((t) => t.id === id) : undefined;
  }

  function fmtDate(iso: string) {
    return iso ? iso.slice(0, 10) : "";
  }

  function startRename(meta: SaveSlotMeta) {
    renamingSlotId = meta.slotId;
    renameValue = meta.name;
    tick().then(() => renameInputEl?.focus());
  }

  async function confirmRename() {
    if (!renamingSlotId || !renameValue.trim()) {
      renamingSlotId = null;
      return;
    }

    busy = true;
    await renameSlotV3(renamingSlotId, renameValue.trim());
    renamingSlotId = null;
    await refreshSlots();
    busy = false;
  }

  async function confirmDelete() {
    if (!confirmDeleteSlotId) return;

    busy = true;
    await deleteSlotV3(confirmDeleteSlotId);
    confirmDeleteSlotId = null;
    await refreshSlots();
    busy = false;
  }
</script>

<div class="screen u-page">
  <div class="panel">
    <div class="header">
      <button class="back-btn" type="button" on:click={onBack}>뒤로</button>
      <h2 class="title">세이브 슬롯</h2>
    </div>

    {#if loading}
      <p class="hint">불러오는 중...</p>
    {:else}
      <div class="slot-list">
        {#each SLOT_IDS as slotId, i}
          {@const meta = slots[i]}
          <div class="slot" class:filled={!!meta}>
            <button class="slot-info" type="button" on:click={() => handleSelect(slotId, !meta)}>
              {#if meta}
                {@const tm = teamOf(meta)}
                {@const pv = meta.preview}
                <!-- 팀 색 띠 — 슬롯 셋을 한눈에 가른다 -->
                <span class="stripe" style="background:{teamTokens(tm?.colors).dark}"></span>
                <div class="slot-top">
                  <span class="slot-name">{meta.name}</span>
                  <span class="slot-date">{fmtDate(meta.updatedAt)}</span>
                </div>
                <div class="slot-detail">
                  {#if tm}<b>{tm.name}</b>{/if}
                  {#if careerStageLabel(pv.careerStage)}<span class="sep">·</span>{careerStageLabel(pv.careerStage)}{/if}
                  {#if pv.seasonYear}<span class="sep">·</span>{pv.seasonYear}년{#if pv.currentWeek} {pv.currentWeek}주차{/if}{/if}
                </div>
                <!-- 통산 성적 — 없으면 줄을 안 그린다(새 슬롯·구 세이브) -->
                {#if pv.careerSeasons}
                  <div class="slot-career">
                    <span><i>통산</i>{pv.careerW ?? 0}승 {pv.careerL ?? 0}패</span>
                    {#if pv.careerEra}<span><i>ERA</i>{pv.careerEra}</span>{/if}
                    <span><i>시즌</i>{pv.careerSeasons}</span>
                  </div>
                {/if}
              {:else}
                <div class="slot-empty">비어 있음 · 눌러서 새로 시작</div>
              {/if}
            </button>

            {#if meta}
              <div class="slot-actions">
                {#if renamingSlotId === slotId}
                  <input
                    class="rename-input"
                    bind:this={renameInputEl}
                    bind:value={renameValue}
                    on:keydown={(event) => event.key === "Enter" && confirmRename()}
                    on:blur={confirmRename}
                  />
                {:else}
                  <button class="act-btn" type="button" on:click|stopPropagation={() => startRename(meta)}>이름변경</button>
                  <button class="act-btn danger" type="button" on:click|stopPropagation={() => (confirmDeleteSlotId = slotId)}>삭제</button>
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
  <div class="overlay" role="presentation">
    <button
      class="overlay-dismiss"
      type="button"
      aria-label="삭제 취소"
      on:click={() => (confirmDeleteSlotId = null)}
    ></button>
    <div class="confirm-box" role="dialog" tabindex="-1" aria-modal="true" aria-label="슬롯 삭제 확인">
      <p>세이브 슬롯을 삭제하시겠습니까?<br />삭제한 데이터는 복구할 수 없습니다.</p>
      <div class="confirm-btns">
        <button class="btn-cancel" type="button" on:click={() => (confirmDeleteSlotId = null)}>취소</button>
        <button class="btn-confirm" type="button" on:click={confirmDelete}>삭제</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .screen {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .panel { width: 520px; display: flex; flex-direction: column; gap: 14px; }

  .header { display: flex; align-items: baseline; gap: 14px; }
  .back-btn {
    background: none; border: 0; color: var(--ink-mute);
    font-size: 13px; cursor: pointer; padding: 4px 0;
  }
  .back-btn:hover { color: var(--t-accent); }
  .title {
    margin: 0; font-size: 20px; font-weight: 800;
    letter-spacing: -0.02em; color: var(--t-dark);
  }

  .slot-list { display: flex; flex-direction: column; gap: 8px; }

  .slot {
    display: flex; align-items: stretch;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .slot.filled { box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.18); }

  /* 카드 전체가 버튼이다 — 빈 슬롯도 눌러서 새로 시작한다 */
  .slot-info {
    position: relative;
    flex: 1; min-width: 0; text-align: left;
    background: none; border: 0; cursor: pointer;
    padding: 12px 14px 12px 18px;
    display: flex; flex-direction: column; gap: 4px;
    color: var(--ink);
  }
  .slot-info:hover { background: var(--panel-sunk); }

  /* 팀 색 띠 */
  .stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }

  .slot-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .slot-name { font-size: 14px; font-weight: 700; }
  .slot-date { font-size: 11px; color: var(--ink-mute); font-variant-numeric: tabular-nums; }

  .slot-detail { font-size: 12px; color: var(--ink-mid); display: flex; gap: 5px; align-items: baseline; }
  .slot-detail b { font-weight: 700; }
  .sep { opacity: 0.45; }

  .slot-career { display: flex; gap: 14px; margin-top: 2px; }
  .slot-career span { font-size: 12px; font-variant-numeric: tabular-nums; font-weight: 650; }
  .slot-career i {
    font-style: normal; font-size: 9.5px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--ink-mute); font-weight: 700;
    margin-right: 5px;
  }

  .slot-empty { font-size: 13px; color: var(--ink-mute); padding: 6px 0; }

  .slot-actions { display: flex; align-items: center; gap: 4px; padding: 0 10px 0 4px; }
  .act-btn {
    background: none; border: 1px solid var(--line);
    border-radius: var(--radius); color: var(--ink-mute);
    font-size: 11.5px; padding: 5px 9px; cursor: pointer;
  }
  .act-btn:hover { border-color: var(--t-dark); color: var(--t-dark); }
  .act-btn.danger:hover { border-color: var(--bad); color: var(--bad); }

  .rename-input {
    width: 150px; padding: 5px 8px;
    border: 1px solid var(--t-dark); border-radius: var(--radius);
    background: var(--panel); color: var(--ink); font-size: 12.5px;
  }

  .hint { color: var(--ink-mute); font-size: 13px; }

  /* ── 삭제 확인 ── */
  .overlay {
    position: fixed; inset: 0; z-index: 100;
    display: flex; align-items: center; justify-content: center;
  }
  .overlay-dismiss {
    position: absolute; inset: 0; border: 0; cursor: default;
    background: rgba(10, 18, 34, 0.55);
  }
  .confirm-box {
    position: relative;
    background: var(--panel); border-radius: var(--radius);
    padding: 20px 22px; width: 340px;
    box-shadow: 0 18px 40px -22px rgba(8, 16, 36, 0.7);
    border-top: 4px solid var(--bad);
  }
  .confirm-box p { margin: 0 0 16px; font-size: 13.5px; line-height: 1.6; color: var(--ink); }
  .confirm-btns { display: flex; gap: 8px; justify-content: flex-end; }
  .btn-cancel, .btn-confirm {
    border-radius: var(--radius); font-size: 13px; font-weight: 700;
    padding: 8px 16px; cursor: pointer;
  }
  .btn-cancel { background: none; border: 1px solid var(--line); color: var(--ink-mute); }
  .btn-confirm { background: var(--bad); border: 0; color: var(--ink-on-dark); }
</style>
