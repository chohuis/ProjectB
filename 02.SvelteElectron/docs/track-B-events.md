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
