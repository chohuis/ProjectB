<script lang="ts">
  export let morale: number;
  export let fatigue: number;
  export let upcoming: string[];
</script>

<section class="grid">
  <article class="card">
    <h3>선수 상태</h3>
    <p>사기: {morale}</p>
    <p>피로: {fatigue}</p>
  </article>

  <article class="card">
    <h3>다가오는 일정</h3>
    {#each upcoming as item}
      <p>{item}</p>
    {/each}
  </article>
</section>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 14px;
  }

  h3 {
    margin: 0 0 10px;
  }

  p {
    margin: 6px 0;
    color: #dce5f7;
  }
</style>

