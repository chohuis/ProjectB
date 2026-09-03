# 텍스트 소식 대시보드화 — 기획안 (2026-09-03 · 트랙 B)

대상은 `MESSAGE_KINDS_DISPLAY_2026-09-03.md` §3 의 코드 소식 중 **이벤트와
`myBody` 를 뺀 48자리**다. `myBody` 는 C 가 이미 잡고 있고 이벤트는 이야기다.

**기획만이다. 코드를 안 건드렸다.** 형태는 제안이고 값은 코드에서 읽었다.

---

## 1. 대상 48자리

형태는 여섯 중 하나다. **표** · **순위** · **막대** · **카드·칩** ·
**타임라인** · **텍스트 유지**.

### 1-1. 표 — 값이 여러 줄이고 열이 같다 (17)

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

### 1-2. 순위 — 등수가 뜻을 갖는다 (3)

| id 접두 | 지금 | 왜 순위인가 | metadata |
|---|---|---|---|
| `msg-tour-champ-` | 우승·준우승 문장 | 최종 순위가 목록이다 | `standings[] {teamId,rank}` |
| `msg-tour-award-` | 수상 문장 | 상마다 사람이 붙는다 | `awards[] {award,playerId,teamId}` |
| `msg-farm-champion-` | 2군 우승 문장 | 같다 | `standings[]` |

`ProspectTop10Panel` 을 그대로 재사용한다(§2).

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

### 1-6. 텍스트 유지 — 18

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
| `msg-tour-open-` · `msg-tour-round-` | 대진 안내. 내 경기는 `msg-tour-my-` 가 따로 든다 |
| `msg-000`~`msg-003` | 새 게임 첫 소식 넷. 인사말이다 |

### 형태별 개수

```
표 17 · 순위 3 · 막대 2 · 카드·칩 5 · 타임라인 3 · 텍스트 유지 18     합계 48
```

**48 중 30이 대시보드 후보이고 18은 텍스트가 맞다.**

---

## 2. 컴포넌트 — 신설은 둘뿐이다

| 형태 | 쓰는 것 | 신설? |
|---|---|---|
| 표 17 | **`StatTable`** — 열 정의 + 행 배열을 받는 하나 | 🔴 **신설 1** |
| 순위 3 | `ProspectTop10Panel` | 재사용 |
| 막대 2 | `TrainingStatBars` | 재사용 |
| 카드·칩 5 | `DigestCards` | 재사용 |
| 타임라인 3 | **`TimelinePanel`** | 🔴 **신설 2** |

🔴 **표 17종에 컴포넌트를 17개 만들지 않는다.** 열이 다를 뿐 구조는 같다 —
`columns[] {key,label,align}` 과 `rows[]` 를 받는 **하나**로 끝난다.
`OffseasonPanel`·`InjuryPanel` 이 이미 각자 `<table>` 을 들고 있는데, 그 둘도
나중에 `StatTable` 로 모을 수 있다(지금은 안 건드린다).

⚠ `ProspectTop10Panel` 은 이름이 유망주 전용처럼 보인다. 순위 셋에 그대로 쓰려면
**이름을 `RankListPanel` 로 바꾸는 게 맞다** — 다만 이름 바꾸기는 C 판단이다.

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
  /** 표 아래 한 줄 */
  footnote?: string;
}

export interface RankListMetadata {
  type: "rankList";
  kind: string;
  items: { rank: number; label: string; sub?: string; isMe?: boolean }[];
}

export interface TimelineMetadata {
  type: "timeline";
  kind: string;
  entries: { when: string; label: string; detail?: string }[];
}
```

막대·카드는 기존 타입(`TrainingMetadata` · `OffseasonMetadata` 의 카드 부분)을
그대로 쓴다 — **새 타입을 안 만든다.**

⚠ **`kind` 를 문자열로 둔다.** 종류마다 타입을 만들면 48개가 되고, 화면은
결국 `columns` 만 본다. 타입 안전은 **만드는 쪽**(각 `weekPhases` 모듈)이
지면 된다.

⚠ **값은 이미 만들어진 문자열이 아니라 숫자로 싣는다.** 지금 소식들은
`lines.join("\n")` 으로 **글자로 굳혀서** 보낸다 — 그러면 화면이 정렬도 강조도
못 한다. 표로 가려면 만드는 쪽이 배열을 넘겨야 한다.

---

## 4. 순서 제안 — C 몫 네 묶음

**값 비교가 큰 것부터.** 통 수 실측(§7)에서 위에 오는 것과 겹친다.

| 묶음 | 무엇 | 왜 먼저 |
|---|---|---|
| **1** | `StatTable` 신설 + `msg-digest-` · `msg-league-results-w` · `msg-official-result-w` | 통 수 1·2위(시즌당 28+11+24). 컴포넌트 하나로 셋이 열린다 |
| **2** | `msg-pro-season-end-` · `msg-indie-season-end-` · `msg-coach-report-w` | 한 줄에 여섯 값이 뭉친 자리 |
| **3** | 계약 넷 (`contract-signed` · `fa-signed` · `fa-market` · `resign`) | 1.1 계약 기획과 같이 간다 |
| **4** | 나머지 — 순위 3 · 카드 5 · 막대 2 · 타임라인 3 · 로스터 3 | 값은 작지만 손이 적다 |

⚠ **묶음 1 이 끝나면 멈추고 사용자에게 보여 주는 게 낫다.** 표 하나가 실제
화면에서 어떻게 읽히는지 보고 나머지를 정하는 편이, 17종을 다 만들고 고치는
것보다 싸다.

---

## 5. 시안

`docs/mock/message-dashboards-mock.html` — 대표 여섯을 `NewsPage` 상세 칸
그대로 그렸다. 단일 HTML · 외부 자원 없음 · 색·치수는 `styles.css` 토큰.

```
다이제스트 순위표 · 프로 시즌 결산 · 계약 완료 조건 표
내 대회 결과 · 국가대표 결과 · 로스터 변동(강등·웨이버)
```

⚠ 숫자는 **배치를 보려고 넣은 예시**다.

---

## 6. 🔴 사용자에게 물을 것

1. **48 중 30을 바꾸는 게 맞나.** 18은 텍스트가 맞다고 봤다(§1-6) — 관계·은퇴·
   통보처럼 값이 없거나 이야기인 것들이다. 더 줄이거나 늘릴지.
2. **묶음 1만 먼저 하고 멈출까.** 표 하나를 실제로 보고 나머지를 정하는 쪽이
   싸다(§4). 아니면 네 묶음을 한 번에 갈지.
3. **표 안에 순위 변동을 넣나** (`↑2` 같은 표시). 넣으면 지난 주 값을 어딘가
   들고 있어야 한다 — 지금은 없다.
4. **`ProspectTop10Panel` 이름을 `RankListPanel` 로 바꾸나.** 순위 셋에 재사용할
   거면 이름이 맞아야 한다. 바꾸면 기존 import 가 같이 바뀐다.
5. **밀려나는 474건(24%)을 어떻게 하나.** 대시보드로 바꿔도 상한에 밀리면 안
   읽힌다 — 통 수를 줄이는 쪽(통합)이 먼저인지, 표시가 먼저인지.
6. **`msg-tour-open-`·`msg-tour-round-` 를 텍스트로 둘까.** 대진표는 표가 어울리는데
   내 경기가 아니라 안 읽힐 수 있다. 통 수는 시즌당 13~25 로 작지 않다.
