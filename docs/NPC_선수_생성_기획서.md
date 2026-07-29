# NPC 선수 생성 기획서
## KBL · ABL · 독립리그 · 대학리그

---

## 1. 현재 현황

### 고교 리그 (기준 모델)

`people_hs.json` (407KB) 기준으로 고교 리그는 완성되어 있음.

| 항목 | 내용 |
|---|---|
| 팀 수 | 8팀 |
| 선수 | 160명 (팀당 20명) |
| 코치 | 16명 (팀당 2명) |
| 감독 | 8명 (팀당 1명) |
| **총 인원** | **184명** |

### 다른 리그 현황

| 파일 | 상태 |
|---|---|
| `people_kbl.json` | 파일 있음, 비어있음 (`entities: []`) |
| `people_abl.json` | 파일 있음, 비어있음 (`entities: []`) |
| `people_univ.json` | 파일 없음 (신규 생성 필요) |
| `people_ind.json` | 파일 없음 (신규 생성 필요) |

---

## 2. ID 네이밍 규칙

고교 리그 패턴 기준:

```
[역할코드]_[리그코드]_[팀번호]_[일련번호]

역할코드: PLY(선수), COA(코치), MNG(감독), OWN(오너)
리그코드: HS(고교), UNIV(대학), IND(독립), KBL(KBL), ABL(ABL)
팀번호:   01 ~ 팀 수 (해당 리그 내 순서)
일련번호: 001 ~
```

예시:
- `PLY_KBL_01_001` — KBL 1번 팀(기아) 1번 선수
- `COA_UNIV_03_001` — 대학 3번 팀(연세대) 1번 코치
- `MNG_IND_02_001` — 독립 2번 팀(부산 템페스트) 감독

---

## 3. JSON 구조 (EntityRow 기준)

모든 파일은 아래 구조를 따름. 역할(role)에 관계없이 `details` 블록 전체 포함.

```json
{
  "id": "PLY_KBL_01_001",
  "name": "홍길동",
  "nameEn": "Hong Gil-dong",
  "role": "player",
  "age": 25,
  "status": "active",
  "originLeagueId": "LEAGUE_KBL",
  "leagueId": "LEAGUE_KBL",
  "clubId": "CLUB_KBL_KIA",
  "teamId": "TEAM_KBL_KIA_1",
  "schoolId": "SCHOOL_NONE",
  "grade": null,
  "notes": "",
  "details": {
    "player": {
      "playerType": "pitcher",
      "handedness": "R",
      "position": "SP",
      "jerseyNumber": 11,
      "pitching": {
        "ovr": 78,
        "stamina": 75,
        "velocity": 82,
        "command": 76,
        "control": 74,
        "movement": 70,
        "mentality": 78,
        "recovery": 72
      },
      "batting": {
        "ovr": 30,
        "contact": 30, "power": 28, "eye": 32,
        "discipline": 30, "speed": 35, "fielding": 28,
        "arm": 30, "battingClutch": 25
      },
      "developmentRate": 55,
      "potentialHidden": 82
    },
    "coach": {
      "specialty": "-", "experienceYears": 0,
      "stats": { "teaching": 50, "analysis": 50, "communication": 50, "discipline": 50, "leadership": 50 },
      "trainingBuffs": ""
    },
    "manager": {
      "style": "균형", "experienceYears": 0,
      "stats": { "tactics": 50, "decision": 50, "rotationMgmt": 50, "bullpenMgmt": 50, "moraleMgmt": 50 },
      "gamePlanBias": "", "riskTolerance": 50
    },
    "owner": {
      "ownershipStyle": "안정 운영", "tenureYears": 0,
      "stats": { "budgetSupport": 50, "patience": 50, "prInfluence": 50, "facilityInvestment": 50, "staffTrust": 50 },
      "budgetPolicy": "", "hiringPolicy": ""
    }
  }
}
```

> **주의:** `details` 안에 player/coach/manager/owner 블록이 항상 모두 있어야 함. 역할에 해당하지 않는 블록은 기본값(50) 그대로 둠.

---

## 4. OVR 및 능력치 범위

### 리그별 전체 OVR 범위

| 리그 | OVR 최소 | OVR 최대 | 나이 범위 | 비고 |
|---|---|---|---|---|
| 고교 (참고용) | 45 | 70 | 16–18 | 완료 |
| 대학 | 52 | 76 | 19–22 | |
| 독립 | 50 | 74 | 19–30 | 잠재력 다양 |
| KBL 2군 | 58 | 78 | 19–32 | |
| KBL 1군 | 68 | 90 | 21–38 | |
| ABL AAA | 65 | 85 | 21–35 | |
| ABL MLB | 72 | 94 | 22–42 | |

### 잠재력 범위

| 리그 | 잠재력 최소 | 잠재력 최대 |
|---|---|---|
| 대학 | 58 | 92 |
| 독립 | 54 | 86 |
| KBL | 56 | 90 |
| ABL | 58 | 92 |

### developmentRate 범위

| 리그 | 범위 | 설명 |
|---|---|---|
| 대학 | 45–65 | 성장 여력 있음 |
| 독립 | 40–58 | 한계에 근접한 선수 많음 |
| KBL 2군 | 42–60 | |
| KBL 1군 | 35–55 | 성장 거의 완료 |
| ABL | 30–52 | 최정점 또는 하락기 |

---

## 5. 포지션별 능력치 가이드

### 투수

| 포지션 | 핵심 능력치 (높게) | 부수 능력치 (중간) | 낮아도 되는 능력치 |
|---|---|---|---|
| SP (선발) | velocity, stamina, command, movement | control, mentality, recovery | - |
| RP (중계) | velocity, command, mentality | control, movement, recovery | stamina |
| CP (마무리) | velocity, command, mentality, control | movement | stamina |

### 타자

| 포지션 | 핵심 능력치 (높게) | 부수 (중간) | 낮아도 되는 |
|---|---|---|---|
| C (포수) | arm, fielding | contact, eye, discipline | power, speed |
| 1B | power, contact | eye, discipline | speed, arm |
| 2B / SS | speed, fielding | contact, eye, arm | power |
| 3B | power, arm | fielding, contact | speed |
| LF / RF | power, contact | speed | fielding, arm |
| CF | speed, fielding | contact, eye | power |
| DH | power, contact, eye | discipline | speed, fielding, arm |

---

## 6. 팀 구성원 설계

### 대학 리그 (LEAGUE_UNIVERSITY)

**팀당 구성:** 선수 20명 + 코치 2명 + 감독 1명 = **23명**

| 팀 번호 | teamId | 팀 이름 (한글) | schoolId |
|---|---|---|---|
| 01 | TEAM_UNIV_KNSU | 국민대학교 | SCHOOL_UNIV_KNSU |
| 02 | TEAM_UNIV_KNU | 경북대학교 | SCHOOL_UNIV_KNU |
| 03 | TEAM_UNIV_YONSEI | 연세대학교 | SCHOOL_UNIV_YONSEI |
| 04 | TEAM_UNIV_KOREA | 고려대학교 | SCHOOL_UNIV_KOREA |
| 05 | TEAM_UNIV_HANYANG | 한양대학교 | SCHOOL_UNIV_HANYANG |
| 06 | TEAM_UNIV_CHUNGBUK | 충북대학교 | SCHOOL_UNIV_CHUNGBUK |
| 07 | TEAM_UNIV_DONGGUK | 동국대학교 | SCHOOL_UNIV_DONGGUK |

**총 인원: 7팀 × 23명 = 161명**

선수 포지션 배분 (팀당 20명):
- SP 4명, RP 4명, CP 2명
- C 2명, 1B 1명, 2B 1명, 3B 1명, SS 1명, LF 1명, CF 1명, RF 1명, DH 1명

선수 grade 배분 (대학 4년):
- 1학년 5명, 2학년 5명, 3학년 5명, 4학년 5명

---

### 독립 리그 (LEAGUE_INDEPENDENT)

**팀당 구성:** 선수 20명 + 코치 2명 + 감독 1명 = **23명**

| 팀 번호 | teamId | 팀 이름 |
|---|---|---|
| 01 | TEAM_IND_SEOUL_PIONEERS | 서울 파이어니어스 |
| 02 | TEAM_IND_BUSAN_TEMPEST | 부산 템페스트 |
| 03 | TEAM_IND_DAEGU_FALCONS | 대구 팔콘스 |
| 04 | TEAM_IND_GWANGJU_STORM | 광주 스톰 |
| 05 | TEAM_IND_DAEJEON_HUNTERS | 대전 헌터스 |
| 06 | TEAM_IND_INCHEON_ORCAS | 인천 오르카스 |
| 07 | TEAM_IND_SUWON_BLAZE | 수원 블레이즈 |
| 08 | TEAM_IND_ULSAN_PHOENIX | 울산 피닉스 |

**총 인원: 8팀 × 23명 = 184명**

독립 리그 선수 특성:
- 나이 분포가 넓음 (19–30세)
- OVR 중·하위권이지만 잠재력 높은 선수도 포함
- 고교/대학을 거치지 못한 선수, 재기를 노리는 선수 혼재

---

### KBL (LEAGUE_KBL)

**1군 팀당 구성:** 선수 25명 + 코치 3명 + 감독 1명 + 오너 1명 = **30명**
**2군 팀당 구성:** 선수 20명 + 코치 2명 + 감독 1명 = **23명**

| 클럽 번호 | clubId | 클럽 이름 | 1군 teamId | 2군 teamId |
|---|---|---|---|---|
| 01 | CLUB_KBL_KIA | 기아 타이거즈 | TEAM_KBL_KIA_1 | TEAM_KBL_KIA_2 |
| 02 | CLUB_KBL_SAMSUNG | 삼성 라이온즈 | TEAM_KBL_SAMSUNG_1 | TEAM_KBL_SAMSUNG_2 |
| 03 | CLUB_KBL_LG | LG 트윈스 | TEAM_KBL_LG_1 | TEAM_KBL_LG_2 |
| 04 | CLUB_KBL_DOOSAN | 두산 베어스 | TEAM_KBL_DOOSAN_1 | TEAM_KBL_DOOSAN_2 |
| 05 | CLUB_KBL_KT | KT 위즈 | TEAM_KBL_KT_1 | TEAM_KBL_KT_2 |
| 06 | CLUB_KBL_SSG | SSG 랜더스 | TEAM_KBL_SSG_1 | TEAM_KBL_SSG_2 |
| 07 | CLUB_KBL_LOTTE | 롯데 자이언츠 | TEAM_KBL_LOTTE_1 | TEAM_KBL_LOTTE_2 |
| 08 | CLUB_KBL_HANWHA | 한화 이글스 | TEAM_KBL_HANWHA_1 | TEAM_KBL_HANWHA_2 |
| 09 | CLUB_KBL_NC | NC 다이노스 | TEAM_KBL_NC_1 | TEAM_KBL_NC_2 |
| 10 | CLUB_KBL_KIWOOM | 키움 히어로즈 | TEAM_KBL_KIWOOM_1 | TEAM_KBL_KIWOOM_2 |

**총 인원: 10클럽 × (30 + 23) = 530명**

1군 선수 포지션 배분 (팀당 25명):
- SP 5명, RP 6명, CP 2명
- C 2명, 1B 1명, 2B 1명, 3B 1명, SS 1명, LF 1명, CF 1명, RF 1명, DH 2명, 유틸 1명

1군 오너(owner) 필드:
- `ownershipStyle`: 각 구단 성격에 맞게 (공격 투자 / 안정 운영 / 성적 우선 / 유망주 중심)
- `stats.budgetSupport`: 구단별 자금력 반영 (60–90)

---

### ABL (LEAGUE_ABL)

**MLB 팀당 구성:** 선수 25명 + 코치 3명 + 감독 1명 = **29명**
**AAA 팀당 구성:** 선수 20명 + 코치 2명 + 감독 1명 = **23명**

30개 구단 × MLB + AAA 구성. 분량이 매우 많으므로 **우선순위 구단을 먼저 생성**.

**1차 생성 구단 (주인공 진출 가능성 높은 팀):**

| 클럽 번호 | clubId | 팀 이름 | MLB teamId | AAA teamId |
|---|---|---|---|---|
| 01 | CLUB_ABL_LAD | LA 다저스 | TEAM_ABL_LAD | TEAM_ABL_LAD_AAA |
| 02 | CLUB_ABL_NYY | 뉴욕 양키스 | TEAM_ABL_NYY | TEAM_ABL_NYY_AAA |
| 03 | CLUB_ABL_BOS | 보스턴 레드삭스 | TEAM_ABL_BOS | TEAM_ABL_BOS_AAA |
| 04 | CLUB_ABL_TOR | 토론토 블루제이스 | TEAM_ABL_TOR | TEAM_ABL_TOR_AAA |
| 05 | CLUB_ABL_SEA | 시애틀 매리너스 | TEAM_ABL_SEA | TEAM_ABL_SEA_AAA |

**1차 총 인원: 5구단 × (29 + 23) = 260명**

ABL 선수 특성:
- 이름은 영문 우선 (nameEn이 main, name은 한글 음차)
- 국적 다양 (미국, 도미니카, 일본, 한국 등) → notes 필드에 국적 기재
- ABL 선수의 pitching 능력치는 KBL 대비 전체적으로 5–10 높게

---

## 7. 파일 생성 목록 및 우선순위

| 우선순위 | 파일 | 리그 | 총 인원 | 상태 |
|---|---|---|---|---|
| 1 | `people_kbl.json` | KBL | 530명 | 비어있음 → 채워야 함 |
| 2 | `people_univ.json` | 대학 | 161명 | 파일 없음 → 신규 생성 |
| 3 | `people_ind.json` | 독립 | 184명 | 파일 없음 → 신규 생성 |
| 4 | `people_abl.json` | ABL (1차) | 260명 | 비어있음 → 우선 5구단 |

---

## 8. 파일 헤더 구조

```json
{
  "version": 1,
  "sourceLeague": "LEAGUE_KBL",
  "entities": [
    ...
  ]
}
```

- `sourceLeague`: 해당 리그 ID (LEAGUE_KBL / LEAGUE_UNIVERSITY / LEAGUE_INDEPENDENT / LEAGUE_ABL)
- `entities`: EntityRow 배열

---

## 9. 생성 시 주의사항

1. **id는 고유해야 함** — 같은 파일 내, 다른 파일 간 모두 중복 금지
2. **details 블록 4개 모두 포함** — player/coach/manager/owner 항상 전부 작성 (역할 무관)
3. **비역할 블록은 기본값 50** — 감독이면 manager 블록만 실제 값, 나머지는 50
4. **schoolId는 대학/고교만 실제 값** — KBL/ABL은 `"SCHOOL_NONE"` 사용
5. **grade는 대학만 사용** — 1/2/3/4, KBL/ABL은 `null`
6. **status는 기본 "active"** — 부상/은퇴 NPC는 추후 추가
7. **오너(owner)는 KBL만** — 대학/독립/ABL은 owner 생성 안 함 (role: "owner" 없음)
8. **코치 trainingBuffs** — 실제 효과 문자열 (예: `"구속 훈련 +2%"`, `"타격 훈련 +3%"`) 또는 빈 문자열

---

## 10. 선수 능력치 생성 예시

### KBL 1군 선발투수 (OVR 78 예시)

```json
"pitching": {
  "ovr": 78,
  "stamina": 76,
  "velocity": 83,
  "command": 77,
  "control": 75,
  "movement": 72,
  "mentality": 79,
  "recovery": 73
}
```

### KBL 1군 4번 타자 (OVR 80 예시)

```json
"batting": {
  "ovr": 80,
  "contact": 78,
  "power": 85,
  "eye": 74,
  "discipline": 72,
  "speed": 62,
  "fielding": 68,
  "arm": 70,
  "battingClutch": 80
}
```

### 대학 유망주 선발투수 (OVR 63 예시)

```json
"pitching": {
  "ovr": 63,
  "stamina": 60,
  "velocity": 68,
  "command": 62,
  "control": 60,
  "movement": 58,
  "mentality": 64,
  "recovery": 62
},
"developmentRate": 62,
"potentialHidden": 84
```

---

*작성일: 2026-04-29*
*대상 파일: people_kbl.json / people_univ.json / people_ind.json / people_abl.json*
