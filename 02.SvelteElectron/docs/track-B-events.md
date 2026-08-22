# 트랙 B — 이벤트·메신저

> **이 채팅이 처음 읽는 문서다.** 작업 폴더는 `ProjectB-events`(워크트리),
> 브랜치는 `track/events`.
> 다른 트랙(A+C+E, 로스터·경기·계측)은 `ProjectB` 폴더 `extract-modals`에서 돈다.

---

## 🔴 먼저 — 낡은 기록을 믿지 마라

`CLAUDE.md`에 **"이벤트 로더 0건 — `events.toml` 1,848줄 + 에디터 1,531줄이
미사용"**이 큰 결함으로 적혀 있다. **2026-08-22 실측에서 사실과 달랐다.**

```
resource/data/master/events/
  mandatory     105건
  conditional   260건
  random        172건        합계 537건
  + catalog.json · pools · rules · templates · calendars

로더   stores/master.ts  loadEventsFromManifest()      있다
호출   usecases/advanceWeek.ts:588  runEventEngine()   있다
```

`events.toml`(156건)은 **03/04 시절 형식이고 런타임이 안 읽는다.** 그 파일을
살리는 게 과제가 아니다 — 옮길지 버릴지는 따로 판단한다.

**진짜 미결은 이것이다** (`docs/RESUME_NEXT.md` "보고만 하고 안 고친 것"):

| 미결 | 기록된 증상 |
|---|---|
| 이야기 이벤트 **87% 유실** | 이벤트가 뜨지 못하고 버려짐 |
| 소식함 **200통 포화** | 고교 36주차에 이미 참 — 오래된 소식이 밀려남 |

**둘은 짝일 수 있다.** 떠도 소식함이 차서 밀려나면 유실로 보인다.
**87%가 지금도 맞는지부터 재라.** 그 숫자는 이주 전 기록이다.

---

## 🔴 실측 (2026-08-22) — 첫 작업 끝. 87%는 맞았고, **깔때기가 두 개였다**

씨앗 20260803 · 6시즌 · 292주 · 커리어 고교→독립.
계측: `scripts/measure-eventfunnel.cjs`(신설) + `measure:messagekinds`.

### ⚠ 먼저 — 워크트리를 새로 팠으면 **네 개를 세워라**

문서에 `.node` 하나만 적혀 있었는데 **실제로는 넷이다.** 안 세우고 재면
**다른 세계를 잰다** — 실제로 6시즌을 한 번 통째로 버렸다.

```
npm install                 node_modules
npm run gen:manifest        resource/data/master/_manifest.json
npm run build:packages      packages/{contracts,core}/dist
packages/engine-native/*.node   ← A가 빌드한 것을 복사 (직접 빌드 금지)
```

🔴 **`_manifest.json`이 없으면 이벤트가 537건이 아니라 19건으로 돈다.**
로더가 `events/rules/{mandatory,conditional,random}.json`(5·7·7건)이라는
**스텁으로 조용히 폴백**하고 `console.warn` 한 줄만 남긴다. 갓 판 워크트리에서
재면 콘텐츠의 **3.5%**를 보고 "이벤트가 안 뜬다"고 결론 내리게 된다 —
`CLAUDE.md`의 "이벤트 로더 0건"이 여기서 나왔을 공산이 크다.

### 손실은 짝이 아니라 **직렬 두 단**이다

문서는 "떠도 소식함이 차면 밀려나 유실로 보인다"고 짝을 의심했다. **아니다.**
독립적인 87%가 둘 겹쳐 있다.

| 단 | 통과 | 비율 |
|---|---|---|
| ① 엔진 — conditional 주당 1칸 | 1,977건 중 **250건** | **12.6%** |
| ② 소식함 — 상한 200 | 1,552건 중 **200건** | **12.9%** |

(둘 다 같은 실행이다 — ②의 1,552는 밀려남 1,352 + 보유 200. `measure:messagekinds`를
따로 돌린 272주 세계에서는 1,560 중 200으로 12.8%였다. **비율은 두 세계가 같다.**)

⚠ **상한 200을 올려도 ①에서 버려진 1,727건은 안 돌아온다.**

### 갈래별 (292주)

| 갈래 | 조건통과 | 정책차단 | 빈메시지 | 발동 | 발동/주 |
|---|---:|---:|---:|---:|---:|
| mandatory | 73 | 11 | 0 | 62 | 0.21 |
| conditional | 3,430 | 0 | **37** | 250 | 0.86 |
| random | 1,513(후보) | 0 | 0 | 200 | 0.68 |

random은 풀 롤 876회 중 200회 통과(22.8%)로 **설계값(18·22·26% 평균 22%)
그대로다 — 여긴 정상이다.** 손대지 마라.

### 도달률 — 몇 종이 화면에 닿나

| | 종수 |
|---|---:|
| 정의 | 537 |
| 이번 커리어에서 단계 조건상 **애초에 불가** | 264 (pro_kbl 171 · university 93) |
| **도달 가능** | **273** |
| 실제로 뜬 것 | **105 (38.5%)** |
| 도달 가능한데 **한 번도 안 뜬 것** | **168** |

⚠ 발동 512건이 105종에 몰려 있다. `EVT_COND_PEAK_FORM` 하나가 **83건(16%)**,
상위 10종이 절반이다. **같은 이야기를 반복해 뽑는다.**

### 🔴 결함 — 빈 메시지가 그 주 conditional 칸을 먹는다

`EVT_TRADE_RUMOR`(priority 640) · `EVT_TRADE_CONFIRMED`(650).

- 조건이 `week_gte 12` 하나뿐 → 12주차 뒤로 **항상** 후보
- `repeatable` · 쿨다운 4주
- `messageTemplateId` · `decisionTemplateId` **둘 다 null**

`eventEngine.ts` 주석은 "빈 메시지가 된다"까지 알고 있었다. **안 재본 건
그다음이다** — conditional은 주당 하나만 시도하므로, 이 둘이 뽑히면 그 주는
소식이 **0건**이다. 292주 중 **37주**가 그렇게 지나갔다(12.7%). 밀림 1·2위
(174 · 136회)도 이 둘이다.

### priority 분포가 아래를 굶긴다

conditional 260건이 45~900에 퍼져 있는데 **하위 50건이 45~90에 몰려 있다.**
600~800대 200여 건이 매주 앞자리를 차지하니 하위권은 사실상 도달 불가다.
밀림 상위는 `EVT_IND_*`(독립 리그 생활)와 `EVT_HS_Y1/Y2_*`(고교 1·2학년)이다 —
**단계 전용 이야기가 그 단계를 지나는 동안 못 뜬다.**

### ⓐ 적용 — 빈 규칙 둘을 뺐다 (2026-08-22)

`EVT_TRADE_RUMOR`·`EVT_TRADE_CONFIRMED`를 `conditional/`에서 지웠다.
**레거시 스텁 `events/rules/conditional.json`에도 같은 둘이 있었다**(7→5건) —
한쪽만 고치면 매니페스트가 없을 때 폴백 경로만 옛 상태로 돈다.

근거: `eventId`는 `pushPendingAction`의 중복 제거 키로만 쓰이고(`season.ts:460`)
규칙을 조회하지 않는다. 트레이드 통보는 `market.ts:570`·`TradeModal.svelte:52`가
제목·본문을 직접 들고 띄운다. **규칙 등록은 사족이었다.**

같은 씨앗·같은 292주 실측 전후:

| | 전 | 후 |
|---|---:|---:|
| 빈메시지로 버려진 주 | 37 | **0** |
| conditional 발동 | 250 | **280** |
| conditional 발동/주 | 0.86 | **0.96** |
| 통과분 대비 발동률 | 12.6% | **18.5%** |
| 뜬 종수 (도달 가능 대비) | 105/273 = 38.5% | **118/271 = 43.5%** |
| 도달 가능한데 안 뜬 종수 | 168 | **153** |

⚠ 발동률이 12.6→18.5로 뛴 건 37주 회수만이 아니다. **분모도 줄었다** —
그 둘이 12주차 뒤로 매주 후보였어서 조건통과가 3,430→2,958(−472 = 2규칙 ×
236주)로 정확히 빠졌다. 회수분은 발동 **+30건**이 정직한 값이다.

⚠ random 발동 200→183은 **잡음이다.** 규칙이 빠지면서 문장 뱅크 추첨이
난수 열을 밀어 하류가 통째로 달라진다. 풀 통과율 22.8%→20.9%로 둘 다
설계값 22% 언저리다 — 효과로 읽지 마라.

회귀: `apps/ui/src/shared/utils/__tests__/eventTemplateWiring.test.ts`.
인스턴스가 아니라 **부류**를 막는다 — 세 갈래와 레거시 스텁 전부에서
"규칙마다 `messageTemplateId`나 `decisionTemplateId`가 있다"를 못박는다.
되돌려서 실제로 빨개지는 것까지 확인했다.

### 아직 안 한 것 · 다음

1. **ⓐ만 했다.** ①의 주 원인(주당 1칸)은 그대로다 — 여전히 1,231건이 밀린다
2. 남은 후보 둘, **사용자 판단**
   - ⓑ conditional 주당 상한 1 → n (**밸런스 변경이다 — 동결 중**)
   - ⓒ priority 재배치 / 단계별 큐 분리
3. 밀림 상위가 ⓐ 전후로 안 바뀌었다: `EVT_IND_*`(독립 리그 생활) ·
   `EVT_HS_Y2_*`(고교 2학년). **단계 전용 이야기가 그 단계를 지나는 동안
   못 뜬다** — ⓒ가 가리키는 곳이다
4. ⚠ **계측 흔들림이 남아 있다.** 같은 씨앗이 272주·292주로 갈린 적이 있다
   (A 트랙이 추적 중). 위 전후 비교는 **둘 다 292주**라 비교 가능하다.
   비율은 믿고 절대건수는 3회 평균을 써라

### A 트랙에 요청

`package.json`에 한 줄. 그때까진 직접 부른다:

```
"measure:eventfunnel": "cross-env ELECTRON_RUN_AS_NODE=1 electron scripts/measure-eventfunnel.cjs"
```

---

## 소유 파일 — 여기만 고친다

```
resource/data/master/events/          537건 + catalog·pools·rules·templates
resource/data/seeds/onepitch/events.toml
apps/ui/src/shared/utils/eventEngine.ts · sentenceBank.ts
                        messageCategory.ts · relationMessages.ts
apps/ui/src/shared/usecases/weekPhases/events.ts · campusEvents.ts
apps/ui/src/shared/types/event.ts
apps/ui/src/features/messages/            소식 화면
apps/ui/src/pages/news/                   소식함
scripts/check-msgdup.cjs                  소식 id 검사
docs/track-B-events.md                    이 문서
```

## 읽기만 — 고치려면 A 트랙에 요청

```
apps/ui/src/shared/stores/game.ts          3,563줄 · addMessage는 호출만
apps/ui/src/shared/usecases/advanceWeek.ts 2,763줄 · 호출 지점은 이미 있다
packages/engine-native/                    Rust는 A 트랙 전용
resource/data/master/players/generation_rules.json   밸런스 수치
package.json                               명령 추가는 A에 요청
```

⚠ **`npm run build:native`를 돌리지 마라.** Rust는 A 트랙이 소유한다.
`.node`는 A가 빌드한 것을 복사해 쓴다(git이 무시하는 파일이라 안 따라온다).
A가 Rust를 고치면 다시 복사해야 한다 — 검사가 이상하면 **먼저 이걸 의심하라.**

---

## 🔴 소식 id 규칙 — 어기면 세이브가 안 열린다

`CLAUDE.md`가 경고하는 그 함정이다. 소식 목록이 `{#each sorted as msg (msg.id)}`로
id를 키로 잡아서, **중복이 하나만 생겨도 Svelte가 `each_key_duplicate`로 죽고
세이브가 아예 안 열린다** — 로드 화면에서 멈춘 채 단서가 없다.

```
msg-digest-w13               ✗ weekNum은 시즌마다 1로 리셋 → 해마다 겹친다
msg-digest-2027-w13          ○ 연도를 넣는다
msg-tour-open-TOUR_HS_X-2027 ○ 대상 ID + 연도
```

**커밋 전에 반드시 `npm run check:msgdup`을 돌린다.**

---

## 명령

```
검사   npm test                 63파일 685건 (전 트랙 공통)
       npm run check:msgdup     소식 id 충돌 — B는 이걸 반드시 돌린다
화면   DRIVE_USER_DATA=1 node scripts/drive.mjs <명령파일>
       ⚠ 사용자 세이브를 안 건드리려고 임시 저장소를 쓴다
```

⚠ **느린 명령은 배경 실행한다.**
⚠ **새 게임으로 확인한다** — 오염된 세이브가 없는 결함을 만든다.

---

## 이 저장소에서 되풀이되는 함정 — 남의 트랙에서 배운 것

1. 🔴 **고치기 전에 재현부터 확인한다.** "이벤트 로더 0건"처럼 **낡은 기록이
   그대로 남아 있다.** 문서를 근거로 고치지 말고 **먼저 재라.**
2. 🔴 **계측기부터 의심한다.** 2026-08-22 세션에서 계측기가 **여덟 번** 틀렸다.
   음성 결과("0건이다", "안 돈다")가 나오면 **계측이 그 갈래를 보고 있는지**부터
   확인한다. 층 경계(TS↔Rust, 스토어↔저장소 행, 래퍼 이름↔export 이름)에서 주로 났다.
3. 🔴 **같은 판정을 하는 자리를 먼저 센다**(`grep -c`). 한 경로만 고치고
   "됐다"고 읽은 게 여섯 번이다.
4. 🔴 **적용 전후를 잰다.** 검사가 통과해도 효과가 없을 수 있다.
5. ⚠ **계측이 아직 완전히 재현되지 않는다.** 세계 생성은 결정적이지만
   시즌 진행에 흔들림이 남아 있다(A 트랙이 추적 중). **작은 차이는 3회 평균을
   쓰고, 큰 차이(0 → 수십)만 한 번으로 믿는다.**

---

## 병합

```
① 작업 단위를 끝낸다
② 자기 브랜치에서 트렁크를 먼저 받는다   git merge extract-modals
   충돌은 여기서 푼다 — 자기 코드를 제일 잘 아는 사람이 푼다
③ A 트랙에 알린다
④ A가 트렁크로 병합하고 전체 검사를 돌린다
```

**작업 단위마다 병합한다.** `game.ts` 3,563줄 같은 파일이 많아 오래 갈라질수록
병합 비용이 급격히 는다.

---

## 첫 작업 제안

1. **87%를 다시 잰다** — 몇 건이 후보였고 몇 건이 떴는지. 계측이 없으면 만든다
   (`scripts/check-*.cjs`가 본보기다 — `headless.boot`로 게임 경로를 그대로 탄다)
2. 소식함 포화와의 관계를 가른다 — 안 뜬 것인가, 떴는데 밀려난 것인가
3. 그다음에 고칠 곳을 정한다

⚠ **1번을 건너뛰지 마라.** 87%는 이주 전(2026-08 이전) 기록이고, 그 뒤로
소식·깔때기·저장 경로가 크게 바뀌었다.
