<section class="page">
  <h2>재정</h2>
  <div class="grid">
    <article class="card">
      <h3>월간 요약</h3>
      <ul>
        <li>예산 잔액: 4.2억</li>
        <li>운영비: 1.1억</li>
        <li>훈련비: 0.7억</li>
      </ul>
    </article>
    <article class="card">
      <h3>지출 계획</h3>
      <ul>
        <li>장비 교체: 0.4억</li>
        <li>원정 이동비: 0.2억</li>
        <li>의무팀 강화: 0.1억</li>
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

