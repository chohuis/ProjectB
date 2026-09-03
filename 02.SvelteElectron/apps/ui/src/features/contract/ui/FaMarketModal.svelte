<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore, teamsL10n } from "../../../shared/stores/master";
  import { signFaOffer, waitFaMarket } from "../../../shared/usecases/contractDecision";
  import { generateFaOffers, isFaEligible, getFaThreshold, type FaOffer } from "../../../shared/utils/faEngine";
  import { faOfferTermLines } from "../../../shared/utils/faOfferTerms";

  /**
   * 제안 카드는 **연봉·기간 두 줄뿐이었다** (PLAN_CONTRACT_TERMS §1-2 · §7 ②).
   * Rust `eval_fa_bid` 가 내는 계약금·팀 옵션·노트레이드가 `toContract` 로
   * 계약에 그대로 들어가는데, 고르기 전에는 안 보이고 **서명한 뒤 선수 상세에서야**
   * 보였다. 줄은 `faOfferTermLines` 가 만든다 — 항목 이름을 화면에 적지 않는다.
   */

  let resolving = false;
  let selectedTeamId: string | null = null;
  let raiseRatio = 0;
  let offers: FaOffer[] = [];
  let lastCounterMessage = "";

  $: if (offers.length === 0 && $teamsL10n.length > 0) {
    generateFaOffers($gameStore.protagonist, $teamsL10n).then((o) => (offers = o));
  }
  $: selectedOffer = offers.find((o) => o.teamId === selectedTeamId) ?? offers[0] ?? null;
  $: requestedSalary = selectedOffer ? Math.round(selectedOffer.salary * (1 + raiseRatio)) : 0;
  $: acceptedByTeam = selectedOffer ? requestedSalary <= Math.round(selectedOffer.salary * 1.12) : false;
  $: negotiationRound = $gameStore.protagonist.faNegotiationRound ?? 0;
  $: unsignedWeeks = $gameStore.protagonist.faUnsignedWeeks ?? 0;
  $: faEligible = isFaEligible($gameStore.protagonist, $gameStore.schoolState.attendsUniversity);

  async function signWithOffer() {
    if (resolving || !selectedOffer) return;
    resolving = true;
    await signFaOffer(selectedOffer, requestedSalary);
    resolving = false;
  }

  async function submitCounter() {
    if (resolving || !selectedOffer || negotiationRound >= 2) return;
    if (acceptedByTeam) { await signWithOffer(); return; }
    resolving = true;
    gameStore.incrementFaNegotiationRound();
    const improvedSalary = Math.round((selectedOffer.salary + requestedSalary) / 2);
    offers = offers.map((o) =>
      o.teamId === selectedOffer.teamId
        ? { ...o, salary: improvedSalary, signingBonus: Math.round(improvedSalary * 0.15) }
        : o,
    );
    raiseRatio = 0;
    lastCounterMessage = `역제안 ${negotiationRound + 1}회 제출: 구단 재제시 ${improvedSalary.toLocaleString()}만원`;
    resolving = false;
  }

  async function waitMore() {
    if (resolving) return;
    resolving = true;
    await waitFaMarket();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <h2>FA 시장</h2>
    <p>미계약 경과: {unsignedWeeks}주 (경과 시 제시 조건 하락)</p>
    {#if !faEligible}
      <p class="warn">FA 자격 미충족 (프로 입단 후 {getFaThreshold($gameStore.protagonist.leagueId)}년 기준)</p>
    {/if}
    <div class="offers">
      {#each offers as offer}
        <button class:selected={selectedOffer?.teamId === offer.teamId} on:click={() => { selectedTeamId = offer.teamId; raiseRatio = 0; }}>
          <strong>{$teamsL10n.find((t) => t.id === offer.teamId)?.name ?? offer.teamId}</strong>
          <span>{offer.salary.toLocaleString()}만원 / {offer.durationYears}년</span>
          {#each faOfferTermLines(offer) as term (term.key)}
            <span class="term"><span class="term-label">{term.label}</span>{#if term.value}<span class="term-val">{term.value}</span>{/if}</span>
          {/each}
        </button>
      {/each}
    </div>

    {#if selectedOffer}
      <div class="detail">
        <p>요청 연봉: {requestedSalary.toLocaleString()}만원</p>
        <p>협상 왕복: {negotiationRound}/2</p>
        <input type="range" min="-0.1" max="0.2" step="0.01" bind:value={raiseRatio} />
        {#if !acceptedByTeam}
          <p class="warn">요청 금액이 높아 결렬 가능성이 있습니다.</p>
        {/if}
        {#if lastCounterMessage}
          <p>{lastCounterMessage}</p>
        {/if}
      </div>
      <div class="actions">
        <button disabled={resolving || !faEligible || !acceptedByTeam} on:click={signWithOffer}>계약 체결</button>
        <button disabled={resolving || !faEligible || negotiationRound >= 2} on:click={submitCounter}>역제안 제출</button>
        <button disabled={resolving} on:click={waitMore}>보류</button>
      </div>
    {/if}
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(10, 18, 38, 0.52); display:flex; align-items:center; justify-content:center; z-index:240; }
  .modal { width:min(760px,95vw); background:var(--panel); border:1px solid var(--ink-mute); border-radius:12px; padding:20px; display:grid; gap:12px; }
  h2 { margin:0; color:var(--ink); }
  .offers { display:grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap:8px; }
  .offers button { text-align:left; border:1px solid var(--ink-mute); background:var(--panel-sunk); color:var(--ink); border-radius:8px; padding:10px; display:grid; gap:4px; cursor:pointer; }
  .offers button.selected { border-color:var(--ink-mid); background:var(--line); }
  .offers strong { font-size:14px; }
  .offers span { font-size:12px; color:var(--ink); }
  /* 조건 줄 — 항목 이름과 값 둘뿐이다. 있는 조항만 그린다 */
  .offers .term { display:flex; justify-content:space-between; gap:8px; font-size:11px; color:var(--ink-mid); }
  .offers .term-label { font-size:11px; color:var(--ink-mid); }
  .offers .term-val { font-size:11px; color:var(--ink); }
  .detail p { margin:0; color:var(--ink); }
  .warn { color:var(--warn); font-size:12px; margin-top:6px; }
  .actions { display:flex; gap:10px; justify-content:flex-end; }
  .actions button { border:1px solid var(--ink-mute); background:var(--panel-sunk); color:var(--ink); border-radius:8px; padding:8px 12px; cursor:pointer; }
  .actions button:disabled { opacity:.55; cursor:default; }
</style>
