# 리그 축소/정합 고정안 (KBO 8팀, MLB 16팀)

## 1) 목적
- 문서 간 숫자 충돌(팀 수, 경기 수, 포스트시즌 구조)을 제거한다.
- `Stage_Rules`를 싱글 소스로 고정하고, `flows`는 설명/이벤트 중심으로 정리한다.
- KBO는 10 -> 8팀, MLB는 20 -> 16팀으로 축소한다.

## 2) 싱글 소스 원칙
- 리그 상수(팀 수, 경기 수, 포스트시즌, 제휴 규칙)는 `Stage_Rules`만 기준으로 사용한다.
- `flows` 문서는 수치 직접 선언 대신 `Stage_Rules` 참조 문구를 사용한다.
- 팀 문서의 `TBD`는 금지하고 최소 더미값을 강제한다.

## 3) 확정 리그 상수

### 3.1 KBO (8팀)
- 리그: 단일 리그 8팀
- 정규시즌: 팀당 112경기
- 포스트시즌: 4팀 진출 (준플옵 -> 플옵 -> 한국시리즈)
- 팀 분류: 1군/2군 유지

### 3.2 MLB (16팀)
- 리그: AL 8팀 + NL 8팀
- 정규시즌: 팀당 128경기
- 포스트시즌: 8팀 진출 (리그별 4팀, WC -> DS -> LCS -> WS)
- 마이너: AAA 16팀, AA 16팀 (MLB 팀당 1:1 제휴 유지)

## 4) 팀 축소안

### 4.1 KBO 유지 8팀
- `PKT_Busan_GiantWhales.txt`
- `PKT_Changwon_SteelDinos.txt`
- `PKT_Daegu_RoyalLions.txt`
- `PKT_Daejeon_SoaringEagles.txt`
- `PKT_Gwangju_EmberTigers.txt`
- `PKT_Incheon_SkyGulls.txt`
- `PKT_Seoul_BearGuardians.txt`
- `PKT_Seoul_TwinWolves.txt`

### 4.2 KBO 아카이브 후보 2팀
- `PKT_Seoul_PhoenixHeroes.txt`
- `PKT_Suwon_ArcFoxes.txt`

### 4.3 MLB 유지 16팀 (AL 8 / NL 8)
- AL 유지:
  - `PUT_Atlanta_PeachtreeFalcons.txt`
  - `PUT_Boston_HarborHawks.txt`
  - `PUT_Cleveland_LakeSpirits.txt`
  - `PUT_Dallas_LoneStars.txt`
  - `PUT_Detroit_MotorWolves.txt`
  - `PUT_Miami_WaveRiders.txt`
  - `PUT_NewYork_Empire.txt`
  - `PUT_Seattle_RainArrows.txt`
- NL 유지:
  - `PUT_Chicago_WindBears.txt`
  - `PUT_Denver_MountainPeaks.txt`
  - `PUT_Houston_SpaceComets.txt`
  - `PUT_LosAngeles_SunDragons.txt`
  - `PUT_Phoenix_DesertSerpents.txt`
  - `PUT_SanDiego_CoastalRays.txt`
  - `PUT_SanFrancisco_BaySeals.txt`
  - `PUT_StLouis_RiverCardinals.txt`

### 4.4 MLB 아카이브 후보 4팀
- AL:
  - `PUT_Baltimore_HarborCrows.txt`
  - `PUT_Kansas_PrairieKings.txt`
- NL:
  - `PUT_Minneapolis_NorthOwls.txt`
  - `PUT_Pittsburgh_SteelGuardians.txt`

## 5) 문서 반영 순서 (체크리스트)

### Phase A: 상수 고정
- `Stage_Rules/Pro_Korea.txt`에 8팀/112경기/PS4팀 반영
- `Stage_Rules/Pro_USA.txt`에 16팀/128경기/PS8팀 반영

### Phase B: 플로우 정합
- `flows/pro_kbo/pro_kbo_stage_flow.txt` 수치 직접 선언 제거
- `flows/pro_usa/pro_usa_stage_flow.txt`의 162/150/138 수치를 128 체계로 정리

### Phase C: 팀 데이터 정리
- 아카이브 후보 파일은 `archive` 폴더로 이동
- 유지 팀 문서의 `TBD` 항목은 더미값으로 모두 채움
- MLB 유지 16팀의 AAA/AA 제휴는 반드시 입력

### Phase D: 루프/일정
- `Stage_Rules/DailyLoops/*` 초안 문구를 경기일/비경기일/이동일로 구체화
- KBO/MLB 공통으로 이동일 피로 규칙을 추가

## 6) 정합 검증 규칙
- 동일 항목(팀 수, 경기 수, 포스트시즌)이 여러 문서에서 다르면 `Stage_Rules`를 우선한다.
- 릴리즈 전 `rg -n "162|150|138|140|110|100|TBD"`로 잔존 수치/미완 항목 검사.

## 7) 인코딩 안전 규칙
- 텍스트 파일은 UTF-8 고정.
- 콘솔에서 깨져 보이더라도 원본을 재저장하지 않는다.
- 문서 검증 시 `Get-Content -Encoding utf8`를 기준으로 확인한다.
