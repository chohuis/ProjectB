<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import { generateKblSchedule, generateAblSchedule } from "../../../shared/utils/scheduleGen";
  import { shuffleAblConferences } from "../../../shared/utils/postseasonEngine";
  import { generateFaOffers, isFaEligible, toContract, type FaOffer } from "../../../shared/utils/faEngine";

  let resolving = false;
  let selectedTeamId: string | null = null;
  let raiseRatio = 0;
  let offers: FaOffer[] = [];
  let lastCounterMessage = "";

  $: if (offers.length === 0 && $masterStore.teams.length > 0) {
    generateFaOffers($gameStore.protagonist, $masterStore.teams).then((o) => (offers = o));
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
    const offer: FaOffer = { ...selectedOffer, salary: requestedSalary };
    const contract = toContract(offer);
    gameStore.signContract(contract);
    gameStore.resetFaProgress();

    const proTeamIds = $masterStore.teams.filter((t) => t.leagueId === contract.leagueId).map((t) => t.id);
    const seasonYear = ($seasonStore.seasonYear || 2026) + 1;
    const isAbl = contract.leagueId === "LEAGUE_ABL";
    const totalWeeks = isAbl ? 33 : 30;
    seasonStore.initSeason(contract.leagueId, seasonYear, totalWeeks, proTeamIds);
    seasonStore.setSchedule(
      isAbl
        ? await generateAblSchedule(proTeamIds, contract.teamId)
        : await generateKblSchedule(proTeamIds, contract.teamId),
    );
    if (isAbl) {
      const { east, west } = await shuffleAblConferences(proTeamIds);
      seasonStore.setAblConferences(east, west);
    }
    seasonStore.resolvePendingAction("faMarket");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function submitCounter() {
    if (resolving || !selectedOffer || negotiationRound >= 2) return;
    resolving = true;
    if (acceptedByTeam) {
      await signWithOffer();
      resolving = false;
      return;
    }
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
    gameStore.incrementFaUnsignedWeek();
    gameStore.resetFaProgress();
    seasonStore.resolvePendingAction("faMarket");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <h2>FA 시장</h2>
    <p>미계약 경과: {unsignedWeeks}주 (경과 시 제시 조건 하락)</p>
    {#if !faEligible}
      <p class="warn">FA 자격 미충족(고졸 9년/대졸 8년 기준)</p>
    {/if}
    <div class="offers">
      {#each offers as offer}
        <button class:selected={selectedOffer?.teamId === offer.teamId} on:click={() => { selectedTeamId = offer.teamId; raiseRatio = 0; }}>
          <strong>{$masterStore.teams.find((t) => t.id === offer.teamId)?.name ?? offer.teamId}</strong>
          <span>{offer.salary.toLocaleString()}만원 / {offer.durationYears}년</span>
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
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.74); display:flex; align-items:center; justify-content:center; z-index:240; }
  .modal { width:min(760px,95vw); background:#101f39; border:1px solid #3f6498; border-radius:12px; padding:20px; display:grid; gap:12px; }
  h2 { margin:0; color:#eef6ff; }
  .offers { display:grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap:8px; }
  .offers button { text-align:left; border:1px solid #3d6196; background:#172b4c; color:#e7f1ff; border-radius:8px; padding:10px; display:grid; gap:4px; cursor:pointer; }
  .offers button.selected { border-color:#6da1ee; background:#1f3a67; }
  .offers strong { font-size:14px; }
  .offers span { font-size:12px; color:#bed3f1; }
  .detail p { margin:0; color:#d2e3fa; }
  .warn { color:#f0cf97; font-size:12px; margin-top:6px; }
  .actions { display:flex; gap:10px; justify-content:flex-end; }
  .actions button { border:1px solid #3f6298; background:#1a3056; color:#e8f2ff; border-radius:8px; padding:8px 12px; cursor:pointer; }
  .actions button:disabled { opacity:.55; cursor:default; }
</style>
