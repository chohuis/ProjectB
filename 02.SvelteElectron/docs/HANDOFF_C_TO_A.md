# C → A 회신 13차 (2026-09-03) — 눈확인 열 장 · 묶음 1 표시부

## 0.53 눈확인 — 셋은 봤고 **FA 제안 카드 하나를 못 봤다**

`docs/screens/c53-*.png` 열 장. 전부 **1366×768** · 새 게임 ·
`DRIVE_USER_DATA=1` · electron 1개. 스크립트는 `scripts/c53-eyecheck.txt` 다.

```
c53-02-digest       다이제스트 순위표     ✅  변동 ↑↓ · 내 팀 행 강조 · 각주
c53-03-seasonend    프로 시즌 결산        ✅  항목/올해/지난해 · 키가 「ERA」로
c53-04-contract     계약 조건 + 인센티브   ✅  표 둘이라 이름을 단다
c53-05-mybody       몸 상태 대시보드      ✅  결장·경고 표 둘이 폭에 든다
c53-07-contract-page 계약 협상 페이지     ✅  760×707 (창 768)
c53-08/09-add-*     「＋ 추가」 팝업 둘    ✅  x 602~659 로 카드(303~1063) 안
c53-06-famarket     FA 제안 카드         🔴  **모달은 뜨는데 제안이 0건이다**
```

### 어긋난 것은 하나였다 — 고쳤다 (`78655f659`)

**글자 열이 숫자에 붙어 오른쪽에 섰다.** 다이제스트의 팀 이름과 인센티브의
조건이다. 기본이 「첫 열만 왼쪽」이었는데, 열 이름이 문안에서 오므로
**생산부가 `align` 을 실어 보낼 자리가 없다** — 값으로 정한다(`inferAlign`).
열이 `align` 을 실어 보내면 그게 이긴다(대진의 가운데 칸).

### 넘침은 없었다 — 잰 값이다

```
documentElement.scrollWidth 1366 = clientWidth      가로 스크롤 0
협상 모달 760×707                                    창 768 안
「＋ 추가」 목록 x 602~659                            카드 303~1063 안
표는 자기 overflow-x 안에서만 흐른다                  본문을 안 민다
```

### 🔴 FA 제안 카드를 만드는 법 (A 가 판단할 자리)

`c53-06-famarket.png` 은 「FA 시장 / 미계약 경과: 0주」 **한 줄뿐**이다.
자격은 채웠는데(`proServiceYears=8` · OVR 82 · fame 70 · 리그 KBL)
`generateFaOffers` 가 0건을 냈다. 이유는 **세상이 아직 없어서**로 본다 —
그 함수가 팀마다 보는 것이 이렇다:

```
teamPitcherOvrsOf(t.id)   그 팀 투수들 OVR      새 게임 고교 세이브엔 프로 NPC 가 없다
payrollOf(t.id)           연봉 총액             〃
teamProfileOf(t.id)       구단 성향·예산        〃
hasRoomFor(...)           정원 빈자리           〃
```

**주인공만 프로로 바꿔선 안 뜬다.** 셋 중 하나가 필요하다:

1. 프로 NPC 로스터를 먼저 채운다 — `gameStore.initProNpcsIfMissing(...)` 을
   드라이버에서 부른다. 인자(팀·규칙)를 몰라 안 했다. **A 가 그 한 줄을
   알려 주면 그 자리에서 찍는다.**
2. 프로 1년차까지 실제로 진행한 세이브를 하나 만들어 둔다(고교 3년 + 드래프트).
   `DRIVE_USER_DATA=<그 폴더 사본>` 으로 열면 우회 없이 본다. **그게 정공법**인데
   470주가 아니라 150주쯤이라 한 세션에 들어간다 — 다음 슬롯에 돌릴 수 있다.
3. 카드 배치만 볼 거면 `FaMarketModal` 의 `offers` 를 컴포넌트 밖으로 빼서
   (`faOfferTerms` 처럼) 검사로 재는 방법. **화면 배치는 여전히 못 본다.**

⚠ 지금 상태로도 **계약 협상 페이지(C③)는 다 봤다** — FA 카드와 협상 페이지는
  다른 화면이다. 못 본 것은 C② 하나다.

### ⚠ 눈확인 함정 둘 (다음 사람이 같은 데서 헛짚지 않게)

1. **트렁크의 vite(5174)는 다른 워크트리를 물고 있다.** 워크트리에서 고친
   것이 화면에 안 나와 한 판을 통째로 헛찍었다. 워크트리에서는
   `DEV_PORT=5175 npm run dev:ui` 로 따로 띄우고
   `VITE_DEV_SERVER_URL=http://localhost:5175` 로 드라이버를 건다.
2. **소식 목록 항목은 `click-text` 로 못 고른다.** 겉 요소가 먼저 잡혀
   상세가 안 열린다(§0.49 의 함정과 같은 자리). `.item` 을 번호로 누른다 —
   스크립트에 `window.__P(i)` 로 넣어 뒀다.

⚠ 앞선 세션이 남긴 `c-*.png` 40장은 지웠다. 루프가 멈춰 **38장이 같은
  그림**이었다 — 남겨 두면 다음 사람이 그걸 근거로 읽는다.

---

## 0.53-b 묶음 1 표시부 — 표 셋에 문안을 입혔다 (`2faa7712b`)

`PLAN_MESSAGE_DASHBOARDS.md` §4 묶음 1. **표시부만이다** — 값을 배열로 만드는
생산부는 A 몫이라 안 건드렸다.

🔴 **생산부가 열을 안 실어 보내도 표가 선다.** `columns: []` 로 보내면
   문안(`messages/dashboard_labels.json` · B-21)이 선언한 순서로 열이 선다.
   **A 가 넘길 것은 값이다** — 열 이름을 두 벌 적을 자리가 없어진다.

```ts
// 이걸로 충분하다
{ type: "table", kind: "digest", columns: [], deltaKey: "delta", rows: [
  { rank: 1, teamId: "부산 웨이브스", w: 38, l: 22, pct: ".633", delta: 1 },
  { rank: 3, teamId: "대구 세이버스", w: 33, l: 27, pct: ".550", delta: 2, myTeam: true },
]}
```

| 자리 | 생산부가 보낼 것 | 화면이 하는 것 |
|---|---|---|
| `msg-digest-` | `kind:"digest"` · 행에 `rank·teamId·w·l·pct` · 지난 값이 있을 때만 `deltaKey` | 열 이름·변동 틀·각주·빈 표 문장 |
| `msg-pro-season-end-` · `msg-indie-season-end-` | `kind:"seasonEndPro"`/`"seasonEndIndie"` · 행이 `{item:"era", value:"2.94"}` | `item` 키를 「ERA」로 바꾼다 |
| `msg-contract-signed-` | `kind:"contractSigned"` · 행이 `{item:"salary", value:…}` · 인센티브는 `extra` | 표 둘이면 이름을 단다 |

🔴 **선택 열은 행에 값이 있을 때만 뜬다.** 「무」·「연속」·「최근10」·「지난해」다.
   빈 열을 그리면 표가 넓어져 1366×768 에서 밀린다.

🔴 **「모름」과 「변동 없음」을 가른다** (§3-1). 지난 순위가 없으면 `deltaKey` 를
   **빼고** 보낸다 — `0` 을 채우면 첫 달이 「변동 없음」으로 보인다. 그래서
   §3-1 (나) 안(`SnapshotKey` 에 `"last_digest"`)이 여전히 A 쪽에 남아 있다.

⚠ **`TableMetadata.extra` 를 하나 더 뒀다.** 계약 완료가 「계약 조건」(항목·값)
  아래 「인센티브」(항목·조건·금액)를 다는 자리다 — 열이 아예 달라 한 표에 못
  넣는다. **선택이고 안 보내면 아무것도 안 그린다.** 문안은 점으로 잇는다
  (`kind: "contractSigned.incentives"`).

⚠ **문안을 못 읽어도 표를 안 없앤다.** 보직 소식은 문안이 없으면 소식을 아예
  안 만드는데, 표는 값이 이미 실려 와 있다 — 열 이름 자리에 키를 그대로 쓰고
  빈 칸은 `—` 다. 말을 지어내지 않는다.

⚠ `table.digest.title`(「리그 순위」)처럼 **표가 하나뿐인 자리의 `title` 은 안
  쓴다.** 소식 제목이 이미 그 이름이라 위에 한 줄 더 두면 부제가 된다 —
  B 가 문안을 지울 필요는 없다(표가 둘이 되면 그때 쓴다).

### 남은 묶음 셋

§4 의 2·3·4 는 아직이다. **컴포넌트는 다 있다** — `StatTable` 하나가 표 19를
받고, 순위 3은 `RankListPanel`, 타임라인 3은 `TimelinePanel` 이다. 남은 것은
`kind` 별 문안 배선과 생산부다.

---

# C → A 회신 12차 (2026-09-03) — myBody 대시보드 · 노트레이드 통일 · 계약 협상 페이지

## 0.52 소식 다섯째 갈래 · 「노트레이드」 한 말 · 협상 화면 새로 (1.1 C③)

**Rust · 엔진 로직은 안 건드렸다. 밸런스 값 확정 0** — 새로 넣은 수치는 전부
규칙 파일에 `_proposal` 로 적은 **제안값**이다. 검사에 정규식 0건.

```
vitest  209파일 1,959건 통과 (전 206파일 1,870건 · +89건 · 새 파일 3)
npm run check:svelte   716파일 0 ERRORS 0 WARNINGS
npm run check:mojibake OK
```

---

### ① 결함 — myBody 소식이 텍스트로 나가던 것 (B-18 §4)

`metadata` 를 실은 다섯째 종류인데 `NewsPage.svelte` 의 `metadata.type` 갈래에
`myBody` 가 없어서, **구조가 잡힌 숫자를 들고 와 본문 텍스트로만** 나갔다.
기존 넷과 같은 방식으로 갈래를 붙였다.

```
결장   표 — 주차 · 상대 · 사유 · 컨디션
경고   표 — 주차 · 피로 · 부상 위험
부상   카드 한 장 (있을 때만) — 이름 · 등급 · 발생 주 · 남은 주
```

행을 만드는 자리는 **`shared/utils/myBodyReportView.ts` 하나**다. `InjuryPanel`
(NPC 월간)과 같은 배치다 — 화면 안에서 행을 만들면 이 저장소의 vitest
(`environment: "node"`)가 **한 줄도 못 잰다.**

⚠ **NPC 부상 리포트와 규격을 안 합쳤다.** `MyBodyMetadata` 주석이 이미
못박아 둔 대로다 — 저쪽은 「사람 목록」이고 이쪽은 「내 한 달」이다.
주기(월간)와 구조(표)만 같게 뒀다.

⚠ 부제·대시 설명이 없다. 항목 이름과 값뿐이고 문장은 0줄이다.

---

### ② 「노트레이드」로 통일 (0.51 ⚠ 에서 A 판단으로 넘겼던 것)

```
전                                            후
ContractNegotiationModal  트레이드 거부권  →  노트레이드   (조항 목록)
TradeModal  "계약의 트레이드 거부권을…"    →  "계약의 노트레이드 조항을…"
PlayerDetailModal  노트레이드                 (그대로)
FaMarketModal      노트레이드                 (그대로)
```

`apps/ui/src` 전체에 **「트레이드 거부권」 0건**이고 검사가 그걸 지킨다.

⚠ **문안 데이터 `contract_terms.json` 의 「노트레이드 조항」은 안 건드렸다** —
B 소유다. 화면 이름표(「노트레이드」)와 소식 머리말(「노트레이드 조항」)이
갈리는 건 의도로 봤다: 화면은 표의 칸 이름이고 소식은 문장 안의 말이다.
**맞출 거면 B 에게 한 줄.**

이름표 정본은 여전히 **`faOfferTerms.ts` 의 `FA_TERM_LABEL` 하나**다. 협상
화면의 조항·비교표 이름이 전부 거기서 파생된다 — 화면이 낱말을 따로 적는지
검사가 본다. 예전 검사는 "협상 화면 소스에 그 낱말이 있나"만 봐서 **두 벌이
되는 걸 못 막았다. 더 강한 쪽으로 바꿨다.**

---

### ③ 1.1 C③ — 신규 계약 협상 페이지

정본 `PLAN_CONTRACT_TERMS.md` §3·§4·§5·§5-2·§5-3·§8 · 시안
`docs/mock/contract-page-mock.html`. 기존 `ContractNegotiationModal` 을 **시안
구성으로 갈아치웠다**(새 컴포넌트를 안 만들었다 — 띄우는 자리가
`MainPage.svelte:563` 하나라 배선을 바꿀 이유가 없다).

```
전                                        후
조항 체크박스·버튼이 늘 떠 있었다     →  「＋ 추가」로 붙이고 「×」로 뺀다
인센티브 없음 (죽은 필드)             →  최대 3개 (✅ 상한 확정)
연봉 슬라이더에 바닥 없음             →  salaryRules.minSalary 로 친다 (✅ 확정)
역제안 늘 한 번                       →  성적·구단주 관계로 1~3회 (§5-2)
비교 제시/요청 두 칸                  →  지금·제시·역제안 세 칸 표
수락 확률 게이지                      →  그대로 + 인센티브 항
```

#### 자료 구조 — 죽은 필드를 바꿨다

```ts
// 전: 문자열이라 기계가 판정할 수 없었다. 채우는 코드 0건
incentives?: { condition: string; bonus: number }[];
// 후
incentives?: ContractIncentive[];   // { kind, threshold, awardId?, bonus, paidSeasons? }
```

`IncentiveKind` 는 `games | innings | era | wins | saves | holds | award` 다.
`paidSeasons` 는 다년 계약에서 **두 번 주는 걸 막는 자리**이고 채우는 건
정산(C④·A) 몫이다.

🔴 **`buyout?` 은 안 넣었다.** §7 ① 이 "자리만" 이라 했는데, 쓰는 코드가 없는
필드를 또 만드는 건 지금 고치고 있는 결함(`incentives` 가 죽어 있던 것)과 같은
모양이다. **1.1 에서 쓸 때 넣는 게 맞다** — A 가 다르게 보면 한 줄이다.

#### 구 세이브 — 지우지 않고 비운다

`migrateContract()` 가 `contract` 와 `pendingNextContract` 둘 다 훑어
`incentives` 배열에서 **새 모양이 아닌 항목만** 뺀다. 남는 게 없으면 필드째
지운다(빈 배열을 두면 선수 상세가 「인센티브」 칸을 열고 아무것도 안 그린다).
**계약의 나머지 값은 그대로다.**

#### 규칙 파일 — `contractRules` 를 새로 (전부 제안값)

`resource/data/master/players/generation_rules.json`

```
contractRules.incentives   maxPerContract 3 (✅) · totalPctOfSalary 25 (제안)
                           perItemPctOfSalary 15 (제안) · acceptMultPerIncentive 1.02 (제안)
                           byRole SP/RP/CP (✅ 셋뿐) · candidates 9종 (문턱·금액 제안)
contractRules.renewalSigningBonus 0 (✅)
contractRules.counterOffer  base 1 · max 3 · 65 · 30 · 40 · 0 (✅ 계수 넷)
awardRules.golden.label     "골든글러브"  ← 없어서 더했다(mvp·rookie 는 이미 있다)
```

🔴 **문턱·금액은 KBO 감각으로 적은 숫자이고 실측 근거가 0이다**(§7-1).
`_proposal` 주석에 그렇게 적어 뒀다. 계측(주인공 시즌별 등판·이닝·ERA·승 분포 ·
달성률 20~50% 가 기준) 뒤에 사용자에게 확인받는 값이다.

수상 이름표는 **`awardRules` 가 정본**이다 — 코드가 「골든글러브」를 또 적지 않는다.

#### 계산은 전부 `shared/utils/contractTerms.ts` 로 뺐다

예전 화면은 허용치 계수(×1.15 · ×0.95 …)와 총액 식을 **컴포넌트 안에** 갖고
있어서 한 줄도 잴 수 없었다. 지금은 순수 함수고 화면은 부르기만 한다.

```
counterOfferRounds(성적, 관계)       1 + (≥65) + (≥30) − (<40 && <0) · clamp 1~3
requestedSalaryOf(제시, 비율, 하한)  ±20% 뒤 최저연봉으로 바닥
incentiveCandidates(보직, 연봉)      그 보직 축 + 수상 · 금액은 연봉 대비 %
incentiveAddable(...)                개수 3 · 중복 · 총액 상한 셋을 다 본다
acceptThresholdOf(...)               예전 식 그대로 + 인센티브 항(^1.02)
compareRows(...)                     지금·제시·역제안 여섯 줄
```

⚠ **조항 계수 다섯(0.95 · 0.97 · 0.94 · 1.05 · 1.10)은 예전 값 그대로**
코드에 남겼다. 규칙 파일로 옮기는 건 밸런스 소유(A·사용자) 판단이라 안 했다.

#### 역제안 횟수가 실제로 준다

예전엔 요구액이 허용치를 넘으면 역제안 버튼이 **잠기기만** 했다. 지금은:

```
허용치 안   구단이 받아들이고 서명한다      (예전과 같다)
허용치 밖   횟수를 하나 쓰고 되받는다        ← 새로
남은 0회    역제안이 잠기고 수락·거절만 남는다
```

되받는 줄은 `contract_terms.json` 의 `counter.reject` · `counter.reason.roundsOut`
에서만 온다. **코드에 문장이 0줄이다.** 파일을 못 읽으면 줄이 안 보일 뿐 빈
문장을 지어내지 않는다.

⚠ **구단 판정에 난수를 안 넣었다** — 허용치 비교 하나로 갈린다. 판정에 주사위를
넣는 건 엔진 몫이라 안 건드렸다.

⚠ 관계 값을 **숫자로 안 쓴다**(`relationship.ts` 규칙). 화면에 나가는 건
「역제안 2회 남음」과 제시액 배수뿐이다.

#### 문안 로더를 붙였다 (B-13)

`messages/contract_terms.json` → `masterStore.contractCopy`
(`shared/utils/contractCopy.ts` 가 타입·자리표 채우기 · 어긋나면 `null`).
지금 화면이 쓰는 문장은 **셋뿐**이다(최저연봉 안내 · 역제안 회신 둘).
나머지(offer·signed·option·incentive)는 소식을 만드는 자리(C④·A)가 붙을 때
쓰라고 타입만 미리 담았다.

---

### 바꾼 파일

| 파일 | 무엇 |
|---|---|
| `shared/utils/myBodyReportView.ts` **(신설)** | 몸 상태 표 행 만들기 |
| `features/messages/ui/MyBodyPanel.svelte` **(신설)** | 대시보드 갈래 |
| `pages/news/NewsPage.svelte` | `myBody` 갈래 추가 (다섯째) |
| `shared/utils/contractTerms.ts` **(신설)** | 조항·인센티브·역제안·허용치·비교표 |
| `shared/utils/contractCopy.ts` **(신설)** | `contract_terms.json` 타입·로더 |
| `features/contract/ui/ContractNegotiationModal.svelte` | 시안 구성으로 갈아치움 |
| `features/contract/ui/TradeModal.svelte` | 「노트레이드 조항」 |
| `features/player/ui/PlayerDetailModal.svelte` | 인센티브를 `incentiveLabel` 로 |
| `shared/types/save.ts` | `ContractIncentive` · `IncentiveKind` |
| `shared/stores/game.ts` | `migrateContract()` · 두 계약에 적용 |
| `shared/stores/master.ts` | `primeContractRules` · `contractCopy` |
| `resource/.../players/generation_rules.json` | `contractRules` · `awardRules.golden.label` |
| `shared/utils/__tests__/myBodyReportView.test.ts` **(신설)** | 19건 |
| `shared/utils/__tests__/contractTerms.test.ts` **(신설)** | 60건 |
| `shared/stores/__tests__/contractMigration.test.ts` **(신설)** | 10건 |
| `shared/utils/__tests__/faOfferTerms.test.ts` | 이름표 검사를 더 강하게 |

검사가 보는 것: 갈래가 있는가 · metadata 예시로 행 수(대조군 포함) · 칸 이름을
화면이 따로 안 적는가 · 조항 한 무리에 하나 · 계수 다섯이 예전 값인가 ·
인센티브 상한 3·중복·총액 상한 · 보직 축만 나오는가 · 최저연봉 하한 넷 ·
역제안 횟수 식 열한 갈래 + 전수 clamp · 허용치·확률 · 비교표 여섯 줄 ·
마이그레이션 열 · 문안 파일이 로더를 통과하는가(대조군: 한 칸 비면 null) ·
「트레이드 거부권」이 0건인가.

---

### 실측 — 못 했다. 왜 그런지 적는다

🔴 **재계약·FA 협상이 열리는 세이브를 헤드리스로 못 만든다.** 재계약은 프로
계약 만료(W39)에서만 열리고 `salaryNegotiation` pending 은 Electron 을 거쳐야
뜬다. **electron 1개 규칙**이고 A 프로브가 도는 중이라 앱을 안 띄웠다.
0.51 의 FA 카드와 **같은 이유**다.

그래서 **컴포넌트 단위 검사로 대신했다**(A 지시대로) — 계산을 직접 재고,
화면이 그 함수를 쓰는지는 소스 문자열로 본다.

**눈확인이 둘 남는다** (슬롯이 나면 C 가 돌린다):

```
1  협상 화면 — 「＋ 추가」 목록이 카드 밖으로 안 넘치나 · 좁은 폭(1열)에서 표
2  몸 상태 소식 — 결장·경고 표 둘이 상세 칸 폭에서 어떻게 보이나
```

---

### A 가 이어서 볼 자리

```
1  §7 ③ 재계약에 인센티브 후보·팀 옵션을 싣기 (advanceWeek.ts:1306)
   → 실리면 협상 화면은 「구단 제시」 칸에 줄만 늘면 된다. 화면은 이미 그 모양이다
2  §7 ⑤⑥ 인센티브 정산 (utils/incentiveEngine.ts + runWorldSeasonEnd)
   → paidSeasons 자리는 이미 있다. 문안도 contract_terms.json 에 다 있다
3  §7-1 문턱 계측 — contractRules.incentives.candidates 9종이 전부 제안값이다
4  🔴 **제시 수락의 서명액이 화면 표시와 다르다** — 화면은 effectiveOffer
   (구단주 관계·예산 배수를 먹인 값)를 보이는데 서명은 action.offeredSalary 다.
   **예전 화면부터 그랬다.** 역제안은 배수를 먹인 값으로 서명하므로
   0% 역제안이 수락보다 유리하다. 금액을 바꾸는 건 밸런스라 안 건드렸다
5  buyout? 필드를 지금 넣을지 (위 ③ 참고 — C 는 안 넣었다)
6  contract_terms.json 의 「노트레이드 조항」을 그대로 둘지 (B 소유)
```

---

# C → A 회신 11차 (2026-09-03) — C① 후속 한 줄 · C② FA 제안 카드 조건

## 0.51 확인 단계는 추천이 아닌 버튼에만 · FA 카드에 계약금·옵션·노트레이드

**Rust · 규칙 파일 값 · 엔진 로직은 안 건드렸다. 밸런스 값 0.** 검사에 정규식 0건.

### ① 확인 단계 — A 지시대로 되돌렸다 (사용자 요구 3)

0.50 에서 "정본 §7·§8 확정 12 가 추천에도 띄우라고 한다"고 읽고 추천에도 확인
단계를 뒀다. **그 읽기가 틀렸다** — 확정 12 는 **문구를 갈래로 나누지 마라**는
뜻이지 단계를 두라는 뜻이 아니다. 지금은 이렇다:

```
추천 버튼        누르면 바로 applyRoleChoice — 확인 단계 없음
추천 아닌 버튼   확인 한 줄(ahead≥1 / ahead=0) + [다시 고른다] [그래도 간다]
```

갈래 판정은 **`pitcherRole.ts` 의 `needsRoleConfirm(recommended, pick)` 하나**다.
화면이 `meta.recommended === opt.id` 를 직접 적으면 그 한 줄이 컴포넌트 안에만
있어 검사가 못 본다 — 그래서 밖으로 뺐다.

문서도 같이 고쳤다(**세 자리**). 한 자리만 고치면 다음 사람이 또 §7 을 보고
같은 결론을 낸다 — 이 저장소가 반복해 겪은 "문서가 둘이면 한쪽만 고쳐진다"다.

```
PLAN_ROLE_RECOMMEND §4  「확인 단계 — **추천이 아닌 버튼에만** 뜬다」로 제목까지 고침
                   §7  "추천을 눌러도 같은 줄이 뜬다" → "추천 버튼은 이 갈래에 안 온다"
                   §8 ⑫ "추천이든 아니든 누르면 같은 한 줄" → 문구 얘기임을 명시
```

⚠ **헤드리스는 안 바뀐다.** `runAutoAdvance` 는 `applyRoleChoice` 를 직접 부르지
화면을 안 탄다 — 확인 단계는 사람 플레이에만 있다.

### ② FA 제안 카드 — 있는 조항만 줄로

`FaMarketModal` 카드가 연봉·기간 두 줄뿐이라, Rust `eval_fa_bid` 가 내고
`toContract` 가 계약에 옮기는 **계약금·팀 옵션·노트레이드가 서명한 뒤에야**
보였다(PLAN_CONTRACT_TERMS §1-2 · §7 ②).

```
계약금        signingBonus > 0 일 때만    "계약금  3,000만원"
팀 옵션       teamOptionYears > 0         "팀 옵션  1년"
선수 옵션     playerOptionYears > 0       "선수 옵션  2년"
노트레이드    noTrade 일 때만             "노트레이드"          ← 값 없이 이름만
총액          연봉×기간 + 계약금          "총액  39,000만원"
```

**없는 조항은 줄 자체가 없다** — 「없음」·「0년」을 안 적는다. 부제·대시 설명도
없고 항목 이름만이다. 카드 스타일은 기존 토큰 그대로(`--ink-mid`·`--ink`).

줄을 만드는 자리는 **`shared/utils/faOfferTerms.ts` 하나**다(순수 함수).
화면은 `{#each faOfferTermLines(offer)}` 만 돈다 — 항목 이름을 화면이 따로 적으면
표가 두 벌이 되고, 검사가 그걸 막는다.

정한 것 둘, 근거를 적어 둔다:

- **금액 단위는 만원**이다. 협상 화면은 `억/만` 으로 접는데 카드는 안 접었다 —
  카드의 연봉 줄이 이미 만원이라 한 카드 안에서 단위가 갈리면 비교가 안 된다
- **1년 · 계약금 없음**이면 총액이 연봉과 같아 **총액 줄을 안 적는다.**
  Rust 는 계약금을 늘 내므로(`bid_salary × (0.08~0.20)`) 실전에선 거의 안 걸린다

⚠ **표기가 화면마다 갈려 있다 — 「노트레이드」만 셋이다.**

```
ContractNegotiationModal   트레이드 거부권      (체크박스 라벨)
PlayerDetailModal          노트레이드 · 있음/없음
contract_terms.json (B-13) 노트레이드 조항      ← 소식 문안 정본
```

카드는 **「노트레이드」**로 갔다(문안 정본의 머리말과 같고 선수 상세와도 같다).
나머지 넷(계약금·팀 옵션·선수 옵션·총액)은 협상 화면과 **글자까지 같다** —
검사가 협상 화면 소스를 읽어 대조한다. **협상 화면의 「트레이드 거부권」을
「노트레이드」로 맞출지는 A·사용자 판단**이라 안 건드렸다.

⚠ 카드는 소식이 아니라 `contract_terms.json` 을 **안 읽는다.** 코드에 문장은
0줄이고 항목 이름만 있다 — 소식을 만들 자리(③④)가 오면 그때 로더를 붙인다.

### 바꾼 파일 · 검사

| 파일 | 무엇 |
|---|---|
| `shared/usecases/pitcherRole.ts` | `needsRoleConfirm()` 신설 |
| `features/messages/ui/RoleChoicePanel.svelte` | `pick()` 갈래 · 추천은 바로 확정 · 진행 중 버튼 잠금 |
| `shared/utils/faOfferTerms.ts` **(신설)** | `faOfferTermLines()` · `faTotalValue()` · 항목 이름표 |
| `features/contract/ui/FaMarketModal.svelte` | 제안 카드에 조건 줄 · 스타일 셋 |
| `docs/PLAN_ROLE_RECOMMEND.md` | §4 제목·본문 · §7 · §8 ⑫ |
| `features/messages/__tests__/roleChoicePanel.test.ts` **(신설)** | 9건 |
| `shared/utils/__tests__/faOfferTerms.test.ts` **(신설)** | 18건 |

```
vitest 27건 추가 — 전체 205파일 1,867건 통과 (전 203파일 1,840건)
npm run check:svelte   708파일 0 ERRORS 0 WARNINGS
```

검사가 보는 것: 있는 항목만 줄이 되는가 · 없는 조항(0·false·undefined)은 줄이
없는가 · **대조군**(조항을 얹으면 줄 수가 는다) · 총액 식이 협상 화면과 같은가 ·
항목 이름이 협상 화면과 같은 글자인가 · 화면이 그 함수를 쓰고 이름을 따로 안
적는가 · 추천/비추천 갈래 여섯 · 확인 단계를 여는 자리가 하나뿐인가 ·
문서에 옛 문장이 안 남았는가.

### 실측 — 못 했다. 왜 그런지 적는다

🔴 **헤드리스로 FA 제안이 뜨는 세이브를 못 만든다.** 주인공 FA 는 프로 5년차
(`faRules.eligibleYears`) 뒤에야 열리고, `generateFaOffers` 가
`window.projectB.faGenerateOffers` 를 타 **Electron 없이는 값이 아예 안 온다.**
electron 은 1개 규칙이고 A 프로브가 돌고 있어 앱을 안 띄웠다.
그래서 **컴포넌트 단위 검사로 대신했다**(A 지시대로) — 줄 만드는 함수를 직접
재고, 화면이 그 함수를 쓰는지는 소스 문자열로 본다. 이 저장소 vitest 는
`environment: "node"` 라 컴포넌트를 못 띄운다.

**눈확인이 남는다** — `drive.mjs` 로 FA 시장 모달을 띄워 카드 두 줄 → 다섯 줄이
어떻게 보이는지(2열 그리드에서 카드 높이가 는다) 한 번 봐야 한다. A 프로브가
끝나고 슬롯이 나면 C 가 돌리겠다.

### A 가 이어서 볼 자리

```
1  협상 화면의 「트레이드 거부권」 표기를 「노트레이드」로 맞출지    ← 사용자 판단
2  §7 ③ 재계약에 계약금·인센티브 후보 싣기 (advanceWeek.ts:1306)
3  §7 ④ 협상 화면에 구단 제시 칸 + 인센티브 고르기
4  FA 카드 눈확인 (drive.mjs · 슬롯이 날 때)
```

---
# C → A 회신 10차 (2026-09-03) — C① 보직 선택 인라인

## 0.50 C① 보직 선택 인라인 — 화면 · pending · 헤드리스 (§7 몫)

정본 `PLAN_ROLE_RECOMMEND.md` §4·§7·§8 · 문안 `messages/role_choice.json`(B-12·B-14).
**Rust · 규칙 파일 값 · 등판 배정은 안 건드렸다** (A ②④ 몫). 밸런스 값 0.

### 🔴 A 가 갈아끼울 자리 — `recommendRole()` 하나다

```
apps/ui/src/shared/usecases/pitcherRole.ts
  recommendRole(protagonist, entities, roleOvrBias) → { recommended, ahead }
```

지금 안은 **이미 있는 엔진 그대로**다 — 고교는 `assignHighschoolPosition`,
그 밖은 `assignProtagonistRole` 의 결과를 SP/RP/CP 로 접어 추천으로 쓴다.
A① 의 `recommend_pitcher_role` 이 들어오면 **이 함수의 안만** 바뀐다.
호출부는 셋뿐이고(소식 생성 · 검사 · 계측) 전부 `RoleRecommendation` 만 본다.

지금 추천의 한계 둘(A① 이 닫는다 · 코드 주석에도 적어 뒀다):

```
고교   assignHighschoolPosition 이 SP/RP 둘만 낸다 → **마무리를 추천하지 않는다**
       (버튼은 셋 다 보이고 고를 수는 있다 · 확정 5)
프로   assignProtagonistRole 이 직전 position 으로 먼저 갈린다 → 한 번 RP 가 되면
       추천이 선발로 안 돌아온다(§1 발견 3). **선택은 막지 않는다**
```

`ahead` 도 임시 정의다 — A 가 준 대로 **그 자리를 지금 차지한 같은 팀 투수 수**
(`aheadOfTeam`)이고, §5 의 `min(rank − 1, seats)` 는 자리 수·순위가 오는 A① 뒤에 붙는다.

### 바꾼 파일

| 파일 | 무엇 |
|---|---|
| `shared/usecases/pitcherRole.ts` **(신설)** | 추천 · 소식 두 통 · 가드 · 확정(`applyRoleChoice`) · 헤드리스 정책 |
| `shared/utils/roleChoiceCopy.ts` **(신설)** | 문안 JSON 의 타입 · 자리표 채우기 · 무대 고르기. **문장은 한 줄도 없다** |
| `shared/stores/master.ts` | `messages/role_choice.json` 로드 → `masterStore.roleChoiceCopy` |
| `shared/utils/seasonWeeks.ts` | `ROLE_ASK_WEEK` 표 · `roleAskWeekOf()` (고교 6 · 대학 4 · 독립 9 · 1군 1 · 2군 4) |
| `shared/usecases/advanceWeek.ts` | `processWeekBoundary` 머리에서 `askRoleChoice` · W1 자동 배정에 `!hasRoleChoiceThisSeason` 가드 |
| `shared/usecases/runAutoAdvance.ts` | `handleMessage` 의 `roleChoice` 갈래 (pickChoice 앞) |
| `shared/types/main.ts` | `RoleChoiceMetadata` · `DecisionEffect.roleChoice` |
| `shared/types/save.ts` | `ProtagonistSave.lastRoleChoiceKey` |
| `shared/stores/game.ts` | `setLastRoleChoiceKey` |
| `features/messages/ui/RoleChoicePanel.svelte` **(신설)** | 소식 상세 안 선택 칸 + 확인 단계 |
| `pages/news/NewsPage.svelte` | `metadata.type === "roleChoice"` 면 패널 · `dec.prompt` 빈 값 가드 |
| `scripts/probe-paths.cjs` · `scripts/measure-slotreach.cjs` | `__PB_ROLE_CHOICE` 기본 `recommend` |
| `docs/mock/role-recommend-mock.html` | B-14 합쇼체 대조표대로 · 물음 줄 추가 · 추천 배지 제거 |

`PENDING_ACTION_TYPES` 는 **안 건드렸다.** 소식이 `{type:"message"}` pending 으로 이미 멈춘다.

### 언제 묻나 — `roleAskReasonOf()` 하나가 정한다

```
season      리그별 개막 전 주 (ROLE_ASK_WEEK)
stageMove   같은 시즌 안에서 팀이 바뀐 뒤 첫 주
callup      바뀐 팀이 2군 → 1군      (leagueOfTeam 으로 가른다 · id 를 문자열로 안 자른다)
demote      1군 → 2군
discharge   전역 뒤 첫 시즌의 개막 전 주 (careerEvents 의 military_discharge 로 판정)
안 묻는다   복무 중 · 타자 · 가드가 이번 주와 같을 때
```

가드 `protagonist.lastRoleChoiceKey = "{연도}:{팀}:W{주}"` 는 **소식 id
`msg-role-{year}-{teamId}-w{week}` 와 같은 세 조각**이고, `ProtagonistSave` 안에
있어 세이브에 그대로 실린다. 물은 **그 순간** 저장한다 — 답하기 전에 앱을 껐다 켜도
같은 주에 소식이 또 안 생긴다.

### ⚠ A 지시와 한 군데 다르다 — 확인 단계를 **추천에도** 띄운다 (🔴 **0.51 에서 되돌렸다**)

A 의 지시문은 "비추천이면 확인 단계"였는데, 정본 §7 과 §8 확정 12 는
**"추천이든 아니든 누르면 같은 한 줄이 뜬다"** 다("추천이라고 문장을 빼면
「추천은 자리가 있다」는 뜻이 되는데, 셋 다 밀리는 경우가 실제로 있다").
정본을 따랐다. 되돌리려면 `RoleChoicePanel.svelte` 의 `on:click` 한 줄에
`meta.recommended === opt.id` 면 바로 `applyRoleChoice` 를 부르게 하면 된다.

### ⚠ 추천 배지 문구가 데이터에 없다

시안엔 `[선발] 감독 추천` 배지가 있었는데 `role_choice.json` 에 그 말이 없다.
문장을 코드가 짓지 않기로 했으므로 **테두리 하나**로만 표시했다(§4 가 허용한다 —
"테두리 하나(또는 배지 하나)"). 시안도 배지를 뺐다. 배지를 쓰려면 B 에게
`recBadge` 한 줄을 받아야 한다.

### 검사 — vitest 72건 추가 (전체 203파일 1,840건 통과 · `check:svelte` 0)

```
shared/utils/__tests__/roleChoiceCopy.test.ts       16   문안 JSON 을 직접 읽는다
                                                        굴절형 셋 · 합쇼체 · 버튼만 평서체 ·
                                                        ahead 두 갈래 · 한 칸 비면 로더가 null (대조군)
shared/usecases/__tests__/roleChoiceMessage.test.ts 26   소식 모양 · id 세 조각 ·
                                                        1군→2군→1군 왕복 id 안 겹침 ·
                                                        ahead 계산 · 헤드리스 정책 넷
shared/usecases/__tests__/roleAskWeek.test.ts       30   askWeek ↔ 개막 주 상수 대조 ·
                                                        가드 · 콜업/강등/이동/전역 갈래 ·
                                                        advanceWeek · runAutoAdvance 배선(순서 포함)
```

정규식은 안 썼다. 배선 검사는 소스 문자열 `includes` 로 본다.

### 실측 — 헤드리스

`PF_YEARS=3 npm run probe:paths -- --path pro` (씨앗 20260731 · electron 1개 · `DRIVE_USER_DATA=1`)
— **`[END] 완주`.** 3시즌은 고교에서 안 벗어나 프로 갈래를 못 밟는다(지명 실패 →
입대). 보직 소식 자체는 임시 계측(스크래치패드 · `mailboxRaw`)으로 따로 봤다:

```
── 보직 소식 (씨앗 20260731 · 3시즌 · 정책 recommend) ──
  묻는 소식 3통  msg-role-2026-TEAM_HS_AEWOL-w6 · 2027-…-w6 · 2028-…-w6
  확정 소식 3통  msg-role-done-2026-… · 2027-… · 2028-…
  소식함 id 중복 0건
  [system/Seung-hyun Kwon] 2028시즌 보직
    올해 자리를 이렇게 봤습니다.
    체력이 팀에서 제일 낫습니다. 주말리그 한 경기를 끝까지 맡길 만합니다.
    어디서 던지겠습니까.
  [system/Seung-hyun Kwon] 2028시즌 보직 — 선발
    올해는 선발로 갑니다.
[END] 완주 · 최종 2029W0 military TEAM_HS_AEWOL pos=SP
```

읽히는 것 넷: **시즌마다 W6 에 정확히 한 번** · 가드가 두 번을 막았다 ·
헤드리스가 `recommend` 로 풀었다(확정 소식이 「추천대로」 문안) ·
보낸이가 감독 이름이고 **본문엔 이름이 없다**(언어 반영본을 읽어 영문으로 나온다).

⚠ **프로 W1 갈래는 아직 실측 못 했다** — 3시즌으로는 프로에 못 간다.
`PF_YEARS=12 --path pro` 를 A 프로브와 겹치지 않을 때 한 번 돌려 주면
「W1 물음 + W1 브리핑이 겹치지 않는가」까지 닫힌다(코드는 `get(gameStore)` 를
다시 읽어 막아 뒀고 검사도 그 줄을 본다).

### ⓘ 지나가다 본 것 — 로컬 `_manifest.json` 이 낡았다 (내 몫 아님)

프로브 로그에 `master:fetch` ENOENT 가 셋 뜬다 —
`EVT_HS_Y1/Y2/Y3_TOP10_REPORT`. B-17 이 그 이벤트를 지웠는데
`_manifest.json` 은 gitignore 라 로컬본이 안 따라왔다. `npm run gen:manifest`
한 번이면 사라진다. **게임은 그냥 돈다**(로더가 그 셋만 건너뛴다) — 이 저장소가
적어 둔 "데이터가 코드와 어긋나도 아무도 안 죽는다" 그 형태다.

### A 가 이어서 볼 자리

```
1  recommendRole() 안을 Rust recommend_pitcher_role 로            ← A①
2  ahead 를 min(rank − 1, seats) 로                                ← A① (자리 수가 오면)
3  고교 추천에 CP 가 나오게                                        ← A① (지금은 SP/RP 둘뿐)
4  detailedRoleFor() 의 고교 갈래(1선발/중간계투/마무리 고정)      ← A② 뒤 세부 이름
5  roleFit(chosen/recommended/rank/seats) 저장                     ← A④ 불이익이 쓸 값
```

---
# C → A 회신 9차 (2026-09-03) — C-11 빌드 산출물 (패키지 exe · 09-03 02:45 pack)

✅ **최종 pack(09-03 07:01 · B-9 병합) 재확인** — 같은 명령파일(`c11-a.txt` · `c11-b.txt` · 새 임시 userData): 새 게임 W5 저장(`slot3_slot_1.db`) → 종료 → 「이어하기」 슬롯 → W5 그대로 → W8 · 1366×768 소식/리그/나 · asar 문자열 "이벤트가 기다린다" 1 · "군 경력" 4 · "구단별 문턱 보기" 1 · "nav.military" 2 · "이번 주 선택" 1. 아래 표와 같다.

`DRIVE_EXE=release/win-unpacked/OnePitch.exe DRIVE_USER_DATA=<임시 폴더>` — 임시 폴더는 스크래치패드 `c11-userdata`(사용자 세이브 폴더 아님).

| # | 결과 |
|---|---|
| (1) 첫 실행 · 새 게임 · 진행 · 저장 | ✅ 인트로 → 새 게임 → 슬롯 → 이름/팀 → W0 → `advance 5 --auto` → **5주차** · userData 에 `projectb_v2.db` · `slot3_slot_1.db` 생김 |
| (2) 닫고 다시 열어 이어하기 | ✅ 재실행 인트로 「이어하기」 활성 → 세이브 슬롯 화면("패키지확인 · 북악고 · 고교 · 2026년5주차") → 슬롯 클릭 → **5주차 그대로** → `advance 3` → **8주차** |
| (3) 병역 탭 · 이벤트 모달 · 결산 | ⚠ **dev 우회 없이는 못 닿는다**(입대 = 고교 3년 · 결산 = 프로 은퇴). 패키지 안에 들어 있는지는 asar 문자열로만 확인 — "이벤트가 기다린다" 1 · "군 경력" 4 · "구단별 문턱 보기" 1 · "nav.military" 2 · "이번 주 선택" 1. 화면은 dev 에서 본 것(3~6차)이 정본 |
| (4) 1366×768 | ✅ 소식 · 리그(경기 상태 모달 겹침 포함) · 나 — 깨짐 없음 (`c11-07/08/09*.png`) |

ℹ 「이어하기」는 최근 슬롯을 바로 여는 게 아니라 **슬롯 화면**을 거친다 — 드라이버 스크립트에 `wait .slot-info` · `click .slot-info` 가 필요하다(`c11-b.txt`).

---

# C → A 회신 8차 (2026-09-02 밤 · 당김) — C-5 잔여: 롤오버까지 못 갔다

두 번 시도(`univ3-drive.log` · `univ-drive2.log`). 새 게임 → `advance 30 --auto` 가 **W19 · W22 · W25 · W27 · W28** 에서
각각 60초 넘게 "진행 중…"(드라이브 STUCK · 12×5초 가드) — 10분 한 번에 2026 W32 까지가 한계였다.
얻은 것: W22 진학(dev 우회) 뒤 **대학 일정에 내 경기가 선다**(W28 `mine: 4`) · 우측 패널 "다음 경기 10/6 홈 소사대 · 42위/50팀 6승 13패" ·
리그 탭 "대학 · 내 리그" C조 내 권역. 롤오버 → 다음 시즌 W1~5 는 **못 봤다** — A 의 `probe:paths univ` 12시즌 완주 실측을 정본으로.

⚠ 주차가 느린 게 앱인지 환경인지 못 갈랐다 — 같은 시간에 A 프로브(electron) 가 돌고 있었다. `measure:perf` 로 고교 1학년 W19~28 · 프로 W12~26 을 같이 재 달라.

---

# C → A 회신 7차 (2026-09-02 밤 · 당김) — 투자 3택 · store-match 재촬영 · (C-5 잔여는 아래 8차)

| # | 결과 |
|---|---|
| 9/4 몫 투자 3택 | ✅ SeasonEndModal **「개인」 탭**에 `financeRules.investment.options` 셋이 규칙 값 그대로(예금 평균 3% 확정 / 펀드 8% ±15 / 사업·주식 15% ±45 · 금액 1/4·1/2·전액). 현금을 100만으로 내리면 **안 뜬다**(`minCash` 500). 예금 선택 → "3,000만 투자 → +90만 (3.0%) · 자산에 반영" · `finance.investments` 에 DEPOSIT 기록. `invest-01/02/03*.png` |
| store-match | ✅ W9 2회 초 창원 3 : 0 부산 장면 · 1920×1080 (투구 90번 눌러 점수 낸 뒤 촬영) |

⚠ **프로 주차가 느리다** — `advance --auto` 가 W12·W17·W25·W26 에서 60초 넘게 "진행 중…"(드라이브 STUCK). 52주를 10분 안에 못 돌아
시즌 끝은 `seasonStore.advanceWeek()` 를 49번 불러(스토어만) `seasonEnded` 를 켰다 — 모달·3택·정산(Rust)은 실제 경로다. `measure:perf` 재는 김에 프로 주도 봐 달라.

---

# C → A 회신 6차 (2026-09-02 밤) — C-2 재확인 · C-8 은퇴/엔딩/군 경력 · C-9 첫 프로 · C-10 스크린샷 5장

커밋: `591518cbd`(군 경력 카드) · `81cc2a849` · `cd06cf1af`(결산 글자색) · 이 문서. svelte-check 0/0.

| # | 결과 |
|---|---|
| C-2 재확인 | ✅ `27173a203` 뒤 `setProtagonistTeam` + `switchProtagonistLeague` — 일정 탭 W5~ 상대 전부 "(2군)" · `mine: 99` · `s.leagueId = LEAGUE_KBL_FARM` · 우측 패널 "다음 경기 4/3 원정 수원 나이츠 (2군)" · KBL 2군 순위표 (2군) 10팀. ℹ 강등 뒤 W1~4 는 "비시즌"(2군은 시범경기 없음 — 설계대로) |
| C-8 | ✅ 자발적 은퇴(StatusPage 기록 탭) → 「커리어 결산 보기」 → CareerEndScreen. 🔴 **`militaryRecord` 를 읽는 Svelte 가 한 곳도 없었다** — `MilitaryRecordCard` 를 만들어 나 > 상태 > 기록 과 결산 「병역」 절에 붙였다(record 는 dev 우회로 `applyMilitaryDischarge` 주입). 결산 화면에서 병역 절·"연도별로 보기" 버튼이 `color: inherit`(모달 뿌리 var(--ink))라 **안 보였다** → 고침 |
| C-9 | ✅ 새 게임 → 고교 W30(자동) → 결과 주입 → 「드래프트 지명」 → 지명 통보(구단 제시 · "협상 불가" 문구) → 「입단하기」 → runWorldSeasonEnd → 2027 프로 W0 → W1~4 친선 12경기 → W5 정규 개막 · W9 KBL 순위표 내 팀 강조 |
| C-10 | ✅ `resource/logs/shots/store-{news,match,league,military,ending}.png` — 헤더 실측 전부 1920×1080. news(선택지 열린 소식) · match(1회 말 투구 선택) · league(KBL W9) · military(일과 + 이벤트 모달) · ending(결산 · 병역 절) |

## A 에게
- ℹ 은퇴 직후 결산이 **자동으로 뜨지 않는다** — StatusPage 「은퇴한다」 뒤 「커리어 결산 보기」 를 눌러야 한다(RetirementAskModal 경로만 `onRetired` 로 연다). 예전 판단(HANDOFF_A_TO_C §5)대로 두었다. 자동으로 열려면 `doVoluntaryRetire` 뒤 `showCareerEnd = true` 한 줄 — 사용자 확정이면 C 가 넣는다.
- ℹ 드라이버 `advance N`(수동)은 선택 대기 소식이 많으면 12회 가드 안에 경기까지 못 간다 — `advance 1` 을 두세 번 이어 부르면 도달한다(`match-drive.txt`).
- ℹ 스토어 후보 5장 중 match 는 W1 친선(1회 말 0-0) — 점수가 난 장면이 더 좋으면 W9 쯤 다시 찍는다.

---

# C → A 회신 5차 (2026-09-02 밤) — C-2~C-7 눈확인 · 결함 셋

커밋: `0644af6ec`(리그 순위 출처) · 이 문서 커밋. svelte-check 0/0. 스크린샷 `shots/p-*.png · d-*.png · f-*.png · r-*.png · z*.png · u2-*.png`.
전부 새 게임 + dev 우회(`setCareerResults` → 「드래프트 지명」 → 입단/거부 · `setProtagonistTeam(_2)` · `enlistProtagonist`).

| # | 결과 |
|---|---|
| C-2 2군 탭 | 화면 ✅(아래 결함 고침) · 🔴 엔진 결함 1 |
| 시범경기 「친선」 | ✅ 프로 일정 탭 W1~4 "프리시즌 · 친선" 12경기 · 정규 W5~ |
| C-3 재정 4탭 | ✅ 개요·스폰서·개인 트레이닝·투자 — 값은 Rust/`financeRules` 만 표시. 투자 3택은 `SeasonEndModal` 이 `financeRules.investment.options`·`minCash` 를 돌린다 — ⚠ 시즌 끝까지 안 가 화면은 못 봤다 |
| C-4 지명 거부 | ✅ "거부 (대학 진학)" → university · 아산대 1학년 · 리그 탭 "대학 · 내 리그" |
| C-5 대학 전 경로 | 🔄 진학 뒤 대학 순위표가 찬다(C조 내 권역 · 아산대 4-15). ⚠ 롤오버 → 대학 시즌 개막·4년·졸업 허브는 **못 봤다** — 아래 결함 3 |
| C-6 관계 라벨 | ✅ "감독의 경고"(보통→서먹) 선택지 둘 · 고르면 선택 완료 · 사기 반영 |
| C-7 해상도 | ✅ 1366×768 · 1920×1080 · 2560×1440 · 1100×640 — 소식·리그·일정·나·병역(일과/부대원/캘린더/경력) 깨짐 없음 |

## 고친 것 — `0644af6ec` LeaguePage
🔴 순위·리더보드의 "시즌 순위" 출처가 **주인공 리그**였다. 강등 뒤 "KBL 2군 · 내 리그" 탭이 1군 순위표를 그대로 보여줬고,
진로 전환 창(주인공 리그 ≠ 시즌 리그)에서는 "대학 · 내 리그"에 고교 102팀이 "미분류"로 떴다. `$seasonStore.leagueId` 로 가른다.

## A 에게 — 결함 셋
1. 🔴 **강등 뒤 주인공 일정이 안 따라온다.** `setProtagonistTeam(_2, KBL_FARM)` 만 하면(market.ts 승강 경로와 같다) `s.schedule`(1군 780경기)은 그대로고
   `mineInSchedule: 0` — 일정 탭은 1군 일정에서 상대가 전부 "부산 웨이브스"(옛 내 팀)로 찍히고, 우측 패널은 "예정된 경기 없음".
   market.ts 주석 "2군 일정·순위표는 이미 있으므로 leagueId만 맞으면 그대로 뛴다"는 **순위표에만 맞고 일정엔 안 맞는다**. 재현: `demote-drive.txt`.
2. ⚠ **W22 → W23 진행이 60초 넘게 걸린다** (새 게임 고교 1학년 · 2026). drive 가 `STUCK:go가 disabled … 진행 중...` 으로 두 번 멈췄다(`univ-drive.log` · `univ-drive2.log`).
   나중엔 풀리니 정지가 아니라 **느린 주**다 — `TRADE_DEADLINE_WEEK = 22` 언저리. 다른 주는 5초 안이다. `measure:perf` 로 그 주만 재 볼 만하다.
3. ℹ C-5 를 못 끝낸 이유가 2 다 — W52 롤오버까지 못 갔다. 헤드리스 `probe:paths univ` 가 있으니 A 쪽 실측이 있으면 그걸 근거로 ✅ 로 올려 달라.
   독립 "개막 Wn" 한 줄은 `seasonWeeks.ts` 에 개막 상수가 없어(`INDIE_CAREER_HUB_WEEK`·`INDIE_SEASON_REVIEW_WEEK` 뿐) 안 넣었다.

---

# C → A 회신 4차 (2026-09-02 저녁) — 부상 띠 · namelocale · teamrefs · C-1 순위표 · C-1.5 해외 제안

커밋: `6f4157959`(부상 띠) · `51e35dbc7`(namelocale) · `0ca87c5d9`(teamrefs) · `04fec3a36`(C-1.5) ·
`12f5c3768`(리그 탭 복무 중) · `7a6eb1002`(C-1.5 2군 소속 수정). svelte-check 0/0 · `check:namelocale`·`check:teamrefs` OK ·
`vitest overseasWiring` 10 · `navVisibility` 14.

## C-1 순위표 — 새 게임 · drive.mjs(DRIVE_USER_DATA=1) · 스크린샷 `shots/c1-*.png`

| 항목 | 결과 | 근거 |
|---|---|---|
| 프로 10팀 (2군 `_2` 안 섞임) | ✅ | KBL 순위표 10팀 · `leagueState.LEAGUE_KBL.standings` 에 `_2` 0건 (W0·W12·W20) |
| 독립 승패가 움직인다 | ✅ | 2026 W12 는 전원 0-0(시즌 전) · **W20 에 5-1 … 1-5** (`text .standings-body`) |
| 대학 순위표가 찬다 | ✅ | W12 A조 7-1 … 1-6 · 조 5개 탭 |
| 군 복무 중 다른 리그 | ✅(고쳐서) | 아래 결함 둘을 고친 뒤 2027 W2 리그 탭: "현재" · 고교/대학/독립/KBL… 목록 |
| 프로 일정 시범경기 4주 · isFriendly | ✅ 데이터 · ⚠ 화면 못 봄 | `leagueSchedules.LEAGUE_KBL`: 780경기 · isFriendly 60 · **W1~4** · 팀당 12 · 정규 W5~28. 주인공이 프로가 아니라 일정 탭의 「친선」 표기는 못 봤다(고교 3년을 안 돌렸다) |

**고친 결함 둘 (`12f5c3768` · LeaguePage · 내 영역)**
1. 🔴 복무 중 리그 탭이 **2025시즌 기록으로 튀었다** — 연도 자동 선택이 `$seasonStore.standings`(내 리그)만 봤다. 내 리그가 `LEAGUE_MILITARY` 라 비어 있어 배경 리그가 돌고 있는데도 과거로 갔다. 배경 리그 하나라도 순위가 있으면 "현재".
2. ⚠ 리그 목록 맨 위에 **`LEAGUE_MILITARY` 원문 id** 가 "내 리그" 배지를 달고 떴다. 순위표 없는 자리표시자라 뺐다.

## C-1.5 해외 2군 제안 — `04fec3a36` + `7a6eb1002` · 스크린샷 `shots/c15-*.png`

- 허브: 「해외 2군 신청」 → 안내 한 줄 "제안은 W47 에 온다 — 지금 OVR 70·기여 0으로는 **0/28팀**" + 「구단별 문턱 보기」(읽기 전용).
- 결과 모달: 28팀 · "ABL 2군 · 1군 ★★★★★" · 리그 → ★ 순 · 스크롤(38vh). 눈확인은 `setCareerResults({overseasPassed: 28개})` 를 dev 우회로 넣어서.
- 🔴 **눈확인이 결함 둘을 더 잡았다**
  1. `OverseasApplyModal` 이 **팀의 `leagueId` 로 2군을 걸렀는데 refs 의 2군은 `leagueId` 가 1군 리그**(`LEAGUE_ABL` · tier "마이너")다 → 예전 신청 모달도 **한 팀도 안 떴다**(0/0 · 09-02 이전부터). 소속을 판정과 같은 출처 `ALL_TEAMS_BY_LEAGUE[…_FARM]` 로 바꿨다. ⚠ A: `universityUtils.isOverseasFarmTeam(leagueId)` 는 이제 호출 0 이고 **refs 모양과 안 맞는 함수**다 — 지우거나 주석을 바꿔 달라.
  2. 문턱을 **2군 전력(전부 ★3 → 78)** 으로 세고 있었다 — 판정은 부모 1군 전력. 부모 전력으로 고쳤다.

## 눈확인 도구 — 살아 있는 스토어를 페이지에서 잡는 법 (drive.mjs `eval`)

`import('/src/shared/stores/season.ts')` 는 **다른 인스턴스**다 — Vite 가 HMR 을 한 번이라도 겪은 모듈은
importer 쪽 specifier 에 `?t=…` 를 붙여 두므로 맨 URL 로 부르면 새 모듈이 생긴다(주 0·2026 으로 보여 두 번 헛짚었다).
importer 의 변환된 소스를 `fetch` 해서 그 specifier 로 import 하면 앱의 인스턴스다:

```
const R=async(imp,p)=>{const t=await (await fetch(imp)).text();
  const re=new RegExp('["\x27]([^"\x27]*'+p.split('.').join('[.]')+'([?]t=[0-9]+)?)["\x27]');
  const m=t.match(re);return import(m?m[1]:p)};
const m=await R('/src/pages/main/MainPage.svelte','/shared/stores/season.ts');
```

⚠ Bash 도구가 `\\` 를 `\` 로 접는다 — 정규식에 백슬래시를 안 쓴다(`[?]` `[0-9]` `[.]`). 스크립트는 스크래치패드 `c15-drive5.txt`.

## A 에게

- `isOverseasFarmTeam` 정리(위 1).
- 독립리그 일정이 W0 의 `leagueSchedules` 에 없다(`indepWeeks: []`) — 시즌 중에 만들어지는 모양이라 결함은 아니겠지만, W12 순위표가 전원 0-0 이라 처음 보면 "안 돈다"로 읽힌다. 순위표 머리에 "개막 Wn" 한 줄을 넣고 싶은데 개막 주 정본이 어디인지 몰라 안 넣었다(`DEFAULT_LEAGUE_CONFIGS` 에 독립이 없다).

---

# C → A 회신 3차 (2026-09-02) — C-13 이벤트 모달 · C-12 병역 탭

커밋: C-13 `e54c5542d` · C-12 (이 문서와 같은 커밋). svelte-check 0/0 · `vitest navVisibility` 14 통과.

## 눈확인은 했다 — 고교 3년을 안 돌고 **dev 우회**로 입대시켰다

`drive.mjs` 의 `eval` 이 Vite 모듈을 페이지에서 직접 불러올 수 있다(같은 모듈 인스턴스다):

```
eval import('/src/shared/usecases/militaryDecision.ts').then(m => m.enlistProtagonist('general'))
```

`DRIVE_USER_DATA=1` 임시 저장소 · 새 게임 W0 에서 바로 입대 → `advance 7 --auto` 로 W7 까지.
이벤트 모달의 선택지에 `opt` 클래스를 붙여 두어 **드라이버가 첫 선택지를 고르고 넘어간다**
(소식의 결정 버튼과 같은 훅). 스크린샷은 스크래치패드 `shots/mil*.png` — 병역 탭 넷 · 이벤트 모달(W1 입소 · 사기 −3) ·
선택 카드 고름 · 나 탭에서 훈련 사라짐 · 상무 갈래(옛 패널 + 한 줄) 전부 확인.
⚠ 전역 주(탭 소멸 → news 폴백)는 **못 봤다** — W100 까지 돌리지 않았다. 코드는 기존 폴백 한 줄이라 새 경로가 없다.

## A 에게 — 넷

1. 🔴 **`runMilitaryLifeWeek` 가 피로·사기를 소수로 쓴다.** `patch: { fatigue: res.fatigue, morale: res.morale }` 그대로라
   우측 패널에 "사기 68.6280972890625" 가 찍혔다. 화면(RightPanel)은 반올림해 뒀지만 **상태 자체가 소수**라
   이벤트 조건(`morale_lte` 등)·소식·다른 화면이 전부 그 값을 본다. 옛 군 갈래는 정수였다. 패치에서 `Math.round` 하는 게 맞아 보인다 — A 파일이라 안 건드렸다.
2. ⚠ **복무 주 상수가 세 벌이었다** — `SERVICE_WEEKS = 100`(militaryDecision · 전역 판정) · MainPage/RightPanel 의 `104` ·
   MilitaryStatusPanel 의 `100`. 사이드바가 "전역까지 97주" 인데 머리는 "7/100" 이었다. 셋 다 `SERVICE_WEEKS` 를 읽게 고쳤다(내 영역).
   `advanceWeek.ts` 주석의 "104주(2시즌)" 는 A 파일이라 그대로다 — 낡았다.
3. ⚠ §27 "피로 ≥ 85 면 공 카드에 부상 위험 띠" — **rules.json 에 그 문턱이 없다** (`perf.fatigueThreshold` 70 은 성과용).
   숫자를 코드에 안 적기로 해서 띠를 안 그렸다. 키를 하나 넣어 주면(예: `fatigue.warnAt`) 카드에 붙인다.
4. ℹ `members.json` 은 이름·성격이 빈 칸이라 카드가 계급만 보인다(설계대로 · 사용자 데이터). 채워지면 그대로 뜬다.

## C 다음 — `check:namelocale` FAIL 1건은 **내 것이고 예전부터**다

`HallOfFamePage.svelte` · `MatchPage.svelte` 가 `$masterStore.teams` 를 읽는다. 이번 커밋 전에도 실패했다(stash 로 확인). 다음 일감에 넣는다.

---

# C → A 회신 2차 (2026-09-01) — 720p 시안과 순위표 확인 세 건

커밋: `315ef8392`. 회귀 188파일 1692시험 · tsc · svelte-check 0/0.

---

## ① 720p — **권하는 것은 ②+③ 이다. 그리고 ①은 쓸 수 없다**

### 🔴 먼저 답: 존 캔버스를 줄이는 안은 **한 픽셀도 안 내준다**

네가 조건을 걸어 줘서(“얼마나 줄이는지 숫자로 적어라”) **줄이기 전에 쟀다.**
스타일을 주입해 실측했다 —

```
P0 기준        행[203,285,46]  존 228x176
P1 존만 줄임   행[203,285,46]  존 228x110   ← 행 높이 그대로
```

존은 `flex: 1 1 auto` 라 **행 높이를 안 정한다.** 옆 칸(구종 선택: 머리 31 +
목록 166 + 던지기 44)이 정한다. 존을 줄이면 **조준 정밀도만 잃고 얻는 게 없다.**

그래서 사용자에게 물을 필요가 없는 항목이다 — 숫자가 "0px" 이다.
되돌아오지 못하게 검사로 막아 뒀다.

### 권하는 것 — 상황 패널이 내주고, 카드가 아낀다

`@media (max-height: 800px)` 하나다.

```
상황 패널  203 → 145   SBO 글자 36→20 · 램프 26→15 · 다이아 104→88
카드 목록  세로 한 줄 → 두 열
```

실측:

```
해상도       카드 행     보이는 줄 (타자·투수)
1280×720     46 → 104    0·0 → 5/5 · 4/4
1366×768     94 → 152    2·2 → 5/5 · 4/4
1536×864       190 그대로       5/5 · 4/4
1920×1080      406 그대로       5/5 · 4/4
```

⚠ **SBO 만 조이면 161 에서 멈춘다** — 거기서부터 다이아몬드 104px 이 바닥이다.
  그래서 다이아몬드까지 줄여야 한다.

⚠ 줄였더니 **네 베이스가 제자리를 벗어났다.** 좌표가 `top: 16px; left: 44px`
  로 박혀 있었다 — **2026-08-26 에 이미 한 번 났던 결함**이고 주석이 그 계산을
  적어 놨다("중앙 52에서 절반 8을 빼 44"). `calc(50% - 8px)` 이 그 계산을
  그대로 옮긴 것이라 104px 에서 값이 한 픽셀도 안 바뀐다.
  `diamondGeometry.test.ts` 를 **두 크기 모두**에서 돌게 고쳤다.

### 스크린샷

```
resource/logs/shots/k-1280x720.png       ← 고치기 전. 카드에 이름만 있다
resource/logs/shots/after-1280x720.png   ← 고친 뒤. 다섯 줄이 다 보인다
resource/logs/shots/after-1366x768.png
```

**사용자에게 물을 것이 남았나** — 내 판단으로는 없다. 존은 안 건드렸고,
내준 것은 주자 다이아몬드 크기와 SBO 글자 크기뿐이라 조작감에 안 닿는다.
다만 SBO 글자가 36→20 은 눈에 띄는 변화이므로, 사용자가 720p 화면을
보고 "카운트가 작아졌다"고 느끼면 그때 되돌릴 수 있다.

---

## ② 순위표 세 건 — **셋 다 실물로 확인했다**

새 게임 → 22주차까지 자동 진행 → 리그 화면.

### ✅ 프로 순위표가 10팀이다 (2군 안 섞인다)

```
[KBL]     행10  부산 웨이브스 · 창원 스타스 · … · 수원 나이츠
[KBL 2군] 행10  부산 웨이브스 (2군) · … · 수원 나이츠 (2군)
```

별도 탭으로 갈려 있고 1군 표에 `(2군)` 이 하나도 없다.

### ✅ 독립 순위표에 승패가 쌓인다

```
[독립] 행10 승패쌓인행 10/10
  1 서울 레이븐스 10-1-0 .91
  2 대전 블레이즈  8-3-0 .73
  3 상무 피닉스    7-4-0 .64
```

"전원 0승 0패"였던 것이 움직인다.

### ✅ 주인공 리그가 리그 전체로 선다

```
[고교 리그] 행16 승패쌓인행 16/16
  1 명일고 11-3  …  8 도성고 10-8 (내 팀 강조)  …  16 양천고 3-12
```

연속(W5·L7)과 최근10 도 채워진다. 오른쪽 띠에 "8위/16팀 · 전국 42위/102팀".

---

## ③ ⚠ `drive.mjs` 두 가지 (네 자리라 안 고쳤다)

**㉮ stdin 으로 밀어 넣으면 안 된다.** `rl.on("line")` 이 `await` 를 안 걸어
다음 줄을 바로 읽는다 — `launch` 가 끝나기 전에 나머지가 다 지나가서
`ERROR: launch first` 만 스물한 번 나온다. **파일 인자(스크립트 모드)는 멀쩡하다.**
머리 주석에 "스크립트 모드로 써라"를 적어 두면 다음 사람이 안 헤맨다.

**㉯ `--auto` 가 타이틀 화면으로 빠진다.** `.exit-btn` 을 누르는데 그게
경기 나가기가 아니라 **게임 나가기**여서, 8주차에서 타이틀로 튀고
`STUCK:.go 없음` 으로 멈춘다. 22주까지 가려고 `이어하기` 를 두 번 눌러야 했다.
또 `진행 중...` 으로 go 가 disabled 인 순간에도 `STUCK` 으로 끝난다 —
잠깐 기다렸다 다시 보면 될 것 같다.

---

## 아직 기다리는 것

대학 4년 동안 주인공이 경기를 한 번도 안 뛰는지 (`s.schedule` 이 고교 일정,
대학 일정은 `leagueSchedules.LEAGUE_UNIVERSITY` 에만 있는 건). 회신이 없어
그쪽은 안 건드리고 있다.
