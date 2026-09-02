<script lang="ts">
  import type { MilitaryCalendarEntry, MilitaryLifeEvent, MilitaryLifeRules, MilitaryLifeState } from "../../../shared/types/militaryLife";
  import { CHOICE_LABEL } from "./militaryLabels";

  /** 캘린더 (§32) — 복무 전체 주 축 · calendarDone 은 지난 것 · 다음 것 강조 · 휴가 / noChoice / 성과 구분 · 보직 전용은 내 보직만 */
  export let ml: MilitaryLifeState;
  export let rules: MilitaryLifeRules;
  export let calendar: MilitaryCalendarEntry[];
  export let events: MilitaryLifeEvent[];
  export let week: number;

  type Kind = "leave" | "hard" | "job" | "base";
  const KIND_LABEL: Record<Kind, string> = { base: "기본", hard: "혹한기 · 유격 · 공사", leave: "휴가", job: "성과 이벤트 (경기 대체)" };
  const LANES = ["up", "dn", "up2", "dn2"] as const;

  $: total = rules.serviceWeeks;
  $: entries = calendar
    .filter((c) => c.role === undefined || c.role === null || c.role === ml.roleId)
    .sort((a, b) => a.week - b.week);
  $: next = entries.find((c) => c.week > week) ?? null;
  $: past = entries.filter((c) => c.week <= week);
  $: upcoming = entries.filter((c) => c.week > week);
  $: pct = Math.max(0, Math.min(100, (week / total) * 100));

  function kindOf(c: MilitaryCalendarEntry): Kind {
    if (c.leaveDays) return "leave";
    if (c.noChoice) return "hard";
    return events.find((e) => e.id === c.event)?.perf ? "job" : "base";
  }
  function done(c: MilitaryCalendarEntry): boolean {
    return ml.calendarDone.includes(c.event);
  }
  function choiceAt(w: number): string {
    const log = ml.choiceLog.find((l) => l.week === w);
    if (!log) return "";
    return log.choice ? CHOICE_LABEL[log.choice] : "선택 없음";
  }
  function x(w: number): number { return (w / total) * 100; }
</script>

<div class="card">
  <h2>{total}주 <span>· 확률 밖에서 그 주에 반드시 뜬다 · 보직 전용은 내 보직만</span></h2>
  <div class="tl">
    <div class="axis"></div>
    <div class="done" style="width:{pct}%"></div>
    {#each entries as c, i (c.event + c.week)}
      <span class="mk {kindOf(c)}" class:past={c.week <= week} class:next={next?.week === c.week} style="left:{x(c.week)}%" title="W{c.week} {c.label}"></span>
      <span class="lb {LANES[i % LANES.length]}" class:next={next?.week === c.week} style="left:{x(c.week)}%">{c.label}<small>W{c.week}</small></span>
    {/each}
    <div class="now" style="left:{pct}%"><b>지금 W{week}</b></div>
  </div>
  <div class="legend">
    {#each Object.entries(KIND_LABEL) as [k, label] (k)}
      <span><i class={k}></i>{label}</span>
    {/each}
  </div>
</div>

<div class="grid">
  <div class="card">
    <h2>겪은 것 <span>· 선택까지</span></h2>
    {#if past.length === 0}
      <p class="empty">아직 없다.</p>
    {:else}
      <ul class="log">
        {#each past as c (c.event + c.week)}
          <li>
            <span class="w">W{c.week}</span>
            <span>
              <!-- 블록 안 앞 공백은 Svelte 가 지운다 — 구분자를 식으로 넣는다 -->
              {c.label}{c.leaveDays ? ` — ${c.leaveDays}일` : ""}{#if !done(c)} <em class="miss">(안 떴다)</em>{/if}
              {#if choiceAt(c.week)}<span class="pick"> — {choiceAt(c.week)}</span>{/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="card">
    <h2>다가오는 것</h2>
    {#if upcoming.length === 0}
      <p class="empty">남은 사건이 없다.</p>
    {:else}
      <ul class="log">
        {#each upcoming as c (c.event + c.week)}
          <li class:next={next?.week === c.week}>
            <span class="w">W{c.week}</span>
            <span>
              {c.label}{c.leaveDays ? ` — 휴가 ${c.leaveDays}일` : ""}{c.noChoice ? " · 선택 없음" : ""}{c.role ? ` · ${c.role === "signal" ? "통신병" : "박격포병"} 전용` : ""}
              <span class="pick"> · {c.week - week}주 뒤</span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; min-width: 0; color: var(--ink); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 10px; }
  h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-mute); font-weight: 700; }
  h2 span { text-transform: none; letter-spacing: 0; font-weight: 500; }
  .tl { position: relative; height: 210px; margin: 14px 24px 0; }
  .tl .axis { position: absolute; left: 0; right: 0; top: 96px; height: 2px; background: var(--line-strong); }
  .tl .done { position: absolute; left: 0; top: 96px; height: 2px; background: var(--ok); }
  .tl .now { position: absolute; top: 84px; width: 2px; height: 26px; background: var(--t-accent); }
  /* "지금" 글자는 축 맨 아래 — 위쪽 두 줄은 사건 라벨이 쓰고 있어 초반(W1~7)에 겹쳤다 */
  .tl .now b { position: absolute; top: 88px; left: -14px; font-size: 11px; color: var(--t-accent); white-space: nowrap; }
  .tl .mk { position: absolute; width: 8px; height: 8px; border-radius: 50%; top: 93px; margin-left: -4px; background: var(--ink-mute); }
  .mk.hard, .legend i.hard { background: var(--bad); }
  .mk.leave, .legend i.leave { background: var(--ok); }
  .mk.job, .legend i.job { background: var(--warn); }
  .mk.base, .legend i.base { background: var(--ink-mute); }
  .tl .mk.past { opacity: .5; }
  .tl .mk.next { box-shadow: 0 0 0 3px rgba(179, 49, 31, 0.25); }
  .tl .lb { position: absolute; font-size: 10.5px; color: var(--ink-mid); white-space: nowrap; transform: translateX(-50%); line-height: 1.25; text-align: center; }
  .tl .lb.next { color: var(--t-accent); font-weight: 800; }
  .tl .lb.up { top: 52px; } .tl .lb.dn { top: 108px; } .tl .lb.up2 { top: 22px; } .tl .lb.dn2 { top: 140px; }
  .tl .lb small { display: block; color: var(--ink-mute); }
  .legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-mid); margin-top: 6px; }
  .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
  .log { font-size: 12px; margin: 0; padding-left: 0; list-style: none; }
  .log li { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px dashed var(--line); font-variant-numeric: tabular-nums; }
  .log li:last-child { border-bottom: 0; }
  .log li.next { font-weight: 800; color: var(--t-dark); }
  .log .w { color: var(--warn); font-weight: 700; }
  .log .pick { color: var(--ink-mute); }
  .miss { font-style: normal; color: var(--ink-mute); }
  .empty { color: var(--ink-mute); font-size: 12px; margin: 0; }
</style>
