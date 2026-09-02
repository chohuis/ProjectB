# 선수가 팀에 들어오고 나가는 모든 경로 — 로직·능력치 목록 (2026-09-03)

> 코드에서 읽은 것만 적었다. 값은 규칙 파일(`resource/data/master/players/generation_rules.json`) 키를 함께 적었고, 코드에 박힌 상수는 그 자리를 적었다.
> 능력치 약어: **OVR** = `npc_core_ovr`(투수 pitching.ovr · 타자 batting.ovr) · **폼** = 최근 성적 점수(투수 ERA·타자 OPS를 기준선과 비교 · `promotionRules`) · **구단 성향** = `proTeamProfiles`(win_now_pressure · stability · development_focus · discipline · scouting_quality · prestige · market_appeal · medical_quality).

## 0. 한 장 지도 — 언제 무엇이 도나

### 시즌 중 (매주 `advanceWeek`)
| 주차 | 경로 | 함수 |
|---|---|---|
| 매주 (프로 1군팀) | **콜업 / 콜다운** · 부상자 명단 · 등록말소 잠금 | `market.ts processProTeamCallupCalldown` → Rust `eval_callup_candidates` / `eval_calldown_candidates` |
| 매주 | 포지션 공백 메움(포수 0명 → 야수 전환) | `weekPhases/positionGaps.ts` |
| W22 (`TRADE_DEADLINE_WEEK`) · W39 | **트레이드 창** | `market.ts processTradeWindow` → Rust `generate_trade_proposals` · `eval_trade_value` · `eval_medical_test` · `player_eval_trade_response` |
| W32 (`CAREER_RESULT_WEEK`) | **주인공 진로 결과**(지명·대학·독립·해외) | `advanceWeek.ts` 1158~ → `draftSystem.determineProtagonistDraft` · `universityUtils` |
| W39 (`STOVE_LEAGUE_WEEK`) | **오프시즌 NPC 결정**(명명 NPC 은퇴·재계약·FA 정산) · **주인공 계약 만료**(옵션·재계약·FA) | `market.ts processOffseasonNpcDecisions` · `advanceWeek.ts` 1240~ |
| W40~46 (`FA_RETRY_*`) | 주인공 FA 미계약 재시도 | `advanceWeek.ts` 1362 |
| W50 (`MILITARY_RESULT_WEEK`) | **주인공 병역 판정**(상무 선발 · 28세 통보) | `advanceWeek.ts` 2483~2591 |
| 시즌 개막 | **외국인 교체**(재계약 탈락 → 본국 복귀 · 빈 자리 영입) | `foreignPlayers.ts applyForeignTurnover` |

### 시즌 끝 (`seasonRollover.runWorldSeasonEnd` → `game.ts`)
```
⓪ 학년 진급·졸업(Rust advance_grades) — 고3 → LEAGUE_DRAFT_POOL
① 드래프트(Rust run_draft) — 풀 2배 후보 · 11라운드 · 1~4라운드는 1군
② 병역 통합(game.ts Phase 4) — 전역 → 상무 선발 → 조기입대(25~27) → 일반병(28세+ · 독립/대학 26세+)
③ 오프시즌(Rust run_offseason)
     1 군 복무 중 건너뜀 · 5 연차+FA 선언 · 6 연봉 갱신 · 7 전역 복귀
     8 FA 재배치(원소속 → 같은 리그 빈 팀 → 독립 → 은퇴)
     11 정년 은퇴 → 정원 초과 강등/방출 → 방출 2단계(성적·연봉·뎁스) → 예산 방출 → 웨이버
     11-b 2군 → 1군 보충(fill_first_teams) · 투수 과잉 야수 강등 · 육성선수 만료
     12 진로 배정(Placer) — 소속 없는 사람 전부: 대학(고졸만) → 2군 육성 → 독립(≤31세·예산) → 은퇴
     독립 상한 초과 은퇴(retire_independent_over_age)
④ 고교 신입생 생성(generate_freshmen) — 빈 만큼
```

---

## 1. 들어오는 경로

### 1-1. 고교 신입생 생성 — `repo/slotLifecycleV3.ts generateFreshmenV3` → Rust `generate_freshmen`
- **언제**: 시즌 끝, 진급·졸업 뒤. 팀당 `rosterSize/gradeMax`(31/3 ≈ 10명)만큼 **빈 자리만** 채운다.
- **입력**: `rosterRules.LEAGUE_HIGHSCHOOL`(pitchingOvr 45~70 · battingOvr 45~70 · devRate 45~75 · pitcherRatio 0.45 · ageBase 16) · `neededPositions`(팀에 모자란 포지션 · 투수 최소) · `talentRules`(재능 편차).
- **쓰는 능력치**: 없음(생성). 이때 정해지는 OVR·성장률·재능 등급이 이후 모든 판정의 씨앗이다.

### 1-2. 대학 입학
- **NPC**: 12단계 진로 배정(§3-6)에서 **고졸 미지명자만**(`from_hs`) 대학 자리를 본다. `university_max`(팀당 40) · `university_annual_max`(연간 유입 상한 · 학년 균형) · 포지션 수요(`find_slot`). 능력치 순(OVR 내림차순)으로 돈다.
- **주인공**: W32 `checkUniversityEligibility` — 학교 전력(`tierOfPower`) 등급 S~D별 **내신 등급 ≤ minAcademicGrade** 그리고 **야구 점수 ≥ minBaseballScore**(S 4/40 · A 5/25 · B 6/12 · C 7/4 · D 9/0). 야구 점수 = `calcHsBaseballScore`(시즌 기록·대회·수상).

### 1-3. 드래프트 지명 — Rust `draft.rs select_candidates` + `npc_sim.rs run_draft`
- **후보 자격** `route_of`: 활동 중 · `draftRules.ageMin~ageMax`(19~29) · 한국 국적 · 고교 3학년 / 대학 4학년 / 대학 조기(학년별 OVR ≥ `earlyEntry.universityByGrade` 74·71·68) / 독립(OVR ≥ `earlyEntry.independent` 68) / 드래프트 풀.
- **NPC 점수** `calc_draft_score` = OVR×0.40 + ((OVR−50)/25)²×20 + 성장률×0.35 + 잠재력 등급 보너스×0.1 + 나이 보정(19세 +14 · 해마다 −3 · 바닥 −6). 여기에 스카우트 편향(`scout_bias`) + 팀별 스카우트 품질 소음(`draftScoutingRules.span` 6 · 품질 낮을수록 큼) + **팀 포지션 수요**(`needBonus` 1 · `needSaturation` 3) + 라운드별 무작위 폭(`r×1.2`, 최대 6).
- **순서**: 후보를 점수순으로 `rounds×팀수×boardCandidateMultiplier`(2배)까지 자르고, 11라운드 스네이크로 팀마다 그 시점 최고 점수를 뽑는다. **1~4라운드**(`firstTeamRounds`)는 1군, 나머지 2군. 계약은 `contract.byPick`(전 픽 연봉 3000 · 보너스 픽 순 50000→2000 · 3년 · 팀 지수 0.85~1.15).
- **쓰는 능력치**: OVR · development_rate · pro_potential_tier · age · 포지션 · (팀) scouting_quality · 로스터 포지션 수.
- **주인공** `determine_protagonist_draft`: 동급 투수 백분위×0.6 + OVR 정규화((OVR−40)/45)×0.4 + 팀 에이스 순위(1위 +8 · 2위 +3) + 대회 점수((tour−20)×0.2) + 수상(타이틀 6 · MVP 10 · 최대 20) − **부상 감점**(중 2 · 중증 10 · 수술 18 · 최대 45 · **최근 3시즌만** `draftInjuryCounts`) + 스카우트 점수((scout−30)×0.2). 78점 미만 = 미지명. 라운드 = 11 − (점수−78)×0.4.

### 1-4. 독립리그 입단
- **NPC**: 12단계 배정에서 대학·2군 자리를 못 받은 사람 — `independent_age_max`(31) 이하 · `independent_max`(45) · **예산 게이트**(연봉을 먼저 구해 팀 총연봉+연봉 ≤ 예산). FA 미계약자도 §3-4에서 같은 조건으로 들어온다(`fa_independent`).
- **주인공**: W32 `indieCutOfPower` — 팀 전력별 OVR 문턱(전력 4+ 54 · 3 49 · 2 44 · 그 외 39). 상무는 지원 불가(`isApplicableIndependent`).

### 1-5. 2군 육성선수 — `developmentPlayerRules` · Placer 2단계
- 12단계에서 대학을 못 가는 사람(프로 방출자·대졸 미지명)이 `farm_max + development_max`까지 2군에 들어온다. 조건: 외국인 아님 · **올해 육성 만료 방출자 아님**(회전문 차단) · OVR 42~64 · 연간 팀당 `maxPerYear` 4 · `intakeMax` 10 · 연봉 2000 · 1년.
- **만료** `development_expired`: 한 시즌 뒤 OVR이 **기준(development_ovr)보다 올랐으면 1년 연장**, 아니면 방출 → 12단계로.

### 1-6. 외국인 영입 — `foreignPlayers.ts applyForeignTurnover`
- **언제**: 시즌 개막. `foreignRules`: KBL만 · 팀당 3 · 투수 최대 2 · OVR 66~94 · 25~34세.
- **재계약**: `ovr + 폼×formWeight(14) ≥ renew.ovrMin(73)` 그리고 `age ≤ renew.ageMax(36)`. 탈락은 방출(본국 복귀 · `release` 경력).
- **영입**: 풀(활동 중 · 나이·OVR 범위)에서 팀 부족분만큼 씨앗 난수로 뽑는다(투수 상한 먼저). 연봉은 `salaryRules` + 팀 연봉지수.

### 1-7. 콜업 (2군 → 1군) — Rust `team_engine.rs eval_callup_candidates`
- **언제**: 매주. 월초(`isMonthStart`)는 전부, 그 외 주는 `urgentOnly`(부상 공백). 등록말소 잠금 `demotionLockWeeks` 2주 안의 선수는 후보 제외.
- **규칙**: 2군 각 선수(`registrable`)에 대해 1군 같은 포지션 풀을 찾는다. 1군에 그 포지션이 없으면(`gap_fill`) 같은 부류(투수/야수) 중 2명 이상인 포지션에서 최약자를 고른다. 단 2군이 최소치(`farmMinPitchers` 8 · `farmMinBatters` 9) 이하이면 안 올린다. 포수(`is_specialist_position`)는 2군에 2명 이상일 때만.
- **점수** `rated` = OVR + 폼×formWeight(8, 코치 `callupMod` 0.7~1.3 배). 2군 선수 rated − 1군 최약자 rated ≥ **threshold = 10 − win_now_pressure×0.05** 이면 교체 후보.
- **쓰는 능력치**: OVR · ERA/이닝(`pitcherEraBaseline` 4.5 · `pitcherFullInnings` 40) · OPS/타석(`batterOpsBaseline` 0.7 · `batterFullPa` 120 · `batterOpsFloor` 0.45) · 부상(IL) · 구단 win_now_pressure · 코치 보정.
- 주인공도 같은 풀에 들어간다(`moveMap.get(g.protagonist.id)` → 리그 전환).

### 1-8. 2군 → 1군 오프시즌 보충 — Rust `fill_first_teams`
- 1군이 정원 최소(`rosterLimits`) 미만이거나 야수가 `FIRST_TEAM_MIN_BATTERS`(14) 미만이면 2군에서 **OVR 순**으로 올린다(`promote` 사건).

### 1-9. 웨이버 — Rust `waiver_claim` (`waiverRules`)
- 방출 사건(`release_score/roster/budget`) 직후, 소속 없는 방출자를 **정원 남는 팀**이 로스터 작은 순으로 주워 간다. 조건: OVR ≥ 그 팀 최약자 OVR + `ovrMargin`(−3) · 팀당 `maxPerTeam` 2.

### 1-10. FA 계약
- **NPC 선언**(Rust run_offseason 5): 1군 리그 · 외국인 아님 · `pro_service_years ≥ faRules.eligibleYears`(KBL 5 · ABL 6 · JBL 4) · 마지막 FA 뒤 `FA_REACQUIRE_YEARS`(4) 경과 → `LEAGUE_FREE_AGENT`.
- **구단 입찰** `eval_fa_bid`: 관심 50 시작 · 포지션 수요 +30 · OVR ≥ 75 +15 · 구단 stability 높고 28세+ +10 / 낮고 24세− +10 / 높고 24세 미만 −15 / 낮고 32세+ −20 · 요구 연봉이 입찰 상한(연봉 여유×0.35, 바닥 총연봉×`bid_floor_ratio`) 초과 −25 · 외국인이면서 overseas_ambition < 30 −30. 입찰액 = 시장가 × (1 ± 스카우트 소음 (100−scouting_quality)/100×0.25) × win_now 배수 · 연수는 stability로 · 보너스는 market_appeal · **노트레이드 조항**(prestige·stability > 60 · 30세+ · OVR 70+) · 팀 옵션(win_now < 40 · 35%).
- **재배치**(Rust 8): 원소속에 자리 있으면 복귀(`fa_rehome`) → 같은 원리그 빈 팀 → 독립(≤31세) → 은퇴(`fa_unsigned_retire`). 보상 등급 `faRules.grades`(연봉 백분위 A 30% / B 60% / C).
- **주인공** `faEngine.generateFaOffers`: 허용 리그(프로면 셋 다) · 자리 있는 팀 · 해외 팀은 `postingInterest`(동급 백분위×0.6 + OVR 정규화×0.4 + 스카우트 + ERA + 명성(fame−40)×0.12 + 수상×5 + 연차 보정) ≥ 50 · `OVERSEAS_FLOOR`(리그별 OVR·명성 바닥). 각 팀 관심은 같은 `eval_fa_bid`(관심 ≥ `bidInterestMin` 80).
- **쓰는 능력치**: OVR · age · 요구 연봉·연수 · 시장가 · overseas_ambition · fame · 수상 · 구단 성향 6종 · 팀 연봉 여유.

### 1-11. 트레이드 (양방향) — Rust `generate_trade_proposals` → `eval_trade_value` → `eval_medical_test` → `player_eval_trade_response`
- **언제**: W22 · W39, 리그 안에서만(리그 넘는 트레이드 없음 · 외국인 제외).
- **제안 생성**: 순위 하위 30%(`rank_pct > 0.70`) = seller · 상위 30% + win_now > 60 = buyer. 포지션 **과잉(3명+) ↔ 결핍(≤1명)** 짝을 찾고 `mutual = (a+b)/2 > 60`(a = 주는 OVR×0.5 + 받는 OVR) 이면 제안. win_now < 40 팀은 베테랑 1 ↔ 유망주 2 묶음(차이 < 15).
- **가치** `eval_trade_value`: OVR×1.5 · stability 팀은 27~31세 ×1.2 / 23세 미만 ×0.85 · development_focus 팀은 ≤23 ×1.3 / >32 ×0.7 · win_now 팀은 OVR 70+·25세+ ×1.25 / 유망주 ×0.7 · 포지션 수요 +20 · 연봉 부담 감점. 수락 확률 = 0.5 + 순가치/100 (0.05~0.95) · **0.35 미만 기각**.
- **메디컬**: 부상 심각도·남은 주(>20 +0.15 · >8 +0.08)·경력 부상 수(4+ 큰 감점)·30세+ 재발·약물 이력 → 거절 확률 × (0.7 + medical_quality×0.006).
- **선수 응답**: 노트레이드 조항 있을 때만 — loyalty×0.6 + stability_preference×0.3 + 고향팀 +30 − 목적지 순위×ambition − 출전 기대×competitive_drive − 연봉 20% 인상×greed.
- **주인공**: 같은 흐름에서 `pending trade`로 멈추고 사람이 수락/거절(`contractDecision.acceptTrade/rejectTrade`).

### 1-12. 상무(체육부대) 입대 — `game.ts` Phase 4 ② · Rust `calc_sports_unit_candidates/selection`
- **후보**: 프로 리그 소속 한국인 · 20~29세 · 미필. **OVR 순 상위 topN**(주인공은 29 + 본인). 정원 `annualIntake = rosterSize(26) / 복무년(2) = 13` · 팀당 `maxPerTeam` 3 · **Phase 1**(전역자 포지션 결원 먼저 채움 · `phase1Ratio` 0.5 = 최대 6) → Phase 2 나머지 OVR 순.
- **쓰는 능력치**: OVR · 나이 · 포지션 · 소속팀(팀당 상한).

### 1-13. 일반병 입대 — `game.ts` Phase 4 ③ · Rust `calc_early_enlist_decisions` · `pick_general_enlistees`
- **강제**: 프로 28세+ · 독립/대학 26세+ (미필). 30명 초과면 씨앗 셔플로 30명.
- **조기(자발)**: KBL 25~27세 — 확률 = 나이(27 0.20 · 26 0.12 · 25 0.05) + **OVR 리그 하위 20% +0.35 / 35% +0.20** + 출전 비중 20% 미만 +0.30 / 35% +0.15 + 계약 1년 이하 +0.20. (출전 비중은 지금 0.5 고정으로 넘긴다 — `game.ts` 3357.)
- **주인공**: W50 상무 지원했으면 위 선발에 `isProtagonist`로 들어가고, 탈락하면 `militaryEnlistAsk(rejected)` · 28세면 `overdue` 통보.

### 1-14. 국가대표 소집(임시 이탈) — Rust `national_team.rs select_squad`
- `internationalRules` 대회 주(올림픽 W30 · 월드컵 W10 · 아시안게임 W38) · `age ≤ ageMax`(29) · 점수 = **OVR + 폼×8** 순 · 투수 정원의 절반 · 팀당 `maxPerTeam` 4. 성적 `exemptionRank` 이내면 병역 면제(`military_exempt`).

---

## 2. 나가는 경로

### 2-1. 졸업·진급 — Rust `advance_grades`
- 고교 3학년 → `LEAGUE_DRAFT_POOL`(소속 비움 · 경력 기록). 대학은 4학년 → 드래프트 후보(`route_of`). 능력치 무관.

### 2-2. 콜다운 (1군 → 2군) — Rust `eval_calldown_candidates`
- 1군 정원 초과분(`over`)만큼. 점수 = (60 − rated)⁺ + 연봉/100,000 + (win_now > 60 이고 rated < 65 → +10) + (development_focus > 60 이고 33세+ → +8). 선발 6명(`FIRST_TEAM_MIN_STARTERS`)·야수 14·투수 12 최소선은 잠근다. 내려간 사람은 `demotionLockWeeks` 2주 재등록 불가.

### 2-3. 정년 은퇴 — Rust `normalize_offseason_npcs`
- 35세 이상만. 확률 = 0.06×(나이−34) + (OVR < 55 이면 (55−OVR)×0.01) · 최대 0.72. 씨앗 난수. → `retire_age`.

### 2-4. 은퇴 권고(명명 NPC · 주인공) — Rust `eval_retirement_suggestion` + `player_eval_retirement_response`
- **언제**: W39 오프시즌 결정(명명 NPC) · 주인공은 `evalRetirementPressure`.
- **권고 점수**: 38세+ 40 / 35세+ (나이−35)×8 · OVR 추세 < −3 +20 / < −1.5 +10 · 연봉/시장가 > 1.5 +15 · 같은 포지션 유망주 OVR ≥ 본인 +10 · discipline > 70 +8 · stability > 70 이고 fame > 30 −10. **≥ 40 이면 권고.**
- **선수 응답**: 저항 = competitive_drive×0.5 + (40−나이)×1.5 + 추세 > −1 +20 + 타팀 관심 +25 − loyalty×0.2. **저항 < 50 이면 수락**(은퇴).
- 주인공 수술 은퇴는 `retirementRules.surgery`(36세+ 0.65 · 33세+ 0.35 · 이전 수술 0.4 · 기본 0.05).

### 2-5. 정원 초과 강등·방출 — Rust `normalize_offseason_npcs` (`release_roster` · `demote_roster`)
- 1군이 `rosterLimits` 최대를 넘으면 초과분을 **OVR 낮은 순**으로 2군에 내리고(투수/야수 최소선은 지킴), 2군도 차면 방출(`release_roster`). 진로 배정이 못 도는 세계면 바로 은퇴(`retire_no_team`).

### 2-6. 방출 2단계(성적·연봉·뎁스) — Rust `release_second_stage` → `team_engine.rs eval_release_priority`
- 정원 안이어도 돈다. 외국인 제외. 점수 = (50 − 최근 성적)×0.8 + 연봉/시장가 > 1.5 +20 (> 2.0 +30 더) + 같은 포지션 뎁스 ≥ 4 +15 + 35세+ (나이−35)×3 + (discipline > 70 이고 professionalism < 35 → +25) − (stability > 70 이고 30세+ → 10) · win_now > 80 이면 ×1.3 · 구단주 관계 감점. 리그별 문턱(`threshold_by_league` / `score_threshold`) 이상만, 팀당 `max_per_team`, 최소 정원은 지킨다.
- **쓰는 능력치**: 최근 성적(`perf_scores` = `calcNpcPerfScore`) · 연봉 · 팀 평균 연봉(시장가 대용) · 나이 · professionalism · 포지션 뎁스 · 구단 성향 · owner_relation.

### 2-7. 예산 방출 — Rust `release_over_budget`
- 팀 총연봉 > `team_budgets`(구단 재정)이면 같은 `eval_release_priority` 점수 높은 순으로 예산 아래가 될 때까지 방출(최소 정원 유지 · 외국인 제외).

### 2-8. 투수 과잉 야수 강등 — `demote_fielder`
- 1군 투수가 최소선을 넘겨 야수 자리를 잠식하면 야수 최약자를 2군으로.

### 2-9. FA 미계약 — §1-10 재배치 끝: 독립(≤31세) 아니면 `fa_unsigned_retire`.

### 2-10. 12단계 진로 배정에서 갈 곳 없음 — `Placer.place` 끝: 대학·2군·독립 전부 실패하면 **은퇴(`quit_baseball` 계열)**. 능력치 순으로 돌기 때문에 낮은 OVR이 먼저 밀려난다.

### 2-11. 독립리그 나이 상한 — Rust `retire_independent_over_age`
- 시즌 끝 `independent_age_max`(31) 초과 잔류자 은퇴(`indie_age_retire`). (B 실측 뒤 09-03 추가.)

### 2-12. 외국인 재계약 탈락 — §1-6 (본국 복귀).

### 2-13. 입대(이탈) — §1-12 · §1-13. 소속은 `LEAGUE_MILITARY`로, `original_team_id` 보존.

### 2-14. 전역(복귀) — Rust run_offseason 7 · `game.ts` Phase 4 ①
- `discharge_year` 도달 → 원소속 복귀(자리 없으면 FA 재배치 §1-10 경로). 어느 부대였는지 남긴다. 주인공은 `dischargeProtagonist` → 병영 환산(`applyMilitaryDischarge`).

### 2-15. 주인공 계약 만료 — `advanceWeek.ts` W39
- 잔여 1년: 팀 옵션(구단이 행사 여부) / 선수 옵션 → 재계약 제안(`calcOfferedSalaryForProtagonist` · 성적·시장가·구단 예산) 또는 FA 자격이면 시장(`isFaEligible`: 연차 ≥ 리그 기준). 잔여 0: 재계약 제안 또는 FA. 미계약이면 W40~46 재시도, 끝내 없으면 독립·은퇴 갈래.

---

## 3. 능력치 → 어디에 쓰이나 (역색인)

| 능력치·입력 | 쓰는 경로 |
|---|---|
| **OVR**(core) | 드래프트 점수 · 콜업/콜다운 rated · 상무 선발(유일 기준) · 국대 · 웨이버 · 정원 초과 순서 · 12단계 순서 · 정년 은퇴 가산 · FA 관심(≥75) · 트레이드 가치 · 조기입대(리그 백분위) · 대학 조기/독립 진입 문턱 · 외국인 영입·재계약 · 은퇴 권고(유망주 비교) |
| **폼**(ERA·OPS 대 기준선) | 콜업/콜다운 · 국대(×8) · 외국인 재계약(×14) · 방출 2단계(최근 성적) · 재계약 연봉 |
| **나이** | 드래프트(19세 +14 · 해마다 −3) · 정년(35+) · 은퇴 권고(35/38) · 방출(35+) · FA 관심(24/28/32 경계) · 트레이드 가치(23/27~31/32) · 상무(20~29) · 일반병(28/26) · 조기입대(25~27) · 독립 상한(31) · 국대(≤29) · 콜다운(33+) · 외국인(25~34 · 재계약 ≤36) |
| **성장률·잠재력 등급** | 드래프트 점수(×0.35 · 등급 보너스) |
| **연봉·시장가·요구 연봉** | 콜다운 · 방출 2단계·예산 방출(연봉/시장가) · FA 입찰 상한 · 트레이드 연봉 부담 · 은퇴 권고 · 육성선수 연장 |
| **부상**(심각도·남은 주·경력 수·수술) | 트레이드 메디컬 · 주인공 드래프트 감점(최근 3시즌) · 콜업 IL 제외 · 수술 은퇴 |
| **성격**(professionalism · loyalty · competitive_drive · ambition · greed · stability_preference · overseas_ambition) | 방출 2단계(professionalism) · 은퇴 응답(competitive_drive · loyalty) · 트레이드 응답(loyalty · stability_preference · ambition · competitive_drive · greed) · FA 관심(overseas_ambition) |
| **명성·수상·대회** | 주인공 드래프트 · 포스팅 관심 · 은퇴 권고(fame) · 대학 야구 점수 |
| **스카우트 점수·품질** | 주인공 드래프트((scout−30)×0.2) · NPC 드래프트 소음 · FA 입찰 소음 · 포스팅 |
| **내신·GPA** | 대학 입학(등급 ≤ 기준) · 대학 졸업 대안 경로 |
| **구단 성향 8종** | 콜업 문턱(win_now) · 콜다운 · 방출 2단계(discipline · stability · win_now · owner) · FA 입찰(stability · scouting · win_now · market_appeal · prestige) · 트레이드(seller/buyer · stability · development_focus · win_now · medical_quality) · 은퇴 권고(discipline · stability) |
| **로스터 상태**(정원 · 포지션 수 · 뎁스 · 최소선) | 콜업 gap_fill · 콜다운 잠금 · 정원 초과 · 방출 뎁스 · 드래프트 팀 수요 · 트레이드 과잉/결핍 · 웨이버 · 상무 Phase 1 · 12단계 `find_slot` |
| **예산·총연봉** | 예산 방출 · FA 입찰 상한 · 독립 입단 게이트 · 트레이드 연봉 여유 |
| **씨앗 난수** | 정년 은퇴 · 드래프트 폭 · FA 소음 · 트레이드 수락 · 조기입대 · 외국인 영입 · 일반병 셔플 (전부 `worldSeed`+연도 씨앗 · `Math.random` 없음 · 메디컬만 `thread_rng`) |

## 4. 코드에서 보인 것 (판단은 사용자)
- **조기입대 출전 비중이 0.5 고정**이다(`game.ts` 3357 `playingTimePct: 0.5`) — 실제 출전 기록이 있는데 안 쓴다.
- **트레이드 메디컬만 `thread_rng`**(씨앗 무관 · `eval_medical_test`) — 계측 재현에서 이 갈래만 흔들린다.
- **국대 소집**은 팀 이탈이 아니라 겹침(로스터에 남는다) — 이 목록엔 참고로만 넣었다.
- 상무 선발은 **OVR 하나**만 본다(성격·성적·나이 가중 없음). 기획(§39 상무 탭)에서 손댈 자리.
