# Git Workflow

## 1) Branch Strategy
- 기본 브랜치: `main`
- 기능 브랜치: `feature/<topic>`
- 수정 브랜치: `fix/<topic>`
- 문서 브랜치: `docs/<topic>`

## 2) Commit Rules
- 한 커밋은 한 의도를 유지한다.
- 커밋 메시지 형식:
- `feat: ...`
- `fix: ...`
- `docs: ...`
- `refactor: ...`
- `chore: ...`

## 3) Approval Rules (Mandatory)
- 커밋은 사용자 요청 또는 명시적 승인 후에만 수행한다.
- 커밋 전에는 변경 범위와 대상 파일을 사용자에게 확인한다.
- 사용자가 승인하지 않으면 스테이징/커밋/푸시를 진행하지 않는다.

## 4) Review Rules
- PR에는 아래를 포함한다.
- 변경 목적
- 영향 범위(코드/데이터/문서)
- 테스트 결과
- 인코딩 영향 여부(한글 파일 포함 시 필수)

## 5) Protected Behavior
- `main`에 직접 대량 변경을 밀어넣지 않는다.
- 되돌리기 어려운 삭제/이동은 사전 확인 후 진행한다.

## 6) Done Criteria
- 코드/문서/데이터가 동기화되어야 한다.
- 빌드 또는 핵심 테스트가 통과해야 한다.
- 커밋 후 `git status`가 깨끗해야 한다.

## 7) Rule File Priority
- 규칙 관련 충돌이 있을 때는 기능 코드보다 규칙 문서 업데이트를 먼저 해결한다.
- 규칙 변경 커밋을 pull 한 뒤에만 다음 기능 작업을 시작한다.
