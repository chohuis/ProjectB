<section class="page">
  <h2>기록</h2>
  <article class="card">
    <h3>최근 5경기</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>상대</th>
            <th>이닝</th>
            <th>실점</th>
            <th>평점</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>부산 마린 고</td><td>5.0</td><td>2</td><td>B+</td></tr>
          <tr><td>수원 퓨전 고</td><td>6.0</td><td>1</td><td>A</td></tr>
          <tr><td>인천 스카이 고</td><td>4.2</td><td>3</td><td>C+</td></tr>
          <tr><td>대구 스피릿 고</td><td>7.0</td><td>0</td><td>S</td></tr>
          <tr><td>강릉 웨이브 고</td><td>5.1</td><td>1</td><td>A-</td></tr>
        </tbody>
      </table>
    </div>
  </article>
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

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 14px;
  }

  h3 {
    margin: 0 0 10px;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    border-bottom: 1px solid #2d3956;
    padding: 8px 6px;
    text-align: left;
    color: #dce5f7;
    white-space: nowrap;
  }

  th {
    color: #9fb0d6;
    font-weight: 600;
  }
</style>
