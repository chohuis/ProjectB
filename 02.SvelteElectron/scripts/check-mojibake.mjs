import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  path.join(root, "apps/ui/src"),
  path.join(root, "resource/data")
];

const includeExt = new Set([".ts", ".svelte", ".json", ".md", ".cjs", ".mjs", ".sql"]);
const suspiciousRegexes = [
  { name: "replacement-char", re: /\uFFFD/g },
  { name: "cjk-compat", re: /[\uF900-\uFAFF]/g }
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (includeExt.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

let hasError = false;
for (const dir of targets) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, "utf8");
    for (const rule of suspiciousRegexes) {
      if (rule.re.test(text)) {
        hasError = true;
        console.error(`[check-mojibake] ${rule.name}: ${path.relative(root, file)}`);
      }
    }
  }
}

if (hasError) process.exit(1);
console.log("[check-mojibake] OK");

