# 인수인계 — Godot 이주

**이 문서가 진행 현황의 정본이다.** 코드 규칙은 `04.GodotOnePitch/CLAUDE.md`.

마지막 갱신: 2026-08-13 · 커밋 `92f2782be`

---

## 한 줄

`02.SvelteElectron`(Svelte + Electron + Rust)에서 **Godot 4.6 · GDScript 단독**으로
이주 중. P0(게이트)·P1(골격) 끝났고 지금은 **M1(기반 자료구조)** 이관 중.

---

## 확정된 결정

사용자가 정한 것들이다. 다시 묻지 않는다.

| | |
|---|---|
| 엔진 | **Godot 4.6.1** (`~/Godot/Godot_v4.6.1-stable_win64_console.exe`) |
| 언어 | **GDScript 단독** — Rust GDExtension·C# 안 씀 |
| 1차 목표 | **PC / Steam.** 안드로이드는 나중 |
| 화면 | 지금 구조 **그대로** 옮긴다 (픽셀이 아니라 구조) |
| 경기 화면 | 현 구조 유지 · 구장 이미지 27장 재사용 |
| 저장 | Godot 네이티브. **기존 세이브 호환 포기** |
| 검사 틀 | **GdUnit4** 6.2.1 |
| UI | **씬(.tscn)** — Godot 관례 방식 |
| 폰트 | **Pretendard** 임베드 (OFL 1.1) |
| 밸런스 | **동결.** 이주 중 게임 수치 안 바꾼다 |
| 막히면 | **멈추고 묻는다** (설계 결정·수치·화면 구조·게이트 실패) |

### 왜 GDScript 단독인가

Rust 코어 24k줄을 gdext로 살리는 안이 처음 권고였으나, 사용자가 모바일과
생태계 표준을 이유로 GDScript를 택했다. **성능 게이트를 실측으로 통과**해서
근거가 생겼다 — 시즌 시뮬 2,124경기가 0.659초(기준 2초).

---

## 끝난 것

```
2aa67b6ec  P0 게이트     시즌 시뮬 0.659초 (기준 2초, 여유 3배)
3c82555eb  저장          열 배열+zstd — 220배 · 18MB → 1.1MB
bca71f885  GdUnit4       Godot 4.6 호환 확인 (웹 검색으로 검증)
54903c0ce  시드 RNG      해시 기반 — 호출 순서와 무관
4259a7dc3  계측 러너      진입점 하나 · 종료 코드 판정
3960b3953  화면 규약      ViewModel 사전 하나
2d41218b6  폰트          Pretendard 임베드
94548dac6  씬 전환        .tscn 방식
a8ac7a6c0  문서          개발 대상을 04로 · 02는 동결
92f2782be  M1 순위표      검사 먼저 → 로직 나중 (변이 5건)
```

**검사 50개 통과.** 미검증 위험(성능·저장) 둘 다 해소됐다.

---

## 남은 것

### 지금: M1 기반 자료구조 (진행 중)

`sim/standings.gd` 끝났다. 남은 것:

- `matchResult` — 경기 결과 자료구조
- `bracket` — 토너먼트 대진
- `accumulateStats` — 선수 시즌 누적 (원본 `season-helpers.ts`에 있음)
- `leaderboard` · `careerSummary` · `digest`

원본: `02.SvelteElectron/apps/ui/src/shared/utils/`

### 그 다음 (아래에서 위로)

```
M2  경기 시뮬 (match_engine)      P0에서 뼈대는 이미 있다 (sim/match_sim.gd)
M3  로스터·로테이션 (rosterEngine) 이번 세션 결함이 여기 — rotationIndex 검사 참고
M4  성장·훈련
M5  드래프트·수상
M6  시즌 진행·오프시즌
M7  화면 55개 (C 검사 9개 포함)
P6  Steam 빌드·패키징
```

---

## 작업 리듬 (M1에서 확인됨)

**모듈 하나마다:**

```
① 검사를 GDScript로 옮긴다
② 빨간불인지 확인한다     ← 통과하면 그 검사가 아무것도 안 보는 것이다
③ 로직을 옮긴다
④ 변이 검증 — 일부러 깨뜨려 잡히는지
⑤ 커밋
```

②를 건너뛰지 않는다. 이 저장소에서 "통과하는데 아무것도 안 보는 검사"가
실제로 여러 번 나왔다.

---

## 검사 53개 분류 (P2-1 결과)

```
A 로직    17파일 · 260검사   순수 함수 — 모듈과 짝지어 옮긴다
B+ 혼합   27파일 · 233검사   TS 소스 정규식이 섞여 있다
C 화면     9파일 · 102검사   M7 몫
```

⚠ **B+의 소스 정규식은 실제 호출로 바꾼다.** 근거: 이번 세션의 로테이션
결함이 **인자 자리가 밀린 것**이라 소스 문자열은 그대로였다. 정규식으로는
못 잡았고 함수를 직접 부르는 검사가 잡았다.

바꿀 수 없는 것만 소스 검사로 남긴다 (예: "이 함수가 삭제된 상태여야 한다").

---

## 명령

```bash
G=~/Godot/Godot_v4.6.1-stable_win64_console.exe

# 검사 (전체 / 한 파일)
$G --headless -s addons/gdUnit4/bin/GdUnitCmdTool.gd --ignoreHeadlessMode -a test
$G --headless -s addons/gdUnit4/bin/GdUnitCmdTool.gd --ignoreHeadlessMode -a test/standings_test.gd

# 계측·벤치
$G --headless --script tools/run.gd -- list
$G --headless --script tools/run.gd -- bench:season
$G --headless --script tools/run.gd -- bench:save

# 화면 스크린샷 (창을 띄운다 — 헤드리스로는 못 찍는다)
$G --script tools/shot.gd -- status
$G --script tools/shot.gd -- status-empty

# 새 class_name을 만든 뒤엔 한 번 돌려야 다른 스크립트가 찾는다
$G --headless --import
```

⚠ `--ignoreHeadlessMode`가 필요하다. GdUnit4가 헤드리스에서 `InputEvent`가
안 간다고 막는데 지금 검사는 UI 조작을 안 쓴다. **M7에서 씬 조작 검사를
만들면 이 전제가 깨진다.**

---

## 겪은 함정 (같은 데서 두 번 막히지 않게)

- **`Control`을 `Window`에 직접 붙이면 앵커가 자동으로 안 먹는다.** 루트가
  0×0으로 남아 회색 판만 찍힌다 — 안쪽 컨테이너는 멀쩡해서 더 헷갈린다.
  씬으로 만들면 안 겪는다
- **스크린샷은 헤드리스로 못 찍는다.** 창을 띄우고 프레임을 돌린 뒤
  `RenderingServer.force_draw()`를 불러야 한다
- **정수 리터럴이 2⁶³을 넘으면 파싱이 실패한다.** FNV-1a의 `0xcbf29ce484222325`가
  그렇다. 오류가 콘솔에만 나고 값은 나와서 조용히 넘어간다
- **`PackedStringArray`엔 `filter()`가 없다.** `Array`와 다르다
- **`var x := dict.duplicate()`는 타입 추론이 안 된다.** `var x: Dictionary =`로 적는다
- **GDScript 주석은 `#`다.** `//`를 쓰면 파싱이 깨진다
- 셸에서 백틱·`${}`가 든 GDScript를 `node -e`로 넣으면 셸이 먹는다.
  스크래치패드에 `.cjs`를 쓰거나 Edit 도구를 쓴다

---

## 02.SvelteElectron에서 무엇을 읽나

**고치지 않는다. 읽는다.**

**① 동작 명세** — 어떤 규칙이 왜 그 값인지가 커밋 메시지와 주석에 있다.
실측 근거까지 같이 있어서 옮길 때 다시 찾을 필요가 없다:

```
드래프트 앵커   round = 11 - (score-78)*0.40 · 문턱 78
                (백분위 93 = score 88 → 7R · NPC 실측 근거)
수상 자격선     다승·탈삼진 40 · 방어율 45
                (45일 때 이닝 중앙 44.3이라 분포 한가운데 앉아 있었다)
잠재력 범위     random(80~99)
                (프리셋 최고 스탯 78보다 위여야 성장이 안 막힌다)
교체 규칙       max_outs = 12 + (스태미나/99)*15
                (NPC와 같은 식. 주인공만 스태미나 문턱을 쓰던 걸 고쳤다)
```

**② 검사 53개** — 비싸게 배운 게 코드로 박혀 있다.

### 02에 미해결로 남긴 것 (이주 후에 다시 볼 목록)

- `MainPage` 등판 회피가 선수 기록 없는 점수만 만든다
- `syncProtagonistLeagueUpdate`가 로테이션·피로를 안 건드린다 (주인공 팀 한정)
- `test:rosterbalance` 4건 — 시즌말 포수 0명
- 이야기 이벤트 87% 유실
- 동료가 떠난 뒤에도 `together`
- 소식함 200통 포화

---

## 지금 파일 구조

```
04.GodotOnePitch/
  CLAUDE.md          코드 규칙 (금지 사항·성능 규칙·함정)
  docs/RESUME.md     이 문서 — 진행 현황 정본
  docs/shots/        화면 스크린샷
  fonts/             Pretendard + OFL.txt
  sim/               standings · npc_store · rng · match_sim
  ui/                theme · fixtures · parts/*.tscn · screens/*.tscn
  test/              GdUnit4 검사
  tools/             run.gd(계측) · shot.gd(스크린샷)
  bench/             fixtures · save_bench · rng_probe
  addons/gdUnit4/    6.2.1
```
