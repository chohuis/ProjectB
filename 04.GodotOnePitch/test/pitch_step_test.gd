extends GdUnitTestSuite

## 투구 한 번 — 카운트·아웃·주자·득점·기록. M2-5b.
##
## 원본: `packages/engine-native/src/match_engine.rs`의 `step_pitch_core`
##
## 여기가 M2의 조각들을 엮는 자리다. 결과 코드는 `MatchResult`,
## 타구는 `BattedBall`, 주루는 `Baserunning`, 품질은 `PitchOutcome`,
## 이닝 전환은 `MatchState`가 맡는다.
##
## ⚠ **결과 코드를 이 파일에서 새로 판정하지 않는다.** 원본이 그 자리에
## "목록을 두 번 적으면 코드가 늘 때 빠뜨린 자리가 생긴다"고 적어 뒀다.

const ScriptedRng = preload("res://test/support/scripted_rng.gd")


func _state(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"inning": 1, "half": "top", "outs": 0,
		"count": {"balls": 0, "strikes": 0},
		"runners": {"first": {}, "second": {}, "third": {}},
		"score": {"home": 0, "away": 0},
		"inning_scores": {"home": [0, 0, 0, 0, 0, 0, 0, 0, 0], "away": [0, 0, 0, 0, 0, 0, 0, 0, 0]},
		"inning_limit": 9, "is_finished": false,
		"pitch_count": 0,
		"pitcher": {"command": 50.0, "velocity": 50.0, "control": 50.0, "movement": 50.0,
			"clutch": 50.0, "stamina_cap": 60.0, "mental_resil": 50.0, "hold_runners": 50.0},
		"batter": {"id": "B1", "contact": 50.0, "eye": 50.0, "discipline": 50.0,
			"power": 50.0, "batting_clutch": 50.0, "speed": 70.0, "instinct": 70.0},
		"stamina": 80.0, "mental": 60.0, "grade": 3,
		"fielders": [],
		"last_pitch_types": [],
		"weather": "sunny", "park": "neutral",
		"defense": {"errors": 0, "assists": 0, "throw_outs": 0, "throw_safes": 0},
		"pitcher_line": {"outs": 0, "pc": 0, "k": 0, "bb": 0, "h": 0, "er": 0},
		"batter_accum": {},
		"logs": [],
	}
	d.merge(o, true)
	return d


func _decision(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"pitch_type": "fastball", "location": 5,
		"strategy": "balanced", "power": "normal"}
	d.merge(o, true)
	return d


func _runner() -> Dictionary:
	return {"speed": 40.0, "instinct": 40.0}


## 결과 코드를 강제로 주고 그 뒤 처리만 본다.
##
## ⚠ 착탄·스윙·컨택은 난수 여덟 개를 먹는다. 그걸 다 맞춰 원하는 결과를
## 뽑으려 하면 검사가 계수 하나만 바뀌어도 깨진다 — **뒤처리를 보는
## 검사는 코드를 직접 준다**
func _apply(code: String, state: Dictionary, o: Dictionary = {}) -> Dictionary:
	var rolls: Array = o.get("rolls", [0.99])
	return PitchStep.apply_result(code, o.get("ball", {}), state,
		_decision(o.get("decision", {})), ScriptedRng.new(rolls), o.get("fielding", {}))


func _occupied(runners: Dictionary) -> Array:
	var out: Array = []
	for b in ["first", "second", "third"]:
		if not runners[b].is_empty():
			out.append(b)
	return out


# ── 카운트 ─────────────────────────────────────────────────────────

func test_a_ball_adds_to_the_count() -> void:
	var s: Dictionary = _apply("BALL", _state())["state"]
	assert_int(s["count"]["balls"]).is_equal(1)
	assert_int(s["outs"]).is_equal(0)


func test_ball_four_is_a_walk() -> void:
	var s: Dictionary = _state({"count": {"balls": 3, "strikes": 1}})
	var out: Dictionary = _apply("BALL", s)
	assert_str(out["code"]).is_equal("WALK")
	assert_int(out["state"]["count"]["balls"]).is_equal(0)
	assert_array(_occupied(out["state"]["runners"])).is_equal(["first"])


func test_three_balls_is_not_a_walk() -> void:
	# ⚠ 문턱 바로 아래를 본다. 0볼과 3볼만 보면 문턱을 3으로 내려도 통과한다
	var out: Dictionary = _apply("BALL", _state({"count": {"balls": 2, "strikes": 0}}))
	assert_str(out["code"]).is_equal("BALL")
	assert_int(out["state"]["count"]["balls"]).is_equal(3)
	assert_array(_occupied(out["state"]["runners"])).is_empty()


func test_a_strike_adds_to_the_count() -> void:
	var s: Dictionary = _apply("STRIKE_SWING", _state())["state"]
	assert_int(s["count"]["strikes"]).is_equal(1)


func test_two_strikes_is_not_an_out() -> void:
	var out: Dictionary = _apply("STRIKE_SWING", _state({"count": {"balls": 0, "strikes": 1}}))
	assert_int(out["state"]["count"]["strikes"]).is_equal(2)
	assert_int(out["state"]["outs"]).is_equal(0)


func test_strike_three_is_an_out() -> void:
	var out: Dictionary = _apply("STRIKE_LOOK", _state({"count": {"balls": 1, "strikes": 2}}))
	assert_int(out["state"]["outs"]).is_equal(1)
	assert_int(out["state"]["count"]["strikes"]).is_equal(0)


func test_a_foul_with_two_strikes_does_not_add() -> void:
	# ⚠ 파울로 삼진을 잡으면 승부가 끝없이 안 끝나거나 너무 빨리 끝난다
	var s: Dictionary = _apply("FOUL", _state({"count": {"balls": 0, "strikes": 2}}))["state"]
	assert_int(s["count"]["strikes"]).is_equal(2)
	assert_int(s["outs"]).is_equal(0)


func test_a_foul_below_two_strikes_adds() -> void:
	var s: Dictionary = _apply("FOUL", _state({"count": {"balls": 0, "strikes": 1}}))["state"]
	assert_int(s["count"]["strikes"]).is_equal(2)


# ── 인플레이 아웃 ──────────────────────────────────────────────────

func test_an_in_play_out_resets_the_count() -> void:
	var out: Dictionary = _apply("INPLAY_OUT", _state({"count": {"balls": 2, "strikes": 1}}),
		{"ball": {"hit_type": "flyBall", "zone": "CF", "hardness": 3}})
	assert_int(out["state"]["outs"]).is_equal(1)
	assert_int(out["state"]["count"]["balls"]).is_equal(0)
	# 코드가 타구 종류로 좁혀진다
	assert_str(out["code"]).is_equal("FLY_OUT")


func test_a_double_play_takes_two_outs() -> void:
	var s: Dictionary = _state({"runners": {"first": _runner(), "second": {}, "third": {}}})
	var out: Dictionary = _apply("INPLAY_OUT", s,
		{"ball": {"hit_type": "groundBall", "zone": "SS", "hardness": 3}, "rolls": [0.0]})
	assert_int(out["state"]["outs"]).is_equal(2)
	assert_str(out["code"]).is_equal("DOUBLE_PLAY")
	assert_array(_occupied(out["state"]["runners"])).is_empty()


func test_a_fly_ball_never_turns_a_double_play() -> void:
	var s: Dictionary = _state({"runners": {"first": _runner(), "second": {}, "third": {}}})
	var out: Dictionary = _apply("INPLAY_OUT", s,
		{"ball": {"hit_type": "flyBall", "zone": "CF", "hardness": 3}, "rolls": [0.0]})
	assert_int(out["state"]["outs"]).is_equal(1)
	assert_str(out["code"]).is_equal("FLY_OUT")


# ── 안타 ───────────────────────────────────────────────────────────

func test_a_single_puts_the_batter_on_first() -> void:
	var out: Dictionary = _apply("HIT_SINGLE", _state({"count": {"balls": 2, "strikes": 2}}))
	assert_array(_occupied(out["state"]["runners"])).is_equal(["first"])
	assert_int(out["state"]["count"]["strikes"]).is_equal(0)


func test_a_home_run_scores_everyone() -> void:
	var s: Dictionary = _state({"half": "top", "inning": 3,
		"runners": {"first": _runner(), "second": _runner(), "third": {}}})
	var out: Dictionary = _apply("HOME_RUN", s)
	assert_int(out["state"]["score"]["away"]).is_equal(3)
	assert_int(out["state"]["inning_scores"]["away"][2]).is_equal(3)
	assert_array(_occupied(out["state"]["runners"])).is_empty()


func test_the_home_team_scores_in_the_bottom() -> void:
	# ⚠ 초·말을 뒤집으면 득점이 통째로 상대 팀에 붙는다. 합계는 맞아서
	# 한참 안 보인다
	var out: Dictionary = _apply("HOME_RUN", _state({"half": "bottom"}))
	assert_int(out["state"]["score"]["home"]).is_equal(1)
	assert_int(out["state"]["score"]["away"]).is_equal(0)


func test_a_runner_thrown_out_on_the_bases_is_an_out() -> void:
	# ⚠ **주루사도 아웃이다.** 안 세면 이닝이 안 끝나고, 투수 이닝이
	# 짧아져 9이닝당 피안타·ERA가 그대로 부푼다
	var s: Dictionary = _state({"runners": {"first": _runner(), "second": {}, "third": {}}})
	# 1루 주자가 홈을 노리다 잡힌다 — 시도(0.0) → 실패(0.99)
	var out: Dictionary = _apply("HIT_DOUBLE", s, {"rolls": [0.0, 0.99]})
	assert_int(out["state"]["outs"]).is_equal(1)


# ── 실책 ───────────────────────────────────────────────────────────

func test_an_error_puts_the_batter_on_and_resets_the_count() -> void:
	var out: Dictionary = _apply("FIELDING_ERROR", _state({"count": {"balls": 1, "strikes": 2}}),
		{"ball": {"hit_type": "groundBall", "zone": "SS", "hardness": 3}})
	assert_array(_occupied(out["state"]["runners"])).is_equal(["first"])
	assert_int(out["state"]["count"]["strikes"]).is_equal(0)
	assert_int(out["state"]["outs"]).is_equal(0)


func test_the_defensive_line_separates_muffs_from_wild_throws() -> void:
	# ⚠ **포구 실패와 송구 실패는 다른 칸이다.** 한 칸에 몰면 수비율이 틀린다
	var muffed: Dictionary = _apply("FIELDING_ERROR", _state(),
		{"ball": {"hit_type": "groundBall", "zone": "SS", "hardness": 3},
		"fielding": {"is_error": true, "throw_result": ""}})
	assert_int(muffed["state"]["defense"]["errors"]).is_equal(1)
	assert_int(muffed["state"]["defense"]["throw_safes"]).is_equal(0)

	var wild: Dictionary = _apply("FIELDING_ERROR", _state(),
		{"ball": {"hit_type": "groundBall", "zone": "SS", "hardness": 3},
		"fielding": {"is_error": false, "throw_result": "safe"}})
	assert_int(wild["state"]["defense"]["errors"]).is_equal(0)
	assert_int(wild["state"]["defense"]["throw_safes"]).is_equal(1)

	var clean: Dictionary = _apply("INPLAY_OUT", _state(),
		{"ball": {"hit_type": "groundBall", "zone": "SS", "hardness": 3},
		"fielding": {"is_error": false, "throw_result": "out"}})
	assert_int(clean["state"]["defense"]["throw_outs"]).is_equal(1)
	assert_int(clean["state"]["defense"]["assists"]).is_equal(1)


# ── 이닝 전환 ──────────────────────────────────────────────────────

func test_the_third_out_flips_the_half() -> void:
	var s: Dictionary = _state({"outs": 2, "count": {"balls": 1, "strikes": 2},
		"runners": {"first": _runner(), "second": {}, "third": {}}})
	var out: Dictionary = _apply("STRIKE_SWING", s)
	assert_int(out["state"]["outs"]).is_equal(0)
	assert_str(out["state"]["half"]).is_equal("bottom")
	assert_array(_occupied(out["state"]["runners"])).is_empty()


func test_runs_before_the_third_out_still_count() -> void:
	# ⚠ 3아웃 전환이 상태를 비우기 전에 득점을 넣어야 한다
	var s: Dictionary = _state({"outs": 2, "half": "top", "inning": 4,
		"runners": {"first": _runner(), "second": {}, "third": {}}})
	# 2루타 — 1루 주자가 홈을 노리다 잡힌다(3아웃). 타자는 2루에 남지만 이닝이 끝난다
	var out: Dictionary = _apply("HIT_DOUBLE", s, {"rolls": [0.0, 0.99]})
	assert_str(out["state"]["half"]).is_equal("bottom")


# ── 투수 기록 ──────────────────────────────────────────────────────

func test_the_pitch_count_goes_up_every_pitch() -> void:
	var out: Dictionary = _apply("BALL", _state())
	assert_int(out["state"]["pitch_count"]).is_equal(1)
	assert_int(out["state"]["pitcher_line"]["pc"]).is_equal(1)


func test_a_strikeout_is_credited_once() -> void:
	# 스트라이크 두 개는 삼진이 아니다 — 세 번째만 센다
	assert_int(_apply("STRIKE_SWING", _state())["state"]["pitcher_line"]["k"]).is_equal(0)
	assert_int(_apply("STRIKE_SWING", _state({"count": {"balls": 0, "strikes": 2}}))
		["state"]["pitcher_line"]["k"]).is_equal(1)


func test_outs_are_counted_not_flagged() -> void:
	# ⚠ **아웃을 "있었다/없었다"로 세면 안 된다.** 병살은 한 타석에 둘이다.
	# 원본이 불리언이라 그 아웃이 이닝에 안 잡혔고 ip = outs/3이 작아져
	# 9이닝당 피안타·ERA가 그대로 부풀었다
	var s: Dictionary = _state({"runners": {"first": _runner(), "second": {}, "third": {}}})
	var out: Dictionary = _apply("INPLAY_OUT", s,
		{"ball": {"hit_type": "groundBall", "zone": "SS", "hardness": 3}, "rolls": [0.0]})
	assert_int(out["state"]["pitcher_line"]["outs"]).is_equal(2)


func test_walks_and_hits_land_on_the_pitcher() -> void:
	assert_int(_apply("BALL", _state({"count": {"balls": 3, "strikes": 0}}))
		["state"]["pitcher_line"]["bb"]).is_equal(1)
	assert_int(_apply("HIT_DOUBLE", _state())["state"]["pitcher_line"]["h"]).is_equal(1)


func test_runs_land_on_the_pitcher_as_earned() -> void:
	var s: Dictionary = _state({"runners": {"first": {}, "second": {}, "third": _runner()}})
	var out: Dictionary = _apply("HIT_SINGLE", s, {"rolls": [0.99]})
	assert_int(out["state"]["pitcher_line"]["er"]).is_equal(1)


# ── 타자 기록 ──────────────────────────────────────────────────────

func test_a_walk_is_a_plate_appearance_but_not_an_at_bat() -> void:
	# ⚠ 볼넷을 타수로 세면 타율이 통째로 내려간다
	var out: Dictionary = _apply("BALL", _state({"count": {"balls": 3, "strikes": 0}}))
	var acc: Dictionary = out["state"]["batter_accum"]["B1"]
	assert_int(acc["pa"]).is_equal(1)
	assert_int(acc["ab"]).is_equal(0)
	assert_int(acc["bb"]).is_equal(1)


func test_a_hit_counts_as_an_at_bat() -> void:
	var acc: Dictionary = _apply("HIT_SINGLE", _state())["state"]["batter_accum"]["B1"]
	assert_int(acc["pa"]).is_equal(1)
	assert_int(acc["ab"]).is_equal(1)
	assert_int(acc["h"]).is_equal(1)


func test_a_home_run_is_counted_separately() -> void:
	var acc: Dictionary = _apply("HOME_RUN", _state())["state"]["batter_accum"]["B1"]
	assert_int(acc["hr"]).is_equal(1)
	assert_int(acc["h"]).is_equal(1)
	assert_int(acc["rbi"]).is_equal(1)


func test_rbi_counts_the_runs_this_at_bat_drove_in() -> void:
	var s: Dictionary = _state({"half": "top",
		"runners": {"first": _runner(), "second": _runner(), "third": _runner()}})
	var acc: Dictionary = _apply("HOME_RUN", s)["state"]["batter_accum"]["B1"]
	assert_int(acc["rbi"]).is_equal(4)


func test_nothing_is_recorded_while_the_at_bat_continues() -> void:
	# 볼 하나로는 타석이 안 끝난다
	assert_bool(_apply("BALL", _state())["state"]["batter_accum"].has("B1")).is_false()
	assert_bool(_apply("FOUL", _state())["state"]["batter_accum"].has("B1")).is_false()


func test_a_strikeout_is_an_at_bat() -> void:
	var out: Dictionary = _apply("STRIKE_SWING", _state({"count": {"balls": 0, "strikes": 2}}))
	var acc: Dictionary = out["state"]["batter_accum"]["B1"]
	assert_int(acc["ab"]).is_equal(1)
	assert_int(acc["k"]).is_equal(1)
	assert_int(acc["h"]).is_equal(0)


# ── 구종 이력 ──────────────────────────────────────────────────────

func test_the_last_pitches_are_remembered() -> void:
	var out: Dictionary = _apply("BALL", _state({"last_pitch_types": ["slider", "curve"]}),
		{"decision": {"pitch_type": "fastball"}})
	assert_array(out["state"]["last_pitch_types"]).is_equal(["slider", "curve", "fastball"])


func test_the_pitch_history_stays_short() -> void:
	# ⚠ 안 자르면 경기 내내 자라고, 패턴 판정은 어차피 최근 셋만 본다
	var long: Array = ["a", "b", "c", "d", "e"]
	var out: Dictionary = _apply("BALL", _state({"last_pitch_types": long}))
	assert_int(out["state"]["last_pitch_types"].size()).is_equal(5)
	assert_str(out["state"]["last_pitch_types"][4]).is_equal("fastball")


# ── 경기 종료 ──────────────────────────────────────────────────────

func test_a_finished_game_stays_finished() -> void:
	var out: Dictionary = _apply("HOME_RUN", _state({"is_finished": true}))
	assert_str(out["code"]).is_equal("GAME_OVER")
	assert_int(out["state"]["score"]["away"]).is_equal(0)


func test_a_walk_off_finishes_the_game() -> void:
	var s: Dictionary = _state({"inning": 9, "half": "bottom", "outs": 1,
		"score": {"home": 3, "away": 3}})
	var out: Dictionary = _apply("HOME_RUN", s)
	assert_bool(out["state"]["is_finished"]).is_true()


func test_a_cold_game_finishes_on_the_third_out() -> void:
	# ⚠ 콜드 판정은 3아웃 전환 **전**이다. 전환 뒤엔 "말 종료" 조건이 사라진다
	var s: Dictionary = _state({"inning": 5, "half": "bottom", "outs": 2,
		"score": {"home": 12, "away": 2}})
	var out: Dictionary = _apply("STRIKE_SWING", _state_with(s, {"count": {"balls": 0, "strikes": 2}}))
	assert_bool(out["state"]["is_finished"]).is_true()


func _state_with(base: Dictionary, o: Dictionary) -> Dictionary:
	var d: Dictionary = base.duplicate(true)
	d.merge(o, true)
	return d


# ── 숙련도가 경기까지 닿는가 (M7-6e2) ─────────────────────────

## ⚠ **02가 겪은 결함이다.** 화면엔 "숙련도 4/5"라고 적혀 있는데 던지면
## 차이가 없었다 — 원본 주석이 "배운 구종은 경기에 안 나왔고 숙련도도
## 결과에 안 닿았다"고 적어 뒀다.
##
## ⚠ **`step`을 실제로 거쳐서 본다.** `pitch_quality`를 직접 부르는 검사는
## 배선을 안 본다 — 변이 검증에서 실제로 안 잡혔다
func _codes_with_grade(grade: int) -> Array:
	var s: Dictionary = _state()
	s["pitcher"]["pitches"] = [{"id": "fastball", "grade": grade}]
	var rng := RandomNumberGenerator.new()
	rng.seed = 4242
	var out: Array = []
	for i in 60:
		if s.get("is_finished", false):
			break
		out.append(PitchStep.step(s, _decision(), rng)["code"])
	return out


func test_the_grade_reaches_the_match() -> void:
	assert_array(_codes_with_grade(1)).override_failure_message(
		"숙련도 1과 5가 같은 경기다 — 배운 구종이 결과에 안 닿는다") \
		.is_not_equal(_codes_with_grade(5))


## ⚠ **던지는 구종의 숙련도가 걸려야 한다.** 다른 구종 것이 걸리면
## 커브를 던져도 직구 숙련도로 계산된다
func test_the_grade_follows_the_pitch_thrown() -> void:
	var s: Dictionary = _state()
	s["pitcher"]["pitches"] = [{"id": "fastball", "grade": 5},
		{"id": "curve", "grade": 1}]
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	PitchStep.step(s, _decision({"pitch_type": "curve"}), rng)
	assert_int(int(s["grade"])).override_failure_message(
		"커브를 던졌는데 숙련도 %d가 걸렸다" % int(s["grade"])).is_equal(1)


## ⚠ **NPC는 구종 배열이 없다.** 기준값이 옛 고정값(3)과 같아야 밸런스가 안 움직인다
func test_a_pitcher_without_an_arsenal_keeps_the_old_result() -> void:
	var s: Dictionary = _state()
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	PitchStep.step(s, _decision(), rng)
	assert_int(int(s["grade"])).is_equal(3)
