<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore, teamsL10n } from "../../../shared/stores/master";

  let resolving = false;

  $: p = $gameStore.protagonist;
  $: teamById = new Map(($teamsL10n ?? []).map((t) => [t.id, t.name]));

  // W50 메시지에서 후보 목록 파싱
  $: candidateMsg = $gameStore.mailbox.find((m) =>
    m.id.startsWith("msg-sports-candidates-")
  ) ?? null;

  $: candidateLines = (() => {
    if (!candidateMsg) return [];
    return candidateMsg.body
      .split("\n")
      .filter((l) => /^\d+위/.test(l))
      .slice(0, 30);
  })();

  async function apply() {
    if (resolving) return;
    resolving = true;
    gameStore.setSportsUnitApplied(true);
    seasonStore.resolvePendingAction("sportsUnitApplication");
    await gameStore.save();
    resolving = false;
  }

  async function decline() {
    if (resolving) return;
    resolving = true;
    seasonStore.resolvePendingAction("sportsUnitApplication");
    await gameStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="chip">병역</p>
      <h2>체육부대 입대 신청</h2>
      <p class="sub">이번 시즌 체육부대 후보 30인이 거론되고 있습니다.<br>신청하면 W52에 최종 선발 결과가 발표됩니다.</p>
    </header>

    <div class="candidate-list">
      <p class="list-title">후보 루머 (OVR 기준)</p>
      <div class="list-scroll">
        {#each candidateLines as line}
          <p class="list-row">{line}</p>
        {/each}
        {#if candidateLines.length === 0}
          <p class="list-empty">후보 정보 없음</p>
        {/if}
      </div>
      <p class="list-note">실제 신청자는 다를 수 있습니다.</p>
    </div>

    <div class="info-row">
      <span>현재 OVR</span>
      <strong>{p.pitching.ovr}</strong>
    </div>

    <div class="actions">
      <button class="btn-decline" disabled={resolving} on:click={decline}>이번엔 아니오</button>
      <button class="btn-apply" disabled={resolving} on:click={apply}>신청하기</button>
    </div>
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(10, 18, 38, 0.52); display:flex; align-items:center; justify-content:center; z-index:245; }
  .modal { width:min(500px,92vw); background:var(--panel); border:1px solid var(--ink-mute); border-radius:12px; padding:24px; display:grid; gap:14px; max-height:88vh; overflow-y:auto; }
  .chip { margin:0; font-size:11px; color:var(--ink); }
  h2 { margin:4px 0 0; color:var(--ink); }
  .sub { margin:4px 0 0; color:var(--ink); font-size:13px; line-height:1.5; }
  .candidate-list { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; display:grid; gap:6px; }
  .list-title { margin:0; font-size:11px; color:var(--ink-mid); font-weight:700; letter-spacing:.5px; }
  .list-scroll { max-height:200px; overflow-y:auto; display:grid; gap:2px; }
  .list-row { margin:0; color:var(--ink); font-size:12px; font-variant-numeric:tabular-nums; padding:2px 0; border-bottom:1px solid var(--panel-sunk); }
  .list-empty { margin:0; color:var(--ink-mute); font-size:12px; }
  .list-note { margin:0; font-size:11px; color:var(--ink-mute); font-style:italic; }
  .info-row { display:flex; justify-content:space-between; align-items:center; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:8px 14px; font-size:13px; color:var(--ink); }
  .info-row strong { color:var(--ink); }
  .actions { display:flex; gap:10px; justify-content:flex-end; }
  .btn-decline { border:1px solid var(--line); background:var(--panel); color:var(--ink); border-radius:8px; padding:9px 16px; cursor:pointer; font-size:13px; }
  .btn-apply { border:1px solid var(--ok); background:rgba(31, 122, 71, 0.10); color:var(--ok); border-radius:8px; padding:9px 20px; cursor:pointer; font-size:13px; font-weight:700; }
  button:disabled { opacity:.5; cursor:default; }
</style>
