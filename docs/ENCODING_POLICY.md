# Encoding Policy

## 1) Baseline
- 저장소 텍스트 파일 인코딩은 `UTF-8`로 고정한다.
- 줄바꿈은 `.editorconfig` 기준(`CRLF`)을 따른다.

## 2) File I/O Rules
- Node/Electron 파일 읽기/쓰기는 항상 `utf8` 인자를 명시한다.
- JSON 직렬화 시 UTF-8을 유지하고 `ensure_ascii`류 강제 이스케이프를 사용하지 않는다.
- 한글 포함 파일은 저장 후 샘플 재열람으로 깨짐 여부를 확인한다.

## 3) Forbidden
- CP949/EUC-KR 신규 파일 생성 금지
- 편집기 기본 인코딩 자동 전환 허용 금지
- 콘솔 출력 깨짐을 파일 손상으로 오판하여 재저장 금지

## 4) Verification Checklist
- 파일 바이트가 UTF-8로 정상 디코딩되는가
- 앱 UI에서 한글 렌더링이 정상인가
- 로그 파일 저장 후 재로드 시 문자열이 동일한가

## 5) Electron/Svelte Notes
- IPC 페이로드는 문자열 인코딩 변환 없이 UTF-16(JS 내부) -> UTF-8(파일)로만 흐르게 유지한다.
- 폰트 fallback을 지정해 한글 글리프 누락을 방지한다.

