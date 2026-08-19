extends RefCounted
class_name EngineMeasure

## 경기 엔진 대조 계측 — 02 `scripts/audit-engine.cjs`와 **같은 항목**을 낸다.
##
## ⚠ **대조를 하려면 같은 것을 세야 한다.** 02는 경기당 이닝·득점,
## 9이닝당 피안타·탈삼진·볼넷, ERA, 타율, 삼진율·볼넷율, 홈런을 낸다 —
## 04도 그 아홉을 같은 정의로 센다.
##
## ⚠ **02는 모델이 둘이었다** — NPC 시즌 모델(`season.ts`)과 주인공
## 경기(`match_engine.rs`). 04는 **하나다**(`GameLoop`). 그래서 02의
## "두 모델이 같은 야구를 하는가" 검사는 04에 대응물이 없고, 04의 값은
## 02 두 모델 사이 어딘가에 떨어지는 게 맞다.


static func _pct(v: float) -> String:
	return ("%.3f" % v).trim_prefix("0")


func run(log_line: Callable, fail: Callable, games: int, seed_value: int) -> int:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value

	var outs: int = 0
	var er: float = 0.0
	var h: float = 0.0
	var k: float = 0.0
	var bb: float = 0.0
	var runs: int = 0
	var hr: int = 0
	var pa: int = 0
	var pitches: int = 0

	# ⚠ **진짜 로스터·진짜 경로로 잰다.** 02의 감사도 생성된 로스터로
	# 돌린다 — 합성 선수로 재면 분포가 그 합성값의 그림자다
	var world: Dictionary = World.new_game({"seed": seed_value,
		"season_year": 2027, "name": "김한결",
		"team_id": "TEAM_HS_AEWOL"}).get("world", {})
	var teams: Array = []
	for tid in world.get("rosters", {}):
		if not World.roster_of(world, String(tid)).is_empty():
			teams.append(String(tid))
	if teams.size() < 2:
		fail.call("로스터가 있는 팀이 %d개다" % teams.size())
		return 1

	# ⚠ **결과 줄로는 못 세는 것이 있다** (P-2d). 탈삼진 `k`는 헛스윙·루킹을
	# 합쳐 놓고, 파울은 어디에도 안 남는다 — 04가 02보다 삼진이 21% 많은 게
	# 헛스윙 때문인지 파울이 타석을 늘려서인지를 **투구를 세야** 가른다
	var tally: Dictionary = {}

	for g in games:
		var out: Dictionary = MatchDay.play(world,
			String(teams[g % teams.size()]),
			String(teams[(g * 7 + 3) % teams.size()]), rng, {"tally": tally})
		if not bool(out.get("ok", false)):
			continue
		var res: Dictionary = out["result"]
		pitches += int(out["pitches"])
		runs += int(res.get("home_score", 0)) + int(res.get("away_score", 0))

		# ⚠ **투수 줄과 타자 줄을 각각 센다.** 이닝·실점은 투수 줄이,
		# 홈런·타석은 타자 줄이 정본이다 — 02도 두 줄을 따로 세고
		# "같은 경기를 말하는가"를 대사로 검사한다
		for l in res.get("player_lines", []):
			if String(l.get("role", "")) == "pitcher":
				outs += int(roundf(float(l["ip"]) * 3.0))
				er += float(l["er"])
				h += float(l["h"])
				k += float(l["k"])
				bb += float(l["bb"])
			else:
				hr += int(l.get("hr", 0))
				pa += int(l.get("ab", 0)) + int(l.get("bb", 0))

	var ip: float = float(outs) / 3.0
	if ip <= 0.0:
		fail.call("이닝이 0이다 — 경기가 안 돌았다")
		return 1

	var per9: float = 9.0 / ip
	var gf: float = float(games)
	var ab: float = float(pa) - bb

	log_line.call("  %d경기 · 투구 %d" % [games, pitches])
	log_line.call("  경기당 이닝        %.1f" % (ip / gf))
	log_line.call("  경기당 득점(양팀)   %.1f" % (float(runs) / gf))
	log_line.call("  9이닝당 피안타      %.1f" % (h * per9))
	log_line.call("  9이닝당 탈삼진      %.1f" % (k * per9))
	log_line.call("  9이닝당 볼넷        %.1f" % (bb * per9))
	log_line.call("  리그 ERA          %.2f" % (er * per9))
	if ab > 0.0:
		log_line.call("  타율              %s" % _pct(h / ab))
	if pa > 0:
		log_line.call("  타석당 삼진율      %.2f" % (k / float(pa)))
		log_line.call("  타석당 볼넷율      %.2f" % (bb / float(pa)))
	log_line.call("  경기당 홈런(양팀)   %.1f" % (float(hr) / gf))
	# 🔴 **장타를 갈라서 낸다** (P-2f). 밴드를 만질 때 홈런만 보면 2루타가
	# 어디로 갔는지 모른다 — P-2c가 38 밴드의 **2루타를 갈라** 홈런을 채운
	# 자리다. `tally`가 투구당 결과 코드를 세므로 **선수 줄에 칸을 더할
	# 필요가 없다**(02도 `ab·h·hr·rbi·bb·k·sb`뿐이다).
	# ⚠ 02 `audit-engine.cjs`는 장타를 안 낸다 — **대조 상대가 없는 값이다.**
	# 04에서 밴드를 바꿨을 때 앞뒤를 견주는 용도다
	log_line.call("  경기당 2루타(양팀)  %.1f"
		% (float(tally.get("HIT_DOUBLE", 0)) / gf))
	log_line.call("  경기당 3루타(양팀)  %.1f"
		% (float(tally.get("HIT_TRIPLE", 0)) / gf))

	# ── 02 ② `match_engine.rs`와 대조하는 세 비율 ──────────────────
	#
	# ⚠ **9이닝당 값으로 02와 대조하면 안 된다** (P-2d, 2026-08-17).
	# 그 값들(탈삼진 7.4 등)은 02 감사의 **① `npc_sim.rs`** 것이고, 그건
	# 투구를 한 개도 안 굴리는 시즌 모델이다. 04에 대응하는 건 **②
	# `match_engine.rs`**인데 02는 이닝을 안 돌려줘서 **비율로만** 낸다.
	# 02 감사가 그 셋에 기대 구간까지 적어 뒀으므로 그대로 옮긴다
	var evt: float = h + k + bb
	if evt > 0.0:
		log_line.call("  ── 02 ② match_engine 대조 ──")
		log_line.call("  피안타/(피안타+삼진) %.2f   (02 0.54 · 기대 0.45~0.62)"
			% (h / (h + k)))
		log_line.call("  볼넷/전체사건       %.2f   (02 0.13 · 기대 0.08~0.20)"
			% (bb / evt))
		log_line.call("  삼진/전체사건       %.2f   (02 0.40 · 기대 0.25~0.45)"
			% (k / evt))

	# 투구당 결과 코드 — 02 `resolve_contact` 표와 나란히 놓는다
	var codes: Array = []
	var zones: Array = []
	for c in tally:
		if String(c).begins_with("zone:"):
			zones.append(c)
		else:
			codes.append(c)
	var total: int = 0
	for c in codes:
		total += int(tally[c])
	if total > 0:
		if pa > 0:
			log_line.call("  타석당 투구        %.2f" % (float(total) / float(pa)))
		log_line.call("  ── 투구 %d개의 결과 ──" % total)
		codes.sort_custom(func(a, b) -> bool: return int(tally[a]) > int(tally[b]))
		for c in codes:
			log_line.call("  %-14s %6d  %5.1f%%"
				% [c, int(tally[c]), float(tally[c]) * 100.0 / float(total)])
		zones.sort_custom(func(a, b) -> bool: return int(tally[a]) > int(tally[b]))
		for z in zones:
			log_line.call("  %-14s %6d  %5.1f%%"
				% [z, int(tally[z]), float(tally[z]) * 100.0 / float(total)])

	# ⚠ **여기서 판정하지 않는다.** 대조는 사람이 02 값과 나란히 놓고 한다 —
	# 04만의 기대 구간을 여기 적으면 그게 두 번째 기준이 된다
	return 0
