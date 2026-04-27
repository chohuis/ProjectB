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
    baseRoll?: { mode: string; value: number };
    maxPicksPerDay?: number;
    eventIds?: string[];
  }

  interface MessageTemplate {
    id: string;
    category?: string;
    subject?: string;
    body?: string;
    decisionTemplateId?: string | null;
  }

  interface DecisionTemplate {
    id: string;
    prompt?: string;
    options?: Array<{ id: string; label: string; effects?: string[] }>;
  }

  interface EventIndexFile {
    files?: {
      pools?: string[];
    };
  }

  interface PoolDraft {
    id: string;
    description: string;
    baseRollMode: "percent";
    baseRollValue: number;
    maxPicksPerDay: number;
    includeCurrentEvent: boolean;
  }

  interface MessageDraft {
    id: string;
    category: string;
    subject: string;
    body: string;
    decisionTemplateId: string;
  }

  interface DecisionOptionDraft {
    id: string;
    label: string;
    effectsText: string;
  }

  interface DecisionDraft {
    id: string;
    prompt: string;
    options: DecisionOptionDraft[];
  }

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  const EVENT_SAVE_LOCAL_KEY = "dev_events_rules";
  const EVENT_SAVE_PATHS: Record<EventType, string> = {
    mandatory: "events/rules/mandatory.json",
    conditional: "events/rules/conditional.json",
    random: "events/rules/random.json"
  };

  let loading = false;
  let saving = false;
  let errorMessage = "";
  let saveMessage = "";
  let saveError = "";
  let idError = "";
  let events: ManagedEvent[] = [];
  let selectedId = "";
  let search = "";
  let typeFilter: "all" | EventType = "all";
  let categoryFilter = "all";

  let poolOptions: PoolFile[] = [];
  let messageTemplates: MessageTemplate[] = [];
  let decisionTemplates: DecisionTemplate[] = [];

  const ONCE_POLICY_OPTIONS = ["repeatable", "once_per_stage_year", "once_per_season", "once_per_career"];
  const DEFAULT_MESSAGE_CATEGORIES = ["system", "news", "coach", "manager"];

  let poolPopupOpen = false;
  let messagePopupOpen = false;
  let decisionPopupOpen = false;
  let messageCategoryOptions: string[] = [...DEFAULT_MESSAGE_CATEGORIES];

  let poolDraft: PoolDraft = createPoolDraft();
  let messageDraft: MessageDraft = createMessageDraft();
  let decisionDraft: DecisionDraft = createDecisionDraft();

  let poolPopupError = "";
  let messagePopupError = "";
  let decisionPopupError = "";
  let newMessageCategory = "";

  // Ctrl+Q로 열 때 즉시 사용할 수 있도록 최초 1회 로드
  onMount(async () => {
    await loadAll();
  });

  async function loadAll() {
    saveMessage = "";
    saveError = "";
    await Promise.all([loadEvents(), loadReferenceLists()]);
  }

  async function saveEvents() {
    saveMessage = "";
    saveError = "";
    saving = true;
    try {
      const byType: Record<EventType, ManagedEvent[]> = { mandatory: [], conditional: [], random: [] };
      for (const ev of events) {
        byType[ev.type]?.push(ev);
      }

      if (window.projectB?.masterSave) {
        const results = await Promise.all(
          (Object.entries(byType) as [EventType, ManagedEvent[]][]).map(([type, evs]) =>
            window.projectB!.masterSave({ relPath: EVENT_SAVE_PATHS[type], data: { events: evs }, backup: true })
          )
        );
        const failed = results.find((r) => !r?.ok);
        if (failed) {
          saveError = `파일 저장 실패: ${failed.error ?? "알 수 없는 오류"}`;
        } else {
          saveMessage = `저장 완료 (mandatory ${byType.mandatory.length}건 / conditional ${byType.conditional.length}건 / random ${byType.random.length}건, 백업 생성)`;
        }
      } else {
        window.localStorage.setItem(EVENT_SAVE_LOCAL_KEY, JSON.stringify(byType));
        saveMessage = "로컬 임시 저장 완료";
      }
    } catch (error) {
      saveError = `저장 실패: ${String((error as Error)?.message ?? error)}`;
    } finally {
      saving = false;
    }
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
        poolPaths.map(async (path) => await fetchJsonSafe<PoolFile>(path))
      );

      poolOptions = poolsLoaded.filter((pool): pool is PoolFile => Boolean(pool?.id));
    } catch (error) {
      console.warn("[EventManagerModal] failed to load pool list", error);
      poolOptions = [];
    }

    try {
      const data = await fetchJsonSafe<{ templates?: MessageTemplate[] }>("/data/master/messages/templates.json");
      if (data) {
        messageTemplates = data.templates ?? [];
      }
    } catch (error) {
      console.warn("[EventManagerModal] failed to load message templates", error);
      messageTemplates = [];
    }

    try {
      const data = await fetchJsonSafe<{ decisions?: DecisionTemplate[] }>(
        "/data/master/messages/decision_templates.json"
      );
      if (data) {
        decisionTemplates = data.decisions ?? [];
      }
    } catch (error) {
      console.warn("[EventManagerModal] failed to load decision templates", error);
      decisionTemplates = [];
    }
  }

  async function resolvePoolPaths(): Promise<string[]> {
    try {
      const data = await fetchJsonSafe<EventIndexFile>("/data/master/events/index.json");
      if (data) {
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

  // JSON 경로가 HTML fallback(예: index.html)로 응답될 때 파싱 오류를 막는다.
  async function fetchJsonSafe<T>(path: string): Promise<T | null> {
    const response = await fetch(path);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null;

    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
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
  $: messageCategoryOptions = Array.from(
    new Set([
      ...DEFAULT_MESSAGE_CATEGORIES,
      ...messageTemplates.map((item) => (item.category ?? "").trim()).filter(Boolean)
    ])
  );

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
    if (field === "id" && typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) { idError = "이벤트 ID는 비워둘 수 없습니다."; return; }
      if (events.some((ev) => ev.id !== selectedEvent.id && ev.id === trimmed)) {
        idError = `이미 존재하는 ID입니다: ${trimmed}`;
        return;
      }
      idError = "";
      const oldId = selectedEvent.id;
      events = events.map((event) => (event.id === oldId ? { ...event, id: trimmed } : event));
      selectedId = trimmed;
      return;
    }
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

  function createPoolDraft(): PoolDraft {
    return {
      id: buildNextId("POOL_NEW", poolOptions.map((pool) => pool.id)),
      description: "",
      baseRollMode: "percent",
      baseRollValue: 20,
      maxPicksPerDay: 1,
      includeCurrentEvent: true
    };
  }

  function createMessageDraft(): MessageDraft {
    return {
      id: buildNextId("MSG_TMPL_NEW", messageTemplates.map((item) => item.id)),
      category: messageCategoryOptions[0] ?? "system",
      subject: "",
      body: "",
      decisionTemplateId: ""
    };
  }

  function createDecisionDraft(): DecisionDraft {
    return {
      id: buildNextId("MSG_DECISION_NEW", decisionTemplates.map((item) => item.id)),
      prompt: "",
      options: [
        { id: "option_a", label: "선택지 A", effectsText: "" },
        { id: "option_b", label: "선택지 B", effectsText: "" }
      ]
    };
  }

  function openPoolPopup() {
    poolPopupError = "";
    poolDraft = createPoolDraft();
    poolPopupOpen = true;
  }

  function openMessagePopup() {
    messagePopupError = "";
    messageDraft = createMessageDraft();
    newMessageCategory = "";
    messagePopupOpen = true;
  }

  function addMessageCategoryOption() {
    const next = ensureText(newMessageCategory);
    if (!next) return;
    messageDraft = { ...messageDraft, category: next };
    newMessageCategory = "";
  }

  function openDecisionPopup() {
    decisionPopupError = "";
    decisionDraft = createDecisionDraft();
    decisionPopupOpen = true;
  }

  // 팝업 취소: 팝업 오픈 이전 상태로 폐기하고 닫는다.
  function cancelPoolPopup() {
    poolPopupError = "";
    poolDraft = createPoolDraft();
    poolPopupOpen = false;
  }

  function cancelMessagePopup() {
    messagePopupError = "";
    messageDraft = createMessageDraft();
    newMessageCategory = "";
    messagePopupOpen = false;
  }

  function cancelDecisionPopup() {
    decisionPopupError = "";
    decisionDraft = createDecisionDraft();
    decisionPopupOpen = false;
  }

  function createPool() {
    if (!poolDraft.id.trim()) {
      poolPopupError = "풀 ID를 입력하세요.";
      return;
    }
    if (poolOptions.some((item) => item.id === poolDraft.id)) {
      poolPopupError = "이미 존재하는 풀 ID입니다.";
      return;
    }
    if (poolDraft.baseRollValue < 0 || poolDraft.baseRollValue > 100) {
      poolPopupError = "baseRoll 값은 0~100 범위여야 합니다.";
      return;
    }
    if (poolDraft.maxPicksPerDay < 1) {
      poolPopupError = "일일 최대 추첨 횟수는 1 이상이어야 합니다.";
      return;
    }

    const eventIds = poolDraft.includeCurrentEvent && selectedEvent ? [selectedEvent.id] : [];
    poolOptions = [
      ...poolOptions,
      {
        id: poolDraft.id,
        description: poolDraft.description.trim() || "로컬 임시 추가 항목",
        baseRoll: { mode: poolDraft.baseRollMode, value: Number(poolDraft.baseRollValue) },
        maxPicksPerDay: Number(poolDraft.maxPicksPerDay),
        eventIds
      }
    ];
    updateSelectedField("poolId", poolDraft.id);
    poolPopupOpen = false;
  }

  function createMessageTemplate() {
    if (!messageDraft.id.trim()) {
      messagePopupError = "메시지 템플릿 ID를 입력하세요.";
      return;
    }
    if (messageTemplates.some((item) => item.id === messageDraft.id)) {
      messagePopupError = "이미 존재하는 메시지 템플릿 ID입니다.";
      return;
    }
    if (!messageDraft.subject.trim() || !messageDraft.body.trim()) {
      messagePopupError = "제목과 본문은 필수입니다.";
      return;
    }

    const selectedDecisionId = ensureText(messageDraft.decisionTemplateId);
    if (selectedDecisionId && !decisionTemplates.some((item) => item.id === selectedDecisionId)) {
      messagePopupError = "연결할 선택지 템플릿이 목록에 없습니다.";
      return;
    }

    messageTemplates = [
      ...messageTemplates,
      {
        id: messageDraft.id,
        category: messageDraft.category,
        subject: messageDraft.subject,
        body: messageDraft.body,
        decisionTemplateId: selectedDecisionId
      }
    ];
    updateSelectedField("messageTemplateId", messageDraft.id);
    if (selectedDecisionId) updateSelectedField("decisionTemplateId", selectedDecisionId);
    messagePopupOpen = false;
  }

  function addDecisionOptionRow() {
    const next = decisionDraft.options.length + 1;
    decisionDraft = {
      ...decisionDraft,
      options: [...decisionDraft.options, { id: `option_${next}`, label: `선택지 ${next}`, effectsText: "" }]
    };
  }

  function removeDecisionOptionRow(index: number) {
    if (decisionDraft.options.length <= 2) return;
    decisionDraft = {
      ...decisionDraft,
      options: decisionDraft.options.filter((_, i) => i !== index)
    };
  }

  function createDecisionTemplate() {
    if (!decisionDraft.id.trim()) {
      decisionPopupError = "선택지 템플릿 ID를 입력하세요.";
      return;
    }
    if (decisionTemplates.some((item) => item.id === decisionDraft.id)) {
      decisionPopupError = "이미 존재하는 선택지 템플릿 ID입니다.";
      return;
    }
    if (!decisionDraft.prompt.trim()) {
      decisionPopupError = "질문(prompt)을 입력하세요.";
      return;
    }

    const options = decisionDraft.options
      .map((option) => ({
        id: option.id.trim(),
        label: option.label.trim(),
        effects: option.effectsText
          .split(",")
          .map((effect) => effect.trim())
          .filter(Boolean)
      }))
      .filter((option) => option.id && option.label);

    if (options.length < 2) {
      decisionPopupError = "선택지는 최소 2개가 필요합니다.";
      return;
    }

    decisionTemplates = [...decisionTemplates, { id: decisionDraft.id, prompt: decisionDraft.prompt, options }];
    updateSelectedField("decisionTemplateId", decisionDraft.id);
    decisionPopupOpen = false;
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
          <button type="button" on:click={loadAll} disabled={loading || saving}>새로고침</button>
          <button type="button" class="save-btn" on:click={saveEvents} disabled={loading || saving}>
            {saving ? "저장 중…" : "파일 저장"}
          </button>
          <button type="button" class="ghost" on:click={closeModal}>닫기</button>
        </div>
      </header>

      {#if saveMessage}
        <p class="save-ok">{saveMessage}</p>
      {/if}
      {#if saveError}
        <p class="save-err">{saveError}</p>
      {/if}

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
                {#if idError}<small class="id-error">{idError}</small>{/if}
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
                <button type="button" class="mini" on:click={openPoolPopup}>풀 추가</button>
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
                <button type="button" class="mini" on:click={openMessagePopup}>템플릿 추가</button>
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
                <button type="button" class="mini" on:click={openDecisionPopup}>선택지 추가</button>
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

    {#if poolPopupOpen}
      <section class="popup" role="dialog" aria-label="풀 추가" on:click|stopPropagation>
        <header>
          <h3>풀 추가</h3>
          <button type="button" class="ghost" on:click={cancelPoolPopup}>닫기</button>
        </header>
        <div class="popup-grid">
          <label>
            <span>풀 ID (`id`)</span>
            <input type="text" bind:value={poolDraft.id} />
            <small class="hint">랜덤 이벤트 그룹의 고유 키입니다. 예: `POOL_MEDIA_DAILY`</small>
          </label>
          <label>
            <span>설명 (`description`)</span>
            <input type="text" bind:value={poolDraft.description} />
            <small class="hint">운영자가 용도를 파악하기 위한 설명입니다.</small>
          </label>
          <label>
            <span>기본 추첨 방식 (`baseRoll.mode`)</span>
            <input type="text" value={poolDraft.baseRollMode} disabled />
            <small class="hint">현재는 `percent` 고정입니다.</small>
          </label>
          <label>
            <span>기본 추첨 확률 (`baseRoll.value`)</span>
            <input type="number" min="0" max="100" bind:value={poolDraft.baseRollValue} />
            <small class="hint">0~100. 해당 풀을 검사할지 결정하는 확률입니다.</small>
          </label>
          <label>
            <span>일일 최대 추첨 횟수 (`maxPicksPerDay`)</span>
            <input type="number" min="1" bind:value={poolDraft.maxPicksPerDay} />
            <small class="hint">하루에 이 풀에서 뽑을 최대 이벤트 수입니다.</small>
          </label>
          <label class="check">
            <input type="checkbox" bind:checked={poolDraft.includeCurrentEvent} />
            <span>현재 이벤트를 `eventIds`에 자동 포함</span>
          </label>

          <div class="existing-list">
            <strong>기존 풀 목록</strong>
            <ul>
              {#each poolOptions as item}
                <li><code>{item.id}</code> · {item.description ?? "-"}</li>
              {/each}
            </ul>
          </div>
        </div>
        {#if poolPopupError}
          <p class="popup-error">{poolPopupError}</p>
        {/if}
        <footer>
          <button type="button" class="ghost" on:click={cancelPoolPopup}>취소</button>
          <button type="button" on:click={createPool}>저장</button>
        </footer>
      </section>
    {/if}

    {#if messagePopupOpen}
      <section class="popup" role="dialog" aria-label="메시지 템플릿 추가" on:click|stopPropagation>
        <header>
          <h3>메시지 템플릿 추가</h3>
          <button type="button" class="ghost" on:click={cancelMessagePopup}>닫기</button>
        </header>
        <div class="popup-grid">
          <label>
            <span>템플릿 ID (`id`)</span>
            <input type="text" bind:value={messageDraft.id} />
            <small class="hint">메시지 텍스트 템플릿의 고유 키입니다. 예: `MSG_TMPL_...`</small>
          </label>
          <label>
            <span>카테고리 (`category`)</span>
            <select bind:value={messageDraft.category}>
              {#each messageCategoryOptions as category}
                <option value={category}>{category}</option>
              {/each}
            </select>
            <div class="inline-add">
              <input type="text" bind:value={newMessageCategory} placeholder="새 카테고리 입력" />
              <button type="button" class="mini" on:click={addMessageCategoryOption}>카테고리 추가</button>
            </div>
            <small class="hint">메시지함 분류값입니다. 예: `system`, `coach`, `news`</small>
          </label>
          <label>
            <span>제목 (`subject`)</span>
            <input type="text" bind:value={messageDraft.subject} />
            <small class="hint">메시지 리스트에 표시됩니다.</small>
          </label>
          <label>
            <span>본문 (`body`)</span>
            <textarea rows="4" bind:value={messageDraft.body}></textarea>
            <small class="hint">메시지 상세 팝업의 본문으로 사용됩니다.</small>
          </label>
          <label>
            <span>기본 선택지 템플릿 (`decisionTemplateId`)</span>
            <select bind:value={messageDraft.decisionTemplateId}>
              <option value="">연결 안 함</option>
              {#each decisionTemplates as decision}
                <option value={decision.id}>{decision.id}</option>
              {/each}
            </select>
            <small class="hint">이 메시지 템플릿에 기본 선택지를 연결합니다.</small>
          </label>

          <div class="existing-list">
            <strong>기존 메시지 템플릿 목록</strong>
            <ul>
              {#each messageTemplates as item}
                <li><code>{item.id}</code> · {item.category ?? "-"} · {item.subject ?? "-"}</li>
              {/each}
            </ul>
          </div>
        </div>
        {#if messagePopupError}
          <p class="popup-error">{messagePopupError}</p>
        {/if}
        <footer>
          <button type="button" class="ghost" on:click={cancelMessagePopup}>취소</button>
          <button type="button" on:click={createMessageTemplate}>저장</button>
        </footer>
      </section>
    {/if}

    {#if decisionPopupOpen}
      <section class="popup" role="dialog" aria-label="선택지 템플릿 추가" on:click|stopPropagation>
        <header>
          <h3>선택지 템플릿 추가</h3>
          <button type="button" class="ghost" on:click={cancelDecisionPopup}>닫기</button>
        </header>
        <div class="popup-grid">
          <label>
            <span>선택지 템플릿 ID (`id`)</span>
            <input type="text" bind:value={decisionDraft.id} />
            <small class="hint">선택 버튼 묶음의 고유 키입니다. 예: `MSG_DECISION_...`</small>
          </label>
          <label>
            <span>질문 (`prompt`)</span>
            <input type="text" bind:value={decisionDraft.prompt} />
            <small class="hint">메시지 팝업에서 사용자에게 노출되는 질문 문장입니다.</small>
          </label>

          <div class="option-table">
            <div class="option-head">선택지 목록 (`options`)</div>
            {#each decisionDraft.options as option, idx}
              <div class="option-row">
                <input type="text" bind:value={option.id} placeholder="option id" />
                <input type="text" bind:value={option.label} placeholder="버튼 라벨" />
                <input type="text" bind:value={option.effectsText} placeholder="effect1, effect2" />
                <button type="button" class="danger mini" on:click={() => removeDecisionOptionRow(idx)} disabled={decisionDraft.options.length <= 2}>삭제</button>
              </div>
            {/each}
            <small class="hint">effects는 쉼표로 구분합니다. 예: `condition:-4, xp.command:+1`</small>
            <button type="button" class="mini" on:click={addDecisionOptionRow}>선택지 행 추가</button>
          </div>

          <div class="existing-list">
            <strong>기존 선택지 템플릿 목록</strong>
            <ul>
              {#each decisionTemplates as item}
                <li><code>{item.id}</code> · {item.prompt ?? "-"}</li>
              {/each}
            </ul>
          </div>
        </div>
        {#if decisionPopupError}
          <p class="popup-error">{decisionPopupError}</p>
        {/if}
        <footer>
          <button type="button" class="ghost" on:click={cancelDecisionPopup}>취소</button>
          <button type="button" on:click={createDecisionTemplate}>저장</button>
        </footer>
      </section>
    {/if}
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

  .save-ok {
    margin: 0;
    padding: 6px 16px;
    color: #7ddba4;
    background: #182d22;
    border-bottom: 1px solid #2d5c40;
    font-size: 12px;
  }

  .save-err {
    margin: 0;
    padding: 6px 16px;
    color: #ffa8a8;
    background: #2b1a1a;
    border-bottom: 1px solid #5c2d2d;
    font-size: 12px;
  }

  .save-btn {
    background: #1a3a5c;
    border-color: #4a85c8;
    color: #b8d8ff;
  }

  .id-error {
    color: #ff8fa3;
    font-size: 11px;
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

  .hint {
    color: #7f9ac5;
    font-size: 11px;
    line-height: 1.35;
  }

  input,
  select,
  button,
  textarea {
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

  .popup {
    position: fixed;
    z-index: 95;
    width: min(780px, 92vw);
    max-height: 86vh;
    overflow: auto;
    background: #101d33;
    border: 1px solid #36507a;
    border-radius: 12px;
    padding: 12px;
    display: grid;
    gap: 10px;
  }

  .popup header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #294367;
    padding-bottom: 8px;
  }

  .popup h3 {
    margin: 0;
    color: #e6efff;
    font-size: 17px;
  }

  .popup-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .inline-add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
  }

  .check {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .check input {
    width: 16px;
    height: 16px;
  }

  .option-table {
    grid-column: 1 / -1;
    border: 1px solid #2e476c;
    border-radius: 10px;
    padding: 10px;
    display: grid;
    gap: 8px;
    background: #0f1c31;
  }

  .existing-list {
    grid-column: 1 / -1;
    border: 1px solid #2f4a73;
    background: #0f1d33;
    border-radius: 10px;
    padding: 10px;
    display: grid;
    gap: 8px;
  }

  .existing-list strong {
    color: #c6d7f3;
    font-size: 12px;
  }

  .existing-list ul {
    margin: 0;
    padding-left: 18px;
    max-height: 150px;
    overflow: auto;
    display: grid;
    gap: 4px;
    color: #a9bfdf;
    font-size: 12px;
  }

  .existing-list code {
    color: #dfeaff;
  }

  .option-head {
    color: #bdd0ed;
    font-size: 12px;
  }

  .option-row {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr) minmax(0, 1fr) 70px;
    gap: 8px;
    align-items: center;
  }

  .popup-error {
    margin: 0;
    color: #ffccd7;
    background: #361f2a;
    border: 1px solid #6a3f52;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
  }

  .popup footer {
    display: flex;
    justify-content: flex-end;
  }
</style>
