<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore, currentStandings } from "../../../shared/stores/season";
  import { teamMap } from "../../../shared/stores/master";

  export let onExit: () => void;

  $: p           = $gameStore.protagonist;
  $: myTeamId    = p.teamId;
  $: myStanding  = $seasonStore.standings.find((s) => s.teamId === myTeamId);
  $: myRank      = $currentStandings.findIndex((s) => s.teamId === myTeamId) + 1;
  $: totalTeams  = $seasonStore.standings.length;

  function tName(id: string): string {
    return $teamMap.get(id)?.name ?? id;
  }
</script>

<div class="overlay">
  <div class="modal">
    <header class="modal-header">
      <p class="season-label">{$seasonStore.seasonYear} 시즌</p>
      <h2>시즌 종료</h2>
      <p class="sub">{p.grade}학년 · {tName(myTeamId)}</p>
    </header>

    <section class="summary">
      <div class="kpi-row">
        <div class="kpi">
          <span>최종 순위</span>
          <strong class:gold={myRank === 1} class:silver={myRank === 2} class:bronze={myRank === 3}>
            {myRank > 0 ? `${myRank} / ${totalTeams}위` : "-"}
          </strong>
        </div>
        <div class="kpi">
          <span>시즌 성적</span>
          <strong>{myStanding?.wins ?? 0}승 {myStanding?.losses ?? 0}패 {myStanding?.draws ?? 0}무</strong>
        </div>
        <div class="kpi">
          <span>승률</span>
          <strong>{myStanding ? myStanding.winPct.toFixed(3) : "-"}</strong>
        </div>
        <div class="kpi">
          <span>투구 OVR</span>
          <strong>{p.pitching.ovr}</strong>
        </div>
      </div>
    </section>

    <section class="standings-section">
      <h4>최종 순위표</h4>
      <table>
        <thead>
          <tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>승률</th><th>득실</th></tr>
        </thead>
        <tbody>
          {#each $currentStandings as s, i}
            <tr class:my-row={s.teamId === myTeamId}>
              <td>{i + 1}</td>
              <td class="team-name">{tName(s.teamId)}</td>
              <td>{s.wins}</td>
              <td>{s.losses}</td>
              <td>{s.winPct.toFixed(3)}</td>
              <td>{s.runsFor}-{s.runsAgainst}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <footer class="actions">
      <button class="btn-exit" on:click={onExit}>타이틀로 돌아가기</button>
      <button class="btn-next" disabled>새 시즌 (준비 중)</button>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal {
    background: #0e1a30;
    border: 1px solid #4a6898;
    border-radius: 16px;
    padding: 32px 36px;
    width: min(600px, 90vw);
    display: grid;
    gap: 24px;
  }

  .modal-header {
    text-align: center;
    display: grid;
    gap: 6px;
  }

  .season-label {
    margin: 0;
    font-size: 12px;
    color: #7a9ac8;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-size: 28px;
    color: #e8f0ff;
  }

  h4 {
    margin: 0 0 10px;
    font-size: 13px;
    color: #9eb6de;
  }

  .sub {
    margin: 0;
    font-size: 14px;
    color: #8aa4cc;
  }

  .summary {}

  .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .kpi {
    background: #131f38;
    border: 1px solid #2a3f62;
    border-radius: 10px;
    padding: 10px;
    display: grid;
    gap: 4px;
    text-align: center;
  }

  .kpi span {
    font-size: 11px;
    color: #8aa4cc;
  }

  .kpi strong {
    font-size: 18px;
    color: #d8e8ff;
  }

  .kpi strong.gold   { color: #f5d050; }
  .kpi strong.silver { color: #c8d8f0; }
  .kpi strong.bronze { color: #e0a060; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  thead th {
    color: #7a9ac8;
    padding: 6px 8px;
    text-align: center;
    border-bottom: 1px solid #2a3f62;
  }

  tbody td {
    padding: 6px 8px;
    text-align: center;
    color: #b8ccec;
    border-bottom: 1px solid #1a2a44;
  }

  .team-name { text-align: left; }

  tr.my-row td {
    color: #f0e060;
    font-weight: 700;
    background: #1e2e14;
  }

  .actions {
    display: flex;
    gap: 10px;
    justify-content: center;
  }

  .btn-exit {
    padding: 10px 28px;
    background: #2b4b80;
    color: #e8f0ff;
    border: 1px solid #5080c0;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-exit:hover { background: #3a5f9e; }

  .btn-next {
    padding: 10px 24px;
    background: #1a2840;
    color: #4a6888;
    border: 1px solid #2e4060;
    border-radius: 10px;
    font-size: 14px;
    cursor: not-allowed;
  }

  p { margin: 0; }
</style>
