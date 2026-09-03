# 생성물 전수 조사 (2026-09-04 · A)

> `_manifest.json` 이 낡아 이벤트 18종이 조용히 안 실리던 건을 크게 잡았으니
> **같은 형태가 더 없는지** 전수로 훑었다. 커밋 `6c33079e0` 뒤 후속.
>
> 🔴 **추측 안 했다 — 자리마다 지우고 다시 만들어 봤다.** 아래 「다시 생기나」
> 칸이 그 실측이다(`npm run pack` 은 D 몫이라 안 돌렸다 · 네이티브 빌드는 D 와
> 겹쳐서 안 돌렸다).

## 1. 표 — 산출물 여덟

| # | 산출물 | 만드는 자리 | build 사슬 | 다시 생기나 (실측) | 어긋남 검사 | 포장 |
|---|---|---|---|---|---|---|
| 1 | `resource/data/master/_manifest.json` | `gen:manifest` (node) | ✅ 맨 앞 + `build:ui` 안에도 | ✅ 지우고 `gen:manifest` → 21,599 B 재생성 | ✅ `eventManifest.test.ts`(폴더↔목록 양방향) | ✅ `resource/**` · 번들 사본도 |
| 2 | `resource/master.db` | `build:masterdb` (electron) | ✅ | ✅ 없던 것이 생김 (28,672 B) | ⚠ 없음 — 없으면 `masterDb = null` 로 **조용히** 지나간다 | ✅ |
| 3 | `packages/{contracts,core}/dist` | `build:packages` (tsc) | ✅ | ✅ 지우고 재생성 | ⚠ 없음 (tsc 가 실패하면 사슬이 멈춘다) | ✅ `packages/*/dist/**` |
| 4 | `dist/ui` (화면 번들) | `build:ui` (vite) | ✅ | ✅ 지우고 7.75s 재생성 | ⚠ 없음 | ✅ |
| 5 | `packages/engine-native/*.node` | `build:native` ← **`prebuild`** | ✅ npm 이 자동으로 부른다 | ⏸ 안 돌렸다 (D 와 겹친다) | ⚠ **낡음을 아무도 안 본다** — Rust 를 고치고 안 빌드하면 옛 `.node` 로 돈다(09-04 D 덤프가 그 사례) | ✅ |
| 6 | `resource/data/master/entities/players/**` (+ `_index.json`) | `npm run deploy` (`deploy-staging.mjs`) | ❌ 안 걸린다 | — | — | ❌ 포장 제외 |
| 7 | `apps/ui/src/shared/utils/leagueTeams.generated.ts` | `scripts/build_refs_from_seeds.py` | ❌ (커밋된 생성물) | ❌ 파이썬이 없어 못 만든다 | ✅ **새로 걸었다** — `refs.json` 과 팀 id 대조 (대회 주차는 `tournamentWeeks.test.ts` 가 CSV 와) | 소스라 번들에 포함 |
| 8 | `release/` | electron-builder | `pack` | — (D 몫) | — | 산출물 자체 |

## 2. 🔴 이번에 나온 것 — 포장이 새고 있었다

**`vite.config.ts` 가 `publicDir: resource/` 라 `resource/` 를 통째로
`dist/ui/` 에 복사한다.** 그런데 포장 목록은 `dist/ui/**` 를 통째로 넣는다 —
그래서 `!resource/…` 로 뺀 것이 **번들 사본으로 그대로 들어갔다.**

실측 (`npm run build:ui` 직후 · 40 MB):

```
  dist/ui/park           31 MB   ← 경기장 그림. 게임이 쓴다 ✅
  dist/ui/logs          4.7 MB   ← 계측 덤프(career-study-s0~5 …). 런타임 참조 0
  dist/ui/data/master   2.8 MB   ← 마스터 데이터 ✅
  dist/ui/assets        1.6 MB
  dist/ui/data/seeds    217 KB   ← CSV 원본. 런타임 참조 0(주석·검사만)
  dist/ui/master.db      28 KB   ← 사본. main.cjs 는 `resource/master.db` 를 연다
```

**포장 목록에 여덟 줄을 더했다** — `resource` 쪽 둘(`logs`·`seeds`)과
`dist/ui` 쪽 여섯(같은 것들 + 이미 빼 둔 셋의 번들 사본).
`buildArtifacts.test.ts` 가 **뺄 자리는 언제나 둘**이라는 걸 못박는다.

## 3. 남은 위험 둘 — 값이 아니라 구조다

| 자리 | 무엇 | 왜 지금 안 고쳤나 |
|---|---|---|
| `.node` 낡음 | Rust 를 고치고 `build:native` 를 안 돌리면 **옛 엔진으로 돈다.** 09-04 에 D 덤프 셋(계약 상한 위반 57%·73%)이 그것 때문이었다 | 소스 해시를 `.node` 옆에 남기고 검사가 대조하는 방식이 맞다 — 빌드 산출물을 건드리는 변경이라 D 와 겹친다. **D 가 pack 을 끝낸 뒤** |
| `master.db` 없음 | 없으면 `masterDb = null` 이고 `master:loadEntities` 가 `[]` 를 준다. **지금은 그게 정상**이다(Phase 6A 이후 `npc_master` 는 빈 표) — 그래서 「없다」와 「빌드가 빠졌다」가 같아 보인다 | 정말로 안 쓰는 표라면 `build:masterdb` 자체를 접는 게 맞다. **접을지 말지는 사용자 결정** |

⚠ `gen-manifest` 가 「`npm run migrate:entities` 미실행」이라고 찍고 있었는데
**그런 스크립트가 없다.** 없는 명령을 가리키는 안내라 문구를 고쳤다(#6).
