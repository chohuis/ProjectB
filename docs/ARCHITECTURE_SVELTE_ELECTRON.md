# Architecture: Svelte + Electron + Rust DLL

## 레이어

| 레이어 | 경로 | 역할 |
|---|---|---|
| **Svelte UI** | `apps/ui/` | 화면 렌더링, 사용자 입력 전달만 |
| **Electron main** | `apps/desktop/` | DLL 로드, IPC 연결, 파일 I/O, SQLite |
| **Rust DLL** | `packages/engine-native/` | 게임 본체 — 핵심 로직, 난수, 암호화 전부 |
| **TypeScript 래퍼** | `packages/core/` | 매치 엔진 래퍼 (IPC 직렬화만) |
| **계약** | `packages/contracts/` | 레이어 간 DTO/IPC 채널 상수 |

> **Electron은 껍데기, Rust DLL이 프로그램 본체다.**

---

## 데이터 흐름

```
사용자 액션
  → apps/ui  (window.projectB!.method(JSON))
  → preload.cjs  (ipcRenderer.invoke)
  → main.cjs  (ipcMain.handle → engineNative.*)
  → Rust DLL  (연산, 난수, 암호화)
  → main.cjs  (결과 반환)
  → apps/ui  (JSON.parse → 상태/화면 갱신)
```

---

## 레이어별 역할 및 금지 사항

### Svelte UI (`apps/ui/`)
- **역할**: 화면 렌더링, 입력값 전달
- **금지**: `Math.random()` 게임 로직, 직접 파일 I/O, 암호화

### Electron main (`apps/desktop/main.cjs`)
- **역할**: DLL 로드, IPC 핸들러, SQLite 저장/로드, 마스터 데이터 제공
- **금지**: 핵심 게임 알고리즘, 암호화 키 하드코딩, 보안 판정 로직

### Rust DLL (`packages/engine-native/src/`)
- **역할**: 게임 로직 전체, 난수(`rand::thread_rng()`), 세이브 암호화(ChaCha20-Poly1305), 무결성(HMAC-SHA256)
- **모듈 목록**:

| 파일 | 담당 |
|---|---|
| `lib.rs` | NAPI export 진입점 |
| `match_engine.rs` | 인터랙티브 투구 엔진 |
| `npc_sim.rs` | NPC 게임·오프시즌·드래프트 시뮬 |
| `growth_engine.rs` | 훈련/경기 성장 계산 |
| `player_engine.rs` | 커리어·역할·FA·연봉·드래프트 |
| `schedule_engine.rs` | 리그 일정 생성 |
| `postseason_engine.rs` | 포스트시즌 브래킷/진행 |
| `week_engine.rs` | 주간 처리 (부상·시설·입시·시험·군복무) |
| `crypto.rs` | 세이브 ChaCha20-Poly1305 암호화 |
| `hmac.rs` | 세이브 HMAC-SHA256 서명 |
| `types.rs` / `sim_types.rs` | 공유 타입 정의 |
| `tuning.rs` | 밸런스 상수 (JS 비공개) |

### TypeScript 래퍼 (`packages/core/`)
- **역할**: 매치 엔진 상태 관리, IPC 직렬화만
- Rust로 이전된 로직은 이 레이어에 없음

---

## IPC 호출 패턴

```typescript
// UI에서 Rust 함수 호출
const result = JSON.parse(
  await window.projectB!.myFuncNative(JSON.stringify(params))
) as ResultType;
```

```js
// main.cjs IPC 핸들러
ipcMain.handle("ns:funcName", (_event, p) => {
  try { return engineNative.myFuncNative(p); }
  catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
});
```

---

## 원칙

- 핵심 게임 알고리즘은 UI/Electron에서 직접 구현하지 않는다.
- 모든 `Math.random()` 호출은 Rust `rand::thread_rng()`로 처리한다.
- IPC 채널과 DTO는 `packages/contracts`를 기준으로 고정한다.
- 저장/로드 I/O는 `apps/desktop`에서만 처리한다.
- 암호화 키, 라이선스 판정, 보안 if문은 Rust DLL 내부에만 둔다.
