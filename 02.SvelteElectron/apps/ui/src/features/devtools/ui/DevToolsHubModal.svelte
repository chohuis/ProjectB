<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let open = false;

  const dispatch = createEventDispatcher<{
    close: void;
    openEvent: void;
    openEntity: void;
  }>();

  function close() {
    dispatch("close");
  }

  function openEvent() {
    dispatch("openEvent");
  }

  function openEntity() {
    dispatch("openEntity");
  }
</script>

{#if open}
  <div class="hub-backdrop" role="presentation" on:click={close}>
    <section class="hub-modal" role="dialog" aria-label="개발자 도구" on:click|stopPropagation>
      <header>
        <h2>개발자 도구</h2>
        <button type="button" class="ghost" on:click={close}>닫기</button>
      </header>

      <div class="actions">
        <button type="button" class="tool-btn" on:click={openEvent}>
          <strong>이벤트 에디터</strong>
          <span>이벤트/풀/메시지 템플릿/선택지 템플릿 관리</span>
        </button>

        <button type="button" class="tool-btn" on:click={openEntity}>
          <strong>선수/스태프/구단주 에디터</strong>
          <span>선수, 감독, 코치, 구단주 생성/수정/삭제 관리</span>
        </button>
      </div>
    </section>
  </div>
{/if}

<style>
  .hub-backdrop {
    position: fixed;
    inset: 0;
    z-index: 88;
    background: rgba(5, 10, 18, 0.72);
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .hub-modal {
    width: min(720px, 92vw);
    background: #101d32;
    border: 1px solid #35507a;
    border-radius: 12px;
    padding: 14px;
    display: grid;
    gap: 12px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #294467;
    padding-bottom: 8px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    color: #e5efff;
  }

  .actions {
    display: grid;
    gap: 10px;
  }

  .tool-btn {
    width: 100%;
    text-align: left;
    display: grid;
    gap: 4px;
    border: 1px solid #385983;
    background: #162743;
    border-radius: 10px;
    padding: 11px 12px;
    color: #dce8ff;
    cursor: pointer;
  }

  .tool-btn strong {
    font-size: 14px;
  }

  .tool-btn span {
    font-size: 12px;
    color: #9eb6d9;
  }

  .ghost {
    border: 1px solid #476791;
    background: #162744;
    color: #dbe9ff;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
  }
</style>
