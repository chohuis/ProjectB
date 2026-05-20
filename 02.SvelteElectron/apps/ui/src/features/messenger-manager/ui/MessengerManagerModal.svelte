<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { get } from "svelte/store";
  import { masterStore } from "../../../shared/stores/master";
  import type { EntityRow } from "../../../shared/stores/master";
  import type {
    ContactDef, ContactArc, ScriptStep, ScriptOption,
    SimpleChatLine, SpecialChatLine, ChatOption,
    ChatCondition, ContactEffect, ArcTriggerCondition,
  } from "../../../shared/types/messenger";
  import { isSpecialChat } from "../../../shared/types/messenger";

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  // ── 상태 ─────────────────────────────────────────────────────
  let contacts: ContactDef[] = [];
  let selectedId: string | null = null;
  let editing: ContactDef | null = null;
  let isDirty = false;
  let saving = false;
  let activeTab: "info" | "arcs" | "chat" = "info";

  // 아크 탭
  let selectedArcIdx = -1;
  let selectedStepIdx = -1;

  // 채팅 탭
  let chatAction: "greet" | "advice" | "plan" = "greet";
  let selectedChatIdx = -1;

  // 엔티티 피커
  let showPicker = false;
  let pickerFilter = "";

  // ── 초기화 (open이 false→true로 바뀔 때만) ──────────────────
  let _wasOpen = false;
  $: if (open !== _wasOpen) {
    _wasOpen = open;
    if (open) initModal();
  }

  function initModal() {
    const m = get(masterStore);
    contacts = m.contactDefs.map((d) => JSON.parse(JSON.stringify(d)));
    pickerFilter = "";
    showPicker = false;
    if (contacts.length > 0) {
      selectContact(contacts[0].id);
    } else {
      editing = null;
      selectedId = null;
    }
  }

  function selectContact(id: string) {
    selectedId = id;
    editing = contacts.find((c) => c.id === id) ?? null;
    isDirty = false;
    activeTab = "info";
    selectedArcIdx = -1;
    selectedStepIdx = -1;
    selectedChatIdx = -1;
  }

  function mark() {
    isDirty = true;
    editing = editing;
  }

  // ── 엔티티 피커 ──────────────────────────────────────────────
  const ROLE_LABELS: Record<string, string> = {
    player: "선수", coach: "코치", manager: "감독", owner: "구단주",
  };

  $: pickerEntities = $masterStore.entities.filter((e) => {
    const existingId = `CONTACT_${e.id}`;
    if (contacts.some((c) => c.id === existingId)) return false;
    if (!pickerFilter) return true;
    return e.name.includes(pickerFilter) || (e.nameEn ?? "").toLowerCase().includes(pickerFilter.toLowerCase());
  });

  function pickEntity(e: EntityRow) {
    const newDef: ContactDef = {
      id: `CONTACT_${e.id}`,
      name: e.name,
      nameEn: e.nameEn ?? "",
      category: "team",
      relation: ROLE_LABELS[e.role] ?? e.role,
      relationEn: e.role,
      initialAffinity: 30,
      arcs: [],
      chat: { greet: [], advice: [], plan: [] },
    };
    contacts = [...contacts, newDef];
    showPicker = false;
    pickerFilter = "";
    selectContact(newDef.id);
    isDirty = true;
  }

  // ── 아크 헬퍼 ────────────────────────────────────────────────
  $: arc = editing && selectedArcIdx >= 0 ? editing.arcs[selectedArcIdx] ?? null : null;
  $: step = arc && selectedStepIdx >= 0 ? arc.script.steps[selectedStepIdx] ?? null : null;

  function addArc() {
    if (!editing) return;
    const ts = Date.now();
    const a: ContactArc = {
      id: `arc_${ts}`,
      flag: `arc_flag_${ts}`,
      trigger: {},
      script: { startStepId: "", steps: [] },
    };
    editing.arcs = [...editing.arcs, a];
    selectedArcIdx = editing.arcs.length - 1;
    selectedStepIdx = -1;
    mark();
  }

  function deleteArc(idx: number) {
    if (!editing) return;
    editing.arcs = editing.arcs.filter((_, i) => i !== idx);
    if (selectedArcIdx >= editing.arcs.length) selectedArcIdx = editing.arcs.length - 1;
    selectedStepIdx = -1;
    mark();
  }

  function addStep(from: "contact" | "player") {
    if (!arc) return;
    const ts = Date.now();
    const s: ScriptStep = from === "contact"
      ? { id: `step_${ts}`, from: "contact", text: "", textEn: "", next: null }
      : { id: `step_p_${ts}`, from: "player", options: [] };
    arc.script.steps = [...arc.script.steps, s];
    selectedStepIdx = arc.script.steps.length - 1;
    mark();
  }

  function deleteStep(idx: number) {
    if (!arc) return;
    arc.script.steps = arc.script.steps.filter((_, i) => i !== idx);
    if (selectedStepIdx >= arc.script.steps.length) selectedStepIdx = arc.script.steps.length - 1;
    mark();
  }

  function addOption(s: ScriptStep & { from: "player" }) {
    const ts = Date.now();
    const opt: ScriptOption = { id: `opt_${ts}`, text: "", textEn: "", next: null };
    s.options = [...s.options, opt];
    mark();
  }

  function deleteOption(s: ScriptStep & { from: "player" }, idx: number) {
    s.options = s.options.filter((_, i) => i !== idx);
    mark();
  }

  // ── 채팅 헬퍼 ────────────────────────────────────────────────
  $: chatLines = editing?.chat?.[chatAction] ?? [];
  $: selectedLine = selectedChatIdx >= 0 ? (chatLines[selectedChatIdx] ?? null) : null;

  function addSimpleLine() {
    if (!editing) return;
    const line: SimpleChatLine = { lines: [""], linesEn: [""] };
    editing.chat[chatAction] = [...(editing.chat[chatAction] ?? []), line];
    selectedChatIdx = (editing.chat[chatAction]?.length ?? 1) - 1;
    mark();
  }

  function addSpecialLine() {
    if (!editing) return;
    const line: SpecialChatLine = {
      flag: `flag_${Date.now()}`,
      prompt: "",
      promptEn: "",
      options: [],
    };
    editing.chat[chatAction] = [...(editing.chat[chatAction] ?? []), line];
    selectedChatIdx = (editing.chat[chatAction]?.length ?? 1) - 1;
    mark();
  }

  function deleteChatLine(idx: number) {
    if (!editing) return;
    editing.chat[chatAction] = (editing.chat[chatAction] ?? []).filter((_, i) => i !== idx);
    if (selectedChatIdx >= (editing.chat[chatAction]?.length ?? 0)) selectedChatIdx = -1;
    mark();
  }

  function addChatOpt(line: SpecialChatLine) {
    const opt: ChatOption = { id: `copt_${Date.now()}`, text: "", textEn: "", reply: "", replyEn: "" };
    line.options = [...line.options, opt];
    mark();
  }

  function deleteChatOpt(line: SpecialChatLine, idx: number) {
    line.options = line.options.filter((_, i) => i !== idx);
    mark();
  }

  // ── 컨디션 에디터 헬퍼 ──────────────────────────────────────
  function ensureCond(line: SimpleChatLine | SpecialChatLine): ChatCondition {
    if (!line.condition) line.condition = {};
    return line.condition;
  }

  function clearCond(line: SimpleChatLine | SpecialChatLine) {
    delete line.condition;
    mark();
  }

  // ── 이펙트 에디터 헬퍼 ──────────────────────────────────────
  const PITCHING_STATS = ["stamina", "velocity", "command", "control", "movement", "mentality", "recovery"];

  function ensureEffect(obj: ChatOption | ScriptOption): ContactEffect {
    if (!obj.effects) obj.effects = {};
    return obj.effects as ContactEffect;
  }

  function getXp(eff: ContactEffect | undefined, stat: string): number {
    return eff?.xp?.[stat] ?? 0;
  }

  function setXp(eff: ContactEffect, stat: string, val: number) {
    if (!eff.xp) eff.xp = {};
    if (val === 0) delete eff.xp[stat];
    else eff.xp[stat] = val;
    mark();
  }

  function getStat(eff: ContactEffect | undefined, stat: string): number {
    return (eff as any)?.statDelta?.[stat] ?? 0;
  }

  function setStat(eff: ContactEffect, stat: string, val: number) {
    if (!(eff as any).statDelta) (eff as any).statDelta = {};
    if (val === 0) delete (eff as any).statDelta[stat];
    else (eff as any).statDelta[stat] = val;
    mark();
  }

  // ── 채팅 라인 순서 이동 ──────────────────────────────────────
  function moveChatLine(idx: number, dir: -1 | 1) {
    if (!editing) return;
    const arr = [...(editing.chat[chatAction] ?? [])];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    editing.chat[chatAction] = arr;
    selectedChatIdx = newIdx;
    mark();
  }

  // ── 드롭다운용 아크 스텝 ID 목록 ─────────────────────────────
  $: arcStepIds = arc?.script.steps.map((s) => s.id) ?? [];

  // ── 대화 미리보기 ────────────────────────────────────────────
  let showPreview = false;

  type PreviewBubble =
    | { kind: "npc"; text: string }
    | { kind: "player"; options: Array<{ text: string; next: string | null }> };

  $: previewBubbles = (() => {
    if (!arc?.script.startStepId) return [] as PreviewBubble[];
    const stepMap = new Map(arc.script.steps.map((s) => [s.id, s]));
    const bubbles: PreviewBubble[] = [];
    let cur: string | null = arc.script.startStepId;
    const visited = new Set<string>();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const s = stepMap.get(cur);
      if (!s) break;
      if (s.from === "contact") {
        bubbles.push({ kind: "npc", text: s.text || "(빈 대사)" });
        cur = s.next;
      } else {
        bubbles.push({ kind: "player", options: s.options.map((o) => ({ text: o.text || "(빈 선택지)", next: o.next })) });
        cur = s.options[0]?.next ?? null;
      }
    }
    return bubbles;
  })();

  // ── 가이드 ──────────────────────────────────────────────────
  let showGuide = false;

  // ── 저장 ────────────────────────────────────────────────────
  async function save() {
    if (!editing || saving) return;
    saving = true;
    try {
      contacts = contacts.map((c) => (c.id === editing!.id ? editing! : c));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saver = window.projectB!?.masterSave;
      if (!saver) { alert("masterSave IPC 없음"); return; }

      await saver({ relPath: `characters/${editing.id}.json`, data: editing, backup: false });

      await masterStore.reloadContacts();
      isDirty = false;
    } finally {
      saving = false;
    }
  }

  function close() {
    if (isDirty && !confirm("저장하지 않은 변경이 있습니다. 닫으시겠습니까?")) return;
    dispatch("close");
  }
</script>

{#if open}
  <div class="overlay" role="presentation" on:click|self={close}>
    <section class="modal" role="dialog" aria-label="메신저 에디터">

      <!-- ── 헤더 ── -->
      <header class="hdr">
        <div class="hdr-left">
          <h2>메신저 에디터</h2>
          <button class="btn-guide" on:click={() => (showGuide = !showGuide)}>
            {showGuide ? "가이드 닫기" : "? 사용 가이드"}
          </button>
        </div>
        <div class="hdr-actions">
          {#if isDirty}
            <button class="btn-save" on:click={save} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </button>
          {/if}
          <button class="btn-close" on:click={close}>닫기</button>
        </div>
      </header>

      <!-- ── 사용 가이드 ── -->
      {#if showGuide}
        <div class="guide-panel">
          <div class="guide-cols">
            <div class="guide-section">
              <p class="guide-title">① NPC 등록 순서</p>
              <ol class="guide-list">
                <li><strong>+ 추가</strong> 클릭 → 검색창에서 인물 선택 (선수/감독/코치 등 엔티티 기반)</li>
                <li><strong>기본정보</strong> 탭에서 이름·관계·카테고리·초기 친밀도 설정</li>
                <li><strong>저장</strong> 버튼으로 JSON 파일 생성 후 다음 탭 작업</li>
              </ol>
            </div>
            <div class="guide-section">
              <p class="guide-title">② 아크 스크립트 (자동 트리거 이벤트)</p>
              <ol class="guide-list">
                <li><strong>아크 탭</strong> → <strong>+ 추가</strong>로 새 아크 생성</li>
                <li><strong>트리거 조건</strong> 설정 — 주차·커리어·친밀도 외에 <em>Flag 조건</em>도 지원. "이 Flag가 있어야 발동"으로 채팅 완료 후 아크를 연결할 수 있음</li>
                <li><strong>+ NPC</strong> / <strong>+ 선택지</strong>로 스텝 추가. 스텝 클릭 시 편집창 열림</li>
                <li>NPC 스텝: 대사(KR/EN) + <em>next StepID</em> 입력 (다음 스텝 ID, 비우면 종료)</li>
                <li>선택지 스텝: 선택지 항목마다 텍스트·친밀도·이펙트·next 지정</li>
                <li><strong>시작 StepID</strong>에 첫 번째 스텝 ID를 정확히 입력해야 대화가 시작됨</li>
              </ol>
            </div>
            <div class="guide-section">
              <p class="guide-title">③ 채팅 카탈로그 (플레이어가 버튼으로 말 걸기)</p>
              <ol class="guide-list">
                <li><strong>채팅 탭</strong> → <strong>인사 / 조언 / 계획</strong> 중 원하는 버튼 선택</li>
                <li><strong>+ 일반</strong>: NPC가 랜덤으로 응답하는 일반 대화. 줄을 여러 개 추가하면 무작위 선택</li>
                <li><strong>+ 특수</strong>: 1회성 선택지 대화. 조건 충족 시 NPC가 제안을 건네고 플레이어가 선택. 완료 후 Flag 기록</li>
                <li><strong>표시 조건</strong>으로 친밀도 범위·Flag 유무를 지정해 특정 상황에서만 나오게 설정</li>
                <li>특수 대화의 이펙트: 컨디션·피로·사기·스탯 XP·구종 해금(unlockPitchId) 지원</li>
              </ol>
            </div>
            <div class="guide-section">
              <p class="guide-title">④ 주요 필드 설명</p>
              <ul class="guide-list">
                <li><strong>Flag</strong> — 완료 표시용 고유 문자열. 중복되면 이미 본 대화로 인식해 스킵됨</li>
                <li><strong>카테고리</strong> — team(팀원), school(학교), personal(개인): 메신저 탭 필터링에 사용</li>
                <li><strong>초기 친밀도</strong> — NPC 첫 등록 시 부여되는 친밀도 (0~100)</li>
                <li><strong>affinityGte / Lt</strong> — 친밀도 ≥ 값 / &lt; 값일 때만 표시</li>
                <li><strong>XP · stamina 등</strong> — 투구 스탯 경험치 누적. 0이면 미적용. 스탯: stamina/velocity/command/control/movement/mentality/recovery</li>
                <li><strong>즉시 · stamina 등</strong> — 투구 스탯을 즉시 영구 증가 (1~99 클램프). 0이면 미적용</li>
              </ul>
            </div>
          </div>
        </div>
      {/if}

      <div class="body">

        <!-- ── 좌측: NPC 목록 ── -->
        <aside class="sidebar">
          <div class="sidebar-top">
            <p class="sidebar-label">NPC 목록</p>
            <button class="btn-add" on:click={() => (showPicker = !showPicker)}>
              + 추가
            </button>
          </div>

          {#if showPicker}
            <div class="picker">
              <input
                class="picker-search"
                type="text"
                placeholder="검색..."
                bind:value={pickerFilter}
              />
              <div class="picker-list">
                {#each pickerEntities as e (e.id)}
                  <button class="picker-item" on:click={() => pickEntity(e)}>
                    <span class="pi-name">{e.name}</span>
                    <span class="pi-role">{ROLE_LABELS[e.role] ?? e.role}</span>
                  </button>
                {:else}
                  <p class="picker-empty">해당 인물 없음</p>
                {/each}
              </div>
            </div>
          {/if}

          <div class="contact-list">
            {#each contacts as c (c.id)}
              <button
                class="contact-item"
                class:active={c.id === selectedId}
                on:click={() => selectContact(c.id)}
              >
                <span class="ci-name">{c.name}</span>
                <span class="ci-rel">{c.relation}</span>
              </button>
            {:else}
              <p class="empty-hint">컨택트 없음</p>
            {/each}
          </div>
        </aside>

        <!-- ── 우측: 편집 영역 ── -->
        {#if editing}
          <div class="editor">

            <!-- 탭 -->
            <div class="tabs">
              {#each [["info","기본정보"],["arcs","아크 스크립트"],["chat","채팅 카탈로그"]] as [t, label]}
                <button
                  class="tab"
                  class:active={activeTab === t}
                  on:click={() => { activeTab = t; selectedArcIdx = -1; selectedChatIdx = -1; }}
                >{label}</button>
              {/each}
            </div>

            <!-- ── 탭: 기본정보 ── -->
            {#if activeTab === "info"}
              <div class="panel scroll">
                <p class="tab-desc">NPC의 기본 정보를 설정합니다. 저장 후 아크·채팅 탭에서 대화를 추가하세요.</p>
                <div class="field-grid">
                  <label class="field">
                    <span>ID</span>
                    <input type="text" bind:value={editing.id} on:input={mark} />
                  </label>
                  <label class="field">
                    <span>카테고리</span>
                    <select bind:value={editing.category} on:change={mark}>
                      <option value="team">팀</option>
                      <option value="school">학교</option>
                      <option value="personal">개인</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>이름 (KR)</span>
                    <input type="text" bind:value={editing.name} on:input={mark} />
                  </label>
                  <label class="field">
                    <span>이름 (EN)</span>
                    <input type="text" bind:value={editing.nameEn} on:input={mark} />
                  </label>
                  <label class="field">
                    <span>관계 (KR)</span>
                    <input type="text" bind:value={editing.relation} on:input={mark} />
                  </label>
                  <label class="field">
                    <span>관계 (EN)</span>
                    <input type="text" bind:value={editing.relationEn} on:input={mark} />
                  </label>
                  <label class="field">
                    <span>초기 친밀도</span>
                    <input type="number" min="0" max="100" bind:value={editing.initialAffinity} on:input={mark} />
                  </label>
                </div>
              </div>

            <!-- ── 탭: 아크 스크립트 ── -->
            {:else if activeTab === "arcs"}
              <div class="two-col">

                <!-- 아크 목록 -->
                <div class="list-col scroll">
                  <p class="col-desc">주차·커리어·친밀도 조건을 충족하면 자동으로 발동되는 1회성 이벤트 대화입니다.</p>
                  <div class="list-head">
                    <span>아크 목록</span>
                    <button class="btn-sm" on:click={addArc}>+ 추가</button>
                  </div>
                  {#each editing.arcs as a, i (a.id)}
                    <div
                      class="list-item"
                      class:active={selectedArcIdx === i}
                      role="button"
                      tabindex="0"
                      on:click={() => { selectedArcIdx = i; selectedStepIdx = -1; }}
                      on:keydown={(e) => e.key === "Enter" && (selectedArcIdx = i)}
                    >
                      <span>{a.id}</span>
                      <button class="del-btn" on:click|stopPropagation={() => deleteArc(i)}>✕</button>
                    </div>
                  {:else}
                    <p class="empty-hint">아크 없음</p>
                  {/each}
                </div>

                <!-- 아크 편집 -->
                {#if arc}
                  <div class="arc-editor scroll">
                    <div class="section-title">아크 기본 정보</div>
                    <p class="field-desc">아크 ID·완료 Flag는 고유해야 합니다. 시작 StepID는 아래 스텝 중 첫 번째 스텝의 ID와 일치시키세요.</p>
                    <div class="field-grid">
                      <label class="field">
                        <span>ID</span>
                        <input type="text" bind:value={arc.id} on:input={mark} />
                      </label>
                      <label class="field">
                        <span>완료 Flag</span>
                        <input type="text" bind:value={arc.flag} on:input={mark} />
                      </label>
                      <label class="field">
                        <span>시작 StepID</span>
                        <input type="text" bind:value={arc.script.startStepId} on:input={mark} />
                      </label>
                    </div>

                    <div class="section-title">트리거 조건</div>
                    <p class="field-desc">조건을 여러 개 설정하면 모두 충족할 때만 발동됩니다. 비워두면 해당 조건은 무시합니다.</p>
                    <div class="field-grid">
                      <label class="field">
                        <span>시즌 내 주차 (정확히 일치)</span>
                        <input type="number" bind:value={arc.trigger.weekInSeason} on:input={mark} placeholder="없음" />
                      </label>
                      <label class="field">
                        <span>시즌 내 주차 (이상)</span>
                        <input type="number" bind:value={arc.trigger.weekInSeasonGte} on:input={mark} placeholder="없음" />
                      </label>
                      <label class="field">
                        <span>커리어 단계</span>
                        <select
                          value={arc.trigger.careerStage ?? ""}
                          on:change={(e) => {
                            const v = e.currentTarget.value;
                            arc!.trigger.careerStage = v || undefined;
                            mark();
                          }}
                        >
                          <option value="">없음 (항상)</option>
                          <option value="highschool">고등학교</option>
                          <option value="university">대학교</option>
                          <option value="pro_kbl">프로(KBL)</option>
                          <option value="pro_abl">프로(ABL)</option>
                        </select>
                      </label>
                      <label class="field">
                        <span>커리어 연차 (0=1년차)</span>
                        <input type="number" bind:value={arc.trigger.careerYear} on:input={mark} placeholder="없음" />
                      </label>
                      <label class="field">
                        <span>친밀도 (이상일 때)</span>
                        <input type="number" bind:value={arc.trigger.affinityGte} on:input={mark} placeholder="없음" />
                      </label>
                      <label class="field">
                        <span>이 Flag가 있어야 발동</span>
                        <input type="text"
                          value={arc.trigger.flagSet ?? ""}
                          on:input={(e) => {
                            arc!.trigger.flagSet = e.currentTarget.value || undefined;
                            mark();
                          }}
                          placeholder="없음"
                        />
                      </label>
                      <label class="field">
                        <span>이 Flag가 없어야 발동</span>
                        <input type="text"
                          value={arc.trigger.flagNotSet ?? ""}
                          on:input={(e) => {
                            arc!.trigger.flagNotSet = e.currentTarget.value || undefined;
                            mark();
                          }}
                          placeholder="없음"
                        />
                      </label>
                    </div>

                    <div class="section-title">
                      대화 스텝 목록
                      <div class="step-add-btns">
                        <button class="btn-sm" on:click={() => addStep("contact")}>+ NPC 대사</button>
                        <button class="btn-sm" on:click={() => addStep("player")}>+ 플레이어 선택</button>
                      </div>
                    </div>
                    <p class="field-desc">스텝을 클릭하면 편집창이 펼쳐집니다. <em>next StepID</em>로 스텝을 연결하고, 비우면 대화가 종료됩니다.</p>

                    {#each arc.script.steps as s, si (s.id)}
                      <div class="step-card" class:active={selectedStepIdx === si}>
                        <div class="step-head" role="button" tabindex="0"
                          on:click={() => selectedStepIdx = selectedStepIdx === si ? -1 : si}
                          on:keydown={(e) => e.key === "Enter" && (selectedStepIdx = si)}
                        >
                          <span class="step-badge" class:npc={s.from === "contact"} class:player={s.from === "player"}>
                            {s.from === "contact" ? "NPC" : "플레이어"}
                          </span>
                          <span class="step-id">{s.id}</span>
                          {#if s.from === "contact"}
                            <span class="link-badge" class:end={!s.next}>
                              {s.next ? `→ ${s.next}` : "→ 종료"}
                            </span>
                          {:else}
                            <span class="link-badge opts">{s.options.length}개 선택지</span>
                          {/if}
                          <button class="del-btn" on:click|stopPropagation={() => deleteStep(si)}>✕</button>
                        </div>

                        {#if selectedStepIdx === si}
                          <div class="step-body">
                            <label class="field">
                              <span>ID</span>
                              <input type="text" bind:value={s.id} on:input={mark} />
                            </label>

                            {#if s.from === "contact"}
                              <label class="field">
                                <span>NPC 대사 (한국어)</span>
                                <textarea rows="2" bind:value={s.text} on:input={mark}></textarea>
                              </label>
                              <label class="field">
                                <span>NPC 대사 (영어)</span>
                                <textarea rows="2" bind:value={s.textEn} on:input={mark}></textarea>
                              </label>
                              <label class="field">
                                <span>다음 스텝 ID (비우면 대화 종료)</span>
                                <select
                                  value={s.next ?? ""}
                                  on:change={(e) => { s.next = e.currentTarget.value || null; mark(); }}
                                >
                                  <option value="">— 대화 종료 —</option>
                                  {#each arcStepIds.filter((id) => id !== s.id) as id}
                                    <option value={id}>{id}</option>
                                  {/each}
                                </select>
                              </label>
                            {:else}
                              <div class="options-section">
                                <div class="opts-head">
                                  <span>선택지</span>
                                  <button class="btn-sm" on:click={() => addOption(s)}>+ 추가</button>
                                </div>
                                {#each s.options as opt, oi}
                                  <div class="opt-card">
                                    <div class="opt-card-head">
                                      <span class="opt-id">{opt.id}</span>
                                      <button class="del-btn" on:click={() => deleteOption(s, oi)}>✕</button>
                                    </div>
                                    <div class="field-grid compact">
                                      <label class="field">
                                        <span>ID</span>
                                        <input type="text" bind:value={opt.id} on:input={mark} />
                                      </label>
                                      <label class="field">
                                        <span>선택지 텍스트 (한국어)</span>
                                        <input type="text" bind:value={opt.text} on:input={mark} />
                                      </label>
                                      <label class="field">
                                        <span>선택지 텍스트 (영어)</span>
                                        <input type="text" bind:value={opt.textEn} on:input={mark} />
                                      </label>
                                      <label class="field">
                                        <span>친밀도 변화량</span>
                                        <input type="number" bind:value={opt.affinityDelta} on:input={mark} />
                                      </label>
                                      <label class="field">
                                        <span>다음 스텝 ID (비우면 종료)</span>
                                        <select
                                          value={opt.next ?? ""}
                                          on:change={(e) => { opt.next = e.currentTarget.value || null; mark(); }}
                                        >
                                          <option value="">— 대화 종료 —</option>
                                          {#each arcStepIds as id}
                                            <option value={id}>{id}</option>
                                          {/each}
                                        </select>
                                      </label>
                                    </div>
                                    <details class="effects-detail">
                                      <summary>이펙트</summary>
                                      <div class="field-grid compact">
                                        {#each [["conditionDelta","컨디션 변화"],["fatigueDelta","피로도 변화"],["moraleDelta","사기 변화"]] as [key, label]}
                                          <label class="field">
                                            <span>{label}</span>
                                            <input type="number"
                                              value={(opt.effects as any)?.[key] ?? 0}
                                              on:input={(e) => {
                                                const ef = ensureEffect(opt);
                                                (ef as any)[key] = parseInt(e.currentTarget.value) || undefined;
                                                mark();
                                              }}
                                            />
                                          </label>
                                        {/each}
                                        <div class="field full-width"><span class="sub-label">스탯 XP 누적 (경험치)</span></div>
                                        {#each PITCHING_STATS as stat}
                                          <label class="field">
                                            <span>XP · {stat}</span>
                                            <input type="number"
                                              value={getXp(opt.effects as ContactEffect, stat)}
                                              on:input={(e) => {
                                                const ef = ensureEffect(opt);
                                                setXp(ef as ContactEffect, stat, parseInt(e.currentTarget.value) || 0);
                                              }}
                                            />
                                          </label>
                                        {/each}
                                        <div class="field full-width"><span class="sub-label">즉시 스탯 증가 (영구 반영)</span></div>
                                        {#each PITCHING_STATS as stat}
                                          <label class="field">
                                            <span>즉시 · {stat}</span>
                                            <input type="number"
                                              value={getStat(opt.effects as ContactEffect, stat)}
                                              on:input={(e) => {
                                                const ef = ensureEffect(opt);
                                                setStat(ef as ContactEffect, stat, parseInt(e.currentTarget.value) || 0);
                                              }}
                                            />
                                          </label>
                                        {/each}
                                      </div>
                                    </details>
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                    <!-- ── 미리보기 ── -->
                    <div class="section-title">
                      대화 흐름 미리보기
                      <button class="btn-sm" on:click={() => (showPreview = !showPreview)}>
                        {showPreview ? "접기" : "펼치기"}
                      </button>
                    </div>
                    {#if showPreview}
                      <div class="preview-panel">
                        {#if !arc.script.startStepId}
                          <p class="preview-empty">시작 StepID를 먼저 설정하세요</p>
                        {:else if previewBubbles.length === 0}
                          <p class="preview-empty">스텝이 없거나 시작 StepID가 잘못됐습니다</p>
                        {:else}
                          {#each previewBubbles as bubble}
                            {#if bubble.kind === "npc"}
                              <div class="prev-row npc">
                                <div class="prev-bubble npc">{bubble.text}</div>
                              </div>
                            {:else}
                              <div class="prev-options">
                                {#each bubble.options as opt}
                                  <div class="prev-bubble player">{opt.text}</div>
                                {/each}
                              </div>
                            {/if}
                          {/each}
                        {/if}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <div class="empty-panel">아크를 선택하거나 추가하세요</div>
                {/if}
              </div>

            <!-- ── 탭: 채팅 카탈로그 ── -->
            {:else if activeTab === "chat"}
              <div class="two-col">

                <!-- 좌측: 액션 선택 + 라인 목록 -->
                <div class="list-col scroll">
                  <p class="col-desc">플레이어가 버튼으로 말 걸 때 NPC가 응답하는 대화입니다. 위에서부터 순서대로 조건을 검사해 첫 번째 맞는 항목을 사용합니다.</p>
                  <div class="action-tabs">
                    {#each [["greet","인사"],["advice","조언"],["plan","계획"]] as [a, label]}
                      <button
                        class="action-tab"
                        class:active={chatAction === a}
                        on:click={() => { chatAction = a; selectedChatIdx = -1; }}
                      >{label}</button>
                    {/each}
                  </div>
                  <div class="list-head">
                    <span>대화 라인 목록</span>
                    <div class="add-btns">
                      <button class="btn-sm" on:click={addSimpleLine}>+ 일반</button>
                      <button class="btn-sm" on:click={addSpecialLine}>+ 특수</button>
                    </div>
                  </div>
                  {#each chatLines as line, i}
                    <div
                      class="list-item"
                      class:active={selectedChatIdx === i}
                      role="button"
                      tabindex="0"
                      on:click={() => (selectedChatIdx = i)}
                      on:keydown={(e) => e.key === "Enter" && (selectedChatIdx = i)}
                    >
                      <div class="order-btns">
                        <button class="order-btn" disabled={i === 0}
                          on:click|stopPropagation={() => moveChatLine(i, -1)}>↑</button>
                        <button class="order-btn" disabled={i === chatLines.length - 1}
                          on:click|stopPropagation={() => moveChatLine(i, 1)}>↓</button>
                      </div>
                      <span class="step-badge" class:npc={!isSpecialChat(line)} class:player={isSpecialChat(line)}>
                        {isSpecialChat(line) ? "특수" : "일반"}
                      </span>
                      <span class="ci-name">
                        {isSpecialChat(line) ? line.prompt.slice(0,20) || "(빈 텍스트)" : (line.lines[0] ?? "").slice(0,20) || "(빈 텍스트)"}
                      </span>
                      <button class="del-btn" on:click|stopPropagation={() => deleteChatLine(i)}>✕</button>
                    </div>
                  {:else}
                    <p class="empty-hint">라인 없음</p>
                  {/each}
                </div>

                <!-- 우측: 라인 편집 -->
                {#if selectedLine}
                  <div class="arc-editor scroll">

                    <!-- 공통: 조건 -->
                    <details class="effects-detail" open>
                      <summary>표시 조건 (선택)</summary>
                      <div class="field-grid compact">
                        <label class="field">
                          <span>친밀도 (이상일 때 표시)</span>
                          <input type="number"
                            value={selectedLine.condition?.affinityGte ?? ""}
                            on:input={(e) => {
                              const c = ensureCond(selectedLine!);
                              c.affinityGte = parseInt(e.currentTarget.value) || undefined;
                              mark();
                            }}
                          />
                        </label>
                        <label class="field">
                          <span>친밀도 (미만일 때 표시)</span>
                          <input type="number"
                            value={selectedLine.condition?.affinityLt ?? ""}
                            on:input={(e) => {
                              const c = ensureCond(selectedLine!);
                              c.affinityLt = parseInt(e.currentTarget.value) || undefined;
                              mark();
                            }}
                          />
                        </label>
                        <label class="field">
                          <span>이 Flag가 있어야 표시</span>
                          <input type="text"
                            value={selectedLine.condition?.flagSet ?? ""}
                            on:input={(e) => {
                              const c = ensureCond(selectedLine!);
                              c.flagSet = e.currentTarget.value || undefined;
                              mark();
                            }}
                          />
                        </label>
                        <label class="field">
                          <span>이 Flag가 없어야 표시</span>
                          <input type="text"
                            value={selectedLine.condition?.flagNotSet ?? ""}
                            on:input={(e) => {
                              const c = ensureCond(selectedLine!);
                              c.flagNotSet = e.currentTarget.value || undefined;
                              mark();
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    {#if !isSpecialChat(selectedLine)}
                      <!-- 일반 라인 -->
                      <div class="section-title">응답 텍스트 (KR)</div>
                      {#each selectedLine.lines as _, li}
                        <div class="line-row">
                          <input type="text" bind:value={selectedLine.lines[li]} on:input={mark} />
                          <button class="del-btn" on:click={() => {
                            selectedLine.lines = selectedLine.lines.filter((_, i) => i !== li);
                            mark();
                          }}>✕</button>
                        </div>
                      {/each}
                      <button class="btn-sm mt4" on:click={() => {
                        selectedLine.lines = [...selectedLine.lines, ""];
                        mark();
                      }}>+ 줄 추가</button>

                      <div class="section-title mt8">응답 텍스트 (EN)</div>
                      {#each (selectedLine.linesEn ?? []) as _, li}
                        <div class="line-row">
                          <input type="text"
                            value={(selectedLine.linesEn ?? [])[li] ?? ""}
                            on:input={(e) => {
                              if (!selectedLine.linesEn) selectedLine.linesEn = [];
                              selectedLine.linesEn[li] = e.currentTarget.value;
                              mark();
                            }}
                          />
                          <button class="del-btn" on:click={() => {
                            selectedLine.linesEn = (selectedLine.linesEn ?? []).filter((_, i) => i !== li);
                            mark();
                          }}>✕</button>
                        </div>
                      {/each}
                      <button class="btn-sm mt4" on:click={() => {
                        selectedLine.linesEn = [...(selectedLine.linesEn ?? []), ""];
                        mark();
                      }}>+ 줄 추가</button>

                    {:else}
                      <!-- 특수 라인 -->
                      <div class="field-grid">
                        <label class="field">
                          <span>Flag (완료 마킹)</span>
                          <input type="text" bind:value={selectedLine.flag} on:input={mark} />
                        </label>
                        <label class="field">
                          <span>NPC 제안 (KR)</span>
                          <textarea rows="2" bind:value={selectedLine.prompt} on:input={mark}></textarea>
                        </label>
                        <label class="field">
                          <span>NPC 제안 (EN)</span>
                          <textarea rows="2" bind:value={selectedLine.promptEn} on:input={mark}></textarea>
                        </label>
                      </div>

                      <div class="section-title">
                        선택지
                        <button class="btn-sm" on:click={() => addChatOpt(selectedLine)}>+ 추가</button>
                      </div>

                      {#each selectedLine.options as opt, oi}
                        <div class="opt-card">
                          <div class="opt-card-head">
                            <span class="opt-id">{opt.id}</span>
                            <button class="del-btn" on:click={() => deleteChatOpt(selectedLine, oi)}>✕</button>
                          </div>
                          <div class="field-grid compact">
                            <label class="field">
                              <span>ID</span>
                              <input type="text" bind:value={opt.id} on:input={mark} />
                            </label>
                            <label class="field">
                              <span>플레이어 선택 (KR)</span>
                              <input type="text" bind:value={opt.text} on:input={mark} />
                            </label>
                            <label class="field">
                              <span>플레이어 선택 (EN)</span>
                              <input type="text" bind:value={opt.textEn} on:input={mark} />
                            </label>
                            <label class="field">
                              <span>NPC 반응 (한국어)</span>
                              <input type="text" bind:value={opt.reply} on:input={mark} />
                            </label>
                            <label class="field">
                              <span>NPC 반응 (영어)</span>
                              <input type="text" bind:value={opt.replyEn} on:input={mark} />
                            </label>
                            <label class="field">
                              <span>친밀도 변화량</span>
                              <input type="number" bind:value={opt.affinityDelta} on:input={mark} />
                            </label>
                          </div>
                          <details class="effects-detail">
                            <summary>선택 시 효과 (이펙트)</summary>
                            <div class="field-grid compact">
                              {#each [["conditionDelta","컨디션 변화"],["fatigueDelta","피로도 변화"],["moraleDelta","사기 변화"]] as [key, label]}
                                <label class="field">
                                  <span>{label}</span>
                                  <input type="number"
                                    value={(opt.effects as any)?.[key] ?? 0}
                                    on:input={(e) => {
                                      const ef = ensureEffect(opt);
                                      (ef as any)[key] = parseInt(e.currentTarget.value) || undefined;
                                      mark();
                                    }}
                                  />
                                </label>
                              {/each}
                              <label class="field">
                                <span>해금할 구종 ID</span>
                                <input type="text"
                                  value={(opt.effects as ContactEffect)?.unlockPitchId ?? ""}
                                  on:input={(e) => {
                                    const ef = ensureEffect(opt) as ContactEffect;
                                    ef.unlockPitchId = e.currentTarget.value || undefined;
                                    mark();
                                  }}
                                />
                              </label>
                              <div class="field full-width"><span class="sub-label">스탯 XP 누적 (경험치)</span></div>
                              {#each PITCHING_STATS as stat}
                                <label class="field">
                                  <span>XP · {stat}</span>
                                  <input type="number"
                                    value={getXp(opt.effects as ContactEffect, stat)}
                                    on:input={(e) => {
                                      const ef = ensureEffect(opt);
                                      setXp(ef as ContactEffect, stat, parseInt(e.currentTarget.value) || 0);
                                    }}
                                  />
                                </label>
                              {/each}
                              <div class="field full-width"><span class="sub-label">즉시 스탯 증가 (영구 반영)</span></div>
                              {#each PITCHING_STATS as stat}
                                <label class="field">
                                  <span>즉시 · {stat}</span>
                                  <input type="number"
                                    value={getStat(opt.effects as ContactEffect, stat)}
                                    on:input={(e) => {
                                      const ef = ensureEffect(opt);
                                      setStat(ef as ContactEffect, stat, parseInt(e.currentTarget.value) || 0);
                                    }}
                                  />
                                </label>
                              {/each}
                            </div>
                          </details>
                        </div>
                      {/each}
                    {/if}
                  </div>
                {:else}
                  <div class="empty-panel">라인을 선택하거나 추가하세요</div>
                {/if}
              </div>
            {/if}
          </div>
        {:else}
          <div class="no-contact">좌측에서 NPC를 선택하거나 + 추가를 클릭하세요</div>
        {/if}
      </div>
    </section>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 16px;
  }

  .modal {
    width: min(1100px, 96vw);
    height: min(780px, 92vh);
    background: #0c1826;
    border: 1px solid #2e4870;
    border-radius: 14px;
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
  }

  .hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #213450;
    flex-shrink: 0;
  }

  .hdr-left { display: flex; align-items: center; gap: 12px; }

  .hdr h2 { margin: 0; font-size: 16px; color: #e0eeff; }

  .hdr-actions { display: flex; gap: 8px; }

  .btn-guide {
    background: transparent;
    border: 1px solid #3a5870;
    color: #7090b8;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
  }
  .btn-guide:hover { color: #a0c0e0; border-color: #5080a0; }

  /* ── 가이드 패널 ── */
  .guide-panel {
    background: #08131f;
    border-bottom: 1px solid #1e3050;
    padding: 14px 18px;
    flex-shrink: 0;
  }

  .guide-cols {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .guide-section { display: flex; flex-direction: column; gap: 6px; }

  .guide-title {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    color: #5090c0;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .guide-list {
    margin: 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .guide-list li, .guide-list p {
    font-size: 12px;
    color: #8090b0;
    line-height: 1.5;
    margin: 0;
  }

  .guide-list strong { color: #a0c0e0; }
  .guide-list em { color: #70a0c8; font-style: normal; }

  .btn-save {
    background: #1a5c38;
    border: 1px solid #2a8052;
    color: #7effc0;
    padding: 5px 14px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .btn-save:disabled { opacity: 0.5; cursor: default; }

  .btn-close {
    background: #1a2c4a;
    border: 1px solid #3a5070;
    color: #a0c0e8;
    padding: 5px 12px;
    border-radius: 7px;
    font-size: 13px;
    cursor: pointer;
  }

  .body {
    display: grid;
    grid-template-columns: 200px 1fr;
    overflow: hidden;
    min-height: 0;
  }

  /* ── 사이드바 ── */
  .sidebar {
    border-right: 1px solid #1e3050;
    display: grid;
    grid-template-rows: auto auto 1fr;
    overflow: hidden;
  }

  .sidebar-top {
    padding: 10px;
    border-bottom: 1px solid #1a2e48;
  }

  .btn-add {
    width: 100%;
    background: #16304e;
    border: 1px dashed #3a6090;
    color: #80b0e0;
    border-radius: 8px;
    padding: 7px;
    font-size: 13px;
    cursor: pointer;
  }
  .btn-add:hover { background: #1e3d62; }

  .sidebar-label {
    margin: 0 0 6px;
    font-size: 10px;
    font-weight: 700;
    color: #3a5878;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .tab-desc {
    margin: 0 0 14px;
    font-size: 12px;
    color: #5070a0;
    line-height: 1.5;
    padding: 8px 10px;
    background: #0a1520;
    border: 1px solid #1a2e48;
    border-radius: 7px;
  }

  .col-desc {
    margin: 0 0 8px;
    font-size: 11px;
    color: #4a6888;
    line-height: 1.5;
    padding: 7px 9px;
    background: #08121e;
    border: 1px solid #162840;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .field-desc {
    margin: -4px 0 4px;
    font-size: 11px;
    color: #4a6888;
    line-height: 1.5;
    flex-shrink: 0;
  }
  .field-desc em { color: #6090b8; font-style: normal; }

  .picker {
    border-bottom: 1px solid #1a2e48;
    background: #0a1520;
    max-height: 200px;
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
  }

  .picker-search {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    background: #0e1e30;
    border: 0;
    border-bottom: 1px solid #1e3050;
    color: #c0d8f0;
    font-size: 12px;
  }
  .picker-search:focus { outline: none; }

  .picker-list { overflow-y: auto; }

  .picker-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: 0;
    border-bottom: 1px solid #1a2e48;
    cursor: pointer;
    text-align: left;
  }
  .picker-item:hover { background: #162840; }

  .pi-name { font-size: 13px; color: #c0d8f0; }
  .pi-role { font-size: 11px; color: #6080a0; }
  .picker-empty { padding: 8px; text-align: center; font-size: 12px; color: #4a6888; }

  .contact-list { overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 4px; }

  .contact-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 8px 10px;
    background: #101e32;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    gap: 2px;
  }
  .contact-item:hover { background: #182a44; }
  .contact-item.active { border-color: #3a6498; background: #162842; }

  .ci-name { font-size: 13px; font-weight: 600; color: #c8deff; }
  .ci-rel { font-size: 11px; color: #6080a0; }

  .empty-hint { padding: 12px; text-align: center; font-size: 12px; color: #3a5870; }

  /* ── 편집 영역 ── */
  .editor {
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #1e3050;
    flex-shrink: 0;
  }

  .tab {
    padding: 9px 16px;
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    color: #6080a0;
    font-size: 13px;
    cursor: pointer;
  }
  .tab:hover { color: #a0c0e0; }
  .tab.active { color: #80b8f0; border-bottom-color: #4a80c0; }

  .panel { padding: 16px; }
  .scroll { overflow-y: auto; }

  .two-col {
    display: grid;
    grid-template-columns: 220px 1fr;
    overflow: hidden;
    min-height: 0;
  }

  .list-col {
    border-right: 1px solid #1e3050;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .list-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 2px 8px;
    font-size: 12px;
    color: #6080a0;
    flex-shrink: 0;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 7px 8px;
    background: #101e32;
    border: 1px solid transparent;
    border-radius: 7px;
    cursor: pointer;
    text-align: left;
    font-size: 12px;
    color: #a0bce0;
  }
  .list-item:hover { background: #182a44; }
  .list-item.active { border-color: #3a6498; background: #162842; }
  .list-item .ci-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .arc-editor { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }

  .empty-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #3a5870;
    font-size: 13px;
  }

  .no-contact {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #3a5870;
    font-size: 13px;
  }

  /* ── 폼 공통 ── */
  .field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .field-grid.compact { grid-template-columns: 1fr 1fr; gap: 6px; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .field span {
    font-size: 11px;
    color: #6080a0;
    font-weight: 600;
  }

  .field input[type="text"],
  .field input[type="number"],
  .field select,
  .field textarea {
    background: #0e1c30;
    border: 1px solid #2a4060;
    border-radius: 6px;
    color: #c0d8f0;
    font-size: 13px;
    padding: 5px 8px;
  }
  .field input:focus, .field select:focus, .field textarea:focus {
    outline: 1px solid #4a7ab0;
  }
  .field textarea { resize: vertical; font-family: inherit; }

  .section-title {
    font-size: 12px;
    font-weight: 700;
    color: #5080a8;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    padding-bottom: 4px;
    border-bottom: 1px solid #1e3050;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .step-add-btns { display: flex; gap: 6px; }

  .btn-sm {
    background: #16304e;
    border: 1px solid #3a6090;
    color: #80b0e0;
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .btn-sm:hover { background: #1e3d62; }

  .del-btn {
    background: transparent;
    border: 0;
    color: #6a5060;
    font-size: 12px;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
  }
  .del-btn:hover { color: #c06070; }

  /* 스텝 카드 */
  .step-card {
    border: 1px solid #1e3050;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .step-card.active { border-color: #3a6498; }

  .step-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: #101e32;
    cursor: pointer;
  }

  .step-id { flex: 1; font-size: 12px; color: #8090b0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

  /* 연결 배지 */
  .link-badge {
    font-size: 10px;
    padding: 1px 7px;
    border-radius: 999px;
    background: #0e2040;
    border: 1px solid #2a4870;
    color: #5090c8;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .link-badge.end { color: #6a7888; border-color: #1e3050; }
  .link-badge.opts { color: #7060c0; border-color: #3a2870; background: #14102a; }

  /* 채팅 라인 순서 버튼 */
  .order-btns { display: flex; flex-direction: column; gap: 1px; flex-shrink: 0; }
  .order-btn {
    background: transparent;
    border: 1px solid #2a4060;
    color: #5080a0;
    border-radius: 3px;
    font-size: 9px;
    padding: 0 3px;
    cursor: pointer;
    line-height: 1.4;
  }
  .order-btn:hover:not(:disabled) { background: #1e3050; color: #90c0e8; }
  .order-btn:disabled { opacity: 0.25; cursor: default; }

  /* 대화 미리보기 */
  .preview-panel {
    background: #07111e;
    border: 1px solid #1a2e48;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 280px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .prev-row { display: flex; }
  .prev-row.npc { justify-content: flex-start; }

  .prev-bubble {
    max-width: 80%;
    padding: 7px 11px;
    border-radius: 12px;
    font-size: 12px;
    line-height: 1.5;
  }
  .prev-bubble.npc {
    background: #1a2e4a;
    border: 1px solid #2e4a72;
    color: #c0d8f8;
    border-bottom-left-radius: 3px;
  }
  .prev-bubble.player {
    background: #1a3a2e;
    border: 1px solid #2a5a42;
    color: #a0e8c0;
    border-bottom-right-radius: 3px;
    align-self: flex-end;
  }

  .prev-options {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .preview-empty { font-size: 12px; color: #3a5878; text-align: center; margin: 8px 0; }

  .step-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 999px;
    flex-shrink: 0;
  }
  .step-badge.npc { background: #1a3560; color: #80b0e8; border: 1px solid #3a6090; }
  .step-badge.player { background: #2a1a3a; color: #c080e8; border: 1px solid #6040a0; }

  .step-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; background: #0c1826; }

  /* 선택지 */
  .options-section { display: flex; flex-direction: column; gap: 6px; }
  .opts-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #6080a0; }

  .opt-card {
    border: 1px solid #1e3050;
    border-radius: 7px;
    padding: 8px;
    background: #0e1c30;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .opt-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .opt-id { font-size: 11px; color: #4a7098; }

  /* 이펙트 */
  .effects-detail {
    border: 1px solid #1a2e48;
    border-radius: 6px;
    overflow: hidden;
  }
  .effects-detail summary {
    padding: 5px 10px;
    background: #0e1c30;
    font-size: 12px;
    color: #5080a0;
    cursor: pointer;
    list-style: none;
  }
  .effects-detail > .field-grid { padding: 8px; }

  .full-width { grid-column: 1 / -1; }

  .sub-label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: #4a7090;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 0 2px;
    border-top: 1px solid #1a2e48;
  }

  /* 채팅 탭 */
  .action-tabs {
    display: flex;
    border-bottom: 1px solid #1a2e48;
    flex-shrink: 0;
  }
  .action-tab {
    flex: 1;
    padding: 7px;
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    color: #6080a0;
    font-size: 12px;
    cursor: pointer;
  }
  .action-tab.active { color: #80b0e8; border-bottom-color: #4a80c0; }

  .add-btns { display: flex; gap: 4px; }

  .line-row { display: flex; gap: 6px; align-items: center; }
  .line-row input { flex: 1; }

  .mt4 { margin-top: 4px; }
  .mt8 { margin-top: 8px; }
</style>
