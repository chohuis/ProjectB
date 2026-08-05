<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import fieldDefenderPng from '../../../shared/assets/sprites/field_defender.png';
  import fieldBatterRPng  from '../../../shared/assets/sprites/field_batter_r.png';
  import fieldBatterLPng  from '../../../shared/assets/sprites/field_batter_l.png';
  import fieldRunnerPng   from '../../../shared/assets/sprites/field_runner.png';


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
  export let fieldingTeam: 'home' | 'away' = 'home';
  export let batter: { handedness: 'L' | 'R' } = { handedness: 'R' };
  export let batterAnimPos: Point | null = null;
  export let runnerAnimPositions: (Point | null)[] = [null, null, null];

  const dispatch = createEventDispatcher<{ selectPosition: { pos: string } }>();

  // PNG 스프라이트 16×18px → SVG 내 32×36 표시 (2x, pixelated)
  // 오프셋: x-16 (중앙), y-28 (발이 y+8에 위치)


  const retroWall =
    "150,690 150,620 200,620 200,560 260,560 260,510 330,510 330,455 430,455 430,430 500,420 570,430 570,455 670,455 670,510 740,510 740,560 800,560 800,620 850,620 850,690";

  const retroCrowdBoundary =
    "120,440 200,360 290,300 380,260 500,240 620,260 710,300 800,360 880,440";

  const retroDefenderFallback: Record<string, Point> = {
    P:  { x: 500, y: 620 },
    C:  { x: 500, y: 865 },
    "1B": { x: 650, y: 690 },
    "2B": { x: 585, y: 565 },
    SS: { x: 415, y: 565 },
    "3B": { x: 350, y: 690 },
    LF: { x: 260, y: 520 },
    CF: { x: 500, y: 445 },
    RF: { x: 740, y: 520 }
  };

  function retroPlayerPoint(player: Defender): Point {
    return retroDefenderFallback[player.pos] ?? { x: player.x, y: player.y };
  }

  const posLabel: Record<string, string> = {
    P: '투수', C: '포수', '1B': '1루수', '2B': '2루수',
    SS: '유격수', '3B': '3루수', LF: '좌익수', CF: '중견수', RF: '우익수'
  };

  // 포지션 → 도트 스프라이트 색상
  function dotPlayerColor(_pos: string): string {
    return fieldingTeam === 'home' ? '#4a78d8' : '#d84a4a';
  }




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

      <!-- 픽셀아트 배경 이미지 (1000×920 고정) -->
      <image href="/park/probaseball.gif" x="0" y="0" width="1000" height="920" preserveAspectRatio="xMidYMid meet"/>

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
            <rect x={player.x - 20} y={player.y - 20} width="40" height="40"
              fill="none" stroke="#e8e800" stroke-width="2" stroke-dasharray="8 8"
              class="retro-select-march" shape-rendering="crispEdges"/>
          {/if}
          <!-- 그림자 -->
          <ellipse cx={player.x} cy={player.y + 8} rx="18" ry="5" fill="rgba(0,0,0,0.35)"/>
          <image href={fieldDefenderPng}
            x={player.x - 24} y={player.y - 44}
            width="48" height="52"/>
          <text x={player.x} y={player.y + 20} text-anchor="middle"
            font-size="10" font-weight="700" font-family="'Courier New',monospace"
            fill="#f0ecc8" stroke="#0a1018" stroke-width="3" paint-order="stroke">{player.pos}</text>
          {#if hoveredPos === player.pos}
            <rect x={player.x - 36} y={player.y - 46} width="72" height="18"
              fill="#0a1018" stroke="#e8e8c8" stroke-width="1" shape-rendering="crispEdges"/>
            <text x={player.x} y={player.y - 33} text-anchor="middle"
              font-size="11" font-family="'Courier New',monospace" fill="#e8e8c8">{posLabel[player.pos] ?? player.pos}</text>
          {/if}
        </g>
      {/each}

      <!-- 타자 (빨간 유니폼, 좌/우타석) -->
      {#if batterAnimPos !== null}
        <g>
          <ellipse cx={batterAnimPos.x} cy={batterAnimPos.y + 8} rx="18" ry="5" fill="rgba(0,0,0,0.35)"/>
          <image
            href={batter.handedness === 'L' ? fieldBatterLPng : fieldBatterRPng}
            x={batterAnimPos.x - 24} y={batterAnimPos.y - 44}
            width="48" height="52"/>
        </g>
      {/if}

      <!-- 주자 (타자와 동일 스프라이트·팀컬러) -->
      {#each runnerAnimPositions as rp}
        {#if rp !== null}
          <g class="retro-runner-blink">
            <ellipse cx={rp.x} cy={rp.y + 8} rx="18" ry="5" fill="rgba(0,0,0,0.35)"/>
            <image href={fieldRunnerPng}
              x={rp.x - 24} y={rp.y - 44}
              width="48" height="52"/>
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
