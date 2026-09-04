# 구종 학습 안내·경고 (1.0.1 예정 · 2026-09-04 조사)

> 사용자 요청 셋을 1.0.0 에 넣으려다 **1.0.1 로 미뤘다**(사용자 확정 09-04). 조사는 끝나 있으니 다시 하지 마라.

## 1. 지금 어떻게 도는가 (코드 실측 · 파일:줄)

| 무엇 | 자리 | 사실 |
|---|---|---|
| 습득 시작 | `pages/training/TrainingPage.svelte:390` → `stores/game.ts:2744 startPitchTraining()` | **훈련 화면 하나뿐**. `protagonist.trainingPitchState = {id, progress:5}` |
| 진행도 | `types/save.ts:338` | `{ id, progress }` · 완료 시 `undefined` 로 지우고 `pitches[]` 로 편입 |
| 완료 판정 | `engine-native/src/growth_engine.rs:585~611` | 100 이상이면 신규는 `grade:1` 추가 · 보유는 `grade+1`(상한 5) · `pitch_state_action="clear"` → `utils/growthEngine.ts:80` → `usecases/advanceWeek.ts:724` 가 매주 반영 |
| 훈련 슬롯 | `TrainingPage.svelte:590~621` · `TrainingPlanState` | **3칸**(주·보조1·보조2). 구종은 **3번 칸 전용** — `slot12Programs`(107행)가 `TRN_PITCH_DEV` 를 1·2번에서 뺀다 |
| 프로그램 값 | `training/programs.json:67~79` | `progressPerWeek 24.0` · `fatigueCost 4.0` · `conditionCost 2.0` · `baseXp 0` |
| 등급별 감속 | `growth_engine.rs:525~536` | grade 0·1 ×1.00 · 2 ×0.667 · 3 ×0.333 · 4+ ×0.222 |
| 해금 조건 | `training/pitch_unlock_rules.json` · 평가는 `TrainingPage.svelte:150` | `min_stat`·`multi_stat`·`always` |
| 보유 상한 | `training/pitch_catalog.json` `maxLearned: 5` | 동시 학습은 1개(`canStart()` 382행이 `!trainingPitch` 요구) |

**배우는 중의 대가 — 이미 다 있다.**
- 경기 흔들림: `utils/arsenal.ts:67 developingDifficultyOf()` 가 `pitch_catalog.formDifficulty`(0~3)를 읽어 `runAutoAdvance.ts:123` 으로 실어 보내고, `match_engine.rs:232` → `tuning.rs:46~53` 에서 커맨드 `difficulty×1.6×skill` · 제구 `×1.1×skill`. 훈련 화면 미리보기(`TrainingPage.svelte:198`)도 **같은 엔진 함수**를 부른다.
- 기회비용: `growth_engine.rs:519~538` — 3번 칸이 구종이면 그 칸 몫의 성장이 0(1·2번은 정상).

🔴 **슬롯에서 빼도 흔들림은 남는 것으로 보인다** — 흔들림은 슬롯 선택이 아니라 `trainingPitchState` 존재에 붙어 있고, 빼도 그 상태는 안 지워진다(`growth_engine.rs:586` 은 그 주 진행만 건너뛴다). **1.0.1 첫 단계에서 이것부터 확인하라**(맞으면 문구만 쓰면 되고, 아니면 그렇게 되도록 배선).

**없는 것 셋**
- 「구종을 안 배우고 있다」 안내: `messages/*.json`·`events/**` 전수에 없음. 훈련 화면 코치 조언(`TrainingPage.svelte:353`)에도 없음.
- 슬롯 고정: `game.ts:1787 setTrainingPlan()` 에 가드 없음. 오히려 `TrainingPage.svelte:638` 이 「해제하면 진행이 멈추고, 다시 등록하면 이어집니다」로 **안 잠그는 것을 문구로 못박아** 두었다.
- 소식 → 훈련 화면 이동: `MainPage.svelte:82 tabForPending()` 이 모든 종류를 `news` 한 탭으로만 보낸다. `MainTabId`(`types/main.ts:9`)에 `training` 이 없고 `MeTabId` 하위라 **반환 타입 자체가 못 가리킨다.**

⚠ **죽은 코드 둘**: `game.ts:2757 completePitchLearning()` · `2779 advancePitchProgress()` — 호출부 없음(엔진 경로가 정본).

🔴 **이벤트 둘이 습득과 안 이어져 있다**: `EVT_HS_Y2_NEW_PITCH` · `EVT_PRO_NEW_PITCH_IDEA`(소식 `MSG_HS_Y2_NEW_PITCH` templates.json:645 · `MSG_PRO_NEW_PITCH_IDEA` :1518). `decision_templates.json:1099`·`:3721` 의 효과가 무브먼트 XP 와 피로뿐 — `startPitchTraining` 을 안 부른다. **지금은 분위기용 글이다.**

## 2. 사용자 확정 (2026-09-04)

- 슬롯은 **고정하지 않는다.** 뺄 수 있되 **뺄 때 경고**한다 — 「진행이 멈추고, 그동안에도 제구와 커맨드는 계속 흔들립니다」.
- **처음 배울 때도** 손익을 알려 준다.

## 3. 할 일 (순서대로)

| # | 무엇 | 담당 | 크기 |
|---|---|---|---|
| 0 | 슬롯에서 뺀 주에도 흔들림이 유지되는지 코드·실측 확인 | A | 작음 |
| 1 | 문안 — 시작 전 안내 · 뺄 때 경고 · 안 배우는 중 소식 | B | 작음 |
| 2 | 안 배우는 중 안내 소식 — 조건(배우는 것 없음 · 해금된 구종 있음 · 보유 5 미만)과 재발 주기 | B | 중간 |
| 3 | 훈련 화면 시작 전 안내 — 얻는 것/잃는 것 한 곳에(3번 칸 성장 없음 · 흔들림 폭 · 등급별 소요 · 완료 보상) | C | 작음 |
| 4 | 뺄 때 경고 · `TrainingPage.svelte:638` 문구 갱신 | C | 작음 |
| 5 | 소식 → 훈련 화면 이동(`MainTabId`/`tabForPending` 확장 · `me>training` 까지) | C | 중간 |
| 6 | 이벤트 둘을 실제 습득에 잇거나 안내 소식과 겹치면 정리 · 죽은 코드 둘 삭제 | A · B | 중간 |
