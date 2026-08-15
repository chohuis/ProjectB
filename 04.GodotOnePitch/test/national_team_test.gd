extends GdUnitTestSuite

## 국가대표 · 국제대회. B-8.
##
## ⚠ **경기는 시뮬하지 않는다** (사용자 확정). 대표팀 전력으로 순위를 확률
## 산출하고 그 순위가 병역 면제를 정한다.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _cand(i: int, ovr: float, pitcher: bool = true, team: String = "T1",
		age: int = 25, form: float = 0.0) -> Dictionary:
	return {"id": "P%03d" % i, "name": "선수%d" % i, "team_id": team,
		"position": "SP" if pitcher else "1B", "ovr": ovr, "age": age,
		"form": form, "is_protagonist": false}


## 앞쪽 절반이 투수인 후보 백 명. 능력치는 내림차순이라 **그냥 위에서
## 자르면 투수만 뽑힌다** — 투수 절반 규칙이 실제로 일해야 한다.
## 팀은 열 개로 흩어 구단 상한도 걸리게 둔다
const PITCHER_CUT: int = 50


func _pool(n: int = 100) -> Array:
	var out: Array = []
	for i in range(n):
		out.append(_cand(i, 90.0 - float(i) * 0.3, i < PITCHER_CUT, "T%d" % (i % 10)))
	return out


## 반대로 앞쪽 절반이 야수인 후보 — 야수 자리 상한이 일해야 한다
func _batter_pool(n: int = 100) -> Array:
	var out: Array = []
	for i in range(n):
		out.append(_cand(i, 90.0 - float(i) * 0.3, i >= PITCHER_CUT, "T%d" % (i % 10)))
	return out


# ── 일정 ──────────────────────────────────────────────────────

## ⚠ **한 해에 두 대회가 겹치면 안 된다.** 겹치면 규칙이 잘못 짜인 것이다
func test_two_tournaments_never_share_a_year() -> void:
	for year in range(2026, 2100):
		var hit: Array = []
		for t in NationalTeam.rules().get("tournaments", []):
			var cycle: int = int(t.get("cycle_years", 0))
			if cycle > 0 and posmod(year, cycle) == int(t.get("year_mod", -1)):
				hit.append(String(t["id"]))
		assert_int(hit.size()).override_failure_message(
			"%d년에 %s 가 겹친다" % [year, str(hit)]).is_less_equal(1)


## 4년 주기에 세 대회 — 한 해는 비어 있다
func test_one_year_in_four_has_no_tournament() -> void:
	var empty: int = 0
	for year in range(2026, 2030):
		if NationalTeam.tournament_of(year).is_empty():
			empty += 1
	assert_int(empty).override_failure_message(
		"4년 중 대회 없는 해가 %d번이다" % empty).is_equal(1)


func test_every_tournament_comes_around() -> void:
	var seen: Dictionary = {}
	for year in range(2026, 2034):
		var t: Dictionary = NationalTeam.tournament_of(year)
		if not t.is_empty():
			seen[String(t["id"])] = true
	assert_int(seen.size()).override_failure_message(
		"여덟 해에 %d개 대회밖에 안 열렸다" % seen.size()).is_equal(
		NationalTeam.rules()["tournaments"].size())


# ── 성적 점수 ─────────────────────────────────────────────────

## ⚠ **표본이 적으면 깎는다.** 두 이닝 던지고 방어율 0인 사람이 대표팀
## 1순위가 되면 안 된다
func test_a_tiny_sample_is_discounted() -> void:
	var small: float = NationalTeam.form_of({"type": "pitcher", "ip": 2.0, "era": 0.0})
	var full: float = NationalTeam.form_of({"type": "pitcher", "ip": 200.0, "era": 0.0})
	assert_float(small).override_failure_message(
		"두 이닝 방어율 0이 한 시즌과 같은 값을 받는다").is_less(full)

	var few: float = NationalTeam.form_of({"type": "batter", "pa": 5.0, "ops": 1.5})
	var many: float = NationalTeam.form_of({"type": "batter", "pa": 600.0, "ops": 1.5})
	assert_float(few).override_failure_message(
		"다섯 타석 OPS 1.5가 한 시즌과 같은 값을 받는다").is_less(many)


func test_a_good_era_beats_a_bad_one() -> void:
	assert_float(NationalTeam.form_of({"type": "pitcher", "ip": 100.0, "era": 2.0})
		).is_greater(
		NationalTeam.form_of({"type": "pitcher", "ip": 100.0, "era": 6.0}))


func test_a_good_ops_beats_a_bad_one() -> void:
	assert_float(NationalTeam.form_of({"type": "batter", "pa": 400.0, "ops": 1.0})
		).is_greater(
		NationalTeam.form_of({"type": "batter", "pa": 400.0, "ops": 0.5}))


func test_no_record_is_neutral() -> void:
	assert_float(NationalTeam.form_of({})).is_equal(0.0)
	assert_float(NationalTeam.form_of(null)).is_equal(0.0)
	assert_float(NationalTeam.form_of({"type": "pitcher", "ip": 0.0})).is_equal(0.0)
	assert_float(NationalTeam.form_of({"type": "batter", "pa": 0.0})).is_equal(0.0)


## 점수는 −1~1을 안 벗어난다 — 성적 하나가 능력치를 통째로 덮으면 안 된다
func test_the_form_stays_in_its_band() -> void:
	assert_float(NationalTeam.form_of({"type": "pitcher", "ip": 200.0, "era": 0.0})
		).is_between(-1.0, 1.0)
	assert_float(NationalTeam.form_of({"type": "pitcher", "ip": 200.0, "era": 99.0})
		).is_between(-1.0, 1.0)
	assert_float(NationalTeam.form_of({"type": "batter", "pa": 600.0, "ops": 3.0})
		).is_between(-1.0, 1.0)


## ⚠ **성적이 선발에 실린다.** 안 실리면 능력치만 보고 뽑는 것이고,
## 승강 판정과 축이 갈린다
func test_the_form_moves_the_rating() -> void:
	assert_float(NationalTeam.rating(_cand(1, 70.0, true, "T1", 25, 1.0))
		).is_greater(NationalTeam.rating(_cand(2, 70.0, true, "T1", 25, -1.0)))


# ── 발탁 ──────────────────────────────────────────────────────

func _select(year: int = 2028, pool: Array = []) -> Dictionary:
	return NationalTeam.select_squad(pool if not pool.is_empty() else _pool(), year)


func test_no_tournament_means_no_squad() -> void:
	# year_mod 3 — 대회가 없는 해
	var out: Dictionary = _select(2027)
	assert_dict(out["tournament"]).is_empty()
	assert_array(out["squad"]).is_empty()


func test_the_squad_fills_the_roster() -> void:
	var out: Dictionary = _select()
	assert_int(out["squad"].size()).is_equal(
		int(out["tournament"]["roster_size"]))


func test_the_best_players_go() -> void:
	var out: Dictionary = _select()
	assert_bool(out["squad"].has("P000")).override_failure_message(
		"제일 잘하는 선수가 대표팀에 없다").is_true()


## ⚠ **나이 상한이 있다.** 병역 면제가 걸린 대회라 젊은 선수가 간다
func test_an_old_player_is_not_called_up() -> void:
	var pool: Array = [_cand(0, 99.0, true, "T1", 40)]
	for i in range(1, 60):
		pool.append(_cand(i, 60.0, i % 2 == 0, "T%d" % (i % 10)))
	assert_bool(_select(2028, pool)["squad"].has("P000")).override_failure_message(
		"마흔 살이 대표팀에 뽑혔다").is_false()


## ⚠ **한 구단이 독식하지 않는다.** 소속팀 전력이 통째로 빠지면 리그가 기운다
func test_one_club_cannot_take_over_the_squad() -> void:
	var pool: Array = []
	for i in range(60):
		# 상위 스무 명이 전부 한 팀
		pool.append(_cand(i, 90.0 - float(i), i % 2 == 0,
			"RICH" if i < 20 else "T%d" % (i % 8)))
	var out: Dictionary = NationalTeam.select_squad(pool, 2028)
	var rich: int = 0
	for id in out["squad"]:
		if int(String(id).substr(1)) < 20:
			rich += 1
	assert_int(rich).override_failure_message(
		"한 구단에서 %d명이 뽑혔다" % rich).is_less_equal(
		int(NationalTeam.rules()["max_per_team"]))


func _count_pitchers(squad: Array, pitcher_first: bool) -> int:
	var n: int = 0
	for id in squad:
		var i: int = int(String(id).substr(1))
		if (i < PITCHER_CUT) == pitcher_first:
			n += 1
	return n


## ⚠ **투수가 절반이다.** 한쪽으로 쏠리면 대표팀이 성립하지 않는다.
## 능력치 순으로 그냥 자르면 투수만 스물넷이 되는 후보군으로 잰다
func test_the_squad_is_half_pitchers() -> void:
	var out: Dictionary = _select()
	var size: int = int(out["tournament"]["roster_size"])
	var pitchers: int = _count_pitchers(out["squad"], true)
	assert_int(pitchers).override_failure_message(
		"%d명 중 투수가 %d명이다" % [size, pitchers]).is_equal(size / 2)


## 반대쪽도 막는다 — 야수가 상위권을 차지해도 절반은 투수다
func test_the_squad_is_half_pitchers_when_batters_lead() -> void:
	var out: Dictionary = NationalTeam.select_squad(_batter_pool(), 2028)
	var size: int = int(out["tournament"]["roster_size"])
	var batters: int = _count_pitchers(out["squad"], true)
	assert_int(batters).override_failure_message(
		"%d명 중 야수가 %d명이다 — 야수 자리 상한이 안 걸렸다"
		% [size, batters]).is_equal(size / 2)


## 자리가 남으면 순위대로 채운다 — 균형 때문에 대표팀이 미달이면 안 된다
func test_an_unbalanced_pool_still_fills_the_roster() -> void:
	var pool: Array = []
	for i in range(60):
		pool.append(_cand(i, 80.0 - float(i) * 0.2, true, "T%d" % (i % 10)))
	var out: Dictionary = NationalTeam.select_squad(pool, 2028)
	assert_int(out["squad"].size()).override_failure_message(
		"투수만 있는 세계에서 대표팀이 미달이다").is_equal(
		int(out["tournament"]["roster_size"]))

	# ⚠ **같은 사람을 두 번 넣어 채우면 안 된다** — 명단은 스물넷인데
	# 실제 인원은 열둘이 된다
	var seen: Dictionary = {}
	for id in out["squad"]:
		assert_bool(seen.has(String(id))).override_failure_message(
			"%s 가 명단에 두 번 있다" % id).is_false()
		seen[String(id)] = true


## ⚠ **발탁에 난수가 없다.** 같은 세계·같은 해면 같은 대표팀이다
func test_the_same_world_gives_the_same_squad() -> void:
	assert_array(_select()["squad"]).is_equal(_select()["squad"])


func test_the_protagonist_is_noticed() -> void:
	var pool: Array = _pool()
	pool[0]["is_protagonist"] = true
	assert_bool(NationalTeam.select_squad(pool, 2028)["protagonist_selected"]
		).is_true()

	var pool2: Array = _pool()
	pool2[99]["is_protagonist"] = true
	pool2[99]["ovr"] = 1.0
	assert_bool(NationalTeam.select_squad(pool2, 2028)["protagonist_selected"]
		).override_failure_message("못하는데 대표로 뽑혔다").is_false()


func test_the_strength_is_the_squad_average() -> void:
	var out: Dictionary = _select()
	assert_float(float(out["squad_strength"])).is_between(1.0, 100.0)


# ── 대회 결과 ─────────────────────────────────────────────────

func _olympics() -> Dictionary:
	return NationalTeam.tournament_of(2028)


## ⚠ **강팀이 평균적으로 더 높은 자리에 간다.** 아니면 전력을 올릴 이유가 없다
func test_a_stronger_squad_finishes_higher() -> void:
	var strong: float = 0.0
	var weak: float = 0.0
	for i in range(40):
		strong += float(NationalTeam.simulate(_olympics(), 90.0, _rng(i + 1))["rank"])
		weak += float(NationalTeam.simulate(_olympics(), 55.0, _rng(i + 1))["rank"])
	assert_float(strong).override_failure_message(
		"강팀 평균 %.1f위 · 약팀 평균 %.1f위" % [strong / 40.0, weak / 40.0]
	).is_less(weak)


## ⚠ **강팀도 지고 약팀도 이변을 낸다.** 흔들림이 없으면 결과가 정해진 값이다
func test_even_a_strong_squad_can_slip() -> void:
	var seen: Dictionary = {}
	for i in range(60):
		seen[int(NationalTeam.simulate(_olympics(), 90.0, _rng(i + 1))["rank"])] = true
	assert_int(seen.size()).override_failure_message(
		"예순 번 돌렸는데 순위가 %d가지뿐이다" % seen.size()).is_greater(1)


func test_the_rank_stays_inside_the_field() -> void:
	for t in NationalTeam.rules()["tournaments"]:
		for i in range(30):
			var r: Dictionary = NationalTeam.simulate(t, 40.0 + float(i) * 2.0,
				_rng(i + 1))
			assert_int(int(r["rank"])).override_failure_message(
				"%s 에서 %d위가 나왔다 (참가 %d개국)"
				% [t["name"], r["rank"], t["field_size"]]).is_between(
				1, int(t["field_size"]))


func test_the_medals_go_to_the_top_three() -> void:
	assert_str(NationalTeam.medal_of(1)).is_equal("금")
	assert_str(NationalTeam.medal_of(2)).is_equal("은")
	assert_str(NationalTeam.medal_of(3)).is_equal("동")
	assert_str(NationalTeam.medal_of(4)).is_empty()


## ⚠ **면제 기준이 대회마다 다르다.** 아시안게임은 우승만, 올림픽은 3위까지,
## 월드컵은 아예 없다 — 실제 규정과 같다
func test_the_exemption_line_differs_by_tournament() -> void:
	var by_id: Dictionary = {}
	for t in NationalTeam.rules()["tournaments"]:
		by_id[String(t["id"])] = int(t["exemption_rank"])
	assert_int(by_id["asiangames"]).is_equal(1)
	assert_int(by_id["olympics"]).is_equal(3)
	assert_int(by_id["worldcup"]).override_failure_message(
		"월드컵에 병역 특례가 붙었다").is_equal(0)


func test_a_tournament_without_an_exemption_never_grants_one() -> void:
	var wc: Dictionary = NationalTeam.tournament_of(2029)
	for i in range(40):
		assert_bool(bool(NationalTeam.simulate(wc, 99.0, _rng(i + 1))["exemption"])
			).override_failure_message("월드컵 우승으로 면제를 받았다").is_false()


func test_winning_the_asian_games_grants_an_exemption() -> void:
	var ag: Dictionary = NationalTeam.tournament_of(2030)
	var granted: int = 0
	var won: int = 0
	for i in range(60):
		var r: Dictionary = NationalTeam.simulate(ag, 95.0, _rng(i + 1))
		if int(r["rank"]) == 1:
			won += 1
		if bool(r["exemption"]):
			granted += 1
	assert_int(won).override_failure_message("60번에 한 번도 우승 못 했다").is_greater(0)
	assert_int(granted).override_failure_message(
		"우승 %d번인데 면제 %d번이다" % [won, granted]).is_equal(won)


## 올림픽은 3위까지 — 은·동도 면제다
func test_a_bronze_is_enough_at_the_olympics() -> void:
	var t: Dictionary = _olympics()
	for i in range(60):
		var r: Dictionary = NationalTeam.simulate(t, 90.0, _rng(i + 1))
		assert_bool(bool(r["exemption"])).override_failure_message(
			"%d위인데 면제 여부가 %s다" % [r["rank"], r["exemption"]]).is_equal(
			int(r["rank"]) <= 3)
