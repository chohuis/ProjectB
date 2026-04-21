<section class="page">
  <h2>상태</h2>

  <div class="grid">
    <article class="card">
      <h3>컨디션 요약</h3>
      <ul>
        <li>체력: 82</li>
        <li>멘탈: 74</li>
        <li>피로도: 낮음</li>
      </ul>
    </article>

    <article class="card">
      <h3>최근 변동</h3>
      <ul>
        <li>불펜 세션 후 제구 안정 +1</li>
        <li>휴식일 반영으로 피로도 -4</li>
        <li>다음 경기 선발 준비 상태: 양호</li>
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
    margin-bottom: 8px;
    color: #dce5f7;
  }

  @media (max-width: 960px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
