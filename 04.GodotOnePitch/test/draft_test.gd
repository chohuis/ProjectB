extends GdUnitTestSuite

## 드래프트 — 점수·라운드 앵커·지명. M5-2.
##
## 원본: `packages/engine-native/src/npc_sim.rs`의 주인공 드래프트 판정
## 원본 검사: `draftRelative.test.ts` · `pickInRound.test.ts`
##
## ⚠ **앵커는 NPC 실측 위에 놓는다.** 옛 앵커("리그 중위 → 6R")는 어림이지
## 잰 값이 아니었고, 같은 세계의 고졸 지명자 327명을 같은 분모로 재보니
## 주인공이 **5라운드 관대**했다.
##
## ⚠ 지난 세션에 이 산식을 네 번 고쳤다 — 부상 감점이 산식을 지배하던 것,
## 대회 항이 아무도 안 가르던 것, 수상 항이 없던 것, 상한이 순서를 지우던 것.

const ScriptedRng = preload("res://test/support/scripted_rng.gd")


func _cand(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"percentile": 50.0, "pitching_ovr": 62.5, "team_ace_rank": 0,
		"tournament_score": 20.0, "award_titles": 0, "award_mvps": 0,
		"moderate_injuries": 0, "severe_injuries": 0, "surgery_injuries": 0,
		"scout_score": 30.0,
	}
	d.merge(o, true)
	return d


func _score(o: Dictionary = {}) -> float:
	return Draft.score(_cand(o))["total"]


# ── 바탕 점수 ──────────────────────────────────────────────────────

func test_percentile_and_ovr_make_the_base() -> void:
	# 백분위 0.6 · OVR 0.4 — 둘 다 0~100이라 가중평균이 그대로 0~100이다
	var b: Dictionary = Draft.score(_cand({"percentile": 100.0, "pitching_ovr": 85.0}))
	assert_float(b["percentile"]).is_equal_approx(100.0, 0.001)
	assert_float(b["ovr_norm"]).is_equal_approx(100.0, 0.001)
	assert_float(b["base"]).is_equal_approx(100.0, 0.001)


func test_ovr_is_normalised_against_the_useful_range() -> void:
	# ⚠ 예전 정규화는 상위권에서 멈춰서 **잘 키운 결과가 라운드로 안 이어졌다**.
	# 40~85를 0~100으로 편다 — OVR 70 → 67 · 75 → 78 · 83 → 96
	assert_float(Draft.score(_cand({"pitching_ovr": 70.0}))["ovr_norm"]) \
		.is_equal_approx(66.67, 0.01)
	assert_float(Draft.score(_cand({"pitching_ovr": 83.0}))["ovr_norm"]) \
		.is_equal_approx(95.56, 0.01)


func test_ovr_normalisation_is_clamped() -> void:
	assert_float(Draft.score(_cand({"pitching_ovr": 20.0}))["ovr_norm"]).is_equal_approx(0.0, 0.001)
	assert_float(Draft.score(_cand({"pitching_ovr": 99.0}))["ovr_norm"]).is_equal_approx(100.0, 0.001)


func test_percentile_weighs_more_than_ovr() -> void:
	# 리그 안에서 몇 등인지가 절대 능력보다 중요하다.
	#
	# ⚠ **정규화 뒤 눈금을 맞춰서 봐야 한다.** OVR 90은 정규화하면 상한
	# 100에 닿아서, 원값끼리 견주면 가중치가 아니라 정규화 차이를 보게 된다.
	# 여기서는 백분위 90 ↔ 정규화 90(= OVR 80.5)을 맞바꾼다
	var high_pct: float = _score({"percentile": 90.0, "pitching_ovr": 62.5})   # norm 50
	var high_ovr: float = _score({"percentile": 50.0, "pitching_ovr": 80.5})   # norm 90
	assert_bool(high_pct > high_ovr).is_true()


# ── 얹는 항들 ──────────────────────────────────────────────────────

func test_a_team_ace_gets_looked_at_more() -> void:
	assert_float(_score({"team_ace_rank": 1}) - _score()).is_equal_approx(8.0, 0.001)
	assert_float(_score({"team_ace_rank": 2}) - _score()).is_equal_approx(3.0, 0.001)
	assert_float(_score({"team_ace_rank": 3}) - _score()).is_equal_approx(0.0, 0.001)


func test_the_tournament_baseline_is_non_participation() -> void:
	# ⚠ **기준점이 50이던 시절엔 전원이 똑같이 −12를 먹었다** — 평범한
	# 고교생은 대회 미진출이라 10점이고, 가르는 게 아무것도 없는 항이었다.
	# 미진출(20)이 평범이고 거기서 0이다
	assert_float(_score({"tournament_score": 20.0}) - _score()).is_equal_approx(0.0, 0.001)
	assert_bool(_score({"tournament_score": 80.0}) > _score()).is_true()
	assert_bool(_score({"tournament_score": 0.0}) < _score()).is_true()


func test_the_tournament_term_stays_small() -> void:
	# ⚠ **팀운을 타는 축이라 비중을 크게 안 둔다.** 만점을 받아도 라운드 하나
	# 안팎이다
	assert_bool(_score({"tournament_score": 100.0}) - _score() <= 20.0).is_true()


func test_individual_awards_weigh_more_than_the_tournament() -> void:
	# ⚠ 대회는 팀운을 타지만 **수상은 혼자 만든 결과다.**
	#
	# 정확히는 두 가지다 — 단위당 무게(수상 1회 6점 = 대회 30점어치)와
	# **최대치**(수상 상한 20 > 대회 최대 16). 대회 50점이면 수상 한 번과
	# 같아지므로 "언제나 더 무겁다"는 아니다
	assert_float(_score({"award_titles": 1}) - _score()).is_equal_approx(6.0, 0.001)
	assert_float(_score({"award_mvps": 1}) - _score()).is_equal_approx(10.0, 0.001)
	assert_bool(_score({"award_titles": 1}) > _score({"tournament_score": 40.0})).is_true()
	# 끝까지 갔을 때 수상이 더 멀리 간다
	assert_bool(_score({"award_titles": 9, "award_mvps": 9})
		> _score({"tournament_score": 100.0})).is_true()


func test_awards_are_capped_so_they_cannot_flip_the_order() -> void:
	# ⚠ 상한 20 — 3년 내내 휩쓸어도 2라운드어치까지다. 백분위·OVR이 정본이고
	# 수상은 그 위에 얹는 축이다
	assert_float(_score({"award_titles": 9, "award_mvps": 9}) - _score()) \
		.is_equal_approx(20.0, 0.001)


func test_scouting_is_a_secondary_axis() -> void:
	assert_float(_score({"scout_score": 30.0}) - _score()).is_equal_approx(0.0, 0.001)
	assert_float(_score({"scout_score": 80.0}) - _score()).is_equal_approx(10.0, 0.001)


# ── 부상 ───────────────────────────────────────────────────────────

func test_injuries_are_weighed_by_severity() -> void:
	# ⚠ **예전엔 중등도 이상을 전부 건당 −12로 뭉쳐서 셌다.** 팔꿈치 염증
	# 두 번이 UCL 파열과 같은 무게였다
	assert_float(_score() - _score({"moderate_injuries": 1})).is_equal_approx(2.0, 0.001)
	assert_float(_score() - _score({"severe_injuries": 1})).is_equal_approx(10.0, 0.001)
	assert_float(_score() - _score({"surgery_injuries": 1})).is_equal_approx(18.0, 0.001)


func test_the_injury_penalty_is_capped() -> void:
	# ⚠ **상한이 없던 시절 감점이 −252까지 나왔다**(그냥 0점). 30커리어 중
	# 6명이 이 항 하나로 미지명이었다.
	# 45면 수술 2회로 어떤 재능이든 미지명이다 — 그 위로는 내역만 못 읽게 된다
	assert_float(_score() - _score({"surgery_injuries": 9})).is_equal_approx(45.0, 0.001)


func test_two_surgeries_end_it_for_anyone() -> void:
	var elite: Dictionary = {"percentile": 99.0, "pitching_ovr": 85.0, "surgery_injuries": 2}
	assert_bool(Draft.evaluate(_cand(elite))["drafted"]).is_false()


# ── 상한 없음 ──────────────────────────────────────────────────────

func test_the_score_is_not_capped_at_a_hundred() -> void:
	# ⚠ **예전엔 100에서 잘랐다.** `base`가 이미 0~100인데 에이스(+8)·수상(+20)이
	# 얹히므로 실측 원값이 105·110까지 나온다. 자르면 **그 순서가 지워져**
	# 전부 같은 라운드로 뭉친다 — 실측 17건 중 3건이 정확히 100.0이었고
	# 1R에 7건이 몰린 게 이것 때문이다
	var monster: float = _score({"percentile": 100.0, "pitching_ovr": 85.0,
		"team_ace_rank": 1, "award_mvps": 2, "scout_score": 99.0})
	assert_bool(monster > 100.0).is_true()


func test_the_score_never_goes_negative() -> void:
	var wreck: float = _score({"percentile": 0.0, "pitching_ovr": 20.0,
		"surgery_injuries": 3, "scout_score": 0.0})
	assert_bool(wreck >= 0.0).is_true()


# ── 라운드 앵커 ────────────────────────────────────────────────────

func test_the_undrafted_threshold_matches_the_measurement() -> void:
	# ⚠ **백분위 93이 관문이고 그 지점의 실측 score가 88이다.**
	# 고교 3학년 투수 4805명 중 고졸 지명은 327명(6.81%)이다.
	# 옛 문턱(25)은 백분위 33도 통과시켜서 "애매하면 미지명"이 아예 작동하지
	# 않았다 — 60회 조사에서 미지명이 0건이었다
	assert_float(Draft.UNDRAFTED_SCORE).is_equal_approx(78.0, 0.001)
	assert_bool(Draft.evaluate(_cand({"percentile": 33.0}))["drafted"]).is_false()


func test_the_anchor_lands_where_the_npcs_do() -> void:
	# ⚠ **score 88이 7R이다** — 실측 대응표에서 백분위 93이 그 자리다
	assert_int(Draft.round_of(88.0)).is_equal(7)


func test_a_better_score_means_an_earlier_round() -> void:
	assert_bool(Draft.round_of(100.0) < Draft.round_of(88.0)).is_true()
	assert_bool(Draft.round_of(88.0) < Draft.round_of(80.0)).is_true()


func test_every_round_is_reachable() -> void:
	# ⚠ **예전 구간식은 4·8·10·11라운드가 도달 불가였다** — 나오는 값이
	# 1·2·3·5·6·7·9뿐이었다. 직선이라 전부 나온다
	var seen: Dictionary = {}
	for i in 200:
		seen[Draft.round_of(78.0 + i * 0.5)] = true
	for r in range(1, Draft.DRAFT_ROUNDS + 1):
		assert_bool(seen.has(r)).is_true()


func test_the_round_is_clamped_to_the_draft_length() -> void:
	assert_int(Draft.round_of(999.0)).is_equal(1)
	assert_int(Draft.round_of(78.0)).is_equal(Draft.DRAFT_ROUNDS)


func test_the_threshold_lines_up_with_the_last_round() -> void:
	# ⚠ 어긋나면 11R이 도달 불가가 되거나(문턱이 위) 12R 이상이 미지명으로
	# 뭉개진다(문턱이 아래)
	assert_int(Draft.round_of(Draft.UNDRAFTED_SCORE)).is_equal(Draft.DRAFT_ROUNDS)


# ── 지명 번호 ──────────────────────────────────────────────────────

func test_the_pick_number_follows_the_round() -> void:
	# 10팀 리그 2라운드면 11~20번이다
	var teams: Array = []
	for i in 10:
		teams.append("T%d" % i)
	var out: Dictionary = Draft.evaluate(_cand({"percentile": 99.0, "pitching_ovr": 85.0}),
		teams, ScriptedRng.new([0.0]))
	assert_bool(out["drafted"]).is_true()
	var expected_min: int = (out["round"] - 1) * 10 + 1
	assert_bool(out["pick"] >= expected_min and out["pick"] <= expected_min + 9).is_true()


func test_the_team_matches_the_slot() -> void:
	var teams: Array = ["A", "B", "C", "D"]
	var out: Dictionary = Draft.evaluate(_cand({"percentile": 99.0, "pitching_ovr": 85.0}),
		teams, ScriptedRng.new([0.5]))
	# 슬롯 2 → C, 픽 번호도 그 자리다
	assert_str(out["team_id"]).is_equal("C")
	assert_int(out["pick"]).is_equal((out["round"] - 1) * 4 + 3)


func test_an_undrafted_player_has_no_pick() -> void:
	var out: Dictionary = Draft.evaluate(_cand({"percentile": 10.0}), ["A"], ScriptedRng.new([0.0]))
	assert_bool(out["drafted"]).is_false()
	assert_int(out["round"]).is_equal(0)
	assert_str(out["team_id"]).is_empty()


func test_an_empty_league_does_not_crash() -> void:
	var out: Dictionary = Draft.evaluate(_cand({"percentile": 99.0}), [], ScriptedRng.new([0.0]))
	assert_str(out["team_id"]).is_empty()


# ── 내역 ───────────────────────────────────────────────────────────

func test_the_breakdown_shows_which_term_moved_it() -> void:
	# ⚠ **항이 여섯인 합이라 총점만 보면 어느 항이 미는지 모른다.**
	# 지난 세션에 부상 감점이 산식을 지배하던 걸 내역을 실어서야 알았다
	var b: Dictionary = Draft.score(_cand({"team_ace_rank": 1, "award_mvps": 1,
		"surgery_injuries": 1, "scout_score": 60.0}))
	for key in ["percentile", "ovr_norm", "base", "ace_bonus", "tour_adj",
			"award_adj", "scout_adj", "injury_pen", "total"]:
		assert_bool(b.has(key)).is_true()
	assert_float(b["injury_pen"]).is_equal_approx(18.0, 0.001)
	assert_float(b["award_adj"]).is_equal_approx(10.0, 0.001)
