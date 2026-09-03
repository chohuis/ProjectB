# 소식 종류별 표시 형태 — 전수 (2026-09-03 · 트랙 B)

사용자 물음: "월간 선수 랭킹처럼 몇몇 소식은 대시보드로 나오고 나머지는 안
그렇다. 종류별로 무엇이 대시보드로 나오고 무엇이 안 나오는지, 각각 어떻게
나오는지 전부 정리해 달라."

**코드에서 읽은 것만 적는다.**

⚠ **통 수(몇 통 오나)는 아직 안 채웠다.** `measure:messagekinds` 6시즌 한 판이
도는 중이고 끝나면 §7 에 붙인다. **종류 수와 표시 형태는 코드 전수라 확정이다** —
통 수만 비어 있다.

---

## 1. 갈림선은 한 곳이다 — `NewsPage.svelte` 281~294줄

소식 상세 칸이 본문을 그릴 때 **`metadata.type` 하나로** 갈린다.

```
metadata.type === "training"    → TrainingStatBars
                  "top10"       → ProspectTop10Panel
                  "offseason"   → OffseasonPanel
                  "injury"      → InjuryPanel
그 밖 (metadata 가 없거나 위 넷이 아니면)
                              → body 를 줄바꿈으로 쪼개 <p> 로만 그린다
```

**대시보드로 나오는 종류는 넷뿐이다.** 나머지는 전부 일반 텍스트다.
목록 칸(왼쪽)은 종류와 무관하게 같은 모양이다 — 분류 라벨·보낸이·주차·제목·
미리보기 한 줄.

🔴 **`myBody` 는 다섯 번째 metadata 인데 그리는 갈래가 없다** (§4).

---

## 2. 대시보드로 나오는 것 — 넷

| 종류 | id 접두 | 보낸이 | 언제 | 컴포넌트 | 무엇을 그리나 | metadata |
|---|---|---|---|---|---|---|
| 주간 훈련 결과 | `msg-train-w` | 코치 | 매주 | `TrainingStatBars` | 능력치 증가를 **막대**로 · 컨디션·피로·사기 한 줄 · 부가 로그 | `TrainingMetadata` `stats[] condition fatigue morale extraLogs[]` |
| 유망주 TOP 10 | `msg-top10-` | 스포츠 매체 | 4주마다 (W4·W8·…) | `ProspectTop10Panel` | **순위 목록**(`<ol>`) · 내 자리 강조 | `Top10Metadata` |
| 오프시즌 연감 | `msg-offseason-` | 연감 | 시즌 끝 | `OffseasonPanel` | **표**(`<table>`) + `DigestCards` 카드·칩 | `OffseasonMetadata` |
| 월간 부상 리포트 (NPC) | `msg-injury-w` | 리그 사무국 | 월간 | `InjuryPanel` | **표** + `DigestCards` | `InjuryMetadata` `npcId` 목록 |

`DigestCards` 는 독립 종류가 아니라 위 둘(`OffseasonPanel`·`InjuryPanel`) 안에서
쓰이는 **카드·칩 조각**이다. 소식 종류와 1:1이 아니다.

---

## 3. 일반 텍스트로 나오는 것 — 나머지 전부

코드가 만드는 소식 자리를 전수로 훑었다(`apps/ui/src/shared/**` 의
`id: "msg-…"` 전부 · 검사 폴더 제외). **53자리**이고 위 넷을 뺀 **49자리**가
전부 일반 텍스트다.

| 갈래 | id 접두 | 보낸이 | 언제 |
|---|---|---|---|
| 리그·순위 | `msg-league-results-w` · `msg-digest-` · `msg-standings`(digest 안) | 리그 사무국 | 주간·월간 |
| 대회 | `msg-tour-open-` `msg-tour-round-` `msg-tour-my-` `msg-tour-champ-` `msg-tour-award-` | 대회 본부 · 고교야구연맹 | 대회 주차 |
| 경기 | `msg-official-result-w` · `msg-friendly-plan-w` · `msg-friendly-result-w` | 감독 | 경기 주 |
| 계약 | `msg-contract-signed-` `msg-contract-rejected-` `msg-fa-signed-` `msg-fa-market-` `msg-facomp-` `msg-resign-` | 에이전트 · 리그 사무국 · 구단 사무국 | W39~ 스토브리그 |
| 이적·로스터 | `msg-npc-trade-` `msg-demote-` `msg-waiver-` `msg-trade-medical-fail-` | 리그 사무국 · 구단 | 사건 |
| 몸 | `msg-injury-game-w` · `msg-mybody-` | 의무팀 · 코칭스태프 | 사건 · 월간 |
| 학업 | `msg-exam-w` | 학업 시스템 | 시험 주 |
| 대학·고교 행사 | `msg-allstar-` `msg-showcase-` `msg-scoutday-` | 대학야구연맹 · 고교야구연맹 | 주차 |
| 국가대표 | `msg-natl-squad-` `msg-natl-result-` | 대한야구협회 | 7월 |
| 병역 | `msg-military-warning-` `msg-military-annual-` `msg-sports-selected-` `msg-military-discharge-` `msg-mil-` `msg-mil-res-` `msg-mil-record-` | 병무청 · 군 복무 · 체육부대 | 사건 · 복무 중 |
| 시즌 경계 | `msg-season-brief-` `msg-pro-season-end-` `msg-indie-season-end-` `msg-farm-champion-` `msg-indie-retry-` `msg-season-hs-sync-` | 코칭스태프 · 리그 사무국 | 시즌 처음·끝 |
| 관계 | `msg-rel-` · `msg-team-mood-` | 관계 변화 · 팀 분위기 | 사건 |
| 은퇴 | `msg-retire-` | 구단 | 사건 |
| 첫 소식 넷 | `msg-000`~`msg-003` | 코치·감독·시스템 | 새 게임 |
| 이벤트 | `evt-{규칙id}-w{주}-{시각}` | 이벤트 시스템 외 | 조건·추첨 |

**이벤트 소식은 별도 계통이다.** id 가 `evt-` 로 시작하고
(`eventEngine.ts:118`) 588종의 규칙이 만든다. 전부 일반 텍스트이며
`metadata` 를 안 싣는다.

---

## 4. 🔴 결함 — `myBody` 는 metadata 를 싣는데 그리는 갈래가 없다

**C 몫으로 넘긴다** (A 확인 2026-09-03).

```
만드는 곳   weekPhases/myBodyReport.ts → buildMyBodyReport
싣는 것     MyBodyMetadata { type:"myBody", week, injury, events[] }
            events[] 는 결장(왜 못 나갔나 · 상대팀 · 그때 컨디션) ·
            경고(그때 피로 · 부상 위험 %) 를 월 단위로 모은 것이다
NewsPage    "myBody" 갈래가 **없다** (281~294줄에 넷뿐)
결과        구조가 잡힌 숫자를 들고 와서 **본문 텍스트로만** 보인다
```

타입 주석이 "NPC 월간 부상 리포트와 데이터가 다르다 · 규격을 억지로 합치면
화면이 둘 다 어중간하게 그린다 — 주기와 구조만 같게 둔다"고 적어 뒀다.
**설계는 갈라 두기로 했는데 화면이 한쪽만 만들어졌다.**

→ 손이 제일 적고 효과가 확실한 자리다. `InjuryPanel` 과 같은 표 꼴로 하나 더
만들면 된다(B 제안 · 화면은 C 몫).

---

## 5. 대시보드 후보 — B 제안

구조화된 숫자를 들고 있으면서 텍스트로만 나가는 종류다. 위에서부터 값이 크다.

| 순위 | 종류 | 지금 | 대시보드로 하면 |
|---|---|---|---|
| 1 | `msg-mybody-` 몸 상태 월간 | metadata 를 이미 싣는다 | **갈래만 추가하면 끝난다.** 결장·경고를 표로 |
| 2 | `msg-digest-` 리그 다이제스트 | 순위·승패를 문장으로 | 순위표 꼴 표 · 내 팀 강조 |
| 3 | `msg-pro-season-end-` 시즌 결산 | 성적을 문장으로 | 이닝·ERA·승패를 한 줄 표로 |
| 4 | `msg-contract-signed-` 계약 완료 | 연봉·기간·조항을 줄로 | 조건 표 (1.1 계약 기획과 맞물린다) |
| 5 | `msg-tour-my-` 내 대회 결과 | 결과를 문장으로 | 라운드별 표 |
| 6 | `msg-natl-result-` 국가대표 결과 | 문장 | 경기별 표 |
| 7 | 인센티브 정산 (1.1) | 아직 없다 | 달성·미달 표 — 처음부터 대시보드로 |

⚠ **전부 대시보드로 만들자는 게 아니다.** 이야기(관계·이벤트·병역 문안)는
텍스트가 맞다. 표로 바꿔야 하는 건 **읽는 사람이 값을 비교하는 것**뿐이다.

---

## 6. 선택지가 있는 소식 — 표에서 뺀 것

사용자가 "선택지 있는 메시지는 빼라"고 해서 위 표에 안 넣었다. 어디에
있는지만 적는다.

```
이벤트 소식      decisionTemplateId 가 있는 규칙 — 상세 칸 아래 .dec 영역에 버튼
계약 협상        salaryNegotiation · optionClause · faMarket — **모달**이라 소식이 아니다
보직 선택 (1.1)  소식 안 인라인 선택으로 확정됐다 (PLAN_ROLE_RECOMMEND §4)
군 이벤트        pendingAction "event" — 모달. 결과만 소식으로 남는다 (B-5)
```

⚠ 선택지가 붙은 소식도 **본문은 위 규칙과 같다** — `metadata` 가 넷 중 하나면
대시보드, 아니면 텍스트다. 선택 영역은 본문 **아래**에 따로 붙는다.

---

## 7. 통 수 — 실측 (채우는 중)

`measure:messagekinds --seasons 6`(고교 → 대학·독립 → 프로) 한 판으로 **종류마다
몇 통 오나**를 센다. 이 계기는 메일함이 아니라 **생산 시점**에서 세고 시즌
경계마다 차분한다 — 상한(500)에 밀려 사라진 뒤에 세면 이미 없어진 종류가 0으로
보이기 때문이다(스크립트 머리 주석).

⚠ **아직 안 붙였다.** 도는 중이라 결과가 나오면 이 절만 갱신한다.
**§1~§6 은 코드 전수라 이 값과 무관하게 확정이다.**
