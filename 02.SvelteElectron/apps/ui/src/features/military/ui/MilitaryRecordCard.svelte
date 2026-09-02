<script lang="ts">
  import type { MilitaryRecord } from "../../../shared/types/militaryLife";
  import { relationLabel } from "../../../shared/types/relationship";

  /**
   * 군 경력 한 장 (PLAN_MILITARY_LIFE §30) — 전역 때 `militaryLife` 를 접어 만든 `protagonist.militaryRecord` 를 그린다.
   *
   * 🔴 2026-09-02 눈확인: A 가 record 를 만들어 두었는데(applyMilitaryDischarge) **읽는 화면이 한 곳도 없었다.**
   *   §22 "전역 뒤 군 경력 한 장은 나 > 상태 > 기록 과 인생 기록(결산)에서 본다" — 두 자리가 이 카드를 쓴다.
   *   값은 record 에 이미 접혀 있다 — 여기서 다시 계산하지 않는다.
   */
  export let record: MilitaryRecord;
  /** 결산 화면은 제목을 자기 절 머리로 그린다 */
  export let showTitle = true;

  $: conv = record.conversion;
  $: convText = conv.statDelta === 0 && conv.velocityDelta === 0
    ? "능력치 그대로"
    : `능력치 ${conv.statDelta}${conv.velocityDelta ? ` · 구속 ${conv.velocityDelta}` : ""}`;
</script>

<div class="mil-record">
  {#if showTitle}<h3>군 경력</h3>{/if}
  <p class="unit">{record.unitName}{record.roleLabel ? ` · ${record.roleLabel}` : ""}{record.arcLabel && record.arcLabel !== record.roleLabel ? ` → ${record.arcLabel}` : ""}</p>
  <dl class="kv">
    <dt>전역 때 야구 감각</dt><dd>{record.finalBallSense} — {convText} · 회복 {conv.recoveryWeeks}주</dd>
    <dt>표창 · 징계</dt><dd>{record.awards.length} · {record.penalties.length}</dd>
    <dt>휴가</dt><dd>{record.leaveDays}일</dd>
    {#if record.perf.length > 0}
      <dt>성과</dt>
      <dd>{record.perf.map((x) => `W${x.week} ${x.note}`).join(" · ")}</dd>
    {/if}
    {#if record.topRelations.length > 0}
      <dt>관계 상위</dt>
      <dd>{record.topRelations.map((r) => `${r.name} ${r.value > 0 ? "+" : ""}${r.value} ${relationLabel(r.value).label}`).join(" · ")}</dd>
    {/if}
  </dl>
</div>

<style>
  /* 색을 못박지 않는다 — 결산 화면은 어두운 바탕이라 var(--ink) 를 박으면 글자가 사라진다(2026-09-02 눈확인). 부모 색을 잇고 명도만 낮춘다 */
  .mil-record { display: grid; gap: 6px; color: inherit; }
  h3 { margin: 0; font-size: 13px; color: inherit; }
  .unit { margin: 0; font-weight: 700; color: inherit; opacity: .9; font-size: 12.5px; }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; margin: 0; font-size: 12px; font-variant-numeric: tabular-nums; }
  .kv dt { color: inherit; opacity: .6; white-space: nowrap; }
  .kv dd { margin: 0; color: inherit; }
</style>
