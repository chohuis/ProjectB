#!/usr/bin/env node
// ── 경기 엔진 감사 ────────────────────────────────────────────────
//
// **게임 루프·스토어·IPC를 전부 걷어내고 엔진만 직접 부른다.**
//
// 왜 이렇게 하는가: 시즌을 굴려서 나온 숫자는 엔진·집계·파생계산이 뒤섞여
// 있어 어디가 틀렸는지 못 가른다. 실제로 이 프로젝트에서 "주인공 ERA 14.78"이
// 나왔을 때 그게 엔진인지 집계인지 파생인지 알 수가 없었다.
//
// 여기서는 **엔진이 만든 원시 사건만** 센다. 파생값(ERA·승패)은 일부러 안 본다.
//
// 두 모델을 나란히 본다 — 리그 720경기는 `npc_sim`, 주인공 경기는
// `match_engine`이 돌린다. 같은 야구를 하고 있어야 수상·승강·드래프트 평가가
// 성립한다.
//
//   npm run audit:engine
//   node scripts/audit-engine.cjs --games 200

const engine = require("../packages/engine-native");

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const GAMES = arg("games", 200);
const log = (s) => process.stdout.write(s + "\n");
const call = (fn, p) => JSON.parse(engine[fn](JSON.stringify(p)));

let failed = 0;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/** 현실 KBO 대비 판정 — 범위를 벗어나면 이름을 남긴다 */
function band(name, v, lo, hi, unit = "") {
  const ok = v >= lo && v <= hi;
  if (!ok) failed++;
  log(`  ${ok ? "ok  " : "FAIL"} ${name.padEnd(22)} ${String(v).padStart(7)}${unit}   (기대 ${lo}~${hi})`);
}

// ── 공통 선수 생성 ────────────────────────────────────────────────
// OVR을 능력치로 푸는 규칙은 로스터 생성기와 별개다. 감사에서는 **평균 선수**를
// 한 벌 만들어 두 엔진에 똑같이 넣는다 — 입력이 같아야 출력 차이가 모델 차이다.
const P = (id, ovr) => ({
  id, velocity: ovr, movement: ovr, command: ovr, control: ovr,
  stamina: 100, staminaCap: ovr,
});
const B = (id, ovr) => ({ id, contact: ovr, power: ovr, eye: ovr, discipline: ovr });

const lineup = (tag, ovr) => Array.from({ length: 9 }, (_, i) => B(`${tag}B${i}`, ovr));
const staff = (tag, ovr) => ({
  rotation: Array.from({ length: 5 }, (_, i) => P(`${tag}SP${i}`, ovr)),
  bullpen:  Array.from({ length: 6 }, (_, i) => P(`${tag}RP${i}`, ovr)),
  closer:   P(`${tag}CP`, ovr),
});

// ── ① NPC 경기 (npc_sim.rs) ──────────────────────────────────────
function auditNpcGames(ovr) {
  const H = staff("H", ovr), A = staff("A", ovr);
  let ip = 0, er = 0, h = 0, k = 0, bb = 0;
  let pa = 0, ab = 0, bh = 0, bbb = 0, bk = 0, hr = 0;
  let runs = 0, games = 0, outsMismatch = 0;

  for (let g = 0; g < GAMES; g++) {
    const res = call("simGameNative", {
      homeRotation: H.rotation, awayRotation: A.rotation,
      homeBullpen: H.bullpen, awayBullpen: A.bullpen,
      homeCloser: H.closer, awayCloser: A.closer,
      homeLineup: lineup("H", ovr), awayLineup: lineup("A", ovr),
      homeRotIdx: g % 5, awayRotIdx: g % 5,
      conditions: {}, week: 10,
      homeTeamId: "TEAM_H", awayTeamId: "TEAM_A",
    });
    const lines = res.result?.playerLines ?? [];
    if (lines.length === 0) continue;
    games++;
    runs += (res.result.homeScore ?? 0) + (res.result.awayScore ?? 0);

    for (const l of lines) {
      if (l.role === "pitcher") {
        ip += l.ip; er += l.er; h += l.h; k += l.k; bb += l.bb;
        // 이닝은 1/3 단위여야 한다 — 아웃 집계가 깨지면 여기서 드러난다
        const outs = Math.round(l.ip * 3);
        if (Math.abs(outs / 3 - l.ip) > 0.02) outsMismatch++;
      } else {
        // ⚠ 엔진 `PlayerGameLine::Batter`에는 `pa`가 없다 — 타석은 하위에서
        // `ab+bb`로 **파생**한다(season-helpers). 여기서도 같은 규칙을 쓴다.
        // 없는 필드를 읽으면 조용히 NaN이 되고 검사 전체가 무의미해진다.
        ab += l.ab; bh += l.h; bbb += l.bb; bk += l.k; hr += l.hr;
        pa += l.ab + l.bb;
      }
    }
  }

  log("");
  log(`① NPC 경기 (npc_sim.rs) — OVR ${ovr} · ${games}경기`);
  band("경기당 이닝", r1(ip / games), 16, 19);
  band("경기당 득점(양팀)", r1(runs / games), 6, 13);
  band("9이닝당 피안타", r1(h * 9 / ip), 7.5, 11.0);
  band("9이닝당 탈삼진", r1(k * 9 / ip), 5.5, 10.0);
  band("9이닝당 볼넷", r1(bb * 9 / ip), 2.5, 4.5);
  band("리그 ERA", r2(er * 9 / ip), 3.2, 5.2);
  band("타율", r2(bh / ab), 0.24, 0.30);
  band("타석당 삼진율", r2(bk / pa), 0.14, 0.26);
  band("타석당 볼넷율", r2(bbb / pa), 0.06, 0.12);
  band("경기당 홈런(양팀)", r1(hr / games), 1.0, 3.0);
  band("이닝 1/3 단위 위반", outsMismatch, 0, 0, "건");

  // ⚠ **투수 기록과 타자 기록이 같은 경기를 말해야 한다.** 한쪽만 보면
  // 어긋난 걸 영영 못 본다 — 이 프로젝트에서 반복된 실패 방식이다.
  log("  ── 투타 대사 (같은 경기를 말하는가) ──");
  band("피안타 vs 안타", Math.abs(h - bh), 0, 0, "차");
  band("볼넷 vs 볼넷", Math.abs(bb - bbb), 0, 0, "차");
  band("탈삼진 vs 삼진", Math.abs(k - bk), 0, 0, "차");
  // ⚠ **아웃 = 타수 − 안타가 아니다.** 병살타는 타수 하나에 아웃 둘이고
  // 주루사도 아웃으로 잡힌다. 처음 검사식이 이걸 빼먹어 200경기에서 154차가
  // 나왔고, 정상 동작을 결함으로 읽을 뻔했다. 초과분이 **음수가 아니고**
  // 병살 빈도(대략 3~8%) 범위 안인지를 본다.
  const outs = Math.round(ip * 3);
  const extraOuts = outs - (ab - bh);
  band("추가 아웃(병살·주루사) 비율", r2(extraOuts / outs), 0.0, 0.10);
  return { ip, h, k, bb, er, games };
}

// ── ② 주인공 경기 (match_engine.rs) ──────────────────────────────
//
// `runSimpleGame`은 게임 루프 없이 한 경기를 끝까지 돌리고 **주인공이
// 등판한 동안의 원시 사건**(안타·삼진·볼넷)을 돌려준다. IPC·스토어·
// 파생계산이 끼지 않는 가장 짧은 경로다.
function auditProtagonistGames(ovr) {
  let h = 0, k = 0, bb = 0, games = 0;
  const perGame = [];
  for (let g = 0; g < GAMES; g++) {
    const res = call("runSimpleGame", {
      pitcher: { velocity: ovr, movement: ovr, command: ovr, control: ovr, stamina: 100 },
      opponentOvr: ovr, protagonistOvr: ovr,
    });
    if (res.error) { log(`  FAIL runSimpleGame: ${res.error}`); failed++; return null; }
    h += res.hits ?? 0; k += res.strikeouts ?? 0; bb += res.walks ?? 0;
    perGame.push((res.hits ?? 0) + (res.walks ?? 0));
    games++;
  }
  const evt = h + k + bb;
  log("");
  log(`② 주인공 경기 (match_engine.rs) — OVR ${ovr} · ${games}경기`);
  log(`  등판 중 원시 사건 합계: 피안타 ${h} · 삼진 ${k} · 볼넷 ${bb}`);
  // 이닝을 안 돌려주므로 **비율**로 본다 — 사건 구성비는 이닝과 무관하다
  band("피안타 / (피안타+삼진)", r2(h / (h + k)), 0.45, 0.62);
  band("볼넷 / 전체사건", r2(bb / evt), 0.08, 0.20);
  band("삼진 / 전체사건", r2(k / evt), 0.25, 0.45);
  return { h, k, bb };
}

// ── ③ 두 모델 대사 ───────────────────────────────────────────────
function compare(npc, pro) {
  if (!npc || !pro) return;
  log("");
  log("③ 두 모델이 같은 야구를 하는가");
  const npcRatio = npc.h / (npc.h + npc.k);
  const proRatio = pro.h / (pro.h + pro.k);
  log(`  피안타 비중   NPC ${r2(npcRatio)}  vs  주인공 ${r2(proRatio)}`);
  band("피안타 비중 차", r2(Math.abs(npcRatio - proRatio)), 0, 0.10);

  // ⚠ **절대 차이로 보면 안 된다.** NPC 볼넷 비중 자체가 0.07이라
  // 주인공이 0이어도 차이가 0.07이고, 느슨한 기준을 그냥 통과한다
  // (실제로 첫 감사에서 이 검사가 ok로 찍혔다). 배율로 본다.
  const npcBB = npc.bb / (npc.h + npc.k + npc.bb);
  const proBB = pro.bb / (pro.h + pro.k + pro.bb);
  log(`  볼넷 비중     NPC ${r2(npcBB)}  vs  주인공 ${r2(proBB)}`);
  band("볼넷 비중 배율", proBB > 0 ? r2(npcBB / proBB) : 999, 0.6, 1.7, "배");
}

(async () => {
  log("");
  log("── 경기 엔진 감사 ────────────────────────────────────────");
  log(`엔진만 직접 호출 (게임루프·스토어·파생계산 제외) · ${GAMES}경기씩`);

  const npc = auditNpcGames(70);
  const pro = auditProtagonistGames(70);
  compare(npc, pro);

  log("");
  log(failed === 0 ? "엔진 감사 통과" : `엔진 감사 — 어긋난 항목 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})();
