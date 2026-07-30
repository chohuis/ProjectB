<script lang="ts">
  // 인물 화면 (Phase 6C-6) — 설계 정본 docs/design/people.md §4
  //
  // **관계값 숫자를 절대 보여주지 않는다.** 7단계 라벨과 방향 문장만 쓴다.
  // 효과도 "+4"가 아니라 "출전 기회에서 유리합니다"로 쓴다 — TOML 수치를 고칠 때
  // 화면 문자열이 거짓말이 되지 않게 하려는 것이기도 하다.
  //
  // 좌: 지금 함께 있는 사람 (contact = together)
  // 우: 지난 인연 (apart / ended) — 재회 서사가 여기서 보인다

  import { onMount } from "svelte";
  import { gameStore } from "../../shared/stores/game";
  import { slotRepo } from "../../shared/repo/slotRepo";
  import { relationLabel } from "../../shared/types/relationship";
  import type { Relationship, RelationKind } from "../../shared/types/relationship";

  let rows: Relationship[] = [];
  let loading = true;
  let error = "";
  let selected: Relationship | null = null;

  const KIND_LABEL: Record<RelationKind, string> = {
    manager: "감독", coach: "코치", owner: "구단주",
    teammate: "동료", rival: "라이벌",
  };

  // 효과는 **방향만** 문장으로. 수치는 relationship_rules.toml이 정본이고
  // 여기 숫자를 적으면 튜닝할 때마다 화면이 거짓말이 된다.
  const EFFECT_UP: Record<RelationKind, string> = {
    manager:  "출전 기회와 보직 배정에서 유리합니다.",
    coach:    "담당 영역 훈련 효율이 오릅니다.",
    owner:    "재계약 협상에서 여유를 두고 봅니다.",
    teammate: "팀 분위기와 동료 이벤트에 좋게 반영됩니다.",
    rival:    "서로를 인정하는 사이입니다.",
  };
  const EFFECT_DOWN: Record<RelationKind, string> = {
    manager:  "출전 기회 배정에서 뒤로 밀릴 수 있습니다.",
    coach:    "담당 영역 훈련 효율이 떨어집니다.",
    owner:    "재계약·방출 판정이 냉정해집니다.",
    teammate: "팀 분위기에 부담이 됩니다.",
    rival:    "적대감이 짙습니다.",
  };
  const EFFECT_NEUTRAL = "아직 특별한 영향은 없습니다.";

  const MEMORY_LABEL: Record<string, string> = {
    humiliation: "굴욕", gratitude: "은혜", betrayal: "배신",
    witness: "목격", shared_ordeal: "고락",
  };

  // 표시 순서는 역할 우선 — 감독·구단주가 위에 있어야 "누가 나를 쓰는가"가 먼저 보인다
  const KIND_ORDER: RelationKind[] = ["manager", "owner", "coach", "teammate", "rival"];
  function kindRank(k: RelationKind): number {
    const i = KIND_ORDER.indexOf(k);
    return i < 0 ? KIND_ORDER.length : i;
  }

  async function load() {
    loading = true;
    error = "";
    const slotId = $gameStore.currentSlotId;
    if (!slotId) {
      error = "슬롯이 없습니다.";
      loading = false;
      return;
    }
    try {
      rows = await slotRepo.getRelationships(slotId, { withPerson: true });
    } catch (e) {
      error = `관계를 읽지 못했습니다: ${String(e)}`;
    }
    loading = false;
  }

  onMount(load);

  $: together = rows
    .filter((r) => r.contact === "together")
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || b.value - a.value);

  $: past = rows
    .filter((r) => r.contact !== "together")
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  function nameOf(r: Relationship): string {
    // 은퇴 등으로 person VIEW에서 사라진 상대는 이름이 없다 — 역할명으로 대체한다
    return r.name || `(${KIND_LABEL[r.kind] ?? "인물"})`;
  }

  function effectOf(r: Relationship): string {
    const step = relationLabel(r.value).label;
    if (step === "중립") return EFFECT_NEUTRAL;
    return r.value > 0 ? EFFECT_UP[r.kind] : EFFECT_DOWN[r.kind];
  }

  function agoOf(r: Relationship): string {
    const now = $gameStore.protagonist.age;
    void now;
    return r.metSeason > 0 ? `${r.metSeason}년에 만남` : "";
  }
</script>

<section class="people">
  <header class="head">
    <h2>인물</h2>
    <p class="sub">관계는 경기 결과·훈련·이벤트로 조금씩 움직입니다.</p>
  </header>

  {#if loading}
    <p class="msg">불러오는 중…</p>
  {:else if error}
    <p class="msg err">{error}</p>
  {:else if rows.length === 0}
    <p class="msg">아직 관계가 쌓인 인물이 없습니다. 한 주를 진행하면 팀 사람들과의 관계가 생깁니다.</p>
  {:else}
    <div class="cols">
      <!-- 지금 함께 -->
      <div class="col">
        <h3>지금 함께 <span class="count">{together.length}</span></h3>
        {#if together.length === 0}
          <p class="msg small">지금 팀에 관계가 쌓인 사람이 없습니다.</p>
        {:else}
          <ul class="list">
            {#each together as r (r.personId)}
              {@const lab = relationLabel(r.value)}
              <li>
                <button
                  class="row"
                  class:sel={selected?.personId === r.personId}
                  on:click={() => (selected = selected?.personId === r.personId ? null : r)}
                >
                  <span class="nm">{nameOf(r)}</span>
                  <span class="kd">{KIND_LABEL[r.kind] ?? r.kind}</span>
                  <span class="lb tone-{lab.tone}">{lab.label}</span>
                </button>
                {#if selected?.personId === r.personId}
                  <div class="detail">
                    <p class="eff">{effectOf(r)}</p>
                    {#if r.memories.length > 0}
                      <ul class="mem">
                        {#each r.memories.slice().reverse() as m}
                          <li><b>{MEMORY_LABEL[m.type] ?? m.type}</b> · {m.detail}</li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- 지난 인연 -->
      <div class="col">
        <h3>지난 인연 <span class="count">{past.length}</span></h3>
        {#if past.length === 0}
          <p class="msg small">아직 헤어진 사람이 없습니다.</p>
        {:else}
          <ul class="list">
            {#each past as r (r.personId)}
              {@const lab = relationLabel(r.value)}
              <li>
                <div class="row past" class:ended={r.contact === "ended"}>
                  <span class="nm">{nameOf(r)}</span>
                  <span class="kd">{KIND_LABEL[r.kind] ?? r.kind}{r.contact === "ended" ? " · 은퇴" : ""}</span>
                  <span class="lb tone-{lab.tone}">{lab.label}</span>
                </div>
                {#if r.memories.length > 0 || r.metSeason > 0}
                  <div class="detail">
                    {#if r.metSeason > 0}<p class="meta">{agoOf(r)}</p>{/if}
                    {#if r.memories.length > 0}
                      <ul class="mem">
                        {#each r.memories.slice().reverse().slice(0, 3) as m}
                          <li><b>{MEMORY_LABEL[m.type] ?? m.type}</b> · {m.detail}</li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
          <p class="note">헤어진 관계는 시즌이 지날수록 옅어집니다. 다시 만나면 그 자리에서 이어집니다.</p>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .people { padding: 14px 16px; color: #dbe8ff; }
  .head h2 { margin: 0 0 2px; font-size: 18px; }
  .sub { margin: 0 0 14px; font-size: 12px; color: #8fa8ce; }

  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }

  .col h3 { margin: 0 0 8px; font-size: 13px; color: #a9c4ee; font-weight: 600; }
  .count { color: #6d86ad; font-weight: 400; }

  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }

  .row {
    width: 100%; display: grid; grid-template-columns: 1fr auto auto; gap: 8px;
    align-items: center; text-align: left;
    border: 1px solid #2c4066; background: #1a273f; color: #dbe8ff;
    border-radius: 8px; padding: 7px 10px; font-size: 12px; cursor: pointer;
  }
  .row.sel { border-color: #6da1f7; background: #223258; }
  .row.past { cursor: default; opacity: 0.85; }
  .row.past.ended { opacity: 0.6; }

  .nm { font-weight: 600; }
  .kd { color: #8fa8ce; font-size: 11px; }

  .lb { border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
  .tone-hostile  { background: #4a1b1b; color: #ff9a9a; }
  .tone-distrust { background: #422022; color: #e79090; }
  .tone-cold     { background: #33323d; color: #b7b3c4; }
  .tone-neutral  { background: #2a3550; color: #9fb2d2; }
  .tone-friendly { background: #23405c; color: #86c4f0; }
  .tone-trusted  { background: #1e4a44; color: #7fdcc4; }
  .tone-close    { background: #17513a; color: #7ff0b0; }

  .detail { padding: 6px 10px 10px; font-size: 11px; color: #b7c9e6; }
  .eff { margin: 0 0 6px; }
  .meta { margin: 0 0 4px; color: #7f95bb; }
  .mem { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .mem li { color: #93a9cc; }
  .mem b { color: #c8d9f5; }

  .msg { font-size: 12px; color: #8fa8ce; }
  .msg.small { font-size: 11px; }
  .msg.err { color: #ff9a9a; }
  .note { margin: 10px 0 0; font-size: 11px; color: #6d86ad; }
</style>
