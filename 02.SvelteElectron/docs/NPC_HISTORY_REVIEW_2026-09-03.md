# NPC 이력·군 복무 검토 (2026-09-03)

## D 실측 (2026-09-04 · `scripts/probe-npc-dump.cjs` · 씨앗 20260802 · electron 1개)

A 지정 다섯 항목을 새 게임 NPC 5,798명 전원 덤프(`{npcId, league, age,
proServiceYears, contractYears, salary, militaryStatus, militaryServedUnit}`)
+ 오프시즌 1회 통과 뒤 재덤프로 확인했다. 원본 로그
`resource/logs/d-regress/npcdump_20260802.log` · 전체 덤프
`resource/logs/d-regress/npcdump-20260802-{new,post-offseason}.json`(미추적).

### 1. 나이대별 군필률·계약 상한

| 확인 | 대상 | 실측 | 기대 | 판정 |
|---|---|---|---|---|
| 26~28세 군필률 | 906명(active) | 64.2% | 60% | 근접 — 정상 범위로 본다 |
| 29세+ 군필률 | 1,105명(active) | 84.4% | 100% | 🔴 **15.6%p 미달** — 29세 이상인데 미필/현역인 NPC가 섞여 있다 |
| 33세+ 계약 ≤2년 | 계약보유 323명 | 위반 183건(56.7%) | 위반 0 | 🔴 **과반이 위반** |
| 36세+ 계약 ≤1년 | 계약보유 55명 | 위반 40건(72.7%) | 위반 0 | 🔴 **대다수가 위반** |

- 26~28세는 목표에 근접했지만, **29세 이상이 100%에 15.6%p 못 미친다** — 이
  나이면 예외(면제) 없이 전원 군필이어야 하는데 새 게임 생성 시점부터
  이미 그렇지 않다. 생성 규칙(`generation_rules.json` 군 복무 배정)을 볼 자리다.
- 계약 상한 위반은 **건수가 아니라 비율**이 크다 — 33세+ 는 절반 이상,
  36세+ 는 4명 중 3명이 상한을 넘는 계약을 들고 새 게임을 시작한다.
  `estimate_salary_and_contract`(Rust)가 나이를 계약 기간 상한에 반영하지
  않거나, 반영해도 새 게임 초기화 경로가 그 함수를 안 거치는 것으로 보인다
  — 판단은 A 몫.

### 2. `careerHistory` 마지막 팀 대 현재 소속 일치율

| 시점 | 이력 있는 NPC | teamId 일치 | 일치율 |
|---|---|---|---|
| 새 게임 직후 | 2,560명 | 2,560 | **100.0%** |
| 오프시즌 1회 뒤 | 6,289명 | 5,484 | **87.2%** |

- 새 게임 시점은 완전히 깨끗하다. 오프시즌을 한 번 지나면서 불일치가
  12.8%(805명) 생긴다.
- 불일치 표본 10건이 전부 **독립리그 팀 통폐합·이적**(`TEAM_IND_*` 재편) ·
  드래프트 이적(`TEAM_HS_*`→`TEAM_KBL_*`) · 2군 승격(`_2`→`_1`) 류다 —
  전부 이번 오프시즌에 실제로 일어난 이동이라 **결함이라기보다 시차**일
  개연성이 크다: `careerHistory`는 연간 스탯 라인을 연말에 한 번 적는데,
  트레이드·드래프트·팀 재편은 그 직후 소속만 먼저 바뀌고 이력 행은 다음
  시즌 종료까지 안 생기는 구조라면 이 정도 격차는 "정상 시차"다. **판단은
  A 몫** — `careerHistory`를 소속 변경 즉시 갱신할지, 연말에만 쓸지는
  설계 선택이지 이 실측만으로는 결함 여부를 못 가른다.

### 3. `transactions`(league_transactions) 종류별 집계

| 시점 | 총건수(cap 1000) | 종류별 |
|---|---|---|
| 새 게임 직후 | 1,000 | release 142 · foreign_signing 30 · trade 729 · fa 99 |
| 오프시즌 1회 뒤 | 1,000 | military 48 · fa 269 · retirement 7 · trade 451 · draft 110 · release 85 · foreign_signing 30 |

- 조회는 `id DESC LIMIT 1000`(최신순) — 새 게임 시점의 1,000건은 **세계
  생성 배경 서사**(과거 시즌 압축 생성)이고, 오프시즌 뒤 1,000건은 그 위에
  **이번 오프시즌 실제 처리**(트레이드 451 · FA 269 · 방출 85 · 드래프트
  110 · 군입대 48 등)가 섞여 최신 것부터 잘린 값이다. 실제 총량은 이보다
  많다 — cap 1000 을 넘는지는 `--limit` 없이 카운트 전용 쿼리가 있어야
  정확히 잰다(이번 실측 범위 밖).

### 4. `careerEvents` 집계 (1 오프시즌 뒤 · 2026년분)

```
position_change 132 · draft_picked 110 · trade 24 · waiver_claim 134 ·
retirement 39 · fa_signed 1038 · quit_baseball 358 · release 22 ·
transfer 9 · draft_undrafted 495
```

- `fa_signed`(1,038)·`draft_undrafted`(495)·`quit_baseball`(358) 가 압도적으로
  많다 — 신인 드래프트 미지명과 그로 인한 은퇴·야구 포기가 시즌마다
  대량으로 발생하는 구조다(기존 `HANDOFF_B_TO_A`의 "고교 졸업생 30명 중
  21명이 5시즌 안에 그만둔다" 실측과 결이 같다).
- `trade`(24) 는 `transactions` 표의 `trade`(451)보다 훨씬 작다 — `careerEvents`
  는 주인공 관점이 아니라 NPC 개인 이력에 남긴 이벤트만 세고,
  `transactions` 는 로그 테이블 전체를 세므로 **모집단이 다르다**(당연한
  차이 — 결함 아님).

### 5. `OffseasonEvent` kind 집계 (1 오프시즌 뒤)

```
indie_age_retire 9 · fa_unsigned 327 · fa_rehome 315 · fa_contract 95 ·
fa_independent 9 · fa_unsigned_retire 3 · retire_age 27 · demote_roster 58 ·
release_roster 111 · promote 14 · demote_fielder 8 · release_score 147 ·
retire_no_team 358
```

- `retire_no_team`(358)·`fa_unsigned`(327)·`fa_rehome`(315)·`release_score`
  (147) 순으로 크다 — 오프시즌 결산 소식의 절대다수가 "밀려난" 쪽 사건이다.
  이 분포가 기획 의도인지(리그가 좁아 탈락이 많은 게 정상)는 A·기획 판단.

## 요약 (D → A)

1. **29세+ 군필률 미달(84.4%)** 과 **33/36세+ 계약 상한 대량 위반**은
   실측으로 확인된 값 결함 후보다 — 생성 규칙 또는 계약 산식 확인 필요.
2. `careerHistory` 87.2% 일치율은 시차 가능성이 커서 결함 단정 보류.
3. `transactions`·`careerEvents`·`OffseasonEvent` 집계는 전부 정상 작동
   확인(0건·미배선 없음) — 계측 인프라 자체는 건강하다.
