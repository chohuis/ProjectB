# OP → D 인계 (2026-09-03 · 계측·빌드·회귀 담당 첫 장)

> D 는 **돌리고 재고 표로 만드는** 일을 맡는다 — 프로브·계측 스크립트 실행, 회귀 전량, pack→dist:steam→smoke, 기준선·백로그 표 채우기. **엔진·화면 코드는 고치지 않는다**(계측 스크립트·검사 스크립트·문서만). 판단이 필요한 결과(값이 이상하다 · 배선이 의심된다)는 OP 에 올리고 A 가 본다.
> 워크트리 `C:\Users\cho\Desktop\ProjectB\ProjectB-measure\02.SvelteElectron` · 브랜치 `track/measure`. 커밋은 거기에만 · 끝나면 OP 에 해시. 트렁크(`extract-modals`)는 `git merge extract-modals` 로 받는다(안 되면 OP 에 말한다 — 파일 단위 `git checkout extract-modals -- <path>` 로 받아도 된다).

## §0 규칙 (CLAUDE.md 전부 + 이것)
- electron 은 **앱 기준 1개**(D 몫 · A·C 가 하나씩 쓴다 · 앱 하나 = 프로세스 5개). `DRIVE_USER_DATA=1`. 프로브는 배경으로 걸고 로그 파일에 남긴다.
- 씨앗 셋(20260802 · 777 · 31337) · 각 3회 · **전후를 같은 씨앗으로**. 한 번에 하나만 움직인다.
- 숫자는 실측만. 추측이면 "추측". 계측기 자체를 먼저 의심한다(측정 결과가 0 이면 배선 누락부터 — `measure:draft` 상한 미배선 · `initSeason` 씨앗 유실 사례).
- `.node` 는 A 가 Rust 를 고쳐 트렁크에 올리면 OP 가 알린다 → `npm run build:native` 를 네 워크트리에서 돌리고 시각을 확인한다(다른 워크트리 것을 복사해도 된다).
- 정규식으로 검사하지 않는다 · 파일은 Write/Edit.

## §1 첫 일감 (순서대로)
1. **트렁크 회귀 전량** — 오늘 병합이 많았다(A①·A②·C①~③·C⑤a·B 데이터). `npm test`(vitest) · `cargo test`(packages/engine-native) · `npm run check:svelte` · `npm run check`(33종 · determinism 하나는 1.1 알려진 빨강) · `npm run test:events`. 결과를 표로(파일/건수/빨강 목록). 빨강이 있으면 **고치지 말고** 원인 파일·줄과 함께 OP 에 올린다.
2. **§6-1-5 고교 마무리 전후 실측(씨앗 3)** — `scripts/probe-hs-closer.cjs`(A 가 트렁크에 넣음 · `PB_CFG=base|limit|factor|gate` · `PB_ROLE_CHOICE=cp|sp`) 로 4단계 × 정책 2 × 씨앗 3 = 24판. 지표: 마무리 시즌 등판 수 · 선발 등판당 이닝·투구수 · 불펜 이닝 합 · 의무 휴식 재료 N. `docs/BALANCE_BACKLOG.md` §1 의 고교 세 줄에 실측을 채운다(HANDOFF_OP_TO_A §3 표를 씨앗 3 판으로).
3. **보직 추천 분포** — A 가 가중치 세 벌을 정해 트렁크에 올리면 `npm run measure:role` 을 돌려 "새 산식 추천" 표를 백로그 §1 첫 줄에 붙인다.
4. **전 경로 프로브 한 바퀴** — `PF_SEED=20260802 PF_YEARS=10 npm run probe:paths -- --path <pro|draft|univ|indie|mil>` 다섯 갈래(오늘 08:54 판은 C① 이전 번들) — 완주·예외·안 본 10행 표. 순차 실행(전자 1개).
5. 이후: OP 가 "pack" 을 시키면 `npm run pack` → `npm run dist:steam` → `npm run smoke:dist`(pack 전에 프로브를 내린다 · `.node` 잠금).

## §2 결과 보고 형식
표 하나 + 세 줄(바뀐 것 · 이상한 것 · 다음). 로그 원본 경로를 적는다. 백로그·기준선 문서에 적을 때는 커밋 해시와 씨앗·회차를 같이.

## §3 관련 문서
[BALANCE_BACKLOG.md](BALANCE_BACKLOG.md) · [BALANCE_BASELINE_2026-09-05.md](BALANCE_BASELINE_2026-09-05.md) · [HANDOFF_OP_TO_A.md](HANDOFF_OP_TO_A.md) §3 · [PROGRESS_TREE.md](PROGRESS_TREE.md) · `CLAUDE.md`(계측 함정 절)
