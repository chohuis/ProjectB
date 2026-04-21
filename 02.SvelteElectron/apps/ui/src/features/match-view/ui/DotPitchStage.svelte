<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  export let animationNonce = 0;
  export let resultText = "준비";

  let canvas: HTMLCanvasElement;
  let frameId = 0;
  let startMs = 0;
  let currentNonce = 0;

  const W = 920;
  const H = 520;
  const totalMs = 900;

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  function drawPixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function drawBackground(ctx: CanvasRenderingContext2D) {
    drawPixelRect(ctx, 0, 0, W, 240, "#2d426d");
    drawPixelRect(ctx, 0, 240, W, 80, "#6a2430");
    drawPixelRect(ctx, 0, 320, W, 200, "#2f7040");

    for (let i = 0; i < 26; i += 1) {
      const x = 20 + i * 34;
      drawPixelRect(ctx, x, 264 + (i % 2) * 2, 18, 18, "#d9e2f2");
      drawPixelRect(ctx, x + 2, 262, 14, 3, "#1f2940");
    }
  }

  function drawField(ctx: CanvasRenderingContext2D) {
    drawPixelRect(ctx, 355, 345, 210, 100, "#8d6c4b");
    drawPixelRect(ctx, 418, 400, 84, 40, "#7b593d");

    drawPixelRect(ctx, 450, 318, 20, 14, "#f4f4f4");
    drawPixelRect(ctx, 430, 350, 15, 12, "#f4f4f4");
    drawPixelRect(ctx, 492, 350, 15, 12, "#f4f4f4");
    drawPixelRect(ctx, 450, 390, 20, 14, "#f4f4f4");
  }

  function drawActors(ctx: CanvasRenderingContext2D) {
    drawPixelRect(ctx, 452, 310, 24, 62, "#f2f2f2");
    drawPixelRect(ctx, 446, 296, 36, 16, "#f54040");
    drawPixelRect(ctx, 445, 372, 14, 24, "#f2f2f2");
    drawPixelRect(ctx, 469, 372, 14, 24, "#f2f2f2");

    drawPixelRect(ctx, 452, 168, 22, 44, "#162f5a");
    drawPixelRect(ctx, 448, 156, 30, 14, "#0f1d3a");
    drawPixelRect(ctx, 446, 212, 30, 24, "#2e2e2e");

    drawPixelRect(ctx, 360, 188, 18, 48, "#141414");
    drawPixelRect(ctx, 352, 174, 28, 12, "#2a2a2a");
  }

  function drawBall(ctx: CanvasRenderingContext2D, progress: number) {
    const t = Math.max(0, Math.min(1, (progress - 0.12) / 0.62));
    if (t <= 0 || t >= 1) return;

    const x = lerp(462, 462, t) + Math.sin(t * Math.PI) * 60;
    const y = lerp(334, 208, t);

    drawPixelRect(ctx, x - 3, y - 3, 6, 6, "#ffffff");
    drawPixelRect(ctx, x + 3, y, 2, 2, "#8ec5ff");
  }

  function drawScene(progress: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);

    drawBackground(ctx);
    drawField(ctx);
    drawActors(ctx);
    drawBall(ctx, progress);
  }

  function tick(now: number) {
    const elapsed = now - startMs;
    const progress = Math.min(1, elapsed / totalMs);
    drawScene(progress);

    if (progress >= 1) {
      frameId = 0;
      return;
    }

    frameId = requestAnimationFrame(tick);
  }

  function runAnimation() {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }

    startMs = performance.now();
    frameId = requestAnimationFrame(tick);
  }

  $: {
    if (animationNonce !== currentNonce) {
      currentNonce = animationNonce;
      if (canvas) runAnimation();
    }
  }

  onMount(() => {
    drawScene(0);
  });

  onDestroy(() => {
    if (frameId) cancelAnimationFrame(frameId);
  });
</script>

<section class="stage-wrap">
  <canvas bind:this={canvas} width={W} height={H} class="stage" />
  <div class="result-chip">{resultText}</div>
</section>

<style>
  .stage-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .stage {
    width: 100%;
    height: 100%;
    border: 1px solid #30415f;
    border-radius: 8px;
    background: #101a2d;
    object-fit: cover;
  }

  .result-chip {
    position: absolute;
    left: 12px;
    bottom: 12px;
    background: rgba(10, 16, 28, 0.82);
    border: 1px solid #2e4269;
    border-radius: 8px;
    color: #f2f7ff;
    font-weight: 600;
    padding: 8px 10px;
  }
</style>
