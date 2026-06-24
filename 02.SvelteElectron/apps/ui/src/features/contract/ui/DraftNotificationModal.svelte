<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import { generateKblSchedule } from "../../../shared/utils/scheduleGen";
  import type { PendingAction } from "../../../shared/types/season";

  export let action: Extract<PendingAction, { type: "draftNotification" }>;

  let resolving = false;

  $: teamName = $masterStore.teams.find((t) => t.id === action.teamId)?.name ?? action.teamId;
  $: totalValue = action.salary * action.durationYears + action.signingBonus;

  function formatSalary(v: number): string {
    if (v >= 10000) return `${(v / 10000).toFixed(1)}억`;
    return `${v.toLocaleString()}만`;
  }

  function ordinal(n: number): string {
    return `${n}번`;
  }

  async function accept() {
    if (resolving) return;
    resolving = true;
    const contract = {
      teamId:         action.teamId,
      leagueId:       action.leagueId,
      salary:         action.salary,
      durationYears:  action.durationYears,
      remainingYears: action.durationYears,
      signingBonus:   action.signingBonus,
      teamOptionYears:   0,
      playerOptionYears: 0,
      noTrade: false,
      status: "active" as const,
    };
    gameStore.signContract(contract);
    const proTeamIds = $masterStore.teams
      .filter((t) => t.leagueId === action.leagueId)
      .map((t) => t.id);
    const seasonYear = ($seasonStore.seasonYear || 2026) + 1;
    seasonStore.initSeason(action.leagueId, seasonYear, 52, proTeamIds);
    seasonStore.setSchedule(await generateKblSchedule(proTeamIds, action.teamId));
    gameStore.clearCareerResults();
    gameStore.setCareerApplicationsSubmitted(false);
    seasonStore.resolvePendingAction("draftNotification");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function reject() {
    if (resolving) return;
    resolving = true;
    seasonStore.resolvePendingAction("draftNotification");

    if (action.altUniversityTeamId) {
      gameStore.applyDraftDecision({ stage: "university", leagueId: "LEAGUE_UNIVERSITY", teamId: action.altUniversityTeamId });
      gameStore.setCareerFinalChoice("university");
    } else if (action.altIndependentTeamId) {
      gameStore.applyDraftDecision({ stage: "independent", leagueId: "LEAGUE_INDEPENDENT", teamId: action.altIndependentTeamId });
      gameStore.setCareerFinalChoice("independent");
      const ovr = $gameStore.protagonist.pitching?.ovr ?? $gameStore.protagonist.batting?.ovr ?? 50;
      seasonStore.pushPendingAction({
        type: "salaryNegotiation",
        teamId: action.altIndependentTeamId,
        leagueId: "LEAGUE_INDEPENDENT",
        offeredSalary: Math.max(800, Math.round((ovr - 40) * 60)),
        durationYears: 1,
        minDurationYears: 1,
        maxDurationYears: 1,
        signingBonus: 0,
        context: "initial",
      });
    } else {
      const slotId = $gameStore.currentSlotId;
      const proto = $gameStore.protagonist;
      const seasonYear = $seasonStore.seasonYear;
      gameStore.enlistMilitary("general", 52, false, seasonYear);
      seasonStore.initSeason("LEAGUE_MILITARY", (seasonYear || 2026) + 1, 100, []);
      seasonStore.setSchedule([]);
      gameStore.setCareerFinalChoice("general");
      if (slotId) {
        await window.projectB!.leagueAddTransactions(JSON.stringify({
          slotId, rows: [{ seasonYear, week: 52, category: "military",
            playerId: proto.id, playerName: proto.name,
            fromTeamId: proto.teamId || null, fromLeagueId: proto.leagueId || null,
            detail: "일반병 입대" }],
        }));
      }
    }

    gameStore.clearCareerResults();
    gameStore.setCareerApplicationsSubmitted(false);
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="badge">드래프트 지명 통보</p>
      <h2>{teamName}</h2>
      <p class="pick-info">{action.round}라운드 {ordinal(action.pickNo % 8 || 8)}순위 (전체 {action.pickNo}번)</p>
    </header>

    <div class="contract-card">
      <div class="ci">
        <span>연봉</span>
        <strong>{formatSalary(action.salary)}원 / 년</strong>
      </div>
      <div class="ci">
        <span>계약 기간</span>
        <strong>{action.durationYears}년</strong>
      </div>
      <div class="ci">
        <span>계약금</span>
        <strong>{formatSalary(action.signingBonus)}원</strong>
      </div>
      <div class="ci total">
        <span>총 계약액</span>
        <strong>{formatSalary(totalValue)}원</strong>
      </div>
    </div>

    <p class="notice">구단 제시 조건으로 계약이 진행됩니다. 협상은 불가합니다.</p>

    {#if action.altUniversityTeamId || action.altIndependentTeamId}
      <p class="alt-notice">거부 시 {action.altUniversityTeamId ? "대학" : "독립리그"}로 진로를 변경합니다.</p>
    {:else}
      <p class="alt-notice warn">거부 시 대안 없음 — 현역 입대로 처리됩니다.</p>
    {/if}

    <div class="actions">
      <button class="btn-accept" disabled={resolving} on:click={accept}>입단하기</button>
      <button class="btn-reject" disabled={resolving} on:click={reject}>
        {action.altUniversityTeamId ? "거부 (대학 진학)" : action.altIndependentTeamId ? "거부 (독립리그)" : "거부 (현역 입대)"}
      </button>
    </div>
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.78); display:flex; align-items:center; justify-content:center; z-index:225; }
  .modal { width:min(500px,92vw); background:#0d1a30; border:1px solid #3a5a8a; border-radius:16px; padding:26px; display:grid; gap:16px; }
  .badge { margin:0; font-size:11px; color:#7aace0; text-transform:uppercase; letter-spacing:.05em; }
  h2 { margin:4px 0 0; color:#eef6ff; font-size:20px; }
  .pick-info { margin:2px 0 0; color:#8aabda; font-size:13px; }

  .contract-card { background:#0a1828; border:1px solid #2d4d7a; border-radius:12px; padding:16px; display:grid; gap:10px; }
  .ci { display:flex; justify-content:space-between; align-items:center; }
  .ci span { color:#7a9ac8; font-size:13px; }
  .ci strong { color:#d8eaff; font-size:14px; }
  .ci.total { border-top:1px solid #2d4d7a; padding-top:10px; margin-top:2px; }
  .ci.total strong { color:#5bb8ff; font-size:16px; }

  .notice { margin:0; color:#8aabda; font-size:12px; }
  .alt-notice { margin:0; font-size:12px; color:#a8c4e8; background:#112240; border-radius:8px; padding:8px 12px; }
  .alt-notice.warn { color:#f0b070; background:#2a1a0a; }

  .actions { display:flex; gap:10px; }
  .btn-accept { flex:2; background:#1a4d99; color:#e6f1ff; border:1px solid #3868c0; border-radius:10px; padding:11px; cursor:pointer; font-size:14px; font-weight:600; }
  .btn-accept:not(:disabled):hover { background:#2558b0; }
  .btn-reject { flex:1; background:#1e1e1e; color:#a0a0a0; border:1px solid #3a3a3a; border-radius:10px; padding:11px; cursor:pointer; font-size:13px; }
  .btn-reject:not(:disabled):hover { background:#2a2a2a; }
  button:disabled { opacity:.5; cursor:default; }
</style>
