# 밸런스 백로그 — v1.0.0 고정 뒤 조정 단계에서 한꺼번에 돈다 (2026-09-03 시작)

> 사용자 확정(09-03): 구현을 전부 끝내고 **수치만 남은 시점**에 v1.0.0 으로 고정 → 수치 조정·테스트 반복으로 안정화 → **1.0.1 출시**.
> 그 전까지 밸런스 값은 **제안값으로 넣고 넘어간다.** 하나씩 묻지 않는다. 여기 한 줄씩 쌓아 두고 조정 단계에서 씨앗 3 × 3회 전후 실측으로 돈다.
> 형식: 값(자리) · 지금 실측 · 재는 법 · 관련 문서.

## 1. 보직 (PLAN_ROLE_RECOMMEND)
| 값 | 자리 | 지금 실측 | 재는 법 |
|---|---|---|---|
| 적합도 가중치 SP/RP/CP · 구종 계수 | `generation_rules.json pitcherRoleRules.weights/arsenal` | 고교 102팀 × 유형 4: **선발 추천 0팀**(신입 구종 1개 → SP 적합도 −5) · A 가 세 벌 비교 중 | `npm run measure:role` "새 산식 추천" 표 |
| 불펜 자리 수 고교 4 · 대학 5 · 독립 3 · 프로 6 | `rosterOpsRules.bullpenSize` | — | 같은 표의 자리없음 열 |
| 고교 선발 투구수 상한 95 | `rosterOpsRules.starterPitchLimit` | 선발 투구 평균 87→85 (거의 안 걸림) | HANDOFF_OP_TO_A §3 계기 · 씨앗 3 |
| 고교 선발 아웃 계수 0.80 | `rosterOpsRules.starterOutsFactor` | 선발 등판당 이닝 5.92→5.31 · 마무리 등판 8→12 | 같음 |
| 고교 마무리 문 8회 고정 · 리드 1~3 | `rosterOpsRules.closerGate` | 마무리 등판 9 (이닝 수치 검증 중) | 같음 |
| 추천 밖 불이익 k=0.30 · 바닥 0.15 | `pitcherRoleRules.offRecommendation` | 미배선(A④) | probe:rolefit(신설 예정) |

## 2. 계약·인센티브 (PLAN_CONTRACT_TERMS)
| 값 | 자리 | 지금 실측 | 재는 법 |
|---|---|---|---|
| 인센티브 후보 9종 문턱(25등판·150이닝·ERA 3.00·10승 …)·금액 | `contractRules.incentives` | 실측 0 | §7-1: draft 12시즌 × 씨앗 3 · 문턱별 달성률 20~50% 목표 |
| 인센티브 총액 ≤ 연봉 20~30% · 항목당 15% · 상한 3개 | 같은 키 | 일반 지식(KBO 관행) | 위와 같이 |
| 역제안 횟수 계수 65·30·40·0 | 계약 협상(성적 `calcSeasonRating` · 구단주 관계) | 미실측 | 협상 열리는 세이브 필요 |
| 수락 확률 인센티브 개수 ×1.02 | 협상 화면 | 제안 | 같음 |
| 🔴 제시 수락 서명액 ≠ 화면 표시(예전부터 · effectiveOffer vs offeredSalary) | `contractDecision` | C③ 발견 | 동작 결함에 가까움 — 조정 단계 첫 항목 |

## 3. 병영 (PLAN_MILITARY_LIFE §40)
감각 감쇠 −1.5 / 상한식 / 접근 1 의 +3 · 박격포 섞음 · 감각 0 전역 은퇴. 실측 §40 표.

**전역 뒤 재회 12종 (B-20 초안)** — 효과 사기 +1~+3 · 성실 +1~+3 · 관계 +4~+5 · 돈 −15~−30만원 · 피로 +2~+4 · 조건 문턱(회복주 ≥2·≥4 · 주차 6~40 · 나이 25 · 명성 40 · 사기 40/55) · 우선순위 601~632. 자리 `resource/data/master/messages/military_reunion.json`. **실측 0** — 아직 `events/conditional/` 에 안 실렸다(잣대 한 줄이 막는다 · `HANDOFF_B_TO_A` B-20). 재는 법: 실은 뒤 `measure:messagekinds` 로 12종 통 수와 전역 뒤 시즌당 몇 통인지.

## 4. 경기·리그 (BALANCE_BASELINE_2026-09-05 §4)
대학 ERA · 2군 타율 · 장타율(홈런 +25% · `resolve_hardness`) · K/9 · 포일(팀당 4~5 · 실제 5~15) · 도루 성공률 64~67%(실제 70~75) · 리그 ERA 5.1~5.4(실제 4.5).

## 5. 세계
독립 나이 상한 둘(FA 재도전 30 · 입단 31 → 31 통일) · 독립 신인 예약석 · 조기입대 출전 비중 0.5 고정 · 트레이드 메디컬 `thread_rng`.

## 6. 소식함
상한 1500(FIFO) · 대시보드 전환 뒤 `mailboxTrimStats.droppedUnread` 추이.

## 7. 못 닿는 이벤트 문턱 (EVENT_UNREACHED_2026-09-03 · B-22)
| 값 | 자리 | 지금 실측 | 재는 법 |
|---|---|---|---|
| 고교 `morale_lte` 다섯 58·50·50·45·34 → **70·62·62·58·45** | `events/**/EVT_HS_{LIFE_CLASSMATE_01,Y1_AFTER_ERROR,Y2_TEAM_SLUMP,Y2_SLUMP,LIFE_SLUMP_CHECK}.json` | 고교 사기 최소 62~68 · ≤60 **0주**(씨앗 3) | `probe:morale --path hs` 전후 · **사용자가 1.0 에서는 안 고친다고 확정(§E)** — 1.1 에 등판 비중과 같이 본다 |
| 대학 `gpa_lte 2` 셋 → **2.4** | `EVT_UNIV_{GPA_DANGER,GRAD_RISK,Y3_GPA_VS_BALL}` | 기본 갈래 GPA 가 2.48 에 갇힌다(normal 0.55 × 4.5) | `measure:slotreach --path univ` × `PB_STUDY_MODE` 셋. ⚠ **값보다 구조가 먼저다** — `school.weeklyStudyMode` 를 쓰는 선택지가 0건이다 |
| `money_lte 200` → **1000** | `EVT_UNIV_Y2_PART_TIME` | 🔴 **한 번도 못 뜬다.** 시작 1200만원 · 대학 주 순현금 +9.5 · 학생 비과세 → 돈이 오르기만 한다. `money_lte` 를 쓰는 유일한 이벤트다 | 같은 판에서 이 한 종이 뜨는지만 보면 된다 |
| `INJURY_SCARE_UNIV` `fatigue_gte 62 → 55` · `condition_lte 55 → 65` | `EVT_UNIV_INJURY_SCARE_UNIV` | 씨앗 셋 전부 0회. **컨디션 분포는 아무도 안 쟀다** | `probe:condition`(없다) 이 있어야 어느 쪽이 병목인지 갈린다 |
| 현역 군 창 좁던 셋의 가중 10·4·4 | `events/pools/military_life.json` | `4dfbc2da5` 에서 올렸고 **올린 뒤 안 쟀다** | `probe:military` 씨앗 3 × 정책 3 재측정 |
| 상무 새로 살린 다섯 | `events/pools/military_common.json` | 🔴 **미측정.** 인용되는 27/34 는 재고 34 시절 값이고 지금은 39다 | 상무 경로로 도달률 한 판 |
