<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";

  export let reason: "rejected" | "overdue";

  let resolving = false;

  $: p = $gameStore.protagonist;
  $: penalty = p.militaryDeferPenalty ?? 0;

  $: title = reason === "rejected" ? "체육부대 탈락" : "입영 기간 만료";
  $: bodyText = reason === "rejected"
    ? p.age <= 26
      ? "이번 체육부대 선발에서 탈락하였습니다.\n내년에 다시 도전하거나 현역으로 입대할 수 있습니다."
      : "이번 체육부대 선발에서 탈락하였습니다.\n현역으로 입대하시겠습니까?"
    : `입영 이행 기간이 만료되었습니다.\n현재 누적 패널티: -${penalty}pt\n현역으로 입대하시겠습니까?`;
  $: canDefer = reason === "overdue" || (reason === "rejected" && p.age <= 26);

  async function enlist() {
    if (resolving) return;
    resolving = true;
    const slotId = $gameStore.currentSlotId;
    const proto = $gameStore.protagonist;
    const seasonYear = $seasonStore.seasonYear;
    gameStore.enlistMilitary("general", 52, false, seasonYear);
    gameStore.addCareerEvent({ year: seasonYear, eventType: "military_enlist",
      fromTeamId: proto.teamId || undefined, fromLeagueId: proto.leagueId || undefined, detail: "일반병 입대" });
    // 군입대 시 SeasonEndModal이 스킵되므로 NPC 오프시즌 처리
    await gameStore.processAllLeaguesSeasonEnd(seasonYear);
    seasonStore.initSeason("LEAGUE_MILITARY", (seasonYear || 2026) + 1, 100, []);
    seasonStore.setSchedule([]);
    seasonStore.resolvePendingAction("militaryEnlistAsk");
    if (slotId) {
      await window.projectB!.leagueAddTransactions(JSON.stringify({
        slotId, rows: [{ seasonYear, week: 52, category: "military",
          playerId: proto.id, playerName: proto.name,
          fromTeamId: proto.teamId || null, fromLeagueId: proto.leagueId || null,
          detail: "일반병 입대" }],
      }));
    }
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function decline() {
    if (resolving) return;
    resolving = true;
    seasonStore.resolvePendingAction("militaryEnlistAsk");
    await gameStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="chip">병역</p>
      <h2>{title}</h2>
    </header>
    <p class="body-text">{bodyText}</p>
    {#if reason === "overdue"}
      <div class="warning-box">
        입대를 미룰수록 패널티가 누적됩니다.
      </div>
    {/if}
    <div class="actions">
      <button class="btn-decline" disabled={resolving || !canDefer} on:click={decline}>다음 시즌으로</button>
      <button class="btn-enlist" disabled={resolving} on:click={enlist}>현역 입대</button>
    </div>
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display:flex; align-items:center; justify-content:center; z-index:245; }
  .modal { width:min(440px,90vw); background:#10233c; border:1px solid #40659a; border-radius:12px; padding:24px; display:grid; gap:14px; }
  .chip { margin:0; font-size:11px; color:#7aa8e0; }
  h2 { margin:4px 0 0; color:#eef6ff; }
  .body-text { margin:0; color:#a8c8e8; font-size:14px; white-space:pre-line; line-height:1.6; }
  .warning-box { background:#2a1010; border:1px solid #804040; border-radius:8px; padding:10px 14px; color:#f08080; font-size:13px; }
  .actions { display:flex; gap:10px; justify-content:flex-end; }
  .btn-decline { border:1px solid #2a4068; background:#0d1e38; color:#7aa8d8; border-radius:8px; padding:9px 16px; cursor:pointer; font-size:13px; }
  .btn-enlist { border:1px solid #5a4020; background:#2a1e08; color:#e0a040; border-radius:8px; padding:9px 20px; cursor:pointer; font-size:13px; font-weight:700; }
  button:disabled { opacity:.5; cursor:default; }
</style>
