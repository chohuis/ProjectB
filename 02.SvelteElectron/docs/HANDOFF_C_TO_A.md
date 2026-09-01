# C → A 인계 · 5차 (2026-09-01)

> **4주 계획도 대기열도 다 비웠다.** 4차 인계는 아직 처리 전이라 여기 합쳤다 —
> 이 문서 하나만 보면 된다.
>
> ```
> vitest        177파일 1,570건 통과
> tsc           깨끗
> svelte-check  오류 0 · 경고 0 · 문제 파일 0
> ```

---

## 1. 🙏 네가 지워야 이어진다 — **순서가 있다**

체육부대 갈래는 C 가 지웠다(`svelte-check` 오류 4 → 0). 네 차례다.

```
types/save.ts:600                CareerApplications.sportsMilitaryApplied
usecases/careerDecision.ts:44    sportsMilitaryApplied: false
```

⚠ `CareerChoiceHubModal.svelte:61` 은 `features/` 라 **내 것**이다.
지금 지우면 타입이 아직 필수라 `tsc` 가 깨져서 안 건드렸다 —
**타입을 지울 때 말해라. 같은 턴에 지운다.**

검사 5건(`career/__tests__/noSportsUnitInResults.test.ts`) · 변이 2건.
죽은 갈래가 되살아나도, 진짜 경로(`advanceWeek:2213 · 2263`)가 지워져도 실패한다.

---

## 2. 🙏 문서 둘이 낡았다

### ① `PARK_CLIP_2026-08-29.md` — **증상이 사라졌는데 안 갱신됐다**

`scripts/parkclip/measure.mjs` 를 다시 돌렸다(560건 = 구장 28 × 해상도 10 × 2).

```
cutTop · cutBottom · cutLeft · cutRight   전부 0
앵커 7,840개 중 화면 밖                    0개
min-height 걸린 건                        0
1366×768 ~ 3840×2160  실사용 10종 전부 통과
```

그 문서는 *"모든 실사용 해상도에서 아래 16~20%가 잘린다 · 홈플레이트·포수·
타자가 통째로 안 보인다"* 로 남아 있다. 경기 화면을 띄워서도 확인했다 —
홈플레이트·포수·타자가 다 보인다.

### ② `TRACK_C_PROMPT.md:129` — 숫자가 남아 있다

```
svelte-check    오류 15 · 경고 37   (C 가 1주차에 34 → 15)
```

**지금은 0 · 0 이다.** §166 에 "숫자를 여기 적지 않는다"를 새로 넣어 뒀는데
그 위 요약 줄이 안 지워졌다.

---

## 3. 🔴 B8 을 고쳤다 — 근본은 **데이터 쪽**이다. 네 판단이 필요하다

백로그 B8 *"해외 빈 순위표 56행 · 미확인 · 문서만"* 을 띄워 보고 잡았다.

### 증상과 진짜 원인

`ABL 마이너` · `JBL 2군` · `KBL 2군` 의 지난 시즌 순위표가 통째로 비었다.
**그런데 데이터는 멀쩡히 있었다** — 세이브를 직접 열었다:

```
LEAGUE_ABL_FARM  16팀 · LEAGUE_JBL_FARM 12팀 · LEAGUE_KBL_FARM 10팀  (2026)
```

화면이 안 보여준 것이었다:

```js
.filter(r => !r.team_id.endsWith("_2"))   // ← 2군을 무조건 뺐다
```

`refs` 가 1군·팜을 **같은 `leagueId`** 로 담아서 ABL 이 32팀 · JBL 이 24팀으로
뜨던 걸 막으려 넣은 필터다(**그 합 56 이 백로그 제목의 숫자다**).
그게 과잉 교정이었다 — 2군 리그 행은 전부 `_2` 라 **통째로 사라졌다.**

### C 가 한 것 — 1군을 볼 때만 뺀다

```js
.filter(r => lid.endsWith("_FARM") || !r.team_id.endsWith("_2"))
```

⚠ **그냥 지우면 안 된다.** 옛 세이브는 1군 `league_id` 아래 팜 팀이 섞여
있을 수 있고 그때 32팀이 다시 뜬다. 그 보호는 남겼다.

### 🙏 네 판단 — `refs` 를 가를 것인가

지금은 **화면에서 우회하는 모양**이다. 저장되는 `history_standings` 는
이미 `LEAGUE_*_FARM` 으로 갈려 있는데 `refs` 만 같은 `leagueId` 를 쓴다.
데이터 쪽을 가르면 이 조건문이 필요 없어진다. `refs` 는 네 소유다.

---

## 4. 🙏 `drive.mjs` 에 창 크기 명령을 넣어 달라

스크린샷 후보 5장을 찍었는데(대기열 6), **경기 화면만 1920×1079** 다.
`drive.mjs` 는 창 크기 명령이 없어 최대화 상태로 찍힌다.

```js
// Electron 은 page.setViewportSize() 를 안 받는다 — 창을 바꿔야 한다.
// ⚠ 최대화·전체화면을 **먼저 풀어야** setContentSize 가 먹는다. 안 풀면 조용히 무시된다.
await app.evaluate(({ BrowserWindow }, s) => {
  const win = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().startsWith("devtools://"));
  if (win.isFullScreen()) win.setFullScreen(false);
  if (win.isMaximized()) win.unmaximize();
  win.setResizable(true); win.setMinimumSize(1, 1);
  win.setContentSize(s.w, s.h);
}, { w, h });
```

C 는 임시 드라이버에 이걸 넣어 해상도 확인을 했다(저장소 밖). `scripts/` 는
네 소유라 `drive.mjs` 는 안 건드렸다. 넣어 주면 스토어 그림을 1920×1080 으로
다시 찍는다.

---

## 5. ⚠ 하나 못 봤다 — 은퇴 **직후** 엔딩

20시즌 완주가 4시간이라, 완성된 커리어 세이브를 만들어 화면만 띄웠다.
그 경로(`나 > 상태 > 기록`)는 `onExit` 을 안 넘기므로 푸터가 `닫기` 하나다 —
**조건부는 확인했다.**

`마치기` 버튼이 뜨는 은퇴 직후 경로는 못 봤다. 실제로 은퇴해야 하는 자리라
픽스처로는 못 만든다.

> **엔진에 시즌 빨리감기가 있나?** 없으면 이건 사용자 실플에 맡기는 게
> 맞다고 본다.

---

## 6. 🔴 눈확인은 **기계로 된다** — 규칙에 넣어라

지시서 3주차가 *"사람만 할 수 있다"* 고 적었는데 `scripts/drive.mjs` 가 이미
있다. Playwright 로 앱을 띄우고 조작하고 스크린샷을 남긴다.
**찍은 그림은 읽을 수 있다.** 그래서 눈확인을 돌렸고 결함 넷을 잡았다.

A1 · 엔딩 · 히스토리 · 눈확인 수단 — **"없다"가 네 번 틀렸다.**
새로 올린 "없다고 적기 전에 재현한다"에 **`scripts/` 도 본다**를 넣어 달라.

```
npm run dev:ui       # Vite 5174. `dev` 는 쓰지 마라 — predev 가 build:native 다 (R1)
DRIVE_USER_DATA=1 SCREENSHOT_DIR=<저장소 밖> node scripts/drive.mjs <명령파일>
```

🔴 **`DRIVE_USER_DATA=1` 을 반드시 켠다.** 안 켜면 사용자의 실제 세이브를 쓴다.

---

## 7. 눈확인에서 잡은 결함 넷 (전부 고쳤다 · 조치 불필요)

정적 검사로는 못 잡는다. 자세한 것은
[TRACK_C_EYECHECK.md](TRACK_C_EYECHECK.md) · [TRACK_C_BACKLOG_456.md](TRACK_C_BACKLOG_456.md).

| | 무엇 |
|---|---|
| ① | `--accent-weak` 는 **정의된 적 없는 토큰**이다 — 태그가 어두운 바탕에 어두운 글자로 안 읽혔다(네 군데) |
| ② | 결산의 `사람` 절에 `staff:TEAM_HS_DOSEONG_COA1` 원문 id 가 떴다 — 코치는 `npcs` 에 없다 |
| ③ | 팀 이름 폴백이 원문 id 였다 — `LeaguePage` 는 `(기록 없음)` 으로 이미 막아 뒀다 |
| ④ | B8 (위 §3) |

②는 **기존 검사가 틀린 전제를 못박고 있었다** — *"personId 로 이름을 찾아야
한다"*. 그게 원인이었다. 단언을 바꿨다.

---

## 8. 🙏 다음 일감을 달라

```
1주  ✅   2주  ✅   3주  ✅   4주  ✅   대기열 1~6  ✅
```

**지시서의 4주 계획과 대기열이 전부 비었다.** 09.28 스팀 빌드까지 남은 것을
알려 달라. 없으면 눈확인을 넓히겠다 — 아직 안 띄워 본 화면이 있다
(드래프트 관전 상세 · 계약 협상 · 진로 허브 · 부상 치료).
