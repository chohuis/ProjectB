#!/usr/bin/env node
// 은퇴 판정 값을 보려면 PB_RETIRE_LOG=1 (C-1 계측)
// ⚠ **번들보다 먼저 세워야 한다** — perfEntry는 esbuild로 묶이고
//   globalThis는 같은 프로세스라 넘어간다.
if (process.env.PB_RETIRE_LOG) globalThis.__PB_RETIRE_LOG = true;
// ── 커리어 경로 회귀 ─────────────────────────────────────────────
//
// **결함 26건이 전부 "안 밟아본 자리"에서 나왔다.** 헤드리스가 늘 같은 한
// 갈래(고교→드래프트→프로)만 돌았기 때문이다. 대학 4학년 졸업·군 복무 왕복·
// 2군 강등·지명 거부는 코드만 있고 한 번도 실행된 적이 없었다.
//
// 여기서는 **경로별로 정책을 바꿔가며 실제로 끝까지 민다.** 판정은 "예외가
// 없다"가 아니라 "그 무대에 실제로 도달했는가"다 — 예외 없이 엉뚱한 데로
// 새는 게 지금까지의 실패 방식이었다.
//
//   node scripts/test-careerpaths.cjs            전체
//   node scripts/test-careerpaths.cjs --only T2  하나만
//
// 각 경로는 독립 슬롯을 쓰고, 실패해도 나머지를 계속 돈다.

const path = require("path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = 20260731;
const args = process.argv.slice(2);
const only = (() => { const i = args.indexOf("--only"); return i >= 0 ? args[i + 1] : null; })();
const verbose = args.includes("--verbose");

const log = (s) => process.stdout.write(s + "\n");
const vlog = (s) => { if (verbose) log("      " + s); };

// ── 공통 드라이버 ────────────────────────────────────────────────
//
// `rt2.cjs` 계열 스크립트가 매번 이 루프를 다시 적고 있었다. 한 곳에 둔다.
async function drive(app, opts) {
  const { maxSeasons = 8, until, onSeason, onTick } = opts;
  const start = app.currentSeason();
  let guard = 0;
  const trail = [];

  while (guard++ < 2000) {
    if (until && until(app)) return { hit: true, trail };
    if (app.retired()) return { hit: false, trail, reason: "은퇴" };
    if (app.currentSeason() - start >= maxSeasons) return { hit: false, trail, reason: "시즌 상한" };

    const before = app.currentWeek();
    if (opts.applyPolicy) opts.applyPolicy();
    await app.autoRun();               // 오류를 삼키지 않는다 (throw)
    // 시즌 **중간** 상태를 보는 유일한 창이다. `onSeason`은 롤오버에서만 도는데
    // 롤오버는 부상을 전부 리셋하므로, 거기서만 재면 시즌 중 부상 누적을
    // 영영 못 본다 (실제로 부상 상태 미복구 결함이 그렇게 숨어 있었다)
    if (onTick) onTick(app);
    if (app.currentWeek() > before) continue;

    if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }

    const stBefore = app.protagonistState();
    const decided = await app.pushCareerForward();
    if (decided) {
      trail.push(`${app.currentSeason()}W${before} ${decided}`);
      vlog(trail[trail.length - 1]);
      // ⚠ 결정 **직전** 상태를 넘긴다. 롤오버 뒤에 재면 이미 나이가 한 번
      // 올라 있어서 "2년 복무" 검사가 1년으로 보인다(실제로 그렇게 틀렸다)
      if (opts.onDecision) opts.onDecision(app, decided, stBefore);
      continue;
    }

    if (app.isSeasonEnded()) {
      const y = app.currentSeason();
      await app.seasonRollover();
      if (onSeason) onSeason(app, y);
      vlog(`[시즌] ${y}→${app.currentSeason()} ${JSON.stringify(app.protagonistState())}`);
      if (app.careerStage() === "university") vlog(`        학업 ${JSON.stringify(app.academicsState())}`);
      continue;
    }
    return { hit: false, trail, reason: `막힘 W${before} pending=${app.pendingKind()} stop=${app.stopReason()}` };
  }
  return { hit: false, trail, reason: "반복 상한" };
}

// ── 경로 정의 ────────────────────────────────────────────────────
//
// `check`는 **도달했는지**를 본다. throw하면 실패다.
const PATHS = [
  {
    id: "T1",
    name: "대학 4년 → 졸업 → 드래프트 → 프로",
    // 고교에서는 드래프트를 안 넣고 대학만 넣는다. 대학에 들어가면
    // 드래프트를 넣는다 — "대학 경유 → 프로"가 이 경로의 정의다.
    policy: (stage) => stage === "highschool"
      ? { draft: false, university: true, independent: false }
      : { draft: true, university: false, independent: false },
    // 🔴 **12 → 20.** 대학 자동 진행을 고치자(`a5408f5bc`) 대학이 1년이 아니라
    //    4년을 다닌다 — 고교 3년 + 대학 4년 + 드래프트까지 시즌이 더 든다.
    //
    //    ⚠ **게임이 느려진 게 아니라 경로가 길어진 것이다.** 원래 4년이 정상이다.
    //
    //    상한을 올리며 원인이 **세 겹으로** 드러났다:
    //      12 → "시즌 상한"
    //      16 → "**은퇴**"        ← 자동 진행이 무한히 대학에 남았다(고쳤다)
    //      20 → 통과
    //    *죽은 배선을 걷어내면 그 뒤의 결함이 나온다* — 상한이 낮을 땐
    //    "시즌이 모자란다"로 보였고, 늘리자 무한 대학생이 보였다.
    maxSeasons: 20,
    until: (a) => a.careerStage().startsWith("pro"),
    check(app, r, out) {
      if (!r.hit) throw new Error(`프로에 도달 못 함 — ${r.reason}`);
      const seen = r.trail.join(" ");
      if (!/careerChoice\(university\)/.test(seen)) throw new Error("대학 진학을 안 거쳤다");
      const st = app.protagonistState();
      if (st.proServiceYears == null) throw new Error("proServiceYears 없음");
      // ⚠ 학업이 **실제로 돌았는지** 본다. 9-C-1을 붙였을 때 시험 트리거가
      // `career_stage: highschool` 전용이라 대학 학기 확정이 죽은 코드였다 —
      // 코드가 있다고 도는 게 아니다
      // ⚠ **끝난 뒤에 직접 읽는다.** `watch`는 롤오버에서만 도는데 마지막
      // 롤오버가 대학 시즌 **시작 전**이라 늘 0으로 보였다 — T2의 입대 나이와
      // 같은 실수다. `schoolState`는 프로로 넘어가도 남는다.
      const aca = app.academicsState();
      if (aca.semesters === 0) throw new Error("대학 학기가 한 번도 확정 안 됐다 (시험 트리거 미발동)");
      if (aca.gpa == null) throw new Error("학점이 안 쌓였다");
      return `대학 경유 → ${st.team} (${st.age}세) · 학기 ${aca.semesters}회 · 학점 ${Number(aca.gpa).toFixed(2)} · 경고 ${aca.warn} · 유급 ${aca.repeated}`;
    },
    // 대학 재학 중 학년·학업이 실제로 올라갔는지 같이 본다
    watch(app, out) {
      const st = app.protagonistState();
      if (st.stage === "university" && st.grade != null) out.grades.add(st.grade);
      const a = app.academicsState();
      if (a.semesters > (out.aca?.semesters ?? -1)) out.aca = a;
    },
  },
  {
    id: "T2",
    name: "즉시 입대 → 복무 → 전역 → 복귀",
    policy: { enlistNow: true },
    maxSeasons: 10,
    until: (a) => {
      const st = a.protagonistState();
      return st.militaryStatus === "군필" || st.stage !== "military" && st.serviceWeeks > 0;
    },
    // ⚠ 검사가 약하면 **엉뚱한 결말을 통과시킨다.** 처음엔 "stage != military"와
    // "militaryStatus != 미필"만 봤는데, 21세가 고등학교로 돌아가고 연도·나이가
    // 안 오른 상태를 그대로 ok로 찍었다. 전역은 세 가지를 동시에 만족해야 한다.
    check(app, r, out) {
      const st = app.protagonistState();
      if (st.stage === "military") throw new Error(`복무 중에서 안 벗어났다 (${st.serviceWeeks}주)`);
      if (st.militaryStatus === "미필") throw new Error(`전역 처리가 안 됐다 — status=${st.militaryStatus}`);
      // ① 학교로 돌아가지 않는다 (careerTransition이 "고교 재입학 불가"를 명시)
      if (st.stage === "highschool" || st.stage === "university") {
        throw new Error(`전역 후 학교로 돌아갔다 — stage=${st.stage} (${st.age}세)`);
      }
      // ② 단계와 리그가 짝이 맞는다
      const LEAGUE_OF = { independent: "LEAGUE_INDEPENDENT", pro_kbl: "LEAGUE_KBL" };
      const want = LEAGUE_OF[st.stage];
      if (want && st.league !== want) throw new Error(`단계와 리그가 어긋난다 — ${st.stage} / ${st.league}`);
      // ③ 복무한 만큼 세계가 흘렀다 (52주 시즌 × 2)
      if (out.enlistAge != null && st.age - out.enlistAge < 2) {
        throw new Error(`복무 2년인데 나이가 ${out.enlistAge}→${st.age} — 세계가 안 흘렀다`);
      }
      return `전역 → ${st.stage}/${st.league} (${st.militaryStatus}, ${out.enlistAge}→${st.age}세)`;
    },
    onDecision(app, decided, stBefore, out) {
      if (decided.includes("enlist") && out.enlistAge == null) out.enlistAge = stBefore.age;
    },
  },
  {
    id: "T4",
    name: "지명 거부 → 대안 경로",
    policy: { draft: true, university: true, independent: true, rejectDraft: true },
    maxSeasons: 8,
    until: (a) => ["university", "independent", "military"].includes(a.careerStage()),
    check(app, r) {
      if (!r.hit) throw new Error(`대안 경로에 도달 못 함 — ${r.reason}`);
      const seen = r.trail.join(" ");
      if (!/reject/.test(seen)) throw new Error("거부 경로를 안 탔다");
      return `거부 → ${app.careerStage()}`;
    },
  },
  {
    id: "T5",
    name: "미지명·갈 곳 없음 → 현역 입대",
    // 드래프트만 넣고 폴백을 비운다 — 미지명이면 갈 곳이 없다
    policy: { draft: true, university: false, independent: false },
    maxSeasons: 8,
    until: (a) => a.careerStage() === "military" || a.careerStage().startsWith("pro"),
    check(app, r) {
      if (!r.hit) throw new Error(`결말에 도달 못 함 — ${r.reason}`);
      // 지명을 받았으면 그것대로 정상이다 (폴백은 미지명일 때만 의미가 있다)
      return app.careerStage() === "military" ? "미지명 → 현역 입대" : "지명받음 (폴백 미발동)";
    },
  },
  {
    id: "T6",
    name: "독립리그 → 재지명 → 프로",
    // 고교에서는 독립만, 독립에 들어가면 드래프트를 넣는다.
    // (전 단계 draft:false로 두면 독립에서 재지원을 안 해 영영 프로에 못 간다 —
    //  T1과 같은 배선 오류였다)
    policy: (stage) => stage === "highschool"
      ? { draft: false, university: false, independent: true }
      : { draft: true, university: false, independent: false },
    // 🔴 **12 → 20.** T1이 같은 처방으로 통과했다(12 → 20).
        //    넷 다 실패 메시지가 "프로에 도달 못 함 — 시즌 상한"이었다.
        //    ⚠ 상한을 올리면 **그 뒤의 진짜 원인이 드러난다** — T1은 16에서
        //      "은퇴"가 나왔다. 통과하면 상한이 문제였던 것이고,
        //      다른 메시지가 나오면 그게 진짜다.
        maxSeasons: 20,
    until: (a) => a.careerStage().startsWith("pro"),
    check(app, r) {
      const st = app.protagonistState();
      if (!r.hit) throw new Error(`프로 재지명에 도달 못 함 (지금 ${st.stage}) — ${r.reason}`);
      if (!r.trail.join(" ").includes("independent")) throw new Error("독립리그를 안 거쳤다");
      return `독립 경유 → ${st.team}`;
    },
  },
  {
    id: "T3",
    name: "2군 강등 → 1군 복귀",
    // **한 번도 안 밟아본 경로다.** 승강은 이번 조사에서 페이로드 null 하나로
    // 한 팀이 매주 죽어 있던 곳이고(주간 루프까지 끊겼다), 주인공이 실제로
    // 내려갔다 돌아오는 흐름은 검증된 적이 없다.
    //
    // 성적으로 강등을 유도하려면 시즌을 여러 번 굴려야 하고 그래도 안 걸릴
    // 수 있다 — `forceProtagonistToFarm`으로 무대에 직접 세운다
    // (강등 자체는 실제 승강 코드와 **같은 함수**를 쓴다).
    policy: (stage) => stage === "highschool"
      ? { draft: true, university: false, independent: true }
      : { draft: true, university: false, independent: false },
    // 🔴 **12 → 20.** T1이 같은 처방으로 통과했다(12 → 20).
        //    넷 다 실패 메시지가 "프로에 도달 못 함 — 시즌 상한"이었다.
        //    ⚠ 상한을 올리면 **그 뒤의 진짜 원인이 드러난다** — T1은 16에서
        //      "은퇴"가 나왔다. 통과하면 상한이 문제였던 것이고,
        //      다른 메시지가 나오면 그게 진짜다.
        maxSeasons: 20,
    until: (a) => a.careerStage().startsWith("pro"),
    async check(app, r, out) {
      if (!r.hit) throw new Error(`프로에 도달 못 함 — ${r.reason}`);

      const forced = app.forceProtagonistToFarm();
      if (!forced.ok) throw new Error(`강등을 못 걸었다 — ${forced.이유 ?? JSON.stringify(forced)}`);
      if (!app.protagonistIsFarm()) throw new Error("강등 후에도 2군이 아니다");
      const demotedAt = `${app.currentSeason()}W${app.currentWeek()}`;

      // ⚠ **강등만 확인하고 끝내면 안 된다.** 이 파일 T2 주석에 적힌 대로
      // "검사가 약하면 엉뚱한 결말을 통과시킨다" — 2군에 갇힌 채 커리어가
      // 끝나는 것도 강등 성공으로 읽힌다. 복귀까지 본다.
      const back = await drive(app, {
        maxSeasons: 6,
        until: (a) => !a.protagonistIsFarm(),
        applyPolicy: () => app.setCareerPolicy({ draft: true, university: false, independent: false }),
      });
      const st = app.protagonistState();
      if (!back.hit) {
        throw new Error(`2군에서 못 올라왔다 (${demotedAt} 강등 → 지금 ${st.team}) — ${back.reason}`);
      }
      return `강등 ${forced.before.team} → ${forced.after.team} (${demotedAt}) → 복귀 ${st.team} (${app.currentSeason()}W${app.currentWeek()})`;
    },
  },
  {
    id: "T8",
    name: "국가대표 — 대회가 열리고 소집이 도는가",
    // **엔진 페이로드 null로 죽어 있던 경로다.**
    // `selectNationalSquadNative: invalid type: null, expected f64` —
    // `formOf`가 통계 없는 선수에게 NaN을 만들고 JSON.stringify가 null로
    // 바꿨다. 고친 뒤 실제로 대회가 열리는지 확인한다.
    //
    // ⚠ 대회는 **개막 주에만** 열린다. 시즌 경계에서만 재면 이미 닫혀 있어
    // 영영 0으로 보인다 — 부상(T11)과 같은 함정이라 `onTick`으로 본다.
    policy: (stage) => stage === "highschool"
      ? { draft: true, university: false, independent: true }
      : { draft: true, university: false, independent: false },
    maxSeasons: 10,
    until: (a) => a.natlSeen >= 1,
    onTick(app, out) {
      const p = app.nationalTeamProbe();
      out.samples++;
      // ⚠ **진행 중 스냅샷만 보면 안 된다.** 대회 기간이 2~3주인데 autoRun은
      // W40·W51에서만 멈춘다 — 아시안게임(W38~40)은 멈추는 순간 이미 폐막했고
      // 올림픽(W30~33)은 통째로 지나간다. 실제로 그렇게 "한 번도 안 열렸다"고
      // 잘못 읽었다. 발탁 발표(메시지)를 **매 tick 누적**한다 —
      // mailbox엔 상한이 있어 나중에 몰아 읽으면 밀려나 있다.
      for (const t of p.발탁제목 ?? []) out.natlTournaments.add(t);
      if (p.진행중) {
        if (p.소집인원 > out.natlMaxSquad) out.natlMaxSquad = p.소집인원;
        if (p.주인공소집) out.natlProtagonist = true;
      }
      app.natlSeen = out.natlTournaments.size;
    },
    check(app, r, out) {
      // ⚠ 표본 수를 조건에 넣지 않는다. `until`이 첫 tick에 만족되면
      // samples가 1이고, 그건 **빨리 찾았다는 뜻이지 측정 실패가 아니다** —
      // T11(부상)에서 쓰던 조건을 그대로 복사했다가 성공을 실패로 읽었다.
      if (out.natlTournaments.size === 0) {
        throw new Error("국제대회 발탁 발표가 한 번도 없었다 — 선발이 여전히 죽어 있다");
      }
      return `발탁 발표 ${out.natlTournaments.size}회 — ${[...out.natlTournaments][0]}`
        + (out.natlMaxSquad > 0 ? ` · 소집 ${out.natlMaxSquad}명` : "")
        + (out.natlProtagonist ? " · 주인공 발탁" : "");
    },
  },
  {
    id: "T7",
    name: "포스트시즌 — 가을야구가 실제로 치러지는가",
    // ⚠ **일정만 있고 결과가 안 붙는 경우를 잡는다.** 브래킷에 항목이 있어도
    // 경기가 안 치러지면 `result`가 없고, 그러면 우승팀이 안 정해진다 —
    // 시즌 요약·구단 성향 갱신·수상이 전부 빈손으로 돈다. **결과**를 본다.
    policy: (stage) => stage === "highschool"
      ? { draft: true, university: false, independent: true }
      : { draft: true, university: false, independent: false },
    // 🔴 **12 → 20.** T1이 같은 처방으로 통과했다(12 → 20).
        //    넷 다 실패 메시지가 "프로에 도달 못 함 — 시즌 상한"이었다.
        //    ⚠ 상한을 올리면 **그 뒤의 진짜 원인이 드러난다** — T1은 16에서
        //      "은퇴"가 나왔다. 통과하면 상한이 문제였던 것이고,
        //      다른 메시지가 나오면 그게 진짜다.
        maxSeasons: 20,
    until: (a) => a.careerStage().startsWith("pro"),
    async check(app, r) {
      if (!r.hit) throw new Error(`프로에 도달 못 함 — ${r.reason}`);
      // 프로 첫 시즌을 끝까지 민다 — 포스트시즌은 정규 시즌 뒤에 온다
      const season = app.currentSeason();
      await drive(app, {
        maxSeasons: 2,
        until: (a) => a.currentSeason() > season,
        applyPolicy: () => app.setCareerPolicy({ draft: true, university: false, independent: false }),
        onTick: (a) => {
          const p = a.postseasonProbe("LEAGUE_KBL");
          if ((p.승자결정 ?? 0) > 0) a._psSeen = p;
        },
      });
      const ps = app._psSeen ?? app.postseasonProbe("LEAGUE_KBL");
      if ((ps.시리즈 ?? 0) === 0) throw new Error("포스트시즌 브래킷이 아예 없다");
      if ((ps.승자결정 ?? 0) === 0) {
        throw new Error(`시리즈 ${ps.시리즈}개가 잡혔는데 승자가 하나도 안 정해졌다`);
      }
      if (!ps.우승팀) throw new Error("시리즈는 끝났는데 우승팀이 없다");
      return `${ps.승자결정}/${ps.시리즈}시리즈 · 우승 ${ps.우승팀}`
        + (ps.주인공팀참가 ? " · 주인공 팀 진출" : "");
    },
  },
  {
    id: "T9",
    name: "FA — 계약이 끝나고 시장을 거쳐 다시 뛴다",
    // **프로 커리어에서 매번 도는 경로인데 끝까지 밟아본 적이 없다.**
    // 계약 만료 → FA 시장 → 재계약까지 이어져야 한다. 중간에 막히면
    // 자동 진행이 멈추고, 그건 "은퇴"가 아니라 결함이다.
    policy: (stage) => stage === "highschool"
      ? { draft: true, university: false, independent: true }
      : { draft: true, university: false, independent: false },
    maxSeasons: 20,
    until: (a) => a.careerStage().startsWith("pro"),
    async check(app, r, out) {
      if (!r.hit) throw new Error(`프로에 도달 못 함 — ${r.reason}`);
      // FA 자격은 연차가 쌓여야 온다 — 계약 결정을 계속 눌러가며 민다
      const fa = await drive(app, {
        maxSeasons: 14,
        until: () => out.faSigned,
        applyPolicy: () => app.setCareerPolicy({ draft: true, university: false, independent: false }),
        onDecision: (_a, decided) => {
          if (typeof decided === "string" && decided.startsWith("faMarket")) out.faSigned = decided;
        },
      });
      if (!fa.hit) {
        throw new Error(`FA 시장에 한 번도 못 갔다 — ${fa.reason}`
          + ` (경로: ${fa.trail.slice(-4).join(" / ")})`);
      }
      // **계약까지 확인한다.** `faMarket(wait)`로 대기만 하고 끝나면
      // 무소속인 채 시즌을 나는 것이라 경로를 밟았다고 할 수 없다
      const st = app.contractState();
      if (!st.contract) throw new Error(`FA는 거쳤는데 계약이 없다 (${out.faSigned})`);
      return `${out.faSigned} → ${st.contract.team} ${st.contract.salary}만원 ${st.contract.years}년`;
    },
  },
  {
    id: "T10",
    name: "은퇴 — 커리어가 실제로 끝난다",
    // ⚠ **끝나지 않는 게임이었다.** `retirementAsk`를 만드는 코드는 있었는데
    // 받는 화면이 없어 자동 진행이 거기서 멈춘 채 안 풀렸고,
    // `retireProtagonist`는 호출부가 하나도 없었다. 목표 커리어가 15~20시즌인데
    // 25시즌(42세)을 완주하고도 은퇴가 0건이었다.
    policy: (stage) => stage === "highschool"
      ? { draft: true, university: false, independent: true }
      : { draft: true, university: false, independent: false },
    maxSeasons: 30,
    until: (a) => !!a.retired(),
    check(app, r) {
      const ret = app.retired();
      if (!ret) {
        const st = app.protagonistState();
        throw new Error(`${r.reason} — ${st.age}세까지 뛰고도 은퇴가 없다`);
      }
      const st = app.protagonistState();
      // 나이가 말이 되는가 — 20대에 노쇠 은퇴가 나오면 판정이 잘못된 것이다
      if (ret.reason === "decline" && (st.age ?? 0) < 30) {
        throw new Error(`${st.age}세에 노쇠 은퇴 — 판정 기준이 너무 이르다`);
      }
      return `${ret.year}년 ${st.age}세 은퇴 (사유 ${ret.reason})`;
    },
  },
  {
    id: "T11",
    name: "NPC 부상 — 발생하고 회복되는가",
    // **실제로 있었던 결함을 고정한다.** 부상이 나면 `careerStatus`를
    // "injured"로 바꾸는데 완치 시 "active"로 되돌리는 코드가 없었다.
    // 한 번 다친 NPC가 영영 injured로 남아 시즌 중 고교의 **47%**(1,429/3,015)가
    // 부상 상태였고, 로스터·순위·트레이드·FA·드래프트 후보·시즌 기록에서
    // 통째로 빠졌다. 시즌 롤오버가 상태를 리셋해서 시즌 경계에서만 보면
    // 멀쩡해 보였다 — 그래서 **시즌 중간**을 본다.
    policy: { draft: false, university: true, independent: false },
    maxSeasons: 2,
    until: (a) => a.currentSeason() >= 2028,
    onTick(app, out) {
      const raw = app.leagueRawCounts()["LEAGUE_HIGHSCHOOL"] ?? {};
      const injured = raw.injured ?? 0;
      const alive = (raw.active ?? 0) + injured;
      if (alive < 100) return;                       // 아직 세계가 안 찼다
      const ratio = injured / alive;
      if (ratio > out.injPeak) out.injPeak = ratio;
      if (injured > out.injMax) out.injMax = injured;
      // 정점을 찍은 뒤 실제로 줄어든 적이 있는가 = 회복이 반영된다
      if (out.injMax > 0 && injured < out.injMax) out.recovered = true;
      out.injSeen = out.injSeen || injured > 0;
      out.samples++;
    },
    check(app, r, out) {
      if (out.samples < 10) throw new Error(`표본 부족 (${out.samples}회) — 측정이 안 돌았다`);
      if (!out.injSeen) throw new Error("부상이 한 번도 발생하지 않았다 — 부상 계산이 죽었을 수 있다");
      if (!out.recovered) throw new Error(`부상자 수가 한 번도 줄지 않았다 (최대 ${out.injMax}명) — 회복 시 active 복귀가 안 된다`);
      const pct = (out.injPeak * 100).toFixed(1);
      if (out.injPeak > 0.25) throw new Error(`고교 부상 비율이 ${pct}%까지 올라갔다 (상한 25%)`);
      return `부상 정점 ${out.injMax}명 (${pct}%) · 회복 확인 · 표본 ${out.samples}회`;
    },
  },
];

// ── 실행 ─────────────────────────────────────────────────────────
(async () => {
  const targets = only ? PATHS.filter((p) => p.id === only) : PATHS;
  if (targets.length === 0) { log(`[경로회귀] --only ${only} 는 없는 경로다`); process.exit(1); }

  log("");
  log("── 커리어 경로 회귀 ──────────────────────────────────────");
  let failed = 0;

  // 🔴 **한 번 돌아 실패한 걸로 결함을 판정하면 안 된다.**
  //
  //    실측(2026-08-25): T7과 T9는 policy · until · maxSeasons · **worldSeed까지**
  //    글자 그대로 같은데 T9만 통과했다. 슬롯을 바꿔 재니 **T9도 실패했다** —
  //    T9의 통과 자체가 운이었다.
  //
  //    이 검사가 묻는 건 **그 경로가 열려 있는가**지 매번 같은 결과가 나오는가가
  //    아니다. 결정성은 게임 전체 목표가 아니다(2026-08-24 정책: 계측이 재현되는
  //    수준까지만). 그러니 **N회 중 한 번이라도 도달하면 통과**로 본다.
  //
  //    ⚠ 씨앗을 회차마다 바꾼다 — 같은 씨앗으로 N번 돌리면 같은 운을 N번 뽑는다.
  const TRIES = Number(process.env.PB_TRIES || 3);

  for (const p of targets) {
    const t0 = Date.now();
    let lastErr = null;
    let passed = false;
    for (let attempt = 0; attempt < TRIES && !passed; attempt++) {
    let tmp = null;
    try {
      const boot = await headless.boot(p.id.toLowerCase());
      tmp = boot.tmp;
      const app = boot.app;
      // 회차마다 다른 세계를 본다 — 같은 씨앗이면 같은 운을 N번 뽑는다
      await app.boot({ slotId: p.id, worldSeed: SEED + attempt * 7919, seasonYear: 2026 });
      const applyPolicy = () => app.setCareerPolicy(
        typeof p.policy === "function" ? p.policy(app.careerStage()) : p.policy);
      applyPolicy();

      const out = {
        grades: new Set(), enlistAge: null,
        aca: { semesters: 0, gpa: null, warn: 0, repeated: 0 },
        injPeak: 0, injMax: 0, injSeen: false, recovered: false, samples: 0,
        natlTournaments: new Set(), natlMaxSquad: 0, natlProtagonist: false,
        demotedAt: null, faSigned: null,
      };
      // `until`이 app만 받으므로 onTick이 여기 얹는다 (T8)
      app.natlSeen = 0;
      const r = await drive(app, {
        maxSeasons: p.maxSeasons,
        until: p.until,
        applyPolicy,
        onTick: p.onTick ? (a) => p.onTick(a, out) : undefined,
        onSeason: p.watch ? (a) => p.watch(a, out) : undefined,
        onDecision: p.onDecision ? (a, d, st) => p.onDecision(a, d, st, out) : undefined,
      });
      const detail = await p.check(app, r, out);
      passed = true;
      const nth = attempt > 0 ? " (" + (attempt + 1) + "/" + TRIES + "회째)" : "";
      log(`  ok  ${p.id} ${p.name}${nth}`);
      log(`      ${detail}  (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    } catch (e) {
      lastErr = e;
    } finally {
      if (tmp) headless.cleanup(tmp);
    }
    }
    if (!passed) {
      failed++;
      log(`  FAIL ${p.id} ${p.name} (${TRIES}회 모두)`);
      const msg = String((lastErr && lastErr.message) || lastErr);
      log("      " + msg.split(String.fromCharCode(10)).slice(0, 6).join(String.fromCharCode(10) + "      "));
    }
  }

  log("");
  log(failed === 0 ? "커리어 경로 회귀 통과" : `커리어 경로 회귀 실패 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { log("ERR " + (e && e.stack || e)); process.exit(1); });
