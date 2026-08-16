extends RefCounted
class_name FaMeasure

## FA·계약 대조 계측 — 02 `scripts/test-fa.cjs`가 찍는 **네 줄**을 낸다.
##
## ① 등급 분포 (계약 N · 미계약 N · A/B/C)
## ② 이적 N명 중 보상선수 발생 N명
## ③ 방출 점수 — 구단주 관계 나쁨(-80) · 없음(0) · 좋음(+80)
## ④ 재계약 배율 — 나쁨 · 중립 · 좋음
##
## ①②는 **진짜 세계·진짜 경로**로 낸다 (`World.new_game` → `FaRunner`).
## 02는 합성 60명이라 분모가 다르다 — **비율로 견준다.**
##
## ③④는 02와 **같은 fixture**를 쓴다 (`test-fa.cjs:180`) — 나이 33 · OVR 55 ·
## 연봉 5억 · 시장가 2억 · 최근 성적 30 · 뎁스 5 · 프로필 전부 50.
##
## ⚠ **여기서 판정하지 않는다.** 02 값과 나란히 놓는 건 사람이 한다


## 02 `test-fa.cjs:180`의 fixture 그대로
const REL_PROFILE_VALUE: float = 50.0
const REL_AGE: int = 33
const REL_SALARY: int = 50000
const REL_MARKET: int = 20000
const REL_PERF: float = 30.0
const REL_DEPTH: int = 5


static func _neutral_profile() -> Dictionary:
	var out: Dictionary = {}
	for k in ["owner_spending_willingness", "stability", "development_focus",
			"discipline", "owner_patience", "win_now_pressure",
			"scouting_quality", "prestige", "market_appeal",
			"clubhouse_culture", "medical_quality", "farm_investment"]:
		out[k] = REL_PROFILE_VALUE
	return out


## ①② 진짜 세계를 한 해 돌려 FA 시장을 본다
func _market(log_line: Callable, seed_value: int, warmup: int) -> void:
	var s: Dictionary = World.new_game({"seed": seed_value, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})

	# ⚠ **새 세계 첫 해엔 FA가 0명이다.** 계약이 방금 만들어져 근속연수가
	# 안 쌓였다 — 굴리지 않고 재면 "04는 FA가 없다"로 잘못 읽힌다
	var year: int = 2027
	for i in warmup:
		s["season_year"] = year
		SeasonRunner.run(s)
		year += 1
	log_line.call("  %d해 굴린 뒤 (%d년)" % [warmup, year])

	var world: Dictionary = s.get("world", {})

	var signed: int = 0
	var unsigned: int = 0
	var moved: int = 0
	var comp: int = 0
	var by_grade: Dictionary = {}

	for lid in TeamProfile.PRO_LEAGUES:
		var eligible: Array = FaRunner.eligible_of(world, lid)
		if eligible.is_empty():
			continue

		# ⚠ **`run_league`가 짓는 그대로 짓는다.** 처음엔 로스터를 훑어
		# `{team_id, open_slots, roster}`만 넣었는데, `budget_index`와
		# `win_now_pressure`가 빠져 **모든 팀이 똑같이 부르고 원소속 프리미엄
		# +0.15만 남았다** — 이적 0%가 나왔다. 04가 아니라 fixture가 틀렸다
		var market_players: Array = []
		for p in eligible:
			market_players.append({
				"id": String(p["id"]), "name": String(p.get("name", "")),
				"from_team_id": String(p.get("team_id", "")),
				"ovr": Contract.core_ovr(p), "age": int(p.get("age", 27)),
				"salary": int(p.get("salary", 0)), "form": 0.0,
			})
		var teams: Array = []
		for t in World.teams_of(lid):
			var tid: String = String(t["id"])
			teams.append({
				"team_id": tid,
				"budget_index": clampf(float(TeamProfile.of(world, tid)
					["owner_spending_willingness"]) / 50.0, 0.8, 1.35),
				"win_now_pressure": float(TeamProfile.of(world, tid)
					["win_now_pressure"]),
				"open_slots": FaRunner.open_slots_of(world, tid, lid),
				"roster": FaRunner.compensation_pool(world, tid),
			})

		var rng := RandomNumberGenerator.new()
		rng.seed = Rng.mix(["fa", lid, seed_value, year])
		var out: Dictionary = FaMarket.resolve(market_players, teams,
			FaRunner.league_salaries(world, lid), rng)

		for sign in out.get("signings", []):
			signed += 1
			var g: String = String(sign.get("grade", "?"))
			by_grade[g] = int(by_grade.get(g, 0)) + 1
			if String(sign["to_team_id"]) != String(sign["from_team_id"]):
				moved += 1
				if not String(sign["compensation_id"]).is_empty():
					comp += 1
		unsigned += (out.get("unsigned", []) as Array).size()

	var grades: Array = by_grade.keys()
	grades.sort()
	var line: String = ""
	for g in grades:
		line += "%s:%d " % [g, by_grade[g]]
	log_line.call("  계약 %d명 · 미계약 %d명 · 등급 %s"
		% [signed, unsigned, line.strip_edges()])
	log_line.call("  이적 %d명 중 보상선수 발생 %d명" % [moved, comp])
	if signed > 0:
		log_line.call("  (비율 — 이적 %.0f%% · 이적 중 보상 %.0f%%)"
			% [float(moved) / float(signed) * 100.0,
				(float(comp) / float(moved) * 100.0) if moved > 0 else 0.0])


## ③ 방출 점수 — 02와 같은 fixture
func _release(log_line: Callable) -> void:
	var p: Dictionary = {"age": REL_AGE, "professionalism": 50.0}
	var profile: Dictionary = _neutral_profile()
	var out: Array[String] = []
	for rel in [-80.0, 0.0, 80.0]:
		out.append("%.0f" % float(Release.score_of(p, profile, REL_PERF,
			REL_DEPTH, REL_SALARY, REL_MARKET, rel)["score"]))
	log_line.call("  방출 점수 — 관계 나쁨 %s · 없음 %s · 좋음 %s"
		% [out[0], out[1], out[2]])


## ④ 재계약 배율 — 구단주 관계가 오퍼를 얼마나 움직이나
func _contract(log_line: Callable) -> void:
	var out: Array[String] = []
	for rel in [-80, 0, 80]:
		out.append("%+.0f%%" % (float(Relationship.effects(0, 0, rel)["contract_bonus"])
			* 100.0))
	log_line.call("  재계약 배율 — 나쁨 %s · 중립 %s · 좋음 %s"
		% [out[0], out[1], out[2]])


func run(log_line: Callable, _fail: Callable, seed_value: int,
		warmup: int = 6) -> int:
	log_line.call("  씨앗 %d" % seed_value)
	log_line.call("")
	log_line.call("등급 분포 (진짜 세계 · 프로 3리그)")
	_market(log_line, seed_value, warmup)
	log_line.call("")
	log_line.call("방출·재계약 (02와 같은 fixture)")
	_release(log_line)
	_contract(log_line)
	return 0
