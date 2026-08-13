extends GdUnitTestSuite

## 경기 상태 — 이닝 전환 · 득점 기록 · 종료 판정. M2-5a.
##
## 원본: `packages/engine-native/src/match_engine.rs`
##       (3아웃 전환 · `add_runs` · `is_cold_game` · `should_auto_finish` · `finish_log`)
##
## ⚠ **콜드게임은 3아웃 전환 *전에* 판정해야 한다.** 전환이 이닝을 올리고
## 반을 바꾸므로, 뒤에서 보면 "말 종료"라는 조건이 이미 사라져 있다.


func _state(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"inning": 1, "half": "top", "outs": 0,
		"count": {"balls": 0, "strikes": 0},
		"runners": {"first": {}, "second": {}, "third": {}},
		"score": {"home": 0, "away": 0},
		"inning_scores": {"home": [0, 0, 0, 0, 0, 0, 0, 0, 0], "away": [0, 0, 0, 0, 0, 0, 0, 0, 0]},
		"inning_limit": 9, "is_finished": false,
	}
	d.merge(o, true)
	return d


func _runner() -> Dictionary:
	return {"speed": 70.0, "instinct": 70.0}


# ── 반이닝 전환 ────────────────────────────────────────────────────

func test_three_outs_flip_the_half() -> void:
	var s: Dictionary = MatchState.flip_half(_state({"outs": 3, "half": "top",
		"runners": {"first": _runner(), "second": _runner(), "third": {}},
		"count": {"balls": 2, "strikes": 2}}))
	assert_str(s["half"]).is_equal("bottom")
	assert_int(s["inning"]).is_equal(1)
	assert_int(s["outs"]).is_equal(0)
	# 주자와 카운트가 남으면 다음 이닝이 이어받는다
	assert_bool(s["runners"]["first"].is_empty()).is_true()
	assert_int(s["count"]["balls"]).is_equal(0)


func test_the_bottom_half_ends_the_inning() -> void:
	var s: Dictionary = MatchState.flip_half(_state({"outs": 3, "half": "bottom", "inning": 4}))
	assert_str(s["half"]).is_equal("top")
	assert_int(s["inning"]).is_equal(5)


func test_flipping_does_not_mutate_the_input() -> void:
	var s: Dictionary = _state({"outs": 3})
	MatchState.flip_half(s)
	assert_int(s["outs"]).is_equal(3)


# ── 득점 기록 ──────────────────────────────────────────────────────

func test_the_visiting_team_bats_in_the_top() -> void:
	var s: Dictionary = MatchState.add_runs(_state({"half": "top", "inning": 3}), 2)
	assert_int(s["score"]["away"]).is_equal(2)
	assert_int(s["score"]["home"]).is_equal(0)
	# 3회 칸에 들어간다
	assert_int(s["inning_scores"]["away"][2]).is_equal(2)


func test_the_home_team_bats_in_the_bottom() -> void:
	var s: Dictionary = MatchState.add_runs(_state({"half": "bottom", "inning": 1}), 3)
	assert_int(s["score"]["home"]).is_equal(3)
	assert_int(s["inning_scores"]["home"][0]).is_equal(3)


func test_zero_or_negative_runs_change_nothing() -> void:
	# ⚠ 음수까지 막아야 한다. 득점 계산이 어긋나 −1이 들어오면 **점수가
	# 줄어들고** 그 경기 결과가 통째로 뒤집힌다
	for n in [0, -3]:
		var s: Dictionary = MatchState.add_runs(_state({"half": "bottom"}), n)
		assert_int(s["score"]["home"]).is_equal(0)
		assert_int(s["score"]["away"]).is_equal(0)
		assert_int(s["inning_scores"]["home"][0]).is_equal(0)


func test_extra_innings_fall_into_the_last_column() -> void:
	# ⚠ 연장은 이닝 칸보다 회차가 크다. 그대로 색인하면 범위를 벗어나 죽는다
	var s: Dictionary = MatchState.add_runs(_state({"half": "top", "inning": 12}), 1)
	assert_int(s["score"]["away"]).is_equal(1)
	assert_int(s["inning_scores"]["away"][8]).is_equal(1)


func test_runs_accumulate_in_the_same_inning() -> void:
	var s: Dictionary = MatchState.add_runs(_state({"half": "bottom", "inning": 2}), 1)
	s = MatchState.add_runs(s, 2)
	assert_int(s["inning_scores"]["home"][1]).is_equal(3)


# ── 콜드게임 ───────────────────────────────────────────────────────

func test_ten_run_rule_after_five() -> void:
	assert_bool(MatchState.is_cold_game(_state({"inning": 5, "half": "bottom", "outs": 3,
		"score": {"home": 12, "away": 2}}))).is_true()
	# 4회면 아직 아니다
	assert_bool(MatchState.is_cold_game(_state({"inning": 4, "half": "bottom", "outs": 3,
		"score": {"home": 12, "away": 2}}))).is_false()


func test_seven_run_rule_after_seven() -> void:
	assert_bool(MatchState.is_cold_game(_state({"inning": 7, "half": "bottom", "outs": 3,
		"score": {"home": 0, "away": 7}}))).is_true()
	# 5회에 7점차는 아직 아니다 — 그때는 10점이 필요하다
	assert_bool(MatchState.is_cold_game(_state({"inning": 5, "half": "bottom", "outs": 3,
		"score": {"home": 0, "away": 7}}))).is_false()


func test_a_cold_game_is_only_called_at_the_end_of_a_full_inning() -> void:
	# ⚠ 초가 끝난 시점엔 홈팀이 아직 안 쳤다. 여기서 끝내면 뒤집을 기회를
	# 뺏는다 — 실제 야구 규칙이 그렇다
	assert_bool(MatchState.is_cold_game(_state({"inning": 7, "half": "top", "outs": 3,
		"score": {"home": 0, "away": 12}}))).is_false()
	# 아웃이 덜 찼으면 아직 이닝 중이다
	assert_bool(MatchState.is_cold_game(_state({"inning": 7, "half": "bottom", "outs": 2,
		"score": {"home": 12, "away": 0}}))).is_false()


func test_the_cold_game_rule_works_both_ways() -> void:
	# 원정팀이 크게 이겨도 콜드다
	assert_bool(MatchState.is_cold_game(_state({"inning": 5, "half": "bottom", "outs": 3,
		"score": {"home": 1, "away": 15}}))).is_true()


# ── 경기 종료 ──────────────────────────────────────────────────────

func test_a_walk_off_ends_the_game() -> void:
	# 말에 홈팀이 앞서면 더 칠 이유가 없다
	assert_bool(MatchState.should_finish(_state({"inning": 9, "half": "bottom",
		"score": {"home": 4, "away": 3}}))).is_true()
	assert_str(MatchState.finish_log(_state({"inning": 9, "half": "bottom",
		"score": {"home": 4, "away": 3}}))).is_equal("끝내기!")


func test_the_home_team_does_not_bat_when_already_ahead() -> void:
	# 9회 말 시작 시점에 홈이 앞서 있으면 그대로 끝이다
	assert_bool(MatchState.should_finish(_state({"inning": 9, "half": "bottom", "outs": 0,
		"score": {"home": 7, "away": 2}}))).is_true()


func test_a_tie_goes_to_extras() -> void:
	# ⚠ 동점이면 안 끝난다. 여기서 끝내면 무승부가 아니라 **경기가 사라진다**
	assert_bool(MatchState.should_finish(_state({"inning": 10, "half": "top",
		"score": {"home": 3, "away": 3}}))).is_false()
	assert_bool(MatchState.should_finish(_state({"inning": 9, "half": "bottom",
		"score": {"home": 3, "away": 3}}))).is_false()


func test_extras_end_once_someone_leads() -> void:
	assert_bool(MatchState.should_finish(_state({"inning": 10, "half": "top",
		"score": {"home": 3, "away": 5}}))).is_true()
	assert_str(MatchState.finish_log(_state({"inning": 10, "half": "top",
		"score": {"home": 3, "away": 5}}))).is_equal("규정 이닝 종료")


func test_the_visiting_lead_still_needs_the_bottom_half() -> void:
	# ⚠ 9회 말에 원정이 앞서 있으면 **아직 안 끝났다.** 홈팀이 남았다.
	# 여기서 끝내면 9회말 역전이 통째로 사라진다
	assert_bool(MatchState.should_finish(_state({"inning": 9, "half": "bottom",
		"score": {"home": 2, "away": 5}}))).is_false()


func test_a_cold_game_finishes_the_game() -> void:
	var s: Dictionary = _state({"inning": 5, "half": "bottom", "outs": 3,
		"score": {"home": 12, "away": 2}})
	assert_bool(MatchState.should_finish(s)).is_true()
	assert_str(MatchState.finish_log(s)).contains("콜드게임")
	assert_str(MatchState.finish_log(s)).contains("10점차")


func test_a_game_in_progress_keeps_going() -> void:
	assert_bool(MatchState.should_finish(_state({"inning": 5, "half": "top",
		"score": {"home": 2, "away": 1}}))).is_false()
