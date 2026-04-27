<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";

  type EventType = "mandatory" | "conditional" | "random";

  interface ManagedEvent {
    id: string;
    title?: string;
    type: EventType;
    category: string;
    priority: number;
    oncePolicy?: string;
    cooldownDays?: number;
    weight?: number;
    poolId?: string;
    messageTemplateId?: string | null;
    decisionTemplateId?: string | null;
    [key: string]: unknown;
  }

  interface EventFile {
    events?: ManagedEvent[];
  }

  interface PoolFile {
    id: string;
    description?: string;
    eventIds?: string[];
  }

  interface MessageTemplate {
    id: string;
    subject?: string;
    decisionTemplateId?: string | null;
  }

  interface DecisionTemplate {
    id: string;
    prompt?: string;
  }

  interface EventIndexFile {
    files?: {
      pools?: string[];
    };
  }

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  let loading = false;
  let errorMessage = "";
  let events: ManagedEvent[] = [];
  let selectedId = "";
  let search = "";
  let typeFilter: "all" | EventType = "all";
  let categoryFilter = "all";

  let poolOptions: PoolFile[] = [];
  let messageTemplates: MessageTemplate[] = [];
  let decisionTemplates: DecisionTemplate[] = [];

  const ONCE_POLICY_OPTIONS = ["repeatable", "once_per_stage_year", "once_per_season", "once_per_career"];

  // Ctrl+Q로 열 때 즉시 사용할 수 있도록 최초 1회 로드
  onMount(async () => {
    await loadAll();
  });

  async function loadAll() {
    await Promise.all([loadEvents(), loadReferenceLists()]);
  }

  // 마스터 이벤트 JSON(필수/조건/랜덤)을 병합 로드
  async function loadEvents() {
    loading = true;
    errorMessage = "";

    try {
      const paths = [
        "/data/master/events/rules/mandatory.json",
        "/data/master/events/rules/conditional.json",
        "/data/master/events/rules/random.json"
      ];

      const loaded = await Promise.all(
        paths.map(async (path) => {
          const response = await fetch(path);
          if (!response.ok) return [] as ManagedEvent[];
          const data = (await response.json()) as EventFile;
          return data.events ?? [];
        })
      );

      const merged = loaded.flat().map((event) => ({
        ...event,
        title: typeof event.title === "string" && event.title.trim() ? event.title : event.id
      }));

      events = merged;
      if (!selectedId && events.length > 0) {
        selectedId = events[0].id;
      }
    } catch (error) {
      console.warn("[EventManagerModal] failed to load event files", error);
      errorMessage = "이벤트 파일을 불러오지 못했습니다. 더미 데이터로 표시합니다.";
      events = buildFallbackEvents();
      selectedId = events[0]?.id ?? "";
    } finally {
      loading = false;
    }
  }

  async function loadReferenceLists() {
    try {
      const poolPaths = await resolvePoolPaths();
      const poolsLoaded = await Promise.all(
        poolPaths.map(async (path) => {
          const response = await fetch(path);
          if (!response.ok) return null;
          return ((await response.json()) as PoolFile) ?? null;
        })
      );

      poolOptions = poolsLoaded.filter((pool): pool is PoolFile => Boolean(pool?.id));
    } catch (error) {
      console.warn("[EventManagerModal] failed to load pool list", error);
      poolOptions = [];
    }

    try {
      const response = await fetch("/data/master/messages/templates.json");
      if (response.ok) {
        const data = (await response.json()) as { templates?: MessageTemplate[] };
        messageTemplates = data.templates ?? [];
      }
    } catch (error) {
      console.warn("[EventManagerModal] failed to load message templates", error);
      messageTemplates = [];
    }

    try {
      const response = await fetch("/data/master/messages/decision_templates.json");
      if (response.ok) {
        const data = (await response.json()) as { decisions?: DecisionTemplate[] };
        decisionTemplates = data.decisions ?? [];
      }
    } catch (error) {
      console.warn("[EventManagerModal] failed to load decision templates", error);
      decisionTemplates = [];
    }
  }

  async function resolvePoolPaths(): Promise<string[]> {
    try {
      const response = await fetch("/data/master/events/index.json");
      if (response.ok) {
        const data = (await response.json()) as EventIndexFile;
        const pools = data.files?.pools ?? [];
        if (pools.length > 0) {
          return pools.map((path) => (path.startsWith("/") ? path : `/${path}`));
        }
      }
    } catch {
      // fallback below
    }

    return [
      "/data/master/events/pools/media.json",
      "/data/master/events/pools/social.json",
      "/data/master/events/pools/team_life.json"
    ];
  }

  function buildFallbackEvents(): ManagedEvent[] {
    return [
      {
        id: "EVT_HS_YEAR1_MIDTERM",
        title: "고1 중간고사",
        type: "mandatory",
        category: "academics",
        priority: 1000,
        oncePolicy: "once_per_stage_year",
        messageTemplateId: "MSG_TMPL_ACADEMICS_MIDTERM",
        decisionTemplateId: null
      },
      {
        id: "EVT_PRO_YEAR2_WINS_TITLE_RACE",
        title: "프로 2년차 다승 경쟁",
        type: "conditional",
        category: "career",
        priority: 700,
        oncePolicy: "once_per_season",
        cooldownDays: 14,
        messageTemplateId: "MSG_TMPL_CAREER_WINS_TITLE_RACE",
        decisionTemplateId: "MSG_DECISION_CAREER_WINS_TITLE_RACE"
      },
      {
        id: "EVT_RANDOM_INTERVIEW_REQUEST",
        title: "인터뷰 요청",
        type: "random",
        category: "media",
        priority: 300,
        oncePolicy: "repeatable",
        cooldownDays: 10,
        weight: 28,
        poolId: "POOL_MEDIA_DAILY",
        messageTemplateId: "MSG_TMPL_RANDOM_INTERVIEW",
        decisionTemplateId: "MSG_DECISION_RANDOM_INTERVIEW"
      }
    ];
  }

  $: categories = ["all", ...new Set(events.map((event) => event.category))];

  $: filteredEvents = events.filter((event) => {
    const matchesType = typeFilter === "all" || event.type === typeFilter;
    const matchesCategory = categoryFilter === "all" || event.category === categoryFilter;
    const q = search.trim().toLowerCase();
    const title = (event.title ?? event.id).toLowerCase();
    const matchesSearch =
      !q || event.id.toLowerCase().includes(q) || title.includes(q) || event.category.toLowerCase().includes(q);
    return matchesType && matchesCategory && matchesSearch;
  });

  $: selectedEvent = events.find((event) => event.id === selectedId) ?? null;

  $: selectedIssues = selectedEvent ? validateEvent(selectedEvent) : [];

  function closeModal() {
    dispatch("close");
  }

  function selectEvent(id: string) {
    selectedId = id;
  }

  // 운영 마스터 작업용 임시 추가: 파일 저장 전 검토용 초안
  function addDraftEvent() {
    const base = selectedEvent ?? {
      type: "random",
      category: "media",
      priority: 300,
      oncePolicy: "repeatable",
      cooldownDays: 7,
      weight: 20,
      messageTemplateId: null,
      decisionTemplateId: null
    };

    const draftId = `EVT_DRAFT_${String(Date.now()).slice(-6)}`;
    const draft: ManagedEvent = {
      ...base,
      id: draftId,
      title: "신규 이벤트 초안"
    };

    events = [draft, ...events];
    selectedId = draft.id;
  }

  function removeSelectedEvent() {
    if (!selectedEvent) return;
    const next = events.filter((event) => event.id !== selectedEvent.id);
    events = next;
    selectedId = next[0]?.id ?? "";
  }

  function updateSelectedField(field: keyof ManagedEvent, value: string | number | null) {
    if (!selectedEvent) return;
    events = events.map((event) => (event.id === selectedEvent.id ? { ...event, [field]: value } : event));
  }

  function ensureText(value: string | null): string | null {
    const text = (value ?? "").trim();
    return text.length > 0 ? text : null;
  }

  // 기존 목록을 기준으로 충돌 없는 ID를 자동 생성
  function buildNextId(prefix: string, existing: string[]): string {
    let sequence = existing.length + 1;
    while (existing.includes(`${prefix}_${String(sequence).padStart(3, "0")}`)) {
      sequence += 1;
    }
    return `${prefix}_${String(sequence).padStart(3, "0")}`;
  }

  function validateEvent(event: ManagedEvent): string[] {
    const issues: string[] = [];

    if (!event.id || !event.id.trim()) {
      issues.push("이벤트 ID가 비어 있습니다.");
    }

    if (!event.messageTemplateId) {
      issues.push("메시지 템플릿(`messageTemplateId`)이 지정되지 않았습니다.");
    }

    if (event.messageTemplateId && !messageTemplates.some((item) => item.id === event.messageTemplateId)) {
      issues.push("연결된 메시지 템플릿이 목록에 없습니다.");
    }

    if (event.decisionTemplateId && !decisionTemplates.some((item) => item.id === event.decisionTemplateId)) {
      issues.push("연결된 선택지 템플릿이 목록에 없습니다.");
    }

    if (event.type === "random") {
      if (!event.poolId) {
        issues.push("랜덤 이벤트는 풀 ID(`poolId`)가 필요합니다.");
      }
      if (event.poolId && !poolOptions.some((item) => item.id === event.poolId)) {
        issues.push("연결된 이벤트 풀이 목록에 없습니다.");
      }
      if (!event.weight || Number(event.weight) <= 0) {
        issues.push("랜덤 이벤트는 가중치(`weight`)가 1 이상이어야 합니다.");
      }
    }

    return issues;
  }

  function addPoolOption() {
    const next = buildNextId(
      "POOL_NEW",
      poolOptions.map((pool) => pool.id)
    );
    poolOptions = [...poolOptions, { id: next, description: "로컬 임시 추가 항목" }];
    updateSelectedField("poolId", next);
  }

  function addMessageTemplateOption() {
    const next = buildNextId(
      "MSG_TMPL_NEW",
      messageTemplates.map((item) => item.id)
    );
    messageTemplates = [...messageTemplates, { id: next, subject: "로컬 임시 템플릿" }];
    updateSelectedField("messageTemplateId", next);
  }

  function addDecisionTemplateOption() {
    const next = buildNextId(
      "MSG_DECISION_NEW",
      decisionTemplates.map((item) => item.id)
    );
    decisionTemplates = [...decisionTemplates, { id: next, prompt: "로컬 임시 선택지" }];
    updateSelectedField("decisionTemplateId", next);
  }
</script>

{#if open}
  <div class="event-manager-backdrop" role="presentation" on:click={closeModal}>
    <section class="event-manager" role="dialog" aria-label="이벤트 관리" on:click|stopPropagation>
      <header class="head">
        <div>
          <h2>이벤트 관리 도구</h2>
          <p>배포용 마스터 이벤트를 점검/편집하는 개발자 모드입니다.</p>
        </div>
        <div class="head-actions">
          <button type="button" on:click={loadAll} disabled={loading}>새로고침</button>
          <button type="button" class="ghost" on:click={closeModal}>닫기</button>
        </div>
      </header>

      <div class="toolbar">
        <input type="text" bind:value={search} placeholder="제목/ID 검색" />

        <select bind:value={typeFilter}>
          <option value="all">전체 유형</option>
          <option value="mandatory">mandatory</option>
          <option value="conditional">conditional</option>
          <option value="random">random</option>
        </select>

        <select bind:value={categoryFilter}>
          {#each categories as category}
            <option value={category}>{category === "all" ? "전체 카테고리" : category}</option>
          {/each}
        </select>

        <div class="toolbar-right">
          <button type="button" on:click={addDraftEvent}>초안 추가</button>
          <button type="button" class="danger" on:click={removeSelectedEvent} disabled={!selectedEvent}>선택 삭제</button>
        </div>
      </div>

      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}

      <div class="body">
        <aside class="list-pane">
          <div class="list-head">
            <span>제목</span>
            <span>유형</span>
            <span>카테고리</span>
            <span>우선순위</span>
          </div>
          <ul>
            {#each filteredEvents as event}
              <li>
                <button
                  type="button"
                  class:selected={selectedId === event.id}
                  on:click={() => selectEvent(event.id)}
                >
                  <span class="event-title" title={event.id}>{event.title ?? event.id}</span>
                  <span class="meta">{event.type}</span>
                  <span class="meta">{event.category}</span>
                  <span class="meta">{event.priority}</span>
                </button>
              </li>
            {/each}
          </ul>
        </aside>

        <section class="detail-pane">
          {#if selectedEvent}
            <div class="grid">
              <label>
                <span>이벤트 ID (`id`)</span>
                <input
                  type="text"
                  value={selectedEvent.id}
                  on:change={(e) => updateSelectedField("id", (e.currentTarget as HTMLInputElement).value)}
                />
              </label>

              <label>
                <span>제목 (`title`)</span>
                <input
                  type="text"
                  value={selectedEvent.title ?? ""}
                  on:change={(e) => updateSelectedField("title", (e.currentTarget as HTMLInputElement).value)}
                />
              </label>

              <label>
                <span>유형 (`type`)</span>
                <select
                  value={selectedEvent.type}
                  on:change={(e) => updateSelectedField("type", (e.currentTarget as HTMLSelectElement).value as EventType)}
                >
                  <option value="mandatory">mandatory</option>
                  <option value="conditional">conditional</option>
                  <option value="random">random</option>
                </select>
              </label>

              <label>
                <span>카테고리 (`category`)</span>
                <input
                  type="text"
                  value={selectedEvent.category}
                  on:change={(e) => updateSelectedField("category", (e.currentTarget as HTMLInputElement).value)}
                />
              </label>

              <label>
                <span>우선순위 (`priority`)</span>
                <input
                  type="number"
                  value={selectedEvent.priority}
                  on:change={(e) => updateSelectedField("priority", Number((e.currentTarget as HTMLInputElement).value))}
                />
              </label>

              <label>
                <span>반복 정책 (`oncePolicy`)</span>
                <select
                  value={selectedEvent.oncePolicy ?? "repeatable"}
                  on:change={(e) => updateSelectedField("oncePolicy", (e.currentTarget as HTMLSelectElement).value)}
                >
                  {#each ONCE_POLICY_OPTIONS as oncePolicy}
                    <option value={oncePolicy}>{oncePolicy}</option>
                  {/each}
                </select>
              </label>

              <label>
                <span>쿨다운 일수 (`cooldownDays`)</span>
                <input
                  type="number"
                  value={selectedEvent.cooldownDays ?? 0}
                  on:change={(e) => updateSelectedField("cooldownDays", Number((e.currentTarget as HTMLInputElement).value))}
                />
              </label>

              <label>
                <span>가중치 (`weight`)</span>
                <input
                  type="number"
                  value={selectedEvent.weight ?? 0}
                  on:change={(e) => updateSelectedField("weight", Number((e.currentTarget as HTMLInputElement).value))}
                />
              </label>

              <div class="select-with-action">
                <label>
                  <span>풀 ID (`poolId`)</span>
                  <select
                    value={selectedEvent.poolId ?? ""}
                    on:change={(e) => updateSelectedField("poolId", ensureText((e.currentTarget as HTMLSelectElement).value))}
                  >
                    <option value="">선택 안 함</option>
                    {#each poolOptions as pool}
                      <option value={pool.id}>{pool.id}</option>
                    {/each}
                  </select>
                </label>
                <button type="button" class="mini" on:click={addPoolOption}>풀 추가</button>
              </div>

              <div class="select-with-action">
                <label>
                  <span>메시지 템플릿 (`messageTemplateId`)</span>
                  <select
                    value={selectedEvent.messageTemplateId ?? ""}
                    on:change={(e) => updateSelectedField("messageTemplateId", ensureText((e.currentTarget as HTMLSelectElement).value))}
                  >
                    <option value="">선택 안 함</option>
                    {#each messageTemplates as template}
                      <option value={template.id}>{template.id}</option>
                    {/each}
                  </select>
                </label>
                <button type="button" class="mini" on:click={addMessageTemplateOption}>템플릿 추가</button>
              </div>

              <div class="select-with-action">
                <label>
                  <span>선택지 템플릿 (`decisionTemplateId`)</span>
                  <select
                    value={selectedEvent.decisionTemplateId ?? ""}
                    on:change={(e) => updateSelectedField("decisionTemplateId", ensureText((e.currentTarget as HTMLSelectElement).value))}
                  >
                    <option value="">선택 안 함</option>
                    {#each decisionTemplates as decision}
                      <option value={decision.id}>{decision.id}</option>
                    {/each}
                  </select>
                </label>
                <button type="button" class="mini" on:click={addDecisionTemplateOption}>선택지 추가</button>
              </div>
            </div>

            {#if selectedIssues.length > 0}
              <div class="issues">
                <strong>검증 경고</strong>
                <ul>
                  {#each selectedIssues as issue}
                    <li>{issue}</li>
                  {/each}
                </ul>
              </div>
            {/if}

            <div class="preview">
              <h3>JSON 미리보기</h3>
              <pre>{JSON.stringify(selectedEvent, null, 2)}</pre>
            </div>
          {:else}
            <p class="empty">선택된 이벤트가 없습니다.</p>
          {/if}
        </section>
      </div>
    </section>
  </div>
{/if}

<style>
  .event-manager-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(5, 10, 18, 0.72);
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .event-manager {
    width: min(1360px, 95vw);
    height: min(860px, 92vh);
    background: #111b2f;
    border: 1px solid #324a72;
    border-radius: 14px;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr);
    overflow: hidden;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid #283f63;
  }

  .head h2 {
    margin: 0;
    font-size: 20px;
    color: #e8f0ff;
  }

  .head p {
    margin: 4px 0 0;
    color: #9eb2d4;
    font-size: 13px;
  }

  .head-actions {
    display: flex;
    gap: 8px;
  }

  .toolbar {
    padding: 10px 16px;
    border-bottom: 1px solid #233857;
    display: grid;
    grid-template-columns: minmax(260px, 1fr) 160px 190px auto;
    gap: 8px;
    align-items: center;
  }

  .toolbar-right {
    justify-self: end;
    display: flex;
    gap: 8px;
  }

  .error {
    margin: 0;
    padding: 8px 16px;
    color: #ffd58e;
    background: #2b2530;
    border-bottom: 1px solid #51344f;
    font-size: 13px;
  }

  .body {
    min-height: 0;
    display: grid;
    grid-template-columns: 420px minmax(0, 1fr);
    overflow: hidden;
  }

  .list-pane {
    min-width: 0;
    border-right: 1px solid #223754;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .list-head {
    padding: 10px 12px;
    color: #9eb2d4;
    border-bottom: 1px solid #223754;
    font-size: 12px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 78px 98px 70px;
    gap: 8px;
    align-items: center;
  }

  .list-pane ul {
    margin: 0;
    padding: 8px;
    list-style: none;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
  }

  .list-pane li {
    flex: 0 0 auto;
  }

  .list-pane li button {
    width: 100%;
    text-align: left;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 78px 98px 70px;
    gap: 8px;
    align-items: center;
    background: #17233b;
    border: 1px solid #2a3f63;
    border-radius: 8px;
    padding: 9px 10px;
    cursor: pointer;
    min-height: 42px;
  }

  .list-pane li button.selected {
    background: #243a5f;
    border-color: #6da1f7;
  }

  .event-title {
    color: #e3eeff;
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    color: #9cb2d8;
    font-size: 11px;
    text-align: center;
  }

  .detail-pane {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
  }

  .grid {
    padding: 12px;
    border-bottom: 1px solid #223754;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  label {
    display: grid;
    gap: 6px;
  }

  label span {
    color: #a9bddd;
    font-size: 12px;
  }

  input,
  select,
  button {
    background: #16243c;
    color: #dfeaff;
    border: 1px solid #35527d;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
  }

  button {
    cursor: pointer;
  }

  button.ghost {
    background: #142238;
  }

  button.danger {
    border-color: #74404c;
    background: #2b1e27;
    color: #ffc7cf;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .select-with-action {
    display: grid;
    gap: 6px;
    align-content: end;
  }

  .mini {
    padding: 7px 9px;
    font-size: 12px;
    background: #1a2c48;
    border-color: #44679b;
  }

  .issues {
    margin: 0 12px;
    border: 1px solid #5d3c49;
    background: #2a2027;
    border-radius: 10px;
    padding: 10px 12px;
    color: #ffd2db;
  }

  .issues strong {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
  }

  .issues ul {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 4px;
    font-size: 12px;
  }

  .preview {
    min-height: 0;
    padding: 12px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .preview h3 {
    margin: 0 0 8px;
    color: #d9e8ff;
    font-size: 14px;
  }

  .preview pre {
    margin: 0;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid #2d446a;
    background: #0f1a2b;
    color: #b9cfef;
    overflow: auto;
    font-size: 12px;
    line-height: 1.45;
  }

  .empty {
    margin: 0;
    padding: 18px;
    color: #9eb2d4;
  }
</style>
