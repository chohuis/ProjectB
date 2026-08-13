extends GdUnitTestSuite

## 결과 어댑터 — 끝난 경기를 리그가 먹는 모양으로. M2-6.
##
## 원본: `packages/engine-native/src/match_engine.rs`
##       (`collect_player_lines` · `to_match_result` · `to_sim_game_result`)
##
## ⚠ **여기가 경기와 리그를 잇는 유일한 지점이다.** 원본에서 교체된 투수들의
## 성적이 안 남아 있었고, 그걸 통합하면 리그 순위표·성적표가 통째로 빈다.
##
## 나온 줄은 `SeasonStats.accumulate`가 그대로 먹고, 경기 결과는
## `Standings.apply_result`가 그대로 먹는다 — 두 계약을 여기서 지킨다.


func _pline(pid: String, o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"player_id": pid, "outs": 0, "pc": 0, "k": 0, "bb": 0,
		"h": 0, "er": 0, "risp_ab": 0, "risp_h": 0}
	d.merge(o, true)
	return d


func _bline(pid: String, o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"player_id": pid, "ab": 0, "h": 0, "hr": 0, "rbi": 0,
		"bb": 0, "k": 0, "sb": 0, "risp_ab": 0, "risp_h": 0}
	d.merge(o, true)
	return d


func _state(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"score": {"home": 5, "away": 3},
		"my_pitcher_lines": [], "opponent_pitcher_lines": [],
		"home_bat_lines": [], "away_bat_lines": [],
	}
	d.merge(o, true)
	return d


func _find(lines: Array, pid: String) -> Dictionary:
	for l in lines:
		if l.get("player_id", "") == pid:
			return l
	return {}


# ── 선수 줄 모으기 ─────────────────────────────────────────────────

func test_every_pitcher_who_threw_gets_a_line() -> void:
	# ⚠ **교체된 투수의 성적이 안 남으면 리그 순위표가 통째로 빈다**
	var s: Dictionary = _state({"my_pitcher_lines": [
		_pline("P1", {"outs": 18, "pc": 85, "k": 7, "h": 5, "bb": 2, "er": 2}),
		_pline("P2", {"outs": 6, "pc": 22, "k": 3, "h": 1}),
	]})
	var lines: Array = MatchReport.player_lines(s)
	assert_int(lines.size()).is_equal(2)
	assert_str(_find(lines, "P2")["role"]).is_equal("pitcher")


func test_both_teams_pitchers_are_collected() -> void:
	var s: Dictionary = _state({
		"my_pitcher_lines": [_pline("MINE", {"outs": 9, "pc": 40})],
		"opponent_pitcher_lines": [_pline("THEIRS", {"outs": 12, "pc": 50})],
	})
	var lines: Array = MatchReport.player_lines(s)
	assert_dict(_find(lines, "MINE")).is_not_empty()
	assert_dict(_find(lines, "THEIRS")).is_not_empty()


func test_a_pitcher_who_never_threw_is_left_out() -> void:
	# 불펜에 앉아만 있던 투수에게 0이닝 기록을 만들면, 그 0이 시즌 경기 수에
	# 쌓여 등판 없는 투수가 100경기를 뛴 것으로 나온다
	var s: Dictionary = _state({"my_pitcher_lines": [
		_pline("USED", {"outs": 9, "pc": 40}), _pline("BENCH"),
	]})
	var lines: Array = MatchReport.player_lines(s)
	assert_int(lines.size()).is_equal(1)
	assert_dict(_find(lines, "BENCH")).is_empty()


func test_outs_become_baseball_innings() -> void:
	# ⚠ 20아웃은 6.67이닝이 아니라 **6과 2/3**, 즉 야구 표기로 6.2다.
	# 소수로 넘기면 통산 합산이 `92.2 + 0.2 = 92.4`처럼 어긋난다
	var s: Dictionary = _state({"my_pitcher_lines": [_pline("P1", {"outs": 20, "pc": 60})]})
	assert_float(_find(MatchReport.player_lines(s), "P1")["ip"]).is_equal_approx(6.2, 0.0001)


func test_a_pitcher_line_carries_what_the_season_needs() -> void:
	var s: Dictionary = _state({"my_pitcher_lines": [
		_pline("P1", {"outs": 21, "pc": 95, "k": 9, "bb": 3, "h": 6, "er": 2}),
	]})
	var l: Dictionary = _find(MatchReport.player_lines(s), "P1")
	assert_float(l["er"]).is_equal_approx(2.0, 0.001)
	assert_float(l["k"]).is_equal_approx(9.0, 0.001)
	assert_float(l["bb"]).is_equal_approx(3.0, 0.001)
	assert_float(l["h"]).is_equal_approx(6.0, 0.001)


func test_the_decision_is_left_for_the_league_to_decide() -> void:
	# ⚠ 승패를 여기서 만들면 리그 쪽과 두 곳이 달라진다
	var s: Dictionary = _state({"my_pitcher_lines": [_pline("P1", {"outs": 21, "pc": 95})]})
	assert_str(_find(MatchReport.player_lines(s), "P1")["decision"]).is_empty()


func test_every_batter_who_came_up_gets_a_line() -> void:
	var s: Dictionary = _state({"home_bat_lines": [
		_bline("B1", {"ab": 4, "h": 2, "hr": 1, "rbi": 3}),
		_bline("B2", {"ab": 0, "bb": 2}),
	]})
	var lines: Array = MatchReport.player_lines(s)
	assert_int(lines.size()).is_equal(2)
	assert_str(_find(lines, "B1")["role"]).is_equal("batter")
	# 볼넷만 골라도 나온 것이다
	assert_dict(_find(lines, "B2")).is_not_empty()


func test_a_batter_who_never_came_up_is_left_out() -> void:
	var s: Dictionary = _state({"home_bat_lines": [
		_bline("B1", {"ab": 4, "h": 1}), _bline("BENCH"),
	]})
	assert_int(MatchReport.player_lines(s).size()).is_equal(1)


func test_the_lines_feed_straight_into_the_season_stats() -> void:
	# ⚠ **계약 검사다.** 모양이 어긋나면 시즌 누적이 조용히 0을 쌓는다
	var s: Dictionary = _state({
		"my_pitcher_lines": [_pline("P1", {"outs": 21, "pc": 95, "k": 9, "bb": 2, "h": 6, "er": 2})],
		"home_bat_lines": [_bline("B1", {"ab": 4, "h": 2, "hr": 1, "rbi": 3, "bb": 1})],
	})
	var stats: Dictionary = SeasonStats.accumulate({}, MatchReport.player_lines(s))
	assert_str(stats["P1"]["type"]).is_equal("pitcher")
	assert_int(stats["P1"]["g"]).is_equal(1)
	assert_float(stats["P1"]["ip"]).is_equal_approx(7.0, 0.001)
	# 자책 2 · 7이닝 → 2.57
	assert_float(stats["P1"]["era"]).is_equal_approx(2.57, 0.001)
	assert_str(stats["B1"]["type"]).is_equal("batter")
	assert_int(stats["B1"]["ab"]).is_equal(4)
	assert_int(stats["B1"]["pa"]).is_equal(5)
	assert_float(stats["B1"]["avg"]).is_equal_approx(0.5, 0.001)


# ── 경기 결과 ──────────────────────────────────────────────────────

func test_the_home_team_wins_when_it_scores_more() -> void:
	var r: Dictionary = MatchReport.to_match_result(_state({"score": {"home": 5, "away": 3}}),
		"TEAM_H", "TEAM_A")
	assert_str(r["winner_id"]).is_equal("TEAM_H")
	assert_str(r["loser_id"]).is_equal("TEAM_A")
	assert_int(r["home_score"]).is_equal(5)
	assert_int(r["away_score"]).is_equal(3)


func test_the_result_carries_the_player_lines() -> void:
	# ⚠ 결과에 줄이 안 실리면 순위표는 멀쩡한데 **개인 기록만 통째로 빈다** —
	# 승패가 맞아 보여서 한참 안 보인다
	var s: Dictionary = _state({
		"my_pitcher_lines": [_pline("P1", {"outs": 21, "pc": 95})],
		"home_bat_lines": [_bline("B1", {"ab": 4, "h": 2})],
	})
	var r: Dictionary = MatchReport.to_match_result(s, "TEAM_H", "TEAM_A")
	assert_int(r["player_lines"].size()).is_equal(2)


func test_the_visiting_team_wins_when_it_scores_more() -> void:
	var r: Dictionary = MatchReport.to_match_result(_state({"score": {"home": 1, "away": 4}}),
		"TEAM_H", "TEAM_A")
	assert_str(r["winner_id"]).is_equal("TEAM_A")
	assert_str(r["loser_id"]).is_equal("TEAM_H")


func test_a_tie_has_no_loser() -> void:
	# ⚠ **원본은 동점을 홈 승리로 적었다.** 정상 흐름에선 동점으로 안 끝나지만
	# 무승부 규정으로 경기를 끊으면 없던 승리가 생긴다.
	# 순위표는 `loser_id`가 비어 있는 것을 무승부로 읽는다
	var r: Dictionary = MatchReport.to_match_result(_state({"score": {"home": 3, "away": 3}}),
		"TEAM_H", "TEAM_A")
	assert_str(r["loser_id"]).is_empty()


func test_the_result_feeds_straight_into_the_standings() -> void:
	# ⚠ **계약 검사다.** 무승부가 홈 승리로 들어가면 순위표가 어긋난다
	var standings: Array = []
	for t in ["TEAM_H", "TEAM_A"]:
		standings.append({"team_id": t, "wins": 0, "losses": 0, "draws": 0, "win_pct": 0.0,
			"runs_for": 0, "runs_against": 0, "streak": "", "last10": ""})

	var win: Dictionary = MatchReport.to_match_result(_state({"score": {"home": 5, "away": 3}}),
		"TEAM_H", "TEAM_A")
	var after: Array = Standings.apply_result(standings, win, "TEAM_H", "TEAM_A")
	assert_int(after[0]["wins"]).is_equal(1)
	assert_int(after[0]["runs_for"]).is_equal(5)
	assert_int(after[1]["losses"]).is_equal(1)

	var tie: Dictionary = MatchReport.to_match_result(_state({"score": {"home": 3, "away": 3}}),
		"TEAM_H", "TEAM_A")
	var drawn: Array = Standings.apply_result(standings, tie, "TEAM_H", "TEAM_A")
	assert_int(drawn[0]["draws"]).is_equal(1)
	assert_int(drawn[0]["wins"]).is_equal(0)


# ── 투수 피로 ──────────────────────────────────────────────────────

func test_pitching_costs_fatigue() -> void:
	# ⚠ 계수는 리그 시뮬과 **같은 값이다.** 다르면 한쪽 리그만 투수가 빨리 지친다
	assert_float(MatchReport.next_fatigue(100.0, 21)).is_equal_approx(100.0 - 21.0 * 2.7, 0.001)


func test_fatigue_never_leaves_its_range() -> void:
	# 음수 피로면 그 뒤 등판 판정이 통째로 무너진다
	assert_float(MatchReport.next_fatigue(10.0, 60)).is_equal_approx(0.0, 0.001)
	assert_float(MatchReport.next_fatigue(100.0, 0)).is_equal_approx(100.0, 0.001)


func test_conditions_only_cover_pitchers_who_threw() -> void:
	var s: Dictionary = _state({"my_pitcher_lines": [
		_pline("P1", {"outs": 21, "pc": 95}), _pline("BENCH"),
	]})
	var conds: Dictionary = MatchReport.pitcher_conditions(s, {"P1": {"fatigue": 90.0}})
	assert_bool(conds.has("P1")).is_true()
	assert_bool(conds.has("BENCH")).is_false()
	assert_float(conds["P1"]["fatigue"]).is_equal_approx(90.0 - 21.0 * 2.7, 0.001)


func test_an_unknown_pitcher_starts_fresh() -> void:
	# 처음 등판하는 투수는 이전 기록이 없다
	var s: Dictionary = _state({"my_pitcher_lines": [_pline("NEW", {"outs": 9, "pc": 40})]})
	var conds: Dictionary = MatchReport.pitcher_conditions(s, {})
	assert_float(conds["NEW"]["fatigue"]).is_equal_approx(100.0 - 9.0 * 2.7, 0.001)
