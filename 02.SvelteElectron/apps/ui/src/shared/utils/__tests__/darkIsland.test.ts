import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * **어두운 섬 검사.** (U5)
 *
 * 전역 지면이 밝아졌으므로(`styles.css`) 아직 안 옮긴 어두운 화면은
 * 자기 글자색을 스스로 정해야 한다. 안 정하면 전역 `--ink`(거의 검정)를
 * 물려받아 **검은 바탕에 검은 글씨**가 된다.
 *
 * U5에서 이 검사를 손으로 돌려 파일 4개를 찾아 고쳤다. U7·U9·U10에서
 * 같은 실수가 또 날 자리라 테스트로 남긴다 — 화면을 눈으로 봐야만 보이는
 * 종류의 결함이고, 그때는 이미 커밋된 뒤다.
 */

const SRC = join(process.cwd(), "apps/ui/src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".svelte")) out.push(p);
  }
  return out;
}

function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const RULE = /([^{}]+)\{([^{}]*)\}/g;
const BG   = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/;
const COL  = /(?<!-)\bcolor\s*:\s*([^;}]+)/;

/** 어두운 바탕 위에서 읽히는 토큰 — hex가 아니라 변수로 쓴 경우 */
const LIGHT_TOKENS = ["--ink-on-dark", "--t-gold", "--attn", "--surface", "--panel"];

/**
 * ⚠ **판정은 명도가 아니라 대비다.**
 * 처음엔 "글자 명도 > 0.3"으로 봤는데 `#2a1010` 위의 `#e07070`(명도 0.285)이
 * 걸렸다 — 대비 4.4:1로 멀쩡히 읽히는 짝이다. U0에서 골드 파생하며 똑같은
 * 실수를 했고 같은 결론이 났다.
 */
function isReadableOn(bgHex: string, colorValue: string): boolean {
  const v = colorValue.trim();
  if (LIGHT_TOKENS.some((tok) => v.includes(tok))) return true;
  const hex = /#[0-9a-fA-F]{3,8}/.exec(v);
  if (!hex) return false;              // rgba()·currentColor 등은 판정 보류
  try { return contrast(bgHex, hex[0]) >= 3; } catch { return false; }
}

/**
 * 이 검사는 **아직 안 옮긴 화면만** 본다.
 *
 * 토큰(`var(--ink…)`·`var(--panel…)`)을 쓰는 파일은 이미 옮긴 것이고,
 * 거기 남은 어두운 hex는 배지·등급처럼 **의도적으로 고정한 색**이다
 * (거래 종류 7색·부상 수술 등급). 그 배지들의 글자색은 부모 규칙에 있어서
 * 규칙 단위로 보는 이 검사가 따라갈 수 없다 — 정규식으로 CSS 상속을
 * 흉내 내려 들면 검사가 코드보다 복잡해진다.
 */
function isConverted(css: string): boolean {
  return /var\(--(?:ink|panel|surface|line)/.test(css);
}

/** 어두운 지면을 깔면서 읽히는 글자색을 한 번도 안 짝지은 파일 */
function unsafeFiles(): string[] {
  const bad: string[] = [];
  for (const p of walk(SRC)) {
    const src = readFileSync(p, "utf8");
    const i = src.indexOf("<style>");
    if (i < 0) continue;
    const css = src.slice(i);
    if (isConverted(css)) continue;

    let hasDarkBg = false;
    let hasPair = false;
    RULE.lastIndex = 0;
    for (let m = RULE.exec(css); m; m = RULE.exec(css)) {
      const body = m[2];
      const bg = BG.exec(body);
      if (!bg) continue;
      let lum: number;
      try { lum = luminance(bg[1]); } catch { continue; }
      if (lum > 0.18) continue;
      hasDarkBg = true;
      const c = COL.exec(body);
      if (c && isReadableOn(bg[1], c[1])) hasPair = true;
    }
    if (hasDarkBg && !hasPair) bad.push(p.slice(SRC.length + 1).replace(/\\/g, "/"));
  }
  return bad;
}

describe("어두운 섬이 전역 글자색에 기대지 않는다", () => {
  const files = walk(SRC);

  it("화면 파일이 실제로 읽혔다 — 경로가 어긋나면 0개로 조용히 통과한다", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("전역은 밝은 지면이다 — 이 검사의 전제", () => {
    const css = readFileSync(join(SRC, "styles.css"), "utf8");
    expect(css).toMatch(/html,\s*body\s*\{[^}]*background-color:\s*var\(--surface\)/);
    expect(css).not.toMatch(/background:\s*radial-gradient/);
  });

  it("판정은 명도가 아니라 대비다", () => {
    // #2a1010 위의 #e07070 — 명도는 0.285(낮다)지만 대비 4.4:1로 읽힌다.
    // 명도 컷오프로 재면 이걸 결함으로 잘못 잡는다
    expect(isReadableOn("#2a1010", "#e07070")).toBe(true);
    expect(isReadableOn("#0e1a30", "#0f1d3d")).toBe(false);   // 검은 바탕에 검은 글씨
    expect(isReadableOn("#2A5D8F", "var(--ink-on-dark)")).toBe(true);
    expect(isReadableOn("#1E3050", "var(--t-gold)")).toBe(true);
  });

  it("아직 안 옮긴 화면이 실제로 남아 있다 — 0개면 검사가 헛돈다", () => {
    // U7·U9·U10이 남았으므로 여기가 0이 되면 이 테스트를 지울 때다
    const remaining = walk(SRC).filter((p) => {
      const src = readFileSync(p, "utf8");
      const i = src.indexOf("<style>");
      return i >= 0 && !isConverted(src.slice(i)) && /background[^;]*#[0-9a-fA-F]{6}/.test(src.slice(i));
    });
    expect(remaining.length).toBeGreaterThan(5);
  });

  it("어두운 배경을 까는 파일은 자기 글자색을 정한다", () => {
    // ⚠ 여기 파일 이름이 뜨면 **그 화면은 검은 바탕에 검은 글씨다.**
    // 고치는 법: 그 파일의 가장 바깥 어두운 컨테이너 규칙에 `color:`를 넣는다.
    expect(unsafeFiles()).toEqual([]);
  });
});
