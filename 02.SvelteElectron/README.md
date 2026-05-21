# 02.SvelteElectron

Svelte + Electron + Rust DLL 기반의 야구 커리어 시뮬레이션 프로젝트입니다.  
**Rust DLL(`packages/engine-native`)이 게임 본체** — 모든 핵심 로직·난수·암호화를 담당합니다.  
Electron(`apps/desktop`)은 DLL 로드·IPC 연결·파일 I/O만 담당하고, UI(`apps/ui`)는 화면 렌더링과 입력값 전달만 합니다.

## 현재 상태 요약
- Rust DLL 이전 Phase 1~6 완료 (2026-05-21)
- M1(고교-대학 전환 흐름): 진행 중
- M2(시즌 종료 동기화/NPC 라이프사이클): 진행 중
- M3(프로 리그 디테일 고도화): 예정

최근 핵심 반영:
- Rust DLL 이전: 성장/연봉/부상/드래프트/경기/시뮬/주간처리 전부 Rust
- 세이브 파일 ChaCha20-Poly1305 암호화 + HMAC-SHA256 무결성 서명
- 이벤트 난수 사전 배치(`weekRollRandomBatch`) Rust 이전
- 고교 W50 진로 선택, W51 드래프트, W52 폴백 선택 흐름

## 빠른 시작
```powershell
npm.cmd install
npm.cmd run dev     # predev가 Rust DLL 자동 빌드 포함
```

## 빌드
```powershell
npm.cmd run build:native    # Rust DLL만 (첫 빌드 ~2분)
npm.cmd run build:packages  # TypeScript 패키지
npm.cmd run build           # 전체 프로덕션 빌드
```

## 프로젝트 구조
- `apps/ui`: Svelte UI — 화면 렌더링·입력값 전달만 (로직 없음)
- `apps/desktop`: Electron main/preload — DLL 로드·IPC·파일 I/O
- `packages/engine-native`: ★ **Rust DLL** — 게임 본체 (핵심 로직·난수·암호화)
- `packages/core`: TypeScript 얇은 래퍼 (IPC 직렬화만)
- `packages/contracts`: IPC 채널/DTO 계약
- `resource/data/master`: 마스터 데이터(JSON)

## 아키텍처 원칙
| 레이어 | 역할 | 금지 |
|---|---|---|
| **Svelte UI** | 화면·입력값 전달만 | 게임 로직, Math.random() |
| **Electron main** | DLL 로드·IPC·파일 I/O | 핵심 알고리즘, 암호화 키, 보안 if문 |
| **Rust DLL** | 게임 로직 전체·난수·암호화 | — |

## 데이터 원칙
- `resource/data/master`는 기준 데이터(템플릿)입니다.
- 일반 플레이 중 변경되는 값은 세이브 데이터로만 저장되어야 합니다.
- 관리자 기능(Ctrl+Q)에서만 튜닝/마스터 저장 계열 기능을 사용합니다.

## 핵심 도메인 흐름(현재)
1. 주차 진행(`advanceWeek`) → Rust IPC 호출 체인
2. 필수 처리 큐 확인(메시지/메신저/이벤트/경기/계약 등)
3. 조건 충족 시 pending action push
4. 해당 탭에서 사용자가 항목 클릭 시 실제 처리

고교 구간:
- W50: 진로 선택(`careerChoice`)
- W51: 드래프트(`draft`, 드래프트 의향 선택 시)
- W52: 폴백 결과 선택(대학/독립/체육부대/일반입대)

## 개발 규칙(요약)
- 인코딩: UTF-8 유지, 한글 깨짐 발생 시 즉시 복구
- 새 게임 로직은 반드시 Rust DLL에 추가 (`DEV_GUIDE.md` 6단계 체크리스트 참조)
- Rust 수정 후 `npm run build:native` 또는 `npm run dev` 재시작 필요
- 수정 범위 분리:
  - 게임 로직: `packages/engine-native/src/*.rs` → `lib.rs` export → IPC 핸들러
  - 주차 흐름: `apps/ui/src/shared/usecases/advanceWeek.ts` (IPC 호출만)
  - 상태 로직: `apps/ui/src/shared/stores/game.ts`
- 커밋 전 최소 확인:
  - `npm.cmd run build:native` (Rust 컴파일 에러 없음 확인)
  - `npm.cmd run -s build:packages`
  - 핵심 분기 수동 점검(W50/W51/W52, 시즌 종료, 군복무)

## 인수인계 문서
- 개발 가이드: `DEV_GUIDE.md`
- 상태 보고서: `docs/PROJECT_STATUS.md`
- 로드맵: `docs/ROADMAP_M1_M2_M3.md`
- 프로젝트 구조: `PROJECT_STRUCTURE.md`
