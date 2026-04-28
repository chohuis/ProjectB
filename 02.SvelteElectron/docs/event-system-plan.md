# 이벤트 시스템 개발 계획

> 상태: 설계 완료 / 구현 보류  
> 관련 시스템: 훈련·성장, 게임루프, 메시지 시스템

---

## 1. 이벤트 카테고리

### 1-1. 훈련 이벤트
| 이벤트 | 트리거 조건 | 효과 |
|---|---|---|
| 스카우트 방문 | 랜덤 (W10 이후, 5% / 주) | 훈련 효율 +20%, morale +10 (1주) |
| 특별 강습 (외부 코치) | W4, W12, W20 고정 | 특정 능력치 XP x2 (1주) |
| 팀 분위기 저하 | 3연패 이후 40% 확률 | 훈련 효율 -15%, morale -5 (2주) |
| 팀 분위기 상승 | 3연승 이후 50% 확률 | 훈련 효율 +10%, morale +8 (2주) |
| 비공개 훈련 기회 | W6, W14 고정 | 선택지: 체력 집중 or 제구 집중 (XP x1.5) |

### 1-2. 부상 & 체력 이벤트

> **구현 방식**: 강제 휴식 없음 — 코치 메시지로 경고, 플레이어가 판단

| 상태 | 조건 | 발생 이벤트 |
|---|---|---|
| 피로 주의 | fatigue > 70 | 코치 메시지: "이번 주 훈련 강도를 낮추는 것을 권장합니다" |
| 피로 위험 | fatigue > 85 | 코치 메시지: "부상 위험이 높습니다. 회복 프로그램 권장" + 훈련 XP -40% |
| 과부하 지속 | fatigue > 85 × 2주 연속 | 긴급 이벤트: "근육 경직" → 선택지 (억지로 훈련 / 강제 휴식) |

**억지로 훈련** 선택 시:
- 훈련 진행하지만 부상 확률 30% 발생
- 부상 발생 → 3주간 훈련 효율 -60%, fatigue 고정

**강제 휴식** 선택 시:
- 1주 훈련 중단, fatigue -25, condition +15

### 1-3. 심리 & 멘탈 이벤트
| 이벤트 | 조건 | 효과 |
|---|---|---|
| 슬럼프 진입 | morale < 35 × 3주 | mentality XP 주간 -0.5, command/control -1 (임시) |
| 슬럼프 탈출 | morale > 55 회복 시 | mentality +2, 특별 성장 보너스 (XP x1.3, 2주) |
| 멘탈 코치 면담 | W8, W16 고정 선택지 | 선택지: 집중력 강화 / 침착성 강화 → 해당 능력치 XP +보너스 |
| 라이벌 등장 | W5 이후 랜덤 | 특정 상대 팀 에이스 지정 → 대결 시 성장 XP x1.5 |

### 1-4. 외부 상황 이벤트
| 이벤트 | 효과 |
|---|---|
| 우천 취소 | 경기 없는 주 → 훈련 시간 증가 → XP +20% |
| 학교 시험 주간 | 훈련 시간 감소 → XP -30%, AcademicsPage 성적 반영 |
| 가족 방문 | morale +12, fatigue -8 (1회성) |
| 감독 교체 | 훈련 방향 강제 변경 선택지 |

---

## 2. 이벤트 트리거 시스템

```
매 주 진행 시 advanceWeek() 내부에서:

1. 고정 이벤트 체크 (week === 특정 주차)
2. 조건부 이벤트 체크 (fatigue, morale, 연승/연패 등)
3. 랜덤 이벤트 롤 (주당 1회, 각 이벤트별 확률)
   → 발생 시 PendingAction("event", eventId) 등록 → 게임 루프 정지
```

### 이벤트 우선순위
1. 부상/긴급 이벤트 (즉시 처리)
2. 고정 이벤트 (주차 기반)
3. 조건부 이벤트
4. 랜덤 이벤트

---

## 3. 이벤트 데이터 구조 (구현 시 참고)

```typescript
interface GameEvent {
  id: string;
  type: "training" | "injury" | "mental" | "external";
  title: string;
  body: string;
  trigger: EventTrigger;
  choices?: EventChoice[];
  effects?: EventEffect[];  // 선택지 없는 자동 적용 이벤트
}

interface EventTrigger {
  type: "fixed" | "conditional" | "random";
  week?: number;
  condition?: (state: SeasonStoreState, game: GameStoreState) => boolean;
  probability?: number;  // 0~1, 주당 발생 확률
}

interface EventChoice {
  id: string;
  label: string;
  effects: EventEffect[];
}

interface EventEffect {
  target: "fatigue" | "morale" | "condition" | "xp" | "stat";
  stat?: keyof PitchingAttributes;
  value: number;
  duration?: number;  // 지속 주수 (없으면 즉시)
}
```

---

## 4. 버프/디버프 지속 효과 관리

이벤트 효과가 여러 주에 걸쳐 지속되는 경우를 위한 상태:

```typescript
interface ActiveEffect {
  id: string;
  source: string;  // 이벤트 ID
  type: "xpMultiplier" | "statDelta" | "fatigueDelta";
  value: number;
  remainingWeeks: number;
}
```

`gameStore`에 `activeEffects: ActiveEffect[]` 필드 추가 필요  
→ 매 주 진행 시 remainingWeeks-- 후 0 되면 제거

---

## 5. 구현 순서 (추후)

1. `GameEvent` 타입 정의 (types/event.ts)
2. 이벤트 데이터 파일 작성 (data/master/events/*.json)
3. `advanceWeek.ts`에 이벤트 트리거 로직 추가
4. `MainPage.svelte` 이벤트 모달 UI
5. `ActiveEffect` 시스템 → `gameStore`에 통합
6. 부상 메시지 → 메시지 시스템 연동

---

## 6. 경기 경험 → 능력치 반영 (확정, 구현 예정)

경기가 있는 주에 훈련 시간 감소 대신 경기 자체가 성장 효과:

| 항목 | 효과 |
|---|---|
| 경기 출전 | velocity / command / control XP + 주간 훈련 XP의 35% |
| 승리 | morale +6, mentality XP +0.5 |
| 패배 | morale -8, mentality XP +0.3 (역경 성장) |
| 대패 (5점차↑) | morale -15, mentality XP -0.5 |
| morale < 40 상태에서 패배 | mentality XP 추가 -0.3 (악순환) |
