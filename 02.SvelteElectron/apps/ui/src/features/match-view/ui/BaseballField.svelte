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

  const dispatch = createEventDispatcher<{ selectPosition: { pos: string } }>();

  let selectedPos = "";

  function selectPosition(pos: string) {
    selectedPos = pos;
    dispatch("selectPosition", { pos });
  }
</script>

<div class="wrapper">
  <div class="viewport">
    <svg
      class="field"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="grassGrad" cx="50%" cy="55%" r="65%">
          <stop offset="0%" stop-color="#2f7d32" />
          <stop offset="100%" stop-color="#256b2a" />
        </radialGradient>
        <linearGradient id="dirtGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#c68642" />
          <stop offset="100%" stop-color="#b97838" />
        </linearGradient>
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

      <rect x="0" y="0" width="1000" height="1000" fill="#112d1a" />

      <path d="M40,40 Q500,-80 960,40 L960,290 Q500,150 40,290 Z" fill="#17263b" />
      <path d="M80,90 Q500,-10 920,90 L920,330 Q500,220 80,330 Z" fill="url(#seatPattern)" opacity="0.95" />
      <path d="M120,170 Q500,85 880,170 L880,352 Q500,260 120,352 Z" fill="#233a57" opacity="0.85" />

      <path
        d="M120,760
           Q500,120 880,760
           L880,980
           L120,980
           Z"
        fill="url(#grassGrad)"
      />

      <path
        d="M175,700
           Q500,205 825,700"
        fill="none"
        stroke="#e7f2de"
        stroke-width="4"
        opacity="0.92"
      />

      <path d="M182,706 Q500,232 818,706" fill="none" stroke="#294760" stroke-width="22" opacity="0.78" />
      <path d="M182,694 Q500,220 818,694" fill="none" stroke="#7fb0df" stroke-width="3" opacity="0.62" />

      <path
        d="M500,520
           L700,720
           L500,920
           L300,720
           Z"
        fill="url(#dirtGrad)"
      />

      <path
        d="M500,580
           L640,720
           L500,860
           L360,720
           Z"
        fill="#367a3f"
      />

      <ellipse cx={baseField.mound.x} cy={baseField.mound.y} rx="58" ry="38" fill="#b97b3c" />
      <ellipse cx={baseField.mound.x} cy={baseField.mound.y} rx="18" ry="10" fill="#e8d4bb" />

      <line x1={baseField.home.x} y1={baseField.home.y} x2="160" y2="480" class="foul-line" />
      <line x1={baseField.home.x} y1={baseField.home.y} x2="840" y2="480" class="foul-line" />
      <line x1="160" y1="480" x2="160" y2="290" class="foul-pole" />
      <line x1="840" y1="480" x2="840" y2="290" class="foul-pole" />

      <line x1={baseField.home.x} y1={baseField.home.y} x2={baseField.first.x} y2={baseField.first.y} class="base-line" />
      <line x1={baseField.first.x} y1={baseField.first.y} x2={baseField.second.x} y2={baseField.second.y} class="base-line" />
      <line x1={baseField.second.x} y1={baseField.second.y} x2={baseField.third.x} y2={baseField.third.y} class="base-line" />
      <line x1={baseField.third.x} y1={baseField.third.y} x2={baseField.home.x} y2={baseField.home.y} class="base-line" />

      <rect x="638" y="658" width="24" height="24" transform="rotate(45 650 670)" class="field-base" />
      <rect x="488" y="508" width="24" height="24" transform="rotate(45 500 520)" class="field-base" />
      <rect x="338" y="658" width="24" height="24" transform="rotate(45 350 670)" class="field-base" />
      <polygon points="500,805 520,825 500,845 480,825" class="field-base" />

      <circle cx="500" cy="800" r="62" fill="#7b6a2a" opacity="0.35" />

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
        >
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

  .runner-dot {
    fill: #2a7fff;
    stroke: #ffffff;
    stroke-width: 3;
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
</style>
