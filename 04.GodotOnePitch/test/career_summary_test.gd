extends GdUnitTestSuite

## 통산 기록 — 합산·커리어 하이·팀 이력·수상. M1 기반 자료구조.
##
## 원본 검사: `02.SvelteElectron/apps/ui/src/shared/utils/__tests__/careerSummary.test.ts`
## 원본 로직: 같은 폴더 `careerSummary.ts`
##
## ⚠ **통산은 시즌 값의 평균이 아니다.** ERA는 자책 합 × 9 ÷ 이닝 합이고
## 장타율은 루타 합 ÷ 타수 합이다. 평균으로 내면 5이닝 시즌과 180이닝
## 시즌이 같은 무게를 갖는다 — 데뷔 시즌 하나가 통산을 통째로 흔든다.
##
## ⚠ **이닝은 야구식 표기(0.1 = 1아웃)라 그냥 더하면 안 된다.**
## `92.2 + 0.2`는 `92.4`가 아니라 `93.1`이다.


func _p(year: int, o: Dictionary = {}) -> Dictionary:
	return {
		"year": year, "league_id": "LEAGUE_KBL",
		"team_id": o.get("team_id", "TEAM_KBL_A_1"),
		"stat_line": "", "ovr": o.get("ovr", 80),
		"awards": o.get("awards", []),
		"ps_result": o.get("ps_result", ""),
		"stats": {
			"type": "pitcher", "g": o.get("g", 25), "gs": o.get("gs", 25),
			"w": o.get("w", 0), "l": o.get("l", 0), "sv": o.get("sv", 0),
			"hd": o.get("hd", 0), "ip": o.get("ip", 0.0), "er": o.get("er", 0.0),
			"h": o.get("h", 0.0), "k": o.get("k", 0.0), "bb": o.get("bb", 0.0),
			"era": o.get("era", 0.0), "whip": 0.0,
		},
	}


func _b(year: int, o: Dictionary = {}) -> Dictionary:
	return {
		"year": year, "league_id": "LEAGUE_KBL",
		"team_id": o.get("team_id", "TEAM_KBL_A_1"),
		"stat_line": "", "ovr": 80, "awards": [], "ps_result": "",
		"stats": {
			"type": "batter", "g": 100, "pa": o.get("pa", 0), "ab": o.get("ab", 0),
			"h": o.get("h", 0), "hr": o.get("hr", 0), "rbi": o.get("rbi", 0),
			"sb": 0, "bb": o.get("bb", 0), "k": 0,
			"avg": o.get("avg", 0.0), "obp": 0.0, "slg": o.get("slg", 0.0), "ops": 0.0,
		},
	}


func _high(highs: Array, key: String) -> Dictionary:
	for h in highs:
		if h["key"] == key:
			return h
	return {}


# ── 이닝 ↔ 아웃 ────────────────────────────────────────────────────

func test_innings_to_outs_reads_thirds() -> void:
	assert_int(CareerSummary.innings_to_outs(6.0)).is_equal(18)
	assert_int(CareerSummary.innings_to_outs(6.1)).is_equal(19)
	assert_int(CareerSummary.innings_to_outs(6.2)).is_equal(20)


func test_innings_to_outs_absorbs_float_error() -> void:
	# 92 + 2/3이 92.19999999로 저장돼 있을 수 있다
	assert_int(CareerSummary.innings_to_outs(92.19999999)).is_equal(278)


func test_innings_to_outs_ignores_impossible_fractions() -> void:
	# 소수부 3 이상은 야구 표기가 아니다
	assert_int(CareerSummary.innings_to_outs(6.5)).is_equal(18)


func test_outs_to_innings_returns_baseball_notation() -> void:
	assert_float(CareerSummary.outs_to_innings(280)).is_equal_approx(93.1, 0.0001)
	assert_float(CareerSummary.outs_to_innings(18)).is_equal_approx(6.0, 0.0001)
	assert_float(CareerSummary.outs_to_innings(20)).is_equal_approx(6.2, 0.0001)


func test_innings_round_trip() -> void:
	for ip in [0.0, 5.0, 6.1, 6.2, 92.2, 180.1]:
		assert_float(CareerSummary.outs_to_innings(CareerSummary.innings_to_outs(ip))) \
			.is_equal_approx(ip, 0.0001)


# ── 통산 요약 (슬롯 목록 한 줄) ────────────────────────────────────

func test_summary_adds_wins_and_seasons() -> void:
	var s: Dictionary = CareerSummary.summary_of([
		_p(2030, {"ip": 150.0, "er": 60.0, "w": 11, "l": 6}),
		_p(2031, {"ip": 168.0, "er": 50.0, "w": 14, "l": 6}),
	])
	assert_int(s["w"]).is_equal(25)
	assert_int(s["l"]).is_equal(12)
	assert_int(s["seasons"]).is_equal(2)


func test_summary_era_is_a_ratio_of_sums() -> void:
	# ⚠ 5이닝 9자책(ERA 16.20) + 180이닝 60자책(ERA 3.00).
	# 시즌 평균이면 9.60 — 데뷔 한 경기가 통산을 통째로 흔든다.
	# 합산이면 (69 × 9) / 185 = 3.36이 맞다
	var s: Dictionary = CareerSummary.summary_of([
		_p(2029, {"ip": 5.0, "er": 9.0, "l": 1}),
		_p(2030, {"ip": 180.0, "er": 60.0, "w": 14, "l": 8}),
	])
	assert_str(s["era"]).is_equal("3.36")


func test_summary_adds_innings_the_baseball_way() -> void:
	# 92.2 + 0.2 = 93.1 (아웃 278 + 2 = 280 = 93과 1/3)
	# 30자책 × 9 / (280/3) = 2.89
	var s: Dictionary = CareerSummary.summary_of([
		_p(2030, {"ip": 92.2, "er": 30.0, "w": 8, "l": 4}),
		_p(2031, {"ip": 0.2}),
	])
	assert_str(s["era"]).is_equal("2.89")


func test_summary_invents_nothing_when_empty() -> void:
	var s: Dictionary = CareerSummary.summary_of([])
	assert_str(s["era"]).is_empty()
	assert_int(s["seasons"]).is_equal(0)


func test_summary_ignores_batting_records() -> void:
	# 슬롯 목록 한 줄은 투수 기록만 쓴다
	assert_int(CareerSummary.summary_of([_b(2030, {"ab": 4, "h": 1})])["seasons"]).is_equal(0)


# ── 은퇴 결산 ──────────────────────────────────────────────────────

func test_totals_add_innings_as_outs() -> void:
	var t: Dictionary = CareerSummary.totals_of([_p(2030, {"ip": 92.2}), _p(2031, {"ip": 0.2})])
	assert_float(t["pitching"]["ip"]).is_equal_approx(93.1, 0.0001)


func test_totals_era_is_a_ratio_of_sums() -> void:
	# 5이닝 9자책(16.20)과 180이닝 40자책(2.00). 평균이면 9.10이지만
	# 실제 통산은 49×9/185 = 2.38이다
	var t: Dictionary = CareerSummary.totals_of([
		_p(2030, {"ip": 5.0, "er": 9.0, "era": 16.2}),
		_p(2031, {"ip": 180.0, "er": 40.0, "era": 2.0}),
	])
	assert_str(t["pitching"]["era"]).is_equal("2.38")


func test_totals_whip_works_the_same_way() -> void:
	var t: Dictionary = CareerSummary.totals_of([_p(2030, {"ip": 100.0, "h": 90.0, "bb": 30.0})])
	assert_str(t["pitching"]["whip"]).is_equal("1.20")


func test_totals_slugging_is_weighted_by_at_bats() -> void:
	# ⚠ 400타수 .500(200루타) + 20타수 1.000(20루타) = 220/420 = .524.
	# 시즌 SLG의 단순 평균이면 .750이 된다
	var t: Dictionary = CareerSummary.totals_of([
		_b(2030, {"ab": 400, "slg": 0.5}),
		_b(2031, {"ab": 20, "slg": 1.0}),
	])
	assert_str(t["batting"]["slg"]).is_equal(".524")


func test_pitcher_career_has_no_batting_block() -> void:
	var t: Dictionary = CareerSummary.totals_of([_p(2030, {"ip": 100.0})])
	assert_dict(t["batting"]).is_empty()
	assert_dict(t["pitching"]).is_not_empty()


func test_two_way_player_gets_both_blocks() -> void:
	var t: Dictionary = CareerSummary.totals_of([
		_p(2030, {"ip": 100.0}), _b(2030, {"ab": 300, "h": 90}),
	])
	assert_dict(t["pitching"]).is_not_empty()
	assert_dict(t["batting"]).is_not_empty()


func test_first_and_last_year_ignore_input_order() -> void:
	var t: Dictionary = CareerSummary.totals_of([_p(2035), _p(2030), _p(2033)])
	assert_int(t["first_year"]).is_equal(2030)
	assert_int(t["last_year"]).is_equal(2035)


func test_empty_career_stays_empty() -> void:
	# 0으로 채우지 않는다 — "0승 0패 ERA 0.00"은 안 뛴 것과 다른 말이다
	var t: Dictionary = CareerSummary.totals_of([])
	assert_dict(t["pitching"]).is_empty()
	assert_dict(t["batting"]).is_empty()
	assert_int(t["first_year"]).is_equal(0)
	assert_int(t["seasons"]).is_equal(0)


func test_totals_do_not_invent_an_era_without_innings() -> void:
	var t: Dictionary = CareerSummary.totals_of([_p(2030, {"ip": 0.0, "er": 0.0})])
	assert_str(t["pitching"]["era"]).is_equal("-")


# ── 커리어 하이 ────────────────────────────────────────────────────

func test_high_picks_the_best_season_and_its_year() -> void:
	var hs: Array = CareerSummary.highs_of([
		_p(2030, {"w": 8}), _p(2031, {"w": 17}), _p(2032, {"w": 12}),
	])
	assert_str(_high(hs, "w")["value"]).is_equal("17승")
	assert_int(_high(hs, "w")["year"]).is_equal(2031)


func test_high_keeps_the_earlier_year_on_a_tie() -> void:
	# "처음 그랬던 해"가 이야기가 된다
	var hs: Array = CareerSummary.highs_of([_p(2030, {"w": 15}), _p(2033, {"w": 15})])
	assert_int(_high(hs, "w")["year"]).is_equal(2030)


func test_era_high_needs_enough_innings() -> void:
	# ⚠ 3이닝 무실점 데뷔 시즌이 영원히 "최저 ERA 0.00"으로 박히면 안 된다
	var hs: Array = CareerSummary.highs_of([
		_p(2030, {"ip": 3.0, "er": 0.0, "era": 0.0}),
		_p(2031, {"ip": 180.0, "er": 44.0, "era": 2.20}),
	])
	assert_str(_high(hs, "era")["value"]).is_equal("2.20")
	assert_int(_high(hs, "era")["year"]).is_equal(2031)


func test_era_high_is_the_lowest_not_the_highest() -> void:
	# ⚠ ERA만 방향이 반대다. 다른 항목과 같이 "최댓값"으로 다루면 커리어에서
	# **제일 나빴던 시즌**이 자랑거리로 걸린다
	var hs: Array = CareerSummary.highs_of([
		_p(2030, {"ip": 180.0, "era": 4.50}),
		_p(2031, {"ip": 170.0, "era": 2.10}),
	])
	assert_str(_high(hs, "era")["value"]).is_equal("2.10")
	assert_int(_high(hs, "era")["year"]).is_equal(2031)


func test_batting_average_high_needs_enough_at_bats() -> void:
	var hs: Array = CareerSummary.highs_of([
		_b(2030, {"ab": 10, "avg": 0.600}),
		_b(2031, {"ab": 500, "avg": 0.312}),
	])
	assert_str(_high(hs, "avg")["value"]).is_equal(".312")


func test_zero_is_not_a_career_high() -> void:
	var hs: Array = CareerSummary.highs_of([_p(2030, {"w": 5, "sv": 0})])
	assert_dict(_high(hs, "sv")).is_empty()
	assert_dict(_high(hs, "w")).is_not_empty()


func test_pitcher_gets_no_batting_highs() -> void:
	var hs: Array = CareerSummary.highs_of([_p(2030, {"w": 10})])
	assert_dict(_high(hs, "hr")).is_empty()
	assert_dict(_high(hs, "rbi")).is_empty()


func test_ovr_high_is_read_from_outside_stats() -> void:
	# ⚠ OVR은 `stats` 안이 아니라 레코드에 직접 붙어 있다
	var hs: Array = CareerSummary.highs_of([_p(2030, {"ovr": 71}), _p(2031, {"ovr": 88})])
	assert_str(_high(hs, "ovr")["value"]).is_equal("88")
	assert_int(_high(hs, "ovr")["year"]).is_equal(2031)


func test_empty_career_has_no_highs() -> void:
	assert_array(CareerSummary.highs_of([])).is_empty()


# ── 팀 이력 ────────────────────────────────────────────────────────

func test_consecutive_years_become_one_stint() -> void:
	var s: Array = CareerSummary.team_stints_of([
		_p(2030, {"team_id": "TEAM_A"}), _p(2031, {"team_id": "TEAM_A"}),
		_p(2032, {"team_id": "TEAM_A"}),
	])
	assert_int(s.size()).is_equal(1)
	assert_str(s[0]["team_id"]).is_equal("TEAM_A")
	assert_int(s[0]["from_year"]).is_equal(2030)
	assert_int(s[0]["to_year"]).is_equal(2032)
	assert_int(s[0]["seasons"]).is_equal(3)


func test_returning_to_a_team_makes_two_stints() -> void:
	# ⚠ 합치면 그 사이 이적이 사라진다
	var s: Array = CareerSummary.team_stints_of([
		_p(2030, {"team_id": "TEAM_A"}), _p(2031, {"team_id": "TEAM_B"}),
		_p(2032, {"team_id": "TEAM_A"}),
	])
	var ids: Array = []
	for x in s:
		ids.append(x["team_id"])
	assert_array(ids).is_equal(["TEAM_A", "TEAM_B", "TEAM_A"])


func test_stints_sort_by_year_regardless_of_input_order() -> void:
	var s: Array = CareerSummary.team_stints_of([
		_p(2032, {"team_id": "TEAM_B"}), _p(2030, {"team_id": "TEAM_A"}),
		_p(2031, {"team_id": "TEAM_A"}),
	])
	var ids: Array = []
	for x in s:
		ids.append(x["team_id"])
	assert_array(ids).is_equal(["TEAM_A", "TEAM_B"])
	assert_int(s[0]["seasons"]).is_equal(2)


func test_a_gap_splits_the_stint() -> void:
	# 군 복무 등으로 빈 해가 있다
	var s: Array = CareerSummary.team_stints_of([
		_p(2030, {"team_id": "TEAM_A"}), _p(2033, {"team_id": "TEAM_A"}),
	])
	assert_int(s.size()).is_equal(2)


func test_two_records_in_one_year_do_not_stretch_the_stint() -> void:
	# 승격 등으로 같은 해에 두 줄이 생긴다
	var s: Array = CareerSummary.team_stints_of([
		_p(2030, {"team_id": "TEAM_A"}), _p(2030, {"team_id": "TEAM_A"}),
		_p(2031, {"team_id": "TEAM_A"}),
	])
	assert_int(s.size()).is_equal(1)
	assert_int(s[0]["to_year"]).is_equal(2031)


# ── 수상 · 우승 ────────────────────────────────────────────────────

func test_same_award_is_tallied() -> void:
	var mvp: Dictionary = {"id": "MVP", "label": "MVP"}
	var gg: Dictionary = {"id": "GG", "label": "골든글러브"}
	var t: Array = CareerSummary.award_tally_of([
		_p(2030, {"awards": [mvp]}), _p(2031, {"awards": [mvp, gg]}),
		_p(2032, {"awards": [mvp]}),
	])
	assert_str(t[0]["id"]).is_equal("MVP")
	assert_int(t[0]["count"]).is_equal(3)
	assert_array(t[0]["years"]).is_equal([2030, 2031, 2032])


func test_most_frequent_award_comes_first() -> void:
	var mvp: Dictionary = {"id": "MVP", "label": "MVP"}
	var gg: Dictionary = {"id": "GG", "label": "골든글러브"}
	var t: Array = CareerSummary.award_tally_of([
		_p(2030, {"awards": [mvp, gg]}), _p(2031, {"awards": [gg]}),
	])
	assert_str(t[0]["id"]).is_equal("GG")


func test_titles_are_counted_with_their_years() -> void:
	var t: Dictionary = CareerSummary.title_count_of([
		_p(2030, {"ps_result": "champion"}),
		_p(2031, {"ps_result": "runner_up"}),
		_p(2032, {"ps_result": "champion"}),
		_p(2033, {"ps_result": "not_qualified"}),
	])
	assert_int(t["champion"]).is_equal(2)
	assert_int(t["runner_up"]).is_equal(1)
	assert_array(t["champion_years"]).is_equal([2030, 2032])


func test_no_awards_no_titles() -> void:
	assert_array(CareerSummary.award_tally_of([_p(2030)])).is_empty()
	var t: Dictionary = CareerSummary.title_count_of([_p(2030)])
	assert_int(t["champion"]).is_equal(0)
	assert_int(t["runner_up"]).is_equal(0)
