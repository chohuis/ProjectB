<section class="page">
  <h2>로스터</h2>
  <div class="grid">
    <article class="card">
      <h3>선발 로테이션</h3>
      <ul>
        <li>SP1 신인 투수 - OVR 64</li>
        <li>SP2 김준호 - OVR 61</li>
        <li>SP3 이동윤 - OVR 59</li>
      </ul>
    </article>

    <article class="card">
      <h3>최근 컨디션 리포트</h3>
      <ul>
        <li>신인 투수: 체력 양호</li>
        <li>김준호: 어깨 피로 누적</li>
        <li>이동윤: 제구 집중 훈련 필요</li>
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
