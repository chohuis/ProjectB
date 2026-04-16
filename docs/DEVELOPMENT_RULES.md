# Development Rules

## 1) Scope
- 이 문서는 `Svelte + Electron` 기반 PC 게임 개발의 공통 규칙을 정의한다.
- 코드, 데이터, 기획 문서 변경은 모두 Git 커밋으로 추적한다.

## 2) Working Model (BKIT)
- 기본 운영 사이클은 `BKIT`로 한다.
- `B (Backlog)`: 요구사항/이슈를 작업 단위로 쪼개고 완료 조건(DoD)을 먼저 적는다.
- `K (Kickoff)`: 작업 시작 시 입력/출력, 영향 파일, 테스트 범위를 명시한다.
- `I (Implement)`: 작은 단위로 구현하고 중간 검증(실행/테스트/샘플 데이터 체크)을 수행한다.
- `T (Track)`: 커밋/PR/릴리스 노트로 결과와 변경 이유를 남긴다.

## 3) User Approval Rule (Mandatory)
- 코드 수정은 반드시 사용자 사전 승인 후 진행한다.
- 파일 생성/수정/삭제, 설정 변경, 의존성 변경 전에는 사용자에게 먼저 확인받는다.
- 커밋은 반드시 사용자의 명시적 요청 또는 승인 후에만 진행한다.
- 사용자가 승인하지 않은 상태에서는 분석/검토/설명까지만 수행한다.

## 4) Folder Convention
- `apps/desktop`: Electron 메인/프리로드/패키징
- `apps/ui`: Svelte UI
- `packages/core`: 게임 룰/시뮬레이션 공용 로직
- `data/base`: 정적 데이터(룰/팀/이벤트)
- `data/runtime`: 세이브/런타임 스냅샷
- `data/logs`: 경기/일일 로그
- `docs`: 규칙/정책/설계 기록

## 5) Code Rules
- TypeScript 사용을 기본으로 한다.
- 린트/포맷 실패 상태로 커밋하지 않는다.
- 대규모 기능은 UI와 코어 로직을 분리한다.
- 파일 I/O는 에러 핸들링과 재시도/복구 전략을 명시한다.

## 6) Test Rules
- 최소 기준:
- 코어 로직: 단위 테스트
- 데이터 파서: 샘플 파일 기반 검증
- Electron IPC: 최소 1개 통합 테스트
- 릴리스 전 수동 시나리오 테스트를 수행한다.

## 7) Documentation Rules
- 규칙 변경 시 먼저 `docs`를 수정하고 구현을 맞춘다.
- 기술 의사결정은 `docs/ADR`에 기록한다.
