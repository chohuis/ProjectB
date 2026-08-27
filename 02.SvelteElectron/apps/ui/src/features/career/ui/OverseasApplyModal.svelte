<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { entitiesL10n, teamsL10n } from "../../../shared/stores/master";
  import { gameStore } from "../../../shared/stores/game";
  import { overseasFarmCutOfPower, passesOverseasFarm, isOverseasFarmTeam,
    calcHsBaseballScore } from "../../../shared/utils/universityUtils";
  import type { EntityDetails } from "../../../shared/stores/master";

  export let initialSelected: string[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
    confirm: { selected: string[] };
  }>();

  let selected: string[] = [];
  let selectedTeamId = "";
  let loading = true;

  onMount(() => {
    selected = [...initialSelected].slice(0, 3);
    loading = false;
  });

  /**
   * 🔴 **2군만 보여준다.** 1군은 FA·포스팅 경로다 — 여기 섞으면
   *   아마추어가 바로 ABL 1군에 지원하게 된다.
   */
  $: teams = $teamsL10n.filter((t) => isOverseasFarmTeam(t.leagueId));
  $: sortedTeams = [...teams].sort((a, b) =>
    (a.leagueId ?? "").localeCompare(b.leagueId ?? "") || a.name.localeCompare(b.name, "ko"));
  $: if (!selectedTeamId || !sortedTeams.some((t) => t.id === selectedTeamId)) {
    selectedTeamId = sortedTeams[0]?.id ?? "";
  }
  $: selectedTeam = sortedTeams.find((t) => t.id === selectedTeamId) ?? null;
  $: rosterRows = selectedTeamId ? $entitiesL10n.filter((e) => e.teamId === selectedTeamId) : [];
  $: playerRows = rosterRows.filter((e) => e.role === "player");

  // ── 내 자격 ────────────────────────────────────────────────
  //
  // ⚠ **문턱을 숨기지 않는다.** 지원해 놓고 왜 떨어졌는지 모르면
  //   그 화면은 제비뽑기로 읽힌다. 팀마다 얼마가 필요한지 보여준다.
  $: myOvr = $gameStore.protagonist.pitching.ovr;
  $: myScore = calcHsBaseballScore($gameStore.protagonist.careerRecords ?? []);
  const leagueLabel = (id: string | undefined) =>
    id === "LEAGUE_ABL_FARM" ? "ABL 2군" : id === "LEAGUE_JBL_FARM" ? "JBL 2군" : "-";

  function cutOf(teamId: string): number {
    return overseasFarmCutOfPower($teamsL10n.find((t) => t.id === teamId)?.power);
  }
  function passes(teamId: string): boolean {
    return passesOverseasFarm(myOvr, myScore, $teamsL10n.find((t) => t.id === teamId)?.power);
  }

  function toggleTeam(teamId: string) {
    if (selected.includes(teamId)) {
      selected = selected.filter((id) => id !== teamId);
      return;
    }
    if (selected.length >= 3) return;
    selected = [...selected, teamId];
  }

  function confirmSelection() {
    dispatch("confirm", { selected: selected.slice(0, 3) });
  }
</script>
