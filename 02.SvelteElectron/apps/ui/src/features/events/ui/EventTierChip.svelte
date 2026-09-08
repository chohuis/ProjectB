<script lang="ts">
  import { gradeChip, isCrisis, CRISIS_LABEL, type EventTheme } from "../../../shared/utils/eventTierCopy";
  import type { EventGrade } from "../../../shared/utils/tierRules";

  /**
   * 등급 칩 — **이벤트 모달·소식 목록·소식 상세가 같은 것을 쓴다** (§9 · C 4-5).
   *
   * 🔴 세 자리에 각각 그리면 색이 셋으로 갈린다. `messageCategory` 가 분류 칩에서
   *   먼저 밟은 자리라(「화면이 자기 표를 들면 정본이 둘이 된다」) 여기선 처음부터
   *   컴포넌트 하나다. 이름·색의 정본은 `shared/utils/eventTierCopy.ts`.
   *
   * ⚠ **노말이면 아무것도 안 그린다.** 늘 오는 것에 이름표를 붙이면 이름표가
   *   배경이 되어 레어·유니크가 안 보인다(§9 「노말은 칩 없음」).
   */
  export let grade: EventGrade | undefined | null = null;
  /** 결(§4). 레어·유니크 중 `body` 면 칩 옆에 「위기」가 붙는다(§9) */
  export let theme: EventTheme | string | undefined | null = null;
  /** 목록처럼 좁은 자리에서 한 단 작게 */
  export let small = false;

  $: chip = gradeChip(grade);
  $: crisis = isCrisis(grade, theme);
</script>

{#if chip}
  <span class="tier" class:small style="--tier-l:{chip.accent}; --tier-d:{chip.accentDark}">
    <span class="g">{chip.label}</span>
    {#if crisis}<span class="crisis">{CRISIS_LABEL}</span>{/if}
  </span>
{/if}

<style>
  /* 분류 칩(회색 글자)과 나란히 서므로 **테두리를 가진 꼴**로 가른다 —
     색만 다르면 흑백 화면·색각 이상에서 둘이 같아 보인다 */
  .tier {
    /* 지면이 바뎀 같은 칩이 되려면 값 둘을 다 실어야 한다 — 인라인 스타일은
       미디어쿼리를 몸 타므로 **둘 다 넣고 고르는 것은 CSS 가** 한다 */
    --tier: var(--tier-l);
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10.5px; font-weight: 800; letter-spacing: .04em;
    color: var(--tier);
    border: 1px solid color-mix(in srgb, var(--tier) 45%, transparent);
    background: color-mix(in srgb, var(--tier) 10%, transparent);
    border-radius: 999px; padding: 1px 7px; white-space: nowrap;
  }
  :global(:root[data-theme="dark"]) .tier { --tier: var(--tier-d); }
  .tier.small { font-size: 9.5px; padding: 0 6px; }
  /* 위기는 등급색을 안 쓴다 — 등급과 위기는 **다른 축**이라 같은 색이면
     「빨간 유니크」가 새 등급처럼 보인다 */
  .crisis {
    color: var(--bad, #B4321E);
    border-left: 1px solid color-mix(in srgb, var(--tier) 35%, transparent);
    padding-left: 4px;
  }
</style>
