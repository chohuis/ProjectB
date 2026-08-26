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
    height: 100%;
    display: block;
    user-select: none;
  }

  .viewport {
    width: 100%;
    height: 100%;
    min-height: 280px;
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
