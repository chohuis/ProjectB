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
  import { masterStore, teamsL10n } from "../../../shared/stores/master";
  import {
    careerTotalsOf, careerHighsOf, teamStintsOf, awardTallyOf, titleCountOf,
  } from "../../../shared/utils/careerSummary";
  import { militaryHistory } from "../../../shared/utils/playerTraits";
  import TeamMark from "../../team/ui/TeamMark.svelte";

  export let onClose: () => void;

  $: p = $gameStore.protagonist;
  $: records = p.careerRecords ?? [];

  $: totals = careerTotalsOf(records);
  $: highs = careerHighsOf(records);
  $: stints = teamStintsOf(records);
  $: awards = awardTallyOf(records);
  $: titles = titleCountOf(records);
  $: mil = militaryHistory(p.militaryStatus, p.militaryServedUnit);

  $: teamName = (id: string) =>
    ($teamsL10n ?? []).find((t) => t.id === id)?.name ?? id;

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
                ["이닝", totals.pitching.ip.toFixed(1)], ["탈삼진", totals.pitching.k],
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

      {/if}
    </div>

    <footer class="foot">
      <button class="close" on:click={onClose}>닫기</button>
    </footer>
  </section>
</div>

<style>
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
  .chip { margin: 0; font-size: 11px; letter-spacing: 0.12em; color: #7e97bd; text-transform: uppercase; }
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
    margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
    color: #7e97bd; text-transform: uppercase;
    padding-bottom: 6px; border-bottom: 1px solid #1b2740;
  }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(78px, 1fr)); gap: 8px; }
  .cell {
    display: grid; gap: 3px; justify-items: center;
    padding: 8px 4px; border-radius: 6px; background: #121c30;
  }
  .lbl { font-size: 10px; color: #7e97bd; }
  .val { font-size: 15px; color: #dce7f7; font-variant-numeric: tabular-nums; }

  .highs { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .high {
    display: flex; align-items: baseline; gap: 7px;
    padding: 8px 11px; border-radius: 6px; background: #121c30;
  }
  .h-lbl { font-size: 11px; color: #8aa0bf; flex: 1; }
  .h-val { font-size: 14px; color: #7fc99a; font-variant-numeric: tabular-nums; }
  .h-yr  { font-size: 11px; color: #62779a; font-variant-numeric: tabular-nums; }

  .awards { display: grid; gap: 6px; }
  .award { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
  .a-name { color: #dce7f7; }
  .a-cnt {
    font-size: 11px; font-weight: 700; color: #f0c65a;
    background: #241c06; border-radius: 10px; padding: 1px 7px;
  }
  .a-yrs { font-size: 11px; color: #62779a; font-variant-numeric: tabular-nums; }

  .stints { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .stints li {
    display: flex; align-items: center; gap: 9px;
    padding: 7px 10px; border-radius: 6px; background: #121c30;
  }
  .s-team { flex: 1; font-size: 13px; color: #dce7f7; }
  .s-span { font-size: 12px; color: #8aa0bf; font-variant-numeric: tabular-nums; }
  .s-n    { font-size: 11px; color: #62779a; min-width: 46px; text-align: right; }

  .foot {
    padding: 14px 26px; border-top: 1px solid #23324c;
    display: flex; justify-content: flex-end;
  }
  .close {
    border: 1px solid #3a4d70; background: #16233c; color: #cfe0f5;
    border-radius: 8px; padding: 9px 22px; font-size: 13px; font-weight: 700;
    cursor: pointer;
  }
  .close:hover { background: #1d2d4a; }
</style>
