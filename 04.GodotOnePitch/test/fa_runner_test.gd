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
	# ⚠ **국적으로 표시한다** (P-5b). 예전엔 `is_foreign` 플래그를 세웠는데
	# 그건 "그 리그에서 외국인인가"라 **JBL 팀의 일본 선수를 내국인으로
	# 통과시킨다** — 시장이 프로 한 판이 되면서 그 함정이 열렸다.
	# 02도 국적으로 묻는다(`isForeignInQuotaLeague`). **뜻은 그대로다**
	s["world"]["rosters"]["TEAM_KBL_CHANGWON_STARS_1"][0]["nationality"] = "JPN"
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

	FaRunner.run_market(s, _rng(3))

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
	FaRunner.run_market(s, _rng(3))

	var p: Dictionary = _find(s, "FA1")
	assert_int(int(p["contract_years"])).override_failure_message(
		"계약 연수가 0 그대로다 — 내년에 또 FA가 된다").is_greater(0)
	assert_bool(Contract.is_fa_eligible(p)).is_false()


func test_the_move_is_logged_in_the_career() -> void:
	var s: Dictionary = _state()
	FaRunner.run_market(s, _rng(3))

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
	# ⚠ **프로 전체를 채운다** (P-5b). KBL만 채웠더니 FA가 ABL·JBL로 갔다 —
	# **그게 정상이고 이 이주의 요지다.** 검사가 재려던 건 "갈 데가 하나도
	# 없으면 미계약으로 남는다"이므로 이제 세 리그를 다 막아야 그 자리가 온다
	for lid in TeamProfile.PRO_LEAGUES:
		var limit: int = RosterMaintenance.roster_max_of(lid)
		for t in World.teams_of(lid):
			var tid: String = String(t["id"])
			if not s["world"]["rosters"].has(tid):
				s["world"]["rosters"][tid] = []
			var roster: Array = s["world"]["rosters"][tid]
			while roster.size() < limit:
				roster.append({
					"id": "%s_X%d" % [tid, roster.size()],
					"team_id": tid, "league_id": lid,
					"player_type": "batter", "age": 25,
					"pitching": {"ovr": 30.0}, "batting": {"ovr": 50.0},
					"salary": 3000, "contract_years": 2, "pro_service_years": 3})

	var r: Dictionary = FaRunner.run_market(s, _rng(3))
	assert_int(int(r["unsigned"])).is_equal(1)
	assert_bool(_find(s, "FA1").get("fa_unsigned", false)).is_true()


## 자격자가 없으면 아무 일도 안 한다
func test_no_eligible_players_is_a_no_op() -> void:
	var s: Dictionary = _state()
	_find(s, "FA1")["contract_years"] = 3
	var r: Dictionary = FaRunner.run_market(s, _rng(3))
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
	FaRunner.run_market(s, _rng(3))

	var p: Dictionary = _find(s, "FA1")
	var holder: String = ""
	for tid in s["world"]["rosters"]:
		for q in s["world"]["rosters"][tid]:
			if String(q.get("id", "")) == "FA1":
				holder = tid
	assert_str(String(p["team_id"])).override_failure_message(
		"배열은 옮겼는데 소속은 옛 팀이다").is_equal(holder)
	# ⚠ **KBL로 못 박지 않는다** (P-5b). 시장이 프로 한 판이 되면서 FA1이
	# 실제로 ABL로 갔다 — **그게 이 이주의 요지다.** 재려던 것은 "옮긴 팀의
	# 리그와 소속이 같은가"이므로 그렇게 묻는다
	var want: String = ""
	for lid in TeamProfile.PRO_LEAGUES:
		for t in World.teams_of(lid):
			if String(t["id"]) == holder:
				want = lid
	assert_str(String(p["league_id"])).override_failure_message(
		"%s 팀에 있는데 소속은 %s다" % [want, p["league_id"]]).is_equal(want)


## 옛 경력을 지우지 않는다 — 지우면 이적할 때마다 커리어가 초기화된다
func test_the_move_keeps_the_old_career() -> void:
	var s: Dictionary = _state()
	_find(s, "FA1")["career_events"] = [{"year": 2020, "type": "draft"}]
	FaRunner.run_market(s, _rng(3))

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
	# ⚠ **어느 팀이 데려가든 보호선수(20명)보다 두꺼워야 한다.** 빈 팀이
	# 하나라도 있으면 거기로 가서 보상 후보가 0명이 된다.
	#
	# ⚠ **프로 전체를 채운다** (P-5b). KBL만 채웠더니 FA1이 텅 빈 ABL로 가서
	# 보상 후보가 0이 됐다 — 시장이 한 판이라 국내만 채워서는 못 막는다.
	#
	# 🔴 **해외는 아예 꽉 채운다.** 해외 팀은 로스터가 전원 그 나라 국적이라
	# **보상 후보가 0명이다** — 02도 그렇다(`isForeignInQuotaLeague`가
	# 국적으로 거른다). 이 검사가 재려는 건 국내 A등급 이적의 보상이므로
	# 해외로 새는 길을 막는다
	for lid in TeamProfile.PRO_LEAGUES:
		var limit: int = RosterMaintenance.roster_max_of(lid)
		var home: bool = lid == "LEAGUE_KBL"
		for t in World.teams_of(lid):
			var tid: String = String(t["id"])
			if not s["world"]["rosters"].has(tid):
				s["world"]["rosters"][tid] = []
			var roster: Array = s["world"]["rosters"][tid]
			var want: int = limit if (tid == from_tid or not home) 				else limit - 1
			while roster.size() < want:
				roster.append({"id": "%s_Z%d" % [tid, roster.size()],
					"team_id": tid, "league_id": lid,
					"player_type": "batter", "age": 25,
					"pitching": {"ovr": 30.0}, "batting": {"ovr": 50.0},
					"salary": 3000, "contract_years": 2, "pro_service_years": 3})

	var r: Dictionary = FaRunner.run_market(s, _rng(3))
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
	# ⚠ **프로 전체를 막는다** (P-5b). KBL만 막으면 해외로 간다 —
	# 미계약이 되려면 갈 데가 하나도 없어야 한다
	for lid in TeamProfile.PRO_LEAGUES:
		for t in World.teams_of(lid):
			var tid: String = String(t["id"])
			if not s["world"]["rosters"].has(tid):
				s["world"]["rosters"][tid] = []
			var roster: Array = s["world"]["rosters"][tid]
			while roster.size() < RosterMaintenance.roster_max_of(lid):
				roster.append({"id": "%s_F%d" % [tid, roster.size()],
					"team_id": tid, "league_id": lid,
					"player_type": "batter", "age": 25,
					"pitching": {"ovr": 30.0}, "batting": {"ovr": 50.0},
					"salary": 3000, "contract_years": 2, "pro_service_years": 3})

	FaRunner.run_market(s, _rng(3))
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

	FaRunner.run_market(calm, _rng(11))
	FaRunner.run_market(hot, _rng(11))
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

	FaRunner.run_market(s, _rng(11))
	FaRunner.run_market(poor, _rng(11))
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


## 🔴 **이 검사는 04 자기 약속을 지키고 있었다** — "리그마다 다른 흐름".
## P-5b가 그 약속을 뒤집었다: **02는 프로 전체가 한 판**이라 흐름도 하나고,
## KBL 자격자가 하나 늘면 JBL 계약도 실제로 바뀐다. 그게 02의 동작이다.
##
## **재려던 뜻은 남는다** — 회귀를 잡으려면 결과가 재현돼야 한다.
## 같은 입력이면 같은 결과인지로 옮긴다
func test_the_market_is_reproducible() -> void:
	var a: Dictionary = _with_jbl(_state())
	var b: Dictionary = _with_jbl(_state())
	FaRunner.run(a)
	FaRunner.run(b)
	assert_int(int(_find(a, "J1")["salary"])).override_failure_message(
		"같은 입력인데 계약이 다르다 — 재현이 안 되면 회귀를 못 잡는다") 		.is_equal(int(_find(b, "J1")["salary"]))
	assert_str(String(_find(a, "J1")["team_id"])) 		.is_equal(String(_find(b, "J1")["team_id"]))


## ⚠ **한 판이라 리그가 서로에게 닿는다** — 02가 그렇다. 안 닿으면
## `run_market`이 아직 리그별로 돌고 있다는 뜻이다
func test_leagues_touch_each_other() -> void:
	var a: Dictionary = _with_jbl(_state())
	var b: Dictionary = _with_jbl(_state())
	# b에만 KBL 최고연봉 자격자를 하나 더 둔다
	b["world"]["rosters"]["TEAM_KBL_BUSAN_WAVES_1"].append({
		"id": "FA2", "name": "FA2", "team_id": "TEAM_KBL_BUSAN_WAVES_1",
		"league_id": "LEAGUE_KBL", "player_type": "pitcher", "age": 30,
		"pitching": {"ovr": 80.0}, "batting": {"ovr": 40.0},
		"salary": 15000, "contract_years": 0, "pro_service_years": 9})

	FaRunner.run(a)
	FaRunner.run(b)
	var same_team: bool = String(_find(a, "J1")["team_id"]) 		== String(_find(b, "J1")["team_id"])
	var same_pay: bool = int(_find(a, "J1")["salary"]) 		== int(_find(b, "J1")["salary"])
	assert_bool(same_team and same_pay).override_failure_message(
		"KBL 자격자가 늘었는데 JBL 결과가 그대로다 — 아직 리그별 판이다") 		.is_false()


## ⚠ **프로 리그를 전부 돈다.** 하나만 돌면 해외 FA가 영영 안 열린다
func test_every_pro_league_runs() -> void:
	var s: Dictionary = _with_jbl(_state())
	var r: Dictionary = FaRunner.run(s)
	assert_int(int(r["signings"])).override_failure_message(
		"KBL 하나만 돌았다").is_equal(2)
	assert_int(int(_find(s, "J1")["contract_years"])).override_failure_message(
		"JBL 자격자가 계약을 못 받았다").is_greater(0)


# ── 계측과 게임이 같은 조립을 쓴다 (P-5c) ───────────────────────

## 🔴 **계측이 `run_market`의 조립을 복제하고 있었다.** 게임 쪽 분모를
## 고쳤는데 계측이 안 따라와 **"고쳤는데 그대로"로 한 번 읽혔다.**
## 조립을 한 함수로 빼서 둘이 같이 부른다 — **갈릴 수가 없다**
func test_시장_조립이_한_곳이다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var world: Dictionary = s["world"]
	var teams: Array = FaRunner.market_teams_of(world)
	# ⚠ **프로 세 리그가 한 판이다** (P-5b) — KBL 10팀보다 많아야 한다
	assert_int(teams.size()).override_failure_message(
		"구단이 %d팀이다 — 프로 한 판이면 KBL 10팀보다 많다" % teams.size()) 		.is_greater(10)
	var leagues: Dictionary = {}
	for t in teams:
		leagues[String(t.get("league_id", ""))] = true
	assert_int(leagues.size()).override_failure_message(
		"리그가 %d개뿐이다 — 리그를 넘는 이적이 안 생긴다" % leagues.size()) 		.is_equal(TeamProfile.PRO_LEAGUES.size())
	# 02가 요구한 축이 다 있다 — 하나라도 빠지면 모든 팀이 똑같이 부른다
	for t in teams:
		assert_bool(t.has("budget_index")).override_failure_message(
			"예산 지수가 빠졌다 — 빠지면 이적이 0%가 된다").is_true()
		assert_bool(t.has("win_now_pressure")).is_true()
		assert_bool(t.has("open_slots")).is_true()
		assert_bool(t.has("roster")).is_true()


## 선수 목록도 한 곳이다 — 자격 판정이 두 벌이면 분모가 갈린다
func test_선수_목록도_한_곳이다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var world: Dictionary = s["world"]
	var players: Array = FaRunner.market_players_of(world)
	# 자격자 수와 같아야 한다 — 여기서 또 거르면 두 경로가 갈린다
	assert_int(players.size()).is_equal(
		FaRunner.pro_eligible_of(world).size())
	for p in players:
		assert_bool(p.has("ovr")).is_true()
		assert_bool(p.has("salary")).is_true()
		assert_bool(p.has("from_team_id")).is_true()


# ── 리그를 넘는 이적 (P-5b) ─────────────────────────────────────

## 🔴 **04는 리그마다 따로 돌려 리그를 넘는 이적이 아예 없었다.**
## 02 `market.ts:1241`이 그 자리에 이유를 적어 뒀다 — "Rust FA 오퍼에는
## ABL·JBL 경로가 있는데 목적지 팀을 안 주니 **NPC가 해외로 갈 방법이
## 없었다.** 확장팩을 열어도 32팀이 관전 대상일 뿐이었다."
func test_시장이_프로_한_판이다() -> void:
	var s: Dictionary = _state()
	var teams: Array = FaRunner.market_teams_of(s["world"])
	var by_league: Dictionary = {}
	for t in teams:
		by_league[String(t["league_id"])] = true
	for lid in TeamProfile.PRO_LEAGUES:
		assert_bool(by_league.has(lid)).override_failure_message(
			"%s 팀이 시장에 없다 — 그 리그로는 이적이 안 생긴다" % lid).is_true()


## ⚠ **KBL 자리를 다 막으면 해외로 간다.** 예전엔 미계약으로 남았다
func test_국내가_꽉_차면_해외로_간다() -> void:
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

	FaRunner.run_market(s, _rng(3))
	var me: Dictionary = _find(s, "FA1")
	assert_bool(me.get("fa_unsigned", false)).override_failure_message(
		"국내가 꽉 찼는데 미계약으로 남았다 — 해외 경로가 안 열렸다").is_false()
	assert_str(String(me.get("league_id", ""))).override_failure_message(
		"KBL에 남았다 — 자리가 없는데 옮겨지지 않았다").is_not_equal("LEAGUE_KBL")


## 🔴 **리그를 넘으면 `league_id`도 같이 바뀐다.** 팀만 바꾸면 그 선수는
## 새 팀에 있으면서 옛 리그 순위·정원에 잡힌다
func test_리그를_넘으면_소속_리그도_바뀐다() -> void:
	var s: Dictionary = _state()
	FaRunner.run_market(s, _rng(3))
	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			if String(p.get("team_id", "")) != tid:
				continue
			var want: String = ""
			for lid in TeamProfile.PRO_LEAGUES:
				for t in World.teams_of(lid):
					if String(t["id"]) == tid:
						want = lid
			if want.is_empty():
				continue
			assert_str(String(p.get("league_id", ""))).override_failure_message(
				"%s가 %s 팀에 있는데 소속은 %s다"
				% [p.get("id", "?"), want, p.get("league_id", "?")]) 				.is_equal(want)


## 🔴 **정원은 목적지 리그 것이다.** JBL만 32명이고 KBL·ABL은 34명이라,
## 한 판이 된 뒤에 KBL 정원으로 재면 **JBL 팀이 두 명을 더 받는다.**
## 변이("정원을 KBL로 고정")가 안 잡혀서 이 검사를 세웠다
func test_정원은_목적지_리그_것이다() -> void:
	var s: Dictionary = _state()
	# ⚠ **프로 전부를 정원까지 채운다.** JBL만 채우면 FA가 빈 KBL로 가서
	# 이 갈래에 닿지도 않는다 — 변이가 안 잡혀서 알았다.
	# 전부 꽉 차면 **JBL 정원(32)을 KBL(34)로 재는 순간** JBL이 두 자리를
	# 더 내주고 미계약이 사라진다
	for lid in TeamProfile.PRO_LEAGUES:
		var lim: int = RosterMaintenance.roster_max_of(lid)
		for t in World.teams_of(lid):
			var tid: String = String(t["id"])
			s["world"]["rosters"][tid] = []
			for i in lim:
				s["world"]["rosters"][tid].append({
					"id": "%s_J%d" % [tid, i], "team_id": tid,
					"league_id": lid, "player_type": "batter", "age": 25,
					"pitching": {"ovr": 30.0}, "batting": {"ovr": 50.0},
					"salary": 3000, "contract_years": 2,
					"pro_service_years": 3})
	# FA1을 원소속에 되돌린다 — 위에서 로스터를 갈아엎었다
	s["world"]["rosters"]["TEAM_KBL_BUSAN_WAVES_1"].append({
		"id": "FA1", "name": "FA1", "team_id": "TEAM_KBL_BUSAN_WAVES_1",
		"league_id": "LEAGUE_KBL", "player_type": "pitcher", "age": 30,
		"pitching": {"ovr": 78.0}, "batting": {"ovr": 40.0},
		"salary": 12000, "contract_years": 0, "pro_service_years": 9})

	FaRunner.run_market(s, _rng(3))
	for lid in TeamProfile.PRO_LEAGUES:
		var lim: int = RosterMaintenance.roster_max_of(lid)
		for t in World.teams_of(lid):
			var tid: String = String(t["id"])
			var n: int = (s["world"]["rosters"][tid] as Array).size()
			# 원소속은 FA1이 더해져 정원 + 1이다 — 그 팀만 빼고 본다
			if tid == "TEAM_KBL_BUSAN_WAVES_1":
				continue
			assert_int(n).override_failure_message(
				"%s(%s)가 %d명이다 — 정원은 %d명이다" % [tid, lid, n, lim]) 				.is_less_equal(lim)
