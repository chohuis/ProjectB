# 텍스트 소식 대시보드화 — 기획안 (2026-09-03 · 트랙 B)

대상은 `MESSAGE_KINDS_DISPLAY_2026-09-03.md` §3 의 코드 소식 중 **이벤트와
`myBody` 를 뺀 48자리**다. `myBody` 는 C 가 이미 잡고 있고 이벤트는 이야기다.

**기획만이다. 코드를 안 건드렸다.** 형태는 제안이고 값은 코드에서 읽었다.

---

## 1. 대상 48자리

형태는 여섯 중 하나다. **표** · **순위** · **막대** · **카드·칩** ·
**타임라인** · **텍스트 유지**.

### 1-1. 표 — 값이 여러 줄이고 열이 같다 (19)

| id 접두 | 지금 본문에 든 값 | 왜 표인가 | 필요한 metadata | 값의 출처 |
|---|---|---|---|---|
| `msg-digest-` | 월간 리그 요약 `sections.join` | 순위·승패가 여러 팀 | `teams[] {teamId,w,l,pct,rank}` `myTeamId` | `weekPhases/digest.ts` |
| `msg-league-results-w` | 경기 결과 `lines.join` | 경기마다 같은 열 | `games[] {home,away,hs,as}` | `advanceWeek.ts` |
| `msg-official-result-w` | 내 경기 결과 | 기록이 칸으로 갈린다 | `line {ip,h,er,k,bb,pitches,dec}` | `friendlyMatchEngine.ts` |
| `msg-friendly-result-w` | 연습경기 결과 | 위와 같다 | 같음 | 같은 파일 |
| `msg-pro-season-end-` | `시즌 성적: {statSummary}` 한 줄 | 한 줄에 여섯 값이 뭉쳐 있다 | `season {w,l,sv,hd,ip,era,whip,k}` | `advanceWeek.ts` |
| `msg-indie-season-end-` | 같은 꼴 | 같다 | 같음 | `advanceWeek.ts` |
| `msg-contract-signed-` | 연봉·기간·계약금·조항을 줄로 | 조건이 항목·값 쌍이다 | `contract {salary,years,bonus,options[],incentives[]}` | `contractDecision.ts` |
| `msg-fa-signed-` | 같다 | 같다 | 같음 | 같은 파일 |
| `msg-fa-market-` | 제안 목록 | 팀마다 같은 열 | `offers[] {teamId,salary,years,bonus,opts}` | `weekPhases/market.ts` |
| `msg-facomp-` | FA 보상 | 항목·값 | `comp {grade,money,playerId}` | 같은 파일 |
| `msg-resign-` | 재계약 결과 | 항목·값 | `contract` 위와 같음 | `seasonRollover.ts` |
| `msg-npc-trade-` | `[팀]선수 → [팀]` 두 줄 + 사유 | 오가는 쪽이 두 열이다 | `sides[] {teamId,players[]}` `reason` | `weekPhases/market.ts` |
| `msg-demote-` | 이름 목록 + `{lockWeeks}주간 재등록 불가` | 사람마다 같은 열 | `players[] {npcId}` `lockWeeks` | 같은 파일 |
| `msg-waiver-` | `lines.join` 이름 목록 | 같다 | `players[]` | `seasonRollover.ts` |
| `msg-tour-my-` | 내 대회 결과 | 라운드가 행이다 | `rounds[] {round,opp,score,result}` | `weekPhases/tournamentNews.ts` |
| `msg-natl-result-` | 대표팀 결과 | 경기가 행이다 | `games[] {opp,score,myLine}` | `nationalTeam.ts` |
| `msg-coach-report-w` | 최근 등판 분석 | 지표가 항목·값 | `metrics[] {name,value,delta}` | `advanceWeek.ts` |
| `msg-tour-open-` | 대회 개막 대진 | 대진은 라운드마다 두 팀이 짝이다 | `bracket[] {round,home,away,date,myTeam}` | `weekPhases/tournamentNews.ts` |
| `msg-tour-round-` | 라운드 대진 | 같다 | 같음 | 같은 파일 |

### 1-2. 순위 — 등수가 뜻을 갖는다 (3)

| id 접두 | 지금 | 왜 순위인가 | metadata |
|---|---|---|---|
| `msg-tour-champ-` | 우승·준우승 문장 | 최종 순위가 목록이다 | `standings[] {teamId,rank}` |
| `msg-tour-award-` | 수상 문장 | 상마다 사람이 붙는다 | `awards[] {award,playerId,teamId}` |
| `msg-farm-champion-` | 2군 우승 문장 | 같다 | `standings[]` |

`ProspectTop10Panel` 을 **`RankListPanel` 로 이름을 바꿔** 재사용한다(§2 · §6 ④ 확정).

### 1-3. 막대 — 값이 0~100 눈금이다 (2)

| id 접두 | 지금 | metadata |
|---|---|---|
| `msg-exam-w` | 시험 결과 문장 | `subjects[] {name,score}` `gpa` |
| `msg-team-mood-` | 팀 분위기 문장 | `mood` `delta` |

`TrainingStatBars` 의 막대를 재사용한다.

### 1-4. 카드·칩 — 항목이 짧고 여럿이다 (5)

| id 접두 | 지금 | metadata |
|---|---|---|
| `msg-season-brief-` | 시즌 시작 안내 | `role` `teamRank` `schedule {games}` |
| `msg-friendly-plan-w` | 연습경기 예정 | `games[] {week,opp}` |
| `msg-natl-squad-` | 대표팀 발탁 | `squad[] {playerId,pos}` |
| `msg-scoutday-` · `msg-showcase-` | 행사 안내 | `event {week,where,scouts}` |
| `msg-allstar-` | 올스타 선정 | `selected` `votes` |

`DigestCards` 를 재사용한다.

### 1-5. 타임라인 — 시간 순서가 뜻이다 (3)

| id 접두 | 지금 | metadata |
|---|---|---|
| `msg-mil-record-` | 군 경력 한 장 | `record {unit,role,rank,leave,awards[],perf[]}` |
| `msg-military-annual-` | 복무 연차 안내 | `weeks` `rank` `nextEvent` |
| `msg-season-hs-sync-` | 고교 연감 | `years[] {year,summary}` |

**신설이 필요한 유일한 형태다**(§2).

### 1-6. 텍스트 유지 — 16

**이야기이거나, 값이 하나뿐이거나, 표로 만들면 오히려 읽기 나쁜 것.**

| id 접두 | 왜 텍스트인가 |
|---|---|
| `msg-rel-` · `msg-team-mood-`(문장부) | 관계는 **라벨만 보여준다**(`relationship.ts:44` — 숫자로 노출 금지). 표로 만들면 숫자를 넣게 된다 |
| `msg-retire-` | 은퇴는 한 번뿐인 이야기다. 값이 없다 |
| `msg-resign-`(거절 갈래) | 결과 한 줄이다 |
| `msg-contract-rejected-` | 거절 사유 한 줄 |
| `msg-injury-game-w` | 다친 순간이다. 사건 한 줄이 맞다 |
| `msg-trade-medical-fail-` | 한 줄 |
| `msg-military-warning-` · `msg-sports-selected-` · `msg-military-discharge-` | 통보 한 줄 |
| `msg-mil-` · `msg-mil-res-` | 병영 이야기·선택 결과. B-11·B-5 문안이 이야기다 |
| `msg-indie-retry-` | 재도전 안내 한 줄 |
| `msg-000`~`msg-003` | 새 게임 첫 소식 넷. 인사말이다 |

### 형태별 개수

```
표 19 · 순위 3 · 막대 2 · 카드·칩 5 · 타임라인 3 · 텍스트 유지 16     합계 48
```

**48 중 32가 대시보드 후보이고 16은 텍스트가 맞다.**

⚠ 대진 둘(`msg-tour-open-`·`msg-tour-round-`)은 **§9 ③ 확정으로 텍스트에서
표로 옮겼다.** 처음엔 「내 경기가 아니라 안 읽힐 수 있다」로 텍스트에 뒀는데,
통 수가 시즌당 13~25로 작지 않고 대진은 라운드·팀·일정이 **이미 열이다.**

---

## 2. 컴포넌트 — 신설은 둘뿐이다

| 형태 | 쓰는 것 | 신설? |
|---|---|---|
| 표 19 | **`StatTable`** — 열 정의 + 행 배열을 받는 하나 | 🔴 **신설 1** |
| 순위 3 | `ProspectTop10Panel` → **`RankListPanel`** | 이름만 바꿔 재사용 |
| 막대 2 | `TrainingStatBars` | 재사용 |
| 카드·칩 5 | `DigestCards` | 재사용 |
| 타임라인 3 | **`TimelinePanel`** | 🔴 **신설 2** |

🔴 **표 19종에 컴포넌트를 19개 만들지 않는다.** 열이 다를 뿐 구조는 같다 —
`columns[] {key,label,align}` 과 `rows[]` 를 받는 **하나**로 끝난다.
`OffseasonPanel`·`InjuryPanel` 이 이미 각자 `<table>` 을 들고 있는데, 그 둘도
나중에 `StatTable` 로 모을 수 있다(지금은 안 건드린다).

✅ **`ProspectTop10Panel` → `RankListPanel` 로 바꾼다** (§6 ④ 확정 2026-09-03).
이름이 유망주 전용처럼 보이는데 순위 셋에 재사용하기 때문이다. 기존 import 가
같이 바뀐다 — 파일 이름·컴포넌트 이름·import 를 한 번에 옮긴다.

---

## 3. metadata 스키마 제안

지금 유니온은 다섯이다(`types/main.ts:232`).

```ts
metadata?: TrainingMetadata | Top10Metadata | OffseasonMetadata
         | InjuryMetadata | MyBodyMetadata
```

여기에 **형태별로 하나씩** 더한다. 종류마다 타입을 만들지 않는다.

```ts
export interface TableMetadata {
  type: "table";
  /** 어느 소식인지 — 화면이 제목·단위를 고를 때만 쓴다 */
  kind: string;                       // "digest" | "seasonEnd" | "contract" | …
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, string | number>[];
  /** 강조할 행 (내 팀·나) */
  highlightRow?: number;
  /**
   * 순위 변동을 그릴 열 (§6 ③ 확정). 각 행이 `{deltaKey}` 에 **지난 값과의 차**를
   * 든다 — 양수면 `↑n`, 음수면 `↓n`, 0 이면 `—`. 이 키가 없으면 안 그린다.
   */
  deltaKey?: string;
  /** 표 아래 한 줄 */
  footnote?: string;
}

export interface RankListMetadata {
  type: "rankList";
  kind: string;
  /** `delta` 는 지난 값과의 차 (§6 ③). 없으면 변동을 안 그린다 */
  items: { rank: number; label: string; sub?: string; isMe?: boolean; delta?: number }[];
}

export interface TimelineMetadata {
  type: "timeline";
  kind: string;
  entries: { when: string; label: string; detail?: string }[];
}
```

대진(§9 ③)도 **새 타입을 안 만든다** — `TableMetadata` 그대로다. 행이
경기 한 짝이다:

```ts
// kind: "bracket"
columns: [
  { key: "round", label: "라운드" },
  { key: "home",  label: "" },
  { key: "away",  label: "" },
  { key: "date",  label: "일정", align: "right" },
]
rows: { round: "8강", home: "한성고", away: "기흥고", date: "W21 토", myTeam: true }[]
```

⚠ **`myTeam` 은 열이 아니라 강조 표시다.** 행에 실어 보내고 화면은
`highlightRow` 대신 이 값으로 굵게 그린다 — 대진은 내 팀 행이 **여럿일 수
있어서**(라운드마다 하나) 인덱스 하나로는 모자란다.

막대·카드는 기존 타입(`TrainingMetadata` · `OffseasonMetadata` 의 카드 부분)을
그대로 쓴다 — **새 타입을 안 만든다.**

⚠ **`kind` 를 문자열로 둔다.** 종류마다 타입을 만들면 48개가 되고, 화면은
결국 `columns` 만 본다. 타입 안전은 **만드는 쪽**(각 `weekPhases` 모듈)이
지면 된다.

⚠ **값은 이미 만들어진 문자열이 아니라 숫자로 싣는다.** 지금 소식들은
`lines.join("\n")` 으로 **글자로 굳혀서** 보낸다 — 그러면 화면이 정렬도 강조도
못 한다. 표로 가려면 만드는 쪽이 배열을 넘겨야 한다.

### 3-1. 지난 순위를 어디서 들고 오나 — 🔴 A 몫 명세

§6 ③ 이 순위 변동을 넣기로 했다. **지금 코드에 지난 순위가 없다.**

실측:

| 찾은 것 | 어디 | 쓸 수 있나 |
|---|---|---|
| `prevRank` · `rankHistory` · `lastRank` | **아무 데도 없다** (`apps/ui/src` · `packages` 전수 검색) | — |
| `seasonGetHistoryStandings` | `LeaguePage.svelte:241` — `{slotId, seasonYear}` 로 부른다 | ✖ **시즌 끝 값 하나뿐**이다. 주·월 단위가 없다 |
| `standingsSnapshots` | `stores/postseason.ts:28` `captureStandingsSnapshot` · `utils/standingsSnapshot.ts` | △ **그릇은 이미 있다.** 다만 키가 셋뿐이다 |

```ts
export type SnapshotKey = "prev_season" | "first_half" | "second_half_base";
```

셋 다 **대회 시드용**이고(`standingsSnapshot.ts` 머리 주석), 부르는 자리는
`advanceWeek.ts:2910` 한 곳이다.

**두 갈래 중 하나를 고른다.**

| 갈래 | 어떻게 | 값 | 위험 |
|---|---|---|---|
| **(가) 직전 다이제스트의 metadata 재사용** | 소식함에서 지난 `msg-digest-` 를 찾아 그 `rows` 의 순위를 읽는다 | 새 저장이 0 | 🔴 **§8 과 정면으로 부딪친다.** 보존이 오래된 순 FIFO 라 **다이제스트는 언제나 먼저 밀리는 쪽**이다. 사본이 사라지면 변동이 사라진다. 게다가 소식이 소식을 읽는 구조가 된다 |
| **(나) `SnapshotKey` 에 `"last_digest"` 를 더한다** | 다이제스트를 만든 **직후** `captureStandingsSnapshot("last_digest")` 를 부른다. 다음 달 다이제스트가 그 값과 지금을 뺀다 | 리그당 순위표 한 벌 (덮어쓴다 — 누적 아님) | 세이브에 필드가 는다. 옛 세이브엔 없으니 **첫 달은 변동을 안 그린다** |

🔴 **(나) 를 권한다.** 그릇·부르는 함수·저장 자리가 이미 다 있고
(`captureStandingsSnapshot` 은 리그 전부를 한 번에 뜬다), 키 하나와 호출
한 줄이면 끝난다. (가)는 표시 기능이 **소식함 보존 규칙에 매달리게** 만든다.

⚠ **첫 달·첫 시즌엔 변동을 안 그린다.** 지난 값이 없으면 `deltaKey` 를 빼서
보낸다 — `0` 이나 `—` 로 채우면 「변동 없음」과 「모름」이 같아 보인다.

⚠ **경기 결과 표(`msg-league-results-w`)엔 변동이 없다.** 순위가 없는 표다.
변동이 붙는 건 순위가 든 셋뿐이다 — 다이제스트 · 대회 최종 순위 · 2군 우승.

---

## 4. 순서 제안 — C 몫 네 묶음

**값 비교가 큰 것부터.** 통 수 실측(`MESSAGE_KINDS_DISPLAY_2026-09-03.md` §7)에서
위에 오는 것과 겹친다.

| 묶음 | 무엇 | 왜 먼저 |
|---|---|---|
| **1** | `StatTable` 신설 + `msg-digest-` · `msg-league-results-w` · `msg-official-result-w` | 통 수 1·2위(시즌당 28+11+24). 컴포넌트 하나로 셋이 열린다 |
| **2** | `msg-pro-season-end-` · `msg-indie-season-end-` · `msg-coach-report-w` | 한 줄에 여섯 값이 뭉친 자리 |
| **3** | 계약 넷 (`contract-signed` · `fa-signed` · `fa-market` · `resign`) | 1.1 계약 기획과 같이 간다 |
| **4** | 나머지 — 순위 3 · 카드 5 · 막대 2 · 타임라인 3 · 로스터 3 · **대진 2** | 값은 작지만 손이 적다 |

⚠ **멈추지 않는다** (§6 ② 확정 2026-09-03). 네 묶음을 한 번에 간다 — 위
순서는 **어느 것부터 손대는가**일 뿐이고 중간에 승인을 기다리는 자리가 아니다.

---

## 5. 시안

`docs/mock/message-dashboards-mock.html` — 대표 일곱을 `NewsPage` 상세 칸
그대로 그렸다. 단일 HTML · 외부 자원 없음 · 색·치수는 `styles.css` 토큰.

```
다이제스트 순위표 · 프로 시즌 결산 · 계약 완료 조건 표
내 대회 결과 · 국가대표 결과 · 로스터 변동(강등·웨이버) · 대회 대진표
```

⚠ 숫자는 **배치를 보려고 넣은 예시**다.

---

## 6. ✅ 사용자 확정 (2026-09-03)

여섯을 물었고 여섯이 정해졌다. **여기부터는 물음이 아니라 확정이다.**

| # | 물음 | 답 | 문서 반영 |
|---|---|---|---|
| 1 | 48 중 30을 바꾸는 게 맞나 | ✅ **맞다.** 18은 텍스트 유지 | §1-6 그대로 |
| 2 | 묶음 1만 먼저 하고 멈출까 | ✅ **한 번에 다 한다.** 순서 제안은 남기되 「멈춤」은 없앤다 | §4 에서 멈춤 문단 삭제 |
| 3 | 표에 순위 변동(`↑2`)을 넣나 | ✅ **넣는다.** 지난 값을 어디서 들고 오나는 A 몫 명세 | §3 에 `prevRank`·`delta` · §3-1 신설 |
| 4 | `ProspectTop10Panel` → `RankListPanel` | ✅ **바꾼다** | §2 표에 반영 |
| 5 | 밀려나는 474건 | ✅ **③ + ②** — 기록 탭 배치와 보존 규칙을 **둘 다** 한다. 상한 1500 은 안 건드린다. **보존을 어떻게 나누나는 §9 ① 에서 다시 정해졌다** | §7 · §8 신설 |
| 6 | `msg-tour-open-`·`msg-tour-round-` | ✅ **표로 바꾼다** (§9 ③ 에서 답이 왔다) | §1-1 로 옮김 · 표 19 |

⚠ ⑥은 이 표를 쓸 때 미답이었고 **§9 ③ 에서 답이 왔다.** 둘이 텍스트에서
표로 옮겨 가 **표 19 · 텍스트 16** 이 됐다. 합계는 그대로 48이다.

---

## 7. 기록 탭 배치 — 오래 남아야 하는 것

§6 ⑤ 의 ③ 갈래다. **소식함은 흐르는 자리고, 기록 탭은 남는 자리다.**
소식 통은 그대로 두되 기록 탭에 사본을 남기고, 소식 본문에 「기록 탭에
남는다」를 적어 밀려나도 잃지 않는다는 걸 알린다.

### 7-1. 지금 있는 기록 화면 — 실측

`MainTabId` 은 `military | news | me | team | league | people | schedule`,
`MeTabId` 은 `status | training | academics | finance | achievements | hallOfFame`
다(`types/main.ts:9·20`).

🔴 **「기록」이라는 이름의 탭은 없다.** 기록 성격의 자리는 다섯이다.

| 자리 | 파일 | 지금 그리는 것 |
|---|---|---|
| `me > status` | `pages/status/StatusPage.svelte` (1087줄) | 「계약 정보」(L354 · **현재 계약 한 건뿐**) · 「경기 기록」(L562) · 「시즌별 성적」(L623) · 「수상 내역」(L651) · 「커리어 타임라인」(L667) |
| `me > finance` | `pages/finance/FinancePage.svelte` (436줄) | 주간 수입·지출 · **스폰서** 계약 중 · 받은 제안 · 개인 트레이닝 구독 · 투자 |
| `me > achievements` | `pages/achievements/AchievementsPage.svelte` (235줄) | 달성 · 미수령 · 수령 완료 |
| `me > hallOfFame` | `pages/hall-of-fame/HallOfFamePage.svelte` (143줄) | 헌액자(L61) · 영구결번(L94) |
| `league` | `pages/league/LeaguePage.svelte` | 연도별 `historyStandings`·`historyLbStats`·`historyPostseason`·`historyTournaments`(L240~249) · `history_league` 의 `kind === "awards"`(L252~255) |

⚠ **`me > finance` 의 「계약 중」은 스폰서다.** 선수 계약이 아니다 —
선수 계약은 `me > status` 「계약 정보」에 **현재 한 건만** 있고 이력이 없다.

⚠ `military` 탭은 `pages/military/MilitaryPage.svelte` (86줄) 이고
**복무 중에만 보인다**(`types/main.ts:10` — "복무 중에만 · 맨 앞 · 유무는
careerStage 하나가 정한다"). **전역하면 사라지므로 군 경력의 집이 될 수 없다.**

### 7-2. 이미 있는 그릇 하나 — 커리어 타임라인

`StatusPage.svelte:667` 의 「커리어 타임라인」이 연도마다 성적·수상·사건을
한 줄로 쌓는다. 사건은 `NpcCareerEvent.eventType` 으로 들어오고 라벨이
이미 있다(`StatusPage.svelte:247~253`):

```
draft_picked 드래프트 지명 · draft_undrafted 미지명 · trade 트레이드
fa_signed FA 계약 · release 방출 · quit_baseball 야구 포기
military_enlist 입대 · military_discharge 전역 · military_exempt 병역 면제
retirement 은퇴 · graduation 졸업
```

🔴 **입대·전역·FA 계약은 이미 기록 탭에 남고 있다.** 새로 만들 게 아니라
소식에 「기록 탭에 남는다」를 붙이고, 빠진 종류만 `NpcCareerEventType` 에
더하면 된다.

### 7-3. 배치표

| 소식 | 남길 자리 | 형태 | 지금 되나 |
|---|---|---|---|
| `msg-contract-signed-` 계약 완료 | `me > status` **계약 이력**(신설) | 연도 행 · 연봉/기간/조항 열 | 🔴 **없다.** 「계약 정보」는 현재 계약 한 건뿐 |
| `msg-fa-signed-` FA 계약 | `me > status` 커리어 타임라인 | `fa_signed` 사건 (이미 있다) | ✅ 된다 |
| `msg-resign-` 재계약 | `me > status` **계약 이력**(신설) | 위와 같은 표 | 🔴 없다 |
| `msg-facomp-` FA 보상 | `me > status` 커리어 타임라인 | `fa_signed` 줄의 detail | ✅ 된다 |
| `msg-pro-season-end-` · `msg-indie-season-end-` 시즌 결산 | `me > status` 「시즌별 성적」(L623) | 이미 연도 행 표다 | ✅ 된다 |
| `msg-mil-record-` 군 경력 | `me > status` 커리어 타임라인 | **한 줄** (`military_enlist`·`military_discharge` 사건) | ✅ **된다 — 구조를 안 더한다** (§9 ② 확정) |
| `msg-military-annual-` 복무 연차 | 남기지 않는다 | — | 진행 중 안내라 흐르는 게 맞다 |
| `msg-tour-my-` 내 대회 결과 | **대회 전적**(신설) | 대회 행 · 성적/내 기록 열 | 🔴 **없다.** `league` 의 `historyTournaments` 는 **리그 전체**고 내 전적이 아니다 |
| `msg-tour-champ-` · `msg-tour-award-` 대회 우승·수상 | `league` 연도별 `historyTournaments` | 이미 있다 | ✅ 된다 |
| `msg-natl-result-` · `msg-natl-squad-` 국가대표 | **대회 전적**(신설) 안의 국제대회 칸 | 위와 같은 표 | 🔴 없다 |
| 개인 수상 | `me > status` 「수상 내역」(L651) · `league` `history_league` awards | 이미 둘 다 있다 | ✅ 된다 |
| 순위 이력 | `league` 연도별 `historyStandings` | 이미 있다 | ✅ 된다 |
| `msg-farm-champion-` 2군 우승 | `league` 연도별 `historyStandings` | 2군 리그 행 | ✅ 된다 |
| `msg-retire-` 은퇴 | `me > status` 커리어 타임라인(`retirement`) · 「선수 생활」(L723) | 이미 있다 | ✅ 된다 |
| `msg-season-hs-sync-` 고교 연감 | `me > status` 「시즌별 성적」 | 고교 연도 행 | ✅ 된다 |

**되는 것 10 · 안 되는 것 3 · 안 남기는 것 1.**

### 7-4. 신설 제안 — 최소 둘

새 화면을 만들지 않는다. **이미 있는 `me > status` 안에 카드 둘을 더한다.**

| 신설 | 어디에 | 무엇 | 값의 출처 |
|---|---|---|---|
| **계약 이력** 카드 | `me > status` 「계약 정보」 바로 아래 | 연도 · 팀 · 연봉 · 기간 · 조항 · 종류(신규/재계약/FA) | 계약 확정 시점에 배열로 쌓는다. 1.1 계약 기획(`PLAN_CONTRACT_TERMS.md` §4)의 계약 객체를 그대로 밀어 넣으면 된다 |
| **대회 전적** 카드 | `me > status` 「경기 기록」 아래 | 연도 · 대회 · 최종 라운드 · 내 기록 · (국제대회 표시) | `msg-tour-my-`·`msg-natl-result-` 가 만드는 `TableMetadata.rows` 와 같은 모양이다 |

🔴 **둘 다 §2 의 `StatTable` 하나로 그린다.** 소식함에 실을 표와 기록 탭에
남길 표가 같은 열이라, 만드는 쪽이 `TableMetadata` 를 한 번 만들어 **소식과
기록 양쪽에 같은 것을 넘기면 된다.** 화면 컴포넌트도 하나다.

✅ **군 경력 세부(부대·보직·계급·표창)는 안 남긴다** (§9 ② 확정 2026-09-03).
`NpcCareerEvent` 는 `detail?: string` 한 줄뿐인데(`types/save.ts:851`)
**그 한 줄이면 된다.** 입대·전역 사건 둘이 이미 타임라인에 들어가므로
**세이브 구조를 안 건드린다.**

⚠ 부대·보직·계급·표창은 `msg-mil-record-` **소식 본문에는 그대로 든다.**
소식함에서 밀려나면 사라지는 것이지만, 그게 이번 결정이다.

### 7-5. 소식 쪽 표시

기록 탭에 남는 소식은 본문 마지막 줄에 한 줄을 붙인다.

```
기록 탭에 남습니다.
```

⚠ **합쇼체다** — `role_choice.json`·`contract_terms.json`·`pitching_usage.json`
과 같다(2026-09-03 사용자 확정). 부제·대시 설명을 안 쓴다.

⚠ **문구를 코드에 박지 않는다.** 다른 문안처럼 데이터에 둔다 —
`messages/templates.json` 이든 새 파일이든 한 곳이다.

---

## 8. 소식함 정리 규칙 — 오래된 순

§6 ⑤ 의 ② 갈래다. **상한 1500 은 그대로 둔다.**

🔴 **종류별로 나누지 않는다** (§9 ① 확정 2026-09-03). 상한에 차면
**들어온 순서대로, 오래된 것부터 지운다.** 오래 남아야 하는 것은 소식함이
아니라 **기록 탭 사본**(§7)이 맡는다.

### 8-1. 왜 지금 규칙을 바꾸나 — 실측

2시즌 실측에서 **1974통 중 474통(24%)이 밀려났다.** 지금 순서는
①미결 → ②안 읽음 → ③나머지다(`stores/game.ts:978~1020`).

②가 **나이를 안 본다.** 안 읽었다는 이유만으로 지난 시즌 연습경기 예정이
이번 주 계약서보다 오래 버틴다 — 소식함은 시간 순 목록인데 버리는 순서만
시간을 안 본다.

⚠ **②를 빼도 잃는 게 거의 없다.** `trimMailbox` 주석의 실측이 그렇게
적고 있다 — **50칸 중 41칸이 이미 안 읽은 상태였고, 읽은 9칸을 늦게
버리는 것이 ②의 효과 전부**다. 안 읽은 것이 이미 대부분이라 「안 읽음
우선」이 실제로 가르는 게 별로 없다.

### 8-2. 규칙

```
① 미결 decision      상한을 넘겨서라도 남긴다 (진행이 막히므로) — 지금 그대로
② 나머지는 오래된 순  최신 1500칸을 남기고 그 아래를 버린다
```

**끝이다.** 종류표도, 보존 시즌도, 만료 판정도 없다.

⚠ **연도가 필요 없어졌다.** 앞선 안은 `MessageItem` 에 `seasonYear` 를
더해야 했다 — `createdAt` 이 `"W26"` 이라 주차뿐이기 때문이다
(`digest.ts:285` 등). FIFO 는 **배열 자리 순서가 곧 시간 순서**라
**필드를 하나도 안 더한다.** 세이브 구조를 안 건드린다.

### 8-3. `trimMailbox` 명세 변경

지금(`stores/game.ts:978~1020`):

```
① 미결 decision      상한을 넘겨서라도 남긴다
② 안 읽은 것         take((m) => m.readAt === null)
③ 나머지             take(() => true)
```

바꾼 뒤 — **②를 지운다:**

```
① 미결 decision      그대로다
② 나머지             take(() => true)      ← 지금 ③ 하나만 남는다
```

- `take` 는 이미 **배열을 앞에서부터** 훑고, 소식함은 **최신순**이다
  (`game.ts` 주석 — "목록이 최신순이라 ②를 최신순으로 훑으면 방금 온 소식이
  먼저 자리를 잡는다"). 그래서 `take(() => true)` 하나면 **최신 1500칸이
  남고 오래된 것부터 밀린다** — 원하는 동작 그대로다.
- **여전히 위치로 고른다.** id 로 걸렀다가 사본이 통째로 통과한 적이 있다
  (`game.ts` 주석 — 상한 200 인데 237 이 됐다). 이 규칙은 안 바꾼다.
- **미결은 만료 개념 없이 언제나 남는다.** ①이 먼저다.

🔴 **줄어드는 코드다.** 새로 더할 게 없고 `take` 한 줄과 주석을 지운다.
`mailboxTrimStats` 도 그대로 둔다 — `droppedUnread` 가 여전히 뜻을 갖는다
(우선순위가 사라졌으니 **안 읽은 채 밀리는 수가 늘 것**이고, 그게 이 변경의
값이다).

### 8-4. 적용 전후를 잰다

`measure:messagekinds` 가 이미 종류별 통 수를 센다. 같은 시드·같은 시즌
수로 전후를 비교한다.

| 지표 | 지금(2시즌 실측) | 바뀐 뒤 |
|---|---|---|
| 밀려난 통 | 474 / 1974 (24%) | **그대로일 것이다** — 상한을 안 건드린다 |
| 밀려난 것 중 안 읽은 것 | 583 중 453 (별도 실측) | **늘 것이다.** ②를 지웠으니 |
| 밀려난 것의 나이 | 안 쟀다 | **전부 가장 오래된 쪽**이어야 한다 |

🔴 **수가 줄기를 바라는 게 아니다.** 상한이 그대로라 밀려나는 수는 같다.
**무엇이 밀리는가**가 바뀌는 게 목표고, 셋째 줄이 그걸 잰다.

⚠ **셋째 줄을 잴 자리가 지금 없다.** `mailboxTrimStats` 는 수·안 읽음·
분류만 센다. 나이를 재려면 `createdAt` 이 아니라 **밀린 소식의 배열
위치**를 보면 된다 — 전부 꼬리 쪽이면 FIFO 가 맞다는 뜻이다.

---

## 9. ✅ 사용자 확정 (2026-09-03 · 2차)

§8 이 남긴 셋이 다 답을 받았다. **이 기획에 열린 물음이 없다.**

| # | 물음 | 답 | 문서 반영 |
|---|---|---|---|
| 1 | 보존 시즌 값 넷 (A 2 · B 3 · C 4 · D 영구) 이대로 가나 | ❌ **종류별로 안 나눈다.** 전부 동일 — 상한에 차면 **오래된 것부터** 지운다. 오래 남을 것은 기록 탭 사본이 맡는다 | §8 을 통째로 다시 씀. 종류표·보존 시즌·만료 판정·`seasonYear` 전부 사라짐 |
| 2 | 군 경력 세부(부대·보직·계급·표창)를 남기나 | ❌ **안 남긴다.** 커리어 타임라인에 **한 줄로만**. `NpcCareerEvent` 에 구조를 안 더한다 | §7-3 · §7-4 |
| 3 | 대회 대진(`msg-tour-open-`·`msg-tour-round-`)을 표로 바꾸나 | ✅ **바꾼다.** 라운드·팀 A·팀 B·일정 · 내 팀 행 강조 | §1-1 로 옮김(표 19 · 텍스트 16) · §3 `bracket` · 시안에 하나 추가 |

### 세 결정이 다 같은 방향이다

**구조를 안 더한다.**

| | 앞선 안 | 확정 |
|---|---|---|
| ① 보존 | 종류표 + 보존 시즌 + 만료 판정 + `MessageItem.seasonYear` | `take` **한 줄을 지운다** |
| ② 군 경력 | `NpcCareerEvent` 에 부대·보직·계급·표창 | `detail` 한 줄 그대로 |
| ③ 대진 | (텍스트 유지) | `TableMetadata` 재사용 — 새 타입 없음 |

세 자리 모두 **세이브 구조를 안 건드린다.** ③만 일이 늘고 ①②는 **줄어든다.**
