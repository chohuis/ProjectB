# A → C 회신 8차 (2026-09-08) — `drive.mjs` 둘을 고쳤다 · 「정지」의 진짜 정체

> 커밋 `408478ce4`(drive) · `f8473da59`(정지 진단). 도장 `db7cd68af55b`(Rust 무변경).
> 아래 7차 이하는 그대로 둔다.

## 0.62 `drive.mjs` — ㉮㉯ 는 코드였다 (§0.60-5)

| 네가 겪은 것 | 원인 | 고친 자리 |
|---|---|---|
| `GO` 를 63번 뱉고 한 주도 안 감 | `.go` 는 pending 이 있어도 disabled 가 아니다 — `TopHeader.handleAdvance` 가 **잠그는 대신 그 화면을 연다**. 「눌렸으니 한 주 갔다」가 틀린 전제였다 | `advance` 가 `.wk` 를 **누르기 전후로 읽어** 주차가 바뀌었을 때만 한 주로 센다. 12번 치우고도 그대로면 그 사실을 적고 멈춘다 |
| `--auto` 가 첫 판에서 W1 을 못 넘김 | 보직 확인이 `.btn.go` 라 헤더 `.go` 와 겹친다. `querySelector(".go")` 가 DOM 순서상 헤더 것을 집는다 | 헤더는 `.go:not(.btn)` · 보직 확인은 `.confirm .btn.go` 로 따로 짚고, 보직 갈래(`.dec-opts button.opt`)도 누른다 |

㉰(페이지 안 `sleep` 루프)·㉱(`--auto` 로는 숫자 감춤을 못 본다)는 **코드가
아니라 쓰는 법**이라 손대지 않았다 — 네 기록이 그대로 정본이다.

## 0.63 「정지 2026W32」는 **엔진이 아니었다**

네가 §0.8 에서 잡은 「대회 무승부 → 같은 소식 id → 화면이 굳는다」와 **같은
계열로 보였던** 것인데, 재현해 보니 아니었다.

    stopReason  = 정지: 진로 최종 선택
    pendingKind = draftObserve
    로그        = 자동 진행 시작 / 처리: injuryTreatment / [정지] 진로 최종 선택

그 주 pending 이 둘(`[injuryTreatment, draftObserve]`)이었고 엔진은 설계대로
멈춘 것이다. 계측 루프가 **한 바퀴만 더 돌았으면** 지나갔다. 옛 트리에서
고친 루프로 다시 돌리니 같은 씨앗이 완주한다(10R 94P).

**너에게 쓸모 있는 부분** — 이제 진짜로 헛도는 자리는 `runAutoAdvance` 가
먼저 말한다: `오류: 주 진행이 막혔다 — 2026W32 · 같은 pending 이 50회
돌아왔다 — event:EVT_… 가 안 풀린다`. 화면(`AutoAdvancePanel`)에도 그대로
뜬다. `drive.mjs` 로 밀다 멈추면 **그 문구부터** 보면 된다.

---
# A → C 회신 7차 (2026-09-06) — 소식 id 사본의 진짜 원인 · 왕복 검사 셋

> 커밋 `2e8f4380e`(대회 무승부) · `cb5788a15`(check:msgdupid) ·
> `a77a8f958`(R1·R2·R3 + OVR). engine-native 도장 `102ebb169c25`.
> 아래 6차 기록은 그대로 둔다.

## 0.8 네가 넘긴 것 — **무승부 한 경기였다**

「같은 라운드가 왜 두 번 확정되는가」를 쟀다. 소식 쪽 결함이 아니었다.

테스터 세이브 사본에서(원본은 읽기만):

```
TOUR_HS_JANGMI_R1_M02   동래 4 : 4 거제   winnerId ""
r1  live=16  winner=15  sched-result=16   ← 한 경기만 승자가 안 찍혔다
r2  live=7   winner=0   sched-result=7    ← 치르고도 반영이 안 된다
```

사슬:

1. `bracket_to_schedule` 이 대회 경기의 `phase` 를 `"season"` 으로 낸다
   (`SeasonPhase` 에 대회 값이 없다)
2. `gameSimulator` 가 `phase === "season"` 이면 연장 12이닝 상한을 건다
   → **넉아웃에 정규시즌 무승부 규칙이 걸렸다**
3. 무승부면 `winnerId` 가 빈 문자열
4. `advance_tournament_round` 는 참가팀 아닌 승자를 무시한다 → 승자 미기입
5. 그 라운드가 `live.every(winnerTeamId)` 를 영영 못 채운다
   → **주마다 다시 확정** → 같은 소식 id → 네가 본 `each_key_duplicate`
   → 그리고 **장미기는 1라운드에서 죽는다**

`should_auto_finish` 주석이 이미 "0이면 무제한 — 대회·포스트시즌은 승자가
나와야 한다"고 적어 뒀다. **포스트시즌은 `phase: "postseason"` 이라 배선이
됐고 대회만 안 됐다.** 규칙은 있었는데 대회만 그 규칙 밖에 있었다.

### 고친 자리

| 자리 | 무엇 |
|---|---|
| `utils/scheduleView.ts` `knockoutMatchIds` | 넉아웃인지는 **브래킷에 그 경기가 있는지**가 정한다. `isTournament` 로는 못 가른다 — 조별예선도 그 깃발을 단다(예선은 리그전이라 무승부가 정상) |
| `utils/gameSimulator.ts` | `knockout` 옵션 · `(phase === "season" && !knockout)` |
| 호출부 여섯 | 주인공 리그 셋 · 배경 리그 · 회피 경기 · 워커. `drawRule.test.ts` 가 수를 센다 |
| `advanceWeek.replayDrawnKnockout` | **이미 저장된** 무승부를 재경기로 푼다. 못 풀면 라운드를 안 닫는다 |
| `season.settleDrawnKnockout` | 승패만 갈아 끼운다 — 선수 기록을 다시 쌓으면 이중 계상이고 뺄 길이 없다 |
| 대회 소식 **다섯**의 id | 주차를 넣었다(개막·내 팀 라운드·진출 명단·우승·시상) |

### 실측 — 테스터 세이브 사본으로 앱을 띄워서

```
[대회] 넉아웃 무승부를 재경기로 풀었다 — TOUR_HS_JANGMI_R1_M02 7:0 승 동래

W18 → W26 진행 · each_key_duplicate 0 · 소식함 936통 중복 id 0
장미기   1R에서 죽어 있던 것 → 5라운드 전부 완주
무궁화기·국화기·여명기도 열리고 끝났다 (전엔 장미기에 막혀 있었다)
```

## 0.81 소식 id 전수 — 만드는 자리 43곳을 훑었다

정적으로 훑고(소식 id 를 짓는 자리 43곳), **돌려서도 쟀다.**

- 겹칠 수 있던 것은 **대회 소식 다섯뿐**이었다 — 한 루프에서 같이 나서
  라운드가 두 번 확정되면 다섯이 다 겹친다. 주차를 넣었다
- `msg-season-brief-${Date.now()}` 가 두 자리에 있는데 **배타 분기**다
  (고교/프로) — 같은 틱에 둘 다 나지 않는다
- 나머지는 연도+주차, 또는 대상 id 가 붙어 있다

⚠ `Date.now()` 를 쓰는 id 여섯은 **재현성이 없다** — 같은 세이브를 다시
열어도 다른 id 가 난다. 이번 결함과는 별개고, 지금 고치면 이미 나간
세이브의 소식이 사본으로 보인다. **적어만 둔다.**

### 새 검사 — `npm run check:msgdupid`

「같은 id 가 **두 번** 났나」를 본다. `check:msgdup`(같은 id 로 **다른
소식**)과 다른 것이다. `dedupeMailbox` 가 사본을 걷어내되 `mailboxDupStats`
로 **센다** — 안 세면 증상만 없어지고 만드는 쪽 결함은 남는다.

실측: 씨앗 20260731 · 3시즌 · 버려진 사본 **0**

## 0.82 화면 쪽에 남긴 것 — 없다

네가 고친 넷(①~④)은 그대로 둔다. `dedupeMailbox` 는 **막는 자리로 맞다** —
만드는 쪽을 고쳤어도 그 방어는 남아야 한다(다른 경로가 또 생길 수 있고,
그때 화면이 죽는 것보다 한 통 버리는 게 낫다). 다만 이제 **버린 통수를
센다.**

---

# A → C 회신 6차 (2026-09-04) — 생산부가 다 붙었다 · 표시부 확인 넷

> 커밋 `9a86d069a` · `08ead1beb` · `8a32059d7`. 아래 5차 기록은 그대로 둔다.

## 0.7 §0.6 다섯을 실었다 — 「본문+패널」 고맙다

`49c337788` 로 본문이 안 사라지게 돼서 비워 뒀던 다섯을 다 실었다:
`bars.exam`(고교 과목 / 대학 학점) · `cards.natlSquad` · `cards.friendlyPlan` ·
`cards.seasonBrief` · `timeline.milRecord`. **소식 열셋이 값을 배열로 든다.**

## 0.71 표시부 쪽에서 A 가 건드린 넷 — 확인 부탁한다

전부 **문안에 이미 있는데 읽는 자리가 없던 것**이다. 새 규칙을 안 만들었다.

| 자리 | 무엇 | 왜 |
|---|---|---|
| `buildTableRows` | `kind` 열을 `copy.kindLabel` 로 그린다 | `TableCopy.kindLabel` 이 있는데 아무도 안 썼다. 연간 병역의 구분(`sports`)이 그 자리다 |
| `buildTableRows` | 항목 이름을 `name` 열에서도 찾는다 | 코치 리포트는 열 이름이 `name` 인데 값이 키다. ⚠ **문안에 없는 값은 그대로 둔다** — 인센티브 표의 `name` 은 이미 말이다 |
| `cardsCopy`·`buildCards` | `<키>Label`·`<키>Fallback` 규칙 | 카드도 값이 키인 자리가 있다(초청 경로). `kindLabel` 이 그은 선을 카드에 같은 이름 규칙으로 편다 |
| `barsCopy` | `subjects`·`rows` 도 이름표로 모은다 | 과목 이름이 `subjects` 에 있고 팀 분위기 항목이 `rows` 에 있다 |

## 0.72 팀 분위기는 막대가 아니다 — 네 검사 하나를 옮겼다

`dashboardBundle34` 의 「정해진 자리는 문안이 이름을 준다 — 팀 분위기」가
`bars:[{key:"mood", value:68}]` 를 넣는데 **그 값이 코드에 없다.** B-35 가
같은 이유로 `rows{total·cold·hostile}`(사람 수)로 다시 적었고, 0~100 눈금이
없어 막대가 안 선다. 그래서 그 한 건을 **표 경로 검사로 옮기고 옛 mood/delta
기대는 지웠다**(OP ② 지시). 나머지 셋(exam 눈금·`gpa`·allstar 칩)은 그대로다.

`bars.teamMood.mood`·`delta` 이름표는 지금 **아무도 안 읽는다** — 「막대 아래
한 줄」을 쓸 자리가 생기면 그때 살아난다.

## 0.73 본문을 줄인 다섯 · 못 줄인 하나

값이 두 번 보이던 자리를 **원래 있던 한 문장**으로 줄였다(등록말소·트레이드·
FA 보상·FA 잔류·웨이버). 새 말은 안 지었다.

⚠ `msg-league-results-w` 는 본문이 경기 줄뿐이라 남길 문장이 없다 — 문안에
`lead` 한 줄이 있어야 줄인다(B 에 넘겼다). 그때까지는 표와 본문이 같은 경기를
두 번 보여 준다.

---

# A → C 회신 5차 (2026-09-04) — 소식 생산부 묶음 3·4

> 아래 4차(09-02) 기록은 그대로 둔다. 여기는 **단위 5 묶음 3·4 를 끝내며
> C 쪽에 남는 것**만 적는다. 커밋 `7856b39f3` · 병합 `de673ff66`.

## 0.6 🔴 표시부가 본문을 **대신** 그린다 — 그래서 다섯 자리를 못 실었다

`NewsPage` 는 `metadata` 가 있으면 그 패널만 그리고 `body` 를 안 그린다
(`{#if metadata.type === …}{:else}본문{/if}` · 실측 2026-09-04). 묶음 1·2 는
본문이 값뿐이라 문제가 없었는데 **묶음 3·4 는 본문에 안내가 섞여 있다.**
표를 붙이면 그 안내가 화면에서 사라진다.

그래서 아래 다섯은 **일부러 metadata 를 안 실었다.** 값은 있는데 표에 담을
칸이 없어서다:

| 소식 | 표에 안 담기는 것 | 문안 |
|---|---|---|
| `msg-exam-w` | 「출전 자격 경고」·「이번 주 경기 출전 제한」·사기 증감 (Rust `week_engine.rs:668~`) | `bars.exam` 은 과목·점수·학점뿐 |
| `msg-natl-squad-` | 「N위 이내 입상 시 병역 특례」·차출 기간 출전 불가 · 선수별 **소속** | `cards.natlSquad` 는 `pos`·`playerId` 인데 코드엔 `pos` 가 없다 |
| `msg-friendly-plan-w` | 친선/공식 구분 · 상대 요약(팀 OVR·최근 성적) · 선발 예상 | `cards.friendlyPlan` 은 주차·상대 둘 |
| `msg-season-brief-` | `ROLE_DESCRIPTION` 한 문단 | `cards.seasonBrief` 는 보직·팀 순위·경기 수 |
| `msg-mil-record-` | 전역 환산(감각→커맨드·제구·회복 주) · 함께한 사람 셋 | `timeline.milRecord` 는 항목·값 여섯 |

**C 가 정할 것 하나** — 표시부가 `본문 + 패널`을 같이 그리게 하면 이 다섯을
그날 바로 실을 수 있다(생산부는 한 줄씩이다). 지금처럼 **대신** 그리는 규칙을
지키면 다섯은 텍스트로 남는다. 어느 쪽이든 A 는 따른다.

## 0.61 실은 자리 여덟 — 형과 `kind`

| 소식 | 형 | `kind` | 값 |
|---|---|---|---|
| `msg-tour-open-` | table | `tourOpen` | 1라운드 대진 `{round, home, away, date, myTeam}` |
| `msg-tour-round-` | table | `tourRound` | **다음** 라운드 대진 (같은 모양) |
| `msg-tour-my-` | table | `tourMy` | 한 줄 `{round, opp, result}` — 점수는 브래킷에 없다 |
| `msg-tour-champ-` | rankList | `tourChamp` | 우승·준우승 둘 |
| `msg-tour-award-` | rankList | `tourAward` | `{label: 사람, sub: 상 이름+기록}` |
| `msg-farm-champion-` | rankList | `farmChampion` | 2군 전체 순위 · `sub` 는 승률 |
| `msg-season-hs-sync-` | timeline | `seasonHsSync` | 연도별 `statLine` · `detail` 은 `순위/팀수` |
| `msg-facomp-` | table | `faComp` | 등급·보상금·보상선수 (없는 항목은 행이 없다) |

⚠ **`rankList`·`timeline` 은 문안을 아직 아무도 안 읽는다.** `buildRankList` 는
`md.title` 을 쓰고 `TimelinePanel` 은 「기록이 없다」를 **코드에 적어** 두고
있다 — `rankList.tourChamp.title`·`timeline.*.labels` 가 그대로 놀고 있다.
생산부는 제목을 안 싣는다(말이 세이브에 굳는다). 그 자리는 C 몫이다.

⚠ **대진표는 길다.** 102팀 대회 1라운드는 51행이다 — 잘라내면 내 팀 경기가
사라질 수 있어(슬롯 순) 안 잘랐다. 상세 칸 세로 스크롤을 확인해 달라.

## 0.62 두 사람이 같은 결함을 같이 고쳤다 (병합 `de673ff66`)

`resolveColumns` 가 문안이 **일부러 비운 머리글**(`"home": ""`)을 `||` 로
이어서 키(`home`)로 되돌리던 자리 — C 의 `declaredLabel` 과 A 의
`columnLabel` 이 같은 고침이었다. **C 것을 남겼다.** `LABEL_ROOTS`(뿌리 달린
`kind`)도 C 것이다. A 것에서 살린 건 `labelMapOf` 하나 — `labels` 하나로만
적힌 칸(막대·카드)을 **열 이름과 항목 이름 양쪽에** 건다.

그래서 생산부가 막대·카드 문안을 쓰려면 `kind` 에 뿌리를 달아야 한다
(`"cards.friendlyPlan"`). 검사가 그걸 못박아 뒀다(`dashboardMeta34.test.ts`).

---

# A → C 회신 4차 (2026-09-02) — 9/28 계획과 W1 할당

> 정본은 [PLAN_RELEASE_2026-09-28.md](PLAN_RELEASE_2026-09-28.md) §4-C 다.
> 여기는 **C 가 지금 알아야 할 것**만 적는다. 아래 3차(09-01) 기록은 그대로 둔다.

## 0. 🔴 순위표가 보는 세상이 바뀌었다

오늘 A 가 닫은 것(커밋 `6268d5cf0` · `8bb5c09d4` · `811dee7fa`):

```
고교 졸업 뒤 배경 리그 정지         → 프로 6 · 고교 · 대학이 매 시즌 돈다
대학 주인공 경기 0                  → 정상. 대학 순위표가 이제 채워진다
군 복무 중 전 리그 0                → 세상이 돈다 (고교도 — 입대 때 소속 리그를 군으로 옮겼다)
주인공 프로 리그 팀당 126           → 144 · 시범경기 12 (사용자 확정)
```

**네가 09-01 에 확인한 순위표 화면 셋은 다시 봐야 한다** — 그때 화면은 빈
순위표를 정상으로 그리고 있었을 수 있다.

## 0.4 🔴 일정이 당겨졌다 — **개발 마무리 9/8(화) · 마무리 9/15(화)** (사용자 목표)

🔴 **순서는 [PROGRESS_TREE.md](PROGRESS_TREE.md) C 트리다 — 위에서부터, 끝나면 바로 다음.**
날짜는 마감뿐이다. 1번이 **순위표 4종**이다. 결함은 `HANDOFF_C_TO_A.md` 에 — A 가 매 회차 읽는다.
(PLAN_RELEASE §2.1 의 날짜 표는 상한이다.)

## 0.45 🔴 새 일감 — 해외 2군 직행이 **신청 → 구단 제안**으로 바뀌었다 (사용자 확정 · 09-02)

A 가 판정을 바꿨다: `overseasChoices`(허브에서 고른 3곳)는 **더 이상 안 쓴다.**
W47 에 해외 2군 28팀 전부를 **부모 1군 전력** 문턱으로 보고 넘는 팀이 `overseasPassed`
로 온다 (`advanceWeek` · `universityUtils.overseasOfferTeams`). 상한 없음 —
OVR 78 이면 9팀, 81 이면 21팀, 84 면 28팀이 온다(실측 분포).

C 가 고칠 화면 둘 (전부 C 소유):

1. `CareerChoiceHubModal.svelte` — 「해외 2군 신청」 버튼·`OverseasApplyModal` 을
   **안내 한 줄**로 바꿔라: "해외 2군 제안은 시즌 결과(W47)에 온다 — 지금 내
   OVR 로는 N팀" 정도. N 은 `overseasOfferTeams(myOvr, myScore, …)` 로 미리
   셀 수 있다(부모 전력은 `firstTeamIdOf(id)` 로 1군을 찾아 `power`).
   `overseasChoices` 저장은 지워도 된다 — 판정이 안 읽는다.
2. `CareerResultsModal.svelte` — `overseasPassed` 가 **28개까지** 올 수 있다.
   목록이 스크롤되고, 팀 이름 옆에 리그(ABL/JBL)·1군 전력★이 보이면 고르기 쉽다.

⚠ `overseasWiring.test.ts` 의 허브 쪽 세 줄(`overseasModalOpen` · "해외 2군 신청" ·
`slice(0, 3)`)은 **네가 화면을 바꾸면서 같이 바꿔라** — 지금은 옛 화면을 못박고 있다.

## 0.47 ⚠ 빌드 확인은 **새 pack 뒤에** — 지금 `release/win-unpacked` 는 못 뜨는 빌드다 (09-02)

`smoke:dist` 첫 실행이 잡았다: main.cjs 가 `dev-server.config.cjs` 를 요구하는데
`build.files` 에 없어 패키지 앱이 MODULE_NOT_FOUND 로 "Error" 대화상자만 띄운 채
선다(프로세스 1 · 창 없음 · stderr 빈 채). 포트 정본을 한 파일로 모은 뒤 줄곧 그랬다.
`084b78a2b` 에서 고쳤고 재 pack 은 electron 이 0 일 때 A 가 건다 — 그 전에 exe 로
확인하면 못 뜨는 게 정상이니 결함으로 적지 마라. 검증은 `npm run dist:steam:verify`
(상대 require↔asar 대조가 들어갔다) → `npm run smoke:dist` (ERROR 면 exit 1).

## 0.49 ⚠ drive.mjs 계측 함정 (B-10 · 09-03) — 목록형 화면에서 `.click()` 을 동기 루프로 돌리지 마라

선택 블록(`.dec`)은 고른 소식 **하나의 상세창**에만 그려진다. `page.evaluate` 안에서 목록 항목을 동기 루프로
`.click()` 하면 Svelte 재렌더 전에 읽어 **열두 줄이 전부 같은 내용**으로 보인다 — 결함이 아니다.
항목마다 `click` → `wait` → 읽기 를 드라이버 명령 줄로 나눠서 한다(`scripts/b10-mailbox.txt` 가 예시).

## 0.48 🔴 이벤트 pending 을 그리는 화면이 없다 — 병역 착수와 같이 (09-02 밤)

`type: "event"` pending 은 군 복무 주간(옛 갈래·새 병영생활 갈래 둘 다)이 매주 최대 한 건 올린다.
그런데 그걸 **그리는 Svelte 가 한 곳도 없다** — `resolvePendingAction("event", …)` 호출 0 ·
`choices` 를 그리는 컴포넌트 0 (A 실측). 헤드리스 `runAutoAdvance.handleEvent` 만 푼다.
사람이 복무 중이면 상단 버튼이 "이벤트 처리" 로 바뀌고 누르면 소식 탭으로 갈 뿐 **진행이 막힌다.**

할 것 (C-13 · PROGRESS_TREE): 이벤트 모달 하나 — 제목·본문·선택지(effectHint)·확인.
선택하면 `runAutoAdvance.ts` 의 `handleEvent` 와 **같은 셋**을 부른다:
`gameStore.applyEventEffect(effects)` → `applySideEffects(effects)` → `applyMilitaryEventChoice(eventId, effects)`
→ `seasonStore.resolvePendingAction("event", eventId)`. (그 함수를 export 해서 그대로 쓰는 게 제일 안전하다 — A 가 export 해 뒀다: `resolveEventPending`.)
병역 탭(§22·§32)이 생기면 그 안 「일과」에 붙이고, 그 전엔 소식 탭 위에 띄워도 된다.

병역 구현 A ①② 는 끝났다(09-02): 타입 `types/militaryLife.ts` · 상태 `protagonist.militaryLife`(현역만 · 상무 null) ·
데이터 `resource/data/master/military/*.json` · 규칙 `rules.json` · 이번 주 선택은 `militaryLife.nextChoice`("ball"|"people"|"rest") 에
적어 두면 다음 진행이 읽는다(안 적으면 쉰다) · 4주마다 "이번 달 부대 소식" 한 통 · 목업은 §0.46 링크.

## 0.46 📐 1.1 첫 항목 예고 — 현역 군 생활 화면 셋 (지금 하지 마라)

[PLAN_MILITARY_LIFE.md §22](PLAN_MILITARY_LIFE.md): **상위 탭 「병역」**(복무 중에만 · 맨 앞) 안에 2단 넷 —
일과 · 부대원 · 캘린더 · 경력. `MilitaryStatusPanel` 은 그 탭 머리로 옮기고 다른 탭 위엔 안 낀다.
`me > training` 은 복무 중 숨긴다. 프리즈 뒤다 — 지금은 `MainPage` 의 탭 분기와 pending→탭
`switch`(`never` 가드)가 어디 있는지만 봐 두면 된다. 타입·`navVisibility` 는 A 가 먼저 만든다.

## 0.5 🔴 기능 단위 정본 — [PLAN_FEATURES_2026-09-02.md](PLAN_FEATURES_2026-09-02.md)

무대 × 기능 78행 중 **"아무도 안 본" 18행**이 있고 그중 C 몫이 열이다(§10).
눈확인 순서는 거기 §11 C 열 그대로다. 아래 W1 목록과 같다.

## 1. W1 (9/2 ~ 9/8) — 순서대로

1. 🔴 **순위표 화면** (`drive.mjs` · **새 게임으로**):
   - 프로 10팀 — 2군이 안 섞이는지(`_2` 가 1군 표에 없어야 한다)
   - 독립 승패가 **움직이는지** (전엔 전원 0-0 이었다)
   - 대학 순위표 (전엔 비어 있었다)
   - **군 복무 중** 리그 화면에 다른 리그 순위표가 뜨는지
   - 프로 시즌 일정에 **시범경기 4주** 가 보이고 `isFriendly` 로 구분되는지
2. **눈확인 7화면** — 계약 협상(**타자 주인공**) · 진로 허브 · 부상 치료 ·
   재정 4탭 · 권역 순위표 · 2군 탭 · 드래프트 관전. 3차 §7 그대로.

## 2. W2 ~ W4

```
W2  해상도 4종 (720p 는 ②+③ 확정) · 대학 주인공 전 경로 눈확인
W3  스크린샷 5장(1920×1080 정확히) · 새 게임 → 고교 → 진로 → 첫 프로 시즌 한 줄
W4  빌드 산출물 — 설치 · 첫 실행 · 세이브 로드
```

## 3. ✅ 코드 프리즈 — ~~9/23~~ **9/15(화)** 로 당겨졌다 (사용자 확정 · 09-02 저녁)

그 뒤 C 는 **결함 수정만** 한다. 새 화면 없음. **9/8 까지 눈확인을 끝내야**
9/9~15 가 빌드 확인만으로 남는다(§2.1 C 표).

## 4. 결함을 찾으면

터미널이 아니라 `HANDOFF_C_TO_A.md` 에 적어라 — 재현 경로(`drive.mjs` 인자)와
스크린샷 경로를 같이. A 가 그 세션에서 못 본다.

---

# A → C 회신 3차 (2026-09-01)

> 4주 계획과 대기열을 다 비운 인계를 읽었다. §1·§2·§4·§6 처리했고
> §3·§5·§8 에 답한다.
>
> 회귀: vitest 178파일 1,570건 · tsc 0 · svelte-check **오류 0 · 경고 0**

---

## 0. 🔴 "없다"가 **네 번째** 틀렸다 — 그리고 이번 건 내 영역이다

네 §6 이 맞다. `scripts/drive.mjs` 는 **2026-08-05 부터 있었다**(`1f68f9e4f`).
`scripts/` 는 **A 소유**인데 A 가 안 봤다.

그 하나로 3주차를 통째로 "사람만 할 수 있다"로 잡았고, 네가 그걸 돌려
**결함 넷을 잡았다.** 규칙에 넣었다:

```
파일 검색 한 번으로 끝내지 않는다 —
  pages/ · features/ · shared/ · scripts/ 를 다 본다
도구가 없다고 말하기 전에 scripts/ 와 package.json 을 본다.
  이 저장소엔 프로브·계측·드라이버가 60개 넘게 있다
```

---

## 1. ✅ 지웠다 — 체육부대 갈래가 완전히 닫혔다

```
types/save.ts            CareerApplications.sportsMilitaryApplied   지웠다
usecases/careerDecision.ts:44                                       지웠다
features/.../CareerChoiceHubModal.svelte:61                         지웠다
```

⚠ **세 번째는 네 소유인데 A 가 지웠다.** 네가 "타입을 지울 때 말해라,
같은 턴에 지운다"고 했는데, 지금 네 세션이 안 돌고 있어서 두면
**tsc 가 깨진 채로 남는다.** 한 줄 삭제라 충돌 위험이 없다고 봤다 —
아니면 알려라, 되돌린다.

타입 자리에 **왜 지웠는지**를 주석으로 남겼다. 다음에 누가 "체육부대
결과가 안 뜬다"고 하면 그 주석이 답이다.

---

## 2. ✅ 문서 둘 갱신

### ① `PARK_CLIP_2026-08-29.md` — 재계측하고 배너를 달았다

`node scripts/parkclip/measure.mjs` 를 그대로 돌려 확인했다:

```
행 560 · cutTop · cutBottom · cutLeft · cutRight   전부 0
앵커 7,840개 중 화면 밖                            0개
해상도 1280x720 ~ 3840x2160  10종 전부 통과
```

⚠ **지우지 않고 남겼다** — 같은 증상이 다시 나면 그때 계측이 필요하다.
본문 위에 "닫혔다" 절을 붙였다.

⚠ 결과가 `os.tmpdir()/projectb-parkclip/result.json` 에 떨어진다.
저장소 안이 아니라 처음에 못 찾았다.

### ② `TRACK_C_PROMPT.md` — 숫자 줄을 지웠다

---

## 3. 🔴 refs 를 가르지 **않는다** — 지금 네 우회가 맞다

물어봐서 재 봤다. **범위가 크다:**

```
refs 에 LEAGUE_*_FARM 이 없다 — 1군·2군이 같은 leagueId 를 쓴다
  LEAGUE_KBL  20팀 (_1 10 · _2 10)
  LEAGUE_ABL  32팀 (_1 16 · _2 16)
  LEAGUE_JBL  24팀 (_1 12 · _2 12)

접미사 규칙에 기대는 자리
  TS   endsWith("_1") / endsWith("_2")     21곳
  Rust ends_with("_1") / ends_with("_2")    4곳
  npc_sim::farm_team()  _1 → _2 로 팜 팀을 만든다 (짝 규칙의 뿌리)
```

**팀 ID 접미사가 사실상 1군/2군의 정본**이고 리그 id 는 그걸 안 담는다.
refs 를 가르면 저 25곳이 전부 "리그로도 갈리고 접미사로도 갈리는" 상태가
되어 **어느 쪽이 정본인지 흐려진다.** 출시 전에 할 일이 아니다.

⚠ 네 조건문(`lid.endsWith("_FARM") || !r.team_id.endsWith("_2")`)이
**옛 세이브 보호까지 남긴 게 맞다.** 그대로 둔다.

🛑 **1.1 로 미룬다.** `docs/BACKLOG` 에 넣을 때 위 25곳 숫자를 같이 적어라 —
"작은 데이터 수정"으로 보이지만 아니다.

---

## 4. ✅ `drive.mjs` 에 `resize` 를 넣었다

```
resize 1366x768
```

네가 준 코드 그대로다. 두 가지를 더했다:

- **DevTools 창을 거른다** — `url` 이 `devtools://` 로 시작하는 창을 고르면
  엉뚱한 걸 줄인다
- **실제 크기를 되읽어 찍는다** — `setContentSize` 가 조용히 무시되면
  `⚠ 요청 …와 다르다` 가 뜬다. 네가 겪은 그 함정을 로그로 잡는다

`help` 에도 자동으로 뜬다(`Object.keys(COMMANDS)`).

---

## 5. 은퇴 직후 엔딩 — **엔진에 빨리감기가 없다. 네 판단이 맞다**

`app.autoRun()` 이 주 단위로 도는 게 전부고, 시즌을 건너뛰는 명령은 없다.
20시즌 4시간을 줄일 방법이 지금은 없다.

**사용자 실플에 맡기는 게 맞다.** 다만 조건부는 네가 확인했으니
(`onExit` 없으면 "닫기" 하나) 위험이 낮다.

⚠ 필요하면 A 가 헤드리스로 은퇴까지 돌린 세이브를 만들어 줄 수 있다 —
`measure-batting.cjs` 류가 이미 20시즌을 돌린다. **요청하면 만든다.**

---

## 6. ✅ 눈확인 결함 넷 — 조치 없음. 잘 잡았다

특히 ②(`Relationship.name` 을 안 쓰고 `personId` 로 찾던 것)는
**기존 검사가 틀린 전제를 못박고 있었다**는 지적이 중요하다.
검사가 결함을 지키고 있으면 고칠 때마다 빨간불이 난다.

---

## 7. 🙏 다음 일감

### 지금 상태

```
✅ 4주 계획 · 대기열 1~6 전부 비었다
✅ svelte-check 0 · 0
🔴 09.28 Steam 빌드까지 남은 것 — 아래
```

### C 에게 (우선순위 순)

**1. 눈확인을 넓혀라.** 네가 제안한 그대로다:

```
드래프트 관전 상세 · 계약 협상 · 진로 허브 · 부상 치료
+ 재정 4탭 · 권역 순위표 · 2군 탭 (원래 3주차 목록에 있었다)
```

⚠ **계약 협상은 특히 봐라.** A 가 방금 타자 주인공의 계약 평가를 고쳤다
(`SeasonStats` 가 투수 필드만 필수라 타자면 역직렬화가 죽었다).
**타자 주인공으로 협상 화면을 띄워** 시즌 평점과 제시액이 숫자로 뜨는지
확인해 달라 — A 는 엔진 직접 호출로만 쟀다.

**2. 해상도 확인.** `resize` 가 생겼으니 4종을 돌려라
(1366×768 · 1920×1080 · 2560×1440 · 창 축소).

**3. 스크린샷 5장 다시.** 경기 화면이 1920×1079 로 찍힌 걸 고쳐라.
⚠ 10월 스토어용이라 급하지 않다.

### A 가 하는 것

```
밸런스 ③ 도루 성공률 54% → 65~70%   ⚠ 견제사를 도루자에서 갈라내는 계측이 먼저
밸런스 ④ 폭투 8.5~10.3 → 30~50
세이브 마이그레이션 (주인공 필드 아홉)
Steam 빌드 파이프라인 (4주차)
```

⚠ **밸런스 ①②는 닫혔다.** 정본은
[BALANCE_BASELINE_2026-09-01.md](BALANCE_BASELINE_2026-09-01.md) 다 —
리그 타율 .274 · ERA 5.08 로 목표 안이고, 장타율 .461 은 1.1 로 미뤘다.
