extends GdUnitTestSuite

## 팀 성향 초기화 — F-3. **축 열둘 중 아홉이 영원히 50이었다.**
##
## `TeamProfile.update_all`은 둘만 갱신한다(`win_now_pressure` ·
## `scouting_quality`). 나머지 열은 채우는 곳이 없어서 `of()`가 늘 중립을
## 준다 — **모든 팀이 똑같았다.** FA·승강·방출·은퇴가 전부 그 값을 읽는다.
##
## ⚠ **02의 팀과 04의 팀이 같지 않다.** 실측:
##
##   ABL 16 — 02와 id가 전부 같다        → 02 값을 그대로 가져온다
##   KBL 10 — 대응 0. `power`·`resource`가 있다 → 파생한다
##   JBL 12 — 대응 0. 축이 하나도 없다   → 시드로 흩는다
##
## ⚠ **파생 규칙을 지어내지 않았다.** 02 ABL 16팀에서 쟀다 — prestige
## 하나가 일곱 축을 거의 결정한다(|r| 0.96~0.99). 나머지 넷은 팀 세기와
## 무관한 좁은 띠다(표준편차 3~5).


func _world() -> Dictionary:
	return World.build({"seed": 4242, "season_year": 2027})


# ── 02에서 그대로 온 것 (ABL) ─────────────────────────────────

## ⚠ **02 값을 그대로 쓴다.** 04에서 새로 정하면 "어느 구단이 지갑을
## 여는가"가 02와 다른 게임이 된다
func test_the_abl_profiles_come_from_the_original() -> void:
	var w: Dictionary = _world()
	var ny: Dictionary = TeamProfile.of(w, "TEAM_ABL_EMPIRE_1")
	# 02 `PKT`/`pro_usa/New York Empire`의 teamProfile 그대로
	assert_float(float(ny["owner_spending_willingness"])).is_equal(90.0)
	assert_float(float(ny["prestige"])).is_equal(88.0)
	assert_float(float(ny["development_focus"])).is_equal(30.0)
	assert_float(float(ny["owner_patience"])).is_equal(38.0)

	var sd: Dictionary = TeamProfile.of(w, "TEAM_ABL_COASTALRAYS_1")
	assert_float(float(sd["owner_spending_willingness"])).is_equal(35.0)
	assert_float(float(sd["development_focus"])).is_equal(74.0)


func test_every_abl_team_has_a_profile() -> void:
	var w: Dictionary = _world()
	for t in World.teams_of("LEAGUE_ABL"):
		var id: String = String(t["id"])
		assert_bool(TeamProfile.data().has(id)).override_failure_message(
			"%s 성향이 02 데이터에 없다" % id).is_true()


# ── 아무 팀도 중립 한 벌로 남지 않는다 ────────────────────────

## ⚠ **이게 F-3의 요점이다.** 열둘 중 아홉이 50으로 굳어 있으면 모든 팀이
## 똑같이 움직인다 — FA도 승강도 방출도
func test_no_pro_team_is_left_neutral() -> void:
	var w: Dictionary = _world()
	for lid in TeamProfile.PRO_LEAGUES:
		for t in World.teams_of(lid):
			var id: String = String(t["id"])
			var p: Dictionary = TeamProfile.of(w, id)
			var same: int = 0
			for k in TeamProfile.DEFAULT:
				if is_equal_approx(float(p[k]), float(TeamProfile.DEFAULT[k])):
					same += 1
			assert_int(same).override_failure_message(
				"%s가 열두 축 중 %d개나 중립 그대로다" % [id, same]).is_less(9)


## ⚠ **2군도 채운다.** 안 채우면 승강 판정이 1군과 2군에서 다르게 움직인다
func test_the_farm_teams_get_a_profile_too() -> void:
	var w: Dictionary = _world()
	var first: Dictionary = TeamProfile.of(w, "TEAM_KBL_SEOUL_ROYALS_1")
	var farm: Dictionary = TeamProfile.of(w, "TEAM_KBL_SEOUL_ROYALS_2")
	assert_float(float(farm["prestige"])).override_failure_message(
		"2군 성향이 중립 그대로다").is_not_equal(50.0)
	# 같은 구단이므로 같은 성향이다 — 갈리면 어느 쪽이 맞는지 알 수 없다
	assert_float(float(farm["prestige"])).is_equal(float(first["prestige"]))


# ── KBL: `power`·`resource`에서 파생 ──────────────────────────

## ⚠ **파생 규칙은 02 ABL 16팀에서 잰 것이다.** 여기 숫자를 04에서 새로
## 정하면 근거가 사라진다
func test_the_derived_axes_follow_the_measured_slopes() -> void:
	var strong: Dictionary = TeamProfile.derive(5, "부유")
	var weak: Dictionary = TeamProfile.derive(2, "알뜰")

	# 02: prestige가 높을수록 spending·win_now·scouting·medical·market이 높다
	assert_float(float(strong["prestige"])).is_greater(float(weak["prestige"]))
	for k in ["owner_spending_willingness", "win_now_pressure",
			"scouting_quality", "medical_quality", "market_appeal"]:
		assert_float(float(strong[k])).override_failure_message(
			"%s가 강팀에서 더 낮다 — 02에서 잰 방향과 반대다" % k
			).is_greater(float(weak[k]))

	# 02: 반대로 육성·인내는 약팀이 높다
	for k in ["development_focus", "owner_patience"]:
		assert_float(float(strong[k])).override_failure_message(
			"%s가 강팀에서 더 높다 — 02에서 잰 방향과 반대다" % k
			).is_less(float(weak[k]))


## ⚠ **좁은 띠 넷은 팀 세기와 무관하다.** 02 24팀에서 표준편차가 3~5이고
## prestige 상관이 0.10~0.76이다 — 세기에 따라 흔들면 없는 구조를 만든다
func test_the_flat_axes_do_not_track_team_strength() -> void:
	var strong: Dictionary = TeamProfile.derive(5, "부유")
	var weak: Dictionary = TeamProfile.derive(2, "궁핍")
	for k in ["stability", "discipline", "clubhouse_culture", "farm_investment"]:
		assert_float(float(strong[k])).override_failure_message(
			"%s가 팀 세기를 따라간다 — 02에선 안 그렇다" % k
			).is_equal(float(weak[k]))


## ⚠ **지갑은 `resource`가 정한다.** 02 `budgetTier`가 그 축의 원천이다
## (small 36.5 · mid 56.4 · large 79.5)
func test_the_wallet_comes_from_the_resource_grade() -> void:
	var rich: Dictionary = TeamProfile.derive(3, "부유")
	var mid: Dictionary = TeamProfile.derive(3, "안정")
	var poor: Dictionary = TeamProfile.derive(3, "알뜰")
	assert_float(float(rich["owner_spending_willingness"])).is_greater(
		float(mid["owner_spending_willingness"]))
	assert_float(float(mid["owner_spending_willingness"])).is_greater(
		float(poor["owner_spending_willingness"]))


## 모든 축이 0~99 안에 있다 — 넘치면 판정이 뒤집힌다
func test_every_derived_axis_stays_in_range() -> void:
	for power in [1, 2, 3, 4, 5]:
		for res in ["궁핍", "알뜰", "안정", "부유"]:
			var p: Dictionary = TeamProfile.derive(power, res)
			for k in TeamProfile.DEFAULT:
				var v: float = float(p[k])
				assert_float(v).override_failure_message(
					"power %d · %s 의 %s가 %f다" % [power, res, k, v]
					).is_between(0.0, 99.0)


# ── JBL: 축이 하나도 없다 ─────────────────────────────────────

## ⚠ **JBL은 `power`도 `resource`도 없고 02에 리그 자체가 없다.**
## 전부 중립으로 두면 12팀이 구분이 안 돼 FA·승강·방출이 똑같이 움직인다.
## **02가 만든 prestige 분포(36~88)를 시드로 흩는다** — 값을 정하는 게
## 아니라 02의 분포를 쓰는 것이다
func test_the_jbl_teams_are_spread_not_flat() -> void:
	var w: Dictionary = _world()
	var seen: Dictionary = {}
	for t in World.teams_of("LEAGUE_JBL"):
		seen[roundi(float(TeamProfile.of(w, String(t["id"]))["prestige"]))] = true
	assert_int(seen.size()).override_failure_message(
		"JBL 12팀의 prestige가 %d 가지뿐이다 — 팀이 구분되지 않는다"
			% seen.size()).is_greater(3)


## ⚠ **같은 시드면 같은 세계다.** 흩는 데 `randf()`를 쓰면 새 게임마다
## 다른 리그가 되고, 그러면 회귀를 못 잡는다
func test_the_spread_is_reproducible() -> void:
	var a: Dictionary = World.build({"seed": 777, "season_year": 2027})
	var b: Dictionary = World.build({"seed": 777, "season_year": 2027})
	for t in World.teams_of("LEAGUE_JBL"):
		var id: String = String(t["id"])
		assert_float(float(TeamProfile.of(a, id)["prestige"])).override_failure_message(
			"%s 성향이 같은 시드에서 달라졌다" % id).is_equal(
			float(TeamProfile.of(b, id)["prestige"]))


func test_a_different_seed_gives_a_different_league() -> void:
	var a: Dictionary = World.build({"seed": 111, "season_year": 2027})
	var b: Dictionary = World.build({"seed": 222, "season_year": 2027})
	var differ: int = 0
	for t in World.teams_of("LEAGUE_JBL"):
		var id: String = String(t["id"])
		if not is_equal_approx(float(TeamProfile.of(a, id)["prestige"]),
				float(TeamProfile.of(b, id)["prestige"])):
			differ += 1
	assert_int(differ).override_failure_message(
		"시드를 바꿔도 JBL이 그대로다 — 흩는 게 시드를 안 본다").is_greater(0)


# ── 학교·독립엔 구단이 없다 ───────────────────────────────────

## ⚠ **프로만이다.** 고교에 구단주 성향을 붙이면 없는 것을 만드는 것이다
func test_school_teams_get_no_profile() -> void:
	var w: Dictionary = _world()
	assert_bool(w.get(TeamProfile.KEY, {}).has("TEAM_HS_AEWOL")).override_failure_message(
		"고교 팀에 구단 성향이 붙었다").is_false()


# ── 이게 눌려 있으면 무엇을 잃나 ──────────────────────────────

## ⚠ **02가 여기서 트레이드를 잃었다.** buyer 조건이 "순위 상위 30% 안 ·
## 성적압박 > 60"인데 **모두가 정확히 50이라 buyer가 구조적으로 0팀**이었다.
## seller만 남으면 거래 상대가 없다. 02 실측 트레이드 수: 9 → 8 → 2 → 1 → 1 → 0.
##
## 04도 초기화가 없어 같은 상태였다 — **순위와 무관하게 아무도 문턱을 못 넘었다**
func test_some_teams_can_clear_the_buyer_threshold() -> void:
	var w: Dictionary = _world()
	for lid in TeamProfile.PRO_LEAGUES:
		var high: int = 0
		var teams: Array = World.teams_of(lid)
		for t in teams:
			if float(TeamProfile.of(w, String(t["id"]))["win_now_pressure"]) \
					> TeamProfile.BUYER_PRESSURE:
				high += 1
		assert_int(high).override_failure_message(
			"%s에서 성적압박이 문턱(%d)을 넘는 팀이 0이다 — buyer가 안 생기고 트레이드가 사라진다"
				% [lid, TeamProfile.BUYER_PRESSURE]).is_greater(0)


## 반대쪽도 있어야 한다 — 전부 buyer면 파는 팀이 없다
func test_some_teams_stay_below_the_buyer_threshold() -> void:
	var w: Dictionary = _world()
	for lid in TeamProfile.PRO_LEAGUES:
		var low: int = 0
		for t in World.teams_of(lid):
			if float(TeamProfile.of(w, String(t["id"]))["win_now_pressure"]) \
					<= TeamProfile.BUYER_PRESSURE:
				low += 1
		assert_int(low).override_failure_message(
			"%s가 전부 buyer다 — 파는 팀이 없다" % lid).is_greater(0)


## ⚠ **FA 입찰도 같은 프로필을 읽는다.** `fa_runner.gd:105`가
## `owner_spending_willingness`를 예산 지수로 쓴다 — 전부 50이면 모든
## 팀이 똑같은 금액을 부르고 FA가 무의미해진다
func test_the_fa_budget_index_actually_varies() -> void:
	var w: Dictionary = _world()
	var seen: Dictionary = {}
	for lid in TeamProfile.PRO_LEAGUES:
		for t in World.teams_of(lid):
			seen[roundi(float(TeamProfile.of(w, String(t["id"]))
				["owner_spending_willingness"]))] = true
	assert_int(seen.size()).override_failure_message(
		"프로 전체의 지갑이 %d 가지뿐이다 — FA에서 모든 팀이 같은 값을 부른다"
			% seen.size()).is_greater(3)


## ⚠ **초기화 전에는 buyer가 구조적으로 0팀이었다.** 중립 세계에서 세어
## 보면 확인된다 — 문턱이 60인데 모두 정확히 50이라 **순위가 어떻든 아무도
## 못 넘는다.** 이게 02에서 트레이드가 0으로 죽은 이유고, 04도 초기화가
## 없어 같은 상태였다.
##
## ⚠ **`update_all`로는 안 풀린다.** 하위권은 압박이 +8/시즌으로 오르지만
## 그 팀은 상위 30%에 못 들고, 상위권은 우승 −20 / 2위 −5로 더 내려간다
func test_a_neutral_world_has_no_buyers_at_all() -> void:
	var neutral: Dictionary = {}
	for lid in TeamProfile.PRO_LEAGUES:
		var teams: Array = World.teams_of(lid)
		for i in teams.size():
			assert_bool(TeamProfile.is_buyer(neutral,
				String(teams[i]["id"]), i + 1, teams.size())
				).override_failure_message(
				"중립 세계에서 %s가 buyer다 — 그럼 이 검사가 아무것도 안 본다"
					% teams[i]["id"]).is_false()


## 초기화한 세계에서는 순위 1위 팀 중 buyer가 실제로 나온다
func test_an_initialised_world_produces_real_buyers() -> void:
	var w: Dictionary = _world()
	var buyers: int = 0
	for lid in TeamProfile.PRO_LEAGUES:
		var teams: Array = World.teams_of(lid)
		for i in teams.size():
			if TeamProfile.is_buyer(w, String(teams[i]["id"]), i + 1, teams.size()):
				buyers += 1
	assert_int(buyers).override_failure_message(
		"프로 세 리그를 통틀어 buyer가 0팀이다 — 트레이드가 사라진다").is_greater(0)
