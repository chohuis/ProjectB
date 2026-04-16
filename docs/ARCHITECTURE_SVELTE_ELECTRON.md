# Architecture: Svelte + Electron + Core

## 레이어
- `apps/ui`: Svelte UI 레이어
- `apps/desktop`: Electron 메인/프리로드/IPC 레이어
- `packages/core`: 게임 규칙/시뮬레이션 코어
- `packages/contracts`: 레이어 간 DTO/IPC 계약

## 데이터 흐름
1. UI에서 사용자 액션 발생
2. preload 브리지로 IPC 호출
3. desktop IPC 핸들러가 core 유스케이스 실행
4. 결과를 contracts DTO로 UI에 반환
5. UI가 상태/화면 갱신

## 원칙
- 코어 로직은 UI에서 직접 구현하지 않는다.
- IPC 채널과 DTO는 `packages/contracts`를 기준으로 고정한다.
- 저장/로그 I/O는 `apps/desktop`에서만 처리한다.

## 현재 스캐폴딩 상태
- `packages/core`: 초기 GameState/advanceDay 유스케이스
- `packages/contracts`: Snapshot/Result DTO, IPC 채널 상수
- 루트 패키지에서 `build:packages`로 core/contracts 빌드 가능

