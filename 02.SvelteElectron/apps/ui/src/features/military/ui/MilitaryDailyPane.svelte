<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { nextPendingAction } from "../../../shared/stores/season";
  import type { MessageItem } from "../../../shared/types/main";
  import type {
    MilitaryCalendarEntry, MilitaryLifeRules, MilitaryLifeState, MilitaryMember, MilitaryUnit, MilitaryWeekChoice,
  } from "../../../shared/types/militaryLife";
  import { rankBandOf } from "../../../shared/types/militaryLife";
  import { calendarEntryFor, presentMembers } from "../../../shared/utils/militaryLifeRules";
  import { signed } from "./militaryLabels";

  /**
   * 일과 (§27 · §32) — 자원 셋 · 이번 주 선택 카드 셋 · 이벤트 자리 · 이번 달 부대 소식.
   *
   * ⚠ 선택은 **다음 주**(week + 1) 것이다 — 주간 루프가 `militaryServiceWeeks` 를 +1 한 뒤 `nextChoice` 를 읽는다.
   *   그래서 훈련소·휴가·noChoice 판정도 week + 1 로 본다. 카드를 누르면 `nextChoice` 에 적어 둘 뿐이고
   *   진행은 상단 버튼이 한다. 효과 값은 전부 rules 에서 읽어 그대로 적는다(숨기지 않는다).
   */
  export let ml: MilitaryLifeState;
  export let rules: MilitaryLifeRules;
  export let unit: MilitaryUnit;
  export let members: MilitaryMember[];
  export let calendar: MilitaryCalendarEntry[];
  export let week: number;
  export let fatigue: number;
  export let morale: number;
  export let mailbox: MessageItem[];

  $: nextWeek = week + 1;
  $: role = unit.roles.find((r) => r.id === ml.roleId) ?? null;
  $: ballAccess = role?.ballAccess ?? 0;
  $: cap = 100 - rules.ballSense.capPerAccessGap * (3 - ballAccess);
  $: band = rankBandOf(nextWeek, rules.rankBandWeeks);
  $: bootCamp = nextWeek <= rules.bootCampWeeks;
  $: cal = calendarEntryFor(calendar, nextWeek, ml.roleId);
  $: discharged = nextWeek > rules.serviceWeeks;
  $: noChoiceReason = discharged ? "다음 주가 전역이다"
    : bootCamp ? `훈련소 (W1~${rules.bootCampWeeks}) — 일과가 전부다`
    : cal?.leaveDays ? `휴가 주 — ${cal.label} ${cal.leaveDays}일`
    : cal?.noChoice ? `${cal.label} — 이 주는 부대가 다 가져간다`
    : null;
  $: present = presentMembers(members, nextWeek);
  $: atCap = ml.ballSense >= cap;
  $: injuryWarn = fatigue >= rules.fatigue.injuryWarn;
  $: sense = Math.round(ml.ballSense);
  $: eventPending = $nextPendingAction?.type === "event";
  // 마지막 "이번 달 부대 소식" — id 접두어로 고른다 (usecases/militaryLife.ts 가 붙인 `msg-mil-digest-`)
  $: digest = [...mailbox].reverse().find((m) => m.id.startsWith("msg-mil-digest-")) ?? null;
  $: digestLines = digest ? digest.body.split("\n").filter(Boolean) : [];

  $: peopleGain = rules.relation.peopleByBand[Math.min(band, rules.relation.peopleByBand.length - 1)] ?? 0;
  $: ballGain = rules.ballSense.gainByAccess[Math.min(ballAccess, rules.ballSense.gainByAccess.length - 1)] ?? 0;

  function pick(choice: MilitaryWeekChoice) {
    if (noChoiceReason) return;
    gameStore.setMilitaryLife({ ...ml, nextChoice: choice });
  }
</script>

<div class="grid">
  <div class="card">
    <h2>자원 셋 <span>· 주간 계산은 Rust</span></h2>
    <div class="res">
      <span class="lbl">피로</span>
      <div class="trk"><i style="width:{Math.max(0, Math.min(100, fatigue))}%;background:var(--warn)"></i></div>
      <span class="val">{Math.round(fatigue)}</span>
    </div>
    <div class="res">
      <span class="lbl">사기</span>
      <div class="trk"><i style="width:{Math.max(0, Math.min(100, morale))}%;background:var(--t-dark)"></i></div>
      <span class="val">{Math.round(morale)}</span>
    </div>
    <div class="res">
      <span class="lbl">야구 감각</span>
      <div class="trk"><i style="width:{Math.max(0, Math.min(100, sense))}%;background:var(--t-accent)"></i><span class="cap" style="left:{cap}%" title="상한 {cap}"></span></div>
      <span class="val">{sense}</span>
    </div>
    <p class="hint">
      피로는 낮을수록 좋다. 감각은 매주 −{rules.ballSense.weeklyDecay} · 공 접근 {ballAccess} → 상한 {cap}(눈금).
      전역 때 이 값 하나로 능력치를 환산한다 — 복무 중엔 능력치를 안 건드린다.
    </p>
  </div>

  <div class="card">
    <h2>이번 달 부대 소식 <span>· 4주마다 한 통</span></h2>
    {#if digest}
      <p class="when">{digest.createdAt}</p>
      <ul class="news">
        {#each digestLines as line}<li>{line}</li>{/each}
      </ul>
    {:else}
      <p class="empty">아직 없다 — 복무 4주째에 첫 통이 온다.</p>
    {/if}
  </div>
</div>

<div class="card block">
  <h2>이번 주 선택 <span>· W{nextWeek} · 셋 중 하나 — 일과는 부대가 정하고, 고르는 건 남는 시간</span></h2>
  {#if noChoiceReason}
    <p class="nochoice">이번 주는 선택이 없다 — {noChoiceReason}</p>
  {:else}
    <div class="choices">
      {#if ballAccess >= 1}
        <button type="button" class="choice" class:pick={ml.nextChoice === "ball"} class:warn={injuryWarn} on:click={() => pick("ball")}>
          <b>ㄱ. 공을 만진다</b>
          {#if injuryWarn}
            <!-- §27 — 피로가 문턱(rules.fatigue.injuryWarn) 이상이면 띠. 부상 자체는 §28 조건부 이벤트가 맡는다 · 확률 부상은 없다 -->
            <span class="band">부상 위험 — 피로 {Math.round(fatigue)} ≥ {rules.fatigue.injuryWarn}</span>
          {/if}
          <span class="fx">
            {#if atCap}감각 <em>상한 — 오르지 않는다</em>{:else}감각 <em>{signed(ballGain)}</em>{/if} · 피로 {signed(rules.fatigue.choice.ball)}
            <small>공 접근 {ballAccess} · 상한 {cap}</small>
          </span>
        </button>
      {/if}
      {#if present.length >= 1}
        <button type="button" class="choice" class:pick={ml.nextChoice === "people"} on:click={() => pick("people")}>
          <b>ㄴ. 사람과 지낸다</b>
          <span class="fx">
            부대원 1~2명 관계 <em>{signed(peopleGain)}</em> · 사기 {signed(rules.morale.choice.people ?? 0)} · 피로 {signed(rules.fatigue.choice.people)}
            <small>같은 소단위 가중 ×{rules.relation.sameSubunitWeight} · 계급이 오르면 폭이 커진다</small>
          </span>
        </button>
      {/if}
      <button type="button" class="choice" class:pick={ml.nextChoice === "rest"} on:click={() => pick("rest")}>
        <b>ㄷ. 쉰다</b>
        <span class="fx">
          피로 <em>{signed(rules.fatigue.choice.rest)}</em> · 사기 {signed(rules.morale.choice.rest ?? 0)}
          <small>기본값 — 고르지 않으면 쉰다</small>
        </span>
      </button>
    </div>
    <p class="hint">
      {#if ml.nextChoice}골라 뒀다 — 진행하면 W{nextWeek}에 적용된다.{:else}아직 안 골랐다 — 진행하면 쉰다.{/if}
      {#if ballAccess === 0 && !role} 보직이 정해지기 전이라 공 카드가 없다.{/if}
    </p>
  {/if}
</div>

<div class="card block event" class:live={eventPending}>
  <h2>이번 주 이벤트 <span>· 주 {Math.round(rules.event.weeklyChance * 100)}% 한 건 · 쿨다운 {rules.event.defaultCooldown}주</span></h2>
  {#if eventPending}
    <p class="t">이벤트가 기다린다 — 이 화면 위에 뜬 창에서 고른다.</p>
  {:else}
    <p class="empty">이번 주엔 없다.</p>
  {/if}
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; min-width: 0; color: var(--ink); }
  .block { margin-top: 10px; }
  h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-mute); font-weight: 700; }
  h2 span { text-transform: none; letter-spacing: 0; font-weight: 500; }
  .res { display: grid; grid-template-columns: 76px 1fr 44px; gap: 8px; align-items: center; margin: 6px 0; font-variant-numeric: tabular-nums; }
  .res .lbl { font-weight: 700; color: var(--ink-mid); }
  .res .trk { height: 8px; background: var(--panel-sunk); border-radius: 4px; overflow: visible; position: relative; }
  .res .trk i { display: block; height: 100%; border-radius: 4px; }
  .res .trk .cap { position: absolute; top: -3px; width: 2px; height: 14px; background: var(--ink-mute); }
  .res .val { text-align: right; font-weight: 800; }
  .hint { color: var(--ink-mute); font-size: 11.5px; margin: 6px 0 0; line-height: 1.5; }
  .empty { color: var(--ink-mute); font-size: 12px; margin: 0; }
  .when { color: var(--ink-mute); font-size: 11px; margin: 0 0 4px; }
  .news { font-size: 12px; color: var(--ink-mid); margin: 0; padding-left: 16px; }
  .news li { margin: 3px 0; }
  .choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .choice {
    display: grid; gap: 4px; text-align: left; font: inherit; cursor: pointer;
    border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 10px; background: var(--panel-sunk); color: var(--ink);
  }
  .choice:hover { border-color: var(--t-dark); }
  .choice.pick { border-color: var(--t-accent); background: var(--panel); box-shadow: inset 0 0 0 1px var(--t-accent); }
  .choice b { display: block; font-size: 13px; color: var(--t-dark); }
  .choice .fx { color: var(--ink-mid); font-size: 11.5px; }
  .choice .fx em { font-style: normal; color: var(--t-accent); font-weight: 700; }
  .choice .fx small { display: block; color: var(--ink-mute); margin-top: 2px; }
  .choice.warn { border-color: var(--bad); }
  .choice .band { display: inline-block; justify-self: start; background: rgba(179, 49, 31, 0.10); color: var(--bad); border: 1px solid var(--bad); border-radius: var(--radius); padding: 1px 7px; font-size: 11px; font-weight: 800; }
  .nochoice { margin: 0; color: var(--ink-mid); font-size: 13px; font-weight: 700; }
  .event { border-left: 3px solid var(--line-strong); }
  .event.live { border-left-color: var(--warn); }
  .event .t { margin: 0; font-weight: 800; color: var(--ink); font-size: 13px; }
  @media (max-width: 720px) { .choices { grid-template-columns: 1fr; } }
</style>
