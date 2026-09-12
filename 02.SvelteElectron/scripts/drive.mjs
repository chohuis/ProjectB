// OnePitch Electron REPL 드라이버.
//
// 화면은 자동 테스트가 못 본다 — 이 프로젝트에서 이미 그 종류의 결함이 여러 번
// 나왔다(상무 모달 `curYear` ReferenceError로 모달이 통째로 안 열린 건 등).
// 이 스크립트는 앱을 실제로 띄우고 stdin 명령으로 조작해 스크린샷을 남긴다.
//
// 실행:
//   npm run dev:ui                      # 다른 창에서 Vite (5174)
//   node scripts/drive.mjs              # 이 REPL
//
// Windows에선 xvfb가 필요 없다. 창이 실제로 뜬다.
import { _electron as electron } from "playwright-core";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = process.env.SCREENSHOT_DIR
  ?? path.join(APP_DIR, "resource/logs/shots");
fs.mkdirSync(SHOT_DIR, { recursive: true });

const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5174";

let app = null;
let page = null;

const electronBin = process.platform === "win32"
  ? path.join(APP_DIR, "node_modules/electron/dist/electron.exe")
  : process.platform === "darwin"
    ? path.join(APP_DIR, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron")
    : path.join(APP_DIR, "node_modules/electron/dist/electron");

const COMMANDS = {
  async launch() {
    if (app) return console.log("already launched");
    // ⚠ **`ELECTRON_RUN_AS_NODE`를 반드시 지운다.**
    // 이 프로젝트의 헤드리스 테스트가 전부 그 변수를 쓰기 때문에 셸에 남아 있기
    // 쉬운데, 켜져 있으면 Electron이 창 없이 순수 Node로 돌아 `protocol`이
    // undefined가 된다 — main.cjs가 153줄에서 죽고 Playwright는
    // "Process failed to launch!"만 뱉어 원인이 안 보인다.
    // 🔴 **`DRIVE_EXE` 가 있으면 패키지 실행파일을 띄운다** (2026-09-02 · smoke:dist).
    //   `release/win-unpacked/OnePitch.exe` 는 dist/ui 를 자기 안에서 읽으므로
    //   Vite 주소도, main.cjs 인자도 넘기지 않는다 — 넘기면 dev 모드로 오해한다.
    //   나머지(임시 저장소·창 고르기·스크린샷)는 같다.
    const packed = process.env.DRIVE_EXE
      ? path.resolve(APP_DIR, process.env.DRIVE_EXE)
      : null;
    if (packed && !fs.existsSync(packed)) {
      fail(`ERROR: DRIVE_EXE 가 없다: ${packed} — 먼저 npm run pack`);
      return;
    }
    const env = packed
      ? { ...process.env }
      : { ...process.env, VITE_DEV_SERVER_URL: DEV_URL };
    delete env.ELECTRON_RUN_AS_NODE;

    app = await electron.launch({
      executablePath: packed ?? electronBin,
      // ⚠ **`DRIVE_USER_DATA=1`이면 임시 저장소로 띄운다.**
      // 세이브 슬롯이 셋뿐이라 다 차 있으면 새 게임을 못 만든다. 확인하려고
      // 사용자 세이브를 지우거나 앞으로 돌리면 **그 세이브가 바뀐다** —
      // 화면 확인은 새 게임으로 하라는 규칙과도 어긋난다.
      args: [
        ...(packed ? [] : [path.join(APP_DIR, "apps/desktop/main.cjs")]),
        // `DRIVE_USER_DATA=<존재하는 폴더>` 면 그 폴더를 userData 로 쓴다 (2026-09-02 · 구 세이브 마이그레이션 확인용 —
        // 사용자 세이브를 **복사한** 폴더를 넘긴다. 원본 폴더를 넘기지 마라: 앱이 열면서 고친다)
        ...(process.env.DRIVE_USER_DATA
          ? ["--user-data-dir=" + (process.env.DRIVE_USER_DATA !== "1" && fs.existsSync(process.env.DRIVE_USER_DATA)
              ? path.resolve(process.env.DRIVE_USER_DATA)
              : fs.mkdtempSync(path.join(os.tmpdir(), "drive-udd-")))]
          : []),
      ],
      env,
      timeout: 60_000,
    });
    // ⚠ **`firstWindow()`는 DevTools를 준다.** dev 모드에서 main.cjs가
    // devtools를 열기 때문에 창이 둘이고 그쪽이 먼저 잡힌다. URL로 골라야 한다.
    await app.firstWindow();
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      page = app.windows().find((w) => !w.url().startsWith("devtools://"));
      if (page) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!page) { fail("ERROR: 앱 창을 못 찾았다"); return; }
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    } catch { /* 무시하고 아래에서 상태를 찍는다 */ }
    page.on("console", (m) => {
      const t = m.type();
      if (t === "error" || t === "warning") console.log(`[page ${t}]`, m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));
    console.log("launched:", page.url());
  },

  async ss(name) {
    if (!page) return fail("ERROR: launch first");
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + ".png");
    // ⚠ `animations: "disabled"`는 애니메이션을 **되감아 멈추길 기다린다.**
    // 주자 스프라이트(`gbcBlink`)처럼 무한 반복이면 그 대기가 안 끝나 타임아웃이
    // 난다. 깜박이는 한 컷이 못 찍는 것보다 낫다 — 기다리지 않는다.
    //
    // 대신 앱의 "애니메이션 줄이기"를 잠깐 켠다. 이건 CSS가 즉시 반응하므로
    // 되감기를 기다리지 않는다.
    const hadReduce = await page.evaluate(() => {
      const had = document.documentElement.hasAttribute("data-reduce-motion");
      document.documentElement.setAttribute("data-reduce-motion", "");
      return had;
    }).catch(() => true);
    try {
      await page.screenshot({ path: f, animations: "allow", timeout: 20_000 });
      console.log("screenshot:", f);
    } catch (e) {
      console.log("screenshot 실패:", e.message.split("\n")[0]);
    } finally {
      // 원래 꺼져 있었으면 되돌린다 — 찍느라 앱 상태를 바꿔 두면 안 된다
      if (!hadReduce) {
        try {
          await page.evaluate(() => document.documentElement.removeAttribute("data-reduce-motion"));
        } catch { /* 창이 닫혔을 수 있다 */ }
      }
    }
  },

  /** DOM 클릭 — 좌표 계산을 안 거치므로 겹친 레이어에 안 막힌다 */
  async click(sel) {
    if (!page) return fail("ERROR: launch first");
    console.log("click", sel, "→", await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return "NOT_FOUND";
      el.click(); return "OK";
    }, sel));
  },

  async "click-text"(text) {
    if (!page) return fail("ERROR: launch first");
    console.log("click-text", JSON.stringify(text), "→", await page.evaluate((t) => {
      const els = [...document.querySelectorAll("button, a, [role='button'], li, td, tr")];
      const el = els.find((e) => e.textContent?.trim() === t)
              ?? els.find((e) => e.textContent?.includes(t));
      if (!el) return "NOT_FOUND";
      el.click(); return "OK: " + el.tagName + " " + (el.className || "");
    }, text));
  },

  async dblclick(sel) {
    if (!page) return fail("ERROR: launch first");
    console.log("dblclick", sel, "→", await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return "NOT_FOUND";
      el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      return "OK";
    }, sel));
  },

  /** fill <css-sel>|<값> — Svelte가 듣도록 input 이벤트까지 보낸다 */
  async fill(arg) {
    if (!page) return fail("ERROR: launch first");
    const [sel, ...rest] = arg.split("|");
    try {
      await page.fill(sel.trim(), rest.join("|"));
      console.log("fill", sel.trim(), "→ OK");
    } catch (e) { fail("fill ERROR:", e.message.split("\n")[0]); }
  },

  async type(t) { if (page) await page.keyboard.type(t, { delay: 25 }); },
  async press(k) { if (page) await page.keyboard.press(k); },

  async wait(sel) {
    if (!page) return fail("ERROR: launch first");
    try { await page.waitForSelector(sel, { timeout: 20_000 }); console.log("found:", sel); }
    catch { console.log("TIMEOUT:", sel); }
  },

  async sleep(ms) { await new Promise((r) => setTimeout(r, Number(ms) || 1000)); console.log("slept", ms); },

  /**
   * advance <n> — n주 진행. 막는 것들을 스스로 치운다.
   *
   * 주간 진행은 pendingAction 하나만 걸려도 멈춘다(이벤트 선택·메시지·브리핑).
   * 한 주씩 손으로 스크립트를 짜면 금방 수십 줄이 되므로 여기서 돌린다.
   * **경기 화면(MatchPage)이 뜨면 즉시 멈춘다** — 그게 보통 보러 온 것이다.
   */
  /** advance <n> [멈출 CSS 선택자] */
  async advance(nArg) {
    if (!page) return fail("ERROR: launch first");
    const parts = String(nArg).trim().split(/\s+/);
    const n = Number(parts[0]) || 1;
    // `--auto` — 경기를 직접 플레이하지 않고 자동 시뮬로 넘긴다.
    // 경기 밖 화면(리그·대회 등)을 보려면 경기에서 멈추면 안 된다.
    const auto = parts.includes("--auto");
    const stopSel = parts.slice(1).filter((x) => x !== "--auto").join(" ") || null;
    const weekText = () => page.evaluate(() => document.querySelector(".wk")?.innerText ?? "");
    for (let i = 0; i < n; i++) {
      const wkBefore = await weekText();
      // 🔴 **가드를 12→20으로 올린다** (2026-09-11 · 선택 대기 둘 겹침 실측).
      //   소식이 둘 겹치면 "열기·고르기·확인" 이 항목마다 최대 3번씩 든다 —
      //   12는 둘을 겨우 채우는 값이라 셋 이상 겹치면 다시 부족해진다.
      const seenStates = new Map();
      let stuckState = null;
      for (let guard = 0; guard < 20; guard++) {
        const state = await page.evaluate(({ stopSel, auto }) => {
          // 보러 온 화면에 닿으면 멈춘다
          if (stopSel && document.querySelector(stopSel)) return "MATCH";
          if (!auto && document.querySelector(".retro-field, .scoreboard-wrap")) return "MATCH";
          // 경기 화면에 들어와 있으면 나간다 (--auto)
          const exit = document.querySelector(".exit-btn");
          if (auto && exit) { exit.click(); return "EXIT"; }
          // 경기로 가는 길: 브리핑 → 경기 상태 → 직접 플레이(또는 자동 시뮬)
          const sim = document.querySelector("button.btn-auto:not([disabled])");
          if (auto && sim) { sim.click(); return "SIM"; }
          const play = auto ? null : document.querySelector("button.btn-play:not([disabled])");
          if (play) { play.click(); return "PLAY"; }
          const brief = document.querySelector("button.confirm-btn");
          if (brief) { brief.click(); return "BRIEF"; }
          // 선택 대기 — 소식의 선택지 버튼(방금 연 항목의 첫 선택)
          const opt = document.querySelector("button.opt");
          if (opt) { opt.click(); return "CHOSE"; }

          // ── 지금 열려 있는 항목을 "마저" 끝내는 것들 — pending 재오픈보다 먼저 본다 ──
          //
          // 🔴 **소식이 둘 겹치면 여기가 순서를 정한다** (2026-09-11 실측·확정).
          //   `.item.pending` 은 `selectedOptionId === null`인 동안 계속
          //   "선택 대기"로 남는다 — **확인 단계(예: RoleChoicePanel의
          //   `pendingPick` 세팅)에 들어간 뒤에도 그렇다.** 예전엔 이 확인용
          //   버튼들(INJURY·HUB·CONTRACT·CAREER_PICK·ROLE_GO)을 `.item.pending`
          //   **뒤에** 뒀다 — 그러면 항목이 둘일 때, 하나를 확인 단계까지
          //   보내 놓고도 다음 바퀴에서 `.item.pending`(그 항목 자신이거나
          //   남은 다른 항목)을 **다시 여는 쪽이 먼저 걸려** 확인 버튼을
          //   영영 못 눌렀다 — 가드를 다 쓰고 "치웠는데도 그대로"로 멈췄다.
          //   지금 열린 항목을 끝내는 액션을 **먼저** 보고, 더 열 것이 없을
          //   때만 다음 pending 을 연다.
          //
          // ⚠ **닫기가 없다.** 부상 치료·진로 선택·계약은 사용자가 결정해야
          // 하는 일이라 취소 버튼이 없고, 그래서 `.go`가 disabled로 남는다.
          // 여기서 안 골라 주면 드라이버가 `STUCK:go가 disabled`로 멈춘다.
          //
          // ⚠ **클래스만 보고 아무거나 누르면 안 된다.** 진로 허브와 계약
          // 협상의 `.opt-btn`은 결정이 아니라 **설정 토글**이라 누르면 켰다
          // 껐다만 반복하고, 허브의 `.opt-btn.danger`는 **즉시 입대**다.
          // 모달마다 "진행되는 버튼"을 따로 짚는다.

          // 부상 치료 — 첫 번째 치료법을 고른다
          const injury = document.querySelector(".option-card");
          if (injury) { injury.click(); return "INJURY"; }

          // ── 진로 신청 하위 모달(대학·독립 팀 고르기) — 허브보다 먼저 끝낸다 ──
          //
          // 🔴 **허브가 드래프트만 신청하고 있었다** (2026-09-12 · C 제보).
          //   아래 허브 갈래가 「첫 `.opt-btn`」을 눌렀는데 그게 **드래프트**라,
          //   켜지자마자 `신청 완료` 가 열려 **대학·독립은 신청조차 안 했다.**
          //   화면으로 보던 판이 늘 드래프트로 간 이유다 — 헤드리스 계측이
          //   대학으로만 가던 것과 **정반대 방향의 같은 편향**이다.
          //   대학·독립은 버튼이 **하위 모달을 열 뿐**이라 거기서 팀을 골라야
          //   ✓ 가 붙는다. 그 모달을 먼저 끝낸다.
          const applyFooter = document.querySelector("footer.actions button.ghost");
          if (applyFooter) {
            const ok = [...document.querySelectorAll("footer.actions button")]
              .find((b) => b.innerText.trim() === "확인");
            if (ok && !ok.disabled) { ok.click(); return "APPLY_OK"; }
            const pick = document.querySelector("button.pick-btn:not([disabled])");
            if (pick) { pick.click(); return "APPLY_PICK"; }
            // 아직 아무 팀도 안 열었다 — 목록 첫 줄을 연다
            const row = document.querySelector(".rows button:not([disabled])");
            if (row) { row.click(); return "APPLY_ROW"; }
            // 고를 팀이 없다(자격 미달 등) — 취소하고 허브로 돌아간다
            applyFooter.click(); return "APPLY_CANCEL";
          }

          // 진로 허브 — **셋 다 신청하고** 신청 완료.
          // `.danger`(즉시 입대)는 절대 안 누른다.
          // ⚠ ✓ 가 붙은 것은 다시 안 누른다 — 드래프트는 토글이라 두 번 누르면 꺼진다.
          const hubSubmit = document.querySelector("button.submit");
          if (hubSubmit) {
            const todo = [...document.querySelectorAll("button.opt-btn")]
              .filter((b) => !b.classList.contains("danger") && !b.innerText.includes("✓"));
            if (todo.length) { todo[0].click(); return "HUB_TOGGLE"; }
            if (!hubSubmit.disabled) { hubSubmit.click(); return "HUB_SUBMIT"; }
          }

          // 드래프트 참관 — 스킵한다(참관은 중계를 끝까지 본다 · 드라이버는 결과만 필요하다)
          const draftSkip = document.querySelector(".btn-secondary:not([disabled])");
          if (draftSkip) { draftSkip.click(); return "DRAFT_SKIP"; }

          // 진로 결과 — 「결과 확인 →」·「드래프트 보드 확인 →」을 다 펴야
          // 아래 「진로 선택으로 →」가 열린다(`canProceed`)
          const reveal = document.querySelector("button.reveal-btn:not([disabled])");
          if (reveal) { reveal.click(); return "REVEAL"; }
          // 다 폈으면 「진로 선택으로 →」 — 클래스가 없어 글자로 짚는다
          const toPick = [...document.querySelectorAll(".actions button")]
            .find((b) => !b.disabled && b.innerText.includes("진로 선택으로"));
          if (toPick) { toPick.click(); return "TO_PICK"; }

          // 체육부대 지원 — **신청한다.** 붙으면 야구를 계속하므로 누구에게나 낫다
          //   (헤드리스 `runAutoAdvance` 와 같은 규칙 — 정본이 둘이 되면 안 된다)
          const sportsApply = document.querySelector("button.btn-apply:not([disabled])");
          if (sportsApply) { sportsApply.click(); return "SPORTS_APPLY"; }
          // 탈락 뒤 「현역 입대 / 다음 시즌으로」 — **미룬다**(화면을 계속 보려고)
          const decline = document.querySelector("button.btn-decline:not([disabled])");
          if (decline) { decline.click(); return "DECLINE"; }

          // 시즌 결산 — 「새 시즌 시작」. 이 모달의 출구는 이것 하나뿐이다
          const newSeason = document.querySelector("button.btn-next:not([disabled])");
          if (newSeason) { newSeason.click(); return "NEW_SEASON"; }

          // 계약 협상 — 팀 제시를 그대로 받는다 (역제안·거부는 안 고른다)
          const acceptOffer = document.querySelector("button.btn-accept:not([disabled])");
          if (acceptOffer) { acceptOffer.click(); return "CONTRACT"; }

          // 진로 결과에서 갈 곳 고르기 — 첫 번째(대개 드래프트).
          // ⚠ 허브(`button.submit`)와 계약(`button.btn-accept`)에도 `.opt-btn`이
          // 있는데 그쪽은 **설정 토글**이라 여기서 누르면 무한 반복이 된다.
          // 두 모달이 없을 때만 진로 결과로 본다.
          const otherModal = document.querySelector("button.submit, button.btn-accept");
          const resultPick = document.querySelector(".opt-btn:not(.danger)");
          if (resultPick && !otherModal) { resultPick.click(); return "CAREER_PICK"; }
          // 보직 선택 확인 — **헤더의 주 진행 버튼과 클래스가 겹친다** (C 제보 ㉯).
          // `RoleChoicePanel` 의 확인은 `.confirm .btn.go` 이고 헤더는 `.go:not(.btn)` 이다.
          // 그냥 `.go` 로 물으면 DOM 순서상 **헤더 것이 먼저 잡혀** 보직이 영영 안 정해지고,
          // 그 상태로 주 진행을 눌러 봐야 pending 이 그대로라 W1 을 못 넘긴다.
          // ⚠ 갈래를 고르는 것은 **위의 `button.opt`** 가 이미 한다 —
          //   `.dec-opts` 와 `.confirm` 은 서로 배타라(`{#if pendingPick === null}`)
          //   고르고 나면 `.opt` 이 사라지고 이 확인만 남는다. 여기서 또 짚으면 죽은 줄이다
          const roleGo = document.querySelector(".confirm .btn.go:not([disabled])");
          if (roleGo) { roleGo.click(); return "ROLE_GO"; }

          // 선택 대기 항목이 접혀 있으면 펼친다 — **위의 "마저 끝내기" 액션들이
          // 전부 없을 때만** 다음 항목을 연다(둘 겹침 대응, 위 주석 참고)
          const pend = document.querySelector(".item.pending");
          if (pend) { pend.click(); return "OPENED"; }

          // 모달의 확인/닫기류
          const btns = [...document.querySelectorAll("button")];
          const confirm = btns.find((b) => /^(확인|닫기|계속|시작|넘어가기)$/.test(b.innerText.trim()));
          if (confirm) { confirm.click(); return "CONFIRM"; }
          // 🔴 **`.go` 는 pending 이 있어도 disabled 가 아니다** (C 제보 ㉮).
          //   `TopHeader.handleAdvance` 는 `$hasPendingAction` 이면 버튼을 잠그는 대신
          //   **그 화면을 연다.** 그래서 「비활성이면 막힌 것」이라는 전제로 짜면
          //   같은 pending 만 다시 열며 `GO` 를 63번 뱉고 **한 주도 안 간다**(실측).
          //   여기서는 눌러 보되, **주가 실제로 바뀌었는지는 바깥(Node)이 확인한다** —
          //   안 바뀌면 `GO` 를 주 진행으로 세지 않고 계속 막는 것을 치운다.
          const go = document.querySelector(".go:not(.btn)");
          if (go && !go.disabled) { go.click(); return "GO"; }
          // 왜 막혔는지 말한다 — "STUCK"만 던지면 앱을 다시 띄워 손으로 뒤져야 한다
          return "STUCK:" + (go ? (go.disabled ? "go가 disabled" : "?") : ".go 없음")
            + " | " + (document.body.innerText.slice(0, 60).replace(/\s+/g, " "));
        }, { stopSel, auto });
        if (state === "MATCH") { console.log(`week ${i}: 목표 화면 도달`); return; }
        seenStates.set(state, (seenStates.get(state) ?? 0) + 1);
        await new Promise((r) => setTimeout(r, state === "GO" || state === "SIM" ? 5000 : 1200));
        // GO 를 눌렀는데 **주차 표시가 그대로면 주가 안 간 것이다** — pending 화면만
        // 열렸을 뿐이다(㉮). 다음 바퀴에서 그걸 치운다
        if (state === "GO" && (await weekText()) !== wkBefore) break;
        if (state.startsWith("STUCK")) { stuckState = state; break; }
      }
      const label = await page.evaluate(() => document.querySelector(".go:not(.btn)")?.innerText ?? "(없음)");
      const wk = await weekText();
      if (wk === wkBefore) {
        // 🔴 **어느 상태가 막았는지 적는다** — `runAutoAdvance.ts`의 `stall()`이
        //   "반복 pending: X×N"을 적는 것과 같은 이유다. 여기서 안 밝히면
        //   다음 사람이 이번처럼 화면을 다시 띄워 손으로 파야 한다.
        const guardUsed = [...seenStates.values()].reduce((a, b) => a + b, 0);
        const top = [...seenStates.entries()].sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${k}×${n}`).join(" · ");
        console.log(`  week ${i + 1}: 주가 안 넘어갔다 (${wk}) — 막는 것을 ${guardUsed}번 치우고도 그대로다`
          + (stuckState ? ` · 마지막: ${stuckState}` : "") + (top ? ` · 상태 분포: ${top}` : ""));
        return;
      }
      console.log(`  week ${i + 1}: ${wk} · 버튼 "${label}"`);
    }
  },

  async eval(expr) {
    if (!page) return fail("ERROR: launch first");
    try { console.log(JSON.stringify(await page.evaluate(expr), null, 1)); }
    catch (e) { fail("ERROR:", e.message); }
  },

  async text(sel) {
    if (!page) return fail("ERROR: launch first");
    const t = await page.evaluate((s) => (s ? document.querySelector(s) : document.body)?.innerText ?? "(null)", sel || null);
    console.log(t.slice(0, 3000));
  },

  async windows() {
    if (!app) return fail("ERROR: launch first");
    for (const w of app.windows()) console.log(" ", w.url());
  },

  /**
   * 창 크기를 바꾼다 — `resize 1366x768`
   *
   * 🔴 **`page.setViewportSize()` 는 Electron 에서 안 먹는다.** 창 자체를
   *   바꿔야 한다. 그래서 해상도별 확인을 하려면 이 명령이 필요하다 —
   *   없이 찍으면 전부 최대화 크기로 나온다(실제로 스크린샷 5장 중
   *   경기 화면만 1920×1079 로 찍혔다).
   *
   * ⚠ **최대화·전체화면을 먼저 풀어야 `setContentSize` 가 먹는다.**
   *   안 풀면 **조용히 무시**되고 계속 최대 크기로 찍힌다 — 오류도 안 난다.
   * ⚠ `setMinimumSize(1,1)` 도 필요하다. 최소 크기가 걸려 있으면
   *   작은 해상도(1280×720)에서 그만큼만 줄어든다.
   */
  async resize(arg) {
    if (!app) return fail("ERROR: launch first");
    const m = String(arg).trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (!m) return console.log("usage: resize 1366x768");
    const w = Number(m[1]), h = Number(m[2]);
    const got = await app.evaluate(({ BrowserWindow }, s) => {
      // ⚠ DevTools 창을 고르면 엉뚱한 걸 줄인다 — url 로 거른다
      const win = BrowserWindow.getAllWindows()
        .find((x) => !x.webContents.getURL().startsWith("devtools://"));
      if (!win) return null;
      if (win.isFullScreen()) win.setFullScreen(false);
      if (win.isMaximized()) win.unmaximize();
      win.setResizable(true);
      win.setMinimumSize(1, 1);
      win.setContentSize(s.w, s.h);
      const [cw, ch] = win.getContentSize();
      return { cw, ch };
    }, { w, h });
    if (!got) return fail("ERROR: window not found");
    // 실제로 그 크기가 됐는지 되읽는다 — 조용히 무시되는 걸 잡는다
    console.log(`resize → ${got.cw}x${got.ch}` +
      (got.cw !== w || got.ch !== h ? `  ⚠ 요청 ${w}x${h} 와 다르다` : ""));
  },

  async quit() { if (app) await app.close().catch(() => {}); app = null; page = null; },
  help() { console.log("commands:", Object.keys(COMMANDS).join(", ")); },
};

// 🔴 **ERROR 를 찍었으면 실패로 끝낸다.** smoke:dist 가 launch 에서 60초 타임아웃을
// 내고 뒤 명령 여덟 개가 전부 "launch first" 였는데 종료 코드가 0 이었다 —
// 게이트로 못 쓴다. 스크립트 모드는 ERROR 가 한 줄이라도 있으면 1 로 끝난다.
let failed = false;
function fail(...parts) { failed = true; console.log(...parts); }

async function run(line) {
  const s = line.trim();
  if (!s || s.startsWith("#")) return;
  const i = s.indexOf(" ");
  const cmd = i < 0 ? s : s.slice(0, i);
  const arg = i < 0 ? "" : s.slice(i + 1);
  const fn = COMMANDS[cmd];
  if (!fn) return console.log("unknown:", cmd, "— try: help");
  try { await fn(arg); } catch (e) { fail("ERROR:", e.message); }
}

console.log("dev server:", DEV_URL, "· shots →", SHOT_DIR);

// 스크립트 모드 — 명령을 한 줄씩 적은 파일을 주면 다 돌고 끝난다.
// tmux가 없는 환경(Windows Git Bash)에서 REPL을 원격 조작할 수 없어 넣었다.
const scriptArg = process.argv[2];
if (scriptArg) {
  const lines = fs.readFileSync(scriptArg, "utf8").split(/\r?\n/);
  for (const l of lines) {
    if (l.trim() && !l.trim().startsWith("#")) console.log(`\n$ ${l.trim()}`);
    await run(l);
  }
  await COMMANDS.quit();
  process.exit(failed ? 1 : 0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "driver> " });
rl.on("line", async (line) => {
  await run(line);
  if (line.trim() === "quit") { rl.close(); process.exit(0); }
  rl.prompt();
});
rl.on("close", async () => { await COMMANDS.quit(); process.exit(0); });

console.log('OnePitch driver — "help" for commands, "launch" to start');
rl.prompt();
