extends GdUnitTestSuite

## 시즌 개인 수상 — 부문 1위와 MVP. M5-1.
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/usecases/seasonAwards.ts`
## 수치 정본: `resource/data/master/players/generation_rules.json`의 `awardRules`
##
## ⚠ **이 데이터가 통째로 없던 시절이 있었다.** 타입만 있고 채우는 곳이
## 없어서 항상 빈 배열이었는데, 읽는 쪽은 이미 있었다 — 대학 진학 점수의
## `awards.length × 15`가 늘 0이었고 드래프트 수상 항목도 미완이었다.
##
## ⚠ **자격선이 없으면 0이 1위가 된다.** 실측에서 도루왕(0)·세이브왕(0)·
## 방어율왕(8.45)이 나왔고 그 둘로 MVP까지 받았다.


func _pit(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"type": "pitcher", "ip": 100.0, "w": 0, "k": 0.0,
		"sv": 0, "era": 3.00}
	d.merge(o, true)
	return d


func _bat(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"type": "batter", "pa": 300, "avg": 0.280, "hr": 0,
		"rbi": 0, "sb": 0}
	d.merge(o, true)
	return d


func _find(winners: Array, def_id: String) -> Dictionary:
	for w in winners:
		if w["def_id"] == def_id:
			return w
	return {}


# ── 부문 1위 ───────────────────────────────────────────────────────

func test_the_best_wins_the_category() -> void:
	var stats: Dictionary = {
		"A": _pit({"w": 15}), "B": _pit({"w": 12}), "C": _pit({"w": 9}),
	}
	assert_str(_find(Awards.compute(stats), "wins")["player_id"]).is_equal("A")


func test_era_is_won_by_the_lowest() -> void:
	# ⚠ 방어율만 방향이 반대다. 한 방향으로만 보면 제일 나쁜 투수가 상을 받는다
	var stats: Dictionary = {
		"A": _pit({"era": 2.10}), "B": _pit({"era": 3.50}),
	}
	assert_str(_find(Awards.compute(stats), "era")["player_id"]).is_equal("A")


func test_pitchers_and_batters_are_judged_separately() -> void:
	var stats: Dictionary = {"P": _pit({"w": 15}), "B": _bat({"hr": 30})}
	assert_str(_find(Awards.compute(stats), "wins")["player_id"]).is_equal("P")
	assert_str(_find(Awards.compute(stats), "hr")["player_id"]).is_equal("B")


func test_a_batter_record_carrying_pitching_numbers_wins_nothing() -> void:
	# ⚠ **투타를 `type`으로 갈라야 한다.** 이도류나 옛 세이브의 기록 한 줄이
	# 두 쪽 칸을 다 들고 있을 수 있다 — 이닝만 보면 타자가 다승왕이 된다
	var hybrid: Dictionary = _bat({"ip": 200.0, "w": 99})
	var stats: Dictionary = {"FAKE": hybrid, "REAL": _pit({"w": 12})}
	assert_str(_find(Awards.compute(stats), "wins")["player_id"]).is_equal("REAL")


func test_ties_are_broken_the_same_way_every_time() -> void:
	# ⚠ 사전 순회 순서에 맡기면 같은 세이브가 열 때마다 다른 수상자를 낸다.
	# **넣은 순서와 다른 이름**으로 봐야 정렬이 실제로 도는지 알 수 있다
	var stats: Dictionary = {}
	stats["Z"] = _pit({"w": 15})
	stats["A"] = _pit({"w": 15})
	assert_str(_find(Awards.compute(stats), "wins")["player_id"]).is_equal("A")


# ── 자격선 ─────────────────────────────────────────────────────────

func test_a_short_season_does_not_qualify() -> void:
	# ⚠ 최소 출전이 없으면 1경기 등판한 선수가 방어율왕이 된다
	var stats: Dictionary = {
		"CAMEO": _pit({"ip": 10.0, "era": 0.00, "w": 2}),
		"ACE": _pit({"ip": 120.0, "era": 2.50, "w": 15}),
	}
	assert_str(_find(Awards.compute(stats), "era")["player_id"]).is_equal("ACE")


func test_the_era_bar_is_higher_than_the_others() -> void:
	# ⚠ 방어율왕만 한 단계 위다(45) — 규정이닝 성격이 강한 부문이다.
	# 다승·탈삼진은 40 (고교 시즌 길이에 맞춘 값)
	var stats: Dictionary = {"A": _pit({"ip": 42.0, "era": 2.00, "w": 8, "k": 50.0})}
	var w: Array = Awards.compute(stats)
	assert_dict(_find(w, "era")).is_empty()
	assert_dict(_find(w, "wins")).is_not_empty()
	assert_dict(_find(w, "strikeouts")).is_not_empty()


func test_a_batter_needs_plate_appearances() -> void:
	var stats: Dictionary = {
		"SMALL": _bat({"pa": 30, "avg": 0.583}),
		"REG": _bat({"pa": 400, "avg": 0.312}),
	}
	assert_str(_find(Awards.compute(stats), "avg")["player_id"]).is_equal("REG")


func test_batting_titles_have_different_bars() -> void:
	# 타율은 200타석, 홈런·타점은 130, 도루는 120 — 부문 성격이 다르다
	var stats: Dictionary = {"A": _bat({"pa": 150, "avg": 0.400, "hr": 20, "sb": 30})}
	var w: Array = Awards.compute(stats)
	assert_dict(_find(w, "avg")).is_empty()
	assert_dict(_find(w, "hr")).is_not_empty()
	assert_dict(_find(w, "sb")).is_not_empty()


# ── 하한 — 0이 1위가 되면 안 된다 ─────────────────────────────────

func test_nobody_wins_with_zero() -> void:
	# ⚠ **실측에서 도루왕(0)·세이브왕(0)이 나왔고 그걸로 MVP까지 받았다**
	var stats: Dictionary = {"A": _pit({"sv": 0}), "B": _bat({"sb": 0})}
	var w: Array = Awards.compute(stats)
	assert_dict(_find(w, "saves")).is_empty()
	assert_dict(_find(w, "sb")).is_empty()


func test_a_terrible_era_wins_nothing() -> void:
	# ⚠ 실측에서 방어율왕 8.45가 나왔다. 상한 4.5를 넘으면 수상 없음
	var stats: Dictionary = {"A": _pit({"era": 8.45})}
	assert_dict(_find(Awards.compute(stats), "era")).is_empty()
	# 4.5 아래면 받는다
	assert_dict(_find(Awards.compute({"A": _pit({"era": 4.40})}), "era")).is_not_empty()


func test_a_weak_batting_average_wins_nothing() -> void:
	assert_dict(_find(Awards.compute({"A": _bat({"avg": 0.240})}), "avg")).is_empty()
	assert_dict(_find(Awards.compute({"A": _bat({"avg": 0.260})}), "avg")).is_not_empty()


func test_an_empty_league_gives_no_awards() -> void:
	assert_array(Awards.compute({})).is_empty()


# ── 표기 ───────────────────────────────────────────────────────────

func test_each_category_prints_its_own_way() -> void:
	# 화면과 경력기록이 **같은 문자열**을 쓴다 — 따로 만들면 어긋난다
	var era: Dictionary = _find(Awards.compute({"A": _pit({"era": 2.31})}), "era")
	assert_str(era["value_text"]).is_equal("2.31")
	assert_str(era["title"]).is_equal("방어율왕 (2.31)")
	var avg: Dictionary = _find(Awards.compute({"A": _bat({"avg": 0.312})}), "avg")
	assert_str(avg["value_text"]).is_equal(".312")
	var wins: Dictionary = _find(Awards.compute({"A": _pit({"w": 15})}), "wins")
	assert_str(wins["value_text"]).is_equal("15")


# ── 압도성 ─────────────────────────────────────────────────────────

func test_dominance_is_relative_not_absolute() -> void:
	# ⚠ **부문마다 단위가 달라 절대값으로는 비교가 안 된다** (다승 20 vs 타율 .338).
	# MVP 폴백이 이걸 기준으로 삼는다
	var runaway: Array = Awards.compute({"A": _pit({"w": 20}), "B": _pit({"w": 10})})
	var close: Array = Awards.compute({"A": _pit({"w": 20}), "B": _pit({"w": 19})})
	assert_bool(_find(runaway, "wins")["dominance"] > _find(close, "wins")["dominance"]).is_true()


func test_relative_dominance_can_flip_the_ranking() -> void:
	# ⚠ **여기가 상대값을 쓰는 이유다.** 다승 1 차이(20 vs 19)와 타율 2푼
	# 차이(.400 vs .200)를 절대값으로 재면 다승이 더 압도적으로 보인다.
	# 비율로 재면 타율 쪽이 압도적이다 — **MVP가 갈린다**
	var stats: Dictionary = {
		"P1": _pit({"w": 20, "era": 4.40}),
		"P2": _pit({"w": 19, "era": 4.30}),
		"B1": _bat({"avg": 0.400}),
		"B2": _bat({"avg": 0.200}),
	}
	# 아무도 두 부문을 못 가져간다 → 압도성으로 갈린다
	assert_array(Awards.mvp_ids(stats)).is_equal(["B1"])


func test_dominance_stays_finite_when_the_runner_up_has_zero() -> void:
	# ⚠ 2위가 0이면 분모가 0이다. 안 막으면 압도성이 무한대가 되고
	# **그 부문이 MVP를 영원히 가져간다**
	var w: Dictionary = _find(Awards.compute({
		"A": _bat({"sb": 10}), "B": _bat({"sb": 0})}), "sb")
	assert_bool(is_inf(w["dominance"])).is_false()
	assert_bool(is_nan(w["dominance"])).is_false()


func test_dominance_handles_the_era_direction() -> void:
	# 방어율은 낮을수록 좋다 — 방향을 안 맞추면 압도성이 음수가 된다
	var w: Dictionary = _find(Awards.compute({
		"A": _pit({"era": 1.50}), "B": _pit({"era": 4.00})}), "era")
	assert_bool(w["dominance"] > 0.0).is_true()


func test_a_lone_qualifier_has_no_gap() -> void:
	assert_float(_find(Awards.compute({"A": _pit({"w": 15})}), "wins")["dominance"]) \
		.is_equal_approx(0.0, 0.001)


# ── MVP ────────────────────────────────────────────────────────────

func test_two_titles_make_an_mvp() -> void:
	# ⚠ **별도 지표를 만들지 않는다.** 만들면 부문 1위와 어긋난다
	var stats: Dictionary = {
		"ACE": _pit({"w": 18, "k": 200.0, "era": 2.10}),
		"MID": _pit({"w": 10, "k": 100.0, "era": 3.50}),
	}
	assert_array(Awards.mvp_ids(stats)).contains(["ACE"])


func test_the_best_single_title_wins_when_nobody_sweeps() -> void:
	# ⚠ **아무도 2부문을 못 채우는 해가 있다.** 8부문에 자격자 100명이면
	# 석권이 매년 안 나온다 — 실측 격년꼴이었다. 실제 리그는 매년 MVP가
	# 나오므로 그 해엔 **가장 압도적으로 1위한** 선수에게 준다
	var stats: Dictionary = {
		"WINS": _pit({"w": 20, "k": 50.0, "era": 4.40}),
		"K": _pit({"w": 8, "k": 210.0, "era": 4.30}),
		"ERA": _pit({"w": 9, "k": 60.0, "era": 2.00}),
	}
	var ids: Array = Awards.mvp_ids(stats)
	assert_int(ids.size()).is_equal(1)


func test_no_awards_means_no_mvp() -> void:
	# 자격자가 아무도 없으면 MVP도 없다 — 억지로 뽑으면 0승 투수가 MVP다
	assert_array(Awards.mvp_ids({"A": _pit({"ip": 10.0, "w": 0, "era": 9.00})})).is_empty()
	assert_array(Awards.mvp_ids({})).is_empty()


func test_several_players_can_sweep_in_one_season() -> void:
	# 투수 둘이 각자 2부문씩 가져갈 수 있다
	var stats: Dictionary = {
		"P": _pit({"w": 18, "k": 200.0}),
		"B": _bat({"hr": 40, "rbi": 120}),
	}
	var ids: Array = Awards.mvp_ids(stats)
	assert_int(ids.size()).is_equal(2)


func test_lowering_the_bar_to_one_title_would_flood_the_award() -> void:
	# ⚠ `min_titles`를 1로 낮추면 한 해에 8명이 MVP가 되어 의미가 없다.
	# 값을 못박는다 — 부등호만 보면 밀려도 통과한다
	assert_int(Awards.MVP_MIN_TITLES).is_equal(2)
