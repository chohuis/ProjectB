# 훈련 시스템 분석 (2026-08-08)

> ⚠ **개선 방향은 [design/training.md](design/training.md)로 옮겼다** (2026-08-08 사용자 확정).
> 이 문서는 **진단만** 남긴다 — §3의 Phase 계획은 그쪽이 정본이다.
>
> **읽는 법**: §1은 지금 구조, §2는 발견한 결함(근거 포함), §3은 개선안 Phase.
> **아직 아무것도 안 고쳤다.** 코드 변경 전에 §3의 순서와 Phase 0(계측)을 먼저 합의한다.
>
> 근거는 전부 코드·데이터를 직접 읽어 대조한 것이다. "추정"이라고 적은 곳은
> 아직 안 재 본 것이니 그대로 믿지 않는다.

## 1. 지금 구조

```
TrainingPage.svelte        슬롯 3개(주/보조1/보조2)를 고른다
   ↓ gameStore.setTrainingPlan({ primaryProgramId, secondaryProgramId, secondary2ProgramId })
advanceWeek                calcTrainingGrowth(protagonist, plan, efficiencyMod, staffMods)
   ↓ IPC growthCalcTraining
growth_engine.rs           get_program(id) → XP·피로·컨디션 → 스탯 상승
```

### 슬롯 배수 (`growth_engine.rs:423`)

| 슬롯 | XP 배수 | 피로 배수 |
|---|---:|---:|
| 주 | 2.5 | 1.0 |
| 보조1 | 1.5 | 0.5 |
| 보조2 | 1.0 | 0.5 |

### 성장 공식

```
week_xp = base_xp × (컨디션/100) × 피로계수 × (성장률/62) × (0.6 + 근면/99 × 0.8)
피로계수  = 피로 85↑ 0.35 · 70↑ 0.65 · 그 외 max(0.80, 1 − 피로/200)
XP × 슬롯배수 × 효율보정 × 나이계수 × 잠재속도 × 잠재상한감쇠
레벨업 임계 = 7.5 + 현재값 × 0.35          (능력치 50이면 25 XP당 +1)
```

- 나이계수: **29세까지 1.00**, 30~32 0.85, 33~35 0.70, 36~38 0.55, 39+ 0.45
- 잠재속도: 0.80 ~ 1.20 (잠재 60~99)
- 잠재상한감쇠: 현재/잠재 비율 0.75↓ 1.00 · 0.85↓ 0.70 · 0.95↓ 0.35 · 그 위 0.10

### 피로 구간 승수 (`growth_engine.rs:430`)

피로 70/80/90에서 **1.5 / 2.5 / 4.0배**. 지칠수록 같은 훈련이 훨씬 더 지치게 한다.
회복 훈련에는 안 걸린다. 주간 자동 회복 −5, 컨디션 자동 회복 +1~+5(피로에 반비례).

---

## 2. 발견한 결함

### ⓐ 같은 표가 **네 곳**에 있고 넷 다 다르다 ★최상위

| 위치 | 내용 | 실제로 쓰이는 곳 |
|---|---|---|
| `resource/data/master/training/programs_pitcher.json` | 8종 (구버전 id) | `masterStore.trainingPrograms` → focus 조회 |
| `packages/engine-native/src/growth_engine.rs` `get_program()` | 24종 하드코딩 | **실제 계산** |
| `apps/ui/src/pages/training/TrainingPage.svelte:54~72` | 12종 하드코딩 | 화면 카드 표시 |
| `apps/ui/src/pages/schedule/SchedulePage.svelte` `PROGRAM_TITLE` | 이름만 | 일정 화면 표시 |

CLAUDE.md가 금지한 바로 그것이다 — *"코드에 표를 두 번 적지 말 것 — Phase 7에서
이 결함만 15건 나왔다."* 지금은 네 번이다.

**피로 수치가 서로 다르다** (화면 / 엔진):

```
TRN_VEL 14/5.5 · TRN_CTRL_CMD 8/3.0 · TRN_MOVEMENT 9/3.5 · TRN_MENTAL_P 6/2.5
TRN_STAMINA 12/5.0 · TRN_PITCH_DEV 10/4.0 · TRN_BATTING 10/4.0 · TRN_DEFENSE 9/3.5
TRN_RECOVERY −10/−10.0  ← 유일하게 일치
```

### ⓑ 화면 예상치가 엔진과 **부호까지 다르다** ★최상위

기본 계획(제구/커맨드 + 구속 + 회복)에서:

```
화면이 보여주는 피로 변화   +7
엔진이 실제로 적용하는 값   −4.25
```

**"훈련하면 지친다"고 적어놓고 실제로는 쉬어진다.** 원인 셋:

1. 카드 수치가 엔진의 2~2.5배 (ⓐ)
2. 화면이 **보조 슬롯 배수 0.5를 안 건다** (`rawFatigueDelta`는 단순 합)
3. 화면이 **피로 구간 승수를 모른다** — 지친 상태일수록 격차가 더 벌어진다

컨디션·부상위험도 화면이 자체 식을 쓴다:

```ts
projectedCondition = 컨디션 − max(0, 피로변화) × 0.4 + 3   // 엔진과 무관한 식
projectedRisk      = max(0, (예상피로 − 60) × 0.8)          // 엔진의 부상 판정과 무관
```

> 이 프로젝트는 같은 종류를 이미 한 번 겪었다 — `relationMessages.ts` 주석:
> *"그 시절의 진짜 결함은 문구가 아니라 **표시와 동작의 불일치**였다."*

### ⓒ 화면이 저장하는 id 12개 중 **10개가 마스터 JSON에 없다** ★높음

```
마스터 JSON  TRN_CMD_BASE TRN_VEL_POWER TRN_CTRL_MECH TRN_MVT_PITCH
             TRN_MNT_FOCUS TRN_STA_COND TRN_RECOVERY TRN_PITCH_DEV
화면 저장    TRN_VEL TRN_CTRL_CMD TRN_MOVEMENT TRN_MENTAL_P TRN_STAMINA
             TRN_PITCH_DEV TRN_BATTING TRN_PLATE_EYE TRN_BASERUN
             TRN_DEFENSE TRN_MENTAL_B TRN_RECOVERY

겹치는 것: TRN_PITCH_DEV, TRN_RECOVERY  (12개 중 2개)
```

**기본 계획의 주 프로그램 `TRN_CTRL_CMD`부터 조회가 안 된다.**
`find(pr => pr.id === primaryId)?.focus` → `undefined` → `trainingAreaOf("")` → `""`.
그러면 두 곳이 조용히 죽는다:

- `advanceWeek:1158` → `ctx.trainingArea` 빈 값 → **담당 코치와의 관계가 안 오른다**
  (`weekly.coach.own_area_training`이 발동 조건을 못 만족)
- `advanceWeek:288` → `relationEffects({ coachSpecialty: "" })` → **관계에서 오는
  훈련 효율 보너스가 안 붙는다** (`coachEffBonus`에 들어가는 `trainingBonus`)

⚠ **아직 런타임으로 확인 안 했다.** id 집합이 안 겹친다는 건 데이터 사실이고
그 뒤 귀결은 코드를 읽은 것이다 — Phase 0에서 실제로 재야 한다.

### ⓓ 카드에 적힌 `risk`가 아무 데도 안 쓰인다

```ts
rawRiskDelta  = selectedCards.reduce((s, c) => s + c.risk, 0);
finalRiskDelta = Math.round(rawRiskDelta × coachMod.risk × facilityMod.risk);
// finalRiskDelta를 읽는 곳이 없다 — 템플릿에도 없다
```

실제 부상 판정은 Rust `injuryCalc`가 따로 한다. 즉 **"위험도 6"이라고 적힌
구속 훈련과 "위험도 0"인 정신 훈련의 부상 확률 차이가 프로그램 자체로는 없다.**
(피로가 올라가서 생기는 간접 효과만 있다.)

### ⓔ 죽은 데이터·필드

- `resource/data/master/training/weekly_ratio_presets.json` — **사용처 0**.
  게다가 비율 키(`command/velocity/stamina/mental`)가 지금 focus 체계와 안 맞는다
- 마스터 JSON의 `intensity: low|medium|high` — 안 쓰인다.
  대신 `advanceWeek:316`이 **또 다른 정의**를 쓴다
  (회복·정신 훈련을 뺀 슬롯 비율)
- 타자 프로그램의 데이터 정본이 **없다** — `programs_pitcher.json`뿐이고
  타자 6종은 화면 하드코딩에만 있다

### ⓕ 일정 화면이 **deprecated 필드**를 읽는다

```ts
plan.primaryProgramId · plan.secondaryProgramId · plan.recoveryProgramId
```

`recoveryProgramId`는 `save.ts`에 *"deprecated, kept for migration"*으로 적혀 있다.
**`secondary2ProgramId`를 안 읽는다** → 일정 화면의 주간 훈련 표시가 슬롯 3개 중
2개만, 그것도 죽은 필드를 본다.

### ⓖ 밸런스: 주 슬롯이 최적이 아니다

피로 1당 XP:

| 슬롯 | XP/피로 |
|---|---:|
| 주 (2.5 / 1.0) | 2.50 |
| **보조1 (1.5 / 0.5)** | **3.00** ← 가장 효율적 |
| 보조2 (1.0 / 0.5) | 2.00 |

"주 프로그램"이라는 이름과 달리 **피로 대비 효율은 보조1이 제일 좋다.**
의도된 것인지 확인이 필요하다. 지금은 화면이 피로를 틀리게 보여주므로
플레이어가 이걸 알아챌 방법도 없다.

### ⓗ 29세까지 나이 영향이 전혀 없다

`age_train_factor`가 `0..=29 => 1.00`이다. 고교 3년 · 대학 4년 · 프로 초반이
**전부 같은 성장 속도**다. 성장 곡선을 만드는 것은 잠재상한 감쇠뿐이다.
의도라면 문제없지만, "고교 때 크게 크고 프로에서 완만해진다"를 원한다면
지금 구조로는 안 나온다.

### ⓘ `ovrDelta: 0` 고정 (관계도 쪽 · 이미 RESUME에 기록)

`advanceWeek`의 관계 컨텍스트가 `ovrDelta: 0`을 박아 넘긴다 →
`growth_threshold: 2`를 영원히 못 넘어 **감독 +1 · 코치 +2 성장 보너스가 죽어 있다.**
`growth` 결과가 같은 스코프에 있으므로 배선 자체는 한 줄이다.

---

## 3. 개선안 (Phase)

### Phase 0 — 재기 먼저 ★반드시 선행

고치기 전에 숫자를 잡는다. **추측으로 수치를 옮기면 밸런스가 통째로 흔들린다.**

1. `measure:training` 신설 — 시즌당 스탯 상승량, 슬롯별 기여, 피로 궤적,
   프로그램별 실제 선택률
2. ⓒ의 귀결을 **런타임으로 확인** — `trainingArea`가 실제로 빈 문자열인지,
   `coachEffBonus`에 `trainingBonus`가 0으로 들어가는지
3. 게이트로 만든다: 표 네 개가 어긋나면 실패하는 검사
   (**이것부터 만들면 이후 작업이 안전해진다**)

### Phase 1 — 정본을 하나로 ★최우선

**Rust `get_program()`을 정본으로 삼는다.** 이유: 실제로 도는 게 그것이고,
값이 이미 밸런스가 맞춰진 쪽이다. 다른 셋은 그걸 읽게 바꾼다.

- 마스터 JSON을 **Rust 표에서 생성**하거나, 반대로 Rust가 JSON을 읽게 한다
  (프로젝트 원칙은 "규칙은 데이터로" 쪽이니 후자가 결이 맞다)
- `TrainingPage`의 하드코딩 12종을 제거하고 마스터에서 읽는다
- `SchedulePage`의 `PROGRAM_TITLE`도 같은 출처로
- **검사: 네 표의 id 집합과 피로 수치가 같은지** (Phase 0-3에서 만든 게이트)

⚠ 이때 **id를 하나로 통일**해야 한다. 지금 구버전/신버전 id가 섞여 있고
세이브에는 신버전이 들어 있다 — 마이그레이션이 필요하다.

### Phase 2 — 화면이 엔진을 그대로 보여주게

- 예상 피로·컨디션을 **화면이 다시 계산하지 않는다.** 엔진에 "이 계획이면
  어떻게 되나"를 묻는 미리보기 함수를 하나 만들어 그 결과를 쓴다
  (`growthPreviewNative` 같은 것 — 실제 계산과 같은 코드를 탄다)
- 그러면 슬롯 배수·피로 구간 승수가 자동으로 반영된다
- 부상위험도 엔진의 실제 판정식에서 받는다

### Phase 3 — 죽은 것 정리

- `weekly_ratio_presets.json` 삭제 (사용처 0)
- `intensity` 필드: 쓰거나 지운다. 쓸 거면 `advanceWeek:316`의 별도 정의를
  이걸로 대체한다
- `risk`: 실제 부상 판정에 물리거나 화면에서 뺀다.
  **적혀 있는데 효과가 없는 게 제일 나쁘다**
- `recoveryProgramId` 제거 + `SchedulePage`가 `secondary2ProgramId`를 읽게
- 타자 프로그램 데이터 정본 신설 (`programs_batter.json`)

### Phase 4 — 배선 복구

- ⓒ: id 통일이 끝나면 `focus` 조회가 살아난다. **살아난 뒤 다시 재서**
  코치 관계·훈련 효율이 실제로 붙는지 확인한다
- ⓘ: `ovrDelta`를 `growth` 결과에서 넘긴다. 다만 `growth_threshold: 2`가
  주간 성장폭보다 클 가능성이 있으니 **배선 후 실측**해서 임계값을 정한다

### Phase 5 — 밸런스 (여기서부터는 기획 결정)

- ⓖ 슬롯 효율 역전을 그대로 둘지
- ⓗ 나이 곡선을 30세 이전에도 넣을지
- 잠재상한 감쇠(0.95↑에서 0.10)가 충분한 벽인지

---

## 안 건드리는 것

- `xp_threshold` · `potential_*` — 밸런스의 중심축이라 Phase 0 실측 없이 손대면
  전체 성장 곡선이 흔들린다
- 구종 개발(`is_pitch_dev`) 경로 — 별도 시스템이라 이 문서 범위 밖
