<script lang="ts">
  import { createEventDispatcher } from "svelte";


  interface Point {
    x: number;
    y: number;
  }

  interface Defender {
    pos: string;
    x: number;
    y: number;
  }

  export let baseField: {
    home: Point;
    first: Point;
    second: Point;
    third: Point;
    mound: Point;
  } = {
    home: { x: 500, y: 820 },
    first: { x: 650, y: 670 },
    second: { x: 500, y: 520 },
    third: { x: 350, y: 670 },
    mound: { x: 500, y: 645 }
  };
  export let defenders: Defender[] = [];
  export let runners: { first: boolean; second: boolean; third: boolean } = {
    first: false,
    second: false,
    third: false
  };
  export let ballPos: Point = { x: 500, y: 645 };
  export let ballTrail: Point[] = [];
  export let strikeZoneTarget: Point = { x: 500, y: 755 };
  export let isPitching = false;
  export let fieldStyle: 'digital' | 'dot' | 'retro' = 'digital';
  export let fieldingTeam: 'home' | 'away' = 'home';

  const dispatch = createEventDispatcher<{ selectPosition: { pos: string } }>();

  const RETRO_SPRITE: string[] = [
    '..CCCC..',
    '.CCCCCC.',
    '.CSCCSC.',
    '.SSSSSS.',
    'UUUUUUUU',
    'UUUUUUUU',
    '.PPPPPP.',
    '..PP.PP.',
  ];

  function retroSpriteColor(key: string): string {
    const home = fieldingTeam === 'home';
    if (key === 'C') return home ? '#1a2878' : '#781a1a';
    if (key === 'S') return '#d4a870';
    if (key === 'U') return home ? '#3858d0' : '#d03838';
    if (key === 'P') return '#1a1a28';
    return 'transparent';
  }

  const RETRO_RUNNER: string[] = [
    '..RR..',
    '.RRRR.',
    '..RR..',
    'RRRRRR',
    '.RR.R.',
    '.RR.R.',
  ];
  function retroRunnerColor(): string { return '#e8e800'; }


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
  <div class="viewport" class:retro-viewport={fieldStyle === 'retro'}>
{#if fieldStyle === 'dot'}
    <svg class="field dot-field" viewBox="0 0 1000 920" preserveAspectRatio="xMidYMax meet">
      <defs>
        <!-- 외야 잔디 줄무늬 -->
        <pattern id="dg" x="0" y="0" width="1000" height="20" patternUnits="userSpaceOnUse">
          <rect x="0" y="0"  width="1000" height="10" fill="#2a8818"/>
          <rect x="0" y="10" width="1000" height="10" fill="#1c6010"/>
        </pattern>
        <!-- 내야 잔디 (밝게) -->
        <pattern id="dgIn" x="0" y="0" width="1000" height="16" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="1000" height="8" fill="#309924"/>
          <rect x="0" y="8" width="1000" height="8" fill="#226e18"/>
        </pattern>
        <!-- 흙 줄무늬 -->
        <pattern id="dd" x="0" y="0" width="1000" height="16" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="1000" height="8" fill="#c47a2e"/>
          <rect x="0" y="8" width="1000" height="8" fill="#a86220"/>
        </pattern>
        <!-- 원거리 관중 (상단 티어) — 작은 픽셀 인물, 다양한 좌석색 -->
        <pattern id="cFar" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
          <!-- 좌석 배경: 교차 색 행 -->
          <rect width="16" height="16" fill="#0a1520"/>
          <!-- 행 1: 좌석 등받이 (파란 계열) -->
          <rect x="0" y="0" width="16" height="6" fill="#0e1e36"/>
          <!-- 행 2: 좌석 등받이 (약간 밝게) -->
          <rect x="0" y="8" width="16" height="6" fill="#0c1a30"/>
          <!-- 인물 A (좌측): 머리 + 몸 -->
          <rect x="1" y="1" width="4" height="3" fill="#1e3a68"/><!-- 머리 -->
          <rect x="0" y="4" width="6" height="4" fill="#1a3060"/><!-- 몸 -->
          <!-- 인물 B (우측): 다른 색 -->
          <rect x="9" y="2" width="4" height="3" fill="#3a2060"/><!-- 머리 -->
          <rect x="8" y="5" width="6" height="3" fill="#2e1a50"/><!-- 몸 -->
          <!-- 아이슬 (인물 사이) -->
          <rect x="6" y="0" width="2" height="8" fill="#060e1a"/>
          <!-- 행 구분선 -->
          <rect x="0" y="7" width="16" height="1" fill="#050d18"/>
          <!-- 인물 C (하단 행, 앉아서 응원) -->
          <rect x="2" y="9" width="3" height="2" fill="#2a4a80"/><!-- 머리 -->
          <rect x="1" y="11" width="5" height="3" fill="#1e3a6a"/><!-- 몸 -->
          <!-- 인물 D (하단 행) -->
          <rect x="10" y="9" width="3" height="2" fill="#502860"/>
          <rect x="9" y="11" width="5" height="3" fill="#3c1e4e"/>
          <rect x="6" y="8" width="2" height="8" fill="#060e1a"/>
        </pattern>
        <!-- 근거리 관중 (하단 티어) — 더 큰 픽셀, 응원 동작 다양 -->
        <pattern id="cNear" x="0" y="0" width="24" height="26" patternUnits="userSpaceOnUse">
          <!-- 좌석 배경 -->
          <rect width="24" height="26" fill="#0e1a2e"/>
          <!-- 좌석 등받이 행 -->
          <rect x="0" y="0" width="24" height="12" fill="#101e36"/>
          <rect x="0" y="13" width="24" height="12" fill="#0c1a30"/>
          <!-- 아이슬 (세로) -->
          <rect x="11" y="0" width="2" height="26" fill="#080f1e"/>
          <!-- 인물 A: 손 들고 응원 (파란 팀 팬) -->
          <rect x="3" y="1" width="4" height="3" fill="#4a6aaa"/><!-- 머리 -->
          <rect x="1" y="0" width="2" height="3" fill="#3a5898"/><!-- 왼팔 위 -->
          <rect x="7" y="0" width="2" height="3" fill="#3a5898"/><!-- 오른팔 위 -->
          <rect x="2" y="4" width="6" height="5" fill="#2e5090"/><!-- 몸 (유니폼) -->
          <rect x="3" y="9" width="4" height="3" fill="#1a2e60"/><!-- 하반신 -->
          <!-- 인물 B: 모자 쓰고 앉음 (빨간 팀 팬) -->
          <rect x="13" y="2" width="4" height="3" fill="#883838"/><!-- 머리+모자 -->
          <rect x="13" y="1" width="5" height="2" fill="#aa2020"/><!-- 모자 챙 -->
          <rect x="13" y="5" width="5" height="5" fill="#6a2828"/><!-- 몸 -->
          <rect x="14" y="10" width="3" height="2" fill="#3a1818"/><!-- 하반신 -->
          <!-- 행 구분선 -->
          <rect x="0" y="12" width="24" height="1" fill="#060c18"/>
          <!-- 인물 C: 하단 행, 노란 유니폼 팬, 손들기 -->
          <rect x="3" y="14" width="4" height="3" fill="#8a7830"/><!-- 머리 -->
          <rect x="1" y="13" width="2" height="3" fill="#a08820"/><!-- 왼팔 위 -->
          <rect x="7" y="13" width="2" height="3" fill="#a08820"/><!-- 오른팔 위 -->
          <rect x="2" y="17" width="6" height="5" fill="#786020"/><!-- 몸 -->
          <rect x="3" y="22" width="4" height="3" fill="#403010"/><!-- 하반신 -->
          <!-- 인물 D: 하단 행, 초록 유니폼 -->
          <rect x="14" y="15" width="4" height="3" fill="#307848"/><!-- 머리 -->
          <rect x="13" y="18" width="6" height="5" fill="#245838"/><!-- 몸 -->
          <rect x="14" y="23" width="4" height="2" fill="#142e1e"/><!-- 하반신 -->
        </pattern>
        <!-- 좌석 열 구분선 -->
        <pattern id="seatRow" x="0" y="0" width="1000" height="13" patternUnits="userSpaceOnUse">
          <rect x="0" y="0"  width="1000" height="10" fill="rgba(0,0,0,0)"/>
          <rect x="0" y="10" width="1000" height="3"  fill="rgba(0,0,0,0.45)"/>
        </pattern>
        <!-- 섹션 구분 통로 (수직 아이슬) -->
        <pattern id="aisle" x="0" y="0" width="120" height="1000" patternUnits="userSpaceOnUse">
          <rect width="120" height="1000" fill="rgba(0,0,0,0)"/>
          <rect x="58" y="0" width="4" height="1000" fill="rgba(0,0,0,0.5)"/>
        </pattern>
        <filter id="ds">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.6"/>
        </filter>
      </defs>

      <!-- ── 야간 하늘 배경 ── -->
      <rect x="0" y="0" width="1000" height="920" fill="#07101e"/>
      <rect x="0" y="0" width="1000" height="100" fill="#0b1628" shape-rendering="crispEdges"/>
      <rect x="0" y="100" width="1000" height="80"  fill="#091220" shape-rendering="crispEdges"/>

      <!-- ── 외야 잔디 (전체 필드 영역, 관중석이 위에서 마스킹) ── -->
      <rect x="0" y="330" width="1000" height="590" fill="url(#dg)" shape-rendering="crispEdges"/>

      <!-- ── 경고 트랙 ── -->
      <polygon points="120,760 215,620 310,520 405,460 500,440 595,460 690,520 785,620 880,760 818,706 739,602 659,528 580,484 500,469 420,484 341,528 261,602 182,706"
        fill="#7a4c14" shape-rendering="crispEdges"/>

      <!-- ── 외야 담장 (3레이어: 벽 본체 + 녹색 상단 + 하이라이트) ── -->
      <polyline points="182,706 261,602 341,528 420,484 500,469 580,484 659,528 739,602 818,706"
        fill="none" stroke="#183020" stroke-width="32" stroke-linejoin="miter" shape-rendering="crispEdges"/>
      <polyline points="182,706 261,602 341,528 420,484 500,469 580,484 659,528 739,602 818,706"
        fill="none" stroke="#306838" stroke-width="8" shape-rendering="crispEdges"/>
      <polyline points="182,706 261,602 341,528 420,484 500,469 580,484 659,528 739,602 818,706"
        fill="none" stroke="#58b060" stroke-width="3" shape-rendering="crispEdges"/>
      <polyline points="182,706 261,602 341,528 420,484 500,469 580,484 659,528 739,602 818,706"
        fill="none" stroke="rgba(180,255,180,0.3)" stroke-width="1" shape-rendering="crispEdges"/>

      <!-- ── 파울 라인 & 폴 ── -->
      <line x1="500" y1="820" x2="160" y2="476" stroke="#e0e0e0" stroke-width="3" shape-rendering="crispEdges"/>
      <line x1="500" y1="820" x2="840" y2="476" stroke="#e0e0e0" stroke-width="3" shape-rendering="crispEdges"/>
      <!-- 파울 폴 (L자형) -->
      <rect x="154" y="336" width="10" height="144" fill="#ddb800" shape-rendering="crispEdges"/>
      <rect x="148" y="330" width="22" height="10"  fill="#ddb800" shape-rendering="crispEdges"/>
      <rect x="836" y="336" width="10" height="144" fill="#ddb800" shape-rendering="crispEdges"/>
      <rect x="830" y="330" width="22" height="10"  fill="#ddb800" shape-rendering="crispEdges"/>

      <!-- ── 내야 흙 ── -->
      <polygon points="500,920 300,720 400,608 500,570 600,608 700,720"
        fill="url(#dd)" shape-rendering="crispEdges"/>

      <!-- ── 내야 잔디 ── -->
      <polygon points="500,580 640,720 500,860 360,720"
        fill="url(#dgIn)" shape-rendering="crispEdges"/>

      <!-- ── 베이스라인 ── -->
      <line x1="500" y1="820" x2="650" y2="670" stroke="#ddd0a0" stroke-width="3" shape-rendering="crispEdges"/>
      <line x1="650" y1="670" x2="500" y2="520" stroke="#ddd0a0" stroke-width="3" shape-rendering="crispEdges"/>
      <line x1="500" y1="520" x2="350" y2="670" stroke="#ddd0a0" stroke-width="3" shape-rendering="crispEdges"/>
      <line x1="350" y1="670" x2="500" y2="820" stroke="#ddd0a0" stroke-width="3" shape-rendering="crispEdges"/>

      <!-- ── 마운드 ── -->
      <polygon points="500,608 522,614 534,630 534,652 522,668 500,674 478,668 466,652 466,630 478,614"
        fill="#a05c24" shape-rendering="crispEdges"/>
      <rect x="490" y="641" width="20" height="6" fill="#f0f0ec" shape-rendering="crispEdges"/>

      <!-- ── 베이스 ── -->
      <rect x="638" y="658" width="24" height="24" transform="rotate(45 650 670)" fill="#f8f8f8" shape-rendering="crispEdges"/>
      <rect x="488" y="508" width="24" height="24" transform="rotate(45 500 520)" fill="#f8f8f8" shape-rendering="crispEdges"/>
      <rect x="338" y="658" width="24" height="24" transform="rotate(45 350 670)" fill="#f8f8f8" shape-rendering="crispEdges"/>
      <polygon points="484,808 516,808 524,828 500,842 476,828" fill="#f8f8f8" shape-rendering="crispEdges"/>

      <!-- ── 타석 박스 ── -->
      <rect x="440" y="796" width="40" height="54" fill="none" stroke="#c8a040" stroke-width="2" opacity="0.55" shape-rendering="crispEdges"/>
      <rect x="520" y="796" width="40" height="54" fill="none" stroke="#c8a040" stroke-width="2" opacity="0.55" shape-rendering="crispEdges"/>

      <!-- ── 관중석 3단 구조 (필드 위에 그려 비필드 영역 마스킹) ── -->
      <!-- 외곽 구조물 -->
      <polygon points="0,0 1000,0 1000,360 870,660 790,568 712,500 628,460 500,444 372,460 288,500 210,568 130,660 0,360"
        fill="#0a1520" shape-rendering="crispEdges"/>
      <!-- 상단 티어: 픽셀 관중 + 좌석열 -->
      <polygon points="20,0 980,0 980,320 858,626 782,538 706,472 622,434 500,418 378,434 294,472 218,538 142,626 20,320"
        fill="url(#cFar)" shape-rendering="crispEdges"/>
      <polygon points="20,0 980,0 980,320 858,626 782,538 706,472 622,434 500,418 378,434 294,472 218,538 142,626 20,320"
        fill="url(#seatRow)" shape-rendering="crispEdges"/>
      <!-- 상단 티어 섹션 통로 -->
      <polygon points="20,0 980,0 980,320 858,626 782,538 706,472 622,434 500,418 378,434 294,472 218,538 142,626 20,320"
        fill="url(#aisle)" shape-rendering="crispEdges"/>
      <!-- 티어 구분 콘크리트 띠 -->
      <polyline points="0,230 140,258 280,272 420,278 500,280 580,278 720,272 860,258 1000,230"
        fill="none" stroke="#0a1520" stroke-width="12" shape-rendering="crispEdges"/>
      <polyline points="0,230 140,258 280,272 420,278 500,280 580,278 720,272 860,258 1000,230"
        fill="none" stroke="#1a2d48" stroke-width="8" shape-rendering="crispEdges"/>
      <polyline points="0,230 140,258 280,272 420,278 500,280 580,278 720,272 860,258 1000,230"
        fill="none" stroke="#2a4060" stroke-width="2" shape-rendering="crispEdges"/>
      <!-- 하단 티어: 더 큰 픽셀 관중 -->
      <polygon points="0,230 1000,230 1000,360 870,660 790,568 712,500 628,460 500,444 372,460 288,500 210,568 130,660 0,360"
        fill="url(#cNear)" shape-rendering="crispEdges"/>
      <polygon points="0,230 1000,230 1000,360 870,660 790,568 712,500 628,460 500,444 372,460 288,500 210,568 130,660 0,360"
        fill="url(#seatRow)" shape-rendering="crispEdges"/>
      <!-- 하단 티어 섹션 통로 -->
      <polygon points="0,230 1000,230 1000,360 870,660 790,568 712,500 628,460 500,444 372,460 288,500 210,568 130,660 0,360"
        fill="url(#aisle)" shape-rendering="crispEdges"/>
      <!-- 관중석 내부 경계벽 (콘크리트 펜스) -->
      <polyline points="130,660 210,568 288,500 372,460 500,444 628,460 712,500 790,568 870,660"
        fill="none" stroke="#0a1520" stroke-width="18" shape-rendering="crispEdges"/>
      <polyline points="130,660 210,568 288,500 372,460 500,444 628,460 712,500 790,568 870,660"
        fill="none" stroke="#1e3a58" stroke-width="10" shape-rendering="crispEdges"/>
      <polyline points="130,660 210,568 288,500 372,460 500,444 628,460 712,500 790,568 870,660"
        fill="none" stroke="#2e5070" stroke-width="4" shape-rendering="crispEdges"/>
      <polyline points="130,660 210,568 288,500 372,460 500,444 628,460 712,500 790,568 870,660"
        fill="none" stroke="#4a7090" stroke-width="1" shape-rendering="crispEdges"/>

      <!-- ── 조명탑 (좌우) ── -->
      <!-- 좌측 조명탑 -->
      <rect x="62"  y="72" width="12" height="100" fill="#8090a8" shape-rendering="crispEdges"/>
      <rect x="58"  y="68" width="20" height="8"   fill="#a0b0c0" shape-rendering="crispEdges"/>
      <rect x="46"  y="48" width="44" height="32"  fill="#7080a0" shape-rendering="crispEdges"/>
      <rect x="48"  y="50" width="40" height="28"  fill="#1a2438" shape-rendering="crispEdges"/>
      {#each [0,1,2,3] as col}
        {#each [0,1,2] as row}
          <rect x={50 + col*9} y={52 + row*8} width="7" height="6" fill="#fffce8" shape-rendering="crispEdges"/>
        {/each}
      {/each}
      <!-- 우측 조명탑 -->
      <rect x="926" y="72" width="12" height="100" fill="#8090a8" shape-rendering="crispEdges"/>
      <rect x="922" y="68" width="20" height="8"   fill="#a0b0c0" shape-rendering="crispEdges"/>
      <rect x="910" y="48" width="44" height="32"  fill="#7080a0" shape-rendering="crispEdges"/>
      <rect x="912" y="50" width="40" height="28"  fill="#1a2438" shape-rendering="crispEdges"/>
      {#each [0,1,2,3] as col}
        {#each [0,1,2] as row}
          <rect x={914 + col*9} y={52 + row*8} width="7" height="6" fill="#fffce8" shape-rendering="crispEdges"/>
        {/each}
      {/each}

      <!-- ── 존 미리보기 ── -->
      <rect x={Math.round(strikeZoneTarget.x) - 6} y={Math.round(strikeZoneTarget.y) - 6} width="12" height="12"
        fill="rgba(101,213,255,0.78)" stroke="rgba(227,250,255,0.95)" stroke-width="2" shape-rendering="crispEdges"/>
      {#if isPitching}
        <rect x={Math.round(strikeZoneTarget.x) - 14} y={Math.round(strikeZoneTarget.y) - 14} width="28" height="28"
          fill="none" stroke="rgba(101,213,255,0.72)" stroke-width="2" stroke-dasharray="4 4" shape-rendering="crispEdges"/>
      {/if}

      <!-- ── 수비수 (팔각형 배지) ── -->
      {#each defenders as player}
        <g filter="url(#ds)" class:selected={selectedPos === player.pos}
          role="button" tabindex="0" aria-label={player.pos}
          on:click={() => selectPosition(player.pos)}
          on:keydown={(e) => e.key === 'Enter' && selectPosition(player.pos)}
          on:mouseenter={() => (hoveredPos = player.pos)}
          on:mouseleave={() => (hoveredPos = '')}>
          {#if selectedPos === player.pos}
            <polygon points="
              {player.x-24},{player.y-12} {player.x-12},{player.y-24}
              {player.x+12},{player.y-24} {player.x+24},{player.y-12}
              {player.x+24},{player.y+12} {player.x+12},{player.y+24}
              {player.x-12},{player.y+24} {player.x-24},{player.y+12}"
              fill="none" stroke="#4aa8ff" stroke-width="2" class="dot-select-ring" shape-rendering="crispEdges"/>
          {/if}
          <!-- 그림자 -->
          <polygon points="
            {player.x-16},{player.y-6+4} {player.x-6},{player.y-16+4}
            {player.x+6},{player.y-16+4} {player.x+16},{player.y-6+4}
            {player.x+16},{player.y+6+4} {player.x+6},{player.y+16+4}
            {player.x-6},{player.y+16+4} {player.x-16},{player.y+6+4}"
            fill="rgba(0,0,0,0.4)" shape-rendering="crispEdges"/>
          <!-- 배지 본체 -->
          <polygon points="
            {player.x-18},{player.y-8} {player.x-8},{player.y-18}
            {player.x+8},{player.y-18} {player.x+18},{player.y-8}
            {player.x+18},{player.y+8} {player.x+8},{player.y+18}
            {player.x-8},{player.y+18} {player.x-18},{player.y+8}"
            fill={dotPlayerColor(player.pos)} shape-rendering="crispEdges" class="player-dot-rect"/>
          <!-- 배지 테두리 -->
          <polygon points="
            {player.x-18},{player.y-8} {player.x-8},{player.y-18}
            {player.x+8},{player.y-18} {player.x+18},{player.y-8}
            {player.x+18},{player.y+8} {player.x+8},{player.y+18}
            {player.x-8},{player.y+18} {player.x-18},{player.y+8}"
            fill="none" stroke="#ffffff" stroke-width="2" shape-rendering="crispEdges"/>
          <text x={player.x} y={player.y + 6} text-anchor="middle"
            font-size="14" font-weight="700" font-family="'Courier New',monospace" fill="#ffffff">{player.pos}</text>
          {#if hoveredPos === player.pos}
            <g class="tooltip-group">
              <rect x={player.x - 40} y={player.y - 60} width="80" height="22"
                fill="rgba(4,8,16,0.95)" stroke="#4aa8ff" stroke-width="1" shape-rendering="crispEdges"/>
              <text x={player.x} y={player.y - 44} text-anchor="middle"
                font-size="13" font-family="'Courier New',monospace" fill="#a8d8ff">{posLabel[player.pos] ?? player.pos}</text>
            </g>
          {/if}
        </g>
      {/each}

      <!-- ── 주자 ── -->
      {#if runners.first}
        <rect x={baseField.first.x - 12} y={baseField.first.y - 12} width="24" height="24"
          fill="#2a7fff" stroke="#ffffff" stroke-width="2" shape-rendering="crispEdges" class="runner-dot"/>
      {/if}
      {#if runners.second}
        <rect x={baseField.second.x - 12} y={baseField.second.y - 12} width="24" height="24"
          fill="#2a7fff" stroke="#ffffff" stroke-width="2" shape-rendering="crispEdges" class="runner-dot"/>
      {/if}
      {#if runners.third}
        <rect x={baseField.third.x - 12} y={baseField.third.y - 12} width="24" height="24"
          fill="#2a7fff" stroke="#ffffff" stroke-width="2" shape-rendering="crispEdges" class="runner-dot"/>
      {/if}

      <!-- ── 공 궤적 & 공 ── -->
      {#each ballTrail as pos, i}
        <rect x={Math.round(pos.x) - 3} y={Math.round(pos.y) - 3} width="6" height="6"
          fill="white" opacity={(i + 1) / ballTrail.length * 0.35} shape-rendering="crispEdges"/>
      {/each}
      <rect x={Math.round(ballPos.x) - 5} y={Math.round(ballPos.y) - 5} width="10" height="10"
        fill="#ffffff" stroke="#dae4ff" stroke-width="1" shape-rendering="crispEdges"/>
    </svg>
{:else if fieldStyle === 'retro'}
    <!-- 레트로 모드: 픽셀아트 배경 이미지 + 동적 오버레이 -->
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
          <ellipse cx={player.x} cy={player.y + 16} rx="12" ry="4" fill="rgba(0,0,0,0.4)"/>
          {#each RETRO_SPRITE as rowStr, ri}
            {#each rowStr.split('') as cell, ci}
              {#if cell !== '.'}
                <rect x={player.x - 16 + ci * 4} y={player.y - 18 + ri * 4}
                  width="4" height="4" fill={retroSpriteColor(cell)} shape-rendering="crispEdges"/>
              {/if}
            {/each}
          {/each}
          <text x={player.x} y={player.y + 28} text-anchor="middle"
            font-size="10" font-weight="700" font-family="'Courier New',monospace"
            fill="#f0ecc8" stroke="#0a1018" stroke-width="3" paint-order="stroke">{player.pos}</text>
          {#if hoveredPos === player.pos}
            <rect x={player.x - 36} y={player.y - 52} width="72" height="18"
              fill="#0a1018" stroke="#e8e8c8" stroke-width="1" shape-rendering="crispEdges"/>
            <text x={player.x} y={player.y - 39} text-anchor="middle"
              font-size="11" font-family="'Courier New',monospace" fill="#e8e8c8">{posLabel[player.pos] ?? player.pos}</text>
          {/if}
        </g>
      {/each}

      <!-- 주자 (픽셀 스프라이트 + GBC 깜빡임) -->
      {#each ([
        runners.first  ? baseField.first  : null,
        runners.second ? baseField.second : null,
        runners.third  ? baseField.third  : null,
      ]).filter((p): p is {x:number,y:number} => p !== null) as rp}
        <g class="retro-runner-blink">
          {#each RETRO_RUNNER as rowStr, ri}
            {#each rowStr.split('') as cell, ci}
              {#if cell !== '.'}
                <rect x={rp.x - 12 + ci * 4} y={rp.y - 16 + ri * 4}
                  width="4" height="4" fill={retroRunnerColor()} shape-rendering="crispEdges"/>
              {/if}
            {/each}
          {/each}
        </g>
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
{:else}
    <svg
      class="field"
      viewBox="0 0 1000 920"
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <radialGradient id="grassGrad" cx="50%" cy="70%" r="65%">
          <stop offset="0%" stop-color="#33883a" />
          <stop offset="55%" stop-color="#2d7a33" />
          <stop offset="100%" stop-color="#1e5e24" />
        </radialGradient>
        <linearGradient id="dirtGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#c98d4c" />
          <stop offset="100%" stop-color="#b87a38" />
        </linearGradient>
        <linearGradient id="warningTrackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#9e6830" />
          <stop offset="100%" stop-color="#b07a42" />
        </linearGradient>
        <radialGradient id="lightGrad" cx="50%" cy="82%" r="68%">
          <stop offset="0%"   stop-color="rgba(255,255,220,0.09)" />
          <stop offset="55%"  stop-color="rgba(255,255,200,0.02)" />
          <stop offset="100%" stop-color="rgba(0,0,10,0.28)" />
        </radialGradient>
        <pattern id="mowPattern" x="0" y="0" width="1000" height="56" patternUnits="userSpaceOnUse">
          <rect x="0" y="0"  width="1000" height="28" fill="rgba(255,255,255,0.028)" />
          <rect x="0" y="28" width="1000" height="28" fill="rgba(0,0,0,0.028)" />
        </pattern>
        <pattern id="seatPattern" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="18" height="18" fill="#1b2a41" />
          <circle cx="5" cy="5" r="2.1" fill="#335177" />
          <circle cx="13" cy="9" r="2" fill="#42648f" />
          <circle cx="8" cy="14" r="1.8" fill="#5176a5" />
        </pattern>
        <filter id="shadow">
          <feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.25" />
        </filter>
      </defs>

      <rect x="0" y="0" width="1000" height="1000" fill="#0d1f11" />

      <!-- 외야 잔디 (관중석 하단 경계에서 시작, 관중석이 위에서 마스킹) -->
      <path d="M0,290 Q500,150 1000,290 L1000,980 L0,980 Z" fill="url(#grassGrad)" />
      <path d="M0,290 Q500,150 1000,290 L1000,980 L0,980 Z" fill="url(#mowPattern)" />

      <!-- 경고 트랙 (외야 담장 안쪽 흙 띠) -->
      <path
        d="M136,754 Q500,126 864,754 L840,716 Q500,164 160,716 Z"
        fill="url(#warningTrackGrad)"
        opacity="0.72"
      />

      <!-- 외야 담장 -->
      <path d="M182,706 Q500,232 818,706" fill="none" stroke="#294760" stroke-width="22" opacity="0.78" />
      <path d="M182,694 Q500,220 818,694" fill="none" stroke="#7fb0df" stroke-width="3"  opacity="0.62" />
      <!-- 담장 상단 하이라이트 -->
      <path d="M184,692 Q500,218 816,692" fill="none" stroke="rgba(180,210,255,0.18)" stroke-width="4" />

      <!-- 내야 흙 (상단 아크 포함) -->
      <path d="M500,920 L300,720 Q500,420 700,720 Z" fill="url(#dirtGrad)" />

      <!-- 내야 잔디 -->
      <path d="M500,580 L640,720 L500,860 L360,720 Z" fill="#2d7230" />
      <!-- 내야 잔디 밝은 줄무늬 -->
      <path d="M500,580 L640,720 L500,860 L360,720 Z" fill="url(#mowPattern)" opacity="0.6" />

      <!-- 마운드 -->
      <ellipse cx={baseField.mound.x} cy={baseField.mound.y} rx="60" ry="40" fill="#b87b3a" />
      <ellipse cx={baseField.mound.x} cy={baseField.mound.y} rx="20" ry="12" fill="#d4aa7a" />
      <!-- 마운드 러버 -->
      <rect x="488" y={baseField.mound.y - 4} width="24" height="7" rx="1" fill="#f0ede8" stroke="#c8c0b0" stroke-width="0.8" />

      <!-- 파울 라인 / 폴 -->
      <line x1={baseField.home.x} y1={baseField.home.y} x2="160" y2="480" class="foul-line" />
      <line x1={baseField.home.x} y1={baseField.home.y} x2="840" y2="480" class="foul-line" />
      <line x1="160" y1="480" x2="160" y2="290" class="foul-pole" />
      <line x1="840" y1="480" x2="840" y2="290" class="foul-pole" />

      <!-- 베이스라인 -->
      <line x1={baseField.home.x} y1={baseField.home.y} x2={baseField.first.x}  y2={baseField.first.y}  class="base-line" />
      <line x1={baseField.first.x}  y1={baseField.first.y}  x2={baseField.second.x} y2={baseField.second.y} class="base-line" />
      <line x1={baseField.second.x} y1={baseField.second.y} x2={baseField.third.x}  y2={baseField.third.y}  class="base-line" />
      <line x1={baseField.third.x}  y1={baseField.third.y}  x2={baseField.home.x}  y2={baseField.home.y}  class="base-line" />

      <!-- 베이스 -->
      <rect x="638" y="658" width="24" height="24" transform="rotate(45 650 670)" class="field-base" />
      <rect x="488" y="508" width="24" height="24" transform="rotate(45 500 520)" class="field-base" />
      <rect x="338" y="658" width="24" height="24" transform="rotate(45 350 670)" class="field-base" />
      <!-- 홈플레이트 (오각형) -->
      <polygon points="484,808 516,808 524,828 500,842 476,828" class="field-base" />

      <!-- 타석 박스 (좌·우) + 포수 박스 -->
      <rect x="440" y="796" width="40" height="54" fill="rgba(190,148,80,0.10)" stroke="#ddc47a" stroke-width="1.5" opacity="0.48" />
      <rect x="520" y="796" width="40" height="54" fill="rgba(190,148,80,0.10)" stroke="#ddc47a" stroke-width="1.5" opacity="0.48" />
      <rect x="476" y="842" width="48" height="28" fill="rgba(190,148,80,0.08)" stroke="#ddc47a" stroke-width="1.2" opacity="0.38" />

      <!-- 관중석 (필드 위에 그려 비필드 영역 마스킹) -->
      <path d="M40,40 Q500,-80 960,40 L960,290 Q500,150 40,290 Z" fill="#17263b" />
      <path d="M80,90 Q500,-10 920,90 L920,330 Q500,220 80,330 Z" fill="url(#seatPattern)" opacity="0.95" />
      <path d="M120,170 Q500,85 880,170 L880,352 Q500,260 120,352 Z" fill="#233a57" opacity="0.85" />

      <!-- 조명 오버레이 -->
      <rect x="0" y="0" width="1000" height="1000" fill="url(#lightGrad)" pointer-events="none" />

      <circle cx={strikeZoneTarget.x} cy={strikeZoneTarget.y} r="12" class="zone-preview" />
      {#if isPitching}
        <circle cx={strikeZoneTarget.x} cy={strikeZoneTarget.y} r="22" class="zone-preview-ring" />
      {/if}

      {#each defenders as player}
        <g
          filter="url(#shadow)"
          class:selected={selectedPos === player.pos}
          role="button"
          tabindex="0"
          aria-label={player.pos}
          on:click={() => selectPosition(player.pos)}
          on:keydown={(e) => e.key === 'Enter' && selectPosition(player.pos)}
          on:mouseenter={() => (hoveredPos = player.pos)}
          on:mouseleave={() => (hoveredPos = '')}
        >
          {#if selectedPos === player.pos}
            <circle cx={player.x} cy={player.y} r="40" class="select-ring" />
          {/if}
          <circle cx={player.x} cy={player.y + 8} r="28" fill="rgba(7, 11, 18, 0.35)" />
          <circle cx={player.x} cy={player.y} r="28" class="player-dot" />
          <text
            x={player.x}
            y={player.y + 8}
            text-anchor="middle"
            font-size="20"
            font-weight="700"
            fill="#ffffff"
          >
            {player.pos}
          </text>
          {#if hoveredPos === player.pos}
            <g class="tooltip-group">
              <rect x={player.x - 36} y={player.y - 60} width="72" height="24" rx="6" fill="rgba(8,18,36,0.92)" stroke="#3a5888" stroke-width="1" />
              <text x={player.x} y={player.y - 43} text-anchor="middle" font-size="15" fill="#c8deff">{posLabel[player.pos] ?? player.pos}</text>
            </g>
          {/if}
        </g>
      {/each}

      {#if runners.first}
        <circle cx={baseField.first.x} cy={baseField.first.y} r="18" class="runner-dot" />
      {/if}
      {#if runners.second}
        <circle cx={baseField.second.x} cy={baseField.second.y} r="18" class="runner-dot" />
      {/if}
      {#if runners.third}
        <circle cx={baseField.third.x} cy={baseField.third.y} r="18" class="runner-dot" />
      {/if}

      {#each ballTrail as pos, i}
        <circle
          cx={pos.x}
          cy={pos.y}
          r={6 - i * 0.6}
          fill="white"
          opacity={(i + 1) / ballTrail.length * 0.35}
        />
      {/each}
      <circle cx={ballPos.x} cy={ballPos.y} r="8.5" class="ball-dot" />
    </svg>
{/if}
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
    position: relative;
  }

  .field {
    width: 100%;
    height: 100%;
    display: block;
  }

  .foul-line {
    stroke: #f7f7f7;
    stroke-width: 5;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.45));
  }

  .foul-pole {
    stroke: #f4c430;
    stroke-width: 8;
    filter: drop-shadow(0 0 4px rgba(244, 196, 48, 0.5));
  }

  .base-line {
    stroke: #f5e7c6;
    stroke-width: 4;
  }

  .field-base {
    fill: #ffffff;
    stroke: #dce0e8;
    stroke-width: 1.3;
  }

  .player-dot {
    fill: #c9382c;
    stroke: #ffffff;
    stroke-width: 4;
    cursor: pointer;
  }

  g.selected .player-dot {
    fill: #0d80ea;
    stroke: #bfe4ff;
  }

  .select-ring {
    fill: none;
    stroke: #4aa8ff;
    stroke-width: 2.5;
    transform-box: fill-box;
    transform-origin: center;
    animation: selectPulse 1.5s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes selectPulse {
    0%, 100% { opacity: 0.75; transform: scale(1); }
    50%       { opacity: 0.2;  transform: scale(1.3); }
  }

  .tooltip-group {
    pointer-events: none;
  }

  .runner-dot {
    fill: #2a7fff;
    stroke: #ffffff;
    stroke-width: 3;
    transform-box: fill-box;
    transform-origin: center;
    animation: runnerAppear 0.35s ease-out;
  }

  @keyframes runnerAppear {
    from { opacity: 0; transform: scale(0.25); }
    to   { opacity: 1; transform: scale(1); }
  }

  .ball-dot {
    fill: #ffffff;
    stroke: #dae4ff;
    stroke-width: 2;
    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.85));
  }

  .zone-preview {
    fill: rgba(101, 213, 255, 0.78);
    stroke: rgba(227, 250, 255, 0.95);
    stroke-width: 2;
  }

  .zone-preview-ring {
    fill: none;
    stroke: rgba(101, 213, 255, 0.72);
    stroke-width: 2;
    stroke-dasharray: 6 4;
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
