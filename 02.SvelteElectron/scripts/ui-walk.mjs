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
  try {
    await page.evaluate(() => document.documentElement.setAttribute("data-reduce-motion", ""));
    await page.screenshot({ path: path.join(SHOT_DIR, name + ".png"), timeout: 15_000 });
  } catch { /* 한 컷 못 찍는 게 순회가 멈추는 것보다 낫다 */ }
}

/** 주 진행 — 못 넘어가면 막힘으로 잡는다 */
async function advance(n) {
  for (let i = 0; i < n; i++) {
    const before = await page.evaluate(() =>
      document.querySelector("header")?.textContent?.match(/(\d+)주차/)?.[1] ?? "?");
    let moved = false;
    for (let guard = 0; guard < 14 && !moved; guard++) {
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
              /다음 주 진행|경기 대기 중|메시지 확인|선택 대기|새 시즌 시작|스킵|확인|닫기|시작/
                .test(b.textContent ?? "")),
        ].filter(Boolean);
        if (cands.length === 0) return;
        cands[turn % cands.length].click();
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
      }));
      add("진행막힘", `주차 ${before}`, `${state.head} · 버튼[${state.btns}]`);
      await shot(`stuck-w${before}`);
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
      const CHECK_EVERY = Math.max(4, Math.floor(WEEKS / 5));
      for (let w = 0; w < WEEKS; w += CHECK_EVERY) {
        if (!(await advance(CHECK_EVERY))) break;
        const wk = await page.evaluate(() =>
          document.querySelector("header")?.textContent?.match(/(\d+)주차/)?.[1] ?? "?");
        for (const t of TABS) {
          if (!(await clickText(t))) continue;
          await sleep(1200);
          await inspect(`W${wk} ${t}`);
          await shot(`w${wk}-${t}`);
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
