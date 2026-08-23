#!/bin/sh
# 편차 계수 곡선 — 씨앗 3개 × 계수 3개. 같은 시즌 지수끼리만 비교한다.
P=resource/data/master/players/generation_rules.json
cp "$P" "$P.bak"
for W in 0 2 4; do
  node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,"utf8"));j.promotionRules.pressureDeviationWeight=Number(process.argv[2]);fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n","utf8");' "$P" "$W"
  for S in 20260731 777001 424242; do
    PP_SEED=$S PP_YEARS=3 PP_TAG="W$W/S$S" ELECTRON_RUN_AS_NODE=1 npx electron scripts/probe-pressure.cjs 2>&1 | grep -E "^\[RES\]|^\[END\]"
  done
done
mv "$P.bak" "$P"
echo "[DONE] 규칙 파일 복원"
