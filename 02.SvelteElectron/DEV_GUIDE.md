# ProjectB 개발 가이드

## 1. 초기 환경 설정 (최초 1회)

### 필수 설치

**① Visual C++ Build Tools** — Rust MSVC 빌드에 필요
```
https://visualstudio.microsoft.com/visual-cpp-build-tools/
```
설치 시 "C++를 사용한 데스크톱 개발" 워크로드 선택.

**② Rust 툴체인**
```
https://rustup.rs/
```
`rustup-init.exe` 실행 → 기본값(1번) 선택.

설치 후 **CMD에서** 확인:
```cmd
cargo --version
rustup target list --installed   # x86_64-pc-windows-msvc 포함 여부 확인
```

> ⚠️ PowerShell은 PATH 갱신이 느릴 수 있음. cargo가 안 된다면 CMD 사용 또는 터미널 재시작.

**③ npm 패키지 설치**
```powershell
npm install
```

---

## 2. 프로젝트 구조

```
02.SvelteElectron/
├── apps/
│   ├── desktop/main.cjs        # Electron 메인 프로세스 (Rust DLL 로드)
│   └── ui/                     # Svelte UI
├── packages/
│   ├── engine-native/          # ★ Rust DLL (매치 엔진 핵심 로직)
│   │   ├── src/
│   │   │   ├── lib.rs          # napi export 정의
│   │   │   ├── match_engine.rs # 매치 시뮬레이션 엔진
│   │   │   ├── types.rs        # 타입 정의
│   │   │   ├── tuning.rs       # 밸런스 상수 (JS 비공개)
│   │   │   └── hmac.rs         # 세이브 데이터 서명
│   │   ├── index.js            # Node.js 진입점 (.node 로드)
│   │   └── index.d.ts          # TypeScript 타입 선언
│   ├── core/                   # TypeScript 얇은 래퍼 (JSON 직렬화만)
│   └── contracts/              # 공유 타입
└── resource/
    └── data/master/            # 마스터 데이터 (빌드에 포함)
```

---

## 3. 개발 명령어

### 주요 명령어

| 명령어 | 용도 | 소요 시간 |
|---|---|---|
| `npm run dev` | 전체 개발 서버 시작 | - |
| `npm run build:native` | Rust DLL만 컴파일 | 첫 빌드 ~2분, 증분 ~5~15초 |
| `npm run build:packages` | TypeScript 패키지(core, contracts) 빌드 | ~5초 |
| `npm run build` | 전체 프로덕션 빌드 | - |
| `npm run pack` | 배포용 패키징 (build 포함) | - |

### 자동 빌드 순서

```
npm run dev
  └─ predev: build:native (Rust DLL 자동 컴파일)
       └─ dev:ui:   gen:manifest → Vite 개발 서버
       └─ dev:desktop: build:packages → Electron 시작

npm run build
  └─ prebuild: build:native (Rust DLL 자동 컴파일)
       └─ build:masterdb → build:packages → build:ui
```

---

## 4. 코드 종류별 개발 워크플로우

### Rust 코드 수정 시 (`packages/engine-native/src/*.rs`)

```
Rust 파일 수정
  → npm run dev 재시작  (predev가 자동으로 재컴파일)
  또는
  → npm run build:native  (DLL만 빠르게 재빌드, 이후 Electron만 재시작)
```

cargo는 **증분 빌드**라 변경된 파일만 재컴파일. 두 번째부터 빠르다.

### TypeScript/Svelte 수정 시 (`apps/ui/`, `packages/core/`)

```
파일 수정 → Vite HMR 자동 반영 (dev 재시작 불필요)
```

단, `packages/core/` 변경 시:
```
npm run build:packages  → Electron 재시작
```

### 마스터 데이터 수정 시 (`resource/data/master/`)

```
데이터 수정 → npm run gen:manifest → dev:ui 재시작
```

---

## 5. Rust DLL 구조 (보안 설계)

| 레이어 | 역할 |
|---|---|
| **Svelte UI** | 화면 렌더링, 입력 전달만 |
| **Electron main** | DLL 로드, IPC 연결만 |
| **Rust DLL** | 매치 엔진, HMAC 서명, 밸런스 상수 — JS에 비공개 |

- 밸런스 상수(`tuning.rs`)는 바이너리 내부 — JS에서 접근 불가
- HMAC 키는 XOR 분산 저장 — `strings` 명령으로 추출 불가
- 릴리즈 빌드: `strip=true, lto=true, debug=false` 적용

---

## 6. 자주 발생하는 문제

| 문제 | 원인 | 해결 |
|---|---|---|
| `cargo not found` | PowerShell PATH 미갱신 | CMD 사용 또는 터미널 재시작 |
| `napi not found` | npm install 미실행 | `npm install` |
| `.node 바이너리 없음` 에러 | build:native 미실행 | `npm run build:native` |
| Rust 컴파일 에러 | 코드 버그 | 에러 메시지의 `-->`줄 확인 후 수정 |
| Svelte 변경이 반영 안 됨 | HMR 오류 | 브라우저 새로고침 또는 dev 재시작 |
