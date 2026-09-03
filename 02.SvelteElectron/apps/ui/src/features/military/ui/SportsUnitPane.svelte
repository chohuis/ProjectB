<script lang="ts">
  import type { MilitaryCalendarEntry, MilitaryLifeRules } from "../../../shared/types/militaryLife";
  import { rankBandOf } from "../../../shared/types/militaryLife";
  import type { MessageItem } from "../../../shared/types/main";
  import type { MilitarySportsCopy } from "../../../shared/utils/militarySportsCopy";
  import {
    fillSportsCopy, sportsCalendar, militaryNews, dischargeWeekOf,
  } from "../../../shared/utils/militarySportsCopy";
  import { gaugeLabel } from "../../../shared/utils/baseballFormat";
  import { RANK_LABELS } from "./militaryLabels";

  /**
   * 체육부대(상무) 병역 탭 — **현역 넷 대신 한 장**이다 (PLAN_MILITARY_LIFE §39).
   *
   * 사용자 결정(2026-09-03): **복무 중엔 보직을 안 묻고 경기가 없다.** 그래서
   * 현역의 일과·부대원 2단이 상무엔 주인이 없다 — 카드를 비워 두는 대신 넷을
   * 안 그린다. 여기 있는 것 넷:
   *
   *   ① 전역 카운트   남은 주 · 진행 · 전역 예정
   *   ② 성적 없음 안내 「이 기간엔 이닝도 타석도 안 쌓인다」
   *   ③ 부대 일정      calendar.json 중 상무에도 있는 자리만 (문안의 eventIds 가 정본)
   *   ④ 부대 소식      소식함의 `msg-mil-*` — 이미 쌓이고 있는 것을 모아 보인다
   *
   * ⚠ **새 pending 을 안 만든다.** 이 화면은 읽기다 — 상무 이벤트의 선택은
   *   지금처럼 `advanceWeek` 가 띄우는 모달이 받는다. 여기서 또 물으면 같은
   *   선택이 두 곳에 생긴다.
   *
   * ⚠ **문장을 코드에 안 적는다.** 전부 `copy`(messages/military_sports.json)다.
   */
  export let copy: MilitarySportsCopy;
  export let rules: MilitaryLifeRules | null;
  export let calendar: MilitaryCalendarEntry[];
  export let mailbox: MessageItem[];
  /** 복무 주차 (`protagonist.militaryServiceWeeks`) */
  export let week: number;
  /** 총 복무 주 — 정본은 rules.json 이고 없으면 호출부가 SERVICE_WEEKS 를 준다 */
  export let total: number;
  export let dischargeYear: number | null = null;
  /**
   * 입대 주차 (`protagonist.militaryEnlistWeek`) — **전역 주차를 여기서 잰다.**
   *
   * 🔴 전역은 복무 주가 차는 주고(`militaryServiceWeeks >= 100`) 그 주차는
   *    입대 주에 따라 달라진다. 옛 화면 둘이 「W48」을 박아 뒀는데 기본
   *    입대 주(W50)면 **W46** 이다.
   *
   * ⚠ 옛 세이브엔 없다(`null`). 그때는 연도만 그린다 — 틀린 주차를
   *   지어내는 것보다 안 적는 게 낫다.
   */
  export let enlistWeek: number | null = null;
  export let condition: number;
  export let fatigue: number;
  export let morale: number;

  /**
   * 소식은 최신 열둘까지만 편다. 100주 복무면 약 40통이라 다 펴면 이 카드가
   * 화면을 먹는다 — 나머지는 소식함이 갖고 있고 그 수를 아래 줄이 말한다.
   */
  const NEWS_MAX = 12;

  $: dischargeWeek = dischargeWeekOf(enlistWeek, total);
  $: remaining = Math.max(0, total - week);
  $: pct = Math.max(0, Math.min(100, Math.round((week / total) * 100)));
  $: band = rules ? rankBandOf(week, rules.rankBandWeeks) : null;
  $: rankLabel = band === null ? "" : (RANK_LABELS[band] ?? RANK_LABELS[RANK_LABELS.length - 1]);

  $: entries = sportsCalendar(calendar, copy.calendar.eventIds);
  $: past = entries.filter((c) => c.week <= week);
  $: upcoming = entries.filter((c) => c.week > week);

  $: news = militaryNews(mailbox);
  $: newsShown = news.slice(0, NEWS_MAX);
  $: newsRest = news.length - newsShown.length;
</script>

<section class="sports">
  <header class="head">
    <div class="who">
      <h1>{copy.head.title}</h1>
      <div class="sub">
        {#if rankLabel}<span class="chip">{rankLabel}</span>{/if}
        <span class="meta">{copy.head.lead}</span>
      </div>
    </div>
    <div class="svc">
      <div class="cap">{copy.discharge.title}</div>
      {#if remaining > 0}
        <div class="big">{remaining}<small>{copy.discharge.unit}</small></div>
      {:else}
        <div class="big done">{copy.discharge.done}</div>
      {/if}
      <div class="of">{fillSportsCopy(copy.discharge.progress, { total, done: week })}</div>
      {#if dischargeYear}
        <div class="of">
          {copy.discharge.dateLead}
          {#if dischargeWeek !== null}
            {fillSportsCopy(copy.discharge.dateForm, { year: dischargeYear, week: dischargeWeek })}
          {:else}
            {fillSportsCopy(copy.discharge.dateFormYear, { year: dischargeYear })}
          {/if}
        </div>
      {/if}
    </div>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={week}
         aria-label="{copy.discharge.title} {pct}%">
      <i style="width:{pct}%"></i>
    </div>
    <dl class="gauges">
      <div><dt>컨디션</dt><dd>{gaugeLabel(condition)}</dd></div>
      <div><dt>피로도</dt><dd>{gaugeLabel(fatigue)}</dd></div>
      <div><dt>사기</dt><dd>{gaugeLabel(morale)}</dd></div>
    </dl>
  </header>

  <div class="card nogame">
    <h2>{copy.noGames.title}</h2>
    <p>{copy.noGames.body}</p>
    <p class="note">{copy.noGames.note}</p>
  </div>

  <div class="card">
    <h2>{copy.calendar.title} <span>· {copy.calendar.lead}</span></h2>
    {#if entries.length === 0}
      <p class="empty">{copy.calendar.emptyUpcoming}</p>
    {:else}
      <div class="grid">
        <div>
          <h3>{copy.calendar.past}</h3>
          {#if past.length === 0}
            <p class="empty">{copy.calendar.emptyPast}</p>
          {:else}
            <ul class="log">
              {#each past as c (c.event + c.week)}
                <li>
                  <span class="w">W{c.week}</span>
                  <span>{c.label}{c.leaveDays ? ` — ${fillSportsCopy(copy.calendar.leave, { days: c.leaveDays })}` : ""}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <h3>{copy.calendar.upcoming}</h3>
          {#if upcoming.length === 0}
            <p class="empty">{copy.calendar.emptyUpcoming}</p>
          {:else}
            <ul class="log">
              {#each upcoming as c, i (c.event + c.week)}
                <li class:next={i === 0}>
                  <span class="w">W{c.week}</span>
                  <span>
                    {c.label}{c.leaveDays ? ` — ${fillSportsCopy(copy.calendar.leave, { days: c.leaveDays })}` : ""}
                    <span class="ahead"> · {fillSportsCopy(copy.calendar.ahead, { n: c.week - week })}</span>
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="card">
    <h2>{copy.news.title} <span>· {copy.news.lead}</span></h2>
    {#if news.length === 0}
      <p class="empty">{copy.news.empty}</p>
    {:else}
      <ul class="news">
        {#each newsShown as m (m.id)}
          <li class:unread={m.readAt === null}>
            <span class="w">{m.createdAt}</span>
            <span class="txt"><b>{m.subject}</b><small>{m.preview}</small></span>
          </li>
        {/each}
      </ul>
      {#if newsRest > 0}
        <p class="empty">{fillSportsCopy(copy.news.more, { n: newsRest })}</p>
      {/if}
    {/if}
  </div>
</section>

<style>
  .sports { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .head {
    background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--mil, #4B5A3A);
    border-radius: var(--radius); padding: 12px 14px;
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px 16px; align-items: center; color: var(--ink);
  }
  .who { min-width: 0; }
  h1 { margin: 0; font-size: 16px; font-weight: 800; color: var(--t-dark); letter-spacing: -.01em; }
  .sub { color: var(--ink-mid); font-size: 12.5px; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chip { display: inline-block; background: var(--panel-sunk); color: var(--ink-mid); border-radius: var(--radius); padding: 1px 7px; font-weight: 700; font-size: 11.5px; }
  .meta { color: var(--ink-mute); font-size: 11.5px; }
  .svc { text-align: right; font-variant-numeric: tabular-nums; }
  .svc .cap { font-size: 11px; color: var(--ink-mute); font-weight: 700; letter-spacing: .04em; }
  .svc .big { font-size: 22px; font-weight: 800; color: var(--t-dark); line-height: 1.15; }
  .svc .big.done { font-size: 14px; color: var(--ok); }
  .svc .big small { font-size: 12px; color: var(--ink-mute); font-weight: 600; margin-left: 2px; }
  .svc .of { color: var(--ink-mute); font-size: 11.5px; }
  .bar { height: 6px; background: var(--panel-sunk); border-radius: 3px; overflow: hidden; grid-column: 1 / -1; }
  .bar i { display: block; height: 100%; background: var(--ok); }
  .gauges { grid-column: 1 / -1; margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 10px; }
  .gauges div { display: flex; gap: 6px; align-items: baseline; }
  .gauges dt { color: var(--ink-mute); font-size: 11.5px; }
  .gauges dd { margin: 0; color: var(--ink); font-size: 12px; font-weight: 700; }

  .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; min-width: 0; color: var(--ink); }
  .card.nogame { border-left: 4px solid var(--warn); }
  h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-mute); font-weight: 700; }
  h2 span { text-transform: none; letter-spacing: 0; font-weight: 500; }
  h3 { margin: 0 0 4px; font-size: 11.5px; color: var(--ink-mid); font-weight: 700; }
  .card p { margin: 0; font-size: 12.5px; line-height: 1.6; }
  .card p.note { margin-top: 6px; color: var(--ink-mute); font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
  .log, .news { font-size: 12px; margin: 0; padding-left: 0; list-style: none; }
  .log li { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px dashed var(--line); font-variant-numeric: tabular-nums; }
  .log li:last-child { border-bottom: 0; }
  .log li.next { font-weight: 800; color: var(--t-dark); }
  .w { color: var(--warn); font-weight: 700; }
  .ahead { color: var(--ink-mute); }
  .news li { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 5px 0; border-bottom: 1px dashed var(--line); }
  .news li:last-child { border-bottom: 0; }
  .news .txt { min-width: 0; }
  .news b { font-weight: 700; color: var(--ink); }
  .news li.unread b { color: var(--t-dark); }
  .news small { display: block; color: var(--ink-mute); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { color: var(--ink-mute); font-size: 12px; margin: 0; }
  @media (max-width: 720px) { .head { grid-template-columns: 1fr; } .svc { text-align: left; } }
</style>
