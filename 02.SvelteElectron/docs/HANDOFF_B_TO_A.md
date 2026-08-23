# B → A 인계 (2026-08-23)

> **트랙 B(이벤트·소식함)가 트렁크를 받았고, A가 트렁크로 병합할 차례다.**
> 절차 ④ — A가 `extract-modals`에 병합하고 전체 검사를 돌린다.
>
> B 브랜치: `track/events` (워크트리 `ProjectB-events`)
> 병합 커밋: `dc88446ed` — `extract-modals` 12커밋을 받았고 **충돌 없었다.**

---

## 1. 🔴 A가 확인해야 할 것 — B가 A 소유 파일을 건드렸다

트랙 문서상 B는 읽기 전용인 파일 셋을 **최소로** 고쳤다. **전부 삭제만이고
추가는 없다.** 반쪽만 지우면 `DEFAULT_ACHIEVEMENTS`에 존재하지 않는 업적
id가 남아 더 나빠져서 그렇게 했다.

| 파일 | 변경 | 왜 |
|---|---|---|
| `stores/game.ts` | 삭제 2곳 (배열 한 줄 · 죽은 갈래 3줄) | 업적 `ACH_SOCIAL_FIRST_KAKAO` 제거 |
| `usecases/advanceWeek.ts` | 주석 한 줄 | 주간 처리 목록의 "메신저" |
| `apps/desktop/ipc/db.cjs` | `CREATE TABLE` 컬럼 한 줄 | `kakao_first_contact` — 읽지도 쓰지도 않던 것 |

배경: 메신저(NPC 채팅·친밀도·아크 스크립트)는 **2026-06-01 `5687f0de1`에서
제거됐는데 데이터·업적·DB 컬럼이 남아 있었다.** 업적 "첫 카톡"은
`metricKey: kakaoFirstContact`를 계산하는 곳이 없어 **영원히 해금 불가**였다.

---

## 2. 🔴 `CLAUDE.md`가 틀렸다 — A가 고쳐야 한다

`02.SvelteElectron/CLAUDE.md`의 남은 결함 표에 아직 이렇게 적혀 있다:

> | 2 | 이벤트 로더 **0건** — `events.toml` 1,848줄 + 에디터 1,531줄이 미사용 | 로더가 없다 | 큼 |

**사실이 아니다.** 실측:

```
resource/data/master/events/   535건 (필수 105 · 조건부 258 · 랜덤 172)
로더   stores/master.ts  loadEventsFromManifest()      있다
호출   usecases/advanceWeek.ts  runEventEngine()       있다
```

`events.toml`은 03/04 시절 형식이라 런타임이 안 읽는 게 맞지만, **"로더 0건"이
아니다.** 이 줄 때문에 B가 세션 시작에 한 번 헛짚었다.

### 왜 그렇게 보였는지 — A도 걸릴 수 있는 함정

`_manifest.json`이 없으면 로더가 `events/rules/*.json`이라는 **19건짜리
스텁으로 조용히 폴백**하고 `console.warn` 한 줄만 남겼다. 콘텐츠의 **3.5%**로
게임이 그냥 돈다. B가 그 상태로 6시즌을 재고 오진했다.

**B가 이걸 throw로 바꿨다**(레거시 폴백 경로 20줄도 같이 삭제). 이제 매니페스트가
없으면 안 뜬다 — `npm run gen:manifest` 한 줄이면 된다. `dev:ui`·`build:ui`는
이미 그걸 먼저 돌린다.

⚠ **새 워크트리를 팔 때 세워야 할 것이 넷이다**(문서엔 `.node` 하나만 적혀 있었다):

```
npm install                     node_modules
npm run gen:manifest            _manifest.json
npm run build:packages          packages/{contracts,core}/dist
packages/engine-native/*.node   ← A가 빌드한 것을 복사
```

---

## 3. 🔴 A에게 넘기는 실측 — 결정성 잡음

`CLAUDE.md` 남은 결함 #1(Rust `thread_rng` 31곳)의 **피해를 이벤트 쪽에서
숫자로 쟀다.** A가 결정성을 고칠 때 근거로 쓸 수 있다.

같은 코드·같은 씨앗(20260803)·`--nodraft`(커리어 경로 고정)·6시즌 **3회**:

| | 1회 | 2회 | 3회 | 폭 |
|---|---:|---:|---:|---:|
| 주수 | 292 | 292 | 292 | **0** |
| 뜬 이벤트 종수 | 141 | 143 | 143 | ±2 |
| 밀린 건수 | 913 | 963 | 903 | **±60 (6%)** |
| 재발동 비율 | 53.8% | 52.2% | 51.9% | ±1.9%p |

**주차는 완전히 고정인데 이벤트 결과가 흔들린다.** 세계 생성은 결정적이지만
시즌 진행에 흔들림이 남아 있다는 기존 관측과 일치한다.

재현: `node scripts/measure-eventfunnel.cjs --nodraft --runs 3`

---

## 4. A에게 요청 — `package.json` 두 줄

B는 `package.json`을 못 고친다(트랙 규칙). 넣어 주면 좋겠다:

```json
"measure:eventfunnel":   "cross-env ELECTRON_RUN_AS_NODE=1 electron scripts/measure-eventfunnel.cjs",
"check:eventconditions": "node scripts/check-eventconditions.cjs",
```

⚠ `check:eventconditions`는 **급하지 않다** — 같은 검사가 이미 `npm test`에
들어 있다(`eventConditionShape.test.ts`). CLI는 편의용이다.

---

## 5. B가 이번에 한 것 — 요약

| 커밋 | 내용 |
|---|---|
| `27b84daf5` | 이벤트 깔때기 계측 신설 — 앞단(엔진)이 아무 데도 안 세어져 있었다 |
| `1d9752aeb` | 빈 규칙 둘 제거 — 292주 중 **37주**가 소식 0건으로 지나갔다 |
| `131b34aa8` | 두 띠로 고르기 + `once_per_stage_year` 수정 |
| `b1e72469a` | 메신저·아크 잔재 제거 |
| `bb7599565` | 조건 44곳 수정 + 로드 시점 검증 — **35종이 죽어 있었다** |
| `d2cf060bc` | 어휘 카탈로그(`EVENT_VOCABULARY.md`) + 부상 축 |
| `e1169b4c4` | 선택지 단위 조건 + 잡음 계측 |
| `f172ec7aa` | 띠 하나 더 — 끝내 못 뜬 7종 → 4종 |

핵심 성과 (전부 잡음 폭 밖):

```
빈메시지로 버려진 주    37 → 0
conditional 발동률   17.8% → 29.1%
뜬 이벤트 종수         105 → 140~150
끝내 못 뜬 규칙          7 → 4
```

### 결함의 공통 형태 — A 쪽에도 있을 수 있다

찾은 결함이 전부 한 부류였다: **데이터가 코드와 어긋나도 아무도 안 죽고
로그도 안 남는다.** 게임은 돌고 콘텐츠만 사라진다.

- `career_stage`에 `stage` 대신 `value` → 조건이 늘 false. **조용히**
- `once_per_stage_year`가 2학년부터 안 막힘 (`currentWeek`이 시즌마다 리셋). **조용히**
- 매니페스트 없으면 19건 스텁. **`warn` 한 줄**
- 업적 "첫 카톡"이 영원히 해금 불가. **조용히**

**같은 형태를 A 쪽에서도 의심해 볼 만하다** — 특히 데이터 파일을 캐스팅만 해서
넘기는 자리.

---

## 6. B가 남긴 판단 — 사용자 확정 대기

- **주당 상한 1 → n** — **밸런스 동결**이라 손 안 댔다. 고교 1학년 입학 서사
  3종(`WELCOME_DINNER`·`DORM_NIGHT`·`HOMESICK`)이 `week_lte 2~4`라는 같은
  좁은 창에서 다퉈 아직 못 뜬다. 순서로는 더 못 푼다
- **이월 큐** — **철회했다.** 회복 가능한 게 7종뿐이라 세이브 필드 추가와
  A 조율의 대가에 안 맞았다
- **콘텐츠** — 392종이 아직 조건조차 한 번 안 맞는다. 미사용 어휘 16종이 재료다
