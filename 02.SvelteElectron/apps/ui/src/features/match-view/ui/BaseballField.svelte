<script lang="ts">
  import { createEventDispatcher } from "svelte";
  /*
   * ⚠ 여기 쓰던 스프라이트 4장은 **1254x1254에 투명 픽셀이 0.0%**였다.
   * 알파 채널이 아예 없어서 48px로 줄여 그리면 선수마다 흰 상자가 따라다녔다.
   * 4장 합쳐 4.0MB인데 화면에는 48px로 나온다.
   *
   * 그런데 `resource/sprites/field-overview/`에 **누끼가 된 24x32 세트가
   * 포지션별로 이미 있었다**(투명 39%). 아무도 안 쓰고 있었을 뿐이다.
   * 그걸 가져오면서 수비 위치별로도 나눴다 — 파일이 원래 그렇게 나뉘어 있다.
   */
  import { stoneStyle } from '../../../shared/utils/stoneMark';

  // 🔴 **수비 아홉의 스프라이트 9장을 여기서 지웠다**(2026-08-26).
  //    팀마다 색이 달라야 하는데 그림 파일로는 못 한다 — 색쌍이 210가지라
  //    미리 구우면 210 × 9 = **1,890장**이고 팀 색이 바뀌면 다시 구워야 한다.
  //    지금은 `stoneMark.ts`가 색만 내고 SVG가 그린다.
  //    ⚠ **타자·주자는 아직 스프라이트다** — 그쪽은 이번 범위가 아니다.

  /**
   * 원본이 24x32다. 예전 값(48x52)은 정사각 원본을 억지로 눌러 넣은 것이라
   * 그대로 쓰면 이번엔 가로로 늘어난다 — **원본 비율(3:4)을 지킨다.**
   */


  interface Point {
    x: number;
    y: number;
  }

  interface Defender {
    pos: string;
    x: number;
    y: number;
  }

  // ⚠ `baseField`(베이스 5점 좌표)를 프로퍼티에서 뺐다. 배경 GIF가 베이스를
  // 이미 그려 놓았고, 주자는 `runnerAnimPositions`로 절대 좌표를 받는다 —
  // 여기서 베이스를 알 필요가 없다. 좌표 정본은 `MatchPage`의 `retroField`다.
  export let defenders: Defender[] = [];
  export let ballPos: Point = { x: 500, y: 645 };
  export let ballTrail: Point[] = [];
  export let strikeZoneTarget: Point = { x: 500, y: 755 };
  export let isPitching = false;
  export let batter: { handedness: 'L' | 'R' } = { handedness: 'R' };
  export let batterAnimPos: Point | null = null;
  export let runnerAnimPositions: (Point | null)[] = [null, null, null];
  /**
   * 어느 구장 그림을 띄우나. **정본은 `parkView.ts`다.**
   * 예전엔 여기 `probaseball.gif`가 하드코딩이라 고교·대학 경기도 전부
   * 프로 구장에서 열렸다.
   */
  export let parkImage = '/park/probaseball.gif';
  /**
   * 수비 팀의 [주색, 보조색]. `teams.json`의 `colors` 그대로다.
   *
   * 🔴 **공수가 바뀌면 이 값도 바뀌어야 한다.** 화면을 만드는 쪽이 넘긴다 —
   *   구장 모듈(`parkView`)은 어느 팀이 수비인지 모른다.
   * ⚠ 갈무리(캐시)가 없어도 된다. 알은 그림 파일이 아니라 SVG라
   *   **색이 바뀌면 그대로 따라 그려진다.**
   */
  export let defenseColors: readonly [string, string] = ['#7a8a99', '#e8e8c8'];
  /**
   * **공격 팀**의 [주색, 보조색] — 타자·주자가 입는다.
   *
   * ⚠ 수비와 **반대 팀**이다. 둘이 같으면 화면에서 누가 누군지 안 갈린다.
   */
  export let offenseColors: readonly [string, string] = ['#b0503f', '#f0ecc8'];

  /**
   * 알 반지름 — 예전 스프라이트(39×52)가 차지하던 폭에 맞춘다.
   *
   * ⚠ **알은 발이 없다.** 사람 그림은 발밑을 좌표에 맞췄지만(`y - 44`)
   *   알은 **세로 가운데**를 좌표에 놓는다.
   */
  const STONE_R = 17;
  $: stone = stoneStyle(defenseColors[0], defenseColors[1], STONE_R);
  $: batStone = stoneStyle(offenseColors[0], offenseColors[1], STONE_R);

  const dispatch = createEventDispatcher<{ selectPosition: { pos: string } }>();

  const posLabel: Record<string, string> = {
    P: '투수', C: '포수', '1B': '1루수', '2B': '2루수',
    SS: '유격수', '3B': '3루수', LF: '좌익수', CF: '중견수', RF: '우익수'
  };

  let selectedPos = "";
  let hoveredPos = "";

  function selectPosition(pos: string) {
    selectedPos = pos;
    dispatch("selectPosition", { pos });
  }
</script>

<div class="wrapper">
  <div class="viewport retro-viewport">
    <svg class="field retro-field" viewBox="0 0 1000 920" preserveAspectRatio="xMidYMid meet">
      <defs>
        <!-- 알 광택 — 왼쪽 위가 밝고 가장자리가 어둡다.
             ⚠ 알마다 만들지 않는다. 아홉이 같은 그라디언트를 쓴다 -->
        <radialGradient id="stone-body" cx="33%" cy="30%" r="78%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
          <stop offset="42%" stop-color="#ffffff" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.42"/>
        </radialGradient>
      </defs>

      <!-- 픽셀아트 배경 (구장마다 다르다). 좌표는 티어별로 `parkAnchors.ts`에 있다 -->
      <image href={parkImage} x="0" y="0" width="1000" height="920" preserveAspectRatio="xMidYMid meet"/>

      <!-- 존 미리보기 -->
      <rect x={Math.round(strikeZoneTarget.x) - 6} y={Math.round(strikeZoneTarget.y) - 6} width="12" height="12"
        fill="rgba(101,213,255,0.82)" stroke="rgba(227,250,255,0.95)" stroke-width="2" shape-rendering="crispEdges"/>
      {#if isPitching}
        <rect x={Math.round(strikeZoneTarget.x) - 14} y={Math.round(strikeZoneTarget.y) - 14} width="28" height="28"
          fill="none" stroke="rgba(101,213,255,0.72)" stroke-width="2" stroke-dasharray="4 4" shape-rendering="crispEdges"/>
      {/if}

      <!-- 수비수 (GBC 픽셀 스프라이트) -->
      {#each defenders as player}
        <g role="button" tabindex="0" aria-label={player.pos}
          on:click={() => selectPosition(player.pos)}
          on:keydown={(e) => e.key === 'Enter' && selectPosition(player.pos)}
          on:mouseenter={() => (hoveredPos = player.pos)}
          on:mouseleave={() => (hoveredPos = '')}>
          {#if selectedPos === player.pos}
            <rect x={player.x - STONE_R - 4} y={player.y - STONE_R - 4}
              width={(STONE_R + 4) * 2} height={(STONE_R + 4) * 2}
              fill="none" stroke="#e8e800" stroke-width="2" stroke-dasharray="8 8"
              class="retro-select-march" shape-rendering="crispEdges"/>
          {/if}
          <!-- 바닥 그림자 — 알보다 조금 아래·오른쪽 -->
          <ellipse cx={player.x + 1} cy={player.y + STONE_R * 0.86} rx={STONE_R * 0.92}
            ry={STONE_R * 0.28} fill="rgba(0,0,0,0.35)"/>
          <!-- 알 몸통 — 팀 주색. 테두리가 보조색이다 -->
          <circle cx={player.x} cy={player.y} r={STONE_R}
            fill={stone.body} stroke={stone.rim} stroke-width={stone.rimWidth}/>
          <!-- 광택 — 테두리 안쪽까지만 덮는다 -->
          <circle cx={player.x} cy={player.y} r={STONE_R - stone.rimWidth / 2}
            fill="url(#stone-body)" pointer-events="none"/>
          <!-- 자리 이름 — **팀 보조색을 쓰지 않는다.** 흰색이나 검정이다
               (밝기가 비슷한 색쌍에서 글자가 묻히기 때문. `stoneMark.ts` 참고) -->
          <text x={player.x} y={player.y} text-anchor="middle" dominant-baseline="central"
            font-size={player.pos.length > 1 ? 13 : 16} font-weight="800"
            font-family="'Courier New',monospace" fill={stone.ink}
            pointer-events="none">{player.pos}</text>
          {#if hoveredPos === player.pos}
            <rect x={player.x - 36} y={player.y - STONE_R - 24} width="72" height="18"
              fill="#0a1018" stroke="#e8e8c8" stroke-width="1" shape-rendering="crispEdges"/>
            <text x={player.x} y={player.y - STONE_R - 11} text-anchor="middle"
              font-size="11" font-family="'Courier New',monospace" fill="#e8e8c8">{posLabel[player.pos] ?? player.pos}</text>
          {/if}
        </g>
      {/each}

      <!-- 타자 (빨간 유니폼, 좌/우타석) -->
      {#if batterAnimPos !== null}
        <g>
          <ellipse cx={batterAnimPos.x + 1} cy={batterAnimPos.y + STONE_R * 0.86}
            rx={STONE_R * 0.92} ry={STONE_R * 0.28} fill="rgba(0,0,0,0.35)"/>
          <circle cx={batterAnimPos.x} cy={batterAnimPos.y} r={STONE_R}
            fill={batStone.body} stroke={batStone.rim} stroke-width={batStone.rimWidth}/>
          <circle cx={batterAnimPos.x} cy={batterAnimPos.y} r={STONE_R - batStone.rimWidth / 2}
            fill="url(#stone-body)" pointer-events="none"/>
          <!-- 좌/우타석은 글자로 가른다 — 스프라이트 두 장이 하던 일이다 -->
          <text x={batterAnimPos.x} y={batterAnimPos.y} text-anchor="middle"
            dominant-baseline="central" font-size="15" font-weight="800"
            font-family="'Courier New',monospace" fill={batStone.ink}
            pointer-events="none">{batter.handedness === 'L' ? 'L' : 'R'}</text>
        </g>
      {/if}

      <!-- 주자 (타자와 동일 스프라이트·팀컬러) -->
      {#each runnerAnimPositions as rp}
        {#if rp !== null}
          <g class="retro-runner-blink">
            <ellipse cx={rp.x + 1} cy={rp.y + STONE_R * 0.86}
              rx={STONE_R * 0.92} ry={STONE_R * 0.28} fill="rgba(0,0,0,0.35)"/>
            <circle cx={rp.x} cy={rp.y} r={STONE_R}
              fill={batStone.body} stroke={batStone.rim} stroke-width={batStone.rimWidth}/>
            <circle cx={rp.x} cy={rp.y} r={STONE_R - batStone.rimWidth / 2}
              fill="url(#stone-body)" pointer-events="none"/>
          </g>
        {/if}
      {/each}

      <!-- 공 궤적 & 공 -->
      {#each ballTrail as pos, i}
        {@const sz = Math.max(2, Math.round(2 + (i / Math.max(ballTrail.length - 1, 1)) * 4))}
        <rect x={Math.round(pos.x) - sz/2} y={Math.round(pos.y) - sz/2} width={sz} height={sz}
          fill="#e8d870" opacity={(i + 1) / ballTrail.length * 0.5} shape-rendering="crispEdges"/>
      {/each}
      <rect x={Math.round(ballPos.x) - 4} y={Math.round(ballPos.y) - 4} width="8" height="8"
        fill="#f0ecc8" stroke="#c8c8a0" stroke-width="1" shape-rendering="crispEdges"/>
    </svg>
  </div>
</div>

<style>
  /* 24x32 원본을 키워 그린다. 보간이 들어가면 도트가 뭉개진다 */
  /* ⚠ **`.spr`을 지웠다** — 경기장 위 사람 그림이 하나도 안 남았다.
     수비 아홉·타자·주자가 전부 알(`stoneMark.ts`)로 바뀌었다. */

  .wrapper {
    width: 100%;
    /* 🔴 **`height: 100%` 를 되살렸다** (2026-08-30 · 계측 560건).
       08-28 에 이걸 빼면서 아래 `.viewport` 의 `max-height: 100%` 가
       **기댈 데를 잃고 조용히 안 먹었다** — 그 주석이 스스로
       "max-height 가 없으면 넘친다"고 적어 둔 바로 그 안전망이다.
       **고침이 제 안전망을 껐다.** */
    height: 100%;
    min-height: 0;
    display: flex;
    justify-content: center;
    user-select: none;
  }

  .viewport {
    /* 🔴 **높이에서 폭을 뽑는다** — 08-28 과 반대 방향이다. */
    height: 100%;
    width: auto;
    max-width: 100%;
    min-height: 0;
    /**
     * 🔴 **높이를 폭에서 뽑는다** (2026-08-28 실제 플레이: "타자는 반만 나오고
     *   포수는 안 보인다 · 경기장마다 잘림이 다르다").
     *
     *   예전엔 `height: 100%`였다. 부모(`.field-stage-wrap`)가
     *   `align-items: start`라 높이가 **내용 기준**이고, 그 위도 auto라
     *   `100%`가 풀려 `min-height: 280px`만 남았다. 그런데 SVG는 제 비율대로
     *   폭×0.92만큼 커져서 **`overflow: hidden`이 아래를 잘랐다.**
     *
     *   타자·포수는 화면 **아래쪽**에 있어서(앵커 y 795~851, viewBox 920)
     *   정확히 그 부분이 날아갔다. 티어마다 홈플레이트 y가 달라
     *   (pro 800 · university 825 · highschool 799) **구장마다 잘림이 달랐다.**
     *
     * 🔴 **그 고침이 반대쪽으로 넘쳤다** (2026-08-30 · 계측 560건 =
     *   구장 28종 × 해상도 10종 × 오른쪽칸 2종). **10해상도 중 8에서**
     *   아래가 잘려 홈플레이트·포수·타자가 통째로 안 보였다:
     *
     *   ```
     *   1366x768   아래  72.7px 잘림      1920x1080  139.1px
     *   1600x900        100.6px           2560x1440  216.2px
     *   1920x1200        50.3px (앵커는 산다)  3840x2160  370.3px
     *   1280x720          0px  ← 유일한 예외
     *   ```
     *
     * ⚠ 화면이 **넓을수록 심하다** — 폭에서 높이를 뽑으니 폭이 커지면
     *   높이가 칸을 넘고 `overflow: hidden` 이 아래를 자른다.
     * ⚠ 비율은 viewBox와 같아야 한다 — 다르면 그만큼 여백이 생긴다.
     *   폭을 늘리는 쪽(후보 ②)도 안 잘리지만 **틀 비율이 1.33~1.38** 로
     *   벌어져 테두리가 구장을 안 감싼다. 지금은 1.087 이다.
     * ⚠ `min-height: 280px` 를 지웠다 — 그게 남으면 낮은 창에서 다시 넘친다.
     *
     * 계측: `node scripts/parkclip/measure.mjs` → `diagnose.mjs`
     *   🔴 CSS를 고쳤으면 `build-harness.mjs` 를 **먼저** 다시 돌려라.
     */
    aspect-ratio: 1000 / 920;
    max-height: 100%;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid #355c82;
    background: #0f172a;
    /* U5 안전망: 아직 어두운 화면이다. 전역 글자색이 밝은색에서 어두운색으로
       뒤집혔으므로 여기서 명시하지 않으면 색 없는 자식들이 안 보인다 */
    color: #E4EDFF;
    position: relative;
  }

  .field {
    width: 100%;
    height: 100%;
    display: block;
  }












  @keyframes errorFlash {
    from { opacity: 0.35; }
    to   { opacity: 1.0; }
  }

  @keyframes fielderPulse {
    from { opacity: 0.5; }
    to   { opacity: 1.0; }
  }

  @keyframes selectPulse {
    0%, 100% { opacity: 0.75; transform: scale(1); }
    50%       { opacity: 0.2;  transform: scale(1.3); }
  }



  @keyframes runnerAppear {
    from { opacity: 0; transform: scale(0.25); }
    to   { opacity: 1; transform: scale(1); }
  }




  /* GBC 레트로 모드: 픽셀아트 이미지 선명하게 */
  .retro-field image {
    image-rendering: pixelated;
  }

  /* GBC 레트로 모드 viewport 프레임 */
  .retro-viewport {
    border: 4px solid #1e3050;
    box-shadow:
      0 0 0 2px #0a1018,
      0 0 0 6px #1e3050,
      inset 0 0 0 2px #0a1018;
    border-radius: 4px;
  }

  .retro-runner-blink {
    animation: gbcBlink 0.8s steps(1) infinite;
  }

  @keyframes gbcBlink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }

  .retro-select-march {
    stroke-dashoffset: 0;
    animation: marchingAnts 0.4s linear infinite;
  }

  @keyframes marchingAnts {
    to { stroke-dashoffset: -16; }
  }
</style>
