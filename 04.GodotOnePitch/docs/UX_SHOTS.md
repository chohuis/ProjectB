# 04 화면 캡처 목록 — UI/UX 보고서 조각 1

UI/UX 보고서(02↔04 화면 대조)의 근거가 될 캡처다. **보고서에서 화면을
가리킬 때 이 이름을 쓴다.**

```bash
godot --script tools/shot.gd -- <이름>     # 창이 뜬다 — 헤드리스 불가
```

저장 위치: `%APPDATA%\Godot\app_userdata\OnePitch\shots\<이름>.png`
크기: 1440×900 (구장만 1000×920 — 좌표를 1:1로 재려고 그렇다)

**39갈래 전부 찍혔다. 못 찍은 갈래는 없다.**

## 목록

| 갈래 | 무엇을 보나 | 바이트 |
|---|---|---|
| `title` | 타이틀 — 슬롯이 빈 상태 | 17,898 |
| `title-saved` | 타이틀 — 슬롯 둘에 세이브 | 26,396 |
| `newgame-screen` | 새 게임 만들기 | 14,413 |
| `newgame` | 새 게임 직후 (진짜 세계 생성을 거친다) | 30,364 |
| `newgame-schedule` | 새 게임 직후 일정 탭 | 55,103 |
| `status` | "나" 화면 (fixture) | 59,419 |
| `status-empty` | "나" 화면 — 빈 상태 | 25,430 |
| `main` | 진행 화면 (fixture) | 63,158 |
| `main-gameday` | 진행 화면 — 등판일 | 62,085 |
| `app` | AppRoot 기본 (탭 0 = 소식) | 63,158 |
| `news` | 소식 탭 | 63,158 |
| `app-running` | 진행 중 표시 (2/5) | 64,189 |
| `schedule` | 일정 탭 | 52,647 |
| `league` | 리그 탭 (40일 진행 뒤) | 69,042 |
| `team` | 팀 탭 | 107,079 |
| `me` | "나" 탭 | 54,453 |
| `me-played` | "나" 탭 — 기록 하위 탭, 경기 치른 뒤 | 38,343 |
| `people` | 인물 탭 — 관계가 실제로 갈린 뒤 + 지난 인연 | 183,905 |
| `people-empty` | 인물 탭 — 빈 상태 | 21,573 |
| `academics` | 학사 — 12주 돌린 뒤(중간고사 포함) | 87,782 |
| `finance` | 재정 — 프로 + 구독 + 8주 | 103,147 |
| `finance-bottom` | 재정 — 스크롤 맨 아래 | 109,801 |
| `achievements` | 업적 — 6번 진행 뒤 | 86,509 |
| `training` | 훈련 계획 | 32,220 |
| `training-picking` | 훈련 — 슬롯 고르는 중 | 75,685 |
| `match` | 경기 — 24구 던진 뒤 | 744,427 |
| `match-mine` | 경기 — **내가 마운드에 선 순간** | 739,618 |
| `match-done` | 경기 — 자동 진행으로 끝낸 뒤 | 997,366 |
| `park` | 구장 — 미지정(프로 기본 그림) | 1,752,595 |
| `park-pro` | 구장 — 프로 전용 그림 (서울 가디언스) | 1,332,229 |
| `park-univ` | 구장 — 대학 (금강대) | 1,290,392 |
| `park-hs` | 구장 — 고교 (설악고) | 1,224,963 |
| `season-end-before` | 시즌 마지막 날 (누르기 전) | 29,897 |
| `season-end` | 시즌 종료를 누른 직후 | 35,579 |
| `season-digest` | 시즌 결산 (fixture) | 40,194 |
| `draft-board` | 드래프트 보드 — 진짜 시즌을 끝내 만든 지명 | 116,458 |
| `draft-board-empty` | 드래프트 보드 — 빈 상태 | 16,951 |
| `retire-ask` | 은퇴 물음 | 23,805 |
| `retire-summary` | 은퇴 결산 | 60,460 |

## 찍으면서 나온 것 둘

### ① 학사·재정 캡처가 두 달 넘게 죽어 있었다

`academics` · `finance` · `finance-bottom` 셋이 **`newgame`과 바이트까지 같은
그림**을 냈다(30,364B). 셋 다 새 게임 첫 화면이었다.

```
SCRIPT ERROR: Invalid call. Nonexistent function '_apply_one_week'
              in base 'Control (AppRoot)'.
   at: <anonymous lambda> (res://tools/shot.gd:375)
```

P-7에서 주간 처리를 `app_root._apply_one_week` → `WeekRunner.run`으로 옮길 때
`tools/shot.gd`를 안 따라 고쳤다. GDScript는 **없는 메서드를 부르면 그 자리에서
람다가 중단**되므로, 뒤에 있던 탭 전환도 같이 안 돌았다. 그런데 **스크린샷은
정상 종료로 저장된다** — 콘솔을 안 보면 "찍혔다"로 지나간다.

`WeekRunner.run(<root>.state(), w * 7)`로 고쳤다. 87,782 / 103,147 / 109,801B로
돌아왔다.

⚠ **바이트가 겹치는지를 보는 게 이걸 잡은 방법이다.** 캡처가 늘면 눈으로 다
못 보므로 앞으로도 같은 크기가 나오면 의심한다.

### ② `park-pro`가 죽은 갈래였다

`ParkVm.build("STADIUM_PRO")`를 넣고 있었는데 `parks.json`의 `tier_of` 27개에
그런 id가 없다. `tier_of`가 모르는 구장을 프로 기본값으로 돌려주므로
(`park_vm.gd:41-42`, 해외 구장 때문에 의도된 동작이다) `park`와 **완전히 같은
그림**이 나왔다.

티어가 셋(pro · university · highschool)이고 좌표가 티어마다 다르다
(`park_vm.gd:12-13`). 실재하는 id로 바꾸고 셋을 다 찍는다 — 그래야 D-6
좌표 대조가 뜻을 갖는다.

## 겹쳐도 맞는 것

`main` · `app` · `news`가 셋 다 63,158B다. **이건 정상이다** — 탭 0이 소식이고,
04는 화면 바깥에 상시 껍데기(사이드바·헤더)가 없어서 `AppRoot`로 띄운 것과
화면만 띄운 것이 같은 픽셀이 된다.

02는 `SidebarNav` + `TopHeader` + `RightPanel`의 3분할 껍데기가 늘 떠 있다
(`features/main-layout/`, `features/navigation/`). **보고서 "탐색" 축에서 다룬다.**

## 캡처 스크립트

`scratchpad/shots.ps1`로 39갈래를 한 번에 돌렸다.

⚠ **한글이 든 `.ps1`은 PowerShell 5.1이 ANSI로 읽어 파스가 깨진다.** 처음에
로그 필터에 한글을 넣었다가 스크립트가 통째로 안 돌았다 — 오류가 캡처
실패가 아니라 파서 오류로 나와서 원인이 안 보였다. 스크립트에 한글을 넣지 않는다.
