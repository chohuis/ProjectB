<script lang="ts">
  export let logs: string[];
</script>

<aside class="panel">
  <h3>최근 로그</h3>
  <div class="logs">
    {#each logs as log}
      <p>{log}</p>
    {/each}
  </div>
</aside>

<style>
  .panel {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  h3 {
    margin: 0 0 8px;
  }

  .logs {
    min-height: 0;
    overflow: hidden;
  }

  p {
    margin: 0 0 7px;
    color: #dce5f7;
    font-size: 13px;
    line-height: 1.35;
  }
</style>
