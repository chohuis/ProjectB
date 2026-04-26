import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const i18nFile = path.join(root, "apps/ui/src/shared/i18n/index.ts");
const srcRoot = path.join(root, "apps/ui/src");

const i18nText = fs.readFileSync(i18nFile, "utf8");
const keyRegex = /"([a-zA-Z0-9_.-]+)"\s*:/g;
const knownKeys = new Set();
let match;
while ((match = keyRegex.exec(i18nText)) !== null) {
  knownKeys.add(match[1]);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|svelte)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(srcRoot);
const usedKeys = new Set();
const useRegex = /\$t\(\s*"([a-zA-Z0-9_.-]+)"/g;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  let m;
  while ((m = useRegex.exec(text)) !== null) {
    usedKeys.add(m[1]);
  }
}

const missing = [...usedKeys].filter((key) => !knownKeys.has(key)).sort();

if (missing.length > 0) {
  console.error("[check-i18n-keys] Missing dictionary keys:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

console.log(`[check-i18n-keys] OK. used=${usedKeys.size}, known=${knownKeys.size}`);

