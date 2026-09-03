<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore, teamsL10n } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import type { PendingAction } from "../../../shared/types/season";
  import { acceptTrade, rejectTrade } from "../../../shared/usecases/contractDecision";

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

  $: fromTeamName = $teamsL10n.find((t) => t.id === action.fromTeamId)?.name ?? action.fromTeamId;
  $: toTeamName   = $teamsL10n.find((t) => t.id === action.toTeamId)?.name   ?? action.toTeamId;
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

  // 세계를 바꾸는 로직은 `usecases/contractDecision`에 있다 —
  // 여기 두면 자동 진행이 그 경로를 못 타고(실제로 통보만 버려졌다)
  // 회귀도 걸 수 없다. 모달에는 표시와 선택만 남긴다.
  async function onAccept() {
    if (resolving) return;
    resolving = true;
    const g = $gameStore;
    seasonStore.pushPendingAction({
      type: "event",
      eventId: "EVT_TRADE_CONFIRMED",
      title: "트레이드 확정",
      description: `${fromTeamName} → ${toTeamName} 이적이 확정되었습니다.`,
      choices: [{ id: "ok", label: "확인" }],
    });
    await acceptTrade({
      fromTeamId: action.fromTeamId,
      toTeamId: action.toTeamId,
      toLeagueId: action.toLeagueId ?? g.protagonist.leagueId,
      receivedNpcId: action.receivedNpcId,
      receivedNpcName: action.receivedNpcName,
      tradeReason: action.tradeReason,
    });
    resolving = false;
  }

  async function onReject() {
    if (resolving || !hasNoTrade) return;
    resolving = true;
    await rejectTrade();
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
      <p class="no-trade-note">계약의 노트레이드 조항을 행사할 수 있습니다.</p>
    {/if}

    <div class="actions">
      <button class="btn-accept" disabled={resolving} on:click={onAccept}>수락</button>
      {#if hasNoTrade}
        <button class="btn-reject" disabled={resolving} on:click={onReject}>거부권 행사</button>
      {/if}
    </div>
  </section>
</div>

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(10, 18, 38, 0.52);
    display: flex; align-items: center; justify-content: center;
    z-index: 235;
  }
  .modal {
    width: min(520px, 92vw);
    background: var(--panel-sunk);
    border: 1px solid var(--ink-mute);
    border-radius: 14px;
    padding: 22px 24px;
    display: flex; flex-direction: column; gap: 14px;
  }

  header {
    display: flex; align-items: center; gap: 10px;
  }
  h2 { margin: 0; color: var(--ink); font-size: 18px; }
  .reason-chip {
    font-size: 11px; padding: 2px 8px;
    background: var(--line); color: var(--ink);
    border-radius: 20px; border: 1px solid var(--ink-mute);
  }

  .trade-grid {
    display: grid;
    grid-template-columns: 1fr 32px 1fr;
    align-items: center;
    gap: 10px;
    background: var(--panel);
    border-radius: 10px;
    padding: 14px;
  }
  .side { display: flex; flex-direction: column; gap: 3px; }
  .side-label { font-size: 10px; color: var(--ink-mute); text-transform: uppercase; margin: 0; }
  .team-name  { font-size: 15px; color: var(--ink); font-weight: 600; margin: 0; }
  .player-name { font-size: 15px; color: var(--ink); font-weight: 600; margin: 0; }
  .player-detail { font-size: 12px; color: var(--ink); margin: 0; }
  .sub-text { font-size: 11px; color: var(--ink-mute); margin: 0; }
  .arrow { text-align: center; font-size: 20px; color: var(--ink-mute); }

  .medical-warn {
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.5;
  }
  .medical-warn.high { background: rgba(179, 49, 31, 0.09); color: var(--bad); border: 1px solid rgba(179, 49, 31, 0.26); }
  .medical-warn.mid  { background: var(--panel-sunk); color: var(--warn); border: 1px solid rgba(154, 101, 16, 0.30); }

  .no-trade-note {
    font-size: 12px; color: var(--ink);
    background: var(--panel-sunk); border-radius: 6px;
    padding: 7px 10px; margin: 0;
  }

  .actions { display: flex; gap: 10px; justify-content: flex-end; }
  button {
    border-radius: 8px; padding: 8px 16px;
    cursor: pointer; font-size: 13px;
    transition: opacity .15s;
  }
  button:disabled { opacity: .5; cursor: default; }
  .btn-accept { background: var(--line); color: var(--ink); border: 1px solid var(--ink-mute); }
  .btn-accept:not(:disabled):hover { background: var(--ink-mute); }
  .btn-reject { background: rgba(179, 49, 31, 0.09); color: var(--bad); border: 1px solid rgba(179, 49, 31, 0.26); }
  .btn-reject:not(:disabled):hover { background: rgba(179, 49, 31, 0.09); }
</style>
