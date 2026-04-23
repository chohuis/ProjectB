<script lang="ts">
  import { fieldStyleStore, type FieldStyle } from '../../../shared/stores/settings';

  export let open = false;

  function close() { open = false; }

  function setStyle(s: FieldStyle) { fieldStyleStore.set(s); }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={close}></div>
  <div class="panel" role="dialog" aria-label="환경설정">
    <header class="panel-header">
      <span class="panel-title">환경설정</span>
      <kbd class="shortcut">Ctrl+Q</kbd>
      <button class="close-btn" type="button" on:click={close} aria-label="닫기">✕</button>
    </header>

    <section class="section">
      <h3 class="section-title">경기장 스타일</h3>
      <div class="style-grid">
        <button
          type="button"
          class="style-card"
          class:active={$fieldStyleStore === 'digital'}
          on:click={() => setStyle('digital')}
        >
          <div class="style-preview digital-prev">
            <div class="dp-field"></div>
            <div class="dp-dirt"></div>
            <div class="dp-mound"></div>
          </div>
          <span class="style-label">디지털</span>
          <span class="style-desc">그라데이션 · 부드러운 곡선</span>
        </button>

        <button
          type="button"
          class="style-card"
          class:active={$fieldStyleStore === 'dot'}
          on:click={() => setStyle('dot')}
        >
          <div class="style-preview dot-prev">
            <div class="dp-field"></div>
            <div class="dp-dirt"></div>
            <div class="dp-mound"></div>
          </div>
          <span class="style-label">도트</span>
          <span class="style-desc">픽셀 아트 · 레트로 스타일</span>
        </button>
        <button
          type="button"
          class="style-card"
          class:active={$fieldStyleStore === 'retro'}
          on:click={() => setStyle('retro')}
        >
          <div class="style-preview retro-prev">
            <div class="dp-field"></div>
            <div class="dp-dirt"></div>
            <div class="dp-mound"></div>
          </div>
          <span class="style-label">레트로</span>
          <span class="style-desc">GBC 픽셀 · 포켓몬 골드</span>
        </button>
      </div>
    </section>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 100;
  }

  .panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 300px;
    height: 100vh;
    background: #0d1523;
    border-left: 1px solid #2a3a56;
    z-index: 101;
    display: flex;
    flex-direction: column;
    gap: 0;
    animation: slideIn 0.18s ease-out;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 18px;
    border-bottom: 1px solid #1e2f48;
  }

  .panel-title {
    font-size: 15px;
    font-weight: 700;
    color: #e8f0ff;
    flex: 1;
  }

  .shortcut {
    font-size: 11px;
    color: #5a7aaa;
    background: #111e30;
    border: 1px solid #2a3a56;
    border-radius: 4px;
    padding: 2px 6px;
    font-family: monospace;
  }

  .close-btn {
    background: none;
    border: none;
    color: #6a8aaa;
    font-size: 16px;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
  }
  .close-btn:hover { color: #c8d8f0; }

  .section {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: #6a8aaa;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .style-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
  }

  .style-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    background: #111e30;
    border: 2px solid #1e3050;
    border-radius: 10px;
    padding: 12px 8px;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .style-card:hover { border-color: #3a5a80; }
  .style-card.active {
    border-color: #4a8cf0;
    background: #0f1e38;
  }

  .style-preview {
    width: 100%;
    height: 70px;
    border-radius: 6px;
    overflow: hidden;
    position: relative;
  }

  /* 디지털 미리보기 */
  .digital-prev {
    background: radial-gradient(ellipse at 50% 70%, #2d7a33 0%, #1e5524 100%);
  }
  .digital-prev .dp-field {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 70%, #2d7a33 0%, #1e5524 100%);
  }
  .digital-prev .dp-dirt {
    position: absolute;
    left: 30%; right: 30%; top: 40%; bottom: 10%;
    background: linear-gradient(135deg, #c98d4c, #b87a38);
    clip-path: polygon(50% 0%, 100% 55%, 50% 100%, 0% 55%);
  }
  .digital-prev .dp-mound {
    position: absolute;
    left: 44%; top: 44%;
    width: 12%; height: 8%;
    background: #b87b3a;
    border-radius: 50%;
  }

  /* 도트 미리보기 */
  .dot-prev {
    background: #090f0a;
    image-rendering: pixelated;
  }
  .dot-prev .dp-field {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      #38a020 0px, #38a020 4px,
      #2d8018 4px, #2d8018 8px
    );
    clip-path: polygon(10% 100%, 10% 65%, 50% 20%, 90% 65%, 90% 100%);
  }
  .dot-prev .dp-dirt {
    position: absolute;
    left: 28%; right: 28%; top: 38%; bottom: 8%;
    background: repeating-linear-gradient(
      to bottom,
      #c87832 0px, #c87832 4px,
      #b06820 4px, #b06820 8px
    );
    clip-path: polygon(50% 0%, 100% 55%, 50% 100%, 0% 55%);
  }
  .dot-prev .dp-mound {
    position: absolute;
    left: 44%; top: 44%;
    width: 12%; height: 8%;
    background: #b87030;
  }

  .style-label {
    font-size: 13px;
    font-weight: 700;
    color: #d8e8ff;
  }
  .style-card.active .style-label { color: #7ab4ff; }

  .style-desc {
    font-size: 10px;
    color: #4a6a8a;
    text-align: center;
    line-height: 1.3;
  }

  /* 레트로 미리보기 */
  .retro-prev {
    background: #0a0f18;
    image-rendering: pixelated;
  }
  .retro-prev .dp-field {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      #3a6832 0px, #3a6832 4px,
      #2d5828 4px, #2d5828 8px
    );
    clip-path: polygon(10% 100%, 10% 65%, 50% 20%, 90% 65%, 90% 100%);
  }
  .retro-prev .dp-dirt {
    position: absolute;
    left: 28%; right: 28%; top: 38%; bottom: 8%;
    background: repeating-linear-gradient(
      to bottom,
      #b07a30 0px, #b07a30 4px,
      #8c5c20 4px, #8c5c20 8px
    );
    clip-path: polygon(50% 0%, 100% 55%, 50% 100%, 0% 55%);
  }
  .retro-prev .dp-mound {
    position: absolute;
    left: 44%; top: 44%;
    width: 12%; height: 8%;
    background: #e8e8c8;
  }
</style>
