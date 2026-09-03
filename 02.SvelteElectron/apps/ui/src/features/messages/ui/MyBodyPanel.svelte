<script lang="ts">
  import type { MyBodyMetadata } from "../../../shared/types/main";
  import { teamMap } from "../../../shared/stores/master";
  import { buildMyBodyRows, MY_BODY_LABEL, ABSENCE_REASON_LABEL } from "../../../shared/utils/myBodyReportView";

  /**
   * 몸 상태 월간 리포트 — 대시보드 갈래.
   *
   * NPC 월간 부상(`InjuryPanel`)과 **같은 꼴의 표**지만 데이터가 다르다.
   * 저쪽은 「사람 목록」이고 이쪽은 「내 한 달」이다 — `MyBodyMetadata` 주석이
   * 규격을 합치지 말라고 못박아 뒀다.
   *
   * ⚠ **문장을 안 그린다.** 부제·대시 설명 없이 항목 이름과 값만이다.
   *   본문 텍스트(`body`)는 소식이 이미 들고 있고, 이 칸은 그걸 대신한다.
   *
   * ⚠ 행을 만드는 자리는 `shared/utils/myBodyReportView.ts` 하나다 —
   *   여기서 만들면 검사가 한 줄도 못 잰다(vitest 가 `environment: "node"`).
   */

  export let metadata: MyBodyMetadata;

  $: rows = buildMyBodyRows(metadata);

  function teamName(id: string | null): string {
    if (!id) return "—";
    return $teamMap.get(id)?.name ?? "(사라진 팀)";
  }
</script>

<div class="mb">
  <div class="cards">
    {#if rows.injury}
      <div class="card bad">
        <span class="ck">{MY_BODY_LABEL.injury}</span>
        <span class="cv">{rows.injury.name}</span>
        <span class="cs">{rows.injury.severity} · W{rows.injury.sinceWeek} · {rows.injury.weeksLeft}주</span>
      </div>
    {/if}
    <div class="card">
      <span class="ck">{MY_BODY_LABEL.absence}</span>
      <span class="cv u-num">{rows.counts.absence}</span>
    </div>
    <div class="card">
      <span class="ck">{MY_BODY_LABEL.warning}</span>
      <span class="cv u-num">{rows.counts.warning}</span>
    </div>
  </div>

  {#if rows.absences.length > 0}
    <section class="blk">
      <h4>{MY_BODY_LABEL.absence}</h4>
      <table class="rows">
        <thead>
          <tr>
            <th class="c-wk">{MY_BODY_LABEL.week}</th>
            <th class="c-opp">{MY_BODY_LABEL.opponent}</th>
            <th class="c-why">{MY_BODY_LABEL.reason}</th>
            <th class="c-num">{MY_BODY_LABEL.condition}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows.absences as a (`${a.week}-${a.opponentTeamId ?? ""}`)}
            <tr>
              <td class="c-wk u-num">W{a.week}</td>
              <td class="c-opp">{teamName(a.opponentTeamId)}</td>
              <td class="c-why">{ABSENCE_REASON_LABEL[a.reason]}</td>
              <td class="c-num u-num">{a.condition ?? "—"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  {#if rows.warnings.length > 0}
    <section class="blk">
      <h4>{MY_BODY_LABEL.warning}</h4>
      <table class="rows">
        <thead>
          <tr>
            <th class="c-wk">{MY_BODY_LABEL.week}</th>
            <th class="c-num">{MY_BODY_LABEL.fatigue}</th>
            <th class="c-num">{MY_BODY_LABEL.risk}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows.warnings as w (w.week)}
            <tr>
              <td class="c-wk u-num">W{w.week}</td>
              <td class="c-num u-num">{w.fatigue ?? "—"}</td>
              <td class="c-num u-num">{w.riskPct != null ? `${w.riskPct}%` : "—"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>

<style>
  .mb { display: flex; flex-direction: column; gap: 10px; }

  .cards { display: flex; flex-wrap: wrap; gap: 8px; }
  .card {
    display: flex; flex-direction: column; gap: 2px; min-width: 76px;
    border: 1px solid var(--line); border-radius: var(--radius);
    background: var(--panel-sunk); padding: 7px 10px;
  }
  .card.bad { border-color: var(--bad); }
  .ck { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; color: var(--ink-mute); }
  .cv { font-size: 14px; font-weight: 700; color: var(--ink); }
  .cs { font-size: 11px; color: var(--ink-mid); }

  .blk { display: flex; flex-direction: column; gap: 5px; }
  .blk h4 {
    margin: 0; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; color: var(--ink-mute);
  }

  .rows { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .rows th {
    text-align: left; font-size: 10px; font-weight: 800; letter-spacing: 0.06em;
    color: var(--ink-mute); padding: 0 6px 5px; border-bottom: 1px solid var(--line);
  }
  .rows td { padding: 5px 6px; border-bottom: 1px solid var(--line); color: var(--ink-mid); }
  .rows tbody tr:hover { background: var(--panel-sunk); }

  .c-wk { width: 52px; }
  .c-why { width: 74px; }
  /* 오른쪽 정렬은 숫자 칸만이다 — 이름 칸까지 밀면 표가 가운데서 갈린다 */
  .c-num { width: 78px; text-align: right; }
  .c-opp { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
