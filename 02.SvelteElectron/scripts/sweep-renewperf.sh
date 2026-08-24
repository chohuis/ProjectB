#!/bin/sh
# 재계약 성적 배수 폭 — 연봉 분포와 FA 대비를 같이 본다.
# ⚠ 재기만 한다. 값 확정은 사용자 몫이다.
P=resource/data/master/players/generation_rules.json
cp "$P" "$P.bak"
for S in 0 0.2 0.35 0.5; do
  node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,"utf8"));j.faRules.renewPerfSpan=Number(process.argv[2]);fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n","utf8");' "$P" "$S"
  echo "=== renewPerfSpan $S ==="
  PE_SEED=424242 PE_YEARS=5 ELECTRON_RUN_AS_NODE=1 npx electron scripts/probe-faevents.cjs 2>&1 | grep "^\[연봉\]"
done
mv "$P.bak" "$P"
echo "[DONE] 복원 $(grep -o '"renewPerfSpan": *[0-9.]*' "$P")"
