# Event Templates

This folder defines event templates for three trigger classes:

- mandatory: always triggered by schedule
- conditional: triggered when all/any conditions are satisfied
- random: triggered by weighted random selection with gate conditions

Suggested evaluation order:

1. mandatory
2. conditional
3. random

Then apply global policy constraints in `rules/global_policy.json`.

## 한국어 설명

이 폴더는 이벤트 템플릿을 3가지 발동 유형으로 관리합니다.

- `mandatory`: 일정 기반으로 반드시 발동
- `conditional`: 조건식(`all`/`any`)을 만족하면 발동
- `random`: 게이트 조건을 통과한 후보 중 가중치(`weight`) 기반 랜덤 발동

권장 평가 순서:

1. `mandatory`
2. `conditional`
3. `random`

그 다음 `rules/global_policy.json`의 전역 정책(일일 최대 개수, 우선순위, 쿨다운 등)을 적용합니다.

## 조건식 키 규칙

- `op`: 비교 연산자 (예: `gte`, `lte`, `eq`, `in`)
- `left`: 비교 대상 경로 (예: `player.fame`, `game.dayOfWeek`)
- `right`: 기준값(리터럴 또는 값 목록)

예시:

```json
{ "op": "gte", "left": "player.fame", "right": 20 }
```

의미: `player.fame >= 20`일 때 참.
