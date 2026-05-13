<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";

  const dispatch = createEventDispatcher<{
    close: void;
    completed: { drafted: boolean };
  }>();

  type Candidate = { id: string; name: string; ovr: number; isUser: boolean };
  type TeamDraftProfile = { teamId: string; preference: number; needsPitcher: boolean };

  let started = false;
  let pickCursor = 0;
  let picksPerRound = 8;
  let roundCount = 3;
  let candidates: Candidate[] = [];
  let draftTeamIds: string[] = [];
  let teamProfiles: TeamDraftProfile[] = [];
  let userDrafted = false;
  let finished = false;

  $: totalPicks = picksPerRound * roundCount;
  $: heroId = $gameStore.protagonist.id;

  function teamName(teamId: string): string {
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }

  function initBoard() {
    draftTeamIds = $masterStore.teams.filter((t) => t.leagueId === "LEAGUE_KBL").slice(0, 8).map((t) => t.id);
    picksPerRound = Math.max(1, draftTeamIds.length);
    roundCount = 3;
    pickCursor = 0;
    userDrafted = false;
    finished = false;

    teamProfiles = draftTeamIds.map((teamId, idx) => ({
      teamId,
      // 하위권 순번 팀일수록 픽 우선순위 가중치를 높여 전력 보강 수요를 반영
      preference: 1 + (picksPerRound - idx) * 0.04,
      needsPitcher: idx % 2 === 0,
    }));

    const hs = $masterStore.entities.filter((e) => e.role === "player" && e.leagueId === "LEAGUE_HIGHSCHOOL");
    const rows = hs.map((e) => {
      const p = (e.details as any)?.player;
      const pitchOvr = Number(p?.pitching?.ovr ?? 0);
      const batOvr = Number(p?.batting?.ovr ?? 0);
      return { id: e.id, name: e.name, ovr: Math.max(pitchOvr, batOvr), isUser: e.id === heroId };
    });

    const hero = rows.find((r) => r.id === heroId) ?? {
      id: heroId,
      name: $gameStore.protagonist.name,
      ovr: $gameStore.protagonist.pitching.ovr,
      isUser: true,
    };
    const withoutHero = rows.filter((r) => r.id !== heroId);
    withoutHero.sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name, "ko"));

    // 스카우트 점수 기반 예상 지명 순번
    // 스카우트 점수/OVR 기반 기대 픽: 점수가 높을수록 앞 순번
    const scout = Math.max(1, Math.min(99, $gameStore.protagonist.scoutScore));
    const ovr = Math.max(1, Math.min(99, $gameStore.protagonist.pitching.ovr));
    const combined = scout * 0.62 + ovr * 0.38;
    const targetPick = Math.max(1, Math.min(totalPicks, Math.round((108 - combined) / 2.2)));
    const insertAt = Math.min(withoutHero.length, Math.max(0, targetPick - 1));
    withoutHero.splice(insertAt, 0, hero);

    candidates = withoutHero.slice(0, Math.max(totalPicks + 36, 84));
    gameStore.clearCareerDraftPickLog();
  }

  function currentRound(): number {
    return Math.floor(pickCursor / picksPerRound) + 1;
  }

  function currentPickInRound(): number {
    return (pickCursor % picksPerRound) + 1;
  }

  function ratingForTeam(candidate: Candidate, profile: TeamDraftProfile): number {
    const base = candidate.ovr * profile.preference;
    if (!profile.needsPitcher) return base;
    // 현재 시나리오는 투수 커리어 중심이므로 팀 필요 포지션 가중치를 단순 적용
    return candidate.isUser ? base + 6 : base + 2;
  }

  function pickCandidateForTeam(profile: TeamDraftProfile): Candidate {
    const pool = candidates.slice(0, Math.min(18, candidates.length));
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const c = pool[i];
      // 상위 보드 내에서도 약간의 랜덤성을 부여해 고정 순서를 완화
      const score = ratingForTeam(c, profile) + Math.random() * 3.5;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const selected = pool[bestIdx];
    const realIdx = candidates.findIndex((c) => c.id === selected.id);
    if (realIdx >= 0) candidates.splice(realIdx, 1);
    return selected;
  }

  function doNextPick() {
    if (finished || pickCursor >= totalPicks || draftTeamIds.length === 0 || candidates.length === 0) return;
    const teamOrder = pickCursor % picksPerRound;
    // 홀수 라운드는 정순, 짝수 라운드는 역순(스네이크)
    const roundNo = currentRound();
    const slot = roundNo % 2 === 1 ? teamOrder : picksPerRound - 1 - teamOrder;
    const teamId = draftTeamIds[slot];
    const profile = teamProfiles.find((p) => p.teamId === teamId) ?? {
      teamId,
      preference: 1,
      needsPitcher: true,
    };
    const selected = pickCandidateForTeam(profile);
    const pickNo = pickCursor + 1;
    gameStore.appendCareerDraftPickLog({
      pickNo,
      round: roundNo,
      teamId,
      playerId: selected.id,
      playerName: selected.name,
      isUser: selected.isUser,
    });
    if (selected.isUser) userDrafted = true;
    pickCursor += 1;
    if (pickCursor >= totalPicks || userDrafted) finished = true;
  }

  async function startSimulation() {
    await masterStore.loadEntities("LEAGUE_HIGHSCHOOL");
    initBoard();
    started = true;
  }

  async function complete() {
    const userPick = $gameStore.schoolState.careerDraftPickLog.find((row) => row.isUser) ?? null;
    gameStore.setFallbackAdmissions({
      universityChoices: $gameStore.schoolState.fallbackUniversityChoices,
      independentChoices: $gameStore.schoolState.fallbackIndependentChoices,
      universityPassed: $gameStore.schoolState.fallbackUniversityPassed,
      independentPassed: $gameStore.schoolState.fallbackIndependentPassed,
      sportsMilitaryPassed: $gameStore.schoolState.fallbackSportsMilitaryPassed,
      draftPassed: userDrafted,
      draftTeamId: userPick?.teamId ?? null,
      draftRound: userPick?.round ?? null,
      draftPick: userPick?.pickNo ?? null,
      draftSigningBonus: userDrafted ? Math.max(3000, Math.round(($gameStore.protagonist.pitching.ovr - 45) * 220)) : 0,
      pendingSelection: true,
    });
    if (!userDrafted) {
      gameStore.setDraftIntent(false);
    }
    seasonStore.resolvePendingAction("draft");
    if (!$seasonStore.pendingActions.some((a) => a.type === "careerChoice")) {
      seasonStore.pushPendingAction({ type: "careerChoice" });
    }
    await gameStore.save();
    await seasonStore.save();
    dispatch("completed", { drafted: userDrafted });
    dispatch("close");
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="chip">드래프트 진행</p>
      <h3>KBL 드래프트 보드</h3>
    </header>

    {#if !started}
      <p class="desc">드래프트 대상과 팀 순번을 확인하고 시뮬레이션을 시작하세요.</p>
      <div class="actions">
        <button class="ghost" on:click={() => dispatch("close")}>닫기</button>
        <button on:click={startSimulation}>시작</button>
      </div>
    {:else}
      <div class="status">
        <span>라운드 {currentRound()} / {roundCount}</span>
        <span>픽 {currentPickInRound()} / {picksPerRound}</span>
        <span>전체 {pickCursor} / {totalPicks}</span>
      </div>

      <div class="board">
        <div class="queue">
          <h4>다음 팀 순번</h4>
          <ul>
            {#each Array.from({ length: Math.min(8, Math.max(0, totalPicks - pickCursor)) }, (_, i) => i) as i}
              <li>{teamName(draftTeamIds[(pickCursor + i) % picksPerRound])}</li>
            {/each}
          </ul>
        </div>
        <div class="queue">
          <h4>유망주 보드</h4>
          <ul>
            {#each candidates.slice(0, 8) as c}
              <li class:user={c.isUser}>{c.name} ({c.ovr}) {c.isUser ? "★" : ""}</li>
            {/each}
          </ul>
        </div>
      </div>

      <div class="log">
        <h4>지명 로그</h4>
        <div class="log-rows">
          {#each $gameStore.schoolState.careerDraftPickLog.slice(-10).reverse() as row}
            <div class="log-row">{row.pickNo}P · {teamName(row.teamId)} · {row.playerName} {row.isUser ? "★" : ""}</div>
          {/each}
        </div>
      </div>

      <div class="actions">
        <button class="ghost" on:click={() => dispatch("close")}>닫기</button>
        {#if !finished}
          <button on:click={doNextPick}>다음</button>
        {:else}
          <button on:click={complete}>{userDrafted ? "지명 확인" : "미지명 확인"}</button>
        {/if}
      </div>
    {/if}
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.74); display:flex; align-items:center; justify-content:center; z-index: 260; }
  .modal { width:min(980px,94vw); background:#0f1a30; border:1px solid #3d5f96; border-radius:14px; padding:18px; display:grid; gap:12px; }
  .chip { margin:0; color:#88abdf; font-size:11px; }
  h3, h4 { margin:0; color:#e8f1ff; }
  .desc { margin:0; color:#a8c0e0; }
  .status { display:flex; gap:12px; color:#bbd1ee; font-size:12px; }
  .board { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .queue { border:1px solid #2d466f; border-radius:10px; background:#132441; padding:10px; display:grid; gap:8px; }
  ul { margin:0; padding-left:18px; display:grid; gap:4px; color:#d2e4ff; font-size:12px; }
  li.user { color:#ffe08a; font-weight:700; }
  .log { border:1px solid #2d466f; border-radius:10px; background:#101d36; padding:10px; display:grid; gap:8px; }
  .log-rows { display:grid; gap:4px; max-height:160px; overflow:auto; }
  .log-row { font-size:12px; color:#c9ddff; }
  .actions { display:flex; justify-content:flex-end; gap:8px; }
  button { border:1px solid #3f629a; background:#1b2f51; color:#e6f1ff; border-radius:8px; padding:8px 12px; cursor:pointer; }
  button.ghost { background:#13213b; }
</style>
