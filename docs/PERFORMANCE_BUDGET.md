# Performance & Storage Budget

## 1) PC App Size (Windows x64)
- Electron + Svelte 최소 구성: 설치 파일 약 `90~180MB`
- 실제 배포(아이콘/폰트/기본 데이터 포함): 약 `120~250MB`
- 대형 미디어(음성/영상) 추가 시: `300MB+` 가능

## 2) Runtime Memory Target
- 메인 메뉴/기본 화면: `300~500MB`
- 대용량 로그 뷰(가상 스크롤 적용): `500~900MB`
- 1GB 이상 지속 시 누수 점검 필수

## 3) Log Volume Estimate
- 일일 로그: 시즌당 `0.3~1MB`
- 경기 상세 로그(구질/존/결과 단위): 시즌당 `8~25MB`
- 20시즌 누적: 대략 `160~500MB` (압축 전)

## 4) Recommended Limits
- 자동 저장 슬롯: 최신 `10~20개` 순환 유지
- 로그 보관:
- 원본 상세 로그는 최근 `2~3시즌`만 즉시 접근
- 과거 로그는 월/시즌 단위 압축(`.gz` 등) 보관
- UI는 가상 스크롤 + 페이지네이션 적용

## 5) Data Format Strategy
- 실시간 기록: JSONL(append-friendly)
- 조회/필터: SQLite 인덱스 또는 집계 캐시
- 백업/내보내기: 시즌 단위 압축 아카이브

