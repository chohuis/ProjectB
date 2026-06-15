<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import type { PendingAction } from "../../../shared/types/season";

  export let action: Extract<PendingAction, { type: "trade" }>;

  let resolving = false;

  const TRADE_REASON_LABEL: Record<string, string> = {
    position_surplus:  "포지션 보강",
    injury_cover:      "부상 대체",
    seller_mode:       "전력 재편",
    buyer_mode:        "즉시전력 강화",
    expiring_contract: "계약 만료 선점",
    player_ambition:   "선수 이적 요청",
  };

  const POSITION_LABEL: Record<string, string> = {
    SP: "선발", RP: "중간계투", CP: "마무리",
    C: "포수", "1B": "1루수", "2B": "2루수", "3B": "3루수",
    SS: "유격수", LF: "좌익수", CF: "중견수", RF: "우익수", DH: "지명타자",
  };

  $: fromTeamName = $masterStore.teams.find((t) => t.id === action.fromTeamId)?.name ?? action.fromTeamId;
  $: toTeamName   = $masterStore.teams.find((t) => t.id === action.toTeamId)?.name   ?? action.toTeamId;
  $: hasNoTrade   = $gameStore.protagonist.contract?.noTrade ?? false;
  $: reasonLabel  = TRADE_REASON_LABEL[action.tradeReason] ?? action.tradeReason;
  $: posLabel     = POSITION_LABEL[action.receivedPosition] ?? action.receivedPosition;

  function formatSalary(v: number) {
    if (v >= 10000) return `${(v / 10000).toFixed(1)}억`;
    return `${v.toLocaleString()}만`;
  }

  // 메디컬 우려도 → 표시 등급
  $: medicalLevel =
    action.receivedMedicalConcern >= 0.6 ? "high" :
    action.receivedMedicalConcern >= 0.3 ? "mid" : "none";

  async function acceptTrade() {
    if (resolving) return;
    resolving = true;
    const g = $gameStore;
    const slotId = g.currentSlotId;
    const seasonYear = $seasonStore.seasonYear;

    seasonStore.pushPendingAction({
      type: "event",
      eventId: "EVT_TRADE_CONFIRMED",
      title: "트레이드 확정",
      description: `${fromTeamName} → ${toTeamName} 이적이 확정되었습니다.`,
      choices: [{ id: "ok", label: "확인" }],
    });
    gameStore.applyTradeTransfer(action.toTeamId);
    seasonStore.resolvePendingAction("trade");

    // 리그 거래 기록
    if (slotId) {
      const proName = g.protagonist.name;
      const leagueId = g.protagonist.leagueId;
      const tradeGroupId = `trade-pro-${action.fromTeamId}-${action.toTeamId}-${seasonYear}`;
      await window.projectB!.leagueAddTransactions(JSON.stringify({
        slotId,
        rows: [
          {
            seasonYear, category: "trade",
            playerId: g.protagonist.id, playerName: proName,
            fromTeamId: action.fromTeamId, fromLeagueId: leagueId,
            toTeamId: action.toTeamId,   toLeagueId: leagueId,
            detail: TRADE_REASON_LABEL[action.tradeReason] ?? action.tradeReason,
            groupId: tradeGroupId,
          },
          {
            seasonYear, category: "trade",
            playerId: action.receivedNpcId, playerName: action.receivedNpcName,
            fromTeamId: action.toTeamId,   fromLeagueId: leagueId,
            toTeamId: action.fromTeamId,   toLeagueId: leagueId,
            detail: TRADE_REASON_LABEL[action.tradeReason] ?? action.tradeReason,
            groupId: tradeGroupId,
          },
        ],
      }));
    }

    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function rejectTrade() {
    if (resolving || !hasNoTrade) return;
    resolving = true;
    seasonStore.resolvePendingAction("trade");
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <h2>트레이드 통보</h2>
      <span class="reason-chip">{reasonLabel}</span>
    </header>

    <div class="trade-grid">
      <!-- 내가 이동할 팀 -->
      <div class="side">
        <p class="side-label">이동할 팀</p>
        <p class="team-name">{toTeamName}</p>
        <p class="sub-text">{fromTeamName}에서 이적</p>
      </div>

      <div class="arrow">⇄</div>

      <!-- 내가 받는 선수 -->
      <div class="side">
        <p class="side-label">받는 선수</p>
        <p class="player-name">{action.receivedNpcName}</p>
        <p class="player-detail">{posLabel} · OVR {action.receivedOvr}</p>
        <p class="player-detail">연봉 {formatSalary(action.receivedSalary)}</p>
      </div>
    </div>

    <!-- 메디컬 경고 -->
    {#if medicalLevel === "high"}
      <div class="medical-warn high">
        [메디컬 주의] {action.receivedMedicalNote ?? "부상 이력 있음"}
      </div>
    {:else if medicalLevel === "mid"}
      <div class="medical-warn mid">
        [메디컬 참고] {action.receivedMedicalNote ?? "경미한 부상 이력"}
      </div>
    {/if}

    {#if hasNoTrade}
      <p class="no-trade-note">계약의 트레이드 거부권을 행사할 수 있습니다.</p>
    {/if}

    <div class="actions">
      <button class="btn-accept" disabled={resolving} on:click={acceptTrade}>수락</button>
      {#if hasNoTrade}
        <button class="btn-reject" disabled={resolving} on:click={rejectTrade}>거부권 행사</button>
      {/if}
    </div>
  </section>
</div>

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.75);
    display: flex; align-items: center; justify-content: center;
    z-index: 235;
  }
  .modal {
    width: min(520px, 92vw);
    background: #0e1d35;
    border: 1px solid #3e6397;
    border-radius: 14px;
    padding: 22px 24px;
    display: flex; flex-direction: column; gap: 14px;
  }

  header {
    display: flex; align-items: center; gap: 10px;
  }
  h2 { margin: 0; color: #eef6ff; font-size: 18px; }
  .reason-chip {
    font-size: 11px; padding: 2px 8px;
    background: #1a3560; color: #82aadd;
    border-radius: 20px; border: 1px solid #2d5090;
  }

  .trade-grid {
    display: grid;
    grid-template-columns: 1fr 32px 1fr;
    align-items: center;
    gap: 10px;
    background: #0a1628;
    border-radius: 10px;
    padding: 14px;
  }
  .side { display: flex; flex-direction: column; gap: 3px; }
  .side-label { font-size: 10px; color: #5a7dab; text-transform: uppercase; margin: 0; }
  .team-name  { font-size: 15px; color: #c8dcf6; font-weight: 600; margin: 0; }
  .player-name { font-size: 15px; color: #c8dcf6; font-weight: 600; margin: 0; }
  .player-detail { font-size: 12px; color: #8aabda; margin: 0; }
  .sub-text { font-size: 11px; color: #5a7dab; margin: 0; }
  .arrow { text-align: center; font-size: 20px; color: #3e6397; }

  .medical-warn {
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.5;
  }
  .medical-warn.high { background: #2a1010; color: #f28080; border: 1px solid #7a2020; }
  .medical-warn.mid  { background: #1e1e0e; color: #d4b96a; border: 1px solid #5a4a10; }

  .no-trade-note {
    font-size: 12px; color: #a8c4e8;
    background: #132040; border-radius: 6px;
    padding: 7px 10px; margin: 0;
  }

  .actions { display: flex; gap: 10px; justify-content: flex-end; }
  button {
    border-radius: 8px; padding: 8px 16px;
    cursor: pointer; font-size: 13px;
    transition: opacity .15s;
  }
  button:disabled { opacity: .5; cursor: default; }
  .btn-accept { background: #1e4d99; color: #e6f1ff; border: 1px solid #3868c0; }
  .btn-accept:not(:disabled):hover { background: #2558b0; }
  .btn-reject { background: #3d1010; color: #f0c0c0; border: 1px solid #7a2020; }
  .btn-reject:not(:disabled):hover { background: #4d1818; }
</style>
