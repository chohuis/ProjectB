extends GdUnitTestSuite

## 리그 무관 로스터 정리 — M6-3.
##
## 원본: `usecases/weekPhases/market.ts` · `engine-native/src/team_engine.rs`
##
## ⚠ **02에서 프로 운영이 KBL 전용이었다.** 승강·FA·트레이드가 전부
## `leagueId === "LEAGUE_KBL"`로 걸러져 있었고, 해외를 열자 ABL·JBL은
## **채우는 경로는 있는데 정리하는 경로가 없는 리그**가 됐다 —
## 실측에서 1군이 팀당 41·46명(상한 34·32)까지 부풀었다.
##
## 우리는 해외까지 매일 풀 시뮬한다(사용자 결정). 그래서 이 결함을
## 그대로 옮기면 안 된다.


func _perf(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"era": 4.5, "innings": 40.0, "ops": 0.700, "pa": 120}
	p.merge(over, true)
	return p


# ── 리그 목록 ─────────────────────────────────────────────────

func test_the_pro_leagues_are_these_three() -> void:
	assert_array(RosterMaintenance.PRO_LEAGUES) \
		.is_equal(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"])


## ⚠ **리그를 직접 적지 않는다.** 02에선 이 세 개가 여섯 군데에 적혀 있었고
## 그러면서 정작 운영은 KBL 전용이었다
func test_every_pro_league_runs_by_default() -> void:
	assert_array(RosterMaintenance.active_pro_leagues([])) \
		.is_equal(RosterMaintenance.PRO_LEAGUES)


func test_closing_a_league_takes_it_out() -> void:
	assert_array(RosterMaintenance.active_pro_leagues(["LEAGUE_ABL", "LEAGUE_JBL"])) \
		.is_equal(["LEAGUE_KBL"])


## 승강은 1군과 팜이 짝으로 돈다
func test_the_farm_comes_with_its_parent() -> void:
	assert_array(RosterMaintenance.active_pro_leagues_with_farm(["LEAGUE_ABL", "LEAGUE_JBL"])) \
		.is_equal(["LEAGUE_KBL", "LEAGUE_KBL_FARM"])


func test_a_farm_league_is_not_itself_a_pro_league() -> void:
	assert_bool(RosterMaintenance.is_pro_league("LEAGUE_KBL")).is_true()
	assert_bool(RosterMaintenance.is_pro_league("LEAGUE_KBL_FARM")).is_false()
	assert_bool(RosterMaintenance.is_pro_league("LEAGUE_HIGHSCHOOL")).is_false()


# ── 로스터 상한·하한 ──────────────────────────────────────────

## ⚠ **모든 리그에 KBL 상한을 쓰면 안 된다.** JBL은 32인데 34로 재면
## **두 명이 영영 안 잘린다**
func test_each_league_has_its_own_cap() -> void:
	assert_int(RosterMaintenance.roster_max_of("LEAGUE_KBL")).is_equal(34)
	assert_int(RosterMaintenance.roster_max_of("LEAGUE_ABL")).is_equal(34)
	assert_int(RosterMaintenance.roster_max_of("LEAGUE_JBL")).is_equal(32)


func test_the_farm_caps_are_thirty_four() -> void:
	assert_int(RosterMaintenance.roster_max_of("LEAGUE_KBL_FARM")).is_equal(34)
	assert_int(RosterMaintenance.roster_max_of("LEAGUE_ABL_FARM")).is_equal(34)
	assert_int(RosterMaintenance.roster_max_of("LEAGUE_JBL_FARM")).is_equal(34)


func test_the_pro_floors_are_twenty_six() -> void:
	for lid in RosterMaintenance.PRO_LEAGUES:
		assert_int(RosterMaintenance.roster_min_of(lid)).is_equal(26)


## ⚠ **해외 팜에 하한이 없어서 말랐다.** 1군이 매년 빨아들이기만 해서
## 실측 544 → 184가 됐다
func test_the_overseas_farms_have_a_floor() -> void:
	assert_int(RosterMaintenance.roster_min_of("LEAGUE_ABL_FARM")).is_equal(26)
	assert_int(RosterMaintenance.roster_min_of("LEAGUE_JBL_FARM")).is_equal(26)


func test_an_unknown_league_falls_back() -> void:
	assert_int(RosterMaintenance.roster_max_of("LEAGUE_NOPE")).is_equal(34)
	assert_int(RosterMaintenance.roster_min_of("LEAGUE_NOPE")).is_equal(26)


func test_no_league_has_a_floor_above_its_cap() -> void:
	for lid in RosterMaintenance.ROSTER_LIMITS.keys():
		assert_bool(RosterMaintenance.roster_min_of(lid)
			<= RosterMaintenance.roster_max_of(lid)).is_true()


# ── 성적 점수 ─────────────────────────────────────────────────

func test_a_baseline_season_scores_zero() -> void:
	assert_float(RosterMaintenance.form_score(_perf(), true)).is_equal_approx(0.0, 0.001)
	assert_float(RosterMaintenance.form_score(_perf(), false)).is_equal_approx(0.0, 0.001)


## ⚠ **원본 주석이 "기준의 절반이면 +1.0"이라 적혀 있는데 산식은 +0.5다.**
## 산식이 정본이다 — 기준 대비 비율이라 **+1.0은 자책점 0**에서만 나온다.
## 주석을 믿고 옮겼으면 승강에서 성적 가중이 두 배가 될 뻔했다
func test_the_era_scale_is_a_ratio_of_the_baseline() -> void:
	assert_float(RosterMaintenance.form_score(_perf({"era": 2.25}), true)) \
		.is_equal_approx(0.5, 0.001)
	assert_float(RosterMaintenance.form_score(_perf({"era": 0.0}), true)) \
		.is_equal_approx(1.0, 0.001)
	assert_float(RosterMaintenance.form_score(_perf({"era": 9.0}), true)) \
		.is_equal_approx(-1.0, 0.001)


## OPS 0.910이면 +0.3
func test_the_ops_scale_matches_the_measured_anchor() -> void:
	var s: float = RosterMaintenance.form_score(_perf({"ops": 0.910}), false)
	assert_float(s).is_equal_approx(0.3, 0.001)


## ⚠ **표본이 적으면 0쪽으로 당긴다.** 몇 경기 안 뛴 선수가 요행으로 1군에
## 올라오지 않게 하는 장치다 — 없으면 1이닝 무실점이 최고 성적이 된다
func test_a_small_sample_is_pulled_toward_zero() -> void:
	var full: float = RosterMaintenance.form_score(_perf({"era": 2.25, "innings": 40.0}), true)
	var half: float = RosterMaintenance.form_score(_perf({"era": 2.25, "innings": 20.0}), true)
	assert_float(half).is_equal_approx(full * 0.5, 0.001)
	# 야수도 같다
	var b_full: float = RosterMaintenance.form_score(_perf({"ops": 0.910, "pa": 120}), false)
	var b_half: float = RosterMaintenance.form_score(_perf({"ops": 0.910, "pa": 60}), false)
	assert_float(b_half).is_equal_approx(b_full * 0.5, 0.001)


func test_a_huge_sample_does_not_amplify() -> void:
	var full: float = RosterMaintenance.form_score(_perf({"era": 2.25, "innings": 40.0}), true)
	var huge: float = RosterMaintenance.form_score(_perf({"era": 2.25, "innings": 400.0}), true)
	assert_float(huge).is_equal_approx(full, 0.001)
	var b_full: float = RosterMaintenance.form_score(_perf({"ops": 0.910, "pa": 120}), false)
	var b_huge: float = RosterMaintenance.form_score(_perf({"ops": 0.910, "pa": 1200}), false)
	assert_float(b_huge).is_equal_approx(b_full, 0.001)


## ⚠ **점수가 ±1을 안 넘는다.** 안 자르면 ERA 0.00이 성적 하나로 OVR
## 30점어치를 끌어올려 능력치를 통째로 덮는다
func test_the_score_is_clamped() -> void:
	assert_float(RosterMaintenance.form_score(_perf({"era": 0.0}), true)) \
		.is_equal_approx(1.0, 0.001)
	assert_float(RosterMaintenance.form_score(_perf({"era": 99.0}), true)) \
		.is_equal_approx(-1.0, 0.001)


## 기록이 아예 없으면 0 — 판정이 능력치만 보게 된다
func test_no_record_scores_zero() -> void:
	assert_float(RosterMaintenance.form_score({}, true)).is_equal_approx(0.0, 0.001)
	assert_float(RosterMaintenance.form_score({}, false)).is_equal_approx(0.0, 0.001)
	# 좋은 성적이 붙어 있어도 표본이 0이면 0이다
	assert_float(RosterMaintenance.form_score(_perf({"era": 0.0, "innings": 0.0}), true)) \
		.is_equal_approx(0.0, 0.001)
	assert_float(RosterMaintenance.form_score(_perf({"ops": 1.200, "pa": 0}), false)) \
		.is_equal_approx(0.0, 0.001)


## ⚠ **표본이 음수로 가면 부호가 뒤집힌다** — 못 던진 선수가 올라온다.
## 망가진 입력이지만 조용히 반대로 도는 자리라 바닥을 막는다
func test_a_broken_negative_sample_does_not_flip_the_sign() -> void:
	# 자책점이 좋은데 이닝이 음수 — 점수가 +로도 −로도 가면 안 된다
	assert_float(RosterMaintenance.form_score(_perf({"era": 0.0, "innings": -40.0}), true)) \
		.is_equal_approx(0.0, 0.001)
	assert_float(RosterMaintenance.form_score(_perf({"ops": 1.200, "pa": -120}), false)) \
		.is_equal_approx(0.0, 0.001)


# ── 승강이 비교하는 값 ────────────────────────────────────────

## ⚠ **성적이 능력치를 뒤집되 완전히 무시하진 않는다** (사용자 확정).
## 가중 8은 리그 OVR 폭 30의 4분의 1이다
func test_form_can_flip_a_small_ovr_gap() -> void:
	var lesser: float = RosterMaintenance.rated(
		{"ovr": 70.0, "position": "SP", "perf": _perf({"era": 2.25})})
	var greater: float = RosterMaintenance.rated(
		{"ovr": 75.0, "position": "SP", "perf": _perf({"era": 9.0})})
	assert_bool(lesser > greater).is_true()


func test_form_cannot_flip_a_large_ovr_gap() -> void:
	var lesser: float = RosterMaintenance.rated(
		{"ovr": 60.0, "position": "SP", "perf": _perf({"era": 0.0})})
	var greater: float = RosterMaintenance.rated(
		{"ovr": 80.0, "position": "SP", "perf": _perf({"era": 99.0})})
	assert_bool(lesser < greater).is_true()


## ⚠ **투수와 야수를 가른다.** 안 가르면 야수의 OPS를 방어율로 재게 된다
func test_pitchers_and_batters_use_different_scales() -> void:
	for pos in ["SP", "RP", "CP", "P"]:
		assert_bool(RosterMaintenance.is_pitcher(pos)).is_true()
	for pos in ["C", "1B", "SS", "CF", "DH"]:
		assert_bool(RosterMaintenance.is_pitcher(pos)).is_false()


func test_a_batter_is_rated_by_ops_not_era() -> void:
	# 방어율이 아무리 나빠도 야수 판정엔 안 걸린다
	var a: float = RosterMaintenance.rated(
		{"ovr": 70.0, "position": "C", "perf": _perf({"era": 99.0})})
	assert_float(a).is_equal_approx(70.0, 0.001)


# ── 장기 부진 ─────────────────────────────────────────────────

## −0.5 아래면 장기 부진 — 상시 콜업 트리거이자 교체 압력이다
func test_a_slump_is_below_minus_half() -> void:
	assert_bool(RosterMaintenance.is_slumping(-0.51)).is_true()
	assert_bool(RosterMaintenance.is_slumping(-0.50)).is_false()
	assert_bool(RosterMaintenance.is_slumping(0.0)).is_false()


# ── 충원할 자리 ───────────────────────────────────────────────

## ⚠ **포지션 공백만 보면 야수 총원이 빈다.** 실측 고교 102팀 전부가
## 어느 해엔가 포지션 공백이었고 포수 0명이 31팀이었다
func test_a_missing_position_is_needed() -> void:
	var roster: Array = [{"position": "SP"}, {"position": "SP"}, {"position": "1B"}]
	var need: Array = RosterMaintenance.needed_positions(roster, {"C": 1, "SP": 2, "1B": 1})
	assert_array(need).contains(["C"])
	assert_array(need).not_contains(["SP", "1B"])


func test_a_short_position_is_needed_even_if_present() -> void:
	var roster: Array = [{"position": "SP"}]
	var need: Array = RosterMaintenance.needed_positions(roster, {"SP": 5})
	assert_array(need).contains(["SP"])


func test_a_full_roster_needs_nothing() -> void:
	var roster: Array = [{"position": "C"}, {"position": "SP"}, {"position": "SP"}]
	assert_array(RosterMaintenance.needed_positions(roster, {"C": 1, "SP": 2})).is_empty()


## ⚠ **부족한 순서로 준다.** 한 명만 채울 수 있을 때 제일 빈 자리부터
## 채워야 한다 — 순서가 없으면 사전 순으로 채워서 포수 0명이 안 고쳐진다
func test_the_emptiest_slot_comes_first() -> void:
	var roster: Array = [{"position": "SP"}]
	# SP는 4명 모자라고 C는 1명 모자라다
	var need: Array = RosterMaintenance.needed_positions(roster, {"C": 1, "SP": 5})
	assert_str(need[0]).is_equal("SP")


# ── 팜 구성 하한 ──────────────────────────────────────────────

## ⚠ **2군 하한은 1군에서 파생하면 안 된다.** `rosterMin × 보직비율 − 여유2`로
## 뽑으면 9/12가 나오는데, 12로 올렸더니 공백 충원이 막혀 **KBL 1군 최소
## 야수가 12 → 7이 됐다**. 2군은 공급 풀이라 잣대가 다르다.
##
## 근거는 "2군도 경기를 치른다" — 선발 5인 + 불펜 3 = 8, 야수는 타순
## 한 바퀴 = 9
func test_the_farm_floors_are_measured_not_derived() -> void:
	assert_int(RosterMaintenance.FARM_MIN_PITCHERS).is_equal(8)
	assert_int(RosterMaintenance.FARM_MIN_BATTERS).is_equal(9)


func test_a_thin_farm_blocks_the_calldown() -> void:
	var farm: Array = []
	for i in 8:
		farm.append({"position": "SP"})
	for i in 9:
		farm.append({"position": "C"})
	assert_bool(RosterMaintenance.farm_can_send_up(farm, "SP")).is_false()
	assert_bool(RosterMaintenance.farm_can_send_up(farm, "C")).is_false()

	farm.append({"position": "SP"})
	assert_bool(RosterMaintenance.farm_can_send_up(farm, "SP")).is_true()
	assert_bool(RosterMaintenance.farm_can_send_up(farm, "C")).is_false()
