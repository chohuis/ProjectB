# OP → S 인계 (2026-09-03 · 서기 담당 첫 장)

> S 는 **문서·PDF·정리**를 맡는다 — 하루 정리(STATUS) · RESUME · 인계 문서 색인 · 사용자에게 보낼 PDF · 회신 결함 목록 정리. **코드·데이터·규칙 파일은 손대지 않는다.** `docs/PROGRESS_TREE.md` 는 OP 가 쓴다(S 는 읽기만 · 고칠 것이 있으면 OP 에 말한다).
> 워크트리 `C:\Users\cho\Desktop\ProjectB\ProjectB-docs\02.SvelteElectron` · 브랜치 `track/docs`. 커밋은 거기에만 · 끝나면 OP 에 해시. 트렁크는 `git merge extract-modals`(안 되면 파일 단위).

## §0 규칙
- 한국어 평서체 · 부제·대시(—) 설명 금지 · 숫자는 문서·커밋·로그에서 읽은 것만(새로 재지 않는다 · 재야 하면 D 에게).
- PDF 만드는 법(트렁크 워크트리에서 돌린다 · electron 바이너리 필요):
  ```
  node <scratch>/md2html.cjs docs/X.md <out>.html "제목"      # 스크립트가 없으면 docs/tools/md2html.cjs 로 하나 만들어 커밋
  env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/topdf.cjs <out>.html <out>.pdf
  ```
  파일 이름은 ASCII. 만든 PDF 경로를 OP 에 알리면 OP 가 사용자에게 보낸다.
- 문서 둘이 같은 사실을 적으면 한쪽만 고쳐진 채 남는다 — 정본을 하나 정하고 나머지는 링크로.

## §1 첫 일감 (순서대로)
1. **STATUS_2026-09-03_pm.md** — 오전 판(`STATUS_2026-09-03.md`)의 형식으로 오후(07:30~지금)를 정리: OP 체제 전환 · 출시 모델(v1.0.0 고정 → 1.0.1) · A①·A②·C①~③·C⑤a·B-11~21 닫힌 것 · 열린 결정(재회 이벤트 범위) · 사용자 결정 기록(계약 아홉 · 보직 열넷 · 대시보드 여섯+셋 · 첫 소식함 삭제 · 고교 105구) · 배운 것(워크트리 공유 사고 둘 · Opus 한도 · 신뢰 대화상자). 근거는 `git log --since="2026-09-03 07:30"` 과 PROGRESS_TREE.
2. **RESUME.md 머리 갱신** — "지금 상태" 표를 OP/A/B/C/D/S 여섯 줄로, 출시 모델 한 문단, 인계 문서 색인(HANDOFF_OP_TO_A/D/S · HANDOFF_B_TO_A · HANDOFF_C_TO_A).
3. **PDF 묶음** — 오늘 사용자에게 보낸 문서들의 최신판을 다시 만든다: PLAN_ROLE_RECOMMEND · PLAN_CONTRACT_TERMS · PLAN_MESSAGE_DASHBOARDS · MESSAGE_KINDS_DISPLAY · BALANCE_BACKLOG · STATUS pm. 경로를 보고.
4. 이후: OP 가 넘기는 회신 결함 목록 정리 · 문서 간 사실 불일치 찾기(예: 의무 휴식 "1~3일" vs 코드 0~5일 같은 것)를 표로.

## §2 보고 형식
만든 파일 · 커밋 해시 · 사용자에게 보낼 PDF 경로 · 발견한 불일치 목록.
