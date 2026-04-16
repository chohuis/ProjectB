<script lang="ts">
  export let logs: string[];
</script>

<aside class="panel">
  <h3>최근 로그</h3>
  {#each logs as log}
    <p>{log}</p>
  {/each}
</aside>

<style>
  .panel {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 14px;
    min-height: 300px;
  }

  h3 {
    margin: 0 0 10px;
  }

  p {
    margin: 8px 0;
    color: #dce5f7;
  }
</style>

