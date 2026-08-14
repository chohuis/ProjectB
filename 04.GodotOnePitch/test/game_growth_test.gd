extends GdUnitTestSuite

## 경기 성장 — 한 경기가 능력·사기·명성에 남기는 것. M4-4.
##
## 원본: `packages/engine-native/src/growth_engine.rs`의 `calc_game_growth`
##
## ⚠ 레벨업·천장 감쇠는 **`Growth.apply_gains`가 정본이다** — 훈련 성장과
## 같은 함수를 쓴다. 두 벌로 두면 같은 선수가 경로에 따라 다르게 자란다.


func _player(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"age": 20, "diligence": 50.0, "condition": 100.0, "fatigue": 0.0,
		"morale": 50.0, "development_rate": 62.0, "potential_hidden": 75.0,
		"player_type": "pitcher",
		"pitching": {"velocity": 50.0, "command": 50.0, "control": 50.0, "mentality": 50.0},
		"batting": {"contact": 50.0, "eye": 50.0, "batting_clutch": 50.0},
		"pitching_xp": {}, "batting_xp": {},
	}
	d.merge(o, true)
	return d


func _game(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"won": true, "score_diff": 2, "strikeouts": 0,
		"morale_mod": 1.0, "fame_mod": 1.0}
	d.merge(o, true)
	return d


func _run(player: Dictionary = {}, game: Dictionary = {}) -> Dictionary:
	return GameGrowth.calc(player if not player.is_empty() else _player(),
		game if not game.is_empty() else _game())


# ── 어느 능력이 자라나 ─────────────────────────────────────────────

func test_a_pitcher_grows_pitching_stats() -> void:
	var r: Dictionary = _run()
	for stat in ["velocity", "command", "control"]:
		assert_bool(r["pitching_xp"].get(stat, 0.0) > 0.0).is_true()


func test_a_pitcher_does_not_grow_batting() -> void:
	var r: Dictionary = _run()
	assert_bool(r["batting_xp"].is_empty()).is_true()


func test_a_batter_grows_batting_stats() -> void:
	var r: Dictionary = _run(_player({"player_type": "batter"}))
	assert_bool(r["batting_xp"].get("contact", 0.0) > 0.0).is_true()
	assert_bool(r["batting_xp"].get("eye", 0.0) > 0.0).is_true()
	assert_bool(r["pitching_xp"].is_empty()).is_true()


func test_a_two_way_player_grows_both() -> void:
	# ⚠ "pitcher" 또는 "batter"만 보면 이도류가 한쪽만 자란다
	var r: Dictionary = _run(_player({"player_type": "twoWay"}))
	assert_bool(r["pitching_xp"].get("velocity", 0.0) > 0.0).is_true()
	assert_bool(r["batting_xp"].get("contact", 0.0) > 0.0).is_true()


func test_batting_grows_slower_than_pitching_from_a_game() -> void:
	# 타격은 0.7배 — 경기 한 번이 투수에게 더 많이 남는다
	var r: Dictionary = _run(_player({"player_type": "twoWay"}))
	assert_float(r["batting_xp"]["contact"] / r["pitching_xp"]["velocity"]) \
		.is_equal_approx(0.7, 0.01)


# ── 승패가 남기는 것 ───────────────────────────────────────────────

func test_winning_builds_mentality() -> void:
	var won: float = _run(_player(), _game({"won": true}))["pitching_xp"].get("mentality", 0.0)
	var lost: float = _run(_player(), _game({"won": false, "score_diff": 2}))["pitching_xp"].get("mentality", 0.0)
	assert_bool(won > lost).is_true()
	assert_bool(lost > 0.0).is_true()


func test_a_blowout_loss_teaches_nothing_mentally() -> void:
	# ⚠ 크게 지면 배울 게 없다. 접전 패배와 같게 두면 대패가 이득이 된다
	var r: Dictionary = _run(_player(), _game({"won": false, "score_diff": 8}))
	assert_float(r["pitching_xp"].get("mentality", 0.0)).is_equal_approx(0.0, 0.001)


func test_winning_builds_a_batters_clutch() -> void:
	var won: Dictionary = _run(_player({"player_type": "batter"}), _game({"won": true}))
	var lost: Dictionary = _run(_player({"player_type": "batter"}), _game({"won": false}))
	assert_bool(won["batting_xp"].get("batting_clutch", 0.0) > 0.0).is_true()
	assert_float(lost["batting_xp"].get("batting_clutch", 0.0)).is_equal_approx(0.0, 0.001)


# ── 사기 ───────────────────────────────────────────────────────────

func test_morale_follows_the_result() -> void:
	assert_bool(_run(_player(), _game({"won": true}))["morale_delta"] > 0.0).is_true()
	assert_bool(_run(_player(), _game({"won": false, "score_diff": 2}))["morale_delta"] < 0.0).is_true()


func test_a_blowout_loss_hurts_much_more() -> void:
	var close: float = _run(_player(), _game({"won": false, "score_diff": 2}))["morale_delta"]
	var blowout: float = _run(_player(), _game({"won": false, "score_diff": 8}))["morale_delta"]
	assert_bool(blowout < close).is_true()


func test_a_good_manager_amplifies_wins_and_softens_losses() -> void:
	# ⚠ **음수에는 역수를 쓴다.** 그냥 곱하면 좋은 감독이 패배의 충격까지
	# 키운다 — 부호를 안 보면 정확히 반대로 동작한다
	var plain_win: float = _run(_player(), _game({"won": true, "morale_mod": 1.0}))["morale_delta"]
	var good_win: float = _run(_player(), _game({"won": true, "morale_mod": 1.3}))["morale_delta"]
	assert_bool(good_win > plain_win).is_true()

	var plain_loss: float = _run(_player(), _game({"won": false, "morale_mod": 1.0}))["morale_delta"]
	var good_loss: float = _run(_player(), _game({"won": false, "morale_mod": 1.3}))["morale_delta"]
	assert_bool(good_loss > plain_loss).is_true()   # 덜 깎인다


func test_the_manager_modifier_is_clamped() -> void:
	# 범위 밖 값이 들어와도 사기가 튀면 안 된다
	var wild: float = _run(_player(), _game({"won": true, "morale_mod": 99.0}))["morale_delta"]
	var capped: float = _run(_player(), _game({"won": true, "morale_mod": 1.30}))["morale_delta"]
	assert_float(wild).is_equal_approx(capped, 0.001)


func test_morale_stays_inside_zero_to_hundred() -> void:
	var high: Dictionary = _run(_player({"morale": 99.0}), _game({"won": true}))
	assert_bool(high["morale"] <= 100.0).is_true()
	var low: Dictionary = _run(_player({"morale": 2.0}), _game({"won": false, "score_diff": 9}))
	assert_bool(low["morale"] >= 0.0).is_true()


# ── 명성 ───────────────────────────────────────────────────────────

func test_winning_and_strikeouts_build_fame() -> void:
	assert_bool(_run(_player(), _game({"won": true}))["fame_delta"] > 0).is_true()
	var quiet: int = _run(_player(), _game({"won": true, "strikeouts": 0}))["fame_delta"]
	var loud: int = _run(_player(), _game({"won": true, "strikeouts": 12}))["fame_delta"]
	assert_bool(loud > quiet).is_true()


func test_a_blowout_loss_costs_fame() -> void:
	assert_bool(_run(_player(), _game({"won": false, "score_diff": 9}))["fame_delta"] < 0).is_true()
	# 접전 패배는 명성에 중립이다
	assert_int(_run(_player(), _game({"won": false, "score_diff": 1}))["fame_delta"]).is_equal(0)


func test_a_promoting_club_spreads_the_word_further() -> void:
	# 명성은 스폰서 수입의 입력이다
	var plain: int = _run(_player(), _game({"won": true, "strikeouts": 10, "fame_mod": 1.0}))["fame_delta"]
	var loud: int = _run(_player(), _game({"won": true, "strikeouts": 10, "fame_mod": 1.35}))["fame_delta"]
	assert_bool(loud > plain).is_true()


# ── 피로·컨디션 ────────────────────────────────────────────────────

func test_a_game_costs_fatigue() -> void:
	var r: Dictionary = _run(_player({"fatigue": 0.0}))
	assert_float(r["fatigue"]).is_equal_approx(4.0, 0.001)


func test_playing_while_exhausted_costs_more() -> void:
	# ⚠ 구간 승수가 여기도 걸린다. 없으면 지친 채로 계속 나가는 게 공짜다
	assert_float(_run(_player({"fatigue": 75.0}))["fatigue"]).is_equal_approx(75.0 + 6.0, 0.001)
	assert_float(_run(_player({"fatigue": 82.0}))["fatigue"]).is_equal_approx(82.0 + 10.0, 0.001)
	# 90 이상은 4배라 4 × 4 = 16이 붙는데, 그러면 어차피 상한에 닿는다
	assert_float(_run(_player({"fatigue": 92.0}))["fatigue"]).is_equal_approx(100.0, 0.001)


func test_fatigue_stops_at_a_hundred() -> void:
	assert_float(_run(_player({"fatigue": 99.0}))["fatigue"]).is_equal_approx(100.0, 0.001)


func test_a_hard_loss_drains_condition_most() -> void:
	var won: float = _run(_player(), _game({"won": true}))["condition"]
	var close: float = _run(_player(), _game({"won": false, "score_diff": 2}))["condition"]
	var blowout: float = _run(_player(), _game({"won": false, "score_diff": 9}))["condition"]
	assert_float(won).is_equal_approx(97.0, 0.001)
	assert_float(close).is_equal_approx(94.0, 0.001)
	assert_float(blowout).is_equal_approx(88.0, 0.001)


# ── 잠재력·나이 ────────────────────────────────────────────────────

func test_older_players_gain_less_from_a_game() -> void:
	var young: float = _run(_player({"age": 22}))["pitching_xp"]["velocity"]
	var old: float = _run(_player({"age": 37}))["pitching_xp"]["velocity"]
	assert_bool(young > old).is_true()


func test_stats_near_the_ceiling_gain_less() -> void:
	# 훈련과 같은 규칙을 쓴다 — 두 벌로 두면 경로에 따라 다르게 자란다
	var p: Dictionary = _player({"potential_hidden": 80.0})
	p["pitching"]["velocity"] = 79.0
	p["pitching"]["command"] = 40.0
	var r: Dictionary = GameGrowth.calc(p, _game())
	assert_bool(r["pitching_xp"]["velocity"] < r["pitching_xp"]["command"]).is_true()


func test_the_input_player_is_not_mutated() -> void:
	# ⚠ **XP 사전까지 봐야 한다.** 계산값(사기·피로)만 보면 그건 어차피
	# 새로 만든 값이라, 능력·XP 사전을 제자리에서 고쳐도 검사가 통과한다
	var p: Dictionary = _player({"morale": 50.0})
	GameGrowth.calc(p, _game())
	assert_float(p["morale"]).is_equal_approx(50.0, 0.001)
	assert_float(p["fatigue"]).is_equal_approx(0.0, 0.001)
	assert_bool(p["pitching_xp"].is_empty()).is_true()
	assert_bool(p["batting_xp"].is_empty()).is_true()
	assert_float(p["pitching"]["velocity"]).is_equal_approx(50.0, 0.001)


# ── 로그 ───────────────────────────────────────────────────────────

func test_the_result_is_always_logged() -> void:
	assert_bool(_run()["logs"].size() > 0).is_true()
	assert_str(_run(_player(), _game({"won": true}))["logs"][0]).contains("승리")
	assert_str(_run(_player(), _game({"won": false, "score_diff": 9}))["logs"][0]).contains("대패")


## ⚠ **OVR은 파생값이다.** 경기 성장도 훈련과 같이 다시 내야 한다 —
## 한쪽만 하면 경기로 큰 만큼이 조용히 사라진다
func test_the_ovr_is_recomputed_after_a_game() -> void:
	var p: Dictionary = _player({"potential_hidden": 95.0})
	p["pitching"]["ovr"] = 1.0
	p["batting"]["ovr"] = 1.0
	var r: Dictionary = GameGrowth.calc(p, {"won": true})
	assert_float(float(r["pitching"]["ovr"])).override_failure_message(
		"경기 뒤에도 OVR이 옛 값(1) 그대로다").is_equal(
		PlayerGen.pitching_ovr(r["pitching"]))
	assert_float(float(r["batting"]["ovr"])).is_equal(
		PlayerGen.batting_ovr(r["batting"]))
