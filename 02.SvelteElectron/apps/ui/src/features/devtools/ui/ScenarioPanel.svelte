<script lang="ts">
  // 테스트 시나리오 패널 (dev 전용) — 로직은 전부 `usecases/devScenarios.ts`에 있다.
  // 여기는 실행 버튼과 결과 표시만 한다 (CLAUDE.md: 컴포넌트에 게임 로직 금지).
  import { runDevScenarios, type ScenarioReport } from "../../../shared/usecases/devScenarios";

  export let onClose: () => void;

  let report: ScenarioReport | null = null;
  let running = false;
  let progress = "";
  let savedPath = "";
  let copied = false;

  async function run() {
    if (running) return;
    running = true;
    report = null;
    savedPath = "";
    copied = false;
    try {
      report = await runDevScenarios((done, total, title) => {
        progress = `${done + 1}/${total} — ${title}`;
      });
      // dev 빌드에만 있는 채널이다. 파일로 남겨야 그대로 붙여넣지 않고 읽을 수 있다
      const api = window.projectB as (typeof window.projectB & { logWrite?: (p: string) => Promise<string> });
      if (api?.logWrite) {
        const name = `scenario-${report.ranAt.replace(/[:.]/g, "-")}.log`;
        await api.logWrite(JSON.stringify({ filename: name, content: report.text }));
        savedPath = `resource/logs/${name}`;
      }
    } catch (e) {
      progress = `실행 실패: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      running = false;
    }
  }

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch { /* 클립보드 권한 없으면 파일 경로를 쓰면 된다 */ }
  }
</script>

<svelte:window on:keydown={(e) => { if (e.key === "Escape") onClose(); }} />

<div class="overlay" on:click={onClose} role="presentation">
  <!-- 배경 클릭으로만 닫히므로 여기서는 이벤트 전파만 막는다 (Esc는 window에서 받는다) -->
  <div class="modal" role="dialog" aria-modal="true" aria-label="테스트 시나리오" tabindex="-1"
       on:click|stopPropagation on:keydown|stopPropagation>
    <header class="head">
      <div>
        <strong>테스트 시나리오</strong>
        <span class="sub">화면에 값을 넣어주는 경로를 실제로 돌려 본다 · 읽기 전용</span>
      </div>
      <button type="button" class="ghost" on:click={onClose}>닫기</button>
    </header>

    <div class="bar">
      <button type="button" class="run" on:click={run} disabled={running}>
        {running ? "실행 중..." : report ? "다시 실행" : "실행"}
      </button>
      {#if report}
        <span class="tally">
          <span class="pill pass">통과 {report.summary.pass}</span>
          <span class="pill fail" class:zero={report.summary.fail === 0}>실패 {report.summary.fail}</span>
          <span class="pill skip">건너뜀 {report.summary.skip}</span>
        </span>
        <button type="button" class="ghost" on:click={copy}>{copied ? "복사됨" : "결과 복사"}</button>
      {/if}
    </div>

    {#if running}
      <p class="progress">{progress}</p>
    {/if}

    {#if savedPath}
      <p class="saved">저장됨 → <code>{savedPath}</code></p>
    {/if}

    {#if report}
      <p class="ctx">{report.context}</p>

      <div class="results">
        {#each report.results as r (r.id)}
          <article class="card {r.status}">
            <header class="card-head">
              <span class="mark">{r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "SKIP"}</span>
              <span class="title">{r.title}</span>
              <span class="ms">{r.ms.toFixed(0)}ms</span>
            </header>
            {#each r.problems as p}
              <p class="line problem">{p}</p>
            {/each}
            {#each r.notes as n}
              <p class="line note">{n}</p>
            {/each}
            <p class="line eye">👁 눈으로 볼 것: {r.eyeOnly}</p>
          </article>
        {/each}
      </div>

      {#if report.consoleErrors.length > 0}
        <div class="console">
          <h4>콘솔 출력 {report.consoleErrors.length}건</h4>
          {#each report.consoleErrors.slice(0, 30) as e}
            <p class="line problem">{e}</p>
          {/each}
        </div>
      {/if}

      <p class="foot">
        이 러너는 <strong>화면이 그려지는지는 못 본다.</strong> 👁 항목은 여전히 눈으로 봐야 한다.
      </p>
    {:else if !running}
      <p class="empty">
        실행하면 9개 시나리오가 현재 세이브 상태를 그대로 읽어 확인한다.<br />
        <strong>세계를 바꾸지 않으므로</strong> 몇 번을 돌려도 세이브는 그대로다.
      </p>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center; z-index: 900;
  }
  .modal {
    width: min(920px, 94vw); max-height: 88vh; overflow: auto;
    background: #14171c; border: 1px solid #2c323c; border-radius: 10px;
    padding: 18px 20px; color: #d8dde5;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .head strong { font-size: 17px; display: block; }
  .sub { font-size: 12px; color: #8b95a5; }
  .ghost {
    background: transparent; border: 1px solid #39414e; color: #b9c2cf;
    border-radius: 6px; padding: 5px 12px; cursor: pointer; font-size: 12px;
  }
  .bar { display: flex; align-items: center; gap: 10px; margin: 14px 0 6px; }
  .run {
    background: #2f6feb; border: none; color: #fff; border-radius: 6px;
    padding: 8px 20px; cursor: pointer; font-weight: 600; font-size: 13px;
  }
  .run:disabled { opacity: 0.55; cursor: default; }
  .tally { display: flex; gap: 6px; }
  .pill { font-size: 12px; border-radius: 999px; padding: 3px 10px; }
  .pill.pass { background: #17331f; color: #6fd68b; }
  .pill.fail { background: #3a1c1c; color: #f08a8a; }
  .pill.fail.zero { background: #22272e; color: #7d8794; }
  .pill.skip { background: #2a2718; color: #d4bb6a; }
  .progress, .saved, .ctx, .empty, .foot { font-size: 12px; color: #94a0b0; margin: 6px 0; }
  .saved code { color: #9ecbff; }
  .ctx { color: #b9c2cf; border-left: 3px solid #39414e; padding-left: 10px; }
  .results { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
  .card { border: 1px solid #2c323c; border-radius: 8px; padding: 10px 12px; background: #181c22; }
  .card.fail { border-color: #6b3030; }
  .card.skip { border-color: #57501f; }
  .card-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
  .mark { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
  .card.pass .mark { color: #6fd68b; }
  .card.fail .mark { color: #f08a8a; }
  .card.skip .mark { color: #d4bb6a; }
  .card-head .title { flex: 1; font-size: 13px; color: #dfe5ee; }
  .ms { font-size: 11px; color: #6c7787; }
  .line {
    margin: 2px 0; font-size: 12px; line-height: 1.5;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    white-space: pre-wrap; word-break: break-word;
  }
  .note { color: #93a1b3; }
  .problem { color: #f08a8a; }
  .eye { color: #7fa8d8; margin-top: 6px; }
  .console { margin-top: 14px; border-top: 1px solid #2c323c; padding-top: 10px; }
  .console h4 { margin: 0 0 6px; font-size: 13px; color: #dfe5ee; }
  .foot { margin-top: 14px; border-top: 1px solid #2c323c; padding-top: 10px; }
</style>
