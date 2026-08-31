# 병역 — 코드에서 뽑은 명세 (2026-08-24)

⚠ **코드가 정본이다.** 이 문서는 코드를 읽어 적은 것이고, 어긋나면 코드가 맞다.
  반대로 하면 또 틀린 문서가 생긴다 — 이 프로젝트에서 문서 숫자가 여러 번 틀렸다.

## 상태 넷

`ProtagonistSave.militaryStatus` · `npc.military_status`

| 값 | 뜻 |
|---|---|
| `미필` | 아직 안 갔다. 기본값 |
| `현역` | 복무 중 (`enlist` 직후) |
| `군필` | 마쳤다 (`discharge` 직후) |
| `면제` | 국제대회 성적으로 면제 (`game.ts:1920`) |

⚠ **면제는 되돌리지 않는다.** 이미 `군필`·`현역`인 사람은 안 건드리고
  `미필`만 `면제`로 바꾼다. 주인공도 같은 경로다.

## 갈래 둘

| | `sports` (상무) | `general` (현역병) |
|---|---|---|
| 소속 | `TEAM_IND_SANGMU_PHOENIX` · `LEAGUE_INDEPENDENT` | `LEAGUE_MILITARY` · 팀 없음 |
| 경기 | **뛴다** — 독립리그에서 성적이 쌓인다 | 안 뛴다 |
| 정원 | 26명 (`militaryRules.rosterSize`) | 없다 |
| 나이 | **20~29세** (`ageMin`/`ageMax`) | 프로 28세+ · 독립/대학 26세+ · KBL 조기 25~27 |

⚠ **상무 나이는 선발 후보 조건과 같은 범위다** (2026-08-31 · 사용자 확정).
  예전엔 생성만 20~24였고 선발은 20~29라, 세계 시작 26명만 유독 젊었다 —
  같은 팀에 기준이 둘이면 자기일관되지 않는다. `sangmuAge.test.ts` 가 두 값이
  갈리는 것을 잡는다.

⚠ **상무는 실제로 경기를 뛴다.** 그래서 로스터가 따로 생성되고
  원소속만 실재 프로/2군 팀으로 지정한다 — 원팀에서 빼내면 8포지션 백업 보장이 깨진다.

## 기간

    복무 24개월 = `enlistYear + 2` 시즌     (`militaryRules.serviceMonths`)

전역 판정은 Rust가 한다 — `npc_sim.rs:1622` 7번 단계가 `military_discharge_year`
도달을 본다. **TS는 그 결과를 읽기만 한다** (2026-08-24에 정본을 Rust로 통일).

## 계급 (상무만)

`militaryRules.ranks` — 복무 개월 수로 갈린다.

    ~2개월    이병
    ~8개월    일병
    ~14개월   상병
    그 뒤     병장

⚠ **왕복에 안 실으면 사라진다.** `militaryRank`가 정확히 그렇게 없어진 전례가 있다
  (`npcAdapter.ts` 주석).

## 주차 — 시즌 안 어디서 도는가

`utils/seasonWeeks.ts`

| 주 | 상수 | 무엇 |
|---|---|---|
| W46 | `SPORTS_UNIT_CANDIDATES_WEEK` | 상무 지원자 모집 |
| W47 | `MILITARY_AGE_WARNING_WEEK` | 나이 경고 |
| W50 | `MILITARY_RESULT_WEEK` | **입대 결과 발표** — 기본 입대 주차 |

⚠ **드래프트 신청도 이 자리다.** 독립리그 시즌 종료 메시지가
  "드래프트 신청, 독립리그 재계약, 군입대 중 진로를 선택할 수 있습니다.
  W47에 최종 결과가 발표됩니다"라고 적는다 (`advanceWeek.ts:1030`).

## 인원

    연간 입대 = 정원 / 복무연수 = 26 / 2 = **13명**
    한 구단 최대 = 3명 (`maxPerTeam`)

⚠ 예전엔 `game.ts`에 `maxTotal 20`이 박혀 있어 정상상태가 40명이었다 —
  정원의 1.5배다. 규칙 파일에서 유도하도록 고쳤다.

## 입대 → 전역 흐름

    enlist(unit, enlistWeek=W50, sportsUnitSelected, enlistYear)
      · `military_json`에 원소속을 저장한다 (originalLeagueId · originalTeamId)
      · `career_status = "military"` · 소속을 상무팀 또는 LEAGUE_MILITARY로
      · `military_status = "현역"`

    discharge(npcId, toTeamId?, toLeagueId?)
      · 원소속으로 돌린다 — `military_json`의 originalTeamId를 쓴다
      · 없으면 `LEAGUE_INDEPENDENT`로 (**소속 없는 현역을 만들지 않는다**)
      · `career_status = "active"` · `military_status = "군필"`

## 상무 선발 두 단계

`npc_sim.rs` — 2026-08-24에 고친 자리다.

    Phase 1   그해 공백이 생긴 포지션을 메운다
    Phase 2   남는 자리를 OVR 순으로 채운다

⚠ **Phase 1이 한 번도 안 돌았다.** 호출부가 `&[]`를 넘기고 있었다(`cc535d1fe`).
  켜자 **정원 4배 초과**가 딸려 나왔다 — 죽은 배선이 그 뒤의 결함을 숨긴 경우다.
⚠ 공백 계산에 **일반병 전역자가 섞이던 것**도 고쳤다(`05b72c752`, 43 → 13건).
  `militaryUnit === "sports"`만 상무 공백으로 센다.

## 아직 안 적힌 것

  · **나이 상한** — 언제까지 안 가면 강제되는가. 코드에서 못 찾았다
  · **면제 조건** — 국제대회 어떤 성적인지 (`game.ts:1920` 근처를 더 읽어야 한다)
  · 주인공 전용 흐름과 NPC 흐름이 완전히 같은지

⚠ 이 셋은 **확인하지 못했다.** 추측해서 적지 않는다.
