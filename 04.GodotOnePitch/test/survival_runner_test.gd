extends GdUnitTestSuite

## 독립 생존리그 배선 — 단계를 열고, 자르고, 사다리를 세운다. B-4c.


const IND: String = "LEAGUE_INDEPENDENT"


func _rosters() -> Dictionary:
	var out: Dictionary = {}
	for t in World.teams_of(IND):
		out[String(t["id"])] = []
	return out


func _teams() -> Array:
	var out: Array = []
	for t in World.teams_of(IND):
		out.append(String(t["id"]))
	out.sort()
	return out


func _state(day: int, over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {"day": day, "season_year": 2027, "seed": 4242,
		"season_days": Calendar.DAYS_PER_SEASON, "schedule": [],
		"protagonist": {"id": "PLY_ME", "team_id": _teams()[0]},
		"world": {"rosters": _rosters()}, "pending": [], "mailbox": []}
	s.merge(over, true)
	return s


## 그 단계 미결 경기를 끝낸다. `winners` 앞쪽 팀일수록 세게
func _play(state: Dictionary, stage: int, order: Array) -> int:
	var rank: Dictionary = {}
	for i in order.size():
		rank[String(order[i])] = i
	var prefix: String = Survival.match_prefix(stage)
	var n: int = 0
	for g in state["schedule"]:
		if not String(g["id"]).begins_with(prefix):
			continue
		if g.get("result", null) != null:
			continue
		var home_wins: bool = int(rank.get(String(g["home"]), 99)) \
			< int(rank.get(String(g["away"]), 99))
		g["result"] = {"home_score": 5 if home_wins else 1,
			"away_score": 1 if home_wins else 5,
			"winner_id": String(g["home"]) if home_wins else String(g["away"]),
			"loser_id": String(g["away"]) if home_wins else String(g["home"]),
			"player_lines": []}
		n += 1
	return n


func _stage_games(state: Dictionary, stage: int) -> int:
	var n: int = 0
	for g in state["schedule"]:
		if String(g["id"]).begins_with(Survival.match_prefix(stage)):
			n += 1
	return n


# ── 열기 ──────────────────────────────────────────────────────

## 10주 전에는 독립 경기가 없다 — 정규시즌이 아니라 생존리그다
func test_nothing_before_the_first_stage() -> void:
	var s: Dictionary = _state(9 * 7)
	SurvivalRunner.run(s, 9 * 7)
	assert_array(s["schedule"]).override_failure_message(
		"1차가 시작하기 전에 경기가 잡혔다").is_empty()


func test_the_first_stage_opens_in_week_ten() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	var out: Dictionary = SurvivalRunner.run(s, 10 * 7 - 6)
	assert_int(int(out["opened"])).is_equal(90)
	assert_int(_stage_games(s, 1)).override_failure_message(
		"1차 경기가 %d개다 (10팀 × 18경기 ÷ 2 = 90이어야 한다)"
		% _stage_games(s, 1)).is_equal(90)
	assert_int(int(SurvivalRunner.of(s)["stage"])).is_equal(1)
	assert_int(SurvivalRunner.of(s)["active_teams"].size()).is_equal(10)


## 두 번 불러도 두 번 안 연다
func test_opening_twice_changes_nothing() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	var before: int = s["schedule"].size()
	assert_int(int(SurvivalRunner.run(s, 10 * 7 - 6)["opened"])) \
		.override_failure_message("같은 단계를 두 번 열었다").is_equal(0)
	assert_int(s["schedule"].size()).override_failure_message(
		"같은 경기가 또 꽂혔다").is_equal(before)


## ⚠ **지난 단계로 되돌아가지 않는다.** 되돌아가면 잘린 팀이 빠진 채로
## 1차 일정이 다시 짜인다
func test_a_stage_never_goes_backwards() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	_play(s, 1, _teams())
	SurvivalRunner.run(s, 18 * 7 - 6)
	assert_int(int(SurvivalRunner.of(s)["stage"])).is_equal(2)
	var before: int = s["schedule"].size()

	assert_int(SurvivalRunner.open_stage(s, 1)).override_failure_message(
		"2차 중에 1차를 다시 열었다").is_equal(0)
	assert_int(s["schedule"].size()).is_equal(before)
	assert_int(int(SurvivalRunner.of(s)["stage"])).is_equal(2)


## 참가팀 목록이 흔들리지 않는다 — 흔들리면 같은 세이브가 다른 대진을 낸다
func test_the_starting_field_is_ordered() -> void:
	var rec: Dictionary = SurvivalRunner.blank(_state(1))
	var teams: Array = rec["active_teams"]
	var sorted_teams: Array = teams.duplicate()
	sorted_teams.sort()
	assert_array(teams).override_failure_message(
		"참가팀 순서가 정해져 있지 않다").is_equal(sorted_teams)


## ⚠ **세계에 없는 리그의 단계를 안 연다.** 팀 목록은 데이터 파일에서 오므로
## 세계를 안 만든 상태에서도 10팀이 나온다
func test_a_league_that_is_not_in_this_save_has_no_stages() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	s["world"]["rosters"] = {}
	SurvivalRunner.run(s, 10 * 7 - 6)
	assert_array(s["schedule"]).is_empty()
	assert_dict(SurvivalRunner.of(s)).is_empty()


# ── 자르기 ────────────────────────────────────────────────────

## ⚠ **경기가 다 끝나야 자른다.** 탈락은 되돌릴 수 없다
func test_an_unfinished_stage_is_not_cut() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	# 한 경기만 남긴다
	var left: bool = false
	for g in s["schedule"]:
		if String(g["id"]).begins_with("INDS1_"):
			if not left:
				left = true
				continue
			g["result"] = {"home_score": 3, "away_score": 1,
				"winner_id": String(g["home"]), "loser_id": String(g["away"]),
				"player_lines": []}

	assert_bool(SurvivalRunner.stage_complete(s, 1)).is_false()
	assert_int(int(SurvivalRunner.run(s, 12 * 7)["cut"])).override_failure_message(
		"한 경기가 남았는데 잘랐다").is_equal(0)
	assert_int(SurvivalRunner.of(s)["active_teams"].size()).is_equal(10)


## 1차가 끝나면 하위 2팀이 잘린다
func test_the_first_stage_cuts_two() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	var order: Array = _teams()
	_play(s, 1, order)

	var out: Dictionary = SurvivalRunner.run(s, 17 * 7)
	assert_int(int(out["cut"])).is_equal(2)
	var rec: Dictionary = SurvivalRunner.of(s)
	assert_int(rec["active_teams"].size()).is_equal(8)
	assert_int(rec["eliminated"]["1"].size()).is_equal(2)
	# 제일 약한 둘이 잘린다
	assert_array(rec["eliminated"]["1"]).is_equal([order[-2], order[-1]])
	assert_int(s["survival_log"].size()).is_equal(1)
	assert_str(String(s["survival_log"][0]["name"])).is_equal("1차 Stage")


## ⚠ **자르는 게 여는 것보다 먼저다.** 여는 걸 먼저 하면 아직 안 잘린
## 명단으로 다음 단계를 짠다 — 여러 날을 한 번에 넘겨 단계 마감과 다음 단계
## 시작이 같은 호출에 걸리면 실제로 그렇게 된다
func test_the_cut_happens_before_the_next_stage_opens() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	_play(s, 1, _teams())

	# 1차 마감과 2차 시작이 **같은 호출**에 걸린다
	var out: Dictionary = SurvivalRunner.run(s, 18 * 7 - 6)
	assert_int(int(out["cut"])).is_equal(2)
	assert_int(int(out["opened"])).override_failure_message(
		"2차가 %d경기다 — 10팀으로 짰다(56이어야 한다)" % out["opened"]) \
		.is_equal(56)
	assert_int(SurvivalRunner.of(s)["active_teams"].size()).is_equal(8)


## 안 연 단계는 끝난 게 아니다 — 경기가 없으면 "다 끝났다"가 아니다
func test_a_stage_that_never_opened_is_not_complete() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	_play(s, 1, _teams())
	assert_bool(SurvivalRunner.stage_complete(s, 1)).is_true()
	assert_bool(SurvivalRunner.stage_complete(s, 2)).override_failure_message(
		"열지도 않은 2차가 끝났다고 한다").is_false()


## 모르는 단계는 안 자른다
func test_an_unknown_stage_is_not_cut() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	assert_int(SurvivalRunner.cut(s, 9)).override_failure_message(
		"없는 단계를 잘랐다").is_equal(0)
	assert_int(SurvivalRunner.of(s)["active_teams"].size()).is_equal(10)


## ⚠ **기록이 쌓인다.** 매번 새 배열을 만들면 앞 단계 기록이 지워진다
func test_the_stage_log_accumulates() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	_play(s, 1, _teams())
	SurvivalRunner.run(s, 18 * 7 - 6)
	_play(s, 2, SurvivalRunner.of(s)["active_teams"])
	SurvivalRunner.run(s, 24 * 7 - 6)

	assert_int(s["survival_log"].size()).override_failure_message(
		"단계 둘을 잘랐는데 기록이 %d건이다" % s["survival_log"].size()).is_equal(2)
	var names: Array = []
	for e in s["survival_log"]:
		names.append(String(e["name"]))
	assert_array(names).is_equal(["1차 Stage", "2차 Stage"])


## 같은 단계를 두 번 안 자른다 — 자르면 살아남은 팀이 또 줄어든다
func test_a_stage_is_cut_once() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	_play(s, 1, _teams())
	SurvivalRunner.run(s, 17 * 7)
	assert_int(int(SurvivalRunner.run(s, 17 * 7 + 1)["cut"])).override_failure_message(
		"같은 단계를 두 번 잘랐다").is_equal(0)
	assert_int(SurvivalRunner.of(s)["active_teams"].size()).is_equal(8)
	assert_int(s["survival_log"].size()).is_equal(1)


## ⚠ **2차는 생존팀끼리만 돈다.** 잘린 팀이 남아 있으면 탈락이 뜻을 잃는다
func test_the_second_stage_only_has_survivors() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	var order: Array = _teams()
	_play(s, 1, order)
	SurvivalRunner.run(s, 17 * 7)
	SurvivalRunner.run(s, 18 * 7 - 6)

	assert_int(_stage_games(s, 2)).override_failure_message(
		"2차 경기가 %d개다 (8팀 × 14 ÷ 2 = 56이어야 한다)" % _stage_games(s, 2)) \
		.is_equal(56)
	var cut_teams: Array = [String(order[-2]), String(order[-1])]
	for g in s["schedule"]:
		if not String(g["id"]).begins_with("INDS2_"):
			continue
		assert_array(cut_teams).override_failure_message(
			"잘린 팀 %s가 2차에 나왔다" % g["home"]).not_contains([String(g["home"])])
		assert_array(cut_teams).not_contains([String(g["away"])])


## ⚠ **단계마다 순위가 리셋된다.** 1차에서 벌어놓은 승수로 3차 순위가
## 정해지면 "매 단계 새 승부"가 무의미해진다
func test_each_stage_starts_from_zero() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	var order: Array = _teams()
	_play(s, 1, order)
	SurvivalRunner.run(s, 17 * 7)
	SurvivalRunner.run(s, 18 * 7 - 6)

	# 2차는 순서를 뒤집는다 — 1차 꼴찌가 2차 1위다
	var survivors: Array = SurvivalRunner.of(s)["active_teams"]
	var reversed_order: Array = survivors.duplicate()
	reversed_order.reverse()
	_play(s, 2, reversed_order)
	SurvivalRunner.run(s, 23 * 7)

	var rec: Dictionary = SurvivalRunner.of(s)
	assert_int(rec["active_teams"].size()).is_equal(4)
	assert_str(String(rec["active_teams"][0])).override_failure_message(
		"2차 순위가 1차 성적에 끌려갔다").is_equal(String(reversed_order[0]))


# ── 사다리 ────────────────────────────────────────────────────

func _to_stage_three(s: Dictionary) -> Array:
	SurvivalRunner.run(s, 10 * 7 - 6)
	var order: Array = _teams()
	_play(s, 1, order)
	SurvivalRunner.run(s, 17 * 7)
	SurvivalRunner.run(s, 18 * 7 - 6)
	_play(s, 2, SurvivalRunner.of(s)["active_teams"])
	SurvivalRunner.run(s, 23 * 7)
	SurvivalRunner.run(s, 24 * 7 - 6)
	var four: Array = SurvivalRunner.of(s)["active_teams"]
	_play(s, 3, four)
	return four


## 3차가 끝나면 최종 순위와 사다리가 선다
func test_the_ladder_rises_after_the_third_stage() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	var four: Array = _to_stage_three(s)
	assert_int(_stage_games(s, 3)).override_failure_message(
		"3차 경기가 %d개다 (4팀 싱글RR = 6이어야 한다)" % _stage_games(s, 3)) \
		.is_equal(6)

	var out: Dictionary = SurvivalRunner.run(s, 25 * 7)
	assert_int(int(out["ladder"])).is_equal(3)
	var rec: Dictionary = SurvivalRunner.of(s)
	assert_int(rec["final_ranking"].size()).override_failure_message(
		"최종 정규 순위가 안 남았다").is_equal(4)
	assert_str(String(rec["ladder"][0]["home_team_id"])).is_equal(
		String(rec["final_ranking"][2]))
	assert_str(String(rec["ladder"][2]["home_team_id"])).override_failure_message(
		"챔피언결정전 홈이 정규 1위가 아니다").is_equal(String(rec["final_ranking"][0]))


## 사다리를 두 번 안 세운다 — 세우면 치른 시리즈가 날아간다
func test_the_ladder_is_built_once() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	_to_stage_three(s)
	SurvivalRunner.run(s, 25 * 7)
	SurvivalRunner.of(s)["ladder"][0]["winner"] = "SOMEBODY"

	assert_int(int(SurvivalRunner.run(s, 26 * 7)["ladder"])).is_equal(0)
	assert_str(String(SurvivalRunner.of(s)["ladder"][0]["winner"])) \
		.override_failure_message("사다리를 다시 세워 결과가 날아갔다") \
		.is_equal("SOMEBODY")


## 3차가 안 끝났으면 사다리가 없다
func test_no_ladder_before_the_third_stage() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	SurvivalRunner.run(s, 10 * 7 - 6)
	assert_int(int(SurvivalRunner.run(s, 11 * 7)["ladder"])).is_equal(0)
	assert_array(SurvivalRunner.of(s)["ladder"]).is_empty()
	assert_str(SurvivalRunner.champion(s)).is_empty()


# ── 하루 진행에 이어졌나 ──────────────────────────────────────

func test_the_day_engine_opens_the_stage() -> void:
	var s: Dictionary = _state(10 * 7 - 6)
	var out: Dictionary = DayEngine.advance_day(s)
	assert_int(int(SurvivalRunner.of(out).get("stage", 0))).override_failure_message(
		"하루 진행이 1차를 안 열었다").is_equal(1)


## ⚠ **세계 일정에 독립이 없다.** 4단계라 다음 단계 참가팀이 이전 결과에
## 달려 있어서 `SurvivalRunner`가 단계마다 짠다
func test_the_world_schedule_has_no_independent_games() -> void:
	var s: Dictionary = World.new_game({"seed": 7, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	for g in s["schedule"]:
		assert_str(String(g["league_id"])).override_failure_message(
			"세계 일정에 독립 경기가 들어 있다 — 단계와 겹친다").is_not_equal(IND)