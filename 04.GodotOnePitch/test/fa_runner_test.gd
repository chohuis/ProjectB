extends GdUnitTestSuite

## FA를 세계에 적용 — M9-12.
##
## `FaMarket`은 순수 계산이고 여기가 세계를 실제로 바꾼다.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


## KBL 두 팀 — 하나는 꽉 찼고 하나는 비었다
func _state() -> Dictionary:
	var full: Array = []
	for i in 30:
		full.append({"id": "F%d" % i, "name": "F%d" % i, "team_id": "TEAM_KBL_BUSAN_WAVES_1",
			"league_id": "LEAGUE_KBL", "player_type": "pitcher", "age": 27,
			"pitching": {"ovr": 60.0 + float(i % 20)}, "batting": {"ovr": 40.0},
			"salary": 4000 + i * 100, "contract_years": 3, "pro_service_years": 6})
	# 자격자 하나 — 계약이 끝났고 연차가 넘는다
	full.append({"id": "FA1", "name": "FA1", "team_id": "TEAM_KBL_BUSAN_WAVES_1",
		"league_id": "LEAGUE_KBL", "player_type": "pitcher", "age": 30,
		"pitching": {"ovr": 85.0}, "batting": {"ovr": 40.0},
		"salary": 20000, "contract_years": 0, "pro_service_years": 9})

	var thin: Array = []
	for i in 25:
		thin.append({"id": "T%d" % i, "name": "T%d" % i, "team_id": "TEAM_KBL_CHANGWON_STARS_1",
			"league_id": "LEAGUE_KBL", "player_type": "batter", "age": 26,
			"pitching": {"ovr": 30.0}, "batting": {"ovr": 55.0 + float(i)},
			"salary": 3000 + i * 50, "contract_years": 2, "pro_service_years": 4})

	return {"seed": 7, "season_year": 2027,
		"world": {"rosters": {"TEAM_KBL_BUSAN_WAVES_1": full, "TEAM_KBL_CHANGWON_STARS_1": thin}}}


func _find(state: Dictionary, id: String) -> Dictionary:
	for tid in state["world"]["rosters"]:
		for p in state["world"]["rosters"][tid]:
			if String(p.get("id", "")) == id:
				return p
	return {}


# ── 자격자 ────────────────────────────────────────────────────

## ⚠ **계약이 끝난 사람만이다.** 연차만 보면 계약 중인 선수가 매년 나온다
func test_only_finished_contracts_reach_the_market() -> void:
	var s: Dictionary = _state()
	var ids: Array = []
	for p in FaRunner.eligible_of(s["world"], "LEAGUE_KBL"):
		ids.append(String(p["id"]))
	assert_array(ids).is_equal(["FA1"])


## ⚠ **주인공의 FA는 사용자가 정한다** — 세계가 대신 정하면 안 된다
func test_the_protagonist_never_goes_to_market() -> void:
	var s: Dictionary = _state()
	var me: Dictionary = _find(s, "FA1").duplicate(true)
	me["id"] = "ME"
	me["is_protagonist"] = true
	s["world"]["rosters"]["TEAM_KBL_BUSAN_WAVES_1"].append(me)

	for p in FaRunner.eligible_of(s["world"], "LEAGUE_KBL"):
		assert_bool(p.get("is_protagonist", false)).override_failure_message(
			"주인공이 FA 시장에 나왔다").is_false()


# ── 자리 ──────────────────────────────────────────────────────

## 1군 상한까지 남은 자리를 센다 — 안 세면 정원 넘은 팀도 영입한다
func test_it_counts_the_open_slots() -> void:
	var s: Dictionary = _state()
	var limit: int = RosterMaintenance.roster_max_of("LEAGUE_KBL")
	assert_int(FaRunner.open_slots_of(s["world"], "TEAM_KBL_CHANGWON_STARS_1", "LEAGUE_KBL")) \
		.is_equal(limit - 25)
	# 꽉 찬 팀은 0 아래로 안 간다
	assert_int(FaRunner.open_slots_of(s["world"], "TEAM_KBL_BUSAN_WAVES_1", "LEAGUE_KBL")) \
		.is_greater_equal(0)


# ── 보상 후보 ─────────────────────────────────────────────────

## ⚠ **외국인과 주인공은 보상 대상이 아니다.** 안 빼면 보호선수 다음 순위가
## 거의 항상 용병이라 매 FA마다 한 명씩 팀을 옮긴다
func test_the_compensation_pool_leaves_some_out() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["TEAM_KBL_CHANGWON_STARS_1"][0]["is_foreign"] = true
	s["world"]["rosters"]["TEAM_KBL_CHANGWON_STARS_1"][1]["is_protagonist"] = true

	var ids: Array = []
	for r in FaRunner.compensation_pool(s["world"], "TEAM_KBL_CHANGWON_STARS_1"):
		ids.append(String(r["id"]))
	assert_array(ids).not_contains(["T0", "T1"])
	assert_int(ids.size()).is_equal(23)


## 야수는 타격 OVR로 값이 매겨진다 — 뒤바뀌면 보상선수가 늘 투수다
func test_the_pool_reads_the_right_ovr() -> void:
	var s: Dictionary = _state()
	for r in FaRunner.compensation_pool(s["world"], "TEAM_KBL_CHANGWON_STARS_1"):
		assert_float(float(r["ovr"])).override_failure_message(
			"야수를 투구 OVR로 봤다").is_greater(50.0)


# ── 세계에 적용 ───────────────────────────────────────────────

## ⚠ **양쪽 배열을 같이 고쳐야 한다.** 한쪽만 하면 같은 선수가 두 군데
## 있거나 통째로 사라진다
func test_a_signing_actually_moves_the_player() -> void:
	var s: Dictionary = _state()
	var before: int = FaRunner.eligible_of(s["world"], "LEAGUE_KBL").size()
	assert_int(before).is_equal(1)

	FaRunner.run_league(s, "LEAGUE_KBL", _rng(3))

	# 한 사람이 정확히 한 번 있어야 한다
	var seen: int = 0
	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			if String(p.get("id", "")) == "FA1":
				seen += 1
				assert_str(String(p["team_id"])).override_failure_message(
					"소속이 안 바뀌었다").is_not_empty()
	assert_int(seen).override_failure_message(
		"FA1이 세계에 %d명 있다" % seen).is_equal(1)


## ⚠ **새 계약을 붙인다.** 안 붙이면 계약 연수가 0인 채로 남아 **매년 같은
## 사람이 다시 FA가 된다**
func test_a_signing_writes_a_new_contract() -> void:
	var s: Dictionary = _state()
	FaRunner.run_league(s, "LEAGUE_KBL", _rng(3))

	var p: Dictionary = _find(s, "FA1")
	assert_int(int(p["contract_years"])).override_failure_message(
		"계약 연수가 0 그대로다 — 내년에 또 FA가 된다").is_greater(0)
	assert_bool(Contract.is_fa_eligible(p)).is_false()


func test_the_move_is_logged_in_the_career() -> void:
	var s: Dictionary = _state()
	FaRunner.run_league(s, "LEAGUE_KBL", _rng(3))

	var kinds: Array = []
	for e in _find(s, "FA1").get("career_events", []):
		kinds.append(String(e["type"]))
	assert_array(kinds).contains(["fa_signed"])


## 자리가 없으면 미계약으로 남는다 — 진로 배정이 가져간다
##
## ⚠ **리그의 팀 목록은 데이터가 정본이다.** 두 팀만 채우고 "꽉 찼다"고
## 보면 나머지 여덟 팀이 텅 비어 있어서 검사가 아무것도 안 본다
func test_a_full_league_leaves_them_unsigned() -> void:
	var s: Dictionary = _state()
	var limit: int = RosterMaintenance.roster_max_of("LEAGUE_KBL")
	for t in World.teams_of("LEAGUE_KBL"):
		var tid: String = String(t["id"])
		if not s["world"]["rosters"].has(tid):
			s["world"]["rosters"][tid] = []
		var roster: Array = s["world"]["rosters"][tid]
		while roster.size() < limit:
			roster.append({
				"id": "%s_X%d" % [tid, roster.size()],
				"team_id": tid, "league_id": "LEAGUE_KBL",
				"player_type": "batter", "age": 25,
				"pitching": {"ovr": 30.0}, "batting": {"ovr": 50.0},
				"salary": 3000, "contract_years": 2, "pro_service_years": 3})

	var r: Dictionary = FaRunner.run_league(s, "LEAGUE_KBL", _rng(3))
	assert_int(int(r["unsigned"])).is_equal(1)
	assert_bool(_find(s, "FA1").get("fa_unsigned", false)).is_true()


## 자격자가 없으면 아무 일도 안 한다
func test_no_eligible_players_is_a_no_op() -> void:
	var s: Dictionary = _state()
	_find(s, "FA1")["contract_years"] = 3
	var r: Dictionary = FaRunner.run_league(s, "LEAGUE_KBL", _rng(3))
	assert_int(int(r["signings"])).is_equal(0)
	assert_int(int(r["moved"])).is_equal(0)


func test_an_empty_world_is_a_no_op() -> void:
	assert_int(int(FaRunner.run({})["signings"])).is_equal(0)


# ── 변이가 드러낸 자리 ────────────────────────────────────────

## 정원을 넘긴 팀은 자리가 **0**이다. 음수를 그대로 두면 `open_slots <= 0`
## 판정은 같아도 보상선수가 돌아올 때 `-3 + 1 = -2`라 영영 안 열린다
func test_an_over_full_team_has_zero_slots() -> void:
	var s: Dictionary = _state()
	var tid: String = "TEAM_KBL_BUSAN_WAVES_1"
	var over_limit: int = RosterMaintenance.roster_max_of("LEAGUE_KBL") + 3
	while s["world"]["rosters"][tid].size() < over_limit:
		s["world"]["rosters"][tid].append({"id": "Z%d" % s["world"]["rosters"][tid].size(),
			"team_id": tid, "league_id": "LEAGUE_KBL", "player_type": "batter",
			"age": 25, "pitching": {"ovr": 30.0}, "batting": {"ovr": 50.0}})
	assert_int(FaRunner.open_slots_of(s["world"], tid, "LEAGUE_KBL")) \
		.override_failure_message("정원 초과인데 자리가 음수다").is_equal(0)


## ⚠ **다른 리그 선수가 섞이면 안 된다.** 세계 로스터는 팀 단위라 그 안에
## 어느 리그든 들어올 수 있다 — 걸러야 KBL FA 시장에 JBL 선수가 안 나온다
func test_other_leagues_stay_out_of_the_market() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["TEAM_KBL_BUSAN_WAVES_1"].append({
		"id": "JBL_FA", "name": "JBL_FA", "team_id": "TEAM_KBL_BUSAN_WAVES_1",
		"league_id": "LEAGUE_JBL", "player_type": "pitcher", "age": 30,
		"pitching": {"ovr": 90.0}, "batting": {"ovr": 40.0},
		"salary": 30000, "contract_years": 0, "pro_service_years": 9})

	var ids: Array = []
	for p in FaRunner.eligible_of(s["world"], "LEAGUE_KBL"):
		ids.append(String(p["id"]))
	assert_array(ids).override_failure_message(
		"다른 리그 자격자가 섞였다").is_equal(["FA1"])


## ⚠ **리그 연봉이 등급 백분위의 분모다.** 안 모으면 전원이 중간(50%)으로
## 떨어져 A등급이 사라지고 보상선수가 아예 안 움직인다
func test_the_league_salaries_feed_the_grade() -> void:
	var s: Dictionary = _state()
	var salaries: Array = FaRunner.league_salaries(s["world"], "LEAGUE_KBL")
	assert_int(salaries.size()).override_failure_message(
		"리그 연봉을 하나도 안 모았다").is_greater(50)
	# FA1이 리그 최고연봉이므로 백분위 0 = A등급이어야 한다
	assert_str(String(FaMarket.grade_of(
		FaMarket.salary_percentile(20000, salaries))["grade"])).is_equal("A")


## ⚠ **소속을 실제로 바꾼다.** 안 바꾸면 옮겨 놓고도 옛 팀 소속으로 집계돼
## 로스터 상한·순위표가 전부 어긋난다
func test_the_move_rewrites_the_team_id() -> void:
	var s: Dictionary = _state()
	FaRunner.run_league(s, "LEAGUE_KBL", _rng(3))

	var p: Dictionary = _find(s, "FA1")
	var holder: String = ""
	for tid in s["world"]["rosters"]:
		for q in s["world"]["rosters"][tid]:
			if String(q.get("id", "")) == "FA1":
				holder = tid
	assert_str(String(p["team_id"])).override_failure_message(
		"배열은 옮겼는데 소속은 옛 팀이다").is_equal(holder)
	assert_str(String(p["league_id"])).is_equal("LEAGUE_KBL")


## 옛 경력을 지우지 않는다 — 지우면 이적할 때마다 커리어가 초기화된다
func test_the_move_keeps_the_old_career() -> void:
	var s: Dictionary = _state()
	_find(s, "FA1")["career_events"] = [{"year": 2020, "type": "draft"}]
	FaRunner.run_league(s, "LEAGUE_KBL", _rng(3))

	var kinds: Array = []
	for e in _find(s, "FA1").get("career_events", []):
		kinds.append(String(e["type"]))
	assert_array(kinds).override_failure_message(
		"이적하면서 옛 경력이 날아갔다").is_equal(["draft", "fa_signed"])


## ⚠ **보상선수가 실제로 움직인다.** 02 사용자 확정 사항인데, 옮기는 코드가
## 없으면 보상금만 오가고 사람은 그대로다
func test_the_compensation_player_actually_moves() -> void:
	var s: Dictionary = _state()
	# 원소속을 꽉 채워 재계약을 막고, 받는 팀에 보상 후보를 넉넉히 둔다
	var from_tid: String = "TEAM_KBL_BUSAN_WAVES_1"
	var limit: int = RosterMaintenance.roster_max_of("LEAGUE_KBL")

	# ⚠ **어느 팀이 데려가든 보호선수(20명)보다 두꺼워야 한다.** 빈 팀이
	# 하나라도 있으면 거기로 가서 보상 후보가 0명이 된다
	for t in World.teams_of("LEAGUE_KBL"):
		var tid: String = String(t["id"])
		if not s["world"]["rosters"].has(tid):
			s["world"]["rosters"][tid] = []
		var roster: Array = s["world"]["rosters"][tid]
		var want: int = limit if tid == from_tid else limit - 1
		while roster.size() < want:
			roster.append({"id": "%s_Z%d" % [tid, roster.size()], "team_id": tid,
				"league_id": "LEAGUE_KBL", "player_type": "batter", "age": 25,
				"pitching": {"ovr": 30.0}, "batting": {"ovr": 50.0},
				"salary": 3000, "contract_years": 2, "pro_service_years": 3})

	var r: Dictionary = FaRunner.run_league(s, "LEAGUE_KBL", _rng(3))
	assert_int(int(r["signings"])).is_equal(1)
	# FA1(리그 최고연봉 = A등급)이 떠났으므로 보상선수 하나가 따라 왔다
	assert_int(int(r["moved"])).override_failure_message(
		"A등급 이적인데 움직인 사람이 %d명뿐이다" % r["moved"]).is_equal(2)

	var back: int = 0
	for p in s["world"]["rosters"][from_tid]:
		for e in p.get("career_events", []):
			if String(e["type"]) == "fa_compensation":
				back += 1
	assert_int(back).override_failure_message(
		"보상선수가 원소속으로 안 왔다").is_equal(1)


## ⚠ **미계약을 표시해야 진로 배정이 찾는다.** 안 하면 계약 0인 채로 남아
## 해마다 같은 사람이 시장에 나온다
func test_the_unsigned_flag_is_written() -> void:
	var s: Dictionary = _state()
	for t in World.teams_of("LEAGUE_KBL"):
		var tid: String = String(t["id"])
		if not s["world"]["rosters"].has(tid):
			s["world"]["rosters"][tid] = []
		var roster: Array = s["world"]["rosters"][tid]
		while roster.size() < RosterMaintenance.roster_max_of("LEAGUE_KBL"):
			roster.append({"id": "%s_F%d" % [tid, roster.size()], "team_id": tid,
				"league_id": "LEAGUE_KBL", "player_type": "batter", "age": 25,
				"pitching": {"ovr": 30.0}, "batting": {"ovr": 50.0},
				"salary": 3000, "contract_years": 2, "pro_service_years": 3})

	FaRunner.run_league(s, "LEAGUE_KBL", _rng(3))
	assert_bool(_find(s, "FA1").get("fa_unsigned", false)).is_true()


## ⚠ **성적 압박이 입찰에 닿아야 한다.** 안 닿으면 전 팀이 같은 세기로 부르고
## 구단 성향을 만든 뜻이 사라진다
func test_the_pressure_reaches_the_bid() -> void:
	var calm: Dictionary = _state()
	var hot: Dictionary = _state()
	# ⚠ **리그 전체에 준다.** 한 팀만 올리면 그 팀이 아닌 데로 갈 수 있어
	# 검사가 흔들린다 — 누가 데려가든 더 세게 부르는지를 본다
	for t in World.teams_of("LEAGUE_KBL"):
		TeamProfile.patch(hot["world"], String(t["id"]), {"win_now_pressure": 100.0})

	FaRunner.run_league(calm, "LEAGUE_KBL", _rng(11))
	FaRunner.run_league(hot, "LEAGUE_KBL", _rng(11))
	assert_int(int(_find(hot, "FA1")["salary"])).override_failure_message(
		"성적 압박이 입찰에 안 닿는다").is_greater(int(_find(calm, "FA1")["salary"]))


## ⚠ **예산 지수를 자른다.** 구단주 성향이 0~100인데 안 자르면 0배·2배가
## 나와서 성향 하나가 시장을 통째로 지배한다
func test_the_budget_index_is_clamped() -> void:
	var s: Dictionary = _state()
	var poor: Dictionary = _state()
	for t in World.teams_of("LEAGUE_KBL"):
		TeamProfile.patch(s["world"], String(t["id"]),
			{"owner_spending_willingness": 0.0})
		TeamProfile.patch(poor["world"], String(t["id"]),
			{"owner_spending_willingness": 40.0})

	FaRunner.run_league(s, "LEAGUE_KBL", _rng(11))
	FaRunner.run_league(poor, "LEAGUE_KBL", _rng(11))
	# 0도 40도 하한 0.8로 잘리므로 결과가 같아야 한다
	assert_int(int(_find(s, "FA1")["salary"])).override_failure_message(
		"구단주 성향 0이 하한에 안 걸렸다").is_equal(int(_find(poor, "FA1")["salary"]))


func _with_jbl(s: Dictionary) -> Dictionary:
	s["world"]["rosters"]["TEAM_JBL_CL_NEONCRANES_1"] = [{
		"id": "J1", "name": "J1", "team_id": "TEAM_JBL_CL_NEONCRANES_1",
		"league_id": "LEAGUE_JBL", "player_type": "pitcher", "age": 30,
		"pitching": {"ovr": 70.0}, "batting": {"ovr": 40.0},
		"salary": 9000, "contract_years": 0, "pro_service_years": 9}]
	return s


## ⚠ **리그마다 다른 흐름이다.** 하나로 이어 돌리면 **앞 리그의 자격자 수가
## 뒤 리그를 통째로 민다** — KBL에 한 명 늘었을 뿐인데 JBL 결과가 바뀐다.
##
## 그래서 **뒤 리그(JBL)를 본다.** 앞 리그를 보면 흐름을 이어도 결과가 같아서
## 검사가 아무것도 안 본다
func test_each_league_gets_its_own_stream() -> void:
	var a: Dictionary = _with_jbl(_state())
	var b: Dictionary = _with_jbl(_state())
	# b에는 KBL 자격자를 하나 더 둔다 — JBL 결과는 그대로여야 한다
	b["world"]["rosters"]["TEAM_KBL_BUSAN_WAVES_1"].append({
		"id": "FA2", "name": "FA2", "team_id": "TEAM_KBL_BUSAN_WAVES_1",
		"league_id": "LEAGUE_KBL", "player_type": "pitcher", "age": 30,
		"pitching": {"ovr": 80.0}, "batting": {"ovr": 40.0},
		"salary": 15000, "contract_years": 0, "pro_service_years": 9})

	FaRunner.run(a)
	FaRunner.run(b)
	assert_int(int(_find(a, "J1")["salary"])).override_failure_message(
		"KBL 자격자가 하나 늘자 JBL 계약이 바뀌었다 — 흐름이 하나다") \
		.is_equal(int(_find(b, "J1")["salary"]))


## ⚠ **프로 리그를 전부 돈다.** 하나만 돌면 해외 FA가 영영 안 열린다
func test_every_pro_league_runs() -> void:
	var s: Dictionary = _with_jbl(_state())
	var r: Dictionary = FaRunner.run(s)
	assert_int(int(r["signings"])).override_failure_message(
		"KBL 하나만 돌았다").is_equal(2)
	assert_int(int(_find(s, "J1")["contract_years"])).override_failure_message(
		"JBL 자격자가 계약을 못 받았다").is_greater(0)
