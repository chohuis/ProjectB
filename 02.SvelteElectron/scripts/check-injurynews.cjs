#!/usr/bin/env node
// 부상 소식이 **한 통으로 오는지** 본다.
//
//   npm run check:injurynews
//
// ⚠ **이 검사가 없어서 소식함이 부상 줄로 채워졌다** (2026-08-06):
//   부상 소식 — 임도훈 (중증)   UCL 부분 파열 / 회복 13주
//   부상 소식 — 안재완 (수술)   회전근개 완전 파열 / 회복 56주
//   …여섯 줄 연속
//
// 사람당 하나씩 보내고 있었다. 오프시즌 결산과 같은 결함이다.
//
// 여기서 못 박는 것:
//   ① 주간 처리는 **메시지를 안 만든다** — 버퍼에만 쌓는다
//   ② 월 1회 한 통. 커리어 단계를 안 가린다
//   ③ 사건에 이름이 없다 (화면이 npcId로 조회한다)
//   ④ 등급 표가 하나다 (화면이 다시 안 적는다)

const path = require("node:path");
const fs = require("node:fs");

const ROOT = process.cwd();
const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
function check(name, ok, detail) {
  if (ok) { log(`  ok  ${name}`); return; }
  failed++;
  log(`FAIL  ${name}`);
  if (detail) log(`        ${detail}`);
}

// ⚠ **줄바꿈을 정규화한다.** 이 저장소 파일은 전부 CRLF다. 안 하면 줄바꿈이
// 든 패턴이 하나도 안 맞아 **검사가 조용히 헛돈다** — 실제로 그렇게 시작해서
// 멀쩡한 코드에 FAIL이 떴다.
const read = (p) =>
  fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

// ── ① 주간 처리가 부상 메시지를 안 만든다 ────────────────────
{
  const src = read("apps/ui/src/shared/usecases/weekPhases/injuries.ts");
  // `addMessage`가 남아 있으면 사람당 한 통으로 되돌아간 것이다
  const calls = src.match(/gameStore\.addMessage\(/g) ?? [];
  check("주간 부상 처리가 메시지를 직접 안 만든다 — 버퍼에만 쌓는다",
        calls.length === 0, `addMessage ${calls.length}곳`);
  check("버퍼에 쌓는 자리가 둘이다 (부상 + 부상 은퇴)",
        (src.match(/pushInjuryNews\(/g) ?? []).length >= 2);
}

// ── ② 월 1회 한 통 ────────────────────────────────────────────
{
  const news = read("apps/ui/src/shared/usecases/weekPhases/injuryNews.ts");
  check("주기가 4주다", /INJURY_NEWS_PERIOD = 4/.test(news));

  const wk = read("apps/ui/src/shared/usecases/advanceWeek.ts");
  check("주 진행이 그 주기에 버퍼를 비운다",
        /isInjuryNewsWeek\(weekInYear\)/.test(wk) && /drainInjuryNews\(\)/.test(wk));

  // ⚠ **고교 분기 안에 넣으면 고교생이 부상 소식을 영영 못 받는다.**
  // 월간 순위표가 실제로 그렇다 — 비고교 분기 안에만 있다.
  // 들여쓰기 2칸(= 함수 최상위)이어야 두 분기 밖이다.
  const line = wk.split("\n").find((l) => l.includes("isInjuryNewsWeek(weekInYear)")) ?? "";
  const indent = line.length - line.trimStart().length;
  check("커리어 단계 분기 **밖**에 있다 — 고교생도 받는다",
        indent === 2, `들여쓰기 ${indent}칸 — 분기 안이다`);
}

// ── ③ 사건에 이름이 없다 ──────────────────────────────────────
{
  const rep = read("apps/ui/src/shared/utils/injuryReport.ts");
  const iface = rep.slice(rep.indexOf("export interface InjuryEvent"),
                          rep.indexOf("export type InjuryClass"));
  check("사건에 이름 필드가 없다 — 화면이 npcId로 조회한다",
        !/^\s*name\??:/m.test(iface), "이름 필드가 생겼다");
  check("사건에 npcId가 있다", /npcId: string/.test(iface));
}

// ── ④ 등급 표가 하나다 ────────────────────────────────────────
//
// ⚠ **정본이 둘이 되는 걸 막는다.** 화면이 등급을 다시 적으면 카드 숫자와
// 목록이 어긋난다 — 오프시즌에서 실제로 그랬다
// (활동 로그 "방출 1170" vs 화면 "방출 45").
{
  const rep = read("apps/ui/src/shared/utils/injuryReport.ts");
  const order = /CLASS_ORDER: readonly InjuryClass\[\] = \[([\s\S]*?)\]/.exec(rep)?.[1] ?? "";
  const kinds = [...order.matchAll(/"(\w+)"/g)].map((m) => m[1]);
  check(`등급이 심한 순서다 (${kinds.join(" → ")})`,
        kinds[0] === "retired" && kinds[1] === "surgery"
        && kinds[kinds.length - 1] === "short",
        kinds.join(","));

  const labels =
    /CLASS_LABEL: Record<InjuryClass, string> = \{([\s\S]*?)\n\};/.exec(rep)?.[1] ?? "";
  const labelled = [...labels.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
  check("모든 등급에 라벨이 있다",
        kinds.length > 0 && kinds.every((k) => labelled.includes(k)),
        `라벨 없음: ${kinds.filter((k) => !labelled.includes(k)).join(",")}`);

  const panel = read("apps/ui/src/features/messages/ui/InjuryPanel.svelte");
  check("화면이 등급 표를 다시 적지 않고 가져다 쓴다",
        /CLASS_ORDER, CLASS_LABEL/.test(panel) && !/retired:\s*"/.test(panel));
}

log(failed === 0 ? "\n  ok  전부 통과" : `\nFAIL  ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
