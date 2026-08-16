extends GdUnitTestSuite

## 스태프 — 감독 · 코치 · 구단주. B-2b.
##
## ⚠ **04엔 스태프가 아예 없었다.** 관계도 엔진은 다섯 갈래를 다 갖고
## 검사도 다 돼 있는데 **행이 생기는 자리가 없어서** 관계가 팀동료만 돌았다.
##
## ⚠ **스태프 능력치를 읽는 곳은 `Staff` 하나다.** 02는 화면·성장·부상·시장이
## 각자 파고들어 옛 키가 세 벌 돌아다녔고 **15종 중 14종이 아무 계산에도
## 안 닿았다.**


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _world(staff: Dictionary = {}) -> Dictionary:
	return {"rosters": {}, "staff": staff}


func _person(role: String, id: String, stats: Dictionary,
		specialty: String = "") -> Dictionary:
	return {"id": id, "name": id, "role": role, "team_id": "T1",
		"league_id": "LEAGUE_KBL", "age": 50, "stats": stats,
		"specialty": specialty}


func _flat(names: Array, value: float) -> Dictionary:
	var out: Dictionary = {}
	for n in names:
		out[String(n)] = value
	return out


# ── 씀씀이 등급 ───────────────────────────────────────────────

## ⚠ **재정 등급은 팀 데이터가 정본이다.** 한동안 구단 성향에서 냈는데,
## 성향을 짓는 코드가 없어 **238팀 전부가 '안정' 하나**였다
func test_the_spending_tier_comes_from_the_team_data() -> void:
	for id in ["부유", "안정", "알뜰", "궁핍"]:
		assert_str(String(Staff.tier_of(id)["id"])).is_equal(id)


## 등급이 없는 팀은 02와 같이 '안정'으로 떨어진다
func test_a_team_without_a_grade_lands_in_the_middle() -> void:
	assert_str(String(Staff.tier_of("")["id"])).is_equal("안정")


## ⚠ **팀 데이터가 실제로 네 등급을 다 갖고 있다.** 표만 있고 데이터가
## 한 등급뿐이면 아래 검사들이 통과해도 게임에선 아무 차이가 없다 —
## 실제로 그랬다(부유 0 · 궁핍 0)
func test_the_world_actually_has_every_grade() -> void:
	var seen: Dictionary = {}
	for lid in Staff.rules().get("leagues", []):
		for t in World.teams_of(String(lid)):
			seen[String(t.get("resource", Staff.DEFAULT_RESOURCE))] = true
	for id in ["부유", "안정", "알뜰", "궁핍"]:
		assert_bool(seen.has(id)).override_failure_message(
			"'%s' 구단이 세계에 하나도 없다" % id).is_true()


## ⚠ **부유한 팀이 코치를 더 둔다.** 그게 팀 개성이 훈련 효율로 드러나는
## 유일한 경로다
func test_a_rich_club_hires_more_coaches() -> void:
	assert_int(int(Staff.tier_of("부유")["coach_min"])).is_greater(
		int(Staff.tier_of("궁핍")["coach_max"]))


# ── 세우기 ────────────────────────────────────────────────────

func _built(power: float = 3.0, resource: String = "부유",
		league: String = "LEAGUE_KBL", seed_value: int = 1) -> Array:
	return Staff.build_team("T1", league, power, resource, _rng(seed_value))


func _roles_of(staff: Array) -> Dictionary:
	var out: Dictionary = {}
	for s in staff:
		out[String(s["role"])] = int(out.get(String(s["role"]), 0)) + 1
	return out


## 감독 하나 · 구단주 하나 · 코치 여럿
func test_a_team_gets_one_manager_and_one_owner() -> void:
	var roles: Dictionary = _roles_of(_built())
	assert_int(int(roles.get(Staff.ROLE_MANAGER, 0))).is_equal(1)
	assert_int(int(roles.get(Staff.ROLE_OWNER, 0))).is_equal(1)
	assert_int(int(roles.get(Staff.ROLE_COACH, 0))).is_greater(0)


## 코치 수가 씀씀이를 탄다 — 궁핍한 팀은 없을 수도 있다
func test_the_coach_count_follows_the_spending() -> void:
	var rich: int = 0
	var poor: int = 0
	for i in range(20):
		rich += int(_roles_of(_built(3.0, "부유", "LEAGUE_KBL", i + 1)).get(
			Staff.ROLE_COACH, 0))
		poor += int(_roles_of(_built(3.0, "궁핍", "LEAGUE_KBL", i + 1)).get(
			Staff.ROLE_COACH, 0))
	assert_int(rich).override_failure_message(
		"부유 %d명 · 궁핍 %d명 — 씀씀이가 코치 수를 안 바꾼다" % [rich, poor]
	).is_greater(poor)


## ⚠ **리그가 수준을 올린다.** 고교 코치와 KBL 코치가 같으면 무대가 오르는
## 뜻이 없다
func test_a_higher_league_gets_better_staff() -> void:
	var pro: float = 0.0
	var school: float = 0.0
	for i in range(20):
		for s in _built(3.0, "부유", "LEAGUE_KBL", i + 1):
			if String(s["role"]) == Staff.ROLE_MANAGER:
				pro += float(s["stats"]["tactical_iq"])
		for s2 in _built(3.0, "부유", "LEAGUE_HIGHSCHOOL", i + 1):
			if String(s2["role"]) == Staff.ROLE_MANAGER:
				school += float(s2["stats"]["tactical_iq"])
	assert_float(pro).override_failure_message(
		"KBL 감독 %.0f · 고교 감독 %.0f — 리그가 수준을 안 올린다" % [pro, school]
	).is_greater(school)


## 전력★도 수준을 올린다
func test_a_stronger_club_gets_better_staff() -> void:
	var strong: float = 0.0
	var weak: float = 0.0
	for i in range(20):
		for s in _built(5.0, "안정", "LEAGUE_KBL", i + 1):
			if String(s["role"]) == Staff.ROLE_MANAGER:
				strong += float(s["stats"]["tactical_iq"])
		for s2 in _built(1.0, "안정", "LEAGUE_KBL", i + 1):
			if String(s2["role"]) == Staff.ROLE_MANAGER:
				weak += float(s2["stats"]["tactical_iq"])
	assert_float(strong).is_greater(weak)


## ⚠ **전력★은 중심에서 재는 값이지 절대량이 아니다.**
##
## 위 검사는 "강팀 > 약팀"만 봐서 **중심이 어긋나도 통과한다** — 실제로
## `- power_center`가 빠진 채 통과하고 있었고, 실측에서 리그 넷이 전부
## +8~+16 부풀어 있었다(고교 감독 51.3 → 60.9).
##
## ★3은 보정 0이라 감독 평균이 **리그 보정 + 능력 중심**에 붙어야 한다.
func test_a_mid_club_gets_no_power_bonus() -> void:
	var center: float = float(Staff.rules()["manager"]["stat_center"])
	var bonus: float = float(Staff.rules()["league_bonus"]["LEAGUE_HIGHSCHOOL"])
	var sum: float = 0.0
	var n: int = 0
	for i in range(120):
		for s in _built(3.0, "안정", "LEAGUE_HIGHSCHOOL", i + 1):
			if String(s["role"]) == Staff.ROLE_MANAGER:
				sum += float(s["stats"]["tactical_iq"])
				n += 1
	# 굴림이 삼각분포라 표본 120으로 ±2 안에 든다. ★3에 per_star(3)가
	# 통째로 얹히면 3점이 밀려 이 폭을 벗어난다
	assert_float(sum / float(n)).is_between(center + bonus - 2.0,
		center + bonus + 2.0)


## ★1 약팀은 **깎여야 한다** — 중심이 빠지면 여기서도 덤을 받는다
func test_a_weak_club_is_pulled_below_the_league_center() -> void:
	var center: float = float(Staff.rules()["manager"]["stat_center"])
	var bonus: float = float(Staff.rules()["league_bonus"]["LEAGUE_HIGHSCHOOL"])
	var per_star: float = float(Staff.rules()["power_per_star"])
	var sum: float = 0.0
	var n: int = 0
	for i in range(120):
		for s in _built(1.0, "안정", "LEAGUE_HIGHSCHOOL", i + 1):
			if String(s["role"]) == Staff.ROLE_MANAGER:
				sum += float(s["stats"]["tactical_iq"])
				n += 1
	assert_float(sum / float(n)).is_less(center + bonus - per_star)


## ⚠ **씀씀이가 구단주의 예산·시설에 그대로 얹힌다**
func test_a_generous_owner_has_a_bigger_budget() -> void:
	var rich: float = 0.0
	var poor: float = 0.0
	for i in range(20):
		for s in _built(3.0, "부유", "LEAGUE_KBL", i + 1):
			if String(s["role"]) == Staff.ROLE_OWNER:
				rich += float(s["stats"]["budget_support"])
		for s2 in _built(3.0, "궁핍", "LEAGUE_KBL", i + 1):
			if String(s2["role"]) == Staff.ROLE_OWNER:
				poor += float(s2["stats"]["budget_support"])
	assert_float(rich).is_greater(poor)


## 전문 분야가 그 코치의 두 능력치를 민다
func test_a_specialty_lifts_its_own_stats() -> void:
	for s in _built():
		if String(s["role"]) != Staff.ROLE_COACH:
			continue
		assert_str(String(s.get("specialty", ""))).override_failure_message(
			"코치에게 전문 분야가 없다").is_not_empty()
		return
	fail("코치가 한 명도 없다")


## ⚠ **투수 코치가 가르치는 힘이 더 세다.** 안 밀면 전문 분야가 이름표만
## 되고 어느 코치에게 배우든 같아진다 (투수는 teaching·analysis를 민다,
## 주루는 communication·discipline)
func test_a_specialty_actually_boosts_its_own_pair() -> void:
	var pitching: float = 0.0
	var running: float = 0.0
	var n_p: int = 0
	var n_r: int = 0
	for i in range(40):
		for s in _built(3.0, "부유", "LEAGUE_KBL", i + 1):
			if String(s["role"]) != Staff.ROLE_COACH:
				continue
			match String(s.get("specialty", "")):
				"투수":
					pitching += float(s["stats"]["teaching"])
					n_p += 1
				"주루":
					running += float(s["stats"]["teaching"])
					n_r += 1
	assert_int(n_p).is_greater(0)
	assert_int(n_r).is_greater(0)
	assert_float(pitching / float(n_p)).override_failure_message(
		"투수 코치 %.1f · 주루 코치 %.1f — 전문 분야가 능력치를 안 민다"
		% [pitching / float(n_p), running / float(n_r)]
	).is_greater(running / float(n_r))


## ⚠ **1~99로 보면 아무것도 안 본다.** 02는 `clamp(v, 20, 95)`로 자르는데
## 04는 1~99로 자르고 있었고, 이 검사가 1~99를 보고 있어서 통과했다.
## **규칙 파일이 정본이다** — 값을 여기 다시 적으면 둘이 된다
func test_the_stats_stay_in_range() -> void:
	var lo: float = float(Staff.rules()["stat_min"])
	var hi: float = float(Staff.rules()["stat_max"])
	for i in range(20):
		for s in _built(5.0, "부유", "LEAGUE_KBL", i + 1):
			for k in s["stats"]:
				assert_float(float(s["stats"][k])).override_failure_message(
					"%s 의 %s 가 %.1f다" % [s["role"], k, s["stats"][k]]
				).is_between(lo, hi)


## 자르는 폭이 실제로 **닿는다.** 넓혀 놓으면 이 검사가 먼저 깨진다 —
## 02와 같은 20~95인지 여기서 못 박는다
func test_the_clamp_is_actually_reached() -> void:
	var hi: float = float(Staff.rules()["stat_max"])
	var touched: bool = false
	# 명문 1군에 씀씀이 최고 — 보정이 가장 세게 얹히는 자리
	for i in range(60):
		for s in _built(5.0, "부유", "LEAGUE_KBL", i + 1):
			for k in s["stats"]:
				if is_equal_approx(float(s["stats"][k]), hi):
					touched = true
	assert_bool(touched).override_failure_message(
		"상한 %.0f에 아무도 안 닿는다 — 폭이 넓어졌나" % hi).is_true()


## ⚠ **팀마다 다른 감독이다.** 씨앗을 팀과 안 섞으면 전 구단이 같은 사람이다.
##
## **이름으로 본다.** 능력치는 전력★ 보정이 얹혀서 씨앗이 같아도 팀마다
## 달라진다 — 그걸로 재면 검사가 아무것도 안 본다
func test_each_team_gets_its_own_staff() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var names: Dictionary = {}
	var teams: int = 0
	for t in World.teams_of("LEAGUE_KBL"):
		for p in Staff.of(s["world"], String(t["id"])):
			if String(p["role"]) != Staff.ROLE_MANAGER:
				continue
			names[String(p["name"])] = true
			teams += 1
	assert_int(teams).is_greater(3)
	assert_int(names.size()).override_failure_message(
		"KBL 감독 %d명의 이름이 %d가지뿐이다 — 씨앗이 팀과 안 섞였다"
		% [teams, names.size()]).is_greater(3)


## ⚠ **해외에는 안 세운다.** 진출 전까지 안 돌리는 리그의 스태프를 매년
## 만들면 세계가 헛돈다
func test_the_overseas_leagues_get_no_staff() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	for t in World.teams_of("LEAGUE_ABL"):
		assert_array(Staff.of(s["world"], String(t["id"]))
			).override_failure_message(
			"해외 리그 %s 에 스태프가 생겼다" % t["id"]).is_empty()


## ⚠ **이미 있으면 다시 안 만든다.** 다시 만들면 관계가 쌓인 감독이
## 매번 남이 된다
func test_the_staff_is_built_only_once() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var before: Array = Staff.of(s["world"], "TEAM_HS_AEWOL")
	assert_array(before).is_not_empty()
	assert_int(Staff.ensure_world(s)).override_failure_message(
		"이미 있는데 스태프를 또 세웠다").is_equal(0)
	assert_array(Staff.of(s["world"], "TEAM_HS_AEWOL")).is_equal(before)


## ⚠ **첫날부터 감독이 있어야 한다.** 시즌이 바뀔 때만 세우면 고교 3년이
## 통째로 팀동료만 있는 세계가 된다
func test_a_new_game_already_has_staff() -> void:
	var s: Dictionary = World.new_game({"seed": 7, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	assert_array(Staff.of(s["world"], "TEAM_HS_AEWOL")).override_failure_message(
		"새 게임 첫날에 감독이 없다").is_not_empty()


# ── 능력치 → 계수 ─────────────────────────────────────────────

## ⚠ **가운데(50)가 1.0이다.** 아니면 스태프를 붙이는 순간 세계가 통째로
## 세지거나 약해진다
func test_a_neutral_stat_changes_nothing() -> void:
	assert_float(Staff.factor_of("teaching", 50.0)).is_equal_approx(1.0, 0.0001)
	assert_float(Staff.delta_of("teaching", 50.0)).is_equal_approx(0.0, 0.0001)


func test_a_better_stat_gives_a_bigger_factor() -> void:
	assert_float(Staff.factor_of("teaching", 70.0)).is_greater(
		Staff.factor_of("teaching", 30.0))


## ⚠ **끝값이 폭주하지 않게 자른다.** 능력치 0이나 99가 배수를 두 배로
## 만들면 안 된다
func test_the_factor_is_clamped() -> void:
	assert_float(Staff.factor_of("teaching", 0.0)).is_equal(
		Staff.factor_of("teaching", -500.0))
	assert_float(Staff.factor_of("teaching", 99.0)).is_less(1.2)


## 표에 없는 능력치는 아무 계수도 안 준다 — 조용히 1.0
func test_an_unlisted_stat_is_neutral() -> void:
	assert_float(Staff.factor_of("tactical_iq", 99.0)).is_equal(1.0)


# ── 팀의 15종 ─────────────────────────────────────────────────

func test_no_staff_means_neutral() -> void:
	var out: Dictionary = Staff.stats_of(_world(), "T1")
	for k in Staff.all_stat_names():
		assert_float(float(out[String(k)])).override_failure_message(
			"스태프가 없는데 %s 가 %s다" % [k, out[String(k)]]).is_equal(50.0)


func test_the_manager_stats_are_read() -> void:
	var w: Dictionary = _world({"T1": [
		_person(Staff.ROLE_MANAGER, "M1",
			_flat(Staff.stats_names(Staff.ROLE_MANAGER), 80.0))]})
	assert_float(float(Staff.stats_of(w, "T1")["motivator"])).is_equal(80.0)


## 코치는 여럿이라 **평균**이다
func test_the_coaches_are_averaged() -> void:
	var w: Dictionary = _world({"T1": [
		_person(Staff.ROLE_COACH, "C1",
			_flat(Staff.stats_names(Staff.ROLE_COACH), 40.0)),
		_person(Staff.ROLE_COACH, "C2",
			_flat(Staff.stats_names(Staff.ROLE_COACH), 60.0))]})
	assert_float(float(Staff.stats_of(w, "T1")["teaching"])).is_equal_approx(
		50.0, 0.001)


## ⚠ **내 자리의 코치를 먼저 본다.** 투수에게는 투수 코치가 정본이다
func test_the_matching_specialty_wins() -> void:
	var w: Dictionary = _world({"T1": [
		_person(Staff.ROLE_COACH, "C1",
			_flat(Staff.stats_names(Staff.ROLE_COACH), 20.0), "타격"),
		_person(Staff.ROLE_COACH, "C2",
			_flat(Staff.stats_names(Staff.ROLE_COACH), 80.0), "투수")]})
	assert_float(float(Staff.stats_of(w, "T1", "투수")["teaching"])
		).override_failure_message("투수 코치가 있는데 팀 평균을 썼다").is_equal(80.0)


## 그 분야 코치가 없으면 팀 평균으로 떨어진다
func test_a_missing_specialty_falls_back_to_the_average() -> void:
	var w: Dictionary = _world({"T1": [
		_person(Staff.ROLE_COACH, "C1",
			_flat(Staff.stats_names(Staff.ROLE_COACH), 20.0), "타격"),
		_person(Staff.ROLE_COACH, "C2",
			_flat(Staff.stats_names(Staff.ROLE_COACH), 80.0), "주루")]})
	assert_float(float(Staff.stats_of(w, "T1", "투수")["teaching"])
		).is_equal_approx(50.0, 0.001)


## ⚠ **구단주 신뢰가 코치 실효치를 민다.** 스태프를 안 믿는 구단에선 좋은
## 코치를 데려와도 덜 먹힌다 — 그게 구단주 다섯 번째 능력치의 유일한 소비처다
func test_the_owner_trust_moves_the_coaches() -> void:
	var coach: Dictionary = _flat(Staff.stats_names(Staff.ROLE_COACH), 60.0)
	var trusting: Dictionary = _world({"T1": [
		_person(Staff.ROLE_COACH, "C1", coach.duplicate()),
		_person(Staff.ROLE_OWNER, "O1",
			_flat(Staff.stats_names(Staff.ROLE_OWNER), 90.0))]})
	var cold: Dictionary = _world({"T1": [
		_person(Staff.ROLE_COACH, "C1", coach.duplicate()),
		_person(Staff.ROLE_OWNER, "O1",
			_flat(Staff.stats_names(Staff.ROLE_OWNER), 10.0))]})
	assert_float(float(Staff.stats_of(trusting, "T1")["teaching"])
		).override_failure_message(
		"구단주 신뢰가 코치에 안 걸린다 — 다섯 번째 능력치가 죽는다").is_greater(
		float(Staff.stats_of(cold, "T1")["teaching"]))


# ── 소비처 계수 ───────────────────────────────────────────────

## ⚠ **배선표를 여기 한 번만 적는다.** 소비처가 매번 "어느 능력치가 내
## 축이지"를 고르면 02처럼 15종 중 14종이 아무 데도 안 닿는다
func test_every_mod_has_a_home() -> void:
	var mods: Dictionary = Staff.mods_of(_world(), "T1")
	for k in Staff.neutral_mods():
		assert_bool(mods.has(k)).override_failure_message(
			"%s 계수가 없다" % k).is_true()
		assert_float(float(mods[k])).override_failure_message(
			"스태프가 없는데 %s 가 1.0이 아니다" % k).is_equal_approx(1.0, 0.0001)


func test_a_good_teaching_coach_raises_the_training_mod() -> void:
	var w: Dictionary = _world({"T1": [
		_person(Staff.ROLE_COACH, "C1",
			_flat(Staff.stats_names(Staff.ROLE_COACH), 90.0))]})
	assert_float(float(Staff.mods_of(w, "T1")["training"])).is_greater(1.0)


func test_a_poor_discipline_coach_lowers_the_injury_mod() -> void:
	var w: Dictionary = _world({"T1": [
		_person(Staff.ROLE_COACH, "C1",
			_flat(Staff.stats_names(Staff.ROLE_COACH), 10.0))]})
	assert_float(float(Staff.mods_of(w, "T1")["injury_prevention"])).is_less(1.0)


## 투수에겐 투수 코치, 야수에겐 타격 코치
func test_the_specialty_follows_the_player_type() -> void:
	assert_str(Staff.specialty_for("pitcher")).is_equal("투수")
	assert_str(Staff.specialty_for("batter")).is_equal("타격")


# ── 배선 ──────────────────────────────────────────────────────

## ⚠ **관계도가 스태프를 본다.** 없으면 팀동료만 돈다 — 엔진은 다섯 갈래를
## 다 갖고 있는데 행이 안 생겨서 감독·코치가 커리어 내내 안 나타났다
func test_the_relationships_include_the_staff() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var kinds: Dictionary = {}
	for row in RelationshipRunner.present_of(s):
		kinds[String(row["kind"])] = true
	assert_bool(kinds.has(Relationship.KIND_MANAGER)).override_failure_message(
		"감독이 관계도에 안 나타난다").is_true()
	assert_bool(kinds.has(Relationship.KIND_OWNER)).is_true()
	assert_bool(kinds.has(Relationship.KIND_TEAMMATE)).is_true()


## ⚠ **전문 분야가 관계 행까지 간다.** 빈 문자열로 못박으면
## `effects_of(state, 전문분야)`가 영영 아무 코치도 못 찾는다
func test_the_coach_specialty_reaches_the_relationship_row() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	RelationshipRunner.reconcile(s, 7)
	var found: bool = false
	for row in RelationshipRunner.rows_of(s):
		if String(row["kind"]) == Relationship.KIND_COACH \
				and not String(row.get("specialty", "")).is_empty():
			found = true
	assert_bool(found).override_failure_message(
		"코치 관계 행에 전문 분야가 안 실렸다 — 훈련 종목과 못 잇는다").is_true()


## ⚠ **코치가 훈련 효율에 실제로 걸린다.** 안 이으면 스태프가 장식이다.
## 중립(50)이면 더하는 값이 0이라 지금까지의 수가 그대로 남는다
func test_the_coach_reaches_the_training_efficiency() -> void:
	var w: Dictionary = _world({"T1": [
		_person(Staff.ROLE_COACH, "C1",
			_flat(Staff.stats_names(Staff.ROLE_COACH), 90.0), "투수")]})
	var good: float = float(Staff.mods_of(w, "T1", "투수")["training"]) - 1.0
	assert_float(good).override_failure_message(
		"좋은 코치가 훈련 효율을 안 올린다").is_greater(0.0)
	assert_float(float(Staff.mods_of(_world(), "T1", "투수")["training"]) - 1.0
		).override_failure_message(
		"스태프가 없는데 훈련 효율이 움직인다 — 지금까지의 수가 바뀐다"
	).is_equal_approx(0.0, 0.0001)
