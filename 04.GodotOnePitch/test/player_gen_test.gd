extends GdUnitTestSuite

## 선수 생성 — M8-1.
##
## 원본: `npc_sim.rs`의 `generate_league_roster` · `tuning.rs`의 재능 분포
##
## ⚠ **여기서 잘못 뽑으면 리그가 몇 시즌 뒤에 무너진다.** 02가 겪은 것들이
## 전부 "생성이 몇 % 어긋나서 세대 교체로 증폭된" 형태다:
##
##   · 투수 비율 0.30 → 리그가 30%로 수렴 (로스터는 45%로 만드는데)
##   · 선발 비중 0.55 → 6시즌에 리그 선발 57 → 112명
##   · 천장 고정 → 신입생 전원이 같은 천장
##   · 시드가 학교 이름 길이 → 같은 길이 학교가 같은 난수열


func _rng(seed_value: int = 1):
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _bulk(n: int, over: Dictionary = {}) -> Array:
	var p: Dictionary = {
		"team_id": "TEAM_HS_001", "school_id": "SCH_001",
		"season_year": 2027, "count": n,
		"pitcher_ratio": 0.45,
		"pitching_ovr_min": 45.0, "pitching_ovr_max": 70.0,
		"batting_ovr_min": 45.0, "batting_ovr_max": 70.0,
		"dev_rate_min": 45.0, "dev_rate_max": 75.0,
		"league_id": "LEAGUE_HIGHSCHOOL", "age": 16, "grade": 1,
	}
	p.merge(over, true)
	return PlayerGen.roster(p)


func _count_pitchers(players: Array) -> int:
	var n: int = 0
	for p in players:
		if PlayerGen.is_pitcher(p["position"]):
			n += 1
	return n


# ── 결정적인가 ────────────────────────────────────────────────

## ⚠ **같은 씨앗은 같은 세계를 만든다.** 아니면 조사가 재현이 안 된다 —
## 02는 경기 엔진이 `thread_rng()`라 같은 세이브·같은 시드라도 결과가
## 매번 달랐다
func test_the_same_inputs_make_the_same_players() -> void:
	var a: Array = _bulk(30)
	var b: Array = _bulk(30)
	assert_int(a.size()).is_equal(b.size())
	for i in a.size():
		assert_str(a[i]["id"]).is_equal(b[i]["id"])
		assert_str(a[i]["position"]).is_equal(b[i]["position"])
		assert_float(a[i]["pitching"]["ovr"]).is_equal(b[i]["pitching"]["ovr"])


## ⚠ **시드가 학교 이름 길이였다.** 같은 길이의 학교가 **같은 난수열**을
## 쓴다 — 102팀에 길이는 몇 종류뿐이라 충돌이 심했고, 실측 투수 비율이
## 목표 45%인데 32.5%까지 갔다(표본 1,020이면 통계 오차로는 불가능하다)
func test_teams_with_same_name_length_get_different_players() -> void:
	var a: Array = _bulk(30, {"school_id": "SCH_001", "team_id": "T1"})
	var b: Array = _bulk(30, {"school_id": "SCH_002", "team_id": "T2"})
	var same: int = 0
	for i in a.size():
		if a[i]["position"] == b[i]["position"] \
				and is_equal_approx(a[i]["pitching"]["ovr"], b[i]["pitching"]["ovr"]):
			same += 1
	assert_int(same).override_failure_message("두 학교가 같은 난수열을 쓴다").is_less(10)


func test_a_different_year_makes_a_different_class() -> void:
	var a: Array = _bulk(30, {"season_year": 2027})
	var b: Array = _bulk(30, {"season_year": 2028})
	var same: int = 0
	for i in a.size():
		if is_equal_approx(a[i]["pitching"]["ovr"], b[i]["pitching"]["ovr"]):
			same += 1
	assert_int(same).is_less(10)


# ── 투수 비율 ─────────────────────────────────────────────────

## ⚠ **여기가 파이프라인 전체의 투수 비율을 정한다.** 0.30이었을 때
## 세대가 교체될수록 리그가 30%로 수렴했고, 고교 투수가 23/102팀 미달이었다.
## 그 부족이 대학·독립·드래프트를 거쳐 프로까지 그대로 내려가
## **구단당 투수 총량이 11~13명(하한 21)**이 됐다.
##
## **상류가 마르면 하류에서 아무리 퍼도 안 찬다** — 2군 육성선수로도 안 풀렸다
func test_the_pitcher_ratio_holds_over_a_big_sample() -> void:
	var pitchers: int = 0
	var total: int = 0
	for t in 40:
		var roster: Array = _bulk(30, {"school_id": "SCH_%03d" % t, "team_id": "T%d" % t})
		pitchers += _count_pitchers(roster)
		total += roster.size()
	var ratio: float = float(pitchers) / float(total)
	assert_float(ratio).override_failure_message(
		"투수 비율 %.3f — 목표 0.45" % ratio).is_between(0.40, 0.50)


## ⚠ **선발 비중은 생성과 충원이 같아야 한다.** 0.55로 뒀더니 선발이 매년
## 불어나 6시즌에 리그 57 → 112명이 됐다(로테이션은 5~6인데 두 배).
##
## 그러면 명목상 선발이 각자 짧게 던져 ERA가 운에 흔들리고 **능력치가 성적을
## 만드는 정도가 무너진다** — 실측 OVR–ERA 상관이 선발 57명일 때 −0.61인데
## 112명일 때 −0.19였다
func test_starters_are_forty_five_percent_of_pitchers() -> void:
	var sp: int = 0
	var pitchers: int = 0
	for t in 40:
		for p in _bulk(30, {"school_id": "SCH_%03d" % t, "team_id": "T%d" % t}):
			if PlayerGen.is_pitcher(p["position"]):
				pitchers += 1
				if p["position"] == "SP":
					sp += 1
	var share: float = float(sp) / float(pitchers)
	assert_float(share).override_failure_message(
		"선발 비중 %.3f — 목표 0.45" % share).is_between(0.40, 0.50)


func test_the_ratio_can_be_asked_for() -> void:
	var all_pitchers: Array = _bulk(30, {"pitcher_ratio": 1.0})
	assert_int(_count_pitchers(all_pitchers)).is_equal(30)
	var no_pitchers: Array = _bulk(30, {"pitcher_ratio": 0.0})
	assert_int(_count_pitchers(no_pitchers)).is_equal(0)


## ⚠ **안 물어봤을 때의 값도 0.45여야 한다.** 검사가 늘 명시해서 넘기면
## 기본값이 틀려도 안 걸린다 — 실제로 그랬고 0.30 변이가 빠져나갔다
func test_the_default_ratio_is_forty_five_percent() -> void:
	var pitchers: int = 0
	var total: int = 0
	for t in 40:
		var roster: Array = PlayerGen.roster({
			"team_id": "T%d" % t, "school_id": "SCH_%03d" % t,
			"season_year": 2027, "count": 30,
		})
		pitchers += _count_pitchers(roster)
		total += roster.size()
	var ratio: float = float(pitchers) / float(total)
	assert_float(ratio).override_failure_message(
		"기본 투수 비율 %.3f — 목표 0.45" % ratio).is_between(0.40, 0.50)


## 생성에선 SP·RP만 나오지만 판정은 넷을 다 안다 — 콜업·로테이션이 쓴다
func test_every_pitcher_position_is_recognised() -> void:
	for pos in ["SP", "RP", "CP", "P"]:
		assert_bool(PlayerGen.is_pitcher(pos)) \
			.override_failure_message("%s를 투수로 안 본다" % pos).is_true()
	for pos in ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"]:
		assert_bool(PlayerGen.is_pitcher(pos)).is_false()


# ── 부족한 자리 채우기 ────────────────────────────────────────

## ⚠ **부족한 자리부터 채운다.** 목록이 모자라면 무작위로 넘어간다 —
## 정본은 호출측이고(그쪽만 현재 로스터를 안다), 여기선 순서대로 쓴다
func test_needed_positions_are_filled_first() -> void:
	var roster: Array = _bulk(10, {"needed_positions": ["C", "C", "SS"]})
	assert_str(roster[0]["position"]).is_equal("C")
	assert_str(roster[1]["position"]).is_equal("C")
	assert_str(roster[2]["position"]).is_equal("SS")


func test_the_rest_fall_back_to_random() -> void:
	var roster: Array = _bulk(10, {"needed_positions": ["C"]})
	assert_str(roster[0]["position"]).is_equal("C")
	assert_int(roster.size()).is_equal(10)


## 빈 자리 이름은 건너뛴다 — 02가 빈 문자열을 넣었다
func test_an_empty_needed_position_falls_back() -> void:
	var roster: Array = _bulk(3, {"needed_positions": ["", "C", ""]})
	assert_str(roster[1]["position"]).is_equal("C")
	assert_str(roster[0]["position"]).is_not_empty()


## ⚠ **충원 목록이 뒤쪽 선수를 밀면 안 된다.** 지정된 자리에서 난수를 안
## 뽑으면 목록 길이만큼 난수열이 어긋나서, **같은 학교인데 충원 목록만
## 달라져도 전혀 다른 세대**가 나온다 — 조용하고, 재현 조사를 무너뜨린다
func test_the_needed_list_does_not_shift_the_rest() -> void:
	var none: Array = _bulk(10)
	var two: Array = _bulk(10, {"needed_positions": ["C", "SS"]})
	# 앞 둘은 지정된 자리라 다르고, 그 뒤는 같아야 한다
	for i in range(2, 10):
		assert_str(two[i]["position"]).override_failure_message(
			"%d번째부터 밀렸다" % i).is_equal(none[i]["position"])
		assert_float(two[i]["pitching"]["ovr"]).is_equal(none[i]["pitching"]["ovr"])


# ── 능력치 ────────────────────────────────────────────────────

func test_ovr_stays_inside_the_asked_range() -> void:
	for p in _bulk(60, {"pitching_ovr_min": 58.0, "pitching_ovr_max": 84.0,
			"batting_ovr_min": 58.0, "batting_ovr_max": 84.0}):
		assert_float(p["pitching"]["ovr"]).is_between(56.0, 86.0)
		assert_float(p["batting"]["ovr"]).is_between(56.0, 86.0)


## ⚠ **세부 능력치가 요청한 대역과 맞아야 한다.** 어긋나면 화면의 OVR과
## 실제 경기력이 따로 논다 — "70인데 왜 이렇게 못 던지나"가 된다.
##
## ⚠ **재계산한 값과 저장된 값을 비교하면 안 된다.** 저장된 값이 그 재계산
## 결과이므로 언제나 참이다 — 처음에 그렇게 썼고 변이가 넷이나 빠져나갔다.
## **요청한 대역**과 비교해야 무언가를 보는 것이다
func test_the_detailed_stats_land_in_the_asked_band() -> void:
	var lo: float = 58.0
	var hi: float = 74.0
	var off: int = 0
	var n: int = 0
	for p in _bulk(60, {"pitching_ovr_min": lo, "pitching_ovr_max": hi}):
		n += 1
		var got: float = PlayerGen.pitching_ovr(p["pitching"])
		# 반올림·상한 때문에 ±2까지는 봐준다
		if got < lo - 2.0 or got > hi + 2.0:
			off += 1
	assert_int(off).override_failure_message(
		"%d/%d명이 요청 대역 %.0f~%.0f 밖이다" % [off, n, lo, hi]).is_equal(0)


## ⚠ **산식은 알려진 입력·알려진 출력으로 못박는다.** 생성된 선수로만 재면
## `_align`이 같은 가중치 표를 쓰기 때문에 **표를 바꿔도 같이 움직여** 아무것도
## 안 보인다 — 실제로 가중치·나눗수 변이가 그렇게 빠져나갔다.
##
## 가중치 합이 12.0이고 나눗수도 12.0이라 **전 항목이 같으면 그 값 그대로**다
func test_the_pitching_formula_is_pinned() -> void:
	var flat: Dictionary = {}
	for k in ["velocity", "command", "control", "movement", "stamina",
			"mentality", "recovery", "clutch", "hold_runners"]:
		flat[k] = 70.0
	assert_float(PlayerGen.pitching_ovr(flat)).is_equal(70.0)

	# 구속만 90, 나머지 60 → (90×2.5 + 60×9.5) / 12 = 66.25 → 66
	var tilted: Dictionary = flat.duplicate()
	for k in tilted:
		tilted[k] = 60.0
	tilted["velocity"] = 90.0
	assert_float(PlayerGen.pitching_ovr(tilted)).override_failure_message(
		"구속 가중치가 2.5가 아니다").is_equal(66.0)

	# 주자견제만 90 (가중치 0.2) → (90×0.2 + 60×11.8) / 12 = 60.5 → 61
	var minor: Dictionary = flat.duplicate()
	for k in minor:
		minor[k] = 60.0
	minor["hold_runners"] = 90.0
	assert_float(PlayerGen.pitching_ovr(minor)).override_failure_message(
		"주자견제 가중치가 0.2가 아니다").is_equal(61.0)


func test_the_batting_formula_is_pinned() -> void:
	# 가중치 합 11.8, 나눗수 11.8 — 전 항목이 같으면 그 값 그대로
	var flat: Dictionary = {}
	for k in ["contact", "power", "eye", "discipline", "speed", "base_instinct",
			"bunting", "platoon", "fielding", "arm", "batting_clutch"]:
		flat[k] = 70.0
	assert_float(PlayerGen.batting_ovr(flat)).is_equal(70.0)


## ⚠ **맞추기가 한 번으로는 부족하다.** 능력치가 1~99에서 잘리므로 천장
## 가까이에서는 한 번 밀어서 목표에 못 닿는다.
##
## ⚠ **평범한 대역으로는 이걸 못 본다.** 92~97에서는 1패스와 3패스가
## 600명 중 0명 차이다. 갈리는 곳은 **97~99** — 실측 평균 96.93 vs 97.66,
## 대역 밖 1명 vs 0명. 리그 최상위 선수가 사는 자리다
func test_the_alignment_converges_against_the_ceiling() -> void:
	var off: int = 0
	var total: float = 0.0
	var n: int = 0
	for t in 20:
		for p in _bulk(30, {"school_id": "SCH_%03d" % t, "team_id": "T%d" % t,
				"pitching_ovr_min": 97.0, "pitching_ovr_max": 99.0,
				"batting_ovr_min": 97.0, "batting_ovr_max": 99.0}):
			var got: float = PlayerGen.pitching_ovr(p["pitching"])
			total += got
			n += 1
			if got < 96.0 or got > 99.0:
				off += 1
	assert_int(off).override_failure_message(
		"%d/%d명이 97~99 요청인데 대역 밖이다" % [off, n]).is_equal(0)
	assert_float(total / float(n)).override_failure_message(
		"평균 %.2f — 3패스면 97.6 근처다" % (total / float(n))).is_greater(97.3)


## 평균도 대역 한가운데여야 한다 — 한쪽으로 쏠리면 리그 전체가 밀린다
func test_the_average_sits_in_the_middle_of_the_band() -> void:
	var total: float = 0.0
	var n: int = 0
	for t in 20:
		for p in _bulk(30, {"school_id": "SCH_%03d" % t, "team_id": "T%d" % t,
				"pitching_ovr_min": 58.0, "pitching_ovr_max": 74.0}):
			total += PlayerGen.pitching_ovr(p["pitching"])
			n += 1
	var avg: float = total / float(n)
	assert_float(avg).override_failure_message(
		"평균 OVR %.1f — 대역 58~74의 한가운데는 66" % avg).is_between(64.0, 68.0)


## ⚠ **플래툰은 능력이 아니라 성향이라 중립 고정이다.** 뽑으면 야수 OVR이
## 사람마다 다른 축으로 흔들린다
func test_platoon_is_neutral_for_everyone() -> void:
	for p in _bulk(30):
		assert_float(p["batting"]["platoon"]).is_equal(50.0)


func test_every_stat_is_inside_one_to_ninety_nine() -> void:
	for p in _bulk(40, {"pitching_ovr_min": 95.0, "pitching_ovr_max": 99.0}):
		for k in p["pitching"]:
			assert_float(p["pitching"][k]).is_between(1.0, 99.0)


## 투수는 투구 능력이, 야수는 타격 능력이 주다 — 둘 다 만들되 역할이 있다
func test_a_pitcher_is_marked_as_one() -> void:
	var roster: Array = _bulk(30, {"pitcher_ratio": 1.0})
	for p in roster:
		assert_str(p["player_type"]).is_equal("pitcher")
	for p in _bulk(30, {"pitcher_ratio": 0.0}):
		assert_str(p["player_type"]).is_equal("batter")


# ── 재능 (천장·성장 속도) ─────────────────────────────────────

## ⚠ **천장과 속도를 같이 뽑는다.** 예전엔 속도만 균등 난수였고 천장은
## `ovr_max × 1.15` 고정이라 **신입생 전원이 같은 천장**을 가졌다
func test_potentials_are_not_all_the_same() -> void:
	var seen: Dictionary = {}
	for p in _bulk(60):
		seen[roundf(p["potential"])] = true
	assert_int(seen.size()).override_failure_message("천장이 고정돼 있다").is_greater(10)


## ⚠ **소수에게만 높은 천장과 빠른 성장을 준다.** 꼬리 비율 3% — 고교
## 신입생 1,020명이면 한 해 약 30명이고, 그중 프로까지 가는 건 훨씬 적다
func test_a_small_tail_gets_a_much_higher_ceiling() -> void:
	var tail: int = 0
	var total: int = 0
	for t in 40:
		for p in _bulk(30, {"school_id": "SCH_%03d" % t, "team_id": "T%d" % t}):
			total += 1
			# 꼬리는 천장 배수 1.28 이상 · 성장 속도 82 이상을 **같이** 받는다
			if p["development_rate"] >= 82.0:
				tail += 1
	var rate: float = float(tail) / float(total)
	assert_float(rate).override_failure_message(
		"꼬리 비율 %.3f — 목표 0.03" % rate).is_between(0.015, 0.055)


## ⚠ **꼬리는 천장과 속도를 같이 받아야 한다.** 천장만 높고 속도가 평범하면
## 전성기가 끝날 때까지 못 닿는다 (실측 25~27세 +1.45/시즌, 28~30세 +0.36)
func test_the_tail_gets_both_ceiling_and_speed() -> void:
	var found: bool = false
	for t in 40:
		for p in _bulk(30, {"school_id": "SCH_%03d" % t, "team_id": "T%d" % t}):
			if p["development_rate"] >= 82.0:
				found = true
				# 천장이 평범한 무리(최대 배수 1.25)를 넘어야 한다
				assert_float(p["potential"]).is_greater(70.0 * 1.25)
	assert_bool(found).override_failure_message("꼬리가 하나도 안 나왔다").is_true()


## ⚠ **천장이 현재 능력치보다 낮으면 성장이 즉시 멈춘다.**
##
## 평범한 로스터에선 안 걸린다(천장 배수가 1.05 이상이라 늘 위다). **육성선수가
## 그 경우다** — 약하게 시작하되 클 수 있어야 해서 천장 상한을 따로 주는데,
## 그 값이 시작 능력치보다 낮게 들어올 수 있다
func test_the_ceiling_is_never_below_the_current_ovr() -> void:
	for p in _bulk(60):
		var cur: float = maxf(p["pitching"]["ovr"], p["batting"]["ovr"])
		assert_float(p["potential"]).is_greater_equal(cur)


func test_a_low_ceiling_cap_is_pulled_up_to_the_current_ovr() -> void:
	# 시작은 70대인데 천장 상한을 40으로 준 경우
	for p in _bulk(30, {"pitching_ovr_min": 70.0, "pitching_ovr_max": 78.0,
			"batting_ovr_min": 70.0, "batting_ovr_max": 78.0,
			"potential_ovr_max": 40.0}):
		var cur: float = maxf(p["pitching"]["ovr"], p["batting"]["ovr"])
		assert_float(p["potential"]).override_failure_message(
			"천장 %.1f < 현재 %.1f — 성장이 즉시 멈춘다" % [p["potential"], cur]) \
			.is_greater_equal(cur)


func test_the_ceiling_never_exceeds_ninety_nine() -> void:
	for p in _bulk(40, {"pitching_ovr_min": 90.0, "pitching_ovr_max": 99.0,
			"batting_ovr_min": 90.0, "batting_ovr_max": 99.0}):
		assert_float(p["potential"]).is_less_equal(99.0)


func test_growth_speed_stays_in_range() -> void:
	for p in _bulk(60):
		assert_float(p["development_rate"]).is_between(45.0, 95.0)


# ── 신원 ──────────────────────────────────────────────────────

## ⚠ **id가 겹치면 안 된다.** 소식과 같은 이유이고, 로스터에선 더 나쁘다 —
## 선수 하나가 두 팀에 있게 된다
func test_ids_are_unique_across_teams_and_years() -> void:
	var seen: Dictionary = {}
	for y in [2027, 2028]:
		for t in 20:
			for p in _bulk(30, {"school_id": "SCH_%03d" % t, "team_id": "T%d" % t,
					"season_year": y}):
				assert_bool(seen.has(p["id"])).override_failure_message(
					"id가 겹친다: %s" % p["id"]).is_false()
				seen[p["id"]] = true


func test_a_player_carries_where_it_belongs() -> void:
	var p: Dictionary = _bulk(1, {"team_id": "TEAM_X", "league_id": "LEAGUE_KBL"})[0]
	assert_str(p["team_id"]).is_equal("TEAM_X")
	assert_str(p["league_id"]).is_equal("LEAGUE_KBL")
	assert_str(p["career_status"]).is_equal("active")


func test_age_and_grade_come_from_the_caller() -> void:
	var p: Dictionary = _bulk(1, {"age": 19, "grade": 2})[0]
	assert_int(p["age"]).is_equal(19)
	assert_int(p["grade"]).is_equal(2)


# ── 터지지 않기 ───────────────────────────────────────────────

func test_zero_players_is_an_empty_roster() -> void:
	assert_array(_bulk(0)).is_empty()


func test_a_negative_count_is_an_empty_roster() -> void:
	assert_array(_bulk(-5)).is_empty()


func test_no_params_does_not_crash() -> void:
	assert_array(PlayerGen.roster({})).is_empty()
