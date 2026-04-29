<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";

  type Category = "baseball" | "growth" | "social" | "hidden";
  type AchievementStatus = "active" | "provisional" | "blocked";
  type MetricKey =
    | "strikeoutTotal"
    | "saveTotal"
    | "kakaoFirstContact"
    | "winsTotal"
    | "gamesPlayedTotal"
    | "messagesReadTotal"
    | "relationshipStep";
  interface AchievementDef {
    id: string;
    title: string;
    category: Category;
    status: AchievementStatus;
    metricKey: MetricKey;
    targetValue: number;
    hidden: boolean;
    reward: string;
  }

  export let open = false;
  const dispatch = createEventDispatcher<{ close: void }>();
  const REL_PATH = "achievements/achievements.json";
  const LOCAL_KEY = "dev_achievements_master";

  let rows: AchievementDef[] = [];
  let selectedId = "";
  let draft: AchievementDef | null = null;
  let msg = "";
  let err = "";

  onMount(async () => {
    await load();
  });

  $: selected = rows.find((r) => r.id === selectedId) ?? null;
  $: if (selected && !draft) draft = structuredClone(selected);
  $: if (rows.length > 0 && !rows.some((r) => r.id === selectedId)) selectedId = rows[0].id;

  function close() { dispatch("close"); }
  function select(id: string) { selectedId = id; draft = structuredClone(rows.find((r) => r.id === id)!); }
  function createNew() {
    const id = `ACH_NEW_${String(rows.length + 1).padStart(3, "0")}`;
    const row: AchievementDef = { id, title: "신규 업적", category: "baseball", status: "active", metricKey: "strikeoutTotal", targetValue: 1, hidden: false, reward: "" };
    rows = [row, ...rows];
    select(id);
  }
  function remove() {
    if (!selected) return;
    rows = rows.filter((r) => r.id !== selected.id);
    draft = null;
  }
  function saveDraft() {
    if (!draft) return;
    rows = rows.map((r) => (r.id === draft.id ? structuredClone(draft) : r));
  }
  function cancelDraft() {
    if (!selected) return;
    draft = structuredClone(selected);
  }

  async function load() {
    msg = ""; err = "";
    try {
      const remote = await window.projectB?.masterFetch?.(REL_PATH);
      const list = (remote as { achievements?: AchievementDef[] } | null)?.achievements;
      if (Array.isArray(list)) {
        rows = list;
        msg = `${rows.length}개 업적 로드 완료`;
        return;
      }
      const local = window.localStorage.getItem(LOCAL_KEY);
      if (local) rows = (JSON.parse(local) as { achievements: AchievementDef[] }).achievements ?? [];
    } catch (e) {
      err = `불러오기 실패: ${String((e as Error)?.message ?? e)}`;
    }
  }

  async function save() {
    msg = ""; err = "";
    try {
      const payload = { version: 1, achievements: rows };
      if (window.projectB?.masterSave) {
        const r = await window.projectB.masterSave({ relPath: REL_PATH, data: payload, backup: true });
        if (!r.ok) { err = `저장 실패: ${r.error ?? "알 수 없는 오류"}`; return; }
        msg = "파일 저장 완료";
      } else {
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
        msg = "로컬 임시 저장 완료";
      }
    } catch (e) {
      err = `저장 실패: ${String((e as Error)?.message ?? e)}`;
    }
  }
</script>

{#if open}
  <div class="backdrop" on:click={close}>
    <section class="modal" role="dialog" aria-label="업적 에디터" on:click|stopPropagation>
      <header>
        <h2>업적 에디터</h2>
        <div class="actions">
          <button class="ghost" on:click={load}>새로고침</button>
          <button on:click={save}>저장</button>
          <button class="ghost" on:click={close}>닫기</button>
        </div>
      </header>
      {#if msg}<p class="ok">{msg}</p>{/if}
      {#if err}<p class="error">{err}</p>{/if}
      <div class="body">
        <aside class="list">
          <div class="row">
            <button on:click={createNew}>추가</button>
            <button class="danger" on:click={remove}>삭제</button>
          </div>
          <ul>
            {#each rows as row}
              <li><button class:selected={row.id === selectedId} on:click={() => select(row.id)}>{row.title}<span>{row.id}</span></button></li>
            {/each}
          </ul>
        </aside>
        <section class="editor">
          {#if draft}
            <label><span>ID</span><input bind:value={draft.id} /></label>
            <label><span>제목</span><input bind:value={draft.title} /></label>
            <label><span>카테고리</span>
              <select bind:value={draft.category}>
                <option value="baseball">baseball</option><option value="growth">growth</option><option value="social">social</option><option value="hidden">hidden</option>
              </select>
            </label>
            <label><span>상태</span>
              <select bind:value={draft.status}>
                <option value="active">active</option>
                <option value="provisional">provisional</option>
                <option value="blocked">blocked</option>
              </select>
            </label>
            <label><span>지표(metricKey)</span>
              <select bind:value={draft.metricKey}>
                <option value="strikeoutTotal">strikeoutTotal</option>
                <option value="saveTotal">saveTotal</option>
                <option value="kakaoFirstContact">kakaoFirstContact</option>
                <option value="winsTotal">winsTotal</option>
                <option value="gamesPlayedTotal">gamesPlayedTotal</option>
                <option value="messagesReadTotal">messagesReadTotal</option>
                <option value="relationshipStep">relationshipStep</option>
              </select>
            </label>
            <label><span>목표값</span><input type="number" bind:value={draft.targetValue} /></label>
            <label><span>히든</span><input type="checkbox" bind:checked={draft.hidden} /></label>
            <label><span>보상</span><input bind:value={draft.reward} /></label>
            <div class="row end">
              <button class="ghost" on:click={cancelDraft}>취소</button>
              <button on:click={saveDraft}>적용</button>
            </div>
          {/if}
        </section>
      </div>
    </section>
  </div>
{/if}

<style>
  .backdrop { position:fixed; inset:0; z-index:95; background:rgba(5,10,18,.72); display:grid; place-items:center; padding:24px; }
  .modal { width:min(1080px,95vw); height:min(780px,92vh); background:#101d33; border:1px solid #35517d; border-radius:12px; display:grid; grid-template-rows:auto auto minmax(0,1fr); overflow:hidden; }
  header { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid #294467; }
  h2 { margin:0; color:#e4efff; font-size:18px; }
  .actions { display:flex; gap:8px; }
  button, input, select { border:1px solid #35527d; background:#162744; color:#dbe9ff; border-radius:8px; padding:7px 10px; font-size:13px; font-family:inherit; }
  .ghost { background:#1d2d4a; }
  .danger { border-color:#7c4552; background:#2b1e26; color:#ffc6d0; }
  .ok,.error { margin:0; padding:7px 14px; font-size:12px; border-bottom:1px solid #2a4368; }
  .ok { color:#c5f1da; background:#1c3430; } .error { color:#ffd1da; background:#3a242c; }
  .body { min-height:0; display:grid; grid-template-columns:320px minmax(0,1fr); }
  .list { border-right:1px solid #243e62; display:grid; grid-template-rows:auto minmax(0,1fr); min-height:0; }
  .row { display:flex; gap:8px; padding:10px; border-bottom:1px solid #243e62; }
  .row.end { border-bottom:0; padding:0; justify-content:flex-end; }
  ul { margin:0; padding:8px; list-style:none; overflow:auto; display:grid; gap:6px; }
  li button { width:100%; text-align:left; display:grid; gap:3px; }
  li button span { color:#9cb4d8; font-size:12px; }
  li button.selected { border-color:#6ea2f7; background:#234169; }
  .editor { padding:12px; display:grid; gap:8px; align-content:start; overflow:auto; min-height:0; }
  label { display:grid; gap:6px; }
  label span { color:#a7bfdf; font-size:12px; }
</style>
