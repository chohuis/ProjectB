#!/bin/sh
# FA 성적 배수 폭 곡선 — 성적 구간별 배수가 순서대로 서는가.
# ⚠ 재기만 한다. 값 확정은 사용자 몫이다.
P=resource/data/master/players/generation_rules.json
cp "$P" "$P.bak"
for S in 0 0.3 0.5 0.7; do
  node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,"utf8"));j.faRules.perfSpan=Number(process.argv[2]);fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n","utf8");' "$P" "$S"
  echo "=== span $S ==="
  PC_YEARS=4 ELECTRON_RUN_AS_NODE=1 npx electron scripts/probe-facontract.cjs 2>&1 | grep -E "^\[성적|^\[방향\]|^\[하한\]"
done
mv "$P.bak" "$P"
echo "[DONE] 복원 — $(grep -o '"perfSpan": *[0-9.]*' "$P")"
