<script lang="ts">
  import { teamMarkIndex, teamMap } from "../../../shared/stores/master";
  import { markKey, fallbackSpec, teamMarkSvg } from "../../../shared/utils/teamMark";

  /**
   * 팀 마크. **팀 ID만 주면 된다.**
   *
   * 배정표는 `masterStore`에서 한 번 계산되고, 여기서는 조회만 한다.
   * 표에 없는 팀(새로 생긴 팀, 상무 같은 특수 팀)은 해시 폴백으로 그려
   * 화면이 비지 않게 한다.
   */
  export let teamId: string;
  /** 픽셀. 목록 22~26 · 헤더 34 · 상세 72 · 팀 고르기 96 */
  export let size = 26;
  /** 색을 직접 줄 때 — 아직 소속이 확정 안 된 새 게임 화면 등 */
  export let colors: readonly string[] | null = null;

  $: team = $teamMap.get(teamId);
  $: spec = $teamMarkIndex.get(markKey(teamId)) ?? fallbackSpec(teamId);
  $: svg = teamMarkSvg(spec, colors ?? team?.colors, team?.name ?? "");
</script>

<!-- 높이가 102/100 비율이라 폭보다 살짝 크다 -->
<span class="tm" style="width:{size}px;height:{Math.round(size * 1.02)}px">
  {@html svg}
</span>

<style>
  .tm { display: inline-block; flex-shrink: 0; line-height: 0; }
  .tm :global(svg) { display: block; }
</style>
