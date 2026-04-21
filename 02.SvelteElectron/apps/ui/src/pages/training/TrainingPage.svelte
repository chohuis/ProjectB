<section class="page">
  <h2>훈련</h2>
  <div class="grid">
    <article class="card">
      <h3>현재 루틴</h3>
      <ul>
        <li>오전: 밸런스 & 코어</li>
        <li>오후: 제구 드릴</li>
        <li>저녁: 영상 분석</li>
      </ul>
    </article>

    <article class="card">
      <h3>훈련 포인트</h3>
      <ul>
        <li>제구 +2.0</li>
        <li>멘탈 +1.0</li>
        <li>체력 +0.5</li>
      </ul>
    </article>
  </div>
</section>

<style>
  .page {
    display: grid;
    gap: 12px;
    min-height: 300px;
  }

  h2 {
    margin: 0;
    font-size: 22px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  ul {
    margin: 0;
    padding-left: 18px;
  }

  li {
    margin-bottom: 6px;
    color: #dce5f7;
  }
</style>
