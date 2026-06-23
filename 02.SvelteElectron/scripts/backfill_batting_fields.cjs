"use strict";
const fs   = require("fs");
const path = require("path");

const PLY_DIR = path.resolve(__dirname, "../resource/data/master/entities/players");

function clamp(v, min, max) { return Math.max(min, Math.min(max, Math.round(v))); }

function main() {
  const files = fs.readdirSync(PLY_DIR).filter(f => f.startsWith("PLY_") && f.endsWith(".json"));
  console.log(`전체 PLY: ${files.length}개`);

  let modified = 0, skipped = 0, noBatting = 0;

  for (const f of files) {
    const raw = fs.readFileSync(path.join(PLY_DIR, f), "utf8");
    const hasBom = raw.charCodeAt(0) === 0xFEFF;
    const d = JSON.parse(hasBom ? raw.slice(1) : raw);

    const bat = d.details?.player?.batting;
    if (!bat) { noBatting++; continue; }

    const ovr = bat.ovr ?? 50;
    let changed = false;

    if (!("baseInstinct" in bat)) { bat.baseInstinct = clamp(ovr - 5,  1, 99); changed = true; }
    if (!("bunting"       in bat)) { bat.bunting       = clamp(ovr - 15, 1, 99); changed = true; }
    if (!("platoon"       in bat)) { bat.platoon        = 50;                     changed = true; }

    if (!changed) { skipped++; continue; }

    const content = (hasBom ? "﻿" : "") + JSON.stringify(d, null, 2);
    fs.writeFileSync(path.join(PLY_DIR, f), content, "utf8");
    modified++;
  }

  console.log(`수정: ${modified}개 | 이미 있음: ${skipped}개 | 배팅 없음(투수 등): ${noBatting}개`);
}

main();
