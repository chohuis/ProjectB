# Development Rules

## 1) Scope
- 이 문서는 `Svelte + Electron + Rust DLL` 기반 PC 게임 개발의 공통 규칙을 정의한다.
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

```
02.SvelteElectron/
├── apps/
│   ├── desktop/        Electron main/preload — DLL 로드, IPC, SQLite 저장
│   └── ui/             Svelte UI — 화면 렌더링, 입력값 전달만
├── packages/
│   ├── engine-native/  ★ Rust DLL — 게임 본체 (핵심 로직, 난수, 암호화)
│   │   └── src/        .rs 소스 (lib.rs, match_engine.rs, growth_engine.rs 등)
│   ├── core/           TypeScript 매치 엔진 래퍼 (IPC 직렬화만)
│   └── contracts/      레이어 간 DTO/IPC 채널 상수
└── resource/
    └── data/
        ├── master/     불변 마스터 데이터 (events, teams, leagues, balance 등)
        └── seeds/      새 세이브 생성 시 1회 주입 초기 데이터

사용자 로컬 (배포 제외):
  %APPDATA%/<AppName>/saves/projectb_v2.db   세이브 SQLite DB
```

## 5) Code Rules
- TypeScript 사용을 기본으로 한다.
- 린트/포맷 실패 상태로 커밋하지 않는다.
- **새 게임 로직은 반드시 Rust DLL에 추가한다** (`packages/engine-native/src/*.rs`).
- UI/TypeScript에서 `Math.random()`을 게임 로직에 사용하지 않는다 (Rust `rand::thread_rng()` 사용).
- `window.projectB!.*()` IPC 호출 시 반드시 `await`를 붙인다.
- `packages/engine-native/index.d.ts`, `index.js`는 직접 편집하지 않는다 (`npm run build:native` 자동 생성).

## 6) Rust DLL 수정 워크플로우
1. `packages/engine-native/src/*.rs` 에 함수 작성 (`#[serde(rename_all = "camelCase")]` 필수)
2. `packages/engine-native/src/lib.rs` 에 `#[napi]` export 추가
3. `npm run build:native` — `index.d.ts` / `index.js` 자동 재생성
4. `apps/desktop/main.cjs` 에 `ipcMain.handle` 추가
5. `apps/desktop/preload.cjs` 에 `ipcRenderer.invoke` 브릿지 추가
6. `apps/ui/src/shared/types/projectb.d.ts` 에 타입 추가

## 7) Test Rules
- 최소 기준:
  - 게임 로직(Rust): `cargo test` 또는 수동 IPC 검증
  - 데이터 파서: 샘플 파일 기반 검증
  - Electron IPC: 최소 1개 통합 테스트
- 릴리스 전 수동 시나리오 테스트를 수행한다.

## 8) Documentation Rules
- 규칙 변경 시 먼저 `docs`를 수정하고 구현을 맞춘다.
- 기술 의사결정은 `docs/ADR`에 기록한다.

## 9) Rule Sync Rules (Cross-PC)
- 개발 규칙의 단일 소스는 `docs/` 하위 문서다.
- 규칙이 추가/변경/삭제되면 반드시 문서 변경을 Git에 반영한다.
- 다른 PC에서 작업 시작 전 `git pull` 후 `docs/DEVELOPMENT_RULES.md`, `docs/GIT_WORKFLOW.md`, `docs/RULE_SYNC_POLICY.md`를 확인한다.
- 규칙 문서가 최신 커밋과 불일치하면 구현 작업을 시작하지 않는다.
