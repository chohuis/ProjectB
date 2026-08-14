// 변이 검증 — 로직을 일부러 깨뜨려 검사가 잡는지 본다.
// 사용: node mutate.cjs <소스경로> <검사경로[,검사경로...]> <변이JSON경로>
//       JSON: [["설명", "원래 문자열", "바꿀 문자열"], ...]
const fs = require("fs");
const { execFileSync } = require("child_process");

const ROOT = require("path").resolve(__dirname, "../..");
const GODOT = process.env.USERPROFILE + "/Godot/Godot_v4.6.1-stable_win64_console.exe";

const [srcRel, testRel, mutRel] = process.argv.slice(2);
const SRC = ROOT + "/" + srcRel;
// ⚠ **줄바꿈이 CRLF면 여러 줄짜리 변이가 조용히 안 붙는다.** `git checkout`이
// 파일을 CRLF로 되돌리자 28건 중 20건이 건너뛰어졌는데 요약은 "8/8 검출"이었다.
// 원본 바이트는 복구용으로 남기고, 맞출 때는 LF로 정규화한다.
const originalRaw = fs.readFileSync(SRC, "utf8");
const original = originalRaw.replace(/\r\n/g, "\n");
const mutations = JSON.parse(fs.readFileSync(mutRel, "utf8"));

// ⚠ **쓰자마자 돌리면 Godot이 옛 내용을 읽는 때가 있다.** 같은 변이가 실행마다
// 잡히기도 안 잡히기도 했다 — 손으로 넣고 4번 돌리면 4번 다 잡히므로 Godot이
// 아니라 여기가 문제였다. 쓴 뒤 mtime을 밀고 되읽어 확인한다.
function writeAndVerify(content) {
  fs.writeFileSync(SRC, content);
  const t = new Date(Date.now() + 2000);
  fs.utimesSync(SRC, t, t);
  if (fs.readFileSync(SRC, "utf8") !== content) throw new Error("파일 쓰기가 반영 안 됨");
}

function runTests() {
  let out = "", timedOut = false;
  try {
    // ⚠ **검사가 여러 벌일 수 있다.** 한 모듈이 화면·시뮬 양쪽에서 쓰이면
    // 한 벌만 돌려서는 "못 잡음"이 사실인지 그 벌이 안 볼 뿐인지 못 가린다
    const suites = testRel.split(",").flatMap((t) => ["-a", t.trim()]);
    out = execFileSync(GODOT, ["--headless", "-s", "addons/gdUnit4/bin/GdUnitCmdTool.gd",
      "--ignoreHeadlessMode", ...suites],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        // 무한 루프를 만드는 변이가 있다(순환 참조 가드 제거). 그때 검사는
        // 실패하는 게 아니라 안 끝난다 — 멈춤도 검출로 센다
        timeout: 90_000, killSignal: "SIGKILL" });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
    timedOut = e.killed === true || e.signal === "SIGKILL";
  }
  // Godot이 ANSI 색을 섞어 낸다 — 안 벗기면 요약을 못 읽고 판정이 통째로 가짜가 된다
  const plain = out.replace(/\x1b\[[0-9;]*m/g, "");
  let m = plain.match(/Overall Summary:\s*(\d+) test cases \| (\d+) errors \| (\d+) failures/);
  // 검사 한 벌만 돌리면 Godot이 `Overall Summary`를 안 낸다. **한 줄일 때만**
  // 받는다 — 여러 줄 중 첫 줄을 집으면 나머지를 안 보고 "잡힘"이라 우긴다
  if (!m) {
    const stats = [...plain.matchAll(
      /Statistics:\s*(\d+) test cases \| (\d+) errors \| (\d+) failures/g)];
    if (stats.length === 1) m = stats[0];
  }
  return { timedOut, m };
}

let ok = 0, judged = 0, skipped = 0;
try {
  for (const [name, from, to] of mutations) {
    if (!original.includes(from)) { skipped++; console.log(`✗ ${name} — 대상 문자열 없음`); continue; }
    const mutated = original.replace(from, to);
    if (mutated === original) { skipped++; console.log(`✗ ${name} — 바뀐 게 없다`); continue; }

    writeAndVerify(mutated);
    let r = runTests();
    // "못 잡음"은 검사를 고치게 만드는 방향이라 한 번 더 확인한다
    if (!r.timedOut && r.m && Number(r.m[2]) + Number(r.m[3]) === 0) {
      writeAndVerify(mutated);
      r = runTests();
    }

    if (r.timedOut) { judged++; ok++; console.log(`○ 잡힘(멈춤)  ${name}  — 90초 안에 안 끝남`); continue; }
    if (!r.m) { console.log(`? 판정불가  ${name}`); continue; }
    judged++;
    const caught = Number(r.m[2]) + Number(r.m[3]) > 0;
    if (caught) ok++;
    console.log(`${caught ? "○ 잡힘" : "✗ 못 잡음"}  ${name}  (${r.m[1]}중 ${r.m[2]}오류 ${r.m[3]}실패)`);
  }
} finally {
  // 중간에 죽어도 원본은 되돌린다 — 변이가 남은 채로 커밋되면 최악이다
  fs.writeFileSync(SRC, originalRaw);
}
// ⚠ **안 붙은 변이를 크게 알린다.** 요약만 보면 "8/8 검출"이라 통과처럼 보인다
if (skipped > 0) {
  console.log(`\n⚠ 안 붙은 변이 ${skipped}건 — 목록이 코드와 어긋났다. 고치기 전엔 결과를 믿지 않는다`);
}
console.log(`${ok}/${judged} 검출 (변이 ${mutations.length}건 중 ${skipped}건 건너뜀)`);
process.exit(skipped > 0 || ok !== judged ? 1 : 0);
