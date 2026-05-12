# 02.SvelteElectron

Svelte + Electron 기반의 야구 커리어 시뮬레이션 프로젝트입니다.  
UI(`apps/ui`)에서 주차 진행, 이벤트, 메신저, 커리어 분기 로직을 처리하고, Electron(`apps/desktop`)은 저장/로드 및 런타임 브리지를 담당합니다.

## 현재 상태 요약
- M1(고교-대학 전환 흐름): 진행 중
- M2(시즌 종료 동기화/NPC 라이프사이클): 진행 중
- M3(프로 리그 디테일 고도화): 예정

최근 핵심 반영:
- 고교 W50 진로 선택, W51 드래프트, W52 폴백 선택 흐름
- 시즌 종료 시 고교 NPC 승급/졸업 동기화 연동
- 오프시즌 NPC 라이프사이클(은퇴/로스터 정리) 기본 로직

## 빠른 시작
```powershell
npm.cmd install
npm.cmd run dev
```

## 빌드
```powershell
npm.cmd run build
npm.cmd run -s build:packages
```

## 프로젝트 구조
- `apps/ui`: Svelte UI, 주차 진행/이벤트/모달/스토어
- `apps/desktop`: Electron main/preload/IPC, 파일 I/O
- `packages/core`: 경기/시뮬레이션 코어
- `packages/contracts`: IPC 채널/DTO 계약
- `resource/data/master`: 마스터 데이터(JSON)

## 데이터 원칙
- `resource/data/master`는 기준 데이터(템플릿)입니다.
- 일반 플레이 중 변경되는 값은 세이브 데이터로만 저장되어야 합니다.
- 관리자 기능(Ctrl+Q)에서만 튜닝/마스터 저장 계열 기능을 사용합니다.

## 핵심 도메인 흐름(현재)
1. 주차 진행(`advanceWeek`)
2. 필수 처리 큐 확인(메시지/메신저/이벤트/경기/계약 등)
3. 조건 충족 시 pending action push
4. 해당 탭에서 사용자가 항목 클릭 시 실제 처리

고교 구간:
- W50: 진로 선택(`careerChoice`)
- W51: 드래프트(`draft`, 드래프트 의향 선택 시)
- W52: 폴백 결과 선택(대학/독립/체육부대/일반입대)

## 개발 규칙(요약)
- 인코딩: UTF-8 유지, 한글 깨짐 발생 시 즉시 복구
- 수정 범위 분리:
  - 주차 로직: `apps/ui/src/shared/usecases/advanceWeek.ts`
  - 상태 로직: `apps/ui/src/shared/stores/game.ts`
  - 시즌 종료 UI: `apps/ui/src/features/season-end/ui/SeasonEndModal.svelte`
- 커밋 전 최소 확인:
  - `npm.cmd run -s build:packages`
  - 핵심 분기 수동 점검(W50/W51/W52, 시즌 종료, 군복무)

## 인수인계 문서
- 상태 보고서: `docs/PROJECT_STATUS.md`
- 로드맵: `docs/ROADMAP_M1_M2_M3.md`

