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

## ⚠ **투구 수를 좁게 못 박지 않는다.** 실측 138~214구인데 [150,400]으로
## 걸어 뒀더니 **세계 생성이 바뀔 때마다 이 검사가 깨졌다** — 검사가 보려는
## 건 "끝까지 갔나"이지 특정 경기의 투구 수가 아니다.
##
## 대신 **끝났다는 것의 뜻**을 본다: 9회를 채웠고, 안전장치에 안 걸렸다
func test_finishing_ends_the_game() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	var n: int = LiveMatch.finish(m["state"], m["ctx"], _rng(m["seed"]))

	assert_bool(m["state"]["is_finished"]).is_true()
	# 콜드게임이 5회부터 있으므로 하한은 거기다 — 9회를 못 박으면
	# 정상적인 콜드게임에서 검사가 깨진다
	assert_int(int(m["state"]["inning"])).override_failure_message(
		"%s회에서 끝났다" % m["state"]["inning"]).is_greater_equal(5)
	# ⚠ **안전장치로 끝나면 안 된다.** `MAX_PITCHES`에 닿아 멈춘 것을
	# "끝났다"로 읽으면 무한 루프를 통과시킨다
	assert_int(n).override_failure_message(
		"안전장치(%d구)까지 갔다" % GameLoop.MAX_PITCHES).is_less(GameLoop.MAX_PITCHES)
	assert_int(n).is_greater(100)


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
	# ⚠ **등판 예약도 같이 넘겨야 같은 경기다.** 안 넘기면 불펜 순서가
	# 달라져 다른 경기가 된다 — 실제 호출부(·)는 넘긴다
	var my_team: String = s["protagonist"]["team_id"]
	var relief: String = ""
	if g.get("is_protagonist_game", false):
		relief = String(s["protagonist"]["id"])
	var auto: Dictionary = MatchDay.play(s["world"], g["home"], g["away"],
		_rng(m["seed"]), {
			"league_id": g.get("league_id", ""),
			"home_game_no": int(counts.get(g["home"], 0)),
			"away_game_no": int(counts.get(g["away"], 0)),
			"home_relief": relief if g["home"] == my_team else "",
			"away_relief": relief if g["away"] == my_team else "",
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


# ── 고른 공으로 던지기 (M7-6e2) ───────────────────────────────

## ⚠ **고른 게 실제로 나가야 한다.** 화면에서 커브를 골랐는데 엔진이
## 직구를 던지면, 사용자는 자기가 뭘 하는지 영영 모른다
func test_a_chosen_pitch_is_what_gets_thrown() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	LiveMatch.pitch(m["state"], m["ctx"], _rng(m["seed"]),
		{"pitch_type": "curve", "location": 5, "strategy": "safe", "power": "low"})
	assert_str(String(m["ctx"]["log"][0])).override_failure_message(
		"커브를 골랐는데 로그가 '%s'다" % m["ctx"]["log"][0]).contains("커브")


## ⚠ **고른 공은 자동과 달라야 한다.** 넘기는 시늉만 하고 엔진이 안 읽으면
## 무엇을 골라도 같은 경기가 나온다 — 조용히 그렇게 된다
func test_choosing_changes_the_game() -> void:
	var s: Dictionary = _game_state()
	var g: Dictionary = _first_game(s)

	var codes: Array = []
	for pt in ["fastball", "curve"]:
		var m: Dictionary = LiveMatch.open(s, g)
		var rng := _rng(m["seed"])
		var seq: Array = []
		for i in 30:
			seq.append(LiveMatch.pitch(m["state"], m["ctx"], rng,
				{"pitch_type": pt, "location": 5, "strategy": "balanced",
				"power": "normal"}))
		codes.append(seq)
	assert_array(codes[0]).override_failure_message(
		"직구 30구와 커브 30구가 같은 결과다 — 고른 게 엔진에 안 닿는다") \
		.is_not_equal(codes[1])


## ⚠ **아무것도 안 고르면 자동이다.** 그래야 `자동 시뮬과 같은 경기` 계약이
## 계속 선다 — 위쪽 검사가 그걸 본다
func test_an_empty_decision_falls_back_to_auto() -> void:
	var s: Dictionary = _game_state()
	var g: Dictionary = _first_game(s)

	var a: Dictionary = LiveMatch.open(s, g)
	var ra := _rng(a["seed"])
	var b: Dictionary = LiveMatch.open(s, g)
	var rb := _rng(b["seed"])
	for i in 20:
		assert_str(LiveMatch.pitch(a["state"], a["ctx"], ra)) \
			.is_equal(LiveMatch.pitch(b["state"], b["ctx"], rb, {}))


## ⚠ **상대가 던질 땐 고를 게 없다.** 그때 선택 화면이 뜨면 내가 던지는 줄 안다
func test_it_knows_when_i_am_on_the_mound() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	assert_str(String(m["ctx"]["my_id"])).is_not_empty()

	# 마운드에 내가 있다고 해두면 고를 수 있어야 한다
	m["state"]["pitcher"] = {"id": m["ctx"]["my_id"]}
	assert_bool(MatchVm.build(m["state"], m["ctx"])["is_my_pitch"]).is_true()

	m["state"]["pitcher"] = {"id": "NOT_ME"}
	assert_bool(MatchVm.build(m["state"], m["ctx"])["is_my_pitch"]).is_false()


## 주인공 구종이 선택지로 실린다 — 화면이 로스터를 뒤지면 안 된다
func test_my_repertoire_reaches_the_screen() -> void:
	var s: Dictionary = _game_state()
	var m: Dictionary = LiveMatch.open(s, _first_game(s))
	var vm: Dictionary = MatchVm.build(m["state"], m["ctx"])
	assert_bool(vm["pitch"]["pitches"].is_empty()).override_failure_message(
		"고를 구종이 하나도 없다").is_false()


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
