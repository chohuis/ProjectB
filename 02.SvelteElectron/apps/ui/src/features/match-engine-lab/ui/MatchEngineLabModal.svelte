<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import type {
    MatchEngineSimMetrics,
    MatchEngineSmokeThresholds,
    MatchEngineTuningPayload,
  } from "../../../../shared/types/projectb";

  export let open = false;
  const dispatch = createEventDispatcher<{ close: void }>();

  let loading = false;
  let saving = false;
  let applying = false;
  let simulating = false;
  let forceSave = false;
  let statusMsg = "";
  let errorMsg = "";
  let validationErrors: string[] = [];
  let smokeGateFailures: string[] = [];
  let simGames = 100;
  let simSummary: MatchEngineSimMetrics | null = null;
  let smokeThresholds: MatchEngineSmokeThresholds | null = null;
  const DEFAULT_TUNING: MatchEngineTuningPayload = {
    version: 1,
    updatedBy: "fallback",
    pitchBase: { fastball: 63, slider: 60, curve: 58, changeup: 57 },
    strategyBonus: { aggressive: 2, balanced: 0, safe: -2 },
    powerBonus: { low: -1.5, normal: 0, high: 2.8 },
    locationBonus: { "1": 3, "2": 0, "3": 3, "4": 0, "5": -4, "6": 0, "7": 3, "8": 0, "9": 3 },
    staminaBase: 0.85,
    staminaAggressiveBonus: 0.25,
    staminaFastballBonus: 0.2,
    staminaPowerCost: { low: 0.1, normal: 0.3, high: 0.55 },
    mentalRecoveryOnInningEnd: 1.5,
    hitUpgradeSingleToDoubleBase: 0.15,
    hitUpgradeDoubleToHomeRunBase: 0.05,
    weatherPowerModifier: { sunny: 0, cloudy: 0, rainy: 0, windy_in: -0.1, windy_out: 0.1 },
    weatherQualityModifier: { rainyFastball: -1, rainyBreaking: -3, windyOut: -2, windyIn: 2, cloudy: -0.5 },
    parkQualityModifier: { neutral: 0, pitcher_park: 3, hitter_park: -3, dome: 0 },
    doublePlayBaseProb: 0.4,
  };
  let tuning: MatchEngineTuningPayload | null = structuredClone(DEFAULT_TUNING);

  onMount(async () => {
    if (open) await loadTuning();
  });

  $: if (open && !tuning && !loading) void loadTuning();

  function close() {
    dispatch("close");
  }

  function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async function loadTuning() {
    loading = true;
    errorMsg = "";
    statusMsg = "";
    try {
      const res = await window.projectB?.tuningLoad?.();
      if (!res?.ok || !res.data) {
        errorMsg = res?.error ?? "튜닝 데이터를 불러오지 못했습니다.";
        if (!tuning) tuning = structuredClone(DEFAULT_TUNING);
        return;
      }
      tuning = structuredClone(res.data);
      statusMsg = "튜닝 설정을 불러왔습니다.";
    } catch (e) {
      errorMsg = String(e);
      if (!tuning) tuning = structuredClone(DEFAULT_TUNING);
    } finally {
      loading = false;
    }
  }

  async function validateCurrent() {
    validationErrors = [];
    if (!tuning) return false;
    const res = await window.projectB?.tuningValidate?.({ tuning });
    if (!res?.ok) {
      validationErrors = res?.errors ?? ["유효성 검사 실패"];
      return false;
    }
    return true;
  }

  async function applySession() {
    if (!tuning) return;
    applying = true;
    errorMsg = "";
    statusMsg = "";
    smokeGateFailures = [];
    const valid = await validateCurrent();
    if (!valid) {
      applying = false;
      return;
    }
    const res = await window.projectB?.tuningApply?.({ tuning });
    if (!res?.ok) {
      errorMsg = res?.error ?? "세션 반영 실패";
      validationErrors = res?.details ?? [];
    } else {
      statusMsg = "세션에 즉시 반영되었습니다. (파일 저장 전)";
      if (res.smoke) simSummary = res.smoke;
      smokeGateFailures = res.smokeGate?.failures ?? [];
    }
    applying = false;
  }

  async function saveTuning() {
    if (!tuning) return;
    saving = true;
    errorMsg = "";
    statusMsg = "";
    smokeGateFailures = [];
    const valid = await validateCurrent();
    if (!valid) {
      saving = false;
      return;
    }
    const res = await window.projectB?.tuningSave?.({
      tuning: { ...tuning, updatedBy: "admin-ui" },
      forceSave,
    });
    if (!res?.ok) {
      errorMsg = res?.error ?? "저장 실패";
      validationErrors = res?.details ?? [];
      smokeGateFailures = res?.gateFailed ? (res?.details ?? []) : [];
      if (res?.smoke) simSummary = res.smoke;
      if (res?.thresholds) smokeThresholds = res.thresholds;
    } else {
      if (res.data) tuning = structuredClone(res.data);
      if (res.smoke) simSummary = res.smoke;
      if (res.thresholds) smokeThresholds = res.thresholds;
      statusMsg = res.gateBypassed
        ? "강제 저장 완료 (Smoke Gate 우회)"
        : "저장 완료. Debug/Release 공통 설정에 반영되었습니다.";
    }
    saving = false;
  }

  async function runSimulation() {
    const games = Math.max(1, Math.min(1000, Math.floor(simGames)));
    simulating = true;
    errorMsg = "";
    try {
      const res = await window.projectB?.tuningSmoke?.({ tuning: tuning ?? undefined, games });
      if (!res?.ok) throw new Error(res?.error ?? "tuningSmoke failed");
      simSummary = res.smoke ?? null;
      smokeThresholds = res.thresholds ?? null;
      smokeGateFailures = res.smokeGate?.failures ?? [];
    } catch (e) {
      errorMsg = `시뮬레이션 실패: ${String(e)}`;
    } finally {
      simulating = false;
    }
  }
</script>

{#if open}
  <div class="backdrop" role="presentation" on:click={close}>
    <section class="modal" role="dialog" aria-label="매치 엔진 시뮬레이터" on:click|stopPropagation>
      <header>
        <h2>매치 엔진 시뮬레이터 (관리자)</h2>
        <div class="row">
          <button type="button" class="ghost" on:click={loadTuning} disabled={loading}>다시 불러오기</button>
          <button type="button" class="ghost" on:click={close}>닫기</button>
        </div>
      </header>

      {#if errorMsg}<p class="msg err">{errorMsg}</p>{/if}
      {#if statusMsg}<p class="msg ok">{statusMsg}</p>{/if}

      {#if tuning}
        <div class="grid">
          <section class="card">
            <h3>투구 기본 점수</h3>
            <p class="hint">구종별 기본 quality 베이스값</p>
            <label>패스트볼 <input type="number" bind:value={tuning.pitchBase.fastball} on:input={(e) => tuning!.pitchBase.fastball = num((e.target as HTMLInputElement).value)} /></label>
            <label>슬라이더 <input type="number" bind:value={tuning.pitchBase.slider} on:input={(e) => tuning!.pitchBase.slider = num((e.target as HTMLInputElement).value)} /></label>
            <label>커브 <input type="number" bind:value={tuning.pitchBase.curve} on:input={(e) => tuning!.pitchBase.curve = num((e.target as HTMLInputElement).value)} /></label>
            <label>체인지업 <input type="number" bind:value={tuning.pitchBase.changeup} on:input={(e) => tuning!.pitchBase.changeup = num((e.target as HTMLInputElement).value)} /></label>
          </section>

          <section class="card">
            <h3>전략/파워 보정</h3>
            <p class="hint">+는 투수 유리, -는 타자 유리</p>
            <label>strategy.aggressive <input type="number" step="0.1" bind:value={tuning.strategyBonus.aggressive} on:input={(e) => tuning!.strategyBonus.aggressive = num((e.target as HTMLInputElement).value)} /></label>
            <label>strategy.balanced <input type="number" step="0.1" bind:value={tuning.strategyBonus.balanced} on:input={(e) => tuning!.strategyBonus.balanced = num((e.target as HTMLInputElement).value)} /></label>
            <label>strategy.safe <input type="number" step="0.1" bind:value={tuning.strategyBonus.safe} on:input={(e) => tuning!.strategyBonus.safe = num((e.target as HTMLInputElement).value)} /></label>
            <label>power.low <input type="number" step="0.1" bind:value={tuning.powerBonus.low} on:input={(e) => tuning!.powerBonus.low = num((e.target as HTMLInputElement).value)} /></label>
            <label>power.normal <input type="number" step="0.1" bind:value={tuning.powerBonus.normal} on:input={(e) => tuning!.powerBonus.normal = num((e.target as HTMLInputElement).value)} /></label>
            <label>power.high <input type="number" step="0.1" bind:value={tuning.powerBonus.high} on:input={(e) => tuning!.powerBonus.high = num((e.target as HTMLInputElement).value)} /></label>
          </section>

          <section class="card">
            <h3>로케이션 보정 (1~9)</h3>
            <p class="hint">스트라이크존 위치별 quality 보정</p>
            <label>zone 1 <input type="number" step="0.1" bind:value={tuning.locationBonus["1"]} on:input={(e) => tuning!.locationBonus["1"] = num((e.target as HTMLInputElement).value)} /></label>
            <label>zone 2 <input type="number" step="0.1" bind:value={tuning.locationBonus["2"]} on:input={(e) => tuning!.locationBonus["2"] = num((e.target as HTMLInputElement).value)} /></label>
            <label>zone 3 <input type="number" step="0.1" bind:value={tuning.locationBonus["3"]} on:input={(e) => tuning!.locationBonus["3"] = num((e.target as HTMLInputElement).value)} /></label>
            <label>zone 4 <input type="number" step="0.1" bind:value={tuning.locationBonus["4"]} on:input={(e) => tuning!.locationBonus["4"] = num((e.target as HTMLInputElement).value)} /></label>
            <label>zone 5 <input type="number" step="0.1" bind:value={tuning.locationBonus["5"]} on:input={(e) => tuning!.locationBonus["5"] = num((e.target as HTMLInputElement).value)} /></label>
            <label>zone 6 <input type="number" step="0.1" bind:value={tuning.locationBonus["6"]} on:input={(e) => tuning!.locationBonus["6"] = num((e.target as HTMLInputElement).value)} /></label>
            <label>zone 7 <input type="number" step="0.1" bind:value={tuning.locationBonus["7"]} on:input={(e) => tuning!.locationBonus["7"] = num((e.target as HTMLInputElement).value)} /></label>
            <label>zone 8 <input type="number" step="0.1" bind:value={tuning.locationBonus["8"]} on:input={(e) => tuning!.locationBonus["8"] = num((e.target as HTMLInputElement).value)} /></label>
            <label>zone 9 <input type="number" step="0.1" bind:value={tuning.locationBonus["9"]} on:input={(e) => tuning!.locationBonus["9"] = num((e.target as HTMLInputElement).value)} /></label>
          </section>

          <section class="card">
            <h3>피로/멘탈</h3>
            <p class="hint">체력 소모/회복 관련 계수</p>
            <label>staminaBase <input type="number" step="0.01" bind:value={tuning.staminaBase} on:input={(e) => tuning!.staminaBase = num((e.target as HTMLInputElement).value)} /></label>
            <label>staminaAggressiveBonus <input type="number" step="0.01" bind:value={tuning.staminaAggressiveBonus} on:input={(e) => tuning!.staminaAggressiveBonus = num((e.target as HTMLInputElement).value)} /></label>
            <label>staminaFastballBonus <input type="number" step="0.01" bind:value={tuning.staminaFastballBonus} on:input={(e) => tuning!.staminaFastballBonus = num((e.target as HTMLInputElement).value)} /></label>
            <label>staminaPowerCost.low <input type="number" step="0.01" bind:value={tuning.staminaPowerCost.low} on:input={(e) => tuning!.staminaPowerCost.low = num((e.target as HTMLInputElement).value)} /></label>
            <label>staminaPowerCost.normal <input type="number" step="0.01" bind:value={tuning.staminaPowerCost.normal} on:input={(e) => tuning!.staminaPowerCost.normal = num((e.target as HTMLInputElement).value)} /></label>
            <label>staminaPowerCost.high <input type="number" step="0.01" bind:value={tuning.staminaPowerCost.high} on:input={(e) => tuning!.staminaPowerCost.high = num((e.target as HTMLInputElement).value)} /></label>
            <label>mentalRecoveryOnInningEnd <input type="number" step="0.1" bind:value={tuning.mentalRecoveryOnInningEnd} on:input={(e) => tuning!.mentalRecoveryOnInningEnd = num((e.target as HTMLInputElement).value)} /></label>
            <label>doublePlayBaseProb <input type="number" step="0.01" bind:value={tuning.doublePlayBaseProb} on:input={(e) => tuning!.doublePlayBaseProb = num((e.target as HTMLInputElement).value)} /></label>
          </section>

          <section class="card">
            <h3>장타/날씨 파워</h3>
            <p class="hint">장타 승격/날씨 파워 보정</p>
            <label>Single→Double <input type="number" step="0.01" bind:value={tuning.hitUpgradeSingleToDoubleBase} on:input={(e) => tuning!.hitUpgradeSingleToDoubleBase = num((e.target as HTMLInputElement).value)} /></label>
            <label>Double→HR <input type="number" step="0.01" bind:value={tuning.hitUpgradeDoubleToHomeRunBase} on:input={(e) => tuning!.hitUpgradeDoubleToHomeRunBase = num((e.target as HTMLInputElement).value)} /></label>
            <label>weatherPower.sunny <input type="number" step="0.01" bind:value={tuning.weatherPowerModifier.sunny} on:input={(e) => tuning!.weatherPowerModifier.sunny = num((e.target as HTMLInputElement).value)} /></label>
            <label>weatherPower.cloudy <input type="number" step="0.01" bind:value={tuning.weatherPowerModifier.cloudy} on:input={(e) => tuning!.weatherPowerModifier.cloudy = num((e.target as HTMLInputElement).value)} /></label>
            <label>weatherPower.rainy <input type="number" step="0.01" bind:value={tuning.weatherPowerModifier.rainy} on:input={(e) => tuning!.weatherPowerModifier.rainy = num((e.target as HTMLInputElement).value)} /></label>
            <label>weatherPower.windy_out <input type="number" step="0.01" bind:value={tuning.weatherPowerModifier.windy_out} on:input={(e) => tuning!.weatherPowerModifier.windy_out = num((e.target as HTMLInputElement).value)} /></label>
            <label>weatherPower.windy_in <input type="number" step="0.01" bind:value={tuning.weatherPowerModifier.windy_in} on:input={(e) => tuning!.weatherPowerModifier.windy_in = num((e.target as HTMLInputElement).value)} /></label>
          </section>

          <section class="card">
            <h3>날씨/구장 Quality</h3>
            <p class="hint">날씨/구장 상황 보정</p>
            <label>rainyFastball <input type="number" step="0.1" bind:value={tuning.weatherQualityModifier.rainyFastball} on:input={(e) => tuning!.weatherQualityModifier.rainyFastball = num((e.target as HTMLInputElement).value)} /></label>
            <label>rainyBreaking <input type="number" step="0.1" bind:value={tuning.weatherQualityModifier.rainyBreaking} on:input={(e) => tuning!.weatherQualityModifier.rainyBreaking = num((e.target as HTMLInputElement).value)} /></label>
            <label>windyOut <input type="number" step="0.1" bind:value={tuning.weatherQualityModifier.windyOut} on:input={(e) => tuning!.weatherQualityModifier.windyOut = num((e.target as HTMLInputElement).value)} /></label>
            <label>windyIn <input type="number" step="0.1" bind:value={tuning.weatherQualityModifier.windyIn} on:input={(e) => tuning!.weatherQualityModifier.windyIn = num((e.target as HTMLInputElement).value)} /></label>
            <label>cloudy <input type="number" step="0.1" bind:value={tuning.weatherQualityModifier.cloudy} on:input={(e) => tuning!.weatherQualityModifier.cloudy = num((e.target as HTMLInputElement).value)} /></label>
            <label>park.neutral <input type="number" step="0.1" bind:value={tuning.parkQualityModifier.neutral} on:input={(e) => tuning!.parkQualityModifier.neutral = num((e.target as HTMLInputElement).value)} /></label>
            <label>park.pitcher_park <input type="number" step="0.1" bind:value={tuning.parkQualityModifier.pitcher_park} on:input={(e) => tuning!.parkQualityModifier.pitcher_park = num((e.target as HTMLInputElement).value)} /></label>
            <label>park.hitter_park <input type="number" step="0.1" bind:value={tuning.parkQualityModifier.hitter_park} on:input={(e) => tuning!.parkQualityModifier.hitter_park = num((e.target as HTMLInputElement).value)} /></label>
            <label>park.dome <input type="number" step="0.1" bind:value={tuning.parkQualityModifier.dome} on:input={(e) => tuning!.parkQualityModifier.dome = num((e.target as HTMLInputElement).value)} /></label>
          </section>

          <section class="card">
            <h3>시뮬레이션</h3>
            <p class="hint">저장 전 배치 시뮬</p>
            <label>경기 수 <input type="number" min="1" max="1000" bind:value={simGames} /></label>
            <button type="button" on:click={runSimulation} disabled={simulating || saving || applying}>배치 시뮬 실행</button>
            {#if simSummary}
              <div class="summary">
                <p>Games: {simSummary.games}</p>
                <p>Avg Score (Away/Home/Total): {simSummary.avgAway} / {simSummary.avgHome} / {simSummary.avgTotalScore}</p>
                <p>Avg Pitches: {simSummary.avgPitches} (P50:{simSummary.p50Pitches}, P90:{simSummary.p90Pitches})</p>
                <p>BB% / K% / HR%: {simSummary.bbRate}% / {simSummary.kRate}% / {simSummary.hrRate}%</p>
                <p>Result Rates(%): {Object.entries(simSummary.resultRates).map(([k,v]) => `${k}:${v}`).join(", ")}</p>
                {#if smokeThresholds}
                  <p class="hint">Gate Range: Score {smokeThresholds.avgTotalScore.min}~{smokeThresholds.avgTotalScore.max}, BB {smokeThresholds.bbRate.min}~{smokeThresholds.bbRate.max}, K {smokeThresholds.kRate.min}~{smokeThresholds.kRate.max}, HR {smokeThresholds.hrRate.min}~{smokeThresholds.hrRate.max}, Pitches {smokeThresholds.avgPitches.min}~{smokeThresholds.avgPitches.max}</p>
                {/if}
              </div>
            {/if}
          </section>
        </div>

        {#if validationErrors.length > 0}
          <section class="errors">
            {#each validationErrors as e}<p>{e}</p>{/each}
          </section>
        {/if}
        {#if smokeGateFailures.length > 0}
          <section class="errors">
            <p>Smoke Gate 실패:</p>
            {#each smokeGateFailures as e}<p>{e}</p>{/each}
          </section>
        {/if}

        <footer>
          <label class="check">
            <input type="checkbox" bind:checked={forceSave} />
            Gate 실패 시 강제 저장
          </label>
          <button type="button" class="ghost" on:click={applySession} disabled={applying || saving}>
            {applying ? "적용 중..." : "세션 즉시 반영"}
          </button>
          <button type="button" class="primary" on:click={saveTuning} disabled={saving || applying}>
            {saving ? "저장 중..." : "저장 (실환경 반영)"}
          </button>
        </footer>
      {/if}
    </section>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 92; background: rgba(4, 10, 20, 0.78); display: grid; place-items: center; padding: 18px; }
  .modal { width: min(1100px, 95vw); max-height: 90vh; overflow: auto; background: #101d32; border: 1px solid #385682; border-radius: 12px; padding: 14px; display: grid; gap: 10px; }
  header, footer, .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h2, h3, p { margin: 0; color: #dbe8ff; }
  .msg { font-size: 12px; }
  .msg.err { color: #ff8a8a; }
  .msg.ok { color: #9de6ab; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .card { border: 1px solid #2d476d; border-radius: 10px; background: #152744; padding: 10px; display: grid; gap: 8px; }
  label { display: grid; gap: 4px; font-size: 12px; color: #a9c2e7; }
  input { background: #0f1b30; border: 1px solid #35547f; border-radius: 6px; color: #eaf2ff; padding: 6px 8px; }
  button { border: 1px solid #426898; background: #183053; color: #e8f2ff; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
  button.primary { background: linear-gradient(180deg, #3f7ee4, #2f5cae); border-color: #6998ea; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  .summary { font-size: 12px; color: #bfd2ef; display: grid; gap: 4px; }
  .hint { font-size: 11px; color: #8faed8; line-height: 1.35; }
  .check { display: inline-flex; align-items: center; gap: 6px; color: #a9c2e7; font-size: 12px; }
  .errors { border: 1px solid #7a3343; background: rgba(122, 51, 67, 0.18); border-radius: 8px; padding: 8px; display: grid; gap: 4px; }
  .errors p { color: #ffb4c3; font-size: 12px; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>
