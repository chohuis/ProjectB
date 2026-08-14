extends GdUnitTestSuite

## 부상 배선 — 세계와 주인공에게 부상을 먹인다. B-3.


const TEAM_A: String = "TEAM_A"
const TEAM_B: String = "TEAM_B"
const ME: String = "PLY_PROTAGONIST"


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _npc(id: String, over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"id": id, "name": id, "team_id": TEAM_A,
		"league_id": "LEAGUE_KBL", "career_status": "active", "age": 25,
		"player_type": "pitcher", "role": "SP",
		"pitching": {"ovr": 60.0, "velocity": 60.0}, "batting": {"ovr": 40.0}}
	p.merge(over, true)
	return p


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 70, "season_year": 2026, "seed": 4242,
		"training_plan": {"primary": "TRN_VEL", "secondary": "", "secondary2": ""},
		"schedule": [],
		"protagonist": {"id": ME, "name": "나", "team_id": TEAM_A, "age": 20,
			"player_type": "pitcher", "fatigue": 0.0, "condition": 100.0,
			"pitching": {"ovr": 70.0, "velocity": 70.0, "command": 60.0,
				"control": 60.0, "stamina": 60.0, "movement": 60.0},
			"batting": {"ovr": 40.0, "contact": 40.0}},
		"world": {"rosters": {TEAM_A: [_npc("A_1"), _npc("A_2")]}},
	}
	s.merge(over, true)
	return s


## 그 주에 뛴 기록을 일정에 꽂는다
func _game(day: int, player_ids: Array, role: String = "pitcher") -> Dictionary:
	var lines: Array = []
	for pid in player_ids:
		lines.append({"role": role, "player_id": String(pid), "ip": 6.0, "er": 2.0})
	return {"day": day, "home": TEAM_A, "away": TEAM_B,
		"result": {"home_score": 3, "away_score": 2, "winner_id": TEAM_A,
			"loser_id": TEAM_B, "player_lines": lines}}


# ── 주인공 ────────────────────────────────────────────────────

## 훈련 강도는 채운 칸으로 본다. **회복 훈련은 강도가 아니다**
func test_the_intensity_counts_real_training() -> void:
	var s: Dictionary = _state({"training_plan": {"primary": "", "secondary": "",
		"secondary2": ""}})
	assert_float(InjuryRunner.training_intensity(s)).is_equal(0.0)

	s["training_plan"] = {"primary": "TRN_VEL", "secondary": "TRN_CTRL_CMD",
		"secondary2": "TRN_STAMINA"}
	assert_float(InjuryRunner.training_intensity(s)).is_equal(1.0)

	s["training_plan"] = {"primary": "TRN_RECOVERY", "secondary": "TRN_RECOVERY",
		"secondary2": "TRN_RECOVERY"}
	assert_float(InjuryRunner.training_intensity(s)).override_failure_message(
		"회복 훈련을 고강도로 셌다").is_equal(0.0)


## 멀쩡하면 아무 일도 없다
func test_a_healthy_week_is_quiet() -> void:
	var s: Dictionary = _state()
	InjuryRunner.run_protagonist(s, 70, _rng(1))
	assert_bool(InjuryRunner.is_hurt(s, ME)).is_false()
	assert_bool(s.has("body_log")).is_false()


## ⚠ **임계를 넘은 첫 주는 경고만.** 아무 예고 없이 시즌이 끝나면
## "관리 실패"가 아니라 "재수 없음"이 된다
func test_the_first_hard_week_only_warns() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["fatigue"] = 95.0
	InjuryRunner.run_protagonist(s, 70, _rng(1))

	assert_bool(InjuryRunner.is_hurt(s, ME)).override_failure_message(
		"유예 주인데 다쳤다").is_false()
	var log: Array = s["body_log"]
	assert_int(log.size()).is_equal(1)
	assert_str(String(log[0]["kind"])).is_equal("warning")
	assert_float(float(log[0]["risk"])).is_greater(0.0)
	assert_int(int(s["protagonist"]["consecutive_high_fatigue_weeks"])).is_equal(1)


## 두 주째는 다친다 — 유예가 영영이면 경고가 뜻을 잃는다
func test_the_second_hard_week_hurts() -> void:
	var hurt: int = 0
	for i in 40:
		var s: Dictionary = _state()
		s["protagonist"]["fatigue"] = 95.0
		s["protagonist"]["consecutive_high_fatigue_weeks"] = 1
		InjuryRunner.run_protagonist(s, 70, _rng(i))
		if InjuryRunner.is_hurt(s, ME):
			hurt += 1
	assert_int(hurt).override_failure_message(
		"40번 중 %d번만 다쳤다 — 두 주째 판정이 안 걸린다" % hurt).is_greater(10)


## ⚠ **훈련을 밀어붙여도 다친다.** 피로가 낮아도 컨디션이 무너진 채로
## 고강도를 돌리면 그게 부상이다 — 강도를 안 넘기면 이 축이 통째로 죽는다
func test_overtraining_alone_can_hurt_me() -> void:
	var hurt: int = 0
	for i in 200:
		var s: Dictionary = _state()
		s["protagonist"]["fatigue"] = 0.0
		s["protagonist"]["condition"] = 50.0
		s["training_plan"] = {"primary": "TRN_VEL", "secondary": "TRN_CTRL_CMD",
			"secondary2": "TRN_STAMINA"}
		InjuryRunner.run_protagonist(s, 70, _rng(i))
		if InjuryRunner.is_hurt(s, ME):
			hurt += 1
	assert_int(hurt).override_failure_message(
		"컨디션 50에 고강도 3칸으로 200주를 살았는데 한 번도 안 다쳤다") \
		.is_greater(0)


## ⚠ **사기가 오래 바닥이면 입스가 온다.** 안 넘기면 심리 축이 통째로 죽는다
func test_a_long_slump_brings_the_yips() -> void:
	var yips: int = 0
	for i in 200:
		var s: Dictionary = _state()
		s["protagonist"]["consecutive_low_morale_weeks"] = 8
		InjuryRunner.run_protagonist(s, 70, _rng(i))
		if String(InjuryRunner.of(s, ME).get("type", "")) == "YIPS":
			yips += 1
	assert_int(yips).override_failure_message(
		"사기가 여덟 주 바닥인데 입스가 한 번도 안 왔다").is_greater(0)


## 같은 곳을 또 다치면 더 잘 다친다 — 이력을 안 넘기면 재발이 없다
func test_a_prior_injury_makes_it_more_likely() -> void:
	var counts: Array = []
	for prior in [false, true]:
		var hurt: int = 0
		for i in 300:
			var s: Dictionary = _state()
			s["protagonist"]["fatigue"] = 85.0
			s["protagonist"]["consecutive_high_fatigue_weeks"] = 1
			s["protagonist"]["has_prior_injury"] = prior
			InjuryRunner.run_protagonist(s, 70, _rng(i))
			if InjuryRunner.is_hurt(s, ME):
				hurt += 1
		counts.append(hurt)
	assert_int(counts[1]).override_failure_message(
		"재발 이력이 있어도(%d) 없을 때(%d)와 같이 다친다" % [counts[1], counts[0]]) \
		.is_greater(counts[0])


## 다치면 언제·무엇으로·몇 주인지가 남는다
func test_an_injury_records_itself() -> void:
	for i in 60:
		var s: Dictionary = _state()
		s["protagonist"]["fatigue"] = 99.0
		s["protagonist"]["consecutive_high_fatigue_weeks"] = 3
		InjuryRunner.run_protagonist(s, 70, _rng(i))
		if not InjuryRunner.is_hurt(s, ME):
			continue
		var row: Dictionary = InjuryRunner.of(s, ME)
		assert_int(int(row["since_day"])).is_equal(70)
		assert_int(int(row["total_weeks"])).is_equal(int(row["weeks_left"]))
		assert_str(String(row["severity"])).is_equal(
			Injury.severity_of(String(row["type"])))
		assert_str(String(row["source"])).is_not_empty()
		# 소식 버퍼에도 들어간다
		assert_int(s["injury_news"].size()).is_equal(1)
		assert_bool(bool(s["injury_news"][0]["mine"])).is_true()
		return
	assert_bool(false).override_failure_message(
		"60번 굴려도 안 다쳤다").is_true()


## ⚠ **부상 배수가 상태에 남아야 한다.** 값만 두고 아무도 안 읽으면
## 다쳤는데 아무 일도 안 일어난다
func test_the_effect_multiplier_reaches_the_player() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["injury"] = {"type": "UCL_FULL", "severity": "surgery",
		"weeks_left": 40, "total_weeks": 60, "since_day": 10}
	InjuryRunner.run_protagonist(s, 70, _rng(1))
	assert_float(float(s["protagonist"]["injury_eff_mod"])).override_failure_message(
		"수술 중인데 능력 배수가 그대로다").is_equal(0.0)

	var healthy: Dictionary = _state()
	InjuryRunner.run_protagonist(healthy, 70, _rng(1))
	assert_float(float(healthy["protagonist"]["injury_eff_mod"])).is_equal(1.0)


func test_the_weeks_tick_down_and_keep_the_history() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["injury"] = {"type": "ELBOW_INFLAM", "severity": "moderate",
		"weeks_left": 5, "total_weeks": 8, "since_day": 10, "source": "fatigue"}
	InjuryRunner.run_protagonist(s, 70, _rng(1))

	var row: Dictionary = InjuryRunner.of(s, ME)
	assert_int(int(row["weeks_left"])).is_equal(4)
	assert_int(int(row["since_day"])).override_failure_message(
		"틱다운이 다친 날을 덮어썼다").is_equal(10)
	assert_int(int(row["total_weeks"])).is_equal(8)
	assert_str(String(row["source"])).is_equal("fatigue")
	# 회복 중에는 소식을 또 안 보낸다
	assert_bool(s.has("injury_news")).is_false()


## 나으면 자리가 비고, 후유증이 능력치에 남는다
func test_healing_leaves_a_mark() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["injury"] = {"type": "UCL_FULL", "severity": "surgery",
		"weeks_left": 1, "total_weeks": 60, "since_day": 10}
	var before: float = float(s["protagonist"]["pitching"]["velocity"])
	InjuryRunner.run_protagonist(s, 70, _rng(1))

	assert_bool(InjuryRunner.is_hurt(s, ME)).is_false()
	assert_float(float(s["protagonist"]["pitching"]["velocity"])) \
		.override_failure_message("UCL 완전 파열에서 나았는데 구속이 그대로다") \
		.is_less(before)
	assert_bool(bool(s["protagonist"]["has_prior_injury"])).override_failure_message(
		"재발 이력이 안 남았다").is_true()
	assert_str(String(s["body_log"][0]["kind"])).is_equal("healed")


## ⚠ **후유증 뒤에 OVR을 다시 낸다.** 안 하면 흔적이 개별 능력치에만 남고
## 드래프트·계약이 보는 숫자는 안 움직인다
func test_the_scar_reaches_the_ovr() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["injury"] = {"type": "ROTATOR_FULL", "severity": "surgery",
		"weeks_left": 1, "total_weeks": 60, "since_day": 10}
	var before: float = Contract.core_ovr(s["protagonist"])
	InjuryRunner.run_protagonist(s, 70, _rng(1))
	assert_float(Contract.core_ovr(s["protagonist"])).override_failure_message(
		"회전근개 완전 파열을 겪었는데 OVR이 %.0f 그대로다" % before).is_less(before)


## 가벼운 부상은 흔적을 안 남긴다
func test_a_light_injury_leaves_nothing() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["injury"] = {"type": "BLISTER", "severity": "light",
		"weeks_left": 1, "total_weeks": 2, "since_day": 60}
	var before: float = float(s["protagonist"]["pitching"]["velocity"])
	InjuryRunner.run_protagonist(s, 70, _rng(1))
	assert_float(float(s["protagonist"]["pitching"]["velocity"])).is_equal(before)


## 주인공이 없으면 아무 일도 없다
func test_no_protagonist_no_injury() -> void:
	var s: Dictionary = _state({"protagonist": {}})
	assert_dict(InjuryRunner.run_protagonist(s, 70, _rng(1))).is_empty()


# ── 연투 ──────────────────────────────────────────────────────

## ⚠ **결과가 있는 경기만 센다.** 아직 안 치른 경기를 세면 안 뛴 사람이
## 연투로 잡힌다
func test_only_played_games_count() -> void:
	var pending: Dictionary = _game(66, ["A_1"])
	pending["result"] = null
	var s: Dictionary = _state({"schedule": [pending]})
	assert_dict(InjuryRunner.appearances(s["schedule"], 70)).is_empty()


## 주 단위로 센다 — 한 주에 두 번 나와도 한 주다
func test_appearances_are_counted_by_week() -> void:
	var s: Dictionary = _state({"schedule": [
		_game(64, ["A_1"]), _game(66, ["A_1"]), _game(59, ["A_1"])]})
	var apps: Dictionary = InjuryRunner.appearances(s["schedule"], 70)
	assert_int(apps["A_1"]["weeks"].size()).is_equal(2)


## ⚠ **창 밖의 경기는 안 센다.** 시즌 전체를 보면 개막전에 나온 사람이
## 지금 연투 중인 것이 된다
func test_old_games_are_outside_the_window() -> void:
	var s: Dictionary = _state({"schedule": [_game(10, ["A_1"])]})
	assert_dict(InjuryRunner.appearances(s["schedule"], 70)) \
		.override_failure_message("60일 전 경기를 연투로 셌다").is_empty()
	# 창 안이면 센다
	assert_dict(InjuryRunner.appearances(s["schedule"], 14)).is_not_empty()


## 이번 주 직전부터 거슬러 센다. **끊기면 거기서 멈춘다**
func test_the_streak_stops_where_it_breaks() -> void:
	assert_int(InjuryRunner.consecutive_weeks({9: true, 8: true, 7: true}, 10)) \
		.is_equal(3)
	# 8주가 빠지면 9주 하나만 센다
	assert_int(InjuryRunner.consecutive_weeks({9: true, 7: true, 6: true}, 10)) \
		.override_failure_message("끊긴 뒤까지 이어 셌다").is_equal(1)
	assert_int(InjuryRunner.consecutive_weeks({}, 10)).is_equal(0)


# ── NPC ───────────────────────────────────────────────────────

## `weeks_back`주 연속 등판한 팀. `over`로 선수 속성을 바꾼다
func _worn_state(count: int = 60, weeks_back: int = 6,
		over: Dictionary = {}) -> Dictionary:
	var roster: Array = []
	var schedule: Array = []
	var ids: Array = []
	for i in count:
		roster.append(_npc("N%03d" % i, over))
		ids.append("N%03d" % i)
	for w in range(10 - weeks_back, 10):
		schedule.append(_game(w * 7 - 3, ids))
	var s: Dictionary = _state({"schedule": schedule})
	s["world"]["rosters"][TEAM_A] = roster
	return s


func _hurt_count(s: Dictionary, seed_value: int = 9) -> int:
	return int(InjuryRunner.run_npcs(s, 70, _rng(seed_value))["occurred"])


func test_worn_out_npcs_get_hurt() -> void:
	var s: Dictionary = _worn_state()
	var out: Dictionary = InjuryRunner.run_npcs(s, 70, _rng(9))
	assert_int(int(out["occurred"])).override_failure_message(
		"여섯 주 연투한 60명 중 아무도 안 다쳤다").is_greater(0)
	assert_int(InjuryRunner.all_of(s).size()).is_equal(int(out["occurred"]))


## ⚠ **연투 수가 판정에 닿는다.** 안 넘기면 쉬든 굴리든 똑같이 다친다
func test_the_streak_reaches_the_roll() -> void:
	var worn: int = _hurt_count(_worn_state(300, 6))
	var fresh: int = _hurt_count(_worn_state(300, 1))
	assert_int(worn).override_failure_message(
		"여섯 주 연투(%d)가 한 주 등판(%d)과 같이 다친다" % [worn, fresh]) \
		.is_greater(fresh)


## ⚠ **나이가 판정에 닿는다.** 안 넘기면 서른여섯 살이 스물다섯과 같다
func test_age_reaches_the_roll() -> void:
	var old: int = _hurt_count(_worn_state(300, 6, {"age": 36}))
	var young: int = _hurt_count(_worn_state(300, 6, {"age": 25}))
	assert_int(old).override_failure_message(
		"36세(%d)가 25세(%d)와 같이 다친다" % [old, young]).is_greater(young)


## ⚠ **보직마다 문턱이 다르다.** 선발이 제일 위험하고 야수가 제일 덜하다
func test_the_role_reaches_the_roll() -> void:
	var starters: int = _hurt_count(_worn_state(400, 6, {"role": "SP"}))
	var relievers: int = _hurt_count(_worn_state(400, 6, {"role": "RP"}))
	assert_int(starters).override_failure_message(
		"선발(%d)이 불펜(%d)과 같이 다친다 — 보직을 안 가렸다"
		% [starters, relievers]).is_greater(relievers)


## ⚠ **야수는 투수 표를 안 쓴다.** 줄의 역할을 안 보면 야수가 불펜 문턱으로
## 판정돼 훨씬 많이 다친다
func test_a_batter_is_not_a_pitcher() -> void:
	var relievers: Dictionary = _worn_state(500, 6, {"role": "RP"})
	var batters: Dictionary = _worn_state(500, 6,
		{"player_type": "batter", "role": ""})
	for g in batters["schedule"]:
		for line in g["result"]["player_lines"]:
			line["role"] = "batter"

	var rp: int = _hurt_count(relievers)
	var bat: int = _hurt_count(batters)
	assert_int(rp).override_failure_message(
		"야수(%d)가 불펜(%d)과 같이 다친다 — 줄의 역할을 안 봤다" % [bat, rp]) \
		.is_greater(bat)


## ⚠ **이미 다친 사람에게 새 부상을 안 얹는다.** 얹으면 회복이 안 끝난다 —
## 남은 주가 매주 새로 채워진다
func test_the_already_hurt_only_tick_down() -> void:
	# 300명 전원이 회복 중이면서 그 주에 등판까지 했다 — 제일 험한 경우다
	var s: Dictionary = _worn_state(300)
	var hurt: Dictionary = {}
	for i in 300:
		hurt["N%03d" % i] = {"type": "ELBOW_INFLAM", "severity": "moderate",
			"weeks_left": 5, "total_weeks": 8, "since_day": 20,
			"penalty_applied": false}
	s["injuries"] = hurt

	InjuryRunner.run_npcs(s, 70, _rng(9))
	assert_int(InjuryRunner.all_of(s).size()).is_equal(300)
	for pid in InjuryRunner.all_of(s):
		var now: Dictionary = InjuryRunner.of(s, pid)
		assert_int(int(now["weeks_left"])).override_failure_message(
			"%s가 회복 중에 다시 다쳤다 (남은 주 5 → %d)" % [pid, now["weeks_left"]]) \
			.is_equal(4)
		assert_str(String(now["type"])).is_equal("ELBOW_INFLAM")
		assert_int(int(now["since_day"])).is_equal(20)


## 그만둔 사람은 안 다친다
func test_someone_who_quit_does_not_get_hurt() -> void:
	var s: Dictionary = _worn_state(60, 6, {"career_status": "retired"})
	assert_int(_hurt_count(s)).override_failure_message(
		"그만둔 사람이 다쳤다").is_equal(0)


## ⚠ **주인공은 NPC 경로로 안 다친다.** 두 경로가 같은 사람을 만지면
## 주인공 부상 자리가 NPC 판정으로 덮인다
func test_the_npc_path_never_touches_me() -> void:
	for i in 80:
		# ⚠ **주인공도 로스터 안에 있다**(`World.new_game`이 그렇게 넣는다) —
		# 밖에 두면 이 검사가 아무것도 안 본다
		var s: Dictionary = _state()
		s["world"]["rosters"][TEAM_A] = [_npc(ME,
			{"age": 36, "has_prior_injury": true})]
		s["schedule"] = []
		for w in range(4, 10):
			s["schedule"].append(_game(w * 7 - 2, [ME]))

		InjuryRunner.run_npcs(s, 70, _rng(i))
		assert_bool(s["protagonist"].get("injury", null) == null) \
			.override_failure_message("주인공이 NPC 경로로 다쳤다 (씨앗 %d)" % i) \
			.is_true()
		assert_bool(InjuryRunner.all_of(s).has(ME)).is_false()


## ⚠ **02가 빠뜨린 줄이다.** 나을 때 `active`로 안 되돌려서 한 번 다친
## NPC가 영구히 `injured`로 남았다 — 실측 고교 3,015명 중 1,429명(47%)
func test_healing_puts_an_npc_back_in_the_roster() -> void:
	var s: Dictionary = _state()
	s["injuries"] = {"A_1": {"type": "BLISTER", "severity": "light",
		"weeks_left": 1, "total_weeks": 2, "since_day": 60,
		"penalty_applied": false}}
	s["world"]["rosters"][TEAM_A][0]["career_status"] = "injured"

	var out: Dictionary = InjuryRunner.run_npcs(s, 70, _rng(1))
	assert_int(int(out["healed"])).is_equal(1)
	assert_str(String(s["world"]["rosters"][TEAM_A][0]["career_status"])) \
		.override_failure_message(
			"나았는데 injured로 남았다 — 로스터·드래프트·성장에서 통째로 빠진다") \
		.is_equal("active")
	assert_bool(InjuryRunner.is_hurt(s, "A_1")).is_false()
	assert_dict(InjuryRunner.all_of(s)).override_failure_message(
		"나았는데 부상 목록에 남아 있다 — 다음 주 판정에서 계속 걸러진다") \
		.is_empty()
	assert_bool(bool(s["world"]["rosters"][TEAM_A][0]["has_prior_injury"])).is_true()


## 수술에서 나으면 능력이 영구히 깎인다
func test_a_surgery_leaves_a_mark_on_an_npc() -> void:
	var s: Dictionary = _state()
	s["injuries"] = {"A_1": {"type": "ROTATOR_FULL", "severity": "surgery",
		"weeks_left": 1, "total_weeks": 60, "since_day": 10,
		"penalty_applied": false}}
	var before: float = float(s["world"]["rosters"][TEAM_A][0]["pitching"]["ovr"])
	InjuryRunner.run_npcs(s, 70, _rng(1))
	assert_float(float(s["world"]["rosters"][TEAM_A][0]["pitching"]["ovr"])) \
		.override_failure_message("회전근개 완전 파열에서 나았는데 OVR이 그대로다") \
		.is_less(before)


## 가벼운 부상은 흔적을 안 남긴다
func test_a_light_npc_injury_leaves_nothing() -> void:
	var s: Dictionary = _state()
	s["injuries"] = {"A_1": {"type": "BLISTER", "severity": "light",
		"weeks_left": 1, "total_weeks": 2, "since_day": 60,
		"penalty_applied": false}}
	var before: float = float(s["world"]["rosters"][TEAM_A][0]["pitching"]["ovr"])
	InjuryRunner.run_npcs(s, 70, _rng(1))
	assert_float(float(s["world"]["rosters"][TEAM_A][0]["pitching"]["ovr"])) \
		.is_equal(before)


## ⚠ **참고 뛰는 사람은 로스터에서 안 뺀다.** 빼면 실제로는 뛰고 있는데
## 명단에 없다
func test_playing_through_stays_in_the_roster() -> void:
	var s: Dictionary = _worn_state()
	InjuryRunner.run_npcs(s, 70, _rng(9))
	var through: int = 0
	for pid in InjuryRunner.all_of(s):
		if not bool(InjuryRunner.of(s, pid).get("playing_through", false)):
			continue
		through += 1
		for p in s["world"]["rosters"][TEAM_A]:
			if String(p["id"]) == pid:
				assert_str(String(p["career_status"])).override_failure_message(
					"%s가 참고 뛰는데 명단에서 빠졌다" % pid).is_equal("active")
	assert_int(through).override_failure_message(
		"참고 뛰는 사람이 하나도 없다 — 관리 중립(50)이면 경미는 강행이다") \
		.is_greater(0)


## ⚠ **강행이 아니면 명단에서 뺀다.** 안 빼면 중증 부상자가 로스터에 남아
## 로테이션·순위가 그 위에 선다
func test_a_real_injury_takes_you_off_the_roster() -> void:
	var s: Dictionary = _worn_state(300)
	InjuryRunner.run_npcs(s, 70, _rng(9))
	var benched: int = 0
	for pid in InjuryRunner.all_of(s):
		if bool(InjuryRunner.of(s, pid).get("playing_through", false)):
			continue
		benched += 1
		for p in s["world"]["rosters"][TEAM_A]:
			if String(p["id"]) == pid:
				assert_str(String(p["career_status"])).override_failure_message(
					"%s가 %s인데 명단에 그대로 있다"
					% [pid, InjuryRunner.of(s, pid)["severity"]]).is_equal("injured")
	assert_int(benched).override_failure_message(
		"강행이 아닌 부상이 하나도 없다").is_greater(0)


## 다친 사람은 소식 버퍼에 담긴다 — 안 담으면 월간 리포트가 늘 비어 있다
func test_an_npc_injury_reaches_the_news() -> void:
	var s: Dictionary = _worn_state()
	var out: Dictionary = InjuryRunner.run_npcs(s, 70, _rng(9))
	assert_int(s.get("injury_news", []).size()).override_failure_message(
		"%d명이 다쳤는데 소식 버퍼가 비었다" % out["occurred"]) \
		.is_equal(int(out["occurred"]))


## 안 뛴 사람은 안 다친다 — 부상이 출전에서 온다
func test_nobody_gets_hurt_sitting_still() -> void:
	var s: Dictionary = _state()
	assert_int(int(InjuryRunner.run_npcs(s, 70, _rng(9))["occurred"])).is_equal(0)


# ── 소식 ──────────────────────────────────────────────────────

func test_the_news_sums_up_the_month() -> void:
	var s: Dictionary = _state()
	s["injury_news"] = [
		{"player_id": "P1", "injury_type": "UCL_FULL", "severity": "surgery",
			"weeks": 60, "day": 60},
		{"player_id": "P2", "injury_type": "UCL_PARTIAL", "severity": "severe",
			"weeks": 14, "day": 62},
		{"player_id": "P3", "injury_type": "BLISTER", "severity": "light",
			"weeks": 2, "day": 64}]
	var news: Dictionary = InjuryRunner.build_news(s, 70)
	assert_int(int(news["total"])).is_equal(3)
	assert_int(int(news["counts"]["surgery"])).is_equal(1)
	assert_str(String(news["preview"])).contains("수술 1")


func test_an_empty_month_sends_nothing() -> void:
	assert_dict(InjuryRunner.build_news(_state(), 70)).override_failure_message(
		"부상이 없는 달에도 소식을 보냈다").is_empty()


## 시즌 남은 주를 일정에서 낸다. **일정이 없으면 0** — 모르는 걸 안다고 안 한다
func test_the_weeks_left_come_from_the_schedule() -> void:
	assert_int(InjuryRunner.weeks_left_in_season(_state(), 70)).is_equal(0)
	var s: Dictionary = _state({"schedule": [_game(350, ["A_1"])]})
	assert_int(InjuryRunner.weeks_left_in_season(s, 70)).is_equal(
		Calendar.week_of(350) - Calendar.week_of(70))


## 시즌이 이미 지났으면 0이다 — 음수가 나오면 시즌 아웃 판정이 뒤집힌다
func test_a_finished_season_has_no_weeks_left() -> void:
	var s: Dictionary = _state({"schedule": [_game(30, ["A_1"])]})
	assert_int(InjuryRunner.weeks_left_in_season(s, 70)).override_failure_message(
		"시즌이 끝났는데 남은 주가 음수다").is_equal(0)


## ⚠ **시즌 남은 주가 소식에 닿는다.** 안 넘기면 시즌을 통째로 날리는
## 부상이 그냥 "장기"로 적힌다
func test_the_weeks_left_reach_the_class() -> void:
	var s: Dictionary = _state({"schedule": [_game(84, ["A_1"])]})
	s["injury_news"] = [{"player_id": "P1", "injury_type": "UCL_PARTIAL",
		"severity": "severe", "weeks": 14, "day": 66}]
	var news: Dictionary = InjuryRunner.build_news(s, 70)
	assert_int(int(news["weeks_left_in_season"])).is_equal(2)
	assert_int(int(news["counts"]["season_out"])).override_failure_message(
		"두 주 남았는데 14주짜리 부상이 시즌 아웃이 아니다").is_equal(1)
	assert_int(int(news["counts"]["long"])).is_equal(0)


## 4주마다 온다 — 매주면 소식함이 부상 통보로 찬다
func test_the_news_comes_on_the_month_boundary() -> void:
	var s: Dictionary = _state()
	s["injury_news"] = [{"player_id": "P1", "injury_type": "BLISTER",
		"severity": "light", "weeks": 2, "day": 60}]
	# 3주차 — 아직 아니다
	assert_dict(InjuryRunner.run(s, 21)["news"]).is_empty()
	assert_int(s["injury_news"].size()).override_failure_message(
		"소식 주가 아닌데 버퍼를 비웠다").is_equal(1)

	# 4주차 = 28일
	var out: Dictionary = InjuryRunner.run(s, 28)
	assert_bool(out["news"].is_empty()).override_failure_message(
		"소식 주인데 아무것도 안 왔다").is_false()
	assert_int(s["injury_log"].size()).is_equal(1)
	assert_array(s["injury_news"]).override_failure_message(
		"소식을 보내고 버퍼를 안 비웠다 — 다음 달에 지난달 것이 섞인다").is_empty()


## ⚠ **담을 게 없어도 버퍼는 비운다.** 안 비우면 다음 달에 지난달 것이 섞인다
func test_the_buffer_is_cleared_even_when_quiet() -> void:
	var s: Dictionary = _state()
	s["injury_news"] = []
	InjuryRunner.run(s, 28)
	assert_array(s["injury_news"]).is_empty()
	assert_bool(s.has("injury_log")).is_false()


## 같은 해·같은 주면 같은 부상이 난다 — 세이브를 다시 열 때마다 달라지면 안 된다
func test_the_same_week_gives_the_same_injuries() -> void:
	var a: Dictionary = _worn_state()
	var b: Dictionary = _worn_state()
	InjuryRunner.run(a, 70)
	InjuryRunner.run(b, 70)
	var ka: Array = InjuryRunner.all_of(a).keys()
	var kb: Array = InjuryRunner.all_of(b).keys()
	ka.sort()
	kb.sort()
	assert_array(ka).is_equal(kb)


## 해가 다르면 다른 사람이 다친다
func test_a_different_year_hurts_different_people() -> void:
	var a: Dictionary = _worn_state()
	var b: Dictionary = _worn_state()
	b["season_year"] = 2031
	InjuryRunner.run(a, 70)
	InjuryRunner.run(b, 70)
	var ka: Array = InjuryRunner.all_of(a).keys()
	var kb: Array = InjuryRunner.all_of(b).keys()
	ka.sort()
	kb.sort()
	assert_array(ka).override_failure_message(
		"해가 달라도 같은 사람이 다친다 — 씨앗에 해가 안 들어갔다").is_not_equal(kb)
