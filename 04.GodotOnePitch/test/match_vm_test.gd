extends GdUnitTestSuite

## 경기 화면 ViewModel — M7-6e1.
##
## 원본: `pages/match/MatchPage.svelte` (3,220줄)
##
## ⚠ **3,220줄을 한 번에 안 옮긴다.** 셋으로 나눈다 —
## ① 뼈대(스코어보드·카운트·주자·투구) ② 스트라이크존·구종 ③ 구장 그림.
## 여기는 ①이다.
##
## ⚠ **화면이 경기 상태를 다시 읽지 않는다.** 02는 화면이 이닝·아웃·주자를
## 직접 계산했고, 그게 3,220줄이 된 이유다.


func _state(over: Dictionary = {}) -> Dictionary:
	var zeros: Array = [0, 0, 0, 0, 0, 0, 0, 0, 0]
	var s: Dictionary = {
		"inning": 1, "half": "top", "outs": 0,
		"count": {"balls": 0, "strikes": 0},
		"runners": {"first": {}, "second": {}, "third": {}},
		"score": {"home": 0, "away": 0},
		"inning_scores": {"home": zeros.duplicate(), "away": zeros.duplicate()},
		"inning_limit": 9, "is_finished": false, "pitch_count": 0,
		"batter": {"id": "B1"}, "pitcher": {"id": "P1"},
		"pitcher_line": {"outs": 0, "pc": 0, "k": 0, "bb": 0, "h": 0, "er": 0},
	}
	s.merge(over, true)
	return s


func _vm(over: Dictionary = {}, ctx: Dictionary = {}) -> Dictionary:
	return MatchVm.build(_state(over), ctx)


# ── 스코어보드 ────────────────────────────────────────────────

func test_it_shows_the_score() -> void:
	var vm: Dictionary = _vm({"score": {"home": 3, "away": 5}})
	assert_int(vm["home_score"]).is_equal(3)
	assert_int(vm["away_score"]).is_equal(5)


func test_it_shows_the_team_names() -> void:
	var vm: Dictionary = _vm({}, {"home_name": "제주", "away_name": "서울"})
	assert_str(vm["home_name"]).is_equal("제주")
	assert_str(vm["away_name"]).is_equal("서울")


## ⚠ **초·말을 글자로 준다.** 화면이 `top`을 그대로 찍으면 안 된다
func test_the_inning_reads_in_korean() -> void:
	assert_str(_vm({"inning": 1, "half": "top"})["inning_label"]).is_equal("1회초")
	assert_str(_vm({"inning": 9, "half": "bottom"})["inning_label"]).is_equal("9회말")


## ⚠ **연장은 이닝 상한을 넘는다.** 상한으로 자르면 10회가 9회로 뜬다
func test_extra_innings_show_their_real_number() -> void:
	assert_str(_vm({"inning": 11, "half": "top"})["inning_label"]).is_equal("11회초")


func test_the_count_is_balls_then_strikes() -> void:
	var vm: Dictionary = _vm({"count": {"balls": 3, "strikes": 2}})
	assert_int(vm["balls"]).is_equal(3)
	assert_int(vm["strikes"]).is_equal(2)
	assert_str(vm["count_label"]).is_equal("3-2")


func test_outs_are_shown() -> void:
	assert_int(_vm({"outs": 2})["outs"]).is_equal(2)


# ── 주자 ──────────────────────────────────────────────────────

## ⚠ **빈 사전이 주자 없음이다.** 02는 `null`과 빈 사전을 섞어 써서
## 한쪽만 보면 주자가 사라졌다
func test_empty_bases_have_no_runners() -> void:
	var vm: Dictionary = _vm()
	assert_bool(vm["on_first"]).is_false()
	assert_bool(vm["on_second"]).is_false()
	assert_bool(vm["on_third"]).is_false()


func test_runners_are_reported() -> void:
	var vm: Dictionary = _vm({"runners": {
		"first": {"id": "R1"}, "second": {}, "third": {"id": "R3"}}})
	assert_bool(vm["on_first"]).is_true()
	assert_bool(vm["on_second"]).is_false()
	assert_bool(vm["on_third"]).is_true()


## 만루면 화면이 그렇게 말해야 한다
func test_the_bases_are_summarised() -> void:
	assert_str(_vm()["bases_label"]).is_equal("주자 없음")
	assert_str(_vm({"runners": {"first": {"id": "R"}, "second": {}, "third": {}}})
		["bases_label"]).is_equal("1루")
	assert_str(_vm({"runners": {"first": {"id": "R"}, "second": {"id": "R"},
		"third": {"id": "R"}}})["bases_label"]).is_equal("만루")
	assert_str(_vm({"runners": {"first": {}, "second": {"id": "R"},
		"third": {"id": "R"}}})["bases_label"]).is_equal("2·3루")


# ── 지금 누가 ─────────────────────────────────────────────────

## ⚠ **이름을 화면이 찾지 않는다.** 선수 id만 주면 화면이 로스터를 뒤져야
## 하고, 그게 02에서 화면이 계산을 갖게 된 경로다
func test_the_batter_and_pitcher_are_named() -> void:
	var vm: Dictionary = _vm({"batter": {"id": "B1"}, "pitcher": {"id": "P1"}},
		{"names": {"B1": "김타자", "P1": "이투수"}})
	assert_str(vm["batter_name"]).is_equal("김타자")
	assert_str(vm["pitcher_name"]).is_equal("이투수")


func test_an_unknown_player_falls_back_to_its_id() -> void:
	var vm: Dictionary = _vm({"batter": {"id": "B9"}}, {"names": {}})
	assert_str(vm["batter_name"]).is_equal("B9")


## 투수 성적이 실린다 — 등판 중에 자기 기록을 보는 게 이 게임의 핵심이다
func test_the_pitcher_line_is_shown() -> void:
	var vm: Dictionary = _vm({"pitcher_line": {
		"outs": 11, "pc": 62, "k": 5, "bb": 2, "h": 4, "er": 1}})
	# 11아웃 = 3과 2/3이닝, 표기는 3.2
	assert_str(vm["pitcher_ip"]).is_equal("3.2")
	assert_int(vm["pitcher_k"]).is_equal(5)
	assert_int(vm["pitcher_pc"]).is_equal(62)
	assert_str(vm["pitcher_line_label"]).is_equal("3.2이닝 5K 2BB 4H 1자책")


## ⚠ **이닝은 소수가 아니라 아웃 수다.** 20아웃은 6.67이 아니라 6.2다
func test_innings_use_baseball_notation() -> void:
	assert_str(MatchVm.innings_label(0)).is_equal("0.0")
	assert_str(MatchVm.innings_label(1)).is_equal("0.1")
	assert_str(MatchVm.innings_label(3)).is_equal("1.0")
	assert_str(MatchVm.innings_label(20)).is_equal("6.2")


# ── 진행 ──────────────────────────────────────────────────────

func test_a_running_game_can_pitch() -> void:
	assert_bool(_vm()["can_pitch"]).is_true()


## ⚠ **끝난 경기에 던지면 안 된다.** 던지면 기록이 계속 쌓인다
func test_a_finished_game_cannot_pitch() -> void:
	var vm: Dictionary = _vm({"is_finished": true})
	assert_bool(vm["can_pitch"]).is_false()
	assert_bool(vm["is_finished"]).is_true()


func test_a_finished_game_says_who_won() -> void:
	var vm: Dictionary = _vm({"is_finished": true, "score": {"home": 5, "away": 2}},
		{"home_name": "제주", "away_name": "서울"})
	assert_str(vm["result_label"]).is_equal("제주 5 : 2 서울")


func test_a_running_game_has_no_result_label() -> void:
	assert_str(_vm()["result_label"]).is_empty()


# ── 최근 투구 ─────────────────────────────────────────────────

## ⚠ **무슨 일이 일어났는지 글자로 보여야 한다.** 코드를 그대로 찍으면
## `HIT_DOUBLE`이 화면에 뜬다
func test_the_last_pitch_reads_in_korean() -> void:
	assert_str(MatchVm.code_label("STRIKE_SWING")).is_equal("헛스윙")
	assert_str(MatchVm.code_label("STRIKE_LOOK")).is_equal("루킹")
	assert_str(MatchVm.code_label("BALL")).is_equal("볼")
	assert_str(MatchVm.code_label("WALK")).is_equal("볼넷")
	assert_str(MatchVm.code_label("HIT_SINGLE")).is_equal("안타")
	assert_str(MatchVm.code_label("HIT_DOUBLE")).is_equal("2루타")
	assert_str(MatchVm.code_label("HOME_RUN")).is_equal("홈런")


## ⚠ **엔진이 내는 코드에 이름표가 다 있어야 한다.** 하나라도 빠지면
## 그 순간 화면에 영문 코드가 뜬다
func test_every_engine_code_has_a_label() -> void:
	for code in MatchResult.HITS:
		assert_str(MatchVm.code_label(code)).override_failure_message(
			"%s에 이름표가 없다" % code).is_not_equal(code)
	for code in MatchResult.STRIKES:
		assert_str(MatchVm.code_label(code)).is_not_equal(code)
	for code in MatchResult.OUT_IN_PLAY:
		assert_str(MatchVm.code_label(code)).override_failure_message(
			"%s에 이름표가 없다" % code).is_not_equal(code)
	# 엔진이 실제로 내는 나머지 코드들
	for code in ["BALL", "FOUL", "WALK", "FIELDING_ERROR", "GAME_OVER"]:
		assert_str(MatchVm.code_label(code)).override_failure_message(
			"%s에 이름표가 없다" % code).is_not_equal(code)


## 모르는 코드도 빈칸이 아니다 — 새 코드가 붙은 걸 알아야 한다
func test_an_unknown_code_shows_itself() -> void:
	assert_str(MatchVm.code_label("WEIRD_NEW_CODE")).is_equal("WEIRD_NEW_CODE")


func test_the_log_comes_along() -> void:
	var vm: Dictionary = _vm({}, {"log": ["1구 헛스윙", "2구 볼"]})
	assert_array(vm["log"]).is_equal(["1구 헛스윙", "2구 볼"])


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_state_does_not_break() -> void:
	var vm: Dictionary = MatchVm.build({}, {})
	assert_bool(vm.has("inning_label")).is_true()
	assert_bool(vm.has("can_pitch")).is_true()


func test_the_view_model_does_not_know_the_screen() -> void:
	# ⚠ **`not_contains`로는 못 본다** (D-8) — 대소문자를 무시하고 주석까지
	# 코드로 본다. 02 심볼을 근거로 인용하면 그것만으로 걸린다
	for node in ["Control", "Label"]:
		assert_bool(CodeText.lacks("res://ui/match_vm.gd", node)) \
			.override_failure_message("ViewModel이 화면 노드를 안다: %s" % node) \
			.is_true()


## ⚠ **투수 줄이 팀별로 나뉘어 있다.** `pitcher_line` 하나를 읽으면
## 24구를 던져도 0으로 뜬다 — 실제로 화면에서 그렇게 나왔다
func test_the_pitcher_line_follows_my_side() -> void:
	var s: Dictionary = _state({
		"home_pitcher_line": {"outs": 9, "pc": 40, "k": 4, "bb": 1, "h": 2, "er": 0},
		"away_pitcher_line": {"outs": 3, "pc": 15, "k": 1, "bb": 0, "h": 1, "er": 2},
	})
	assert_str(MatchVm.build(s, {"my_side": "home"})["pitcher_line_label"]) \
		.is_equal("3.0이닝 4K 1BB 2H 0자책")
	assert_str(MatchVm.build(s, {"my_side": "away"})["pitcher_line_label"]) \
		.is_equal("1.0이닝 1K 0BB 1H 2자책")


## 나뉜 줄이 없으면 예전 하나짜리로 떨어진다 — 조각 검사가 그대로 돈다
func test_it_falls_back_to_the_single_line() -> void:
	var s: Dictionary = _state({"pitcher_line": {
		"outs": 6, "pc": 30, "k": 3, "bb": 0, "h": 1, "er": 0}})
	assert_str(MatchVm.build(s, {})["pitcher_ip"]).is_equal("2.0")
