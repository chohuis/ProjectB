<!--
  커리어 결산 — 은퇴 화면. (U9-d)

  ⚠ **여기가 U9 조사에서 제일 큰 구멍이었다.**
  15~20시즌을 플레이한 결말이 `StatusPage`의 두 줄이었다:
      "선수 생활 / 2047년 은퇴 — 통산 19시즌"
  그 19시즌치 기록은 `careerRecords`에 전부 남아 있는데 아무도 안 읽었다.

  자동으로 한 번 뜨고(은퇴 직후), 그 뒤엔 나 > 상태에서 다시 열 수 있다.
  "봤는가" 플래그를 세이브에 새로 넣지 않는다 — 은퇴 모달이 그대로 이 화면으로
  바뀌므로 그 순간이 곧 첫 관람이고, 재관람은 사용자가 누를 때다.
-->
<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { ipLabel } from "../../../shared/utils/baseballFormat";
  import { masterStore, teamsL10n } from "../../../shared/stores/master";
  import {
    careerTotalsOf, careerHighsOf, teamStintsOf, awardTallyOf, titleCountOf,
  } from "../../../shared/utils/careerSummary";
  import { militaryHistory } from "../../../shared/utils/playerTraits";
  import TeamMark from "../../team/ui/TeamMark.svelte";

  import { onMount } from "svelte";
  import { slotRepo } from "../../../shared/repo/slotRepo";
  // 🔴 **값을 숫자로 노출하지 않는다** — `Relationship.value` 주석이 그렇게 못박아 뒀다.
  //    "−100~+100. 플레이어에게 숫자로 노출하지 않는다 — 라벨만 보여준다"
  import { relationLabel } from "../../../shared/types/relationship";
  // 🔴 **화면마다 번역표를 만들지 않는다.** `careerEventLabel.ts` 머리말이
  //    그 결함(코드가 화면에 새는 것)을 이미 적어 뒀다
  import { careerEventLabel } from "../../../shared/utils/careerEventLabel";
  import { isV3SlotActive } from "../../../shared/repo/v3Mode";

  export let onClose: () => void;

  /**
   * **커리어를 끝내고 타이틀로 나간다.** 없으면 그 버튼을 안 그린다.
   *
   * 🔴 예전엔 이 길이 없었다. 은퇴 결산을 닫으면 **은퇴한 주인공인 채로**
   *   메인 화면에 남았고, 게임 안에 타이틀로 돌아가는 길이 하나도 없었다.
   *   `App.svelte` 부터 `onSeasonEnd` 이 배선돼 있었는데 `SeasonEndModal`
   *   에서 끊겨 아무도 안 불렀다(2026-09-01 실측).
   *
   * ⚠ **`나 > 상태`에서 다시 열 때는 안 넘긴다.** 기록을 다시 보러 온
   *   것이므로 거기서 타이틀로 튕기면 안 된다.
   */
  export let onExit: (() => void) | null = null;

  // 아래로 잇는다 — 한 장 요약은 그대로 두고 상세를 접어서 붙인다.
  // 탭으로 쪼개지 않은 이유: 위쪽이 이미 "한 장으로 읽히는" 결산이라
  // 나누면 그 완성도가 깨진다(사용자 확정 2026-08-24).
  let showYears = false;

  // 관계는 slot.db에 있고 조회가 비동기다 — 화면이 열릴 때 한 번만 읽는다.
  // ⚠ **지금 관계 데이터는 숫자뿐이다.** 이름·역할·마지막 값만 담백하게 놓고
  //   서술은 안 붙인다 — 문장 뱅크를 새로 만들지 않는다는 결정을 따른다.
  let relRows: import("../../../shared/types/relationship").Relationship[] = [];
  onMount(async () => {
    const g = $gameStore;
    if (!isV3SlotActive() || !g.currentSlotId) return;
    try { relRows = await slotRepo.getRelationships(g.currentSlotId); }
    catch { relRows = []; }   // 조회가 실패해도 결산은 떠야 한다
  });

  $: p = $gameStore.protagonist;
  $: records = p.careerRecords ?? [];

  $: totals = careerTotalsOf(records);
  $: highs = careerHighsOf(records);
  $: stints = teamStintsOf(records);
  $: awards = awardTallyOf(records);
  $: titles = titleCountOf(records);
  $: mil = militaryHistory(p.militaryStatus, p.militaryServedUnit);

  // 연도 오름차순 — 데뷔부터 은퇴까지 읽히게 한다
  $: byYear = [...records].sort((a, b) => a.year - b.year);

  // ── 주요 사건 ──────────────────────────────────────────────────
  //
  // ⚠ **`careerRecords`가 아니라 `careerEvents`다.** 시즌 성적과 달리 사건은
  //   시즌 밖에서도 일어난다 — 대학 졸업·입대·병역 면제는 출전 기록이 한 줄도
  //   없는 해에 남는다. 통산 표에서는 그 해가 통째로 빈칸이다.
  //
  // 🔴 그래서 이 절만 `records.length === 0` **바깥**에 둔다. 아마추어에서
  //   그만둔 커리어는 통산 표가 비지만 졸업·중단 사건은 남아 있고, 안쪽에
  //   두면 그 커리어의 결말이 "기록을 남기지 못했습니다" 한 문장으로 끝난다.
  $: events = [...(p.careerEvents ?? [])].sort((a, b) => a.year - b.year);

  // 포스트시즌 라벨. `psResult`가 없으면 그 해는 아무것도 안 적는다
  const PS: Record<string, string> = {
    champion: "우승", runnerUp: "준우승", semiFinal: "PO", notQualified: "",
  };

  // 관계는 값이 큰 순으로 — 이름·역할·마지막 값만
  const KIND: Record<string, string> = {
    manager: "감독", coach: "코치", teammate: "동료", owner: "구단주",
  };
  /**
   * 🔴 **`npcs` 를 뒤지면 안 됐다** (2026-09-01 눈확인에서 드러났다).
   *
   *   코치·감독은 `npcs` 에 없다 — 스태프는 따로 산다. 그래서 결산의 `사람`
   *   절에 **`staff:<고교 팀 id>` 같은 원문 id 가 그대로 떴다.**
   *   폴백이 원문이면 안 된다는 건 `careerEventLabel.ts` 머리말이 이미
   *   못박은 결함 모양이고, 지시서의 "이름은 조회해서 읽어라"에도 어긋난다.
   *
   * ⚠ **조회할 필요가 없다.** `Relationship` 은 person VIEW 조인에서 `name`
   *   을 이미 받아 온다. `PeoplePage` 도 그걸 쓴다 — 없으면 역할명으로
   *   대체한다(은퇴 등으로 VIEW 에서 사라진 상대).
   */
  $: relName = (r: import("../../../shared/types/relationship").Relationship) =>
    r.name || `(${KIND[r.kind] ?? "인물"})`;

  $: relTop = [...relRows]
    .filter((r) => (r.value ?? 0) !== 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  /**
   * ⚠ **폴백이 원문 id 였다.** 해체·이름 변경으로 목록에 없는 팀이면
   *   대학 팀 id 원문(영문)이 화면에 샜다. `LeaguePage` 는
   *   같은 문제를 `(기록 없음)` 으로 이미 막아 뒀다 — 같게 맞춘다.
   */
  const GONE = "(기록 없음)";
  $: teamName = (id: string) =>
    ($teamsL10n ?? []).find((t) => t.id === id)?.name ?? (id ? GONE : "");

  const REASON: Record<string, string> = {
    voluntary: "자발적 은퇴",
    decline:   "노쇠 · 계약 불발",
    injury:    "부상",
  };
  $: reasonText = REASON[p.retirement?.reason ?? ""] ?? "은퇴";

  /**
   * 마지막 소속. **`p.teamId`를 쓰지 않는다** — 은퇴하며 방출되면 비어 있을 수
   * 있고, 그러면 20년 뛴 팀 대신 빈칸이 결산 맨 위에 온다.
   */
  $: lastTeamId = stints.length > 0 ? stints[stints.length - 1].teamId : p.teamId;

  /** 통산 성적 한 줄 — 투수면 승-패·ERA, 타자면 타율·홈런 */
  $: headline = (() => {
    const t = totals.pitching;
    const b = totals.batting;
    if (t && (t.g > 0 || t.ip > 0)) {
      return [`${t.w}승 ${t.l}패`, t.sv > 0 ? `${t.sv}세이브` : "", `ERA ${t.era}`]
        .filter(Boolean).join(" · ");
    }
    if (b && b.ab > 0) {
      return [`타율 ${b.avg}`, `${b.hr}홈런`, `${b.rbi}타점`].join(" · ");
    }
    return "";
  })();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="overlay">
  <section class="sheet">

    <header class="head">
      <p class="chip">{p.retirement?.year ?? ""}년 · {reasonText}</p>
      <h2>
        {#if lastTeamId}<TeamMark teamId={lastTeamId} size={30} />{/if}
        <span>{p.name}</span>
      </h2>
      <p class="span">
        {#if totals.firstYear != null}
          {totals.firstYear}–{totals.lastYear} · 통산 {totals.seasons}시즌
        {:else}
          기록된 시즌 없음
        {/if}
        {#if mil}<span class="sep">·</span>{mil.text}{/if}
      </p>
      {#if headline}<p class="headline">{headline}</p>{/if}
    </header>

    <div class="body">

      {#if records.length === 0}
        <!-- 아마추어 단계에서 그만둔 경우. 통산 표를 빈칸으로 그리지 않는다 -->
        <p class="empty">
          정규 시즌 기록을 남기지 못하고 선수 생활을 마쳤습니다.
        </p>
      {:else}

        <!-- 우승 — 있으면 제일 위. 커리어에서 제일 큰 사실이다 -->
        {#if titles.champion > 0}
          <div class="titles">
            <strong>🏆 우승 {titles.champion}회</strong>
            <span class="years">{titles.championYears.join(" · ")}</span>
          </div>
        {/if}

        <!-- 통산 -->
        <section class="sec">
          <h3>통산 기록</h3>
          {#if totals.pitching}
            <div class="grid">
              {#each [
                ["경기", totals.pitching.g], ["선발", totals.pitching.gs],
                ["승", totals.pitching.w], ["패", totals.pitching.l],
                ["세이브", totals.pitching.sv], ["홀드", totals.pitching.hd],
                ["이닝", ipLabel(totals.pitching.ip)], ["탈삼진", totals.pitching.k],
                ["볼넷", totals.pitching.bb], ["자책", totals.pitching.er],
                ["ERA", totals.pitching.era], ["WHIP", totals.pitching.whip],
              ] as [string, string | number][] as [lbl, val]}
                <div class="cell"><span class="lbl">{lbl}</span><b class="val">{val}</b></div>
              {/each}
            </div>
          {/if}
          {#if totals.batting}
            <div class="grid">
              {#each [
                ["경기", totals.batting.g], ["타석", totals.batting.pa],
                ["안타", totals.batting.h], ["홈런", totals.batting.hr],
                ["타점", totals.batting.rbi], ["도루", totals.batting.sb],
                ["도루자", totals.batting.cs ?? 0],
                ["타율", totals.batting.avg], ["출루", totals.batting.obp],
                ["장타", totals.batting.slg], ["OPS", totals.batting.ops],
              ] as [string, string | number][] as [lbl, val]}
                <div class="cell"><span class="lbl">{lbl}</span><b class="val">{val}</b></div>
              {/each}
            </div>
          {/if}
        </section>

        <!-- 커리어 하이 -->
        {#if highs.length > 0}
          <section class="sec">
            <h3>커리어 하이</h3>
            <div class="highs">
              {#each highs as h}
                <div class="high">
                  <span class="h-lbl">{h.label}</span>
                  <b class="h-val">{h.value}</b>
                  <span class="h-yr">{h.year}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <!-- 수상 -->
        {#if awards.length > 0}
          <section class="sec">
            <h3>수상</h3>
            <div class="awards">
              {#each awards as a}
                <div class="award">
                  <b class="a-name">{a.label}</b>
                  {#if a.count > 1}<span class="a-cnt">{a.count}회</span>{/if}
                  <span class="a-yrs">{a.years.join(" · ")}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <!-- 소속 이력 -->
        {#if stints.length > 0}
          <section class="sec">
            <h3>소속</h3>
            <ol class="stints">
              {#each stints as s}
                <li>
                  <TeamMark teamId={s.teamId} size={20} />
                  <span class="s-team">{teamName(s.teamId)}</span>
                  <span class="s-span">
                    {s.fromYear}{#if s.toYear !== s.fromYear}–{s.toYear}{/if}
                  </span>
                  <span class="s-n">{s.seasons}시즌</span>
                </li>
              {/each}
            </ol>
          </section>
        {/if}

        <!-- 연도별 — 접어 둔다. 한 장 요약을 먼저 읽고 원하면 펼친다 -->
        {#if byYear.length > 0}
          <section class="sec">
            <button class="yr-toggle" on:click={() => (showYears = !showYears)}>
              연도별로 보기 {showYears ? "▲" : "▼"}
              <span class="yr-n">{byYear.length}시즌</span>
            </button>
            {#if showYears}
              <ol class="years">
                {#each byYear as r}
                  <li class="yr">
                    <div class="yr-head">
                      <span class="yr-y">{r.year}</span>
                      <TeamMark teamId={r.teamId} size={16} />
                      <span class="yr-t">{teamName(r.teamId)}</span>
                      {#if r.rank}
                        <span class="yr-rank">{r.rank}위{#if r.totalTeams}/{r.totalTeams}{/if}</span>
                      {/if}
                      {#if r.psResult && PS[r.psResult]}
                        <span class="yr-ps">{PS[r.psResult]}</span>
                      {/if}
                    </div>
                    {#if r.statLine}<div class="yr-stat">{r.statLine}</div>{/if}
                    {#if r.awards?.length}
                      <div class="yr-awards">
                        {#each r.awards as a}<span class="yr-aw">{a.label}</span>{/each}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ol>
            {/if}
          </section>
        {/if}

      {/if}

      <!-- 주요 사건 — 위 분기 바깥이다. 통산 기록이 없어도 사건은 있다 -->
      {#if events.length > 0}
        <section class="sec">
          <h3>주요 사건</h3>
          <ol class="events">
            {#each events as e}
              <li class="ev">
                <span class="ev-y">{e.year}</span>
                <span class="ev-k">{careerEventLabel(e.eventType)}</span>
                {#if e.fromTeamId || e.toTeamId}
                  <span class="ev-t">
                    {#if e.fromTeamId}{teamName(e.fromTeamId)}{/if}
                    {#if e.fromTeamId && e.toTeamId}<span class="ev-ar">→</span>{/if}
                    {#if e.toTeamId}{teamName(e.toTeamId)}{/if}
                  </span>
                {/if}
                {#if e.detail}<span class="ev-d">{e.detail}</span>{/if}
              </li>
            {/each}
          </ol>
        </section>
      {/if}

        <!-- 사람 — **세 덩어리 뒤에 놓는다.** 요약·통산·사건이 결산의
             본문이고 관계는 덧붙이는 것이다 (사용자 확정 2026-09-01) -->
        {#if relTop.length > 0}
          <section class="sec">
            <h3>사람</h3>
            <ul class="rels">
              {#each relTop.slice(0, 8) as r}
                <li>
                  <span class="r-name">{relName(r)}</span>
                  <span class="r-kind">{KIND[r.kind] ?? r.kind}</span>
                  <span class="r-val" class:high={(r.value ?? 0) >= 60}>
                    {relationLabel(r.value).label}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

    </div>

    <footer class="foot">
      <!-- 나가는 길이 있을 때만 "둘러보기"다 — 없으면 그냥 닫는 것이다 -->
      <button class="close" on:click={onClose}>{onExit ? "둘러보기" : "닫기"}</button>
      {#if onExit}
        <button class="exit" on:click={onExit}>마치기</button>
      {/if}
    </footer>
  </section>
</div>

<style>
  /* 아래로 이은 세 절 — 위쪽 한 장 요약의 눈금을 그대로 쓴다 */
  .yr-toggle {
    width: 100%; display: flex; align-items: center; gap: 8px;
    background: none; border: 1px solid var(--line, #333); border-radius: 6px;
    color: inherit; font: inherit; padding: 8px 12px; cursor: pointer;
  }
  .yr-n { margin-left: auto; opacity: .6; font-size: .85em; }
  .years { list-style: none; margin: 10px 0 0; padding: 0; }
  .yr { padding: 8px 0; border-bottom: 1px solid var(--line-weak, #222); }
  .yr-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .yr-y { font-variant-numeric: tabular-nums; opacity: .8; min-width: 3.2em; }
  .yr-t { font-weight: 600; }
  .yr-rank { font-variant-numeric: tabular-nums; opacity: .7; font-size: .9em; }
  /* ⚠ `--accent-weak` 는 없는 토큰이었다 — 폴백만 먹혔고 글자색이 없어
       어두운 바탕에 어두운 글자가 됐다. 이 화면은 어두운 섬이라 토큰을
       안 쓰고 색을 직접 정한다 (위 머리말 규칙) */
  .yr-ps {
    font-size: .8em; padding: 1px 6px; border-radius: 4px;
    background: #1b2a1b; color: #7fc99a;
  }
  .yr-stat { margin-top: 3px; opacity: .85; font-variant-numeric: tabular-nums; font-size: .92em; }
  .yr-awards { margin-top: 3px; display: flex; gap: 4px; flex-wrap: wrap; }
  .yr-aw {
    font-size: .78em; padding: 1px 6px; border-radius: 4px;
    background: #241c06; color: #f0c65a;
  }
  .rels { list-style: none; margin: 0; padding: 0; }
  .rels li { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
  .r-name { font-weight: 600; }
  .r-kind { opacity: .6; font-size: .85em; }
  .r-val { margin-left: auto; font-variant-numeric: tabular-nums; opacity: .8; }
  .r-val.high { color: var(--good, #7ac47a); }
  /*
    은퇴 화면은 **어둡게 둔다.** 다른 화면이 밝은 것과 반대인데, 커리어가
    끝나는 자리라 톤이 다른 게 맞다. 대신 글자색을 전부 스스로 정해
    §5-5b 어두운 섬 검사를 통과시킨다.
  */
  .overlay {
    position: fixed; inset: 0; z-index: 260;
    background: rgba(4, 8, 16, 0.86);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .sheet {
    width: min(720px, 96vw); max-height: 90vh;
    display: flex; flex-direction: column;
    background: #0d1524; border: 1px solid #23324c; border-radius: 14px;
    overflow: hidden;
  }

  .head {
    padding: 22px 26px 18px;
    background: linear-gradient(180deg, #14203a 0%, #0d1524 100%);
    border-bottom: 1px solid #23324c;
  }
  /*
    ⚠ **자간을 한국어에 맞춘다.** 0.12em 은 라틴 소문자 기준이라 한글에서는
    글자가 흩어져 보인다. `text-transform: uppercase` 는 한글에 아무 일도
    안 하면서 라틴이 섞이면 그것만 튄다 — 둘 다 걷어낸다.
  */
  .chip { margin: 0; font-size: 11px; letter-spacing: 0.04em; color: #7e97bd; }
  .head h2 {
    margin: 7px 0 0; display: flex; align-items: center; gap: 10px;
    font-size: 26px; font-weight: 800; color: #eef4ff; letter-spacing: -0.02em;
  }
  .span { margin: 7px 0 0; font-size: 13px; color: #93aacb; }
  .sep { opacity: 0.45; margin: 0 6px; }
  .headline {
    margin: 10px 0 0; font-size: 16px; font-weight: 700; color: #e8b23c;
    font-variant-numeric: tabular-nums;
  }

  .body { padding: 20px 26px; overflow-y: auto; display: grid; gap: 20px; }
  .empty { margin: 0; color: #8aa0bf; font-size: 14px; }

  .titles {
    display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
    padding: 11px 14px; border-radius: 8px;
    background: #241c06; border: 1px solid #4a3a10;
  }
  .titles strong { font-size: 15px; color: #f0c65a; }
  .years { font-size: 12px; color: #b39a5e; font-variant-numeric: tabular-nums; }

  .sec { display: grid; gap: 10px; }
  .sec h3 {
    margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
    color: #7e97bd;
    padding-bottom: 6px; border-bottom: 1px solid #1b2740;
  }

  /*
    ⚠ **`auto-fit` 이 줄을 7+5 로 갈랐다.** 폭에 따라 한 줄에 몇 칸이 들어갈지
    달라져서 아래 줄이 늘 어중간했다. 여섯 열로 고정한다 —
    투수 12칸이 **6+6** 으로 딱 맞고, 타자 11칸은 6+5 다.
  */
  .grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
  .cell {
    display: grid; gap: 3px; justify-items: center;
    padding: 8px 4px; border-radius: 6px; background: #121c30;
  }
  .lbl { font-size: 10px; color: #7e97bd; }
  .val { font-size: 15px; color: #dce7f7; font-variant-numeric: tabular-nums; }

  /* 다섯 개가 4+1 로 갈려 마지막 한 칸이 외따로 떨어졌다 — 세 열이면 3+2 다 */
  .highs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .high {
    display: flex; align-items: baseline; gap: 7px;
    padding: 8px 11px; border-radius: 6px; background: #121c30;
  }
  /* 칸이 좁으면 "최다 이닝" 이 두 줄로 접혀 그 칸만 키가 커졌다 */
  .h-lbl { font-size: 11px; color: #8aa0bf; flex: 1; white-space: nowrap; }
  .h-val { font-size: 14px; color: #7fc99a; font-variant-numeric: tabular-nums; }
  .h-yr  { font-size: 11px; color: #62779a; font-variant-numeric: tabular-nums; }

  /*
    ⚠ **수상만 민무늬였다.** 소속·주요 사건은 카드 행인데 여기만 배경이 없어
    리듬이 끊기고, 연도를 오른쪽에 붙이자 이름과의 사이가 휑해 보였다.
    같은 카드로 맞추면 그 간격이 표처럼 읽힌다.
  */
  .awards { display: grid; gap: 6px; }
  .award {
    display: flex; align-items: center; gap: 8px; font-size: 13px;
    padding: 7px 10px; border-radius: 6px; background: #121c30;
  }
  .a-name { color: #dce7f7; }
  .a-cnt {
    font-size: 11px; font-weight: 700; color: #f0c65a;
    background: #241c06; border-radius: 10px; padding: 1px 7px;
  }
  /* 연도를 오른쪽에 붙여 줄마다 같은 자리에서 읽히게 한다 */
  .a-yrs {
    margin-left: auto; font-size: 11px; color: #62779a;
    font-variant-numeric: tabular-nums;
  }

  .stints { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .stints li {
    display: flex; align-items: center; gap: 9px;
    padding: 7px 10px; border-radius: 6px; background: #121c30;
  }
  .s-team { flex: 1; font-size: 13px; color: #dce7f7; }
  .s-span { font-size: 12px; color: #8aa0bf; font-variant-numeric: tabular-nums; }
  .s-n    { font-size: 11px; color: #62779a; min-width: 46px; text-align: right; }

  /* 주요 사건 — 연도를 왼쪽에 고정해 세로로 읽히게 한다 */
  .events { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .ev {
    display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;
    padding: 7px 10px; border-radius: 6px; background: #121c30;
  }
  .ev-y {
    font-size: 12px; color: #8aa0bf; font-variant-numeric: tabular-nums;
    min-width: 3.2em;
  }
  .ev-k { font-size: 13px; font-weight: 600; color: #dce7f7; }
  .ev-t { font-size: 12px; color: #93aacb; }
  .ev-ar { color: #62779a; margin: 0 4px; }
  /* 사유는 길다(졸업은 전공·학점·경로가 붙는다) — 줄을 넘겨서 다 보인다 */
  .ev-d { font-size: 11px; color: #62779a; flex: 1 1 100%; }

  .foot {
    padding: 14px 26px; border-top: 1px solid #23324c;
    display: flex; justify-content: flex-end; gap: 8px;
  }
  .close {
    border: 1px solid #3a4d70; background: #16233c; color: #cfe0f5;
    border-radius: 8px; padding: 9px 22px; font-size: 13px; font-weight: 700;
    cursor: pointer;
  }
  .close:hover { background: #1d2d4a; }
  /* 커리어를 끝내는 쪽이라 무게를 준다 — 되돌릴 수 없는 이동이다 */
  .exit {
    border: 1px solid #6b5220; background: #2a2008; color: #f0c65a;
    border-radius: 8px; padding: 9px 22px; font-size: 13px; font-weight: 700;
    cursor: pointer;
  }
  .exit:hover { background: #3a2c0c; }
</style>
