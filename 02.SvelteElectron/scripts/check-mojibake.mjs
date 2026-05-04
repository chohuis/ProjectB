import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  path.join(root, "apps/ui/src"),
  path.join(root, "apps/desktop"),
  path.join(root, "packages"),
  path.join(root, "scripts"),
  path.join(root, "resource/data"),
  path.join(root, "..", "docs")
];

const includeExt = new Set([".ts", ".svelte", ".json", ".md", ".cjs", ".mjs", ".sql", ".txt"]);
const ignoreDirNames = new Set(["node_modules", ".git", "dist", "build"]);
const ignoreFiles = new Set([
  path.join(root, "scripts", "check-mojibake.mjs")
]);
const suspiciousRegexes = [
  { name: "replacement-char", re: /\uFFFD/g },
  { name: "cjk-compat", re: /[\uF900-\uFAFF]/g },
  // Typical mojibake fragments from UTF-8 Korean interpreted with wrong codepage.
  { name: "korean-mojibake-fragment", re: /\?[가-힣ㄱ-ㅎㅏ-ㅣ]{1,8}\?/g },
  // Typical mojibake fragments from UTF-8 Latin interpreted with wrong codepage.
  { name: "latin-mojibake-fragment", re: /(?:Ã.|Â.)/g }
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoreDirNames.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (includeExt.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function getLineCol(text, index) {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  const col = index - lastNewline;
  return { line, col };
}

let hasError = false;
for (const dir of targets) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    if (ignoreFiles.has(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const rule of suspiciousRegexes) {
      const matches = [...text.matchAll(rule.re)];
      if (matches.length > 0) {
        hasError = true;
        const first = matches[0];
        const at = first.index ?? 0;
        const lc = getLineCol(text, at);
        const snippet = text.slice(Math.max(0, at - 12), Math.min(text.length, at + 20)).replace(/\s+/g, " ");
        console.error(
          `[check-mojibake] ${rule.name}: ${path.relative(root, file)}:${lc.line}:${lc.col} snippet="${snippet}"`
        );
      }
    }
  }
}

if (hasError) process.exit(1);
console.log("[check-mojibake] OK");
