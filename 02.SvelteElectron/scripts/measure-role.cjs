"use strict";
/**
 * 고교 입학 보직(SP/RP) 실측 — **102팀 × 새 게임 유형 전부**.
 *
 * 규칙을 여기 다시 적지 않는다. 세계는 `perfEntry.boot`(게임과 같은 순서)가
 * 만들고, 보직은 `pitcherRoleEngine.assignHighschoolPosition` → Rust
 * `assignHighschoolPositionNative` 를 그대로 부른다.
 *
 * 유형별 초기 능력치는 `NewGamePage.svelte` 의 `PRESETS` 를 **파일에서 읽는다** —
 * 여기 베껴 두면 프리셋이 바뀌었을 때 계측만 옛 주인공을 잰다.
 *
 *   npm run measure:role
 *   PF_SEED=20260826 npm run measure:role
 */
const path = require("node:path");
const fs = require("node:fs");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));

// NewGamePage 가 쓰는 고정 씨앗 (worldSeed = 20260826)
const SEED = Number(process.env.PF_SEED || 20260826);
const YEAR = Number(process.env.PF_YEAR || 2026);

// ── 프리셋을 화면 소스에서 읽는다 ──────────────────────────────
function readPresets() {
  const src = fs.readFileSync(
    path.join(ROOT, "apps/ui/src/pages/new-game/NewGamePage.svelte"), "utf8");
  const block = src.slice(src.indexOf("const PRESETS"));
  const re = /(\w+):\s*\{\s*[\r\n]+\s*label:\s*"([^"]+)"[\s\S]*?pitching:\s*\{([^}]*)\}/g;
  const out = [];
  let m;
  while ((m = re.exec(block)) !== null) {
    const stats = {};
    for (const kv of m[3].split(",")) {
      const [k, v] = kv.split(":").map((s) => s.trim());
      if (k && v !== undefined) stats[k] = Number(v);
    }
    out.push({ key: m[1], label: m[2], ovr: stats.ovr, stats });
    if (out.length >= 8) break;
  }
  return out;
}

const pct = (n, d) => (d === 0 ? "0.0" : ((n / d) * 100).toFixed(1));

(async () => {
  const presets = readPresets();
  if (presets.length === 0) throw new Error("[measure-role] PRESETS 를 못 읽었다");

  const { tmp } = await headless.boot("role");
  // 헤드리스는 perfEntry.ts 하나만 번들한다 — 계측 진입점은 따로 말아 쓴다
  const entryFile = path.join(tmp, "roleEntry.cjs");
  require("esbuild").buildSync({
    entryPoints: [path.join(ROOT, "scripts/perf/roleEntry.ts")],
    bundle: true, platform: "node", format: "cjs", target: "node18",
    outfile: entryFile, logLevel: "warning",
  });
  const role = require(entryFile);

  try {
    console.log(`\n== 고교 입학 보직 실측 ==  씨앗 ${SEED} · ${YEAR}년`);
    console.log(`유형 ${presets.map((p) => `${p.label}(OVR ${p.ovr})`).join(" · ")}\n`);

    // ① 새 게임 화면이 보직을 정하는 그 시점
    const sampleTeam = "TEAM_HS_AEWOL";
    const pre = await role.preWorldProbe(sampleTeam, presets[0].ovr);
    console.log("① NewGamePage.doStartGame 시점 (슬롯 생성 전)");
    console.log(`   masterStore.entities ${pre.entities}건 · 그중 선수 ${pre.players}건`);
    console.log(`   ${sampleTeam} 투수 ${pre.teamPitchers}명 → 보직 ${pre.position}\n`);

    // ② 세계를 만들고 W1 배정 규칙을 102팀에 그대로 적용
    const b = await role.boot({ slotId: "ROLE", worldSeed: SEED, seasonYear: YEAR });
    console.log(`② 세계 생성 완료 — NPC ${b.npcCount}명 · entities ${b.entityCount}건\n`);

    const ovrs = [...new Set(presets.map((p) => p.ovr))].sort((a, b2) => a - b2);
    const rows = await role.hsRoleTable(ovrs);
    console.log(`고교 팀 ${rows.length}개 · 팀당 투수 ` +
      `${(rows.reduce((s, r) => s + r.pitchers, 0) / rows.length).toFixed(1)}명 평균\n`);

    console.log("유형        OVR  선발SP  중계RP   SP%   RP 팀 예시");
    for (const p of presets) {
      const k = String(p.ovr);
      const sp = rows.filter((r) => r.byOvr[k].position === "SP");
      const rp = rows.filter((r) => r.byOvr[k].position === "RP");
      const ex = rp.slice(0, 3).map((r) => `${r.name}(★${r.power})`).join(" ");
      console.log(`${p.label.padEnd(10)} ${String(p.ovr).padStart(3)}  ` +
        `${String(sp.length).padStart(5)}  ${String(rp.length).padStart(5)}  ` +
        `${pct(sp.length, rows.length).padStart(5)}   ${ex}`);
    }

    // ③ 왜 갈리나 — 전력★별
    console.log("\n★별 RP 비율 (팀 수 / 그중 RP)");
    const stars = [...new Set(rows.map((r) => r.power))].sort();
    for (const ovr of ovrs) {
      const k = String(ovr);
      const cells = stars.map((s) => {
        const g = rows.filter((r) => r.power === s);
        const rp = g.filter((r) => r.byOvr[k].position === "RP").length;
        return `★${s}:${rp}/${g.length}`;
      });
      console.log(`  OVR ${ovr}  ${cells.join("  ")}`);
    }

    console.log("\n★별 팀 투수 OVR 상위3 평균");
    for (const s of stars) {
      const g = rows.filter((r) => r.power === s);
      const t1 = g.map((r) => r.top3[0] ?? 0), t3 = g.map((r) => r.top3[2] ?? 0);
      const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
      console.log(`  ★${s}  n=${String(g.length).padStart(2)}  ` +
        `1위 ${avg(t1)}  3위 ${avg(t3)}  최고 ${Math.max(...t1)}`);
    }

    // ④ 문턱 근처 — 나보다 높은 투수 수 분포
    console.log("\n'나보다 높은 팀 투수' 분포 (0~2 = SP · 3+ = RP)");
    for (const ovr of ovrs) {
      const k = String(ovr);
      const hist = {};
      for (const r of rows) {
        const h = Math.min(r.byOvr[k].higher, 6);
        hist[h] = (hist[h] ?? 0) + 1;
      }
      console.log(`  OVR ${ovr}  ` + [0, 1, 2, 3, 4, 5, 6]
        .map((h) => `${h === 6 ? "6+" : h}:${hist[h] ?? 0}`).join(" "));
    }

    // ④-2 RP 가 되는 팀 — 전부 적는다 (네 팀뿐이다)
    console.log("\nRP 판정 팀 상세");
    for (const ovr of ovrs) {
      const k = String(ovr);
      for (const r of rows.filter((x) => x.byOvr[k].position === "RP")) {
        console.log(`  OVR ${ovr}  ${r.name}(${r.teamId}) ★${r.power} ${r.region}` +
          ` 로스터 ${r.roster} 투수 ${r.pitchers} 상위3 ${r.top3.join("/")} 나보다위 ${r.byOvr[k].higher}`);
      }
    }

    // ④-3 문턱 곡선 — 주인공 OVR 을 60~82 로 밀어 본다 (성장 뒤 시즌 W1 재배정용)
    const sweep = [];
    for (let o = 60; o <= 82; o += 2) sweep.push(o);
    const sweepRows = await role.hsRoleTable(sweep);
    console.log("\n주인공 OVR → RP 판정 팀 수 (102팀 중)");
    console.log("  " + sweep.map((o) => String(o).padStart(4)).join(""));
    console.log("  " + sweep.map((o) =>
      String(sweepRows.filter((r) => r.byOvr[String(o)].position === "RP").length).padStart(4)).join(""));

    // ⑤ 권역별 (대표 팀 확인용)
    console.log("\n권역별 RP 팀 수 (OVR " + ovrs.join("/") + ")");
    const regions = [...new Set(rows.map((r) => r.region))].sort();
    for (const rg of regions) {
      const g = rows.filter((r) => r.region === rg);
      console.log(`  ${rg.padEnd(12)} n=${String(g.length).padStart(2)}  ` +
        ovrs.map((o) => g.filter((r) => r.byOvr[String(o)].position === "RP").length).join(" / "));
    }

    // ⑥ W1 재배정이 실제로 도는가 — 한 주만 넘긴다.
    //   ⚠ **맨 끝에서 한다.** W1 이 신입생을 만들어 로스터가 커지므로
    //     앞의 표(입학 시점)와 같은 세계가 아니게 된다.
    // ── A① 새 산식 — 적합도 + 자리 경쟁 추천 분포 (규칙 파일 pitcherRoleRules) ──
    console.log(`\n== 새 산식 추천 (A①) ==  규칙 실림 ${role.rolesPrimed() ? "예" : "아니오(옛 엔진 폴백)"}`);
    const recRows = await role.hsRecommendTable(presets);
    console.log("유형        OVR  선발  중계  마무리  자리없음  적합도평균(SP/RP/CP)  마무리 팀 예시");
    for (const p of presets) {
      const rs = recRows.map((r) => r.byPreset[p.key]);
      const cnt = (k) => rs.filter((x) => x.recommended === k).length;
      const avg = (k) => (rs.reduce((s, x) => s + (x.fits ? x.fits[k] : 0), 0) / rs.length).toFixed(1);
      const cpEx = recRows.filter((r) => r.byPreset[p.key].recommended === "cp").slice(0, 3)
        .map((r) => `${r.name}(★${r.power})`).join(" ");
      console.log(`${p.label.padEnd(10)} ${String(p.ovr).padStart(3)}  ` +
        `${String(cnt("sp")).padStart(4)}  ${String(cnt("rp")).padStart(4)}  ${String(cnt("cp")).padStart(5)}   ` +
        `${String(rs.filter((x) => x.noSeat).length).padStart(6)}   ` +
        `${avg("sp")}/${avg("rp")}/${avg("cp")}   ${cpEx}`);
    }
    console.log("\n★별 추천 (SP/RP/CP · 유형 순)");
    const recStars = [...new Set(recRows.map((r) => r.power))].sort();
    for (const s of recStars) {
      const g = recRows.filter((r) => r.power === s);
      const cells = presets.map((p) => {
        const c = (k) => g.filter((r) => r.byPreset[p.key].recommended === k).length;
        return `${p.label}:${c("sp")}/${c("rp")}/${c("cp")}`;
      });
      console.log(`  ★${s} n=${String(g.length).padStart(2)}  ${cells.join("  ")}`);
    }
    console.log("\n선발 순위 분포 (유형별 · rankSP 1~6+)");
    for (const p of presets) {
      const hist = {};
      for (const r of recRows) { const k = Math.min(r.byPreset[p.key].ranks?.sp ?? 0, 6); hist[k] = (hist[k] ?? 0) + 1; }
      console.log(`  ${p.label.padEnd(10)} ` + [1, 2, 3, 4, 5, 6].map((h) => `${h === 6 ? "6+" : h}:${hist[h] ?? 0}`).join(" "));
    }

    const before = role.heroProbe();
    await role.oneWeek();
    const after = role.heroProbe();
    console.log(`\nW1 재배정 확인  ${before.teamId} 주인공 OVR ${before.ovr}`);
    console.log(`  W${before.week} position=${before.position} role=${before.currentRole}`);
    console.log(`  W${after.week} position=${after.position} role=${after.currentRole}`);
    console.log(`  팀 투수 OVR ${after.teamPitcherOvrs.join("/")}`);

    if (process.env.PF_DUMP) {
      const out = path.join(ROOT, "docs/_measure-role-dump.json");
      fs.writeFileSync(out, JSON.stringify(rows, null, 1));
      console.log(`\n[덤프] ${out}`);
    }
  } finally {
    headless.cleanup(tmp);
  }
})().catch((e) => { console.error(e); process.exit(1); });
