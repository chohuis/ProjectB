<script lang="ts">
  import type {
    MessageCategory, MessageItem, BarsMetadata, CardsMetadata, InjuryMetadata,
    MyBodyMetadata, OffseasonMetadata, RankListMetadata, TableMetadata,
    TimelineMetadata, Top10Metadata, TrainingMetadata,
  } from "../../shared/types/main";
  import { barsCopy, cardsCopy } from "../../shared/utils/dashboardCopy";
  import { buildBars, buildCards } from "../../shared/utils/dashboardView";
  import DigestCards from "../../features/messages/ui/DigestCards.svelte";
  import { applyDecision } from "../../shared/usecases/decisions";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { teamMap, entityMap, masterStore } from "../../shared/stores/master";
  import { categoryMeta, FILTER_GROUPS } from "../../shared/utils/messageCategory";
  import { gaugeTone } from "../../shared/utils/myStatus";
  import { trainingEfficiencyDelta } from "../../shared/utils/growthEngine";
  import TrainingStatBars from "../../features/messages/ui/TrainingStatBars.svelte";
  import RankListPanel from "../../features/messages/ui/RankListPanel.svelte";
  import StatTable from "../../features/messages/ui/StatTable.svelte";
  import TimelinePanel from "../../features/messages/ui/TimelinePanel.svelte";
  import OffseasonPanel from "../../features/messages/ui/OffseasonPanel.svelte";
  import InjuryPanel from "../../features/messages/ui/InjuryPanel.svelte";
  import MyBodyPanel from "../../features/messages/ui/MyBodyPanel.svelte";
  import RoleChoicePanel from "../../features/messages/ui/RoleChoicePanel.svelte";
  import EventTierChip from "../../features/events/ui/EventTierChip.svelte";
  import { hidesNumbers, kindOnlyHint, costKindHint, COST_LEAD } from "../../shared/utils/eventTierCopy";

  /**
   * C1 소식 — 홈 대시보드와 수신함을 하나로 합친 화면.
   *
   * 둘을 나눠 두면 **같은 걸 두 번 본다.** 대시보드의 "선택 대기 메시지 N건"은
   * 수신함으로 가라는 안내였고, 대시보드의 컨디션·피로·순위 KPI 다섯 개는
   * 이제 우측 패널(B3)에 상시로 떠 있다.
   *
   * 그래서 여기 남는 건 **읽을 거리(메시지)와 챙길 것(경고)** 둘이다.
   *
   * ⚠ 홈 대시보드의 "부상위험 %"는 옮기지 않았다. `(피로-55)*0.9`로 UI가
   * 지어낸 값이라 엔진의 부상 판정과 아무 관계가 없었다 — 피로 게이지가
   * 이미 우측 패널에 있으므로 같은 정보를 가짜 확률로 포장할 이유가 없다.
   */

  // 분류 그대로가 아니라 **묶음**이다 — 정본은 `messageCategory.ts`의 FILTER_GROUPS
  type FilterId = "all" | "unread" | string;

  let activeFilter: FilterId = "all";
  let selectedId: string | null = null;
  let sortAsc = false;

  /**
   * **목록을 다 그리지 않는다** (2026-08-23).
   *
   * 예전엔 `{#each sorted as msg}`로 소식함 전부를 DOM에 올렸다. 상한이
   * 200일 땐 견뎠지만 **500·1000으로 올릴 예정**이라 그대로 두면 노드가
   * 그만큼 늘고, 필터를 바꿀 때마다 통째로 다시 그린다.
   *
   * 스크롤이 바닥에 닿으면 한 장씩 늘린다. 진짜 가상 스크롤(창 밖을 걷어내는
   * 방식)은 **항목 높이가 제각각이라**(제목 길이·미리보기 줄수) 높이 계산이
   * 필요한데, 그 복잡도를 살 만큼 이득이 크지 않다.
   *
   * ⚠ 필터·정렬이 바뀌면 되돌린다. 안 그러면 300장 펼친 상태에서 필터를
   *   좁혔을 때 몇 건 안 되는 목록에 빈 여백만 남는다.
   */
  const PAGE = 60;
  let shown = PAGE;

  /**
   * 🔴 **id가 겹친 소식이 하나라도 있으면 이 화면이 앱을 죽인다.**
   *   아래 목록은 `{#each visible as msg (msg.id)}`로 키를 쓰는데, Svelte 5는
   *   키가 겹치면 `each_key_duplicate`를 **던진다.** 렌더 도중 던지므로
   *   반응성이 통째로 멎어 화면이 굳고 **탭 전환조차 안 된다** — 테스터가
   *   2028 W18 세이브에서 신고한 그 형태다(2026-09-05 · 실측 재현:
   *   `msg-tour-my-TOUR_HS_JANGMI-r1-2028` at indexes 2 and 10).
   *
   * 겹치는 사본을 만드는 자리는 따로 고쳤다(`stores/game.ts`의 `pushMailbox` ·
   * 불러오기의 `normalizeMailbox`). 그래도 **여기서 한 번 더 막는다** —
   * 세 번째 경로가 생기면 그 대가가 "앱이 안 죽는다"가 아니라 "앱이 죽는다"라
   * 방어값이 비용보다 크다. 먼저 온 것(최신)을 남긴다.
   */
  function dedupeById(list: MessageItem[]): MessageItem[] {
    const seen = new Set<string>();
    const out: MessageItem[] = [];
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    if (out.length !== list.length) {
      console.warn(`[news] 소식 id가 겹쳐 ${list.length - out.length}건을 숨겼다 — 만드는 쪽을 봐야 한다`);
    }
    return out;
  }

  $: msgs = dedupeById($gameStore.mailbox);
  $: p = $gameStore.protagonist;

  $: counts = {
    all:    msgs.length,
    unread: msgs.filter((m) => m.readAt === null).length,
    ...Object.fromEntries(FILTER_GROUPS.map((g) => [
      g.id, msgs.filter((m) => g.cats.includes(m.category)).length,
    ])),
  } as Record<FilterId, number>;

  $: FILTERS = [
    { id: "all" as FilterId,    label: "전체" },
    { id: "unread" as FilterId, label: "안읽음" },
    ...FILTER_GROUPS.map((g) => ({ id: g.id as FilterId, label: g.label })),
  ];

  $: filtered = msgs.filter((m) => {
    if (activeFilter === "all")    return true;
    if (activeFilter === "unread") return m.readAt === null;
    const g = FILTER_GROUPS.find((x) => x.id === activeFilter);
    return g ? g.cats.includes(m.category) : true;
  });

  /**
   * 미결 선택지는 **정렬·필터와 무관하게 항상 위** — 게임이 멈춰 있는 이유다.
   *
   * 🔴 예전엔 `filtered`에서 골랐다. 그래서 필터가 걸려 있으면 **막고 있는
   *   소식도, 「선택을 기다리는 소식 N건」 경고도 함께 사라졌다** — 아래
   *   `alerts`가 이 배열을 세기 때문이다. 진행이 왜 막혔는지 알려 줄 두 자리가
   *   같은 조건으로 동시에 꺼진 셈이라, 플레이어에게는 그냥 고장으로 보인다.
   *   미결은 목록의 성격이 다르다 — 읽을거리가 아니라 **처리할 것**이라
   *   필터의 대상이 아니다.
   */
  $: pendingMsgs = msgs.filter((m) => m.decision?.selectedOptionId === null);
  // ⚠ 미결을 여기서 빼야 위와 겹쳐 두 번 그리지 않는다 (키 중복 = 화면 사망)
  $: rest    = filtered.filter((m) => !m.decision || m.decision.selectedOptionId !== null);
  $: sorted  = [...pendingMsgs, ...(sortAsc ? [...rest].reverse() : rest)];

  // 필터·정렬이 바뀌면 처음부터. 안 그러면 좁힌 목록에 빈 여백만 남는다.
  // (`if (activeFilter || ...)`로 쓰면 조건처럼 보이지만 늘 참이라 거짓말이다)
  $: activeFilter, sortAsc, (shown = PAGE);

  $: visible = sorted.slice(0, shown);
  $: hasMore = sorted.length > shown;

  /** 바닥 근처면 한 장 더 — 가로 스크롤은 안 본다 */
  function onListScroll(e: Event): void {
    if (!hasMore) return;
    const el = e.currentTarget as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) shown += PAGE;
  }

  $: selected = selectedId ? msgs.find((m) => m.id === selectedId) ?? null : null;

  $: unreadNonDecisionCount = msgs.filter(
    (m) => m.readAt === null && !(m.decision?.selectedOptionId === null),
  ).length;

  // ── 챙길 것 ──
  // ⚠ 경계는 `gaugeTone` 하나다. 예전 대시보드는 자기 표(피로>70·사기<40·
  // 컨디션<50)를 따로 들고 있어서 우측 패널 게이지가 빨간데 경고는 없는
  // 구간이 생겼다.
  $: alerts = [
    ...($gameStore.schoolState.eligibilityBlocked
      ? [{ tone: "bad" as const, text: "학사 경고 — 이번 주 경기 출전 정지" }] : []),
    ...(gaugeTone(p.fatigue, true) === "bad"
      ? [{ tone: "bad" as const, text: `피로 ${p.fatigue} — 훈련 강도를 낮추는 게 좋다` }] : []),
    ...(gaugeTone(p.condition) === "bad"
      ? [{ tone: "bad" as const, text: `컨디션 ${p.condition} — 회복에 집중할 시점` }] : []),
    ...(gaugeTone(p.morale) === "bad"
      // ⚠ 사기만 소수다(`moraleAfterWeek` 가 실수를 돌려준다) — 다른 지표와
      //   같은 자릿수로 찍는다. 반올림은 **보여 줄 때만**이고 값은 그대로 둔다
      ? [{ tone: "warn" as const, text: `사기 ${Math.round(p.morale)} — 반등할 계기가 필요하다` }] : []),
    ...(pendingMsgs.length > 0
      ? [{ tone: "warn" as const, text: `선택을 기다리는 소식 ${pendingMsgs.length}건` }] : []),
    // 오프시즌 일정 안내. **옆단 카드였던 것을 여기로 옮겼다** — 옆단은
    // 상세 칸에 자리를 내줬고, 나머지 두 카드(최근 경기·예정)는 우측
    // 패널에 같은 게 있어 지웠지만 이것만은 어디에도 없었다
    ...(isOffseason
      ? [{
          tone: "info" as const,
          text: pendingNextTeam
            ? `${pendingNextTeam} 계약 완료 — W52에 새 시즌이 시작된다`
            : "오프시즌 — W43 연봉협상·FA · W50 체육부대 · W52 시즌 시작",
        }] : []),
  ];

  $: isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(p.careerStage);
  $: hasRemainingGames = $seasonStore.schedule.some(
    (e) => !e.result && !e.isFriendly && (e.phase === "season" || e.phase === "postseason"),
  );
  $: isOffseason = isProStage && !hasRemainingGames && $seasonStore.currentWeek > 0;
  $: pendingNextTeam = p.pendingNextContract
    ? ($teamMap.get(p.pendingNextContract.teamId)?.name ?? p.pendingNextContract.teamId)
    : null;

  /**
   * id → 이름 — 카드 소식(대표팀 명단·연습경기 예정)이 id 를 싣는다.
   *
   * 🔴 **표와 같은 규칙이다** (`StatTable` 머리말). 이름은 표시 언어를 타므로
   *    만드는 쪽이 굳혀 실으면 영어로 바꿔도 그 소식만 한글로 남는다.
   */
  $: names = {
    team:   (id: string) => $teamMap.get(id)?.name,
    person: (id: string) => $entityMap.get(id)?.name,
  };

  /**
   * 패널을 그리는 종류인가 — **본문과 패널 사이에 선을 둘지**만 정한다.
   *
   * ⚠ 여기 없는 종류는 본문만 그린다. 새 갈래를 아래 `{#if}` 사슬에 더하면
   *   **이 목록에도 더한다** — 안 더하면 선만 빠지고 조용히 붙어 보인다.
   * ⚠ `roleChoice` 는 본문이 아니라 `.dec` 자리에 그린다. 여기 넣으면
   *   본문 위에 없는 선이 생긴다.
   */
  const PANEL_TYPES = new Set([
    "training", "top10", "table", "rankList", "timeline",
    "bars", "cards", "offseason", "injury", "myBody",
  ]);
  $: hasPanel = PANEL_TYPES.has(selected?.metadata?.type ?? "");

  async function markAllRead() {
    gameStore.markAllMessagesRead();
    await gameStore.save();
  }

  function open(msg: MessageItem) {
    selectedId = msg.id;
    if (msg.readAt === null && !(msg.decision && msg.decision.selectedOptionId === null)) {
      gameStore.markMessageRead(msg.id);
    }
  }

  function close() { selectedId = null; }

  /** Esc로 닫는다. `<svelte:window>`는 블록 안에 못 두므로 여기서 열림을 본다 */
  function onEsc(e: KeyboardEvent) {
    if (e.key === "Escape" && selectedId) close();
  }

  /**
   * 🔴 **`await` 다.** 예전엔 효과 적용을 `void` 로 띄워 놓고 곧바로
   *   저장했다. `applyDecision`의 뒷부분(관계도·사치품)은 slot.db·Rust 왕복이라
   *   비동기인데, 그게 끝나기 전에 `save()`가 도는 것이다 —
   *   **고른 효과가 빠진 채 저장되고**, 저장이 끝난 뒤에야 스토어가 바뀌니
   *   다음 저장까지 디스크와 화면이 어긋난다. 게다가 왕복이 실패하면
   *   `void`라 아무도 안 받는 rejection 이 되어 조용히 사라진다.
   *   여기서 기다리면 그 둘이 없어진다.
   */
  async function choose(optionId: string) {
    if (!selected) return;
    try {
      await applyDecision(selected.id, optionId);
    } catch (e) {
      // 효과 일부가 못 붙어도 **선택 자체는 되돌리지 않는다** — 되돌리면
      // 진행이 다시 막힌다(`decisions.ts` 머리말과 같은 판단이다)
      console.error("[news] 선택지 효과 적용 실패 — 선택은 확정한다", e);
    }
    seasonStore.resolvePendingAction("message", selected.id);
    await gameStore.save();
    await seasonStore.save();
  }

  // ── 선택지 꼬리 「→ 훈련 효율 ±N%」 (결정 ④ 1단계 · 사용자 확정) ──
  //
  // 🔴 **피로·컨디션·성실이 훈련 XP 로 이어진다는 걸 아무도 몰랐다.**
  //   `week_xp` 가 그 셋을 곱하는데 힌트에는 「피로 −8」까지만 적혔다.
  //
  // ⚠ **`effectHint` 를 고쳐 쓰지 않는다.** 그 문장은 만드는 쪽(데이터·
  //   생산부)이 갖는다 — 여기서 갈아치우면 두 벌이 된다. 뒤에 **덧붙이기만**
  //   한다.
  // ⚠ **지금 상태에서 잰다.** 같은 「피로 −8」도 문턱(70·85) 앞뒤에서 폭이
  //   다르다 — `growthEngine.trainingEfficiencyDelta` 하나가 정한다.
  // ⚠ 사기는 안 센다 — `week_xp` 에 없다(슬럼프로 따로 걸린다).
  // ⚠ **엔진에 묻는다 — 화면이 계산하지 않는다** (2026-09-07). 계수 셋이
  //   `growthEngine.ts` 에 옮겨 적혀 있던 것을 Rust 로 되돌렸고, 왕복이 IPC 라
  //   `await` 이다. 그래서 **미리 한 번 재서 표에 담고** 본문은 그 표를 읽는다 —
  //   `{@const}` 자리에서 `await` 을 할 수 없기도 하다.
  // ⚠ 못 물으면 표가 비고 꼬리가 안 붙는다. 화면이 값을 지어 내면 그게 사본이다.
  let effTails = new Map<string, string>();
  // ⚠ **늦게 온 답이 새 답을 덮지 않게 한다.** 소식을 빠르게 넘기면 앞 소식의
  //   왕복이 뒤에 도착할 수 있다 — 그러면 지금 소식에 **다른 소식의 꼬리**가 붙는다
  let effSeq = 0;
  $: void refreshEffTails(selected?.decision?.options, p.condition, p.fatigue, p.diligence);
  async function refreshEffTails(
    opts: readonly { id: string; effects?: import("../../shared/types/main").DecisionEffect }[] | undefined,
    condition: number, fatigue: number, diligence: number,
  ) {
    const seq = ++effSeq;
    const next = new Map<string, string>();
    for (const opt of opts ?? []) {
      const e = opt.effects;
      if (!e) continue;
      const d = await trainingEfficiencyDelta(
        { condition, fatigue, diligence },
        { conditionDelta: e.conditionDelta, fatigueDelta: e.fatigueDelta, diligenceDelta: e.diligenceDelta },
      );
      if (d !== null) next.set(opt.id, `→ 훈련 효율 ${d > 0 ? "+" : "−"}${Math.abs(d)}%`);
    }
    if (seq === effSeq) effTails = next;
  }

  // ── 등급 (2026-09-08 · PLAN_EVENT_TIERS §2·§9 · C 4-5) ─────────
  //
  // 🔴 **유니크·히든은 선택지의 숫자를 안 보여 준다**(§2). 크기를 모른 채
  //   고르는 것이 그 등급의 감각이라는 기획이고, 결과는 **고른 뒤** 아래
  //   `dec-done` 에 숫자 그대로 나온다 — 감추는 게 아니라 **미루는 것**이다.
  //
  // ⚠ 등급은 `selected` 소식이 들고 있다(엔진이 실은 스냅샷). 규칙 id 로
  //   되짚지 않는다 — 옛 소식이 지금 데이터의 등급으로 보인다.
  $: veiled = hidesNumbers(selected?.eventGrade);
  $: costHint = costKindHint(selected?.eventCost ? [selected.eventCost] : undefined);

  /** effectHint의 부호로 색을 정한다 (+3 / -2 같은 표기) */
  function effectTone(hint: string): "pos" | "neg" | "mixed" | "none" {
    const hasPos = /\+\d/.test(hint);
    const hasNeg = /-\d/.test(hint);
    if (hasPos && hasNeg) return "mixed";
    if (hasPos) return "pos";
    if (hasNeg) return "neg";
    return "none";
  }
</script>

<svelte:window on:keydown={onEsc} />

<section class="news">
  <!-- ── 챙길 것 ── -->
  {#if alerts.length > 0}
    <section class="alerts">
      <span class="u-label">챙길 것</span>
      <ul>
        {#each alerts as a}
          <li data-tone={a.tone}>{a.text}</li>
        {/each}
      </ul>
    </section>
  {/if}

  <div class="cols" class:detail-open={!!selected}>
    <!-- ── 소식 목록 ── -->
    <section class="feed u-card">
      <header class="feed-head">
        <div class="filters">
          {#each FILTERS as f}
            <button
              class="chip"
              class:on={activeFilter === f.id}
              type="button"
              on:click={() => (activeFilter = f.id)}
            >
              {f.label}{#if counts[f.id] > 0}<span class="cnt u-num">{counts[f.id]}</span>{/if}
            </button>
          {/each}
        </div>
        <div class="feed-tools">
          <button class="tool" type="button" on:click={() => (sortAsc = !sortAsc)}>
            {sortAsc ? "오래된순" : "최신순"}
          </button>
          <button class="tool" type="button" disabled={unreadNonDecisionCount === 0} on:click={markAllRead}>
            모두 읽음
          </button>
        </div>
      </header>

      <ul class="list" on:scroll={onListScroll}>
        {#if sorted.length === 0}
          <li class="empty">표시할 소식이 없습니다.</li>
        {:else}
          {#each visible as msg (msg.id)}
            {@const cat = categoryMeta(msg.category)}
            {@const isPending = msg.decision?.selectedOptionId === null}
            <li>
              <button
                class="item"
                class:unread={msg.readAt === null}
                class:pending={isPending}
                style="--cat:{cat.accent}"
                type="button"
                on:click={() => open(msg)}
              >
                <div class="item-head">
                  <span class="cat">{cat.label}</span>
                  <!-- 등급 칩 — 노말은 아무것도 안 그린다(§9). 목록은 폭이 좁아 `small` -->
                  <EventTierChip grade={msg.eventGrade} theme={msg.eventTheme} small />
                  <span class="sender">{msg.sender}</span>
                  <span class="grow"></span>
                  {#if isPending}<span class="tag-pending">선택 대기</span>
                  {:else if msg.decision?.selectedOptionId}<span class="tag-done">선택 완료</span>{/if}
                  <span class="time u-num">{msg.createdAt}</span>
                </div>
                <p class="subject">
                  {#if msg.readAt === null}<span class="dot" aria-hidden="true"></span>{/if}<span class="subject-t">{msg.subject}</span>
                </p>
                <p class="preview">{msg.preview}</p>
              </button>
            </li>
          {/each}
          {#if hasMore}
            <li class="more-row">
              <button class="more" type="button" on:click={() => (shown += PAGE)}>
                {Math.min(PAGE, sorted.length - shown)}건 더 · 남은 {sorted.length - shown}
              </button>
            </li>
          {/if}
        {/if}
      </ul>
    </section>

    <!-- ── 상세 ── -->
    <!-- ⚠ **옆단(최근 경기·예정)이 있던 자리다.** 그 둘은 우측 패널의
         "최근"·"다음 경기"와 같은 걸 두 번 보여주고 있었다 — 소식 탭이
         내비·목록·옆단·우측패널로 4단이었고 그중 하나가 중복이었다.
         오프시즌 안내만 우측 패널에 없어서 "챙길 것"으로 옮겼다.

         ⚠ **모달이 아니라 칸이다.** 상세를 오버레이로 띄우면 목록이 가려져
         "다음 소식으로 넘어가려면 닫아야" 한다. FM식 2단은 목록을 보면서
         고르는 게 요점이므로, 좁은 폭에서만 목록을 접는다(아래 미디어쿼리) -->
    <section class="detail u-card" class:empty-state={!selected}>
      {#if selected}
        {@const cat = categoryMeta(selected.category)}
        {@const dec = selected.decision}
        <header class="m-head" style="--cat:{cat.accent}">
          <button class="m-back" type="button" on:click={close} aria-label="목록으로">‹ 목록</button>
          <span class="m-cat">{cat.label}</span>
          <EventTierChip grade={selected.eventGrade} theme={selected.eventTheme} />
          <p class="m-title">{selected.subject}</p>
        </header>
        <p class="m-meta">{selected.sender} · {selected.createdAt}</p>

        <div class="m-body">
          {#if selected.metadata?.type === "training"}
            {@const tm = selected.metadata as TrainingMetadata}
            <TrainingStatBars stats={tm.stats} condition={tm.condition} fatigue={tm.fatigue}
                              morale={tm.morale} extraLogs={tm.extraLogs} />
          {:else if selected.metadata?.type === "top10"}
            <RankListPanel metadata={selected.metadata as Top10Metadata} />
          {:else if selected.metadata?.type === "table"}
            <!-- 표 19자리가 이 갈래 하나를 쓴다 (PLAN_MESSAGE_DASHBOARDS §2).
                 종류마다 컴포넌트를 만들면 19개가 된다 — 열이 다를 뿐 구조는 같다 -->
            <StatTable metadata={selected.metadata as TableMetadata} />
          {:else if selected.metadata?.type === "rankList"}
            <RankListPanel metadata={selected.metadata as RankListMetadata} />
          {:else if selected.metadata?.type === "timeline"}
            <TimelinePanel metadata={selected.metadata as TimelineMetadata} />
          {:else if selected.metadata?.type === "bars"}
            <!-- 막대 둘(시험 결과·팀 분위기)이 훈련 결과와 같은 그릇을 쓴다
                 (§2 — 신설은 둘뿐이다). 컨디션 줄은 훈련에만 뜻이 있어 끈다 -->
            {@const bm = selected.metadata as BarsMetadata}
            <TrainingStatBars showStatus={false}
                              bars={buildBars(bm, barsCopy($masterStore.dashboardLabels, bm.kind))} />
          {:else if selected.metadata?.type === "cards"}
            {@const cm = selected.metadata as CardsMetadata}
            {@const cv = buildCards(cm, cardsCopy($masterStore.dashboardLabels, cm.kind), names)}
            <div class="cardsblock">
              {#if cv.cards.length === 0}
                <p class="cards-empty">{cv.empty}</p>
              {:else}
                <!-- 누를 수 없는 꼴로 쓴다 — 소식 카드는 거를 목록이 없다 -->
                <DigestCards interactive={false} active={null} onPick={() => {}}
                             cards={cv.cards.map((c, i) => ({ id: String(i), label: c.caption, count: c.value }))} />
              {/if}
              {#if cv.note}<p class="cards-note">{cv.note}</p>{/if}
            </div>
          {:else if selected.metadata?.type === "offseason"}
            <OffseasonPanel metadata={selected.metadata as OffseasonMetadata} />
          {:else if selected.metadata?.type === "injury"}
            <InjuryPanel metadata={selected.metadata as InjuryMetadata} />
          {:else if selected.metadata?.type === "myBody"}
            <!-- 🔴 **다섯 번째 metadata 인데 그리는 갈래가 없었다**
                 (MESSAGE_KINDS_DISPLAY_2026-09-03 §4). 구조가 잡힌 숫자를
                 들고 와서 본문 텍스트로만 나가고 있었다 -->
            <MyBodyPanel metadata={selected.metadata as MyBodyMetadata} />
          {/if}

          <!--
            🔴 **본문을 패널이 대신하지 않는다** (사용자 확정 2026-09-04).
               예전엔 `{:else}` 라 **패널이 있으면 본문이 통째로 사라졌다** —
               표는 값만 그리는데 본문에는 안내 문장이 같이 있어서
               (「올해 채운 조건은 없습니다.」·「기록 탭에 남습니다」) 그 말이
               화면에서 없어졌다. 패널 위 · 본문 아래로 **같이** 그린다.

            ⚠ 묶음 1·2 처럼 본문이 값뿐인 자리는 표와 겹쳐 보인다. 그건
              **생산부가 본문을 줄일 자리**지 화면이 지울 자리가 아니다 —
              지우면 안내가 있는 소식까지 같이 잃는다.
          -->
          {#if selected.body}
            <div class="m-text" class:m-text-after={hasPanel}>
              {#each selected.body.replace(/\\n/g, "\n").split("\n") as line}
                <p>{line || " "}</p>
              {/each}
            </div>
          {/if}
        </div>

        {#if selected.metadata?.type === "roleChoice"}
          <!-- 보직 선택은 같은 자리(.dec)를 쓰되 확인 단계가 하나 더 있다 —
               PLAN_ROLE_RECOMMEND §4. 새 모달을 만들지 않는다 -->
          <RoleChoicePanel msg={selected} />
        {:else if dec}
          <section class="dec">
            {#if dec.prompt}<p class="dec-prompt">{dec.prompt}</p>{/if}
            <!-- 대가는 **선택지가 아니라 이벤트에 붙는다**(§4) — 어느 갈래를
                 골라도 낸다. 그래서 갈래 위에 한 줄로 두고 종류만 적는다 -->
            {#if selected.eventCost && dec.selectedOptionId === null}
              <p class="dec-cost">{COST_LEAD}{#if costHint} — {costHint}{/if}</p>
            {/if}
            {#if dec.selectedOptionId === null}
              <div class="dec-opts">
                {#each dec.options as opt}
                  <!-- ⚠ `{@const}` 는 블록의 바로 아래여야 한다 — `<button>` 안에
                       두면 Svelte 가 컴파일을 거부한다 -->
                  {@const effTail = effTails.get(opt.id) ?? ""}
                  <!-- ⚠ **`effectHint` 문자열을 깎지 않는다.** 유니크·히든이면 그 문장을
                       아예 안 쓰고 효과 객체에서 종류를 다시 짓는다 — 정규식으로 숫자만
                       지우면 「+3」은 사라져도 「크게 오른다」는 남는 반쪽이 된다 -->
                  {@const hint = veiled ? kindOnlyHint(opt.effects) : opt.effectHint}
                  <button class="opt" data-tone={veiled ? "none" : effectTone(opt.effectHint)} type="button" on:click={() => choose(opt.id)}>
                    <span class="opt-label">{opt.label}</span>
                    {#if hint}<span class="opt-hint" class:veil={veiled}>{hint}</span>{/if}
                    <!-- 꼬리는 힌트와 **다른 줄**이다 — 한 줄로 이으면 어디까지가
                         데이터의 말이고 어디부터가 화면의 계산인지 안 보인다
                         🔴 꼬리는 **퍼센트 숫자**라 감추는 등급에선 같이 뗀다 —
                            힌트만 가리고 꼬리를 남기면 그리로 크기가 샌다 -->
                    {#if effTail && !veiled}<span class="opt-eff">{effTail}</span>{/if}
                  </button>
                {/each}
              </div>
            {:else}
              <!-- ⚠ 예전 화면은 여기에 `{:else if metadata.type === "top10"}` 가지가
                   끼어 있어서, **TOP10 소식은 선택을 마쳐도 고른 답이 안 보였다.**
                   본문에서 이미 그린 패널을 한 번 더 그리고 있었다 -->
              {@const chosen = dec.options.find((o) => o.id === dec.selectedOptionId)}
              <div class="dec-done">
                <span class="check">✓</span>
                <span class="done-label">{chosen?.label}</span>
                {#if chosen?.effectHint}<span class="done-hint">{chosen.effectHint}</span>{/if}
              </div>
            {/if}
          </section>
        {/if}
      {:else}
        <p class="ph">읽을 소식을 왼쪽에서 고른다</p>
        {#if pendingMsgs.length > 0}
          <p class="ph-sub">선택을 기다리는 소식 {pendingMsgs.length}건이 맨 위에 있다</p>
        {/if}
      {/if}
    </section>
  </div>
</section>

<style>
  .news {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
    border-radius: var(--radius);
    overflow: hidden;
  }

  /* ── 챙길 것 ── */
  .alerts {
    background: var(--panel);
    border-left: 3px solid var(--warn);
    border-radius: var(--radius);
    padding: 9px 12px;
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
  }
  .alerts ul { list-style: none; margin: 5px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 18px; }
  .alerts li { font-size: 12.5px; color: var(--ink-mid); }
  .alerts li::before { content: "·"; margin-right: 6px; font-weight: 700; }
  .alerts li[data-tone="bad"]::before  { color: var(--bad); }
  .alerts li[data-tone="warn"]::before { color: var(--warn); }
  .alerts li[data-tone="info"]::before { color: var(--ink-mute); }

  /* ⚠ **목록이 좁으면 안 된다.** 소제목·보낸이·미리보기가 한 줄씩 들어가므로
     360px 아래로는 제목이 잘린다. 상세는 남는 폭을 다 쓴다 */
  .cols {
    display: grid;
    grid-template-columns: minmax(320px, 400px) minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
  }

  /* ── 소식 목록 ── */
  .feed {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
    padding: 11px 12px;
  }

  .feed-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  /* ⚠ **한 줄을 지킨다.** 2단으로 바꾸면서 목록 폭이 좁아져 칩 여섯 개가
     두 줄로 깨졌다 — 분류를 묶어(`FILTER_GROUPS`) 다섯 개로 줄이고
     `nowrap`으로 못 박는다. 그래도 안 들어가면 줄이 늘어나는 대신
     칩이 줄어들어야 한다(아래 `min-width: 0`) */
  .filters { display: flex; gap: 4px; flex-wrap: nowrap; min-width: 0; }

  .chip {
    display: inline-flex; align-items: center; gap: 4px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink-mid);
    border-radius: 999px;
    font-size: 11.5px;
    padding: 4px 9px;
    cursor: pointer;
    white-space: nowrap;
    min-width: 0;
  }
  .chip:hover { border-color: var(--line-strong); }
  .chip.on { background: var(--t-dark); border-color: var(--t-dark); color: var(--ink-on-dark); }
  .cnt { font-size: 10px; color: var(--ink-mute); }
  .chip.on .cnt { color: var(--t-gold); }

  .feed-tools { display: flex; gap: 5px; }
  .tool {
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-mute);
    border-radius: var(--radius);
    font-size: 11.5px;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tool:hover:not(:disabled) { border-color: var(--t-dark); color: var(--t-dark); }
  .tool:disabled { opacity: 0.35; cursor: default; }

  /* ⚠ **flex 자식은 min-content 밑으로 안 줄어든다.** `min-width: 0`이 없으면
     `.item-head`의 nowrap 조각들(분류·보낸이·시각)이 min-content를 밀어올려
     목록이 통째로 가로로 늘어난다 — 실측 폭 365에 scrollWidth 597이었고,
     카드 글자가 칸 밖으로 삐져나왔다. `overflow-x`로 가리기만 하면 글자가
     잘린 채 남으므로 **줄어들게** 해야 한다 */
  .list {
    list-style: none; margin: 0; padding: 0;
    min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden;
    display: flex; flex-direction: column; gap: 6px;
  }
  .list > li { min-width: 0; }
  .empty { color: var(--ink-mute); font-size: 13px; padding: 14px 2px; }
  .more-row { display: flex; justify-content: center; }
  .more {
    width: 100%; padding: 8px; cursor: pointer;
    background: transparent; border: 1px dashed var(--line); border-radius: 8px;
    color: var(--ink-mute); font-size: 12px;
  }
  .more:hover { color: var(--ink); border-color: var(--ink-mute); }

  .item {
    width: 100%; text-align: left; cursor: pointer;
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 3px solid var(--cat);
    border-radius: var(--radius);
    padding: 9px 12px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .item:hover { background: var(--panel-sunk); }

  .item-head { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
  .cat { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; color: var(--cat); flex-shrink: 0; }
  /* 보낸이는 길 수 있다(리그 사무국·고교야구연맹) — 여기가 줄어드는 자리다 */
  .sender {
    font-size: 11.5px; color: var(--ink-mute);
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .grow { flex: 1; min-width: 0; }
  .time { font-size: 10.5px; color: var(--ink-mute); flex-shrink: 0; }

  /* ⚠ **말줄임은 안쪽 span이 한다.** 이 줄은 flex라 여기에 `ellipsis`를 걸면
     안 먹는다 — 2단으로 바꾼 뒤 목록 폭이 좁아지면서 제목이 그대로 넘쳐
     오른쪽으로 잘렸다 */
  .subject {
    margin: 0; font-size: 13.5px; color: var(--ink); font-weight: 600;
    display: flex; align-items: center; gap: 6px;
    min-width: 0; width: 100%;
  }
  .subject-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item.unread .subject { font-weight: 800; }
  /* 목록 항목 자체도 안 넘치게 — 안 막으면 긴 보낸이 이름이 카드를 늘린다 */
  .item { min-width: 0; }
  .item-head { min-width: 0; }
  .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--cat); flex-shrink: 0; }

  /* ⚠ **`width: 100%`가 있어야 한다.** `.item`이 flex column이라 자식이
     stretch될 것 같지만, `nowrap` 텍스트는 max-content로 커진다 — 실측에서
     이 줄만 555px이 되어 카드(365px) 밖으로 삐져나갔다. `overflow: hidden`은
     자기 박스를 자르지 **박스가 커지는 걸 막지 않는다.**

     ⚠ 짧은 미리보기(195px)는 멀쩡했다. **긴 것 하나만 터졌다** — 목록 하나만
     보고 넘어가면 못 잡는 종류다 */
  .preview {
    margin: 0; font-size: 12px; color: var(--ink-mute);
    min-width: 0; width: 100%;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* 선택 대기는 목록에서 즉시 구분돼야 한다 — 게임이 여기서 멈춰 있다.
     ⚠ **배경을 하드코딩하면 안 된다.** `#FFFBF2`로 박아 뒀더니 어두운
     테마에서 배경 rgb(255,251,242)에 글자 rgb(230,236,247) — **흰 바탕에
     흰 글씨**가 되어 선택 대기 소식의 제목이 안 보였다(실측).
     테두리와 왼쪽 띠만으로 충분히 눈에 띈다 */
  .item.pending { border-color: var(--warn); border-left-color: var(--warn); }
  .tag-pending {
    font-size: 10px; font-weight: 800; color: #6B4200;
    background: var(--attn); border-radius: 2px; padding: 1px 6px;
  }
  .tag-done { font-size: 10px; color: var(--ok); font-weight: 700; }

  /* ── 상세 ── */
  .detail {
    display: flex; flex-direction: column; gap: 8px;
    min-height: 0;
    padding: 14px 16px;
    color: var(--ink);
  }
  /* 아무것도 안 골랐을 때는 안내만 가운데 — 빈 카드가 뜨면 고장으로 읽힌다 */
  .detail.empty-state { align-items: center; justify-content: center; text-align: center; }
  .ph { margin: 0; font-size: 13px; color: var(--ink-mute); }
  .ph-sub { margin: 6px 0 0; font-size: 12px; color: var(--warn); font-weight: 700; }

  .m-head { display: flex; align-items: center; gap: 10px; }
  .m-cat { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; color: var(--cat); }
  .m-title { margin: 0; flex: 1; font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
  /* 넓은 폭에선 목록이 옆에 있으니 이 버튼이 필요 없다 — 좁을 때만 보인다 */
  .m-back {
    display: none;
    background: none; border: 0; cursor: pointer;
    color: var(--ink-mute); font-size: 12px; padding: 2px 6px;
  }
  .m-back:hover { color: var(--ink); }

  .m-meta { margin: 0; font-size: 11.5px; color: var(--ink-mute); }

  .m-body {
    margin-top: 4px; padding-top: 10px;
    border-top: 1px solid var(--line);
    min-height: 0; overflow-y: auto;
    font-size: 13.5px; line-height: 1.65; color: var(--ink-mid);
  }
  /**
   * ⚠ **`pre-wrap`이 없으면 공백 정렬이 통째로 뭉개진다.** 본문을 줄 단위
   * `<p>`로 쪼개는데 HTML은 `<p>` 안의 연속 공백을 하나로 접는다 — 순위표처럼
   * 들여쓰기·자릿수 맞춤에 기대는 소식이 한 덩어리 문장으로 보였다
   * (2026-08-08 다이제스트 렌더를 눈으로 보고 발견. 자동 검사는 본문 문자열만
   * 보므로 이걸 못 잡는다).
   *
   * 줄바꿈은 이미 `<p>`가 만든다 — 여기서는 **공백 보존**만 취한다.
   */
  .m-body :global(p) { margin: 0; white-space: pre-wrap; }

  /* 패널 아래에 붙는 본문 — 선 하나로 가른다. 패널이 없으면 선도 없다 */
  .m-text-after {
    margin-top: 10px; padding-top: 9px;
    border-top: 1px solid var(--line);
  }

  /* 카드 소식 — 카드 줄과 그 아래 한 줄 (§1-4) */
  .cardsblock { display: flex; flex-direction: column; gap: 8px; }
  .cards-note { margin: 0; font-size: 12px; color: var(--ink-mid); }
  .cards-empty {
    margin: 0; font-size: 11px; color: var(--ink-mute);
    text-align: center; padding: 10px;
  }

  .dec {
    border-top: 1px solid var(--line);
    padding-top: 11px;
  }
  .dec-prompt { margin: 0 0 9px; font-size: 13px; font-weight: 700; color: var(--ink); }
  /* 대가 — 갈래처럼 보이면 누를 수 있는 것으로 읽힌다. 왼쪽 띠 · 경고색 한 줄 */
  .dec-cost {
    margin: 0 0 9px; padding: 6px 9px; font-size: 12px; font-weight: 700;
    color: var(--warn); background: var(--panel-sunk);
    border-left: 3px solid var(--warn); border-radius: var(--radius);
  }

  .dec-opts { display: flex; flex-direction: column; gap: 6px; }
  .opt {
    display: flex; align-items: baseline; gap: 10px;
    width: 100%; text-align: left; cursor: pointer;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 10px 13px;
    font-size: 13px; color: var(--ink);
  }
  .opt:hover { border-color: var(--t-dark); background: var(--panel-sunk); }
  .opt-label { font-weight: 700; }
  .opt-hint { font-size: 11.5px; margin-left: auto; }
  .opt[data-tone="pos"]   .opt-hint { color: var(--ok); }
  .opt[data-tone="neg"]   .opt-hint { color: var(--bad); }
  .opt[data-tone="mixed"] .opt-hint { color: var(--warn); }
  .opt[data-tone="none"]  .opt-hint { color: var(--ink-mute); }
  /* 종류만 보이는 힌트(유니크·히든) — 기울임으로 **데이터의 말이 아님**을 표시한다.
     색은 부호가 없으니 중립뿐이다(위 data-tone 이 늘 none 이라 저절로 그렇게 된다) */
  .opt-hint.veil { font-style: italic; }
  /* 훈련 효율 꼬리 — 힌트와 **다른 줄**에 둔다. 화면이 계산한 값이라
     데이터가 준 문장(`.opt-hint`)과 섞여 보이면 안 된다 */
  .opt { flex-wrap: wrap; }
  .opt-eff {
    flex-basis: 100%;
    text-align: right;
    font-size: 11px;
    color: var(--ink-mute);
    font-variant-numeric: tabular-nums;
  }

  .dec-done {
    display: flex; align-items: baseline; gap: 9px;
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 9px 13px;
    font-size: 13px;
  }
  .check { color: var(--ok); font-weight: 800; }
  .done-label { font-weight: 700; color: var(--ink); }
  .done-hint { font-size: 11.5px; color: var(--ink-mute); margin-left: auto; }

  /* ⚠ **좁으면 두 칸이 같이 안 산다.** 목록 최소 320 + 상세 본문은
     1100px 아래에서 둘 다 읽을 수 없게 된다. 그때는 FM처럼 **한 번에 하나만**
     보여주고, 상세에 "목록으로" 버튼을 띄운다 — 두 칸을 억지로 욱여넣으면
     제목이 잘리고 카드형(TOP10 표·부상 목록)이 가로로 넘친다 */
  @media (max-width: 1100px) {
    .cols { grid-template-columns: minmax(0, 1fr); }
    .cols.detail-open .feed { display: none; }
    .cols:not(.detail-open) .detail { display: none; }
    .m-back { display: inline; }
  }
</style>
