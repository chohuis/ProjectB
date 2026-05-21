# ProjectB — AI 작업 규칙

## 아키텍처 원칙 (필수 숙지)

**Electron은 껍데기, Rust DLL이 프로그램 본체다.**

| 레이어 | 역할 | 금지 |
|---|---|---|
| `apps/ui/` (Svelte) | 화면 렌더링, 입력값 전달만 | 게임 로직, `Math.random()` |
| `apps/desktop/` (Electron) | DLL 로드, IPC 연결, 파일 I/O | 핵심 알고리즘, 암호화 키, 보안 if문 |
| `packages/engine-native/src/` (Rust) | 게임 본체 — 로직·난수·암호화 전부 | — |

## 절대 금지

- TypeScript/Svelte에서 `Math.random()` 게임 로직에 사용 — Rust `rand::thread_rng()` 사용
- Electron에 암호화 키, 라이선스 판정, `bool isLicensed()` 단독 export 패턴
- `window.projectB!.*()` 호출 시 `await` 누락
- `packages/engine-native/index.d.ts`, `index.js` 직접 편집 — `npm run build:native` 자동 생성

## Rust에 새 게임 로직 추가 시 — 6단계

1. `packages/engine-native/src/*.rs` — 함수 작성 (`#[serde(rename_all = "camelCase")]` 필수)
2. `packages/engine-native/src/lib.rs` — `#[napi]` export 추가 (JSON 문자열 입출력)
3. `npm run build:native` — `index.d.ts` / `index.js` 자동 재생성
4. `apps/desktop/main.cjs` — `ipcMain.handle("채널명", ...)` 추가
5. `apps/desktop/preload.cjs` — `ipcRenderer.invoke` 브릿지 추가
6. `apps/ui/src/shared/types/projectb.d.ts` — `Window.projectB` 인터페이스에 타입 추가

## IPC 호출 패턴 (TS에서)

```typescript
// 호출
const result = JSON.parse(
  await window.projectB!.myFuncNative(JSON.stringify({ someValue: 42 }))
) as MyResultType;

// Rust 구조체는 camelCase로 자동 변환됨 (serde rename_all)
```

## Rust IPC 핸들러 패턴 (main.cjs)

```js
ipcMain.handle("ns:funcName", (_event, p) => {
  try { return engineNative.myFuncNative(p); }
  catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
});
```

## Rust 함수 패턴

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MyPayload { pub some_value: f64 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyResult { pub output: f64 }

pub fn calc_my_thing(p: MyPayload) -> MyResult {
    let mut rng = rand::thread_rng();
    MyResult { output: p.some_value * rng.gen::<f64>() }
}
```

## 빌드 규칙

- Rust 수정 후: `npm run build:native` (증분 빌드, ~5~30초) → Electron 재시작
- TS/Svelte 수정: Vite HMR 자동 반영 (dev 재시작 불필요)
- `packages/core/` 수정: `npm run build:packages` → Electron 재시작

## 코드 스타일

- Rust 구조체 필드: `snake_case` (serde가 `camelCase`로 JS에 노출)
- IPC 채널명: `"네임스페이스:funcName"` 형식 (예: `"week:calcExam"`, `"match:pitch"`)
- TS에서 Rust 결과 타입: `as MyType` 명시적 캐스팅
- 주석은 WHY가 명확할 때만, 코드로 알 수 있는 내용은 생략
