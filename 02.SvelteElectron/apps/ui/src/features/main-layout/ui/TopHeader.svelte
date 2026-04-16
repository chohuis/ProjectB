<script lang="ts">
  export let dayLabel: string;
  export let teamName: string;
  export let playerName: string;
</script>

<header class="header">
  <div>
    <h1>ProjectB</h1>
    <p>{teamName} · {playerName}</p>
  </div>
  <div class="right">
    <strong>{dayLabel}</strong>
    <button>진행</button>
  </div>
</header>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #121a2b;
    border: 1px solid #2d3852;
    border-radius: 10px;
    padding: 14px 16px;
  }

  h1 {
    margin: 0;
    font-size: 20px;
  }

  p {
    margin: 4px 0 0;
    color: #aebad7;
  }

  .right {
    display: grid;
    gap: 8px;
    justify-items: end;
  }

  button {
    background: #2b4b80;
    color: #fff;
    border: 0;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
  }
</style>

