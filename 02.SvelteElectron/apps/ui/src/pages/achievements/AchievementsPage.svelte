<script lang="ts">
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { t } from "../../shared/i18n";

  type Category = "all" | "baseball" | "growth" | "social" | "hidden";
  type AchievementStatus = "active" | "provisional" | "blocked";
  type Def = {
    id: string;
    category: Exclude<Category, "all">;
    status: AchievementStatus;
    title: string;
    desc: string;
    targetValue: number;
    metricKey: string;
    reward?: string;
    hidden?: boolean;
  };
  let defs: Def[] = [];

  let category: Category = "all";
  let showProvisional = false;

  $: visibleDefs = defs.filter((d) => d.status === "active" || (showProvisional && d.status === "provisional"));
  $: merged = defs.map((d) => {
    const rt = $gameStore.achievements.find((x) => x.id === d.id);
    const progress = rt?.progress ?? 0;
    const unlocked = !!rt?.unlockedAt;
    const claimed = !!rt?.claimedAt;
    return { ...d, progress, unlocked, claimed, unlockedAt: rt?.unlockedAt ?? null };
  });
  $: filtered = merged
    .filter((x) => visibleDefs.some((v) => v.id === x.id))
    .filter((x) => (category === "all" ? true : x.category === category));
  $: doneCount = merged.filter((x) => x.unlocked).length;
  $: claimable = filtered.filter((x) => x.unlocked && !x.claimed).length;

  function metricValue(metricKey: string): number {
    const m = $gameStore.achievementMetrics;
    const myTeamId = $gameStore.protagonist.teamId;
    if (metricKey === "strikeoutTotal") return m.strikeoutTotal;
    if (metricKey === "saveTotal") return m.saveTotal;
    if (metricKey === "kakaoFirstContact") return m.kakaoFirstContact ? 1 : 0;
    if (metricKey === "winsTotal") {
      const row = $seasonStore.standings.find((s) => s.teamId === myTeamId);
      return row?.wins ?? 0;
    }
    if (metricKey === "gamesPlayedTotal") {
      return $seasonStore.schedule.filter((e) => e.isProtagonistGame && !!e.result).length;
    }
    if (metricKey === "messagesReadTotal") return $gameStore.mailbox.filter((msg) => msg.readAt !== null).length;
    return 0;
  }

  function defaultDesc(metricKey: string, targetValue: number): string {
    if (metricKey === "strikeoutTotal") return `통산 삼진 ${targetValue}개 달성`;
    if (metricKey === "saveTotal") return `통산 세이브 ${targetValue}개 달성`;
    if (metricKey === "kakaoFirstContact") return "첫 카톡 대화 달성";
    if (metricKey === "winsTotal") return `통산 승리 ${targetValue}회 달성`;
    if (metricKey === "gamesPlayedTotal") return `경기 ${targetValue}회 참가`;
    if (metricKey === "messagesReadTotal") return `메시지 ${targetValue}개 읽기`;
    return "조건 달성";
  }

  async function loadDefs() {
    try {
      const res = await window.projectB?.masterFetch?.("achievements/achievements.json");
      const list = (res as { achievements?: Def[] } | null)?.achievements;
      if (Array.isArray(list)) defs = list;
    } catch {
      defs = [];
    }
  }

  loadDefs();
</script>

<section class="page">
  <h2>{$t("page.achievements")}</h2>
  <article class="card summary">
    <p>달성 {doneCount} / {filtered.length}</p>
    <p>보상 미수령 {claimable}</p>
    <label class="toggle">
      <input type="checkbox" bind:checked={showProvisional} />
      임시 업적 표시
    </label>
  </article>

  <article class="card filter-row">
    {#each (["all", "baseball", "growth", "social", "hidden"] as Category[]) as c}
      <button class:active={category === c} on:click={() => (category = c)}>
        {c === "all" ? "전체" : c}
      </button>
    {/each}
  </article>

  <article class="card list">
    {#each filtered as a}
      <div class="item">
        <div class="line1">
          <strong>{a.hidden && !a.unlocked ? "???" : a.title}</strong>
          <span class:ok={a.unlocked}>
            {a.unlocked ? "달성" : "진행중"} {a.status === "provisional" ? "· 임시" : ""}
          </span>
        </div>
        <p>{a.hidden && !a.unlocked ? "숨겨진 업적입니다." : defaultDesc(a.metricKey, a.targetValue)}</p>
        <div class="line2">
          <span>{Math.min(Math.max(a.progress, metricValue(a.metricKey)), a.targetValue)} / {a.targetValue}</span>
          {#if a.unlocked && !a.claimed}
            <button on:click={() => gameStore.claimAchievement(a.id)}>보상 수령</button>
          {:else if a.claimed}
            <span>수령 완료</span>
          {/if}
        </div>
      </div>
    {/each}
  </article>
</section>

<style>
  .page { height: 100%; display: grid; gap: 10px; grid-template-rows: auto auto auto minmax(0,1fr); }
  h2 { margin: 0; }
  .card { background:#111d34; border:1px solid #2e4568; border-radius:10px; padding:10px; }
  .summary { display:flex; gap:16px; }
  .toggle { display:flex; gap:6px; align-items:center; margin-left:auto; }
  .filter-row { display:flex; gap:8px; flex-wrap:wrap; }
  .filter-row button { background:#1c2f4e; border:1px solid #3a5886; color:#dbe8ff; border-radius:8px; padding:6px 10px; }
  .filter-row button.active { background:#3262b0; border-color:#6da1f7; }
  .list { overflow:auto; display:grid; gap:8px; align-content:start; }
  .item { border:1px solid #2d4263; border-radius:8px; padding:8px; display:grid; gap:6px; }
  .line1 { display:flex; justify-content:space-between; align-items:center; }
  .line1 span { color:#9bb1d7; }
  .line1 span.ok { color:#9ee0b6; }
  .line2 { display:flex; justify-content:space-between; align-items:center; }
  .line2 button { background:#2f5da6; border:1px solid #6ea2f7; color:#f0f6ff; border-radius:8px; padding:4px 8px; }
  p { margin: 0; color:#bcd0f0; }
</style>
