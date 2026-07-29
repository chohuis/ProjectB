- 파일 먼저 읽고 완성된 솔루션 작성
- 불필요한 설명 없이 코드만
- 한 번에 테스트

## 작업 대상 (2026-07-29 확정)

**개발은 `02.SvelteElectron/` 하나뿐이다.** 설계 정본은 `02.SvelteElectron/DESIGN.md`, 코드 규칙은
`02.SvelteElectron/CLAUDE.md`.

| 폴더 | 성격 |
|---|---|
| `02.SvelteElectron/` | **유일한 개발 대상** (Svelte + Electron + Rust DLL) |
| `03.OnePitch/` | **중단됨 — 문서만 보관.** 코드 제거 완료. 기획 통합의 대조 입력으로만 읽는다 |
| `00.OneF/` · `03.App/` · `_archive/` | 아카이브. 수정하지 않는다 |
| `docs/` | 02.SvelteElectron 관련 문서 |

- `03.OnePitch/`의 설계 문서를 근거로 **새 코드를 작성하지 않는다.** 그쪽 스택(Flutter + Rust frb)은 폐기됐다.
- `03.OnePitch/03_설계/12_구현확정_결정요약.md`이 그 프로젝트에서 살릴 결정의 단일 창구다.
