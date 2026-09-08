# 계측 보고서 서식 — 정본 (사용자 확정 2026-09-09)

> 목업: `https://claude.ai/code/artifact/19bbb864-2164-479c-a815-dbc998f2c3b1` (숫자는 전부 예시)
> 사용자: 「어느 정도 돌려서 결과가 모이면 각 진행을 #1~#xx 로 해서 **통합 Result 랑 각각 어떻게 되고 어느 중요 포인트가 있었는지** 보고 싶다」

## 판마다 `runs/#NN.json` 하나

**한 해가 한 줄**(사용자 확정). 열은 이렇다:

`연도 · 나이 · 무대 · 소속 · 연봉 · G · IP · ERA · W-L · OVR · 노말 · 레어 · 유니크 · 히든 · 통지 · 그해 있었던 일`

- **등급은 넷**(노말·레어·유니크·히든). **에픽은 없다.** **통지**는 등급 밖이라 추첨에 안 걸리지만 **해마다 몇 번인지 같이 적는다** — 세계가 그 선수에 대해 결정을 내린 횟수라 굴곡이 그대로 보인다.
- 「그해 있었던 일」의 정본은 **`recentOutcomes`**(A 가 통지 레인에서 만든 칸 — callup·demote·eliminated·champion·drafted·undrafted·award)와 **`careerEvents`**(draft_picked·fa_signed·foreign_signing·graduation·military_enlist·military_discharge·military_exempt·release·trade·retirement). **따로 정의하지 않는다** — 통지의 정의가 곧 「중요 포인트」다.
- 머리에: 씨앗 · 프리셋 · 학교 · 계측 성향 · 최고 OVR · 통산 승 · 은퇴 나이.
- 꼬리에: 진로 갈래 · 1군 정착 나이 · 최고 연봉 · 부상으로 날린 주 · 구종 개수와 평균 등급 · 🔴 **예외 횟수** · 폴백.

⚠ **연도 한 줄 수준으로 요약해 남긴다**(사용자 확정). 원본이 필요하면 그 판만 다시 돌린다 — 15년 × 20판이면 300시즌이라 다 남기면 파일이 커진다.

## 통합 `runs/summary.md` (+ `summary.json`)

**한 판이 한 줄**: `# · 씨앗 · 프리셋 · 진로 · 최고 무대 · 프로 시즌 · 통산 승 · 최고 OVR · 최고 연봉 · 히든 · 결말`

위에 요약 타일 — 프로 도달 · **고졸 직행 지명(목표 30~40%)** · 해외 진출 · 히든을 만난 판 · 최고 OVR 중앙 · 🔴 **삼킨 예외가 난 판**.
아래에 분포 막대 — 진로 갈래(목표선과 나란히) · 등급별 빈도.
꼬리에 총 벽시계 · 동시 판 수 · 정지로 끊긴 판 · 폴백.

🔴 **목표를 벗어난 칸은 빨강으로.** 지금 아는 목표: 고졸 직행 30~40% · 레어 3~6/시즌 · 유니크 1~2/시즌 · 폴백 0.

## 데이터는 이미 다 있다 — 꺼내는 자리만 없다

| 무엇 | 어디 |
|---|---|
| 연도별 성적 | DB `season_stats`(연도 × 리그 × 선수) · 통로 여섯(`seasonGetHistoryYears`·`…Standings`·`…LbStats`·`…Postseason`·`…Tournaments`) — **화면 기록 탭이 이미 쓴다** |
| 연봉·계약 | `protagonist.contract`(지금) · **`contractHistory`**(지나온 것 전부 · 종류 라벨 포함) |
| 해외 | 리그 `LEAGUE_KBL`/`ABL`/`JBL` · `careerEvents.foreign_signing` · 해외 2군 지원(`overseas` · 합격 팀까지) |
| 중요 포인트 | `recentOutcomes`(주차까지) · `careerEvents`(연도) |

**새로 만드는 게 아니라 이어 붙이는 일이다.** `perfEntry` 가 끝날 때 이걸 꺼내 한 번 쓰면 된다.
