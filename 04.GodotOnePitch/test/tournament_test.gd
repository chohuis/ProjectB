extends GdUnitTestSuite

## 전국대회 — 고교 5종 · 대학 3종. B-4.


const ME: String = "TEAM_HS_AEWOL"


func _teams(n: int, prefix: String = "T") -> Array:
	var out: Array = []
	for i in n:
		out.append("%s%03d" % [prefix, i])
	return out


func _standings(teams: Array, descending: bool = true) -> Array:
	var out: Array = []
	for i in teams.size():
		var pct: float = float(teams.size() - i) / float(teams.size()) \
			if descending else float(i + 1) / float(teams.size())
		out.append({"team_id": String(teams[i]), "win_pct": pct,
			"runs_for": 100 - i, "runs_against": 50 + i})
	return out


## 권역 n개 × 크기 sizes[i]
func _regions(sizes: Array) -> Array:
	var out: Array = []
	for i in sizes.size():
		var teams: Array = []
		for j in int(sizes[i]):
			teams.append("R%d_T%02d" % [i, j])
		out.append({"region_id": "REGION_%d" % i, "ranked_teams": teams})
	return out


func _flat_win_pct(regions: Array) -> Dictionary:
	# 권역 순위가 그대로 승률 순이 되게 — 앞 권역·앞 순위일수록 세다
	var out: Dictionary = {}
	var n: int = 0
	for r in regions:
		n += (r["ranked_teams"] as Array).size()
	var i: int = 0
	for r in regions:
		for t in r["ranked_teams"]:
			out[String(t)] = float(n - i) / float(n)
			i += 1
	return out


# ── 대회 정의 ─────────────────────────────────────────────────

func test_the_tournaments_are_loaded() -> void:
	assert_int(Tournament.defs().size()).is_equal(8)
	assert_int(Tournament.defs_of("LEAGUE_HIGHSCHOOL").size()).is_equal(5)
	assert_int(Tournament.defs_of("LEAGUE_UNIVERSITY").size()).is_equal(3)
	for d in Tournament.defs():
		assert_int(int(d["start_week"])).is_greater(0)
		assert_int(int(d["end_week"])).is_greater_equal(int(d["start_week"]))
		assert_int(int(d["total_slots"])).is_greater(1)
		assert_str(String(d["name"])).is_not_empty()


## 순서대로 나온다 — 개나리기가 먼저, 패왕기가 끝이다
func test_the_tournaments_come_in_order() -> void:
	var hs: Array = Tournament.defs_of("LEAGUE_HIGHSCHOOL")
	assert_str(String(hs[0]["id"])).is_equal("TOUR_HS_GAENARI")
	assert_str(String(hs[4]["id"])).is_equal("TOUR_HS_PAEWANG")
	var last: int = 0
	for d in hs:
		assert_int(int(d["start_week"])).override_failure_message(
			"%s가 앞 대회보다 먼저 열린다" % d["name"]).is_greater(last)
		last = int(d["start_week"])


func test_it_finds_the_tournament_of_the_week() -> void:
	assert_str(String(Tournament.at_week(2, "LEAGUE_HIGHSCHOOL")["id"])) \
		.is_equal("TOUR_HS_GAENARI")
	assert_str(String(Tournament.at_week(3, "LEAGUE_HIGHSCHOOL")["id"])) \
		.is_equal("TOUR_HS_GAENARI")
	assert_dict(Tournament.at_week(5, "LEAGUE_HIGHSCHOOL")).override_failure_message(
		"대회가 없는 주에 대회가 열렸다").is_empty()
	# 리그를 가른다
	assert_dict(Tournament.at_week(2, "LEAGUE_UNIVERSITY")).is_empty()


## ⚠ **권역은 구장에서 파생한다.** 02는 목록을 한 벌 더 적어 뒀는데
## 두 벌이 되면 언젠가 갈린다
func test_the_regions_come_from_the_stadiums() -> void:
	var hs: Dictionary = Tournament.regions_of("LEAGUE_HIGHSCHOOL")
	assert_int(hs.size()).override_failure_message(
		"고교 권역이 %d개다 (8개여야 한다)" % hs.size()).is_equal(8)
	var total: int = 0
	for k in hs:
		total += (hs[k] as Array).size()
	assert_int(total).is_equal(102)

	var univ: Dictionary = Tournament.regions_of("LEAGUE_UNIVERSITY")
	assert_int(univ.size()).is_equal(5)
	for k in univ:
		assert_int((univ[k] as Array).size()).override_failure_message(
			"대학 조가 10팀 균등이 아니다").is_equal(10)


## 권역 크기가 갈린다 — 그래서 비례 배분이 필요하다
func test_the_regions_are_uneven() -> void:
	var hs: Dictionary = Tournament.regions_of("LEAGUE_HIGHSCHOOL")
	var smallest: int = 999
	var largest: int = 0
	for k in hs:
		smallest = mini(smallest, (hs[k] as Array).size())
		largest = maxi(largest, (hs[k] as Array).size())
	assert_int(largest).override_failure_message(
		"권역 크기가 %d~%d로 고르다 — 비례 배분이 필요 없다" % [smallest, largest]) \
		.is_greater(smallest * 2)


# ── 권역 순위 ─────────────────────────────────────────────────

func test_the_region_ranking_follows_the_standings() -> void:
	var regions: Dictionary = {"A": ["A1", "A2", "A3"], "B": ["B1", "B2"]}
	var standings: Array = [
		{"team_id": "A1", "win_pct": 0.3, "runs_for": 10, "runs_against": 10},
		{"team_id": "A2", "win_pct": 0.9, "runs_for": 10, "runs_against": 10},
		{"team_id": "A3", "win_pct": 0.6, "runs_for": 10, "runs_against": 10},
		{"team_id": "B1", "win_pct": 0.1, "runs_for": 10, "runs_against": 10},
		{"team_id": "B2", "win_pct": 0.5, "runs_for": 10, "runs_against": 10}]
	var out: Array = Tournament.region_rankings(standings, regions)
	assert_array(out[0]["ranked_teams"]).is_equal(["A2", "A3", "A1"])
	assert_array(out[1]["ranked_teams"]).is_equal(["B2", "B1"])
	# 권역도 ID 순으로 — 순서가 흔들리면 시드가 달라진다
	assert_str(String(out[0]["region_id"])).is_equal("A")


## 승률이 같으면 다득점 → 실점 적은 순 → 팀ID.
## ⚠ **팀ID까지 안 넣으면 동률에서 대진이 흔들린다**
func test_ties_are_broken_all_the_way_down() -> void:
	var regions: Dictionary = {"A": ["A1", "A2", "A3", "A4"]}
	var standings: Array = [
		{"team_id": "A1", "win_pct": 0.5, "runs_for": 10, "runs_against": 10},
		{"team_id": "A2", "win_pct": 0.5, "runs_for": 20, "runs_against": 10},
		{"team_id": "A3", "win_pct": 0.5, "runs_for": 10, "runs_against": 5},
		{"team_id": "A4", "win_pct": 0.5, "runs_for": 10, "runs_against": 10}]
	assert_array(Tournament.region_rankings(standings, regions)[0]["ranked_teams"]) \
		.is_equal(["A2", "A3", "A1", "A4"])


# ── 참가팀 선발 ───────────────────────────────────────────────

## ⚠ **권역 크기에 비례해 나눈다.** 같은 수를 뽑으면 6팀 권역은 67%가
## 전국대회에 나가고 20팀 권역은 20%만 나간다
func test_the_quota_follows_the_region_size() -> void:
	var regions: Array = _regions([6, 20, 12, 16])
	var d: Dictionary = {"total_slots": 32, "wildcard_slots": 8}
	var out: Dictionary = Tournament.select_entrants(regions, d,
		_flat_win_pct(regions))
	var q: Dictionary = out["region_quota"]

	assert_int(int(q["REGION_1"])).override_failure_message(
		"20팀 권역(%d)이 6팀 권역(%d)보다 적게 나간다" % [q["REGION_1"], q["REGION_0"]]) \
		.is_greater(int(q["REGION_0"]))
	var total: int = 0
	for k in q:
		total += int(q[k])
	assert_int(total).override_failure_message(
		"자동 시드 합이 %d다 (24여야 한다)" % total).is_equal(24)

	# ⚠ **남은 자리는 소수부가 큰 권역부터.** 54팀에 24자리면 내림 배분이
	# 2·8·5·7(합 22)이고 소수부가 .667·.889·.333·.111이라 20팀·6팀 권역이
	# 한 자리씩 더 받는다
	assert_int(int(q["REGION_0"])).is_equal(3)
	assert_int(int(q["REGION_1"])).is_equal(9)
	assert_int(int(q["REGION_2"])).override_failure_message(
		"소수부가 작은 권역이 남은 자리를 가져갔다").is_equal(5)
	assert_int(int(q["REGION_3"])).is_equal(7)


## 권역당 최소 하나 — 작은 권역이 통째로 빠지면 지역 서사가 죽는다
func test_every_region_gets_at_least_one() -> void:
	var regions: Array = _regions([2, 60, 60, 60])
	var d: Dictionary = {"total_slots": 16, "wildcard_slots": 0}
	var q: Dictionary = Tournament.select_entrants(regions, d,
		_flat_win_pct(regions))["region_quota"]
	assert_int(int(q["REGION_0"])).override_failure_message(
		"2팀 권역이 통째로 빠졌다").is_greater_equal(1)


## 전원 참가 대회(국화기) — 자리가 팀 수보다 많으면 권역 전원이 나간다
func test_an_open_tournament_takes_everyone() -> void:
	var regions: Array = _regions([6, 20, 12, 16])
	var d: Dictionary = {"total_slots": 102, "wildcard_slots": 0}
	var out: Dictionary = Tournament.select_entrants(regions, d,
		_flat_win_pct(regions))
	assert_int(out["seeded_teams"].size()).is_equal(54)
	# ⚠ **배분이 권역 크기를 못 넘는다.** 넘으면 없는 팀을 세는 셈이라
	# 대진 수가 어긋난다
	var q: Dictionary = out["region_quota"]
	assert_int(int(q["REGION_0"])).override_failure_message(
		"6팀 권역에 %d자리를 줬다" % q["REGION_0"]).is_equal(6)
	assert_int(int(q["REGION_1"])).is_equal(20)


## ⚠ **조당 고정 인원은 비례 배분과 다르다.** 조 크기가 갈리면 비례는
## 큰 조에 더 주는데, 왕중왕전은 "조 1위 하나씩"이 규칙이다
func test_a_fixed_number_per_group_ignores_group_size() -> void:
	var regions: Array = _regions([10, 20])
	var d: Dictionary = {"total_slots": 6, "wildcard_slots": 2,
		"per_group_slots": 2}
	var q: Dictionary = Tournament.select_entrants(regions, d,
		_flat_win_pct(regions))["region_quota"]
	assert_int(int(q["REGION_0"])).override_failure_message(
		"조당 고정인데 작은 조가 %d자리다" % q["REGION_0"]).is_equal(2)
	assert_int(int(q["REGION_1"])).override_failure_message(
		"조당 고정인데 큰 조가 %d자리다 — 비례 배분으로 돌았다" % q["REGION_1"]) \
		.is_equal(2)


## 조당 고정 인원이 조 크기를 넘지 않는다
func test_a_fixed_number_cannot_exceed_the_group() -> void:
	var regions: Array = _regions([3, 10])
	var d: Dictionary = {"total_slots": 10, "wildcard_slots": 0,
		"per_group_slots": 5}
	var q: Dictionary = Tournament.select_entrants(regions, d,
		_flat_win_pct(regions))["region_quota"]
	assert_int(int(q["REGION_0"])).override_failure_message(
		"3팀 조에 %d자리를 줬다" % q["REGION_0"]).is_equal(3)
	assert_int(int(q["REGION_1"])).is_equal(5)


## 조 크기가 균등한 리그는 조당 고정 인원 (대학 5조 × 10팀)
func test_even_groups_take_a_fixed_number() -> void:
	var regions: Array = _regions([10, 10, 10, 10, 10])
	var d: Dictionary = {"total_slots": 8, "wildcard_slots": 3,
		"per_group_slots": 1, "wildcard_max_group_rank": 2,
		"auto_seeds_first": true}
	var out: Dictionary = Tournament.select_entrants(regions, d,
		_flat_win_pct(regions))
	for k in out["region_quota"]:
		assert_int(int(out["region_quota"][k])).is_equal(1)
	assert_int(out["seeded_teams"].size()).is_equal(8)
	assert_int(out["wildcards"].size()).is_equal(3)


## ⚠ **와일드카드는 승률로 고른다.** 권역 순서대로 자르면 앞 권역이
## 와일드카드를 독식한다
func test_the_wildcards_are_picked_by_strength() -> void:
	var regions: Array = [
		{"region_id": "A", "ranked_teams": ["A1", "A2", "A3"]},
		{"region_id": "B", "ranked_teams": ["B1", "B2", "B3"]}]
	# 자동 진출은 A1·B1. 남은 넷 중 센 순서는 B2 > A2
	var win_pct: Dictionary = {"A1": 0.9, "A2": 0.4, "A3": 0.1,
		"B1": 0.8, "B2": 0.7, "B3": 0.2}
	var d: Dictionary = {"total_slots": 3, "wildcard_slots": 1,
		"per_group_slots": 1}
	assert_array(Tournament.select_entrants(regions, d, win_pct)["wildcards"]) \
		.override_failure_message("권역 순서대로 잘라 약한 팀이 뽑혔다") \
		.is_equal(["B2"])


## ⚠ **왕중왕전은 조 1위가 통째로 상위 시드다.** 기획서가 그렇게 못 박았다
func test_the_auto_block_can_sit_above_the_wildcards() -> void:
	var regions: Array = _regions([10, 10, 10, 10, 10])
	# 뒤 권역이 셀수록 — 조 1위 중에 약한 팀이 생긴다
	var win_pct: Dictionary = {}
	var v: float = 0.0
	for r in regions:
		for t in r["ranked_teams"]:
			win_pct[String(t)] = v
			v += 0.01
	var d: Dictionary = {"total_slots": 8, "wildcard_slots": 3,
		"per_group_slots": 1, "wildcard_max_group_rank": 2,
		"auto_seeds_first": true}
	var out: Dictionary = Tournament.select_entrants(regions, d, win_pct)
	var seeded: Array = out["seeded_teams"]
	var wildcards: Array = out["wildcards"]

	# 앞 5자리는 전부 조 1위(자동 진출)여야 한다
	for i in 5:
		assert_array(wildcards).override_failure_message(
			"%d번 시드에 와일드카드가 들어왔다" % (i + 1)) \
			.not_contains([String(seeded[i])])
	for i in range(5, 8):
		assert_array(wildcards).contains([String(seeded[i])])


## 고교는 승률로 통합 정렬한다 — 강한 권역 3위가 약한 권역 1위보다 셀 수 있다
func test_a_strong_regions_third_can_outseed_a_weak_regions_first() -> void:
	var regions: Array = [
		{"region_id": "STRONG", "ranked_teams": ["S1", "S2", "S3"]},
		{"region_id": "WEAK", "ranked_teams": ["W1", "W2", "W3"]}]
	var win_pct: Dictionary = {"S1": 0.9, "S2": 0.85, "S3": 0.8,
		"W1": 0.4, "W2": 0.3, "W3": 0.2}
	var d: Dictionary = {"total_slots": 4, "wildcard_slots": 2}
	var out: Dictionary = Tournament.select_entrants(regions, d, win_pct)
	assert_array(out["seeded_teams"]).override_failure_message(
		"약한 권역 1위가 강한 권역 3위보다 위 시드다").is_equal(
		["S1", "S2", "S3", "W1"])


## 와일드카드 후보를 조 상위 몇 위까지로 제한한다
func test_the_wildcard_pool_can_be_capped() -> void:
	var regions: Array = _regions([10, 10, 10, 10, 10])
	var d: Dictionary = {"total_slots": 8, "wildcard_slots": 3,
		"per_group_slots": 1, "wildcard_max_group_rank": 2}
	var out: Dictionary = Tournament.select_entrants(regions, d,
		_flat_win_pct(regions))
	for w in out["wildcards"]:
		assert_str(String(w)).override_failure_message(
			"조 3위 이하가 와일드카드로 뽑혔다").ends_with("T01")


# ── 시드 순서 ─────────────────────────────────────────────────

## ⚠ **1번과 2번이 결승 전까지 안 만난다.** 그게 표준 시드의 목적이다
func test_the_top_seeds_meet_last() -> void:
	# 4팀이면 1↔4 · 2↔3, 8팀이면 1↔8 · 4↔5 · 2↔7 · 3↔6
	assert_array(Array(Tournament.seed_order(2))).is_equal([1, 2])
	assert_array(Array(Tournament.seed_order(4))).is_equal([1, 4, 2, 3])
	assert_array(Array(Tournament.seed_order(8))).is_equal([1, 8, 4, 5, 2, 7, 3, 6])


func test_the_seed_order_is_a_permutation() -> void:
	for size in [2, 4, 8, 16, 32, 64, 128]:
		var order: PackedInt32Array = Tournament.seed_order(size)
		assert_int(order.size()).is_equal(size)
		var seen: Dictionary = {}
		for s in order:
			assert_bool(seen.has(s)).override_failure_message(
				"시드 %d가 두 번 나온다 (크기 %d)" % [s, size]).is_false()
			seen[s] = true
			assert_int(s).is_between(1, size)


# ── 라운드 날짜 ───────────────────────────────────────────────

## ⚠ **라운드는 0-based다.** 1-based로 착각하면 결승이 안쪽으로 당겨지면서
## 1·2라운드가 같은 날에 겹친다 — 02가 실제로 그렇게 고쳤다가 되돌렸다
func test_the_rounds_spread_across_the_window() -> void:
	for spec in [[2, 3, 5], [14, 15, 5], [20, 22, 6], [31, 34, 7], [40, 41, 5]]:
		var sw: int = int(spec[0])
		var ew: int = int(spec[1])
		var rounds: int = int(spec[2])

		var first: Array = Tournament.round_day(0, rounds, sw, ew)
		assert_array(first).override_failure_message(
			"첫 라운드가 기간 첫날이 아니다 (%d~%d, %dR)" % [sw, ew, rounds]) \
			.is_equal([sw, 0])

		var prev: int = -1
		for r in rounds:
			var wd: Array = Tournament.round_day(r, rounds, sw, ew)
			assert_int(int(wd[0])).override_failure_message(
				"마지막 라운드가 기간을 넘었다 (W%d > W%d)" % [wd[0], ew]) \
				.is_less_equal(ew)
			var abs_day: int = (int(wd[0]) - sw) * 7 + int(wd[1])
			assert_int(abs_day).override_failure_message(
				"라운드 날짜가 안 벌어졌다 (R%d) — 같은 날 두 라운드다" % r) \
				.is_greater(prev)
			prev = abs_day


## 라운드가 하나면 첫날 하나뿐이다 — 0으로 나누지 않는다
func test_a_single_round_is_the_first_day() -> void:
	assert_array(Tournament.round_day(0, 1, 10, 12)).is_equal([10, 0])


func test_the_day_number_follows_the_calendar() -> void:
	assert_int(Tournament.day_of(1, 0)).is_equal(1)
	assert_int(Tournament.day_of(2, 0)).is_equal(8)
	assert_int(Tournament.day_of(2, 3)).is_equal(11)
	assert_int(Calendar.week_of(Tournament.day_of(20, 5))).is_equal(20)


# ── 대진 ──────────────────────────────────────────────────────

func _def(slots: int, sw: int = 2, ew: int = 3) -> Dictionary:
	return {"id": "TOUR_TEST", "league_id": "LEAGUE_HIGHSCHOOL",
		"start_week": sw, "end_week": ew, "total_slots": slots,
		"wildcard_slots": 0}


func _round_matches(bracket: Dictionary, round: int) -> Array:
	var out: Array = []
	for m in bracket["matches"]:
		if int(m["round"]) == round:
			out.append(m)
	return out


## 기획서 표와 정확히 맞는다 — 부전승 규칙을 따로 안 만든 이유다
func test_the_bracket_size_matches_the_design_table() -> void:
	for spec in [[48, 64, 16, 6], [102, 128, 26, 7], [24, 32, 8, 5],
			[32, 32, 0, 5], [8, 8, 0, 3]]:
		var b: Dictionary = Tournament.generate_bracket(_def(int(spec[0])),
			_teams(int(spec[0])), ME, 2027)
		assert_int(int(b["bracket_size"])).override_failure_message(
			"%d팀 대진 크기가 %d다" % [spec[0], b["bracket_size"]]) \
			.is_equal(int(spec[1]))
		assert_int(int(b["bye_count"])).override_failure_message(
			"%d팀 부전승이 %d다 (%d여야 한다)" % [spec[0], b["bye_count"], spec[2]]) \
			.is_equal(int(spec[2]))
		assert_int(int(b["total_rounds"])).is_equal(int(spec[3]))


## ⚠ **부전승은 상위 시드가 받는다.** 아래쪽이 받으면 강팀이 한 경기 더 한다
func test_the_byes_go_to_the_top_seeds() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(24), _teams(24), ME, 2027)
	var byes: Array = []
	for m in _round_matches(b, 1):
		if bool(m["is_bye"]):
			byes.append(String(m["winner"]))
	assert_int(byes.size()).is_equal(8)
	# 상위 8시드가 T000~T007이다
	for i in 8:
		assert_array(byes).override_failure_message(
			"%d번 시드가 부전승을 못 받았다" % (i + 1)).contains(["T%03d" % i])


## 부전승은 즉시 2라운드에 오른다 — 치를 경기가 없으니 결과를 넘길 방법이 없다
func test_a_bye_advances_at_once() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(24), _teams(24), ME, 2027)
	var placed: int = 0
	for m in _round_matches(b, 2):
		if not String(m["home"]).is_empty():
			placed += 1
		if not String(m["away"]).is_empty():
			placed += 1
	assert_int(placed).override_failure_message(
		"부전승 8명 중 %d명만 2라운드에 올랐다" % placed).is_equal(8)


## 1번과 2번 시드는 결승에서만 만난다
func test_the_first_and_second_seed_meet_in_the_final() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(8), _teams(8), ME, 2027)
	# 8팀이면 1번은 위 반쪽, 2번은 아래 반쪽이다
	var order: PackedInt32Array = Tournament.seed_order(8)
	var first_half: Array = []
	for i in 4:
		first_half.append(order[i])
	assert_array(first_half).contains([1])
	assert_array(first_half).override_failure_message(
		"1번과 2번이 같은 반쪽에 있다").not_contains([2])


## 부전승은 치를 경기가 아니다
func test_a_bye_is_not_a_game() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(24), _teams(24), ME, 2027)
	var games: Array = Tournament.round_schedule(b, 1)
	assert_int(games.size()).override_failure_message(
		"1라운드 경기가 %d개다 (16 = 24 − 8이어야 한다)" % games.size()).is_equal(8)
	for g in games:
		assert_str(String(g["home"])).is_not_empty()
		assert_str(String(g["away"])).is_not_empty()
		assert_bool(bool(g["is_tournament"])).is_true()


## 대진이 안 정해진 라운드는 치를 경기가 없다
func test_an_undetermined_round_has_no_games() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(32), _teams(32), ME, 2027)
	assert_int(Tournament.round_schedule(b, 1).size()).is_equal(16)
	assert_array(Tournament.round_schedule(b, 2)).override_failure_message(
		"1라운드도 안 치렀는데 2라운드 대진이 잡혔다").is_empty()


## 결과를 넣으면 다음 라운드가 채워진다
func test_a_result_fills_the_next_round() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(8), _teams(8), ME, 2027)
	var results: Array = []
	for m in _round_matches(b, 1):
		results.append({"match_id": String(m["id"]), "winner": String(m["home"])})
	Tournament.advance_round(b, 1, results, ME)

	var next: Array = Tournament.round_schedule(b, 2)
	assert_int(next.size()).is_equal(2)
	for g in next:
		assert_str(String(g["home"])).is_not_empty()
		assert_str(String(g["away"])).is_not_empty()


## ⚠ **참가하지 않은 팀이 승자로 올라오면 무시한다.** 조용히 오염되면
## 나중에 "왜 이 팀이 4강에 있지"로 되돌아온다
func test_an_outsider_cannot_win() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(8), _teams(8), ME, 2027)
	var first: Dictionary = _round_matches(b, 1)[0]
	Tournament.advance_round(b, 1,
		[{"match_id": String(first["id"]), "winner": "TEAM_NOBODY"}], ME)
	assert_str(String(first["winner"])).override_failure_message(
		"경기에 안 나온 팀이 이겼다").is_empty()


## 우승팀은 **결승** 승자다 — 1라운드 승자가 아니다
func test_the_champion_is_the_last_winner() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(8), _teams(8), ME, 2027)
	assert_str(Tournament.champion(b)).is_empty()

	# 1라운드는 홈이, 그 뒤로는 원정이 이긴다 — 라운드마다 승자가 달라진다
	for round in [1, 2, 3]:
		var results: Array = []
		for m in _round_matches(b, round):
			if String(m["home"]).is_empty() or String(m["away"]).is_empty():
				continue
			results.append({"match_id": String(m["id"]),
				"winner": String(m["home"]) if round == 1 else String(m["away"])})
		Tournament.advance_round(b, round, results, ME)

	var final_winner: String = ""
	for m in _round_matches(b, 3):
		final_winner = String(m["winner"])
	assert_str(final_winner).is_not_empty()
	assert_str(Tournament.champion(b)).override_failure_message(
		"우승팀이 결승 승자가 아니다").is_equal(final_winner)
	# 1라운드 승자(1번 시드)와 다르다
	assert_str(Tournament.champion(b)).is_not_equal("T000")


## 내 경기를 표시한다 — 표시가 없으면 진행기가 안 멈춘다
func test_my_games_are_marked() -> void:
	var teams: Array = _teams(8)
	teams[3] = ME
	var b: Dictionary = Tournament.generate_bracket(_def(8), teams, ME, 2027)
	var mine: int = 0
	for m in _round_matches(b, 1):
		if bool(m["is_protagonist_game"]):
			mine += 1
			assert_bool(String(m["home"]) == ME or String(m["away"]) == ME).is_true()
	assert_int(mine).override_failure_message("내 경기가 표시가 안 됐다").is_equal(1)


## ⚠ **부전승은 내 경기가 아니다.** 표시하면 안 치르는 경기에 진행이 멈춘다
func test_a_bye_is_not_my_game() -> void:
	var teams: Array = _teams(24)
	teams[0] = ME
	var b: Dictionary = Tournament.generate_bracket(_def(24), teams, ME, 2027)
	for m in _round_matches(b, 1):
		if String(m["home"]) != ME and String(m["away"]) != ME:
			continue
		assert_bool(bool(m["is_bye"])).override_failure_message(
			"1번 시드가 부전승을 못 받았다").is_true()
		assert_bool(bool(m["is_protagonist_game"])).override_failure_message(
			"부전승인데 내 경기로 표시됐다 — 안 치르는 경기에 진행이 멈춘다") \
			.is_false()


## 이기면 다음 라운드도 내 경기가 된다
func test_my_next_round_is_marked_too() -> void:
	var teams: Array = _teams(8)
	teams[0] = ME
	var b: Dictionary = Tournament.generate_bracket(_def(8), teams, ME, 2027)
	var results: Array = []
	for m in _round_matches(b, 1):
		results.append({"match_id": String(m["id"]), "winner": String(m["home"])})
	Tournament.advance_round(b, 1, results, ME)

	var mine: int = 0
	for m in _round_matches(b, 2):
		if bool(m["is_protagonist_game"]):
			mine += 1
	assert_int(mine).override_failure_message(
		"올라갔는데 다음 경기가 내 경기로 표시가 안 됐다").is_equal(1)


## 대진 날짜가 대회 기간 안에 있다
func test_the_matches_stay_in_the_window() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(32, 20, 22),
		_teams(32), ME, 2027)
	for m in b["matches"]:
		var w: int = Calendar.week_of(int(m["day"]))
		assert_int(w).override_failure_message(
			"경기가 W%d에 잡혔다 (20~22주여야 한다)" % w).is_between(20, 22)


# ── 조별예선 ──────────────────────────────────────────────────

func _group_def(groups: int, advance: int, slots: int) -> Dictionary:
	return {"id": "TOUR_GROUP_TEST", "league_id": "LEAGUE_UNIVERSITY",
		"start_week": 14, "end_week": 17, "total_slots": slots,
		"wildcard_slots": 0, "group_count": groups,
		"advance_per_group": advance, "qualify_weeks": 2}


func test_it_knows_which_tournaments_have_groups() -> void:
	assert_bool(Tournament.has_group_stage(
		Tournament.def_of("TOUR_UNIV_EUNHA"))).is_true()
	assert_bool(Tournament.has_group_stage(
		Tournament.def_of("TOUR_HS_GAENARI"))).is_false()
	assert_bool(Tournament.has_group_stage(
		Tournament.def_of("TOUR_UNIV_WANGJUNGWANG"))).override_failure_message(
		"왕중왕전은 순수 넉아웃이다").is_false()

	# 셋이 다 있어야 조별예선이다 — 하나만 있는 정의는 반쪽이라 안 돈다
	assert_bool(Tournament.has_group_stage({"group_count": 4})) \
		.override_failure_message("조 수만 있고 진출 규칙이 없는데 예선이라고 한다") \
		.is_false()
	assert_bool(Tournament.has_group_stage(
		{"group_count": 4, "advance_per_group": 2})).is_false()
	assert_bool(Tournament.has_group_stage(
		{"group_count": 4, "advance_per_group": 2, "qualify_weeks": 2})).is_true()


## 은하기 24팀 → 8조 × 3팀
func test_the_teams_split_into_groups() -> void:
	var stage: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), _teams(24), ME, 2027, 4242)
	assert_int(stage["groups"].size()).is_equal(8)
	var total: int = 0
	for g in stage["groups"]:
		assert_int((g["teams"] as Array).size()).is_equal(3)
		total += (g["teams"] as Array).size()
		assert_int((g["standings"] as Array).size()).is_equal(3)
	assert_int(total).is_equal(24)


## 아무도 두 조에 안 들어간다
func test_nobody_is_in_two_groups() -> void:
	var stage: Dictionary = Tournament.build_group_stage(
		_group_def(4, 2, 20), _teams(20), ME, 2027, 4242)
	var seen: Dictionary = {}
	for g in stage["groups"]:
		for t in g["teams"]:
			assert_bool(seen.has(String(t))).override_failure_message(
				"%s가 두 조에 있다" % t).is_false()
			seen[String(t)] = true
	assert_int(seen.size()).is_equal(20)


## ⚠ **시드를 무시하고 섞는다** — 그게 '죽음의 조' 드라마의 근거다
func test_the_draw_ignores_the_seeding() -> void:
	var stage: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), _teams(24), ME, 2027, 4242)
	# 시드 순으로 나눴다면 A조가 T000·T008·T016이 된다
	var a: Array = stage["groups"][0]["teams"]
	assert_array(a).override_failure_message(
		"시드 순서대로 조를 나눴다 — 추첨이 아니다") \
		.is_not_equal(["T000", "T008", "T016"])


## 같은 세이브면 같은 조가 나온다 — 다시 열 때마다 달라지면 안 된다
func test_the_draw_is_deterministic() -> void:
	var a: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), _teams(24), ME, 2027, 4242)
	var b: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), _teams(24), ME, 2027, 4242)
	assert_array(a["groups"][0]["teams"]).is_equal(b["groups"][0]["teams"])

	var c: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), _teams(24), ME, 2027, 9999)
	assert_array(a["groups"][0]["teams"]).override_failure_message(
		"세계 시드가 달라도 같은 조다").is_not_equal(c["groups"][0]["teams"])


## 대회마다 다른 추첨이다
func test_each_tournament_draws_differently() -> void:
	var a: Dictionary = Tournament.build_group_stage(
		_group_def(4, 2, 20), _teams(20), ME, 2027, 4242)
	var d: Dictionary = _group_def(4, 2, 20)
	d["id"] = "TOUR_OTHER"
	var b: Dictionary = Tournament.build_group_stage(d, _teams(20), ME, 2027, 4242)
	assert_array(a["groups"][0]["teams"]).is_not_equal(b["groups"][0]["teams"])


## 조별 단일 라운드로빈 — 3팀이면 3경기, 5팀이면 10경기
func test_each_group_plays_a_round_robin() -> void:
	assert_int(_pairs(Tournament.single_round_robin(_teams(3)))).is_equal(3)
	assert_int(_pairs(Tournament.single_round_robin(_teams(5)))).is_equal(10)
	assert_int(_pairs(Tournament.single_round_robin(_teams(4)))).is_equal(6)
	assert_array(Tournament.single_round_robin(_teams(1))).is_empty()


func _pairs(rounds: Array) -> int:
	var n: int = 0
	for r in rounds:
		n += (r as Array).size()
	return n


## 같은 상대와 두 번 안 만난다
func test_nobody_plays_the_same_team_twice() -> void:
	for size in [3, 4, 5, 6]:
		var seen: Dictionary = {}
		for r in Tournament.single_round_robin(_teams(size)):
			for pair in r:
				var key: Array = [String(pair[0]), String(pair[1])]
				key.sort()
				var k: String = "|".join(key)
				assert_bool(seen.has(k)).override_failure_message(
					"%d팀 조에서 %s가 두 번 만난다" % [size, k]).is_false()
				seen[k] = true


## 예선 경기가 대회 기간 안에 있다
func test_the_qualifying_matches_stay_in_the_window() -> void:
	var stage: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), _teams(24), ME, 2027, 4242)
	assert_int(stage["matches"].size()).is_greater(0)
	for m in stage["matches"]:
		var w: int = Calendar.week_of(int(m["day"]))
		assert_int(w).override_failure_message(
			"예선 경기가 W%d에 잡혔다 (14~15주여야 한다)" % w).is_between(14, 15)


## 예선에서도 내 경기를 표시한다 — 표시가 없으면 진행이 안 멈춘다
func test_my_qualifying_games_are_marked() -> void:
	var teams: Array = _teams(24)
	teams[0] = ME
	var stage: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), teams, ME, 2027, 4242)
	var mine: int = 0
	for m in stage["matches"]:
		var involved: bool = String(m["home"]) == ME or String(m["away"]) == ME
		assert_bool(bool(m["is_protagonist_game"])).override_failure_message(
			"내 경기 표시가 실제 참가와 어긋난다 (%s)" % m["id"]).is_equal(involved)
		if involved:
			mine += 1
	assert_int(mine).override_failure_message(
		"3팀 조인데 내 경기가 %d개다 (2개여야 한다)" % mine).is_equal(2)


## ⚠ **결과가 홈·원정 각각의 칸으로 간다.** 뒤바꿔 적으면 진 팀이
## 다득점으로 올라간다
func test_the_results_reach_the_right_side() -> void:
	var stage: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), _teams(24), ME, 2027, 4242)
	var first: Dictionary = stage["matches"][0]
	Tournament.apply_group_results(stage, [{"match_id": String(first["id"]),
		"home_score": 7, "away_score": 2}])

	for g in stage["groups"]:
		for st in g["standings"]:
			var tid: String = String(st["team_id"])
			if tid == String(first["home"]):
				assert_int(int(st["runs_for"])).is_equal(7)
				assert_int(int(st["runs_against"])).is_equal(2)
				assert_int(int(st["wins"])).is_equal(1)
			elif tid == String(first["away"]):
				assert_int(int(st["runs_for"])).override_failure_message(
					"원정팀 득점이 뒤바뀌었다").is_equal(2)
				assert_int(int(st["runs_against"])).is_equal(7)
				assert_int(int(st["losses"])).is_equal(1)


## 결과가 조 순위에 반영된다
func test_the_results_reach_the_group_table() -> void:
	var stage: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), _teams(24), ME, 2027, 4242)
	var results: Array = []
	for m in stage["matches"]:
		results.append({"match_id": String(m["id"]), "home_score": 5,
			"away_score": 1})
	Tournament.apply_group_results(stage, results)

	for g in stage["groups"]:
		for st in g["standings"]:
			var played: int = int(st["wins"]) + int(st["losses"]) + int(st["draws"])
			assert_int(played).override_failure_message(
				"%s가 한 경기도 안 치른 것으로 남았다" % st["team_id"]).is_greater(0)


## 무승부는 승도 패도 아니다
func test_a_draw_is_neither() -> void:
	var stage: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), _teams(24), ME, 2027, 4242)
	var results: Array = []
	for m in stage["matches"]:
		results.append({"match_id": String(m["id"]), "home_score": 3,
			"away_score": 3})
	Tournament.apply_group_results(stage, results)
	for g in stage["groups"]:
		for st in g["standings"]:
			assert_int(int(st["wins"])).is_equal(0)
			assert_int(int(st["losses"])).is_equal(0)
			assert_int(int(st["draws"])).is_greater(0)


## 모르는 경기 결과는 무시한다
func test_an_unknown_result_is_ignored() -> void:
	var stage: Dictionary = Tournament.build_group_stage(
		_group_def(8, 1, 24), _teams(24), ME, 2027, 4242)
	Tournament.apply_group_results(stage,
		[{"match_id": "NOPE", "home_score": 9, "away_score": 0}])
	for g in stage["groups"]:
		for st in g["standings"]:
			assert_int(int(st["runs_for"])).is_equal(0)


func _row(id: String, w: int, l: int, rf: int, ra: int) -> Dictionary:
	return {"team_id": id, "wins": w, "losses": l, "draws": 0,
		"runs_for": rf, "runs_against": ra}


## 조 순위는 승률이 먼저다
func test_the_group_is_ranked_by_win_pct_first() -> void:
	# A가 다득점·득실차 모두 위지만 승률이 아래다
	var g: Dictionary = {"label": "A", "standings": [
		_row("A", 1, 1, 99, 0), _row("B", 2, 0, 3, 2)]}
	assert_array(Tournament.rank_group(g)).is_equal(["B", "A"])


## ⚠ **승률이 같으면 득실차다.** 안 보면 실점이 아무리 많아도 다득점만으로
## 올라간다
func test_a_tie_is_broken_by_run_differential() -> void:
	# A는 20−19(+1), B는 8−2(+6). 다득점만 보면 A가 위다
	var g: Dictionary = {"label": "A", "standings": [
		_row("A", 1, 1, 20, 19), _row("B", 1, 1, 8, 2)]}
	assert_array(Tournament.rank_group(g)).override_failure_message(
		"득실차를 안 보고 다득점으로 갈랐다").is_equal(["B", "A"])


## 득실차까지 같으면 다득점
func test_an_equal_differential_is_broken_by_runs_for() -> void:
	# 둘 다 +2인데 B가 12득점, A가 5득점 — **팀ID로 갈랐다면 A가 위다**
	var g: Dictionary = {"label": "A", "standings": [
		_row("A", 1, 1, 5, 3), _row("B", 1, 1, 12, 10)]}
	assert_array(Tournament.rank_group(g)).override_failure_message(
		"득실차가 같은데 다득점을 안 보고 팀ID로 갈랐다").is_equal(["B", "A"])


## ⚠ **끝까지 팀ID로 가른다.** 동률에서 순서가 흔들리면 본선 대진이 달라져
## 결정성이 깨진다
func test_a_full_tie_is_broken_by_id() -> void:
	var g: Dictionary = {"label": "A", "standings": [
		_row("Z", 1, 1, 5, 5), _row("A", 1, 1, 5, 5)]}
	assert_array(Tournament.rank_group(g)).is_equal(["A", "Z"])


## 한 경기도 안 치른 조는 팀ID 순이다 — 0으로 나누지 않는다
func test_an_unplayed_group_does_not_divide_by_zero() -> void:
	var g: Dictionary = {"label": "A", "standings": [
		_row("B", 0, 0, 0, 0), _row("A", 0, 0, 0, 0)]}
	assert_array(Tournament.rank_group(g)).is_equal(["A", "B"])


## ⚠ **조 1위 블록 → 조 2위 블록.** 그래야 표준 시드에서 조 1위끼리
## 1라운드에 안 만난다
func test_the_group_winners_are_seeded_first() -> void:
	var stage: Dictionary = Tournament.build_group_stage(
		_group_def(4, 2, 20), _teams(20), ME, 2027, 4242)
	# 조마다 첫 팀이 다 이기게 만든다
	var winners: Array = []
	for g in stage["groups"]:
		winners.append(String(g["teams"][0]))
	var results: Array = []
	for m in stage["matches"]:
		var home_wins: bool = winners.has(String(m["home"]))
		results.append({"match_id": String(m["id"]),
			"home_score": 9 if home_wins else 0,
			"away_score": 0 if home_wins else 9})
	Tournament.apply_group_results(stage, results)

	var q: Dictionary = Tournament.qualifiers(stage)
	assert_int(q["qualified"].size()).is_equal(8)
	for i in 4:
		assert_array(winners).override_failure_message(
			"%d번 시드가 조 1위가 아니다" % (i + 1)).contains([String(q["qualified"][i])])
	for i in range(4, 8):
		assert_array(winners).not_contains([String(q["qualified"][i])])


## 본선은 예선이 끝난 다음 주부터
func test_the_final_bracket_starts_after_the_groups() -> void:
	var d: Dictionary = Tournament.def_of("TOUR_UNIV_EUNHA")
	var b: Dictionary = Tournament.final_bracket(d, _teams(8), ME, 2027)
	for m in b["matches"]:
		var w: int = Calendar.week_of(int(m["day"]))
		assert_int(w).override_failure_message(
			"본선이 W%d에 잡혔다 — 예선(14~15주)과 겹친다" % w).is_greater_equal(
			int(d["start_week"]) + int(d["qualify_weeks"]))
		assert_int(w).is_less_equal(int(d["end_week"]))
