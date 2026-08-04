#!/usr/bin/env node
// ── 신입생 자리 배정 (neededPositions) ────────────────────────────
//
// ⚠ **이걸 측정으로만 확인하느라 한 번에 10분씩 썼다.** 순수 함수인데
// 4시즌 세계 시뮬을 돌려서 결과를 봤고, 그 사이 두 번 반대로 틀렸다:
//
//   1차 — 백업 자리(전부 야수)로 남은 칸을 다 채워 **투수 비율이 15.8%**
//         (목표 45%)가 됐다. 그 부족이 대학·독립·드래프트를 타고 프로까지 갔다
//   2차 — 백업을 아예 빼니 이번엔 **포수가 사라졌다**(102팀 중 8~11팀).
//         `empty`는 자리가 0이 된 뒤에야 도는데, 백업이 그 전에 채우는 장치였다
//
// 여기서 직접 부르면 즉시 안다.
//
//   npm run test:neededpositions

const path = require("node:path");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");

const ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "needpos-"));
const out = path.join(tmp, "rosterEngine.cjs");
require("esbuild").buildSync({
  entryPoints: [path.join(ROOT, "apps/ui/src/shared/utils/rosterEngine.ts")],
  bundle: true, platform: "node", format: "cjs", target: "node18",
  outfile: out, logLevel: "warning",
});
const { neededPositions } = require(out);

let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
};
const isPit = (p) => p === "SP" || p === "RP" || p === "CP" || p === "P";
const team = (spec) => {
  const r = [];
  for (const [pos, n] of Object.entries(spec)) {
    for (let i = 0; i < n; i++) {
      r.push({ playerType: isPit(pos) ? "pitcher" : "batter", position: pos });
    }
  }
  return r;
};

console.log("\n── 신입생 자리 배정 ──────────────────────────────────────");

// 고교 한 학년 정원(10명) — 실제로 이 크기로 돈다
const HS_WANT = 10;

{
  // 정상 로스터 — 남는 칸이 비율을 지켜야 한다
  const roster = team({ SP: 6, RP: 4, C: 2, "1B": 2, "2B": 2, "3B": 2, SS: 2, LF: 2, CF: 2, RF: 2 });
  const np = neededPositions(roster, HS_WANT, 8, 9, 0.45);
  const pit = np.filter(isPit).length;
  check("남는 칸이 투수 비율(0.45)을 지킨다", pit >= 3 && pit <= 6, `${pit}/${np.length}`);
}
{
  // 포수가 1명뿐 — **0이 되기 전에** 채워야 한다
  const roster = team({ SP: 8, RP: 6, C: 1, "1B": 3, "2B": 3, "3B": 3, SS: 3, LF: 3, CF: 3, RF: 3 });
  const np = neededPositions(roster, HS_WANT, 8, 9, 0.45);
  check("포수가 1명이면 포수를 뽑는다", np.includes("C"), np.join(","));
}
{
  // 포수 0명 — 최우선
  const roster = team({ SP: 8, RP: 6, "1B": 3, "2B": 3, "3B": 3, SS: 3, LF: 3, CF: 3, RF: 3 });
  const np = neededPositions(roster, HS_WANT, 8, 9, 0.45);
  check("포수가 0명이면 맨 앞이다", np[0] === "C", np.join(","));
}
{
  // 야수가 타순에 못 미친다 — 투수 하한과 **둘 다** 모자라도 야수가 굶으면 안 된다
  const roster = team({ SP: 2, RP: 1, C: 1, "1B": 1, "2B": 1, SS: 1 });
  const np = neededPositions(roster, HS_WANT, 8, 9, 0.45);
  const bat = np.filter((p) => !isPit(p)).length;
  const pit = np.filter(isPit).length;
  check("둘 다 모자라면 둘 다 채운다", bat > 0 && pit > 0, `야수${bat}/투수${pit}`);
}
{
  // ⚠ 실측에서 이게 15.8%까지 떨어졌다 — 대량 표본으로 비율을 본다
  let pit = 0, tot = 0;
  for (let t = 0; t < 50; t++) {
    const roster = team({ SP: 6, RP: 4, C: 2, "1B": 2, "2B": 2, "3B": 2, SS: 2, LF: 2, CF: 2, RF: 2 });
    const np = neededPositions(roster, HS_WANT, 8, 9, 0.45);
    pit += np.filter(isPit).length; tot += np.length;
  }
  const r = pit / tot;
  check("대량 표본에서도 비율이 유지된다", r >= 0.35 && r <= 0.55, `${(r * 100).toFixed(1)}%`);
}
{
  const roster = team({ SP: 6, RP: 4, C: 2, "1B": 2, "2B": 2, "3B": 2, SS: 2, LF: 2, CF: 2, RF: 2 });
  const np = neededPositions(roster, HS_WANT, 8, 9, 0.45);
  check("요청 수를 넘지 않는다", np.length <= HS_WANT, `${np.length}`);
}
{
  // ⚠ **선발 비중이 생성(45%)과 같아야 한다.** 예전엔 `% 3 === 2`라 67%가
  // 선발이었고, 6시즌에 리그 선발이 57 → 112명(팀당 11명)이 됐다.
  // 로테이션은 5~6인데 두 배라 각자 짧게 던지고 **OVR–ERA 상관이
  // −0.61 → −0.19로 무너졌다.**
  let sp = 0, pit = 0;
  for (let t = 0; t < 50; t++) {
    const roster = team({ SP: 6, RP: 4, C: 2, "1B": 2, "2B": 2, "3B": 2, SS: 2, LF: 2, CF: 2, RF: 2 });
    const np = neededPositions(roster, HS_WANT, 8, 9, 0.45);
    sp += np.filter((p) => p === "SP").length;
    pit += np.filter(isPit).length;
  }
  const r = pit > 0 ? sp / pit : 0;
  check("투수 중 선발 비중이 생성과 같다", r >= 0.35 && r <= 0.55, `${(r * 100).toFixed(1)}%`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("");
console.log(failed === 0 ? "신입생 자리 배정 통과" : `신입생 자리 배정 실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
