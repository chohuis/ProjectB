// UI 자동 순회 점검.
//
//   node scripts/ui-walk.mjs --weeks 20 --label hs1
//   node scripts/ui-walk.mjs --weeks 120 --label pro     (프로까지 밀어서 본다)
//
// **자동 검사가 렌더를 안 덮는다**는 걸 하루에 네 번 확인했다(2026-08-08).
// 그런데 그중 하나(`each_key_duplicate`)는 **콘솔에 그대로 찍혀 있었다** —
// 신호는 있는데 아무도 안 보고 있었다. 그걸 판정으로 만든다.
//
// 표적은 짐작이 아니라 **이 프로젝트가 실제로 겪은 형태**다:
//
//   콘솔 에러    each_key_duplicate → 세이브 못 엶 · 모달 ReferenceError → 안 열림
//   넘침         목록 카드가 365px 칸에 555px로 삐져나감
//   빈값 누출    ID→이름 변환이 한 겹 빠져 `TEAM_HS_AEWOL`이 그대로 뜸
//   진행 막힘    화면 없는 정지 조건이 큐에 남아 주 진행이 영영 안 먹음
//
// ⚠ **이 검사는 "화면이 안 죽는다"까지만 본다.** 공백 정렬 붕괴나 내용이 틀린
// 것(순위가 실제와 다름)은 콘솔도 조용하고 DOM도 멀쩡하다 — 눈을 대체하지
// 못하고, 눈이 볼 것을 줄여줄 뿐이다.
//
// ⚠ **electron이 `.node`와 `master.db`를 문다.** 도는 동안 `npm run dev`를
// 쓸 수 없다.

import { _electron as electron } from "playwright-core";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5174";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : d;
};
const WEEKS = Number(arg("weeks", 20)) || 20;
const LABEL = arg("label", "walk");
const SHOT_DIR = path.join(APP_DIR, "resource/logs/uiwalk", LABEL);
fs.mkdirSync(SHOT_DIR, { recursive: true });

const log = (s) => process.stdout.write(s + "\n");

/**
 * 무시할 콘솔 잡음. **목록에 없는 건 전부 실패다** —
 * "이건 원래 나던 건데"로 하나씩 넘기면 그물이 없어진다.
 */
const IGNORE = [
  /Electron Security Warning/i,
  /Content-Security-Policy/i,
  /devtools/i,
  /Autofill\.(enable|setAddresses)/i,   // DevTools 프로토콜 잡음
];
const isNoise = (t) => IGNORE.some((re) => re.test(t));

/**
 * 화면에 새면 안 되는 것들. ID→이름 변환이 한 겹만 빠져도 그대로 뜬다 —
 * 이 프로젝트는 그 층이 여러 겹이다(`teamMap`·`teamsL10n`·`entitiesL10n`).
 */
// ⚠ 처음엔 접두사를 열거했다(`TEAM_`·`PLY_`·`LEAGUE_`…). 그랬더니 **부상 타입
// `SHOULDER_INFLAM`이 화면에 그대로 떠 있는데도 통과했다** — 목록에 없는 접두사라
// 그렇다. 열거는 아는 것만 잡는다. 그래서 **대문자_스네이크 전부**를 잡고,
// 화면에 나와도 되는 것만 아래에서 뺀다.
const LEAK = /\b(undefined|NaN|\[object Object\]|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/;

/** 대문자_스네이크지만 표시가 정상인 것. 늘어나면 여기에 적는다 */
const LEAK_OK = /^(OPS_PLUS|ERA_PLUS|WHIP_|K_BB)$/;

const findings = [];
const add = (kind, where, detail) => {
  findings.push({ kind, where, detail });
  log(`  [${kind}] ${where}  ${detail}`);
};

const electronBin = process.platform === "win32"
  ? path.join(APP_DIR, "node_modules/electron/dist/electron.exe")
  : path.join(APP_DIR, "node_modules/electron/dist/electron");

let app = null, page = null;
const consoleErrors = [];

async function launch() {
  const env = { ...process.env, VITE_DEV_SERVER_URL: DEV_URL };
  delete env.ELECTRON_RUN_AS_NODE;   // 켜져 있으면 창 없이 돌아 protocol이 undefined다
  app = await electron.launch({
    executablePath: electronBin,
    args: [path.join(APP_DIR, "apps/desktop/main.cjs")],
    env, timeout: 60_000,
  });
  await app.firstWindow();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    page = app.windows().find((w) => !w.url().startsWith("devtools://"));
    if (page) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!page) throw new Error("앱 창을 못 찾았다");
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const t = m.text();
    if (!isNoise(t)) consoleErrors.push(t.slice(0, 200));
  });
  page.on("pageerror", (e) => {
    if (!isNoise(e.message)) consoleErrors.push("[pageerror] " + e.message.slice(0, 200));
  });
  // ⚠ **네이티브 `alert()`가 실제로 쓰인다** (진로 허브의 드래프트 신청).
  // 핸들러가 없으면 Playwright가 알아서 닫긴 하지만, 그러면 **무엇이 떴는지
  // 기록이 안 남는다** — 순회기가 "왜 여기서 멈췄지"를 못 말하게 된다.
  page.on("dialog", async (d) => {
    log(`  (네이티브 창: ${d.type()} "${d.message().slice(0, 60)}")`);
    await d.accept().catch(() => {});
  });
}

const clickText = (t) => page.evaluate((txt) => {
  const els = [...document.querySelectorAll("button, a, [role='button'], li")];
  const el = els.find((e) => e.textContent?.trim() === txt)
          ?? els.find((e) => e.textContent?.includes(txt));
  if (!el) return false;
  el.click(); return true;
}, t);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 화면 하나를 훑는다 — 넘침·빈값 누출·빈 화면 */
async function inspect(where) {
  const r = await page.evaluate(([leakSrc, okSrc]) => {
    const LEAK = new RegExp(leakSrc);
    const LEAK_OK = new RegExp(okSrc);
    const out = { overflow: [], leaks: [], textLen: 0 };

    // 넘침 — **의도된 자름은 빼야 한다.** 첫 실행에서 `.preview`(말줄임)를
    // 3건 잡았는데 그건 설계대로다. 오탐이 나오는 게이트는 곧 무시당한다.
    //
    //   overflow-x: auto|scroll   → 스크롤하라고 만든 것
    //   overflow: hidden + ellipsis → 말줄임으로 자르라고 만든 것
    //
    // 남는 건 "자를 생각이 없었는데 넘친" 경우다 — 그게 실제 결함이었다
    // (목록 카드가 365px 칸에 555px로 삐져나감, BACKLOG §1-E ②).
    for (const el of document.querySelectorAll("div, li, p, section, td")) {
      const st = getComputedStyle(el);
      if (st.overflowX === "auto" || st.overflowX === "scroll") continue;
      if (st.textOverflow === "ellipsis") continue;
      if (st.overflowX === "hidden" && st.whiteSpace === "nowrap") continue;
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 40) {
        out.overflow.push(
          `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`
          + ` ${el.scrollWidth}>${el.clientWidth}`);
      }
      if (out.overflow.length >= 3) break;
    }

    // 빈값 누출 — 보이는 텍스트만
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n, seen = new Set();
    while ((n = walker.nextNode())) {
      const t = n.nodeValue?.trim();
      if (!t) continue;
      const p = n.parentElement;
      if (!p || !p.offsetParent) continue;
      out.textLen += t.length;
      const m = t.match(LEAK);
      if (m && !LEAK_OK.test(m[0]) && !seen.has(m[0])) { seen.add(m[0]); out.leaks.push(m[0]); }
      if (out.leaks.length >= 5) break;
    }
    return out;
  }, [LEAK.source, LEAK_OK.source]);

  for (const o of r.overflow) add("넘침", where, o);
  for (const l of r.leaks)    add("빈값누출", where, l);
  if (r.textLen < 80)         add("빈화면", where, `보이는 글자 ${r.textLen}자`);
}

async function shot(name) {
  // ⚠ **파일명을 씻는다.** 주차를 못 읽으면 `?`가 들어오는데 Windows에서는
  // 못 쓰는 글자다. 저장이 조용히 실패해서, **정작 막힌 순간의 화면만
  // 안 남았다** — 원인을 못 보게 만드는 종류의 실패다(2026-08-08 pro1).
  const safe = name.replace(/[<>:"/\\|?*]/g, "_");
  try {
    await page.evaluate(() => document.documentElement.setAttribute("data-reduce-motion", ""));
    await page.screenshot({ path: path.join(SHOT_DIR, safe + ".png"), timeout: 15_000 });
  } catch (e) {
    // 못 찍는 건 순회를 멈출 이유가 아니다. 다만 **조용히 넘기지는 않는다**
    log(`  (캡처 실패: ${safe} — ${String(e).slice(0, 80)})`);
  }
}

/**
 * 진로 신청 허브는 **커리어에 한 번만 열린다.** 그냥 지나치면 그 안의
 * 대학·독립리그 신청 화면은 순회에서 영영 안 보인다 — 실제로 여기까지
 * 오는 데만 3학년 W44까지 20분이 걸린다. 열렸을 때 하위 화면을 하나씩
 * 열어 검사하고 캡처한다.
 *
 * ⚠ **`.danger`(군입대)는 안 연다** — 즉시 확정이라 커리어가 끝난다.
 * ⚠ 하위 화면은 `취소`로 닫는다. `확인`을 누르면 선택이 확정된다.
 */
let hubToured = false;
async function tourCareerHub() {
  if (hubToured) return;
  const isHub = await page.evaluate(() =>
    [...document.querySelectorAll(".overlay")].some(
      (e) => e.offsetParent && /진로 신청|진로 결정/.test(e.textContent ?? "")));
  if (!isHub) return;
  hubToured = true;
  log("  · 진로 신청 허브 — 하위 화면을 훑는다");
  await inspect("진로 허브");
  await shot("hub-00-허브");

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("button.opt-btn:not(.danger)")]
      .map((b) => (b.textContent ?? "").trim().slice(0, 20)));
  for (let i = 0; i < rows.length; i++) {
    const name = rows[i].replace(/[^가-힣]/g, "") || `행${i}`;
    const opened = await page.evaluate((idx) => {
      const bs = [...document.querySelectorAll("button.opt-btn:not(.danger)")];
      if (!bs[idx]) return false;
      bs[idx].click(); return true;
    }, i);
    if (!opened) continue;
    await sleep(1800);
    await inspect(`진로 허브 · ${name}`);
    await shot(`hub-${String(i + 1).padStart(2, "0")}-${name}`);
    // 취소로 닫는다 — 없으면 허브로 못 돌아온다
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")]
        .find((x) => x.offsetParent && (x.textContent ?? "").trim() === "취소");
      if (b) b.click();
    });
    await sleep(900);
  }
}

/** 주 진행 — 못 넘어가면 막힘으로 잡는다 */
async function advance(n) {
  for (let i = 0; i < n; i++) {
    const before = await page.evaluate(() =>
      document.querySelector("header")?.textContent?.match(/(\d+)주차/)?.[1] ?? "?");
    let moved = false;
    // ⚠ 14로는 모자란다 — 선택 대기가 여러 건 쌓이면 하나씩 풀어야 하고,
    // 그 사이 새 창이 또 뜬다. 24로 올린다(무한 루프 방지는 여전히 필요)
    for (let guard = 0; guard < 24 && !moved; guard++) {
      await tourCareerHub();
      await page.evaluate((turn) => {
        // ⚠ **모달이 떠 있으면 그 안에서만 누른다.** W10에서 막혔는데, 경기
        // 결과 창이 떠 있는데도 순회기가 **그 뒤의 `.item.pending`을 먼저
        // 눌러** 아무 일도 안 일어난 채 14번을 헛돌았다. 화면에 안 닿는
        // 요소를 누르는 건 사람이 할 수 없는 일이라 실제 조작이 아니다.
        const overlay = [...document.querySelectorAll(".overlay, .modal, [role='dialog']")]
          .filter((e) => e.offsetParent).pop();
        const root = overlay ?? document;
        const pick = (sel) => root.querySelector(sel);

        // ⚠ **고정 우선순위로는 못 뚫는다.** 막는 게 무엇이냐에 따라 정답이
        // 달라진다 — 선택 대기면 소식 항목, 경기면 헤더 버튼이다. 한쪽을
        // 앞에 두면 다른 쪽에서 14번을 헛돈다(W2·W4에서 각각 그랬다).
        // **후보를 다 모아 회차마다 돌려 누른다.**
        const cands = [
          pick("button.btn-auto:not([disabled])"),        // 경기 자동 시뮬
          pick("button.opt"),                             // 선택지 고르기
          // ⚠ **닫기가 없는 창이 있다.** 부상 치료·진로 선택은 사용자가 반드시
          // 골라야 하는 일이라 취소 버튼을 안 뒀다. 헤더는 "다음 주 진행"이고
          // 막는 것도 안 보이는데 안 넘어가서 앱 결함처럼 보였다(W12).
          // 카드 자체가 버튼이다 — `.option-card`.
          pick("button.option-card"),
          // ⚠ **진로 신청 허브는 `.opt`가 아니라 `.opt-btn`이다.** 안 잡혀서
          // "후보 없음"이 24번 찍히고 3학년 W44에서 섰다(pro5) — 프로로 가는
          // 관문이라 여기서 막히면 프로 화면은 영영 못 본다.
          //
          // ⚠ **`.danger`는 절대 안 누른다.** 군입대는 "즉시 확정"이라
          // 순회기가 그걸 누르면 **매번 고교에서 커리어가 끝난다.**
          // 되돌릴 수 없는 선택 중에서도 이건 대안이 있는 쪽이다
          // (재기 불가 판정의 "은퇴한다"와 다르다 — 그건 외길이라 누른다).
          pick("button.opt-btn:not(.danger)"),
          pick("button.submit:not([disabled])"),
          overlay ? null : pick("button.item.pending"),   // 선택 대기 열기
          pick(".exit-btn"),
          // ⚠ 클래스 이름이 화면마다 다르다 — 브리핑은 `.confirm-btn`,
          // 경기 창은 **`.btn-confirm`**(순서가 반대다). 짐작하지 말고 둘 다 본다
          pick("button.btn-confirm"),
          pick("button.confirm-btn"),
          [...root.querySelectorAll("button")].find(
            (b) => b.offsetParent && !b.disabled &&
              // 헤더 진행 버튼은 상태에 따라 문구가 바뀐다 —
              // "다음 주 진행" · "경기 대기 중" · "메시지 확인" …
              // ⚠ **되돌릴 수 없는 결말도 눌러야 한다.** UCL 완전 파열로 "재기
              // 불가 판정"이 뜨면 버튼이 `은퇴한다` 하나뿐이라 여기 없으면
              // 순회가 그대로 선다(pro2, 3학년 W16). 앱 결함이 아니라 정상 결말이다
              /다음 주 진행|경기 대기 중|메시지 확인|선택 대기|새 시즌 시작|스킵|확인|닫기|시작|은퇴한다/
                .test(b.textContent ?? "")),
          // ⚠ **문구를 하나씩 추가하는 건 지는 싸움이다.** `진로 선택으로 →`에서
          // 또 "후보 없음"으로 섰다(pro7 W47). 창이 떠 있는데 아무것도 안 걸리면
          // **그 창의 마지막 활성 버튼**을 누른다 — 주 동작은 보통 오른쪽 끝이다.
          // `.danger`는 여기서도 제외한다(군입대 같은 즉시 확정).
          overlay
            ? [...overlay.querySelectorAll("button:not(.danger)")]
                .filter((b) => b.offsetParent && !b.disabled).pop()
            : null,
        ].filter(Boolean);
        // ⚠ **무엇을 눌렀는지 남긴다.** 막혔을 때 "후보가 없었나, 눌렀는데
        // 안 먹었나"를 못 가르면 매번 화면을 눈으로 뜯어봐야 한다.
        window.__walkTrace ??= [];
        if (cands.length === 0) { window.__walkTrace.push(`${turn}: 후보 없음`); return; }
        // ⚠ **선택지가 열려 있으면 무조건 그걸 누른다.** 회전은 "무엇이 막는지
        // 모를 때" 쓰는 것이고, 열린 선택지는 누르면 반드시 하나가 해결된다.
        // 회전에 맡겼더니 **선택 대기가 5건 쌓인 주에서** 절반만 풀고 14번을
        // 다 썼다(pro4 2학년 W31). 관계도를 고치자 동료 이벤트가 한 주에
        // 여러 건 몰리게 된 것이고, 그건 앱 결함이 아니라 순회기 한계였다.
        // ⚠ `신청 완료`도 마찬가지다. 게다가 신청 행(`.opt-btn`)은 **토글**이라
        // 회전에 맡기면 켰다 껐다 하며 제자리를 돈다 — 열리는 즉시 눌러야 한다.
        const sticky = [...root.querySelectorAll("button.opt, button.submit:not([disabled])")]
          .find((b) => b.offsetParent);
        const el = sticky ?? cands[turn % cands.length];
        window.__walkTrace.push(
          `${turn}: ${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").join(".")}` +
          ` "${(el.textContent ?? "").trim().slice(0, 24)}"`);
        el.click();
      }, guard);
      await sleep(700);
      const now = await page.evaluate(() =>
        document.querySelector("header")?.textContent?.match(/(\d+)주차/)?.[1] ?? "?");
      if (now !== before) moved = true;
    }
    if (!moved) {
      const state = await page.evaluate(() => ({
        head: document.querySelector("header")?.textContent?.trim().slice(0, 60) ?? "",
        btns: [...document.querySelectorAll("button")]
          .filter((b) => b.offsetParent && !b.disabled)
          .map((b) => b.textContent?.trim().slice(0, 14)).slice(0, 6).join(" | "),
        trace: (window.__walkTrace ?? []).slice(-24),
      }));
      // 14번 동안 실제로 무엇을 눌렀는지 — 이게 없으면 매번 눈으로 화면을 뜯어야 한다
      for (const t of state.trace) log(`      · ${t}`);
      await page.evaluate(() => { window.__walkTrace = []; });
      // ⚠ **타이틀로 돌아간 것과 게임 안에서 막힌 것은 다른 사건이다.**
      // 앞엣것은 앱이 리셋됐다는 뜻이라 그 뒤 순회는 전부 의미가 없다.
      // 실제 원인은 대개 **순회 중에 소스를 고쳐서 Vite HMR이 리로드한 것**이다
      // (2026-08-08 pro1에서 그랬다 — 앱 결함으로 오해할 뻔했다).
      // 순회를 돌리는 동안에는 파일을 건드리지 않는다.
      const backToTitle = /새 게임|이어하기/.test(state.btns);
      add(backToTitle ? "타이틀복귀" : "진행막힘", `주차 ${before}`,
        backToTitle
          ? `앱이 슬롯 화면으로 돌아갔다 (HMR 리로드? 크래시?) · 버튼[${state.btns}]`
          : `${state.head} · 버튼[${state.btns}]`);
      await shot(`${backToTitle ? "reset" : "stuck"}-w${before}`);
      return false;
    }
  }
  return true;
}

(async () => {
  log("");
  log(`── UI 순회 점검 (${LABEL}, ${WEEKS}주) ────────────────────`);
  try {
    await launch();
    await sleep(2500);

    // **새 게임으로 간다** — 기존 세이브는 오염돼 있을 수 있고, 오염된 세이브는
    // 없는 결함을 만들어 보여준다 (2026-08-08 프로 전환에서 실제로 겪음).
    //
    // ⚠ "새 게임"은 곧장 생성 화면이 아니라 **슬롯 화면**으로 간다.
    // 빈 슬롯을 눌러야 4단계가 열린다.
    if (!(await clickText("새 게임"))) add("진행막힘", "인트로", "새 게임 버튼 없음");
    await sleep(2000);
    await inspect("슬롯 선택");
    await shot("00-slots");

    // ⚠ **자기가 만든 슬롯을 먼저 치운다.** 슬롯은 3개뿐이라 순회를 세 번
    // 돌면 다 차서 네 번째부터 "빈 슬롯이 없다"로 멈춘다 — 반복 실행이
    // 안 되면 루프에 못 쓴다. 이름으로 골라 **내가 만든 것만** 지운다
    // (사용자 세이브는 건드리지 않는다).
    for (let i = 0; i < 3; i++) {
      const removed = await page.evaluate(() => {
        const slot = [...document.querySelectorAll(".slot")]
          .find((e) => e.offsetParent && /순회테스트/.test(e.textContent ?? ""));
        if (!slot) return false;
        const del = slot.querySelector("button.act-btn.danger");
        if (!del) return false;
        del.click(); return true;
      });
      if (!removed) break;
      await sleep(900);
      // 확인 대화(`.confirm-box`) 안에서만 누른다 — 밖을 누르면 취소다
      await page.evaluate(() => {
        const box = document.querySelector(".confirm-box");
        if (!box) return;
        const ok = [...box.querySelectorAll("button")].find(
          (b) => /삭제|확인|예/.test(b.textContent ?? ""));
        if (ok) ok.click();
      });
      await sleep(1200);
    }

    if (!(await clickText("비어 있음"))) {
      add("진행막힘", "슬롯 선택", "빈 슬롯이 없다 — 순회가 만든 슬롯을 못 지웠다");
    }
    await sleep(2500);

    // 4단계: ①기본 정보(이름 입력) ②팀 선택 ③능력치 ④확인
    // 1·2단계는 입력·선택이 있어야 `.btn.next`가 열린다
    for (let step = 1; step <= 6; step++) {
      await inspect(`새 게임 ${step}단계`);
      await shot(`01-step${step}`);

      const acted = await page.evaluate(() => {
        // 이름이 비어 있으면 채운다 (1단계 통과 조건)
        const input = document.querySelector("input[type='text']");
        if (input && !input.value) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value")?.set;
          setter?.call(input, "순회테스트");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          return "이름";
        }
        // 다음이 열려 있으면 누른다
        const next = document.querySelector("button.btn.next:not([disabled])");
        if (next) { next.click(); return "다음"; }
        // 안 열렸으면 뭔가 골라야 한다 — 목록에서 첫 항목
        const pick = [...document.querySelectorAll("button, li, [role='button']")]
          .find((e) => e.offsetParent && !e.disabled
            && /팀|고|중|권역/.test(e.textContent ?? "") && (e.textContent ?? "").length < 30);
        if (pick) { pick.click(); return "선택"; }
        // 마지막 단계 — 시작
        const start = [...document.querySelectorAll("button")].find(
          (b) => b.offsetParent && !b.disabled && /시작/.test(b.textContent ?? ""));
        if (start) { start.click(); return "시작"; }
        return null;
      });
      await sleep(acted === "시작" ? 9000 : 1500);
      if (await page.$(".tab")) break;   // 본 게임에 들어왔다
      if (!acted) { add("진행막힘", `새 게임 ${step}단계`, "누를 게 없다"); break; }
      // 이름을 채웠으면 같은 단계를 한 번 더 (다음이 열렸을 것)
      if (acted === "이름" || acted === "선택") step--;
    }
    await sleep(2000);

    if (!(await page.$(".tab"))) {
      add("진행막힘", "새 게임", "본 게임에 못 들어감 — 4단계 어딘가에서 멈췄다");
    } else {
      // 진행하며 주기적으로 전 탭을 훑는다
      const TABS = ["소식", "나", "팀", "리그", "인물", "일정"];
      // ⚠ **"나" 안에 하위 탭이 또 있다.** 훈련·학업·재정·업적이 거기 있어서
      // 좌측 탭만 훑으면 **훈련 화면을 한 번도 안 본다** — 표를 데이터로
      // 바꾸는 작업(Phase 1)을 하고도 렌더를 못 볼 뻔했다.
      const SUBTABS = { "나": ["훈련", "학업", "재정"] };
      const CHECK_EVERY = Math.max(4, Math.floor(WEEKS / 5));
      for (let w = 0; w < WEEKS; w += CHECK_EVERY) {
        if (!(await advance(CHECK_EVERY))) break;
        // ⚠ **창이 떠 있으면 탭을 훑어도 소용없다.** 실제로 시즌 결산 창에
        // 걸려 6장이 전부 같은 창 사진이었다(pro3 W52). 화면 검사가 통째로
        // 비는데 발견은 0건이라 **훑은 것처럼 보인다** — 제일 나쁜 종류다.
        for (let k = 0; k < 6; k++) {
          const blocked = await page.evaluate(() =>
            [...document.querySelectorAll(".overlay, .modal, [role='dialog']")]
              .some((e) => e.offsetParent));
          if (!blocked) break;
          if (k === 5) { add("검사막힘", "체크포인트", "창이 안 걷혀 탭 검사를 못 했다"); }
          await advance(1);
        }
        const wk = await page.evaluate(() =>
          document.querySelector("header")?.textContent?.match(/(\d+)주차/)?.[1] ?? "?");
        for (const t of TABS) {
          if (!(await clickText(t))) continue;
          await sleep(1200);
          await inspect(`W${wk} ${t}`);
          await shot(`w${wk}-${t}`);
          for (const sub of SUBTABS[t] ?? []) {
            if (!(await clickText(sub))) continue;
            await sleep(1200);
            await inspect(`W${wk} ${t}>${sub}`);
            await shot(`w${wk}-${t}-${sub}`);
          }
        }
      }
    }
  } catch (e) {
    add("크래시", "순회", e.message.split("\n")[0]);
  } finally {
    for (const t of consoleErrors) add("콘솔에러", "-", t);
    try { await app?.close(); } catch { /* 이미 닫혔다 */ }
  }

  log("");
  const byKind = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  log(`  발견 ${findings.length}건  ${JSON.stringify(byKind)}`);
  log(`  스크린샷 → ${SHOT_DIR}`);
  fs.writeFileSync(path.join(SHOT_DIR, "findings.json"),
    JSON.stringify({ label: LABEL, weeks: WEEKS, findings }, null, 2));
  process.exit(findings.length > 0 ? 1 : 0);
})();
