extends GdUnitTestSuite

## 직접 던지는 경기 — M7-6e1.
##
## ⚠ **자동 시뮬과 같은 경기여야 한다.** 화면에서 본 경기와 기록에 남는
## 경기가 다르면, 사용자가 이긴 경기가 순위표에서는 패가 된다.


func _game_state() -> Dictionary:
	return World.new_game({"seed": 4242, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})


func _first_game(s: Dictionary) -> Dictionary:
	var best: Dictionary = {}
	for g in s["schedule"]:
		if best.is_empty() or int(g["day"]) < int(best["day"]):
			best = g
	return best


func _rng(seed_value: int) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


# ── 여는가 ────────────────────────────────────────────────────

func test_it_opens_a_game() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	assert_bool(m["ok"]).override_failure_message(m.get("error", "")).is_true()
	assert_int(m["state"]["inning"]).is_equal(1)
	assert_bool(m["state"]["is_finished"]).is_false()


## ⚠ **팀 이름과 선수 이름이 실려야 한다.** 화면이 로스터를 뒤지면 안 된다
func test_it_carries_names_for_the_screen() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	assert_str(m["ctx"]["home_name"]).is_not_empty()
	assert_str(m["ctx"]["away_name"]).is_not_empty()
	assert_bool(m["ctx"]["names"].is_empty()).is_false()


func test_an_empty_roster_refuses_to_open() -> void:
	var m: Dictionary = LiveMatch.open({"world": {"rosters": {}}},
		{"home": "A", "away": "B", "day": 1})
	assert_bool(m["ok"]).is_false()
	assert_str(m["error"]).is_not_empty()


# ── 한 구씩 ───────────────────────────────────────────────────

func test_one_pitch_advances_the_count() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	var before: int = int(m["state"]["pitch_count"])
	LiveMatch.pitch(m["state"], m["ctx"], _rng(m["seed"]))
	assert_int(int(m["state"]["pitch_count"])).is_greater(before)


## ⚠ **무슨 일이 있었는지 기록에 남는다.** 화면이 그걸 보여준다
func test_each_pitch_adds_a_log_line() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	var rng := _rng(m["seed"])
	for i in 5:
		LiveMatch.pitch(m["state"], m["ctx"], rng)
	assert_int(m["ctx"]["log"].size()).is_equal(5)
	for line in m["ctx"]["log"]:
		assert_str(String(line)).is_not_empty()


## ⚠ **로그에 영문 코드가 뜨면 안 된다**
func test_the_log_is_in_korean() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	var rng := _rng(m["seed"])
	for i in 40:
		LiveMatch.pitch(m["state"], m["ctx"], rng)
	for line in m["ctx"]["log"]:
		assert_bool(String(line).contains("_")).override_failure_message(
			"로그에 영문 코드가 있다: %s" % line).is_false()


## ⚠ **끝난 경기에 던지면 기록이 계속 쌓인다**
func test_pitching_after_the_end_does_nothing() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	LiveMatch.finish(m["state"], m["ctx"], _rng(m["seed"]))
	var pc: int = int(m["state"]["pitch_count"])
	assert_str(LiveMatch.pitch(m["state"], m["ctx"], _rng(1))).is_equal("GAME_OVER")
	assert_int(int(m["state"]["pitch_count"])).is_equal(pc)


# ── 끝까지 ────────────────────────────────────────────────────

func test_finishing_ends_the_game() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	var n: int = LiveMatch.finish(m["state"], m["ctx"], _rng(m["seed"]))
	assert_bool(m["state"]["is_finished"]).is_true()
	assert_int(n).is_between(150, 400)


func test_the_finished_game_becomes_a_result() -> void:
	var s: Dictionary = _game_state()
	var g: Dictionary = _first_game(s)
	var m: Dictionary = LiveMatch.open(s, g)
	LiveMatch.finish(m["state"], m["ctx"], _rng(m["seed"]))

	var r: Dictionary = LiveMatch.to_result(m["state"], g["home"], g["away"])
	assert_bool(r.has("home_score")).is_true()
	assert_bool(r["player_lines"].is_empty()).override_failure_message(
		"선수 줄이 없다 — 리그 성적표가 빈다").is_false()


# ── 자동 시뮬과 같은가 (계약) ─────────────────────────────────

## ⚠ **이게 이 모듈의 제일 중요한 검사다.** 화면에서 본 경기와 기록에 남는
## 경기가 다르면, 사용자가 이긴 경기가 순위표에서는 패가 된다.
##
## 같은 씨앗으로 열어 끝까지 돌리면 `MatchDay.play`와 같은 점수여야 한다
func test_pitching_by_hand_matches_the_auto_sim() -> void:
	var s: Dictionary = _game_state()
	var g: Dictionary = _first_game(s)

	var m: Dictionary = LiveMatch.open(s, g)
	LiveMatch.finish(m["state"], m["ctx"], _rng(m["seed"]))
	var by_hand: Dictionary = LiveMatch.to_result(m["state"], g["home"], g["away"])

	var counts: Dictionary = MatchDay.team_game_counts(s, int(g["day"]))
	var auto: Dictionary = MatchDay.play(s["world"], g["home"], g["away"],
		_rng(m["seed"]), {
			"league_id": g.get("league_id", ""),
			"home_game_no": int(counts.get(g["home"], 0)),
			"away_game_no": int(counts.get(g["away"], 0)),
		})["result"]

	assert_int(by_hand["home_score"]).override_failure_message(
		"손으로 %d:%d, 자동으로 %d:%d — 같은 경기가 아니다" % [
			by_hand["home_score"], by_hand["away_score"],
			auto["home_score"], auto["away_score"]]) \
		.is_equal(auto["home_score"])
	assert_int(by_hand["away_score"]).is_equal(auto["away_score"])


## 같은 씨앗이면 두 번 열어도 같은 경기다
func test_the_same_seed_gives_the_same_game() -> void:
	var s: Dictionary = _game_state()
	var g: Dictionary = _first_game(s)

	var a: Dictionary = LiveMatch.open(s, g)
	LiveMatch.finish(a["state"], a["ctx"], _rng(a["seed"]))
	var b: Dictionary = LiveMatch.open(s, g)
	LiveMatch.finish(b["state"], b["ctx"], _rng(b["seed"]))

	assert_int(a["state"]["score"]["home"]).is_equal(b["state"]["score"]["home"])
	assert_int(a["state"]["score"]["away"]).is_equal(b["state"]["score"]["away"])


# ── 화면으로 이어지는가 ───────────────────────────────────────

func test_the_state_feeds_the_view_model() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	var vm: Dictionary = MatchVm.build(m["state"], m["ctx"])
	assert_str(vm["inning_label"]).is_equal("1회초")
	assert_str(vm["home_name"]).is_not_empty()
	assert_str(vm["batter_name"]).is_not_empty()
	assert_bool(vm["can_pitch"]).is_true()


func test_a_finished_game_shows_its_result() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	LiveMatch.finish(m["state"], m["ctx"], _rng(m["seed"]))
	var vm: Dictionary = MatchVm.build(m["state"], m["ctx"])
	assert_bool(vm["can_pitch"]).is_false()
	assert_str(vm["result_label"]).is_not_empty()


## ⚠ **내 팀이 어느 쪽인지 실려야 한다.** 안 실으면 화면이 상대 투수의
## 성적을 내 것으로 보여준다
func test_it_knows_which_side_i_am_on() -> void:
	var s: Dictionary = _game_state()
	var my_team: String = s["protagonist"]["team_id"]
	for g in s["schedule"]:
		if g["home"] != my_team and g["away"] != my_team:
			continue
		var m: Dictionary = LiveMatch.open(s, g)
		var want: String = "home" if g["home"] == my_team else "away"
		assert_str(m["ctx"]["my_side"]).override_failure_message(
			"%s인데 %s로 잡혔다" % [want, m["ctx"]["my_side"]]).is_equal(want)
		return
	fail("내 팀 경기가 없다")


## ⚠ **던진 공이 성적에 쌓여야 한다.** 화면에서 24구를 던졌는데 0.0이닝
## 0K로 뜬 적이 있다
func test_pitching_fills_the_line_the_screen_shows() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	var rng := _rng(m["seed"])
	for i in 40:
		LiveMatch.pitch(m["state"], m["ctx"], rng)

	var vm: Dictionary = MatchVm.build(m["state"], m["ctx"])
	assert_int(vm["pitcher_pc"]).override_failure_message(
		"40구를 던졌는데 투구 수가 %d다" % vm["pitcher_pc"]).is_greater(0)
	assert_str(vm["pitcher_line_label"]).is_not_equal("0.0이닝 0K 0BB 0H 0자책")
