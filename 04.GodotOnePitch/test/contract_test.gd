extends GdUnitTestSuite

## 연봉·계약연수·프로 연차 — M9-11.
##
## ⚠ **FA가 이 셋을 입력으로 쓴다.** 등급은 리그 연봉 순위 백분위로 갈리고
## 자격은 프로 연차로 갈린다 — 둘 다 없으면 FA 시장이 아예 못 선다.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _player(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "P1", "player_type": "pitcher", "age": 26,
		"league_id": "LEAGUE_KBL",
		"pitching": {"ovr": 70.0}, "batting": {"ovr": 40.0},
	}
	p.merge(over, true)
	return p


# ── 규칙 파일 ─────────────────────────────────────────────────

## ⚠ **규칙이 안 실리면 전원이 최저연봉이다.** 그러면 FA 등급이 통째로
## 한 칸에 몰린다
func test_the_rules_are_loaded() -> void:
	var r: Dictionary = Contract.rules()
	assert_bool(r.is_empty()).override_failure_message("연봉 규칙이 비었다").is_false()
	assert_int(r["service"].size()).is_equal(4)
	assert_float(float(r["ovr_base"])).is_equal(3000.0)
	# 리그별 배수와 최저연봉이 같은 리그 목록을 덮는다 — 한쪽만 있으면
	# 그 리그가 바닥 없이 떨어지거나 배수 없이 뜬다
	for lid in r["league_mult"]:
		assert_bool(r["min_salary"].has(lid)).override_failure_message(
			"%s에 최저연봉이 없다" % lid).is_true()


# ── 입단 나이 ─────────────────────────────────────────────────

## ⚠ **입단 경로를 먼저 뽑고 연차를 역산한다.** 연차를 균등하게 뽑으면
## 입단 나이가 중간값에 몰려 출신 분포가 뒤집힌다 — 02에서 실제로
## 대졸 57% / 고졸 28%가 나왔다(KBO는 반대다)
func test_high_school_is_the_common_route() -> void:
	var counts: Dictionary = {}
	var rng := _rng(7)
	for i in 4000:
		var a: int = Contract.entry_age(rng.randf(), rng.randf())
		counts[a] = int(counts.get(a, 0)) + 1

	var hs: int = int(counts.get(Contract.ENTRY_HS_AGE, 0))
	var univ: int = int(counts.get(Contract.ENTRY_UNIV_AGE, 0))
	assert_int(hs).override_failure_message(
		"고졸 %d · 대졸 %d — KBO는 고졸이 더 많다" % [hs, univ]).is_greater(univ)
	# 비중이 55:30이므로 대략 그 근처여야 한다
	assert_float(float(hs) / 4000.0).is_between(0.50, 0.60)
	assert_float(float(univ) / 4000.0).is_between(0.25, 0.35)


func test_the_independent_route_spreads():
	var seen: Dictionary = {}
	var rng := _rng(11)
	for i in 3000:
		seen[Contract.entry_age(rng.randf(), rng.randf())] = true
	for age in range(Contract.ENTRY_INDIE_MIN, Contract.ENTRY_INDIE_MAX + 1):
		assert_bool(seen.has(age)).override_failure_message(
			"독립 입단 %d세가 한 번도 안 나왔다" % age).is_true()


## ⚠ **연차가 음수면 안 된다.** 02는 `rand(0, age-20)`이라 37세 0년차가
## 나왔고, 여기서는 반대로 스물 이전 입단이 음수를 만든다
func test_service_years_never_go_negative() -> void:
	var rng := _rng(3)
	for i in 200:
		assert_int(Contract.service_years(19, rng.randf(), rng.randf())).is_greater_equal(0)


func test_older_players_have_more_service() -> void:
	assert_int(Contract.service_years(35, 0.0, 0.0)).is_greater(
		Contract.service_years(25, 0.0, 0.0))


# ── 연봉 ──────────────────────────────────────────────────────

func test_the_service_bands_match_the_table() -> void:
	assert_float(Contract.service_factor(1)).is_equal(0.4)
	assert_float(Contract.service_factor(2)).is_equal(0.4)
	assert_float(Contract.service_factor(3)).is_equal(0.7)
	assert_float(Contract.service_factor(6)).is_equal(0.7)
	assert_float(Contract.service_factor(7)).is_equal(1.0)
	assert_float(Contract.service_factor(12)).is_equal(1.1)


## ⚠ **OVR 곡선이 선형이 아니다.** 선형이면 리그 연봉 순위 백분위가
## 밋밋해져서 FA 등급이 사실상 무작위가 된다
func test_the_salary_curve_is_steep() -> void:
	# ⚠ **최저연봉 바닥 위에서 재야 한다.** 아래쪽이 바닥에 눌리면 선형도
	# 볼록해 보인다 — 처음에 50/70/90으로 재서 변이가 안 잡혔다
	var low: int = int(Contract.estimate(60.0, "LEAGUE_KBL", 8, 27, 1.0, _rng(1))["salary"])
	var mid: int = int(Contract.estimate(75.0, "LEAGUE_KBL", 8, 27, 1.0, _rng(1))["salary"])
	var high: int = int(Contract.estimate(90.0, "LEAGUE_KBL", 8, 27, 1.0, _rng(1))["salary"])
	assert_int(low).override_failure_message("바닥에 눌렸다").is_greater(3000)
	assert_int(mid).is_greater(low)
	assert_int(high).is_greater(mid)
	# 같은 간격(15)인데 위쪽 차이가 훨씬 커야 지수 곡선이다.
	# 선형이면 두 차이가 같다
	assert_int(high - mid).override_failure_message(
		"연봉 곡선이 선형이다 (%d → %d → %d)" % [low, mid, high]) \
		.is_greater((mid - low) * 2)


func test_service_and_age_move_the_salary() -> void:
	var rookie: int = int(Contract.estimate(70.0, "LEAGUE_KBL", 1, 21, 1.0, _rng(1))["salary"])
	var veteran: int = int(Contract.estimate(70.0, "LEAGUE_KBL", 8, 28, 1.0, _rng(1))["salary"])
	assert_int(veteran).override_failure_message(
		"연차가 연봉을 안 가른다").is_greater(rookie)

	# 노장은 깎인다
	assert_int(int(Contract.estimate(70.0, "LEAGUE_KBL", 12, 40, 1.0, _rng(1))["salary"])) \
		.override_failure_message("마흔인데 안 깎인다") \
		.is_less(int(Contract.estimate(70.0, "LEAGUE_KBL", 12, 30, 1.0, _rng(1))["salary"]))


## ⚠ **깎임에 하한(0.45)이 있다.** 없으면 나이가 많을 때 계수가 **음수**가
## 되고, 최저연봉 바닥이 그걸 삼켜서 특급 노장이 신인과 같은 연봉을 받는다
func test_the_aging_cut_has_a_floor() -> void:
	var old_star: int = int(Contract.estimate(90.0, "LEAGUE_KBL", 12, 55, 1.0,
		_rng(1))["salary"])
	assert_int(old_star).override_failure_message(
		"55세 특급이 최저연봉이다 — 깎임 계수가 음수로 갔다").is_greater(3000)
	# 그래도 전성기보다는 적다
	assert_int(old_star).is_less(
		int(Contract.estimate(90.0, "LEAGUE_KBL", 12, 28, 1.0, _rng(1))["salary"]))


func test_rich_teams_pay_more() -> void:
	assert_int(int(Contract.estimate(70.0, "LEAGUE_KBL", 8, 27, 1.35, _rng(1))["salary"])) \
		.is_greater(int(Contract.estimate(70.0, "LEAGUE_KBL", 8, 27, 0.8, _rng(1))["salary"]))
	# 범위 밖은 잘린다 — 없으면 예산 지수 하나가 리그를 망친다
	assert_int(int(Contract.estimate(70.0, "LEAGUE_KBL", 8, 27, 99.0, _rng(1))["salary"])) \
		.is_equal(int(Contract.estimate(70.0, "LEAGUE_KBL", 8, 27, 1.35, _rng(1))["salary"]))


## 리그마다 시장 규모가 다르다 — ABL이 제일 크다
func test_the_league_sets_the_scale() -> void:
	var kbl: int = int(Contract.estimate(70.0, "LEAGUE_KBL", 8, 27, 1.0, _rng(1))["salary"])
	var abl: int = int(Contract.estimate(70.0, "LEAGUE_ABL", 8, 27, 1.0, _rng(1))["salary"])
	var farm: int = int(Contract.estimate(70.0, "LEAGUE_KBL_FARM", 8, 27, 1.0, _rng(1))["salary"])
	assert_int(abl).is_greater(kbl)
	assert_int(kbl).is_greater(farm)


## ⚠ **최저연봉이 바닥이다.** 없으면 저능력 선수의 연봉이 0에 붙고,
## 연봉 순위 백분위가 아래쪽에서 뭉친다
func test_the_minimum_salary_is_a_floor() -> void:
	assert_int(int(Contract.estimate(20.0, "LEAGUE_KBL", 1, 20, 0.8, _rng(1))["salary"])) \
		.is_greater_equal(3000)


func test_better_players_get_longer_deals() -> void:
	var short_deals: int = 0
	var long_deals: int = 0
	for i in 40:
		short_deals += int(Contract.estimate(50.0, "LEAGUE_KBL", 3, 25, 1.0, _rng(i))["years"])
		long_deals += int(Contract.estimate(80.0, "LEAGUE_KBL", 3, 25, 1.0, _rng(i))["years"])
	assert_int(long_deals).override_failure_message(
		"능력이 계약 연수를 안 가른다").is_greater(short_deals)


# ── 선수에 붙이기 ─────────────────────────────────────────────

func test_it_attaches_a_contract() -> void:
	var p: Dictionary = _player()
	assert_bool(Contract.ensure(p, _rng(1))).is_true()
	assert_int(int(p["salary"])).is_greater(0)
	assert_int(int(p["contract_years"])).is_greater(0)
	assert_int(int(p["pro_service_years"])).is_greater_equal(0)


## ⚠ **연차를 연봉보다 먼저 정한다** — 연차가 연봉의 입력이다.
##
## 스물하나는 연차 0~1(계수 0.4)이고 마흔은 13년 이상(1.1)이다. 마흔은
## 나이 깎임(0.64)을 맞고도 **더 받아야 한다** — 연차를 안 태우면 뒤집힌다
func test_the_service_years_reach_the_salary() -> void:
	var young: Dictionary = _player({"age": 21})
	var old: Dictionary = _player({"age": 40})
	Contract.ensure(young, _rng(4))
	Contract.ensure(old, _rng(4))

	assert_int(int(young["pro_service_years"])).is_less_equal(2)
	assert_int(int(old["pro_service_years"])).is_greater_equal(12)
	assert_int(int(old["salary"])).override_failure_message(
		"마흔(%d)이 스물하나(%d)보다 적게 받는다 — 연차가 연봉에 안 닿았다"
		% [int(old["salary"]), int(young["salary"])]).is_greater(int(young["salary"]))


## 학교엔 계약이 없다 — 붙이면 고교생이 연봉을 받는다
func test_school_players_get_nothing() -> void:
	var p: Dictionary = _player({"league_id": "LEAGUE_HIGHSCHOOL"})
	assert_bool(Contract.ensure(p, _rng(1))).is_false()
	assert_bool(p.has("salary")).is_false()


## 이미 있으면 안 덮는다 — 덮으면 해마다 연봉이 초기화된다
func test_it_does_not_overwrite() -> void:
	var p: Dictionary = _player({"salary": 12345})
	assert_bool(Contract.ensure(p, _rng(1))).is_false()
	assert_int(int(p["salary"])).is_equal(12345)


## 투수는 투구 OVR, 야수는 타격 OVR을 본다 — 뒤바뀌면 야수 연봉이
## 투구 능력으로 정해진다
func test_it_reads_the_right_ovr() -> void:
	var bat: Dictionary = _player({"player_type": "batter",
		"pitching": {"ovr": 20.0}, "batting": {"ovr": 85.0}})
	assert_float(Contract.core_ovr(bat)).is_equal(85.0)
	assert_float(Contract.core_ovr(_player())).is_equal(70.0)


func test_the_world_gets_contracts() -> void:
	var s: Dictionary = World.new_game({"seed": 5, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var n: int = Contract.ensure_world(s)
	assert_int(n).override_failure_message("아무도 계약을 못 받았다").is_greater(1000)

	var salaries: Dictionary = {}
	var school: int = 0
	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			if p.has("salary"):
				salaries[int(p["salary"])] = true
			elif String(p.get("league_id", "")) == "LEAGUE_HIGHSCHOOL":
				school += 1
	assert_int(salaries.size()).override_failure_message(
		"연봉이 %d종류뿐이다 — 팀마다 같은 표를 쓴 것이다" % salaries.size()).is_greater(500)
	assert_int(school).override_failure_message("고교생이 연봉을 받았다").is_greater(0)


## ⚠ **씨앗을 팀과 섞는다.** 하나로 두면 **같은 로스터를 가진 두 팀이 글자
## 하나까지 같은 연봉표**를 갖는다 — 세계가 복사판처럼 보인다
func test_two_teams_do_not_share_one_salary_table() -> void:
	var a: Array = []
	var b: Array = []
	for i in 20:
		var base: Dictionary = {"player_type": "pitcher", "age": 27,
			"league_id": "LEAGUE_KBL", "pitching": {"ovr": 60.0 + float(i)},
			"batting": {"ovr": 40.0}}
		var pa: Dictionary = base.duplicate(true)
		pa["id"] = "A%d" % i
		pa["team_id"] = "TEAM_A"
		var pb: Dictionary = base.duplicate(true)
		pb["id"] = "B%d" % i
		pb["team_id"] = "TEAM_B"
		a.append(pa)
		b.append(pb)

	Contract.ensure_world({"seed": 1, "world": {"rosters": {"TEAM_A": a, "TEAM_B": b}}})

	var same: int = 0
	for i in 20:
		if int(a[i]["salary"]) == int(b[i]["salary"]):
			same += 1
	assert_int(same).override_failure_message(
		"같은 로스터의 두 팀이 20명 중 %d명 연봉이 똑같다 — 씨앗이 하나다" % same) \
		.is_less(5)


## 두 번 불러도 안 늘어난다 — 늘면 해마다 연봉이 다시 뽑힌다
func test_running_it_twice_changes_nothing() -> void:
	var s: Dictionary = World.new_game({"seed": 5, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	Contract.ensure_world(s)
	assert_int(Contract.ensure_world(s)).is_equal(0)


# ── 해가 바뀔 때 ──────────────────────────────────────────────

## ⚠ **계약이 안 줄면 아무도 FA가 안 된다.** 시장이 영영 비어 있다
func test_a_year_burns_a_contract_year() -> void:
	var p: Dictionary = _player({"salary": 5000, "contract_years": 2,
		"pro_service_years": 4})
	Contract.advance_year([p])
	assert_int(int(p["contract_years"])).is_equal(1)
	assert_int(int(p["pro_service_years"])).is_equal(5)

	Contract.advance_year([p])
	assert_int(int(p["contract_years"])).is_equal(0)
	# 0 아래로는 안 간다 — 음수면 판정이 이상해진다
	Contract.advance_year([p])
	assert_int(int(p["contract_years"])).is_equal(0)


func test_players_without_a_contract_are_skipped() -> void:
	var p: Dictionary = _player({"league_id": "LEAGUE_HIGHSCHOOL"})
	assert_int(Contract.advance_year([p])).is_equal(0)
	assert_bool(p.has("pro_service_years")).is_false()


# ── FA 자격 ───────────────────────────────────────────────────

## ⚠ **계약이 남아 있으면 FA가 아니다.** 연차만 보면 계약 중인 선수가
## 매년 시장에 나온다
func test_a_running_contract_blocks_fa() -> void:
	assert_bool(Contract.is_fa_eligible(_player({"salary": 5000,
		"contract_years": 2, "pro_service_years": 9}))).is_false()


func test_enough_service_and_a_finished_contract_makes_an_fa() -> void:
	assert_bool(Contract.is_fa_eligible(_player({"salary": 5000,
		"contract_years": 0, "pro_service_years": 5}))).is_true()
	# KBL은 5년이다 — 4년이면 아직 아니다
	assert_bool(Contract.is_fa_eligible(_player({"salary": 5000,
		"contract_years": 0, "pro_service_years": 4}))).is_false()


## 리그마다 자격 연수가 다르다 — JBL 4 · KBL 5 · ABL 6
func test_the_league_sets_the_fa_bar() -> void:
	assert_bool(Contract.is_fa_eligible(_player({"league_id": "LEAGUE_JBL",
		"salary": 5000, "contract_years": 0, "pro_service_years": 4}))).is_true()
	assert_bool(Contract.is_fa_eligible(_player({"league_id": "LEAGUE_ABL",
		"salary": 5000, "contract_years": 0, "pro_service_years": 5}))).is_false()


## ⚠ **계약이 없는 사람은 FA가 아니다.** 없는 사람은 `contract_years`도
## 없어서 기본값 1로 읽히는데, 그 가드를 빼면 **고교생이 FA로 나온다**
func test_a_player_without_a_contract_is_never_an_fa() -> void:
	assert_bool(Contract.is_fa_eligible(_player({"pro_service_years": 30}))).is_false()
	# 계약이 0이고 연차가 넘어도 연봉이 없으면 아니다
	assert_bool(Contract.is_fa_eligible(_player({
		"contract_years": 0, "pro_service_years": 30}))).override_failure_message(
		"연봉이 없는 사람이 FA가 됐다").is_false()
	assert_bool(Contract.is_fa_eligible({
		"league_id": "LEAGUE_HIGHSCHOOL", "contract_years": 0,
		"pro_service_years": 30})).is_false()


# ── NPC 재계약 (G-6) ──────────────────────────────────────────
#
# 🔴 **04엔 재계약이 없었다.** 계약이 끝나면 전부 FA 시장으로 갔고, 실측에서
# **FA 자격자의 80%가 팀을 옮겼다**(measure:fa, 6해 · 297/373).
# 값은 02 그대로다 — `player_engine.rs:594`·`:615`, `market.ts:139`·`:328`.

## 🔴 **`estimate`와 다른 식이다.** 재계약은 **현재 연봉을 60% 물려받는다** —
## 새 계약이 아니라 이어지는 것이기 때문이다
func test_재계약은_지금_연봉을_물려받는다() -> void:
	# 같은 OVR인데 지금 연봉이 다르면 결과도 달라야 한다
	var low: int = Contract.npc_renewal_salary(70.0, 27, "LEAGUE_KBL",
		3000, 50.0, 50.0)
	var high: int = Contract.npc_renewal_salary(70.0, 27, "LEAGUE_KBL",
		8000, 50.0, 50.0)
	assert_int(high).override_failure_message(
		"지금 연봉이 두 배 넘는데 재계약 값이 같다 — blend를 안 쓴다") \
		.is_greater(low)


## ⚠ **위아래로 막혀 있다** — 02는 market의 0.55~1.35로 가둔다.
## 없으면 한 번 오른 연봉이 해마다 복리로 불어난다
func test_재계약은_시장가에서_멀리_못_간다() -> void:
	# OVR 70 · KBL → market = 1800 + 20*220 = 6200
	var huge: int = Contract.npc_renewal_salary(70.0, 27, "LEAGUE_KBL",
		99999, 100.0, 79.0)
	assert_int(huge).override_failure_message(
		"상한이 없다 — 연봉이 복리로 분다").is_less_equal(int(6200 * 1.35))
	var tiny: int = Contract.npc_renewal_salary(70.0, 27, "LEAGUE_KBL",
		1, 0.0, 25.0)
	assert_int(tiny).override_failure_message(
		"하한이 없다 — 잘하는 선수가 1만원에 남는다") \
		.is_greater_equal(int(6200 * 0.55))


## ⚠ **서른셋부터 깎인다** — 02 `age_damp`
func test_노장은_깎인다() -> void:
	var young: int = Contract.npc_renewal_salary(70.0, 30, "LEAGUE_KBL",
		6000, 50.0, 50.0)
	var old: int = Contract.npc_renewal_salary(70.0, 33, "LEAGUE_KBL",
		6000, 50.0, 50.0)
	assert_int(old).override_failure_message(
		"서른셋인데 안 깎였다").is_less(young)


## 성적과 탐욕이 각각 ±10%를 움직인다 — 02 그대로
func test_성적과_탐욕이_값을_민다() -> void:
	var base: int = Contract.npc_renewal_salary(70.0, 27, "LEAGUE_KBL",
		6000, 50.0, 50.0)
	assert_int(Contract.npc_renewal_salary(70.0, 27, "LEAGUE_KBL",
		6000, 100.0, 50.0)).is_greater(base)
	assert_int(Contract.npc_renewal_salary(70.0, 27, "LEAGUE_KBL",
		6000, 50.0, 79.0)).is_greater(base)


## 재계약 기간 — 02 분기 그대로. **순서가 뜻을 갖는다**
func test_재계약_기간이_02와_같다() -> void:
	# 나이가 먼저다
	assert_int(Contract.npc_contract_years(34, 90.0, 0.0, 90.0)).is_equal(1)
	# 승부 압박이 육성보다 앞선다
	assert_int(Contract.npc_contract_years(30, 90.0, 71.0, 90.0)).is_equal(1)
	# 육성 팀의 어린 선수
	assert_int(Contract.npc_contract_years(25, 61.0, 0.0, 61.0)).is_equal(3)
	assert_int(Contract.npc_contract_years(25, 61.0, 0.0, 60.0)).is_equal(2)
	# 그 밖에는 안정 선호가 가른다
	assert_int(Contract.npc_contract_years(28, 0.0, 0.0, 66.0)).is_equal(2)
	assert_int(Contract.npc_contract_years(28, 0.0, 0.0, 65.0)).is_equal(1)


## 성향은 **해시**다 — 같은 사람은 언제 물어도 같다
func test_성향은_사람마다_고정이다() -> void:
	assert_float(Contract.greed_of("N001")).is_equal(Contract.greed_of("N001"))
	assert_float(Contract.greed_of("N001")).is_not_equal(
		Contract.greed_of("N002"))
	# 02 범위 — 탐욕 25~79 · 안정 25~84
	for i in 50:
		var id: String = "NPC_%03d" % i
		assert_float(Contract.greed_of(id)).is_between(25.0, 79.0)
		assert_float(Contract.stability_of(id)).is_between(25.0, 84.0)


## 성적 급변 — 02 `detectPerfSwing` 그대로
func test_성적_급변을_02처럼_본다() -> void:
	var p := func(era: float, g: int) -> Dictionary:
		return {"type": "pitcher", "era": era, "g": g}
	# ERA 1.5 이상 좋아지면 급등
	assert_int(Contract.perf_swing(p.call(2.0, 30), p.call(3.6, 30))).is_equal(1)
	assert_int(Contract.perf_swing(p.call(3.6, 30), p.call(2.0, 30))).is_equal(-1)
	# 문턱 아래는 0
	assert_int(Contract.perf_swing(p.call(3.0, 30), p.call(3.4, 30))).is_equal(0)
	# ⚠ **경기 수가 20 줄어도 급락이다** — 다쳐서 못 나온 해다
	assert_int(Contract.perf_swing(p.call(3.0, 10), p.call(3.0, 30))) \
		.override_failure_message("경기가 20 줄었는데 평소로 봤다").is_equal(1)

	var b := func(ops: float, g: int) -> Dictionary:
		return {"type": "batter", "ops": ops, "g": g}
	assert_int(Contract.perf_swing(b.call(0.850, 100), b.call(0.700, 100))) \
		.is_equal(1)
	assert_int(Contract.perf_swing(b.call(0.700, 100), b.call(0.850, 100))) \
		.is_equal(-1)
	assert_int(Contract.perf_swing(b.call(0.750, 100), b.call(0.700, 100))) \
		.is_equal(0)
	# 종류가 다르면 못 견준다
	assert_int(Contract.perf_swing(p.call(3.0, 30), b.call(0.700, 100))) \
		.is_equal(0)
