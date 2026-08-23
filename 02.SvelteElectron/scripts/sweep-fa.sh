#!/bin/sh
# FA 입찰 임계값 곡선 — 미계약률과 리그 유지를 같이 본다.
# ⚠ 미계약은 **응답의 events**에만 남는다(OffseasonEvent). careerEvents가 아니다.
# ⚠ 재기만 한다. 값 확정은 사용자 몫이다.
P=resource/data/master/players/generation_rules.json
cp "$P" "$P.bak"
for T in 0 50 65 80; do
  node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,"utf8"));j.faRules.bidInterestMin=Number(process.argv[2]);fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n","utf8");' "$P" "$T"
  echo "=== 임계 $T ==="
  PE_YEARS=3 ELECTRON_RUN_AS_NODE=1 npx electron scripts/probe-faevents.cjs 2>&1 | grep "^\[EV\]"
done
mv "$P.bak" "$P"
echo "[DONE] 복원 — $(grep -o '"bidInterestMin": *[0-9]*' "$P")"
