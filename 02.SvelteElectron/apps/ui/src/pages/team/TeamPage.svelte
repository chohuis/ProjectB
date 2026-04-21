<section class="page">
  <h2>팀</h2>
  <div class="grid">
    <article class="card">
      <h3>팀 상태</h3>
      <ul>
        <li>팀 분위기: 안정</li>
        <li>최근 승률: 0.640</li>
        <li>부상자: 1명</li>
      </ul>
    </article>
    <article class="card">
      <h3>코치 메모</h3>
      <ul>
        <li>수비 집중 훈련 강화</li>
        <li>불펜 운영 로테이션 조정</li>
        <li>주말 원정 대비 체력 분배</li>
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

