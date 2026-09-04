# Steam 디포 — 올릴 때 보는 한 장 (2026-09-02 작성 · 빌드 전)

> 코드에서 확인한 것만 적었다(`package.json` `build` · `main.cjs` · `dist-steam.cjs`).
> **[ ] 표시는 Steamworks 쪽에서 사용자가 채운다.** A 는 그 값을 모른다.

## 1. 무엇을 올리나

| | 값 | 근거 |
|---|---|---|
| 디포 폴더 | `release/win-unpacked/` **통째로** | electron-builder `dir` 타깃 — 설치기 없음, Steam 이 설치를 맡는다 |
| 실행파일 | `OnePitch.exe` (폴더 루트) | `productName: "OnePitch"` — 6월 빌드는 `ProjectB.exe` 였다 |
| 실행 인자 | 없음 | |
| 검증 | `npm run dist:steam` (pack → `dist-steam.cjs`) | 실행파일 · asar 밖 `.node`/`_manifest.json` · 새는 폴더 · 크기 |
| 크기 감 | 6월 빌드 3,711 파일 · 356.6 MB (players 누출 포함) | 새 pack 은 더 작아야 한다 |

⚠ `pack` 은 `npmRebuild` 로 네이티브를 다시 빌드한다 — **계측이 `.node` 를 잡고
있으면 EPERM.** 계측을 다 끝낸 뒤 돌린다.

## 2. Steamworks 설정 — [ ] 사용자 몫

```
App ID                 [            ]
Depot ID (win64)       [            ]
Launch option          Executable  OnePitch.exe
                       Arguments   (없음)
                       OS          Windows · 64-bit
빌드 브랜치            default (첫 업로드) → [beta 브랜치 이름?          ]
```

## 3. Steam Cloud — 코드 변경 0 으로 된다

세이브는 `app.getPath("userData")/saves` 다(`main.cjs:168`). Windows 에서
`%APPDATA%\OnePitch\saves` 다. Auto-Cloud 로 잡는다:

```
Root         WinAppDataRoaming
Subdirectory OnePitch/saves
Pattern      *
OS           Windows
```

⚠ `DRIVE_USER_DATA=1` 로 띄운 계측·눈확인은 **다른 폴더**를 쓴다 — Cloud 에
안 섞인다. 사용자의 실제 세이브만 동기화된다.

⚠ 세이브 무결성(HMAC)은 미구현이다(CLAUDE.md). Cloud 가 파일을 옮겨도 검증은
없다 — 1.1.

## 4. 올리는 방법 — SteamPipe GUI (사용자)

1. `npm run dist:steam` 이 `OK` 로 끝난 것을 확인한다
2. Steamworks → SteamPipe GUI → 위 Depot ID 에 `release/win-unpacked/` 폴더를 지정
3. 업로드 → 빌드를 `default`(또는 beta) 브랜치에 set live
4. Steam 클라이언트에서 설치 → **첫 실행 · 새 게임 · 세이브 로드** (C 의 11번)

## 5. 안 하는 것 (1.1)

- Steamworks SDK(도전과제 · 오버레이 · 리치 프레즌스) — 코드 흔적 0, 9/28 에 필요 없다
- `steam_appid.txt` — SDK 를 안 실으니 필요 없다
- 설치기(nsis) — Steam 이 설치를 맡는다
