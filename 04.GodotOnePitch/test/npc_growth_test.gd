extends GdUnitTestSuite

## NPC 주간 성장·노화 — M9-8.
##
## ⚠ **주인공만 매주 자라고 있었다.** 그러면 몇 시즌 뒤 주인공이 세계에서
## 혼자 뛰어오르고, 드래프트 앵커·수상 자격선이 그 어긋난 분포 위에 선다.


func _pitcher(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "NPC_1", "player_type": "pitcher", "age": 20,
		"league_id": "LEAGUE_HIGHSCHOOL",
		"development_rate": 50.0, "potential_hidden": 90.0,
		"pitching": {"velocity": 50.0, "command": 50.0, "control": 50.0,
			"movement": 50.0, "stamina": 50.0, "mentality": 50.0,
			"recovery": 50.0, "clutch": 50.0, "hold_runners": 50.0, "ovr": 50.0},
	}
	p.merge(over, true)
	return p


func _batter(over: Dictionary = {}) -> Dictionary:
	var b: Dictionary = {
		"id": "NPC_2", "player_type": "batter", "age": 20,
		"league_id": "LEAGUE_HIGHSCHOOL",
		"development_rate": 50.0, "potential_hidden": 90.0,
		"batting": {"contact": 50.0, "power": 50.0, "eye": 50.0,
			"discipline": 50.0, "speed": 50.0, "base_instinct": 50.0,
			"bunting": 50.0, "platoon": 50.0, "fielding": 50.0, "arm": 50.0,
			"batting_clutch": 50.0, "ovr": 50.0},
	}
	b.merge(over, true)
	return b


## 여러 주를 돌려 총 상승분을 잰다 — 한 주로는 문턱을 못 넘는다
func _run_weeks(npc: Dictionary, weeks: int, phase: String = "season",
		perf: Dictionary = {}) -> int:
	var total: int = 0
	for i in weeks:
		total += NpcGrowth.leveled_of(NpcGrowth.grow_one(npc, phase, perf, 0.5))
	return total


## ⚠ **올라간 칸 수로 재면 눈금이 너무 굵다.** 20주를 돌리면 천장 감쇠가
## 걸려 두 조건이 같은 정수로 붙어 버린다. 한 주가 준 XP 총합으로 잰다 —
## 첫 주는 문턱(25)을 못 넘으므로 그대로 남아 있다
func _week_xp(npc: Dictionary, phase: String = "season",
		perf: Dictionary = {}) -> float:
	NpcGrowth.grow_one(npc, phase, perf, 0.5)
	var total: float = 0.0
	for k in npc.get("pitching_xp", {}):
		total += float(npc["pitching_xp"][k])
	for k in npc.get("batting_xp", {}):
		total += float(npc["batting_xp"][k])
	return total


# ── 나이 ──────────────────────────────────────────────────────

## ⚠ **33세부터 0이다.** 성장이 완전히 멈추고 노화만 남는다
func test_the_age_bands_match_the_table() -> void:
	assert_float(NpcGrowth.age_factor(16)).is_equal(1.80)
	assert_float(NpcGrowth.age_factor(18)).is_equal(1.80)
	assert_float(NpcGrowth.age_factor(19)).is_equal(1.41)
	assert_float(NpcGrowth.age_factor(22)).is_equal(0.71)
	assert_float(NpcGrowth.age_factor(25)).is_equal(0.52)
	assert_float(NpcGrowth.age_factor(28)).is_equal(0.22)
	assert_float(NpcGrowth.age_factor(31)).is_equal(0.08)
	assert_float(NpcGrowth.age_factor(33)).is_equal(0.00)
	assert_float(NpcGrowth.age_factor(40)).is_equal(0.00)


## 어릴수록 빨리 큰다 — 이게 뒤집히면 유망주가 뜻을 잃는다
func test_the_young_grow_faster() -> void:
	var young: int = _run_weeks(_pitcher({"age": 18}), 20)
	var prime: int = _run_weeks(_pitcher({"age": 25}), 20)
	var old: int = _run_weeks(_pitcher({"age": 34}), 20)
	assert_int(young).is_greater(prime)
	assert_int(prime).is_greater(old)
	assert_int(old).override_failure_message("34세가 자랐다").is_equal(0)


## ⚠ **나이에 따라 성장 방향이 바뀐다.** 없으면 35세 투수가 구속을 올린다
func test_what_grows_changes_with_age() -> void:
	var young: Array = []
	for w in NpcGrowth.xp_weights("pitcher", 20):
		young.append(String(w[0]))
	assert_array(young).contains(["velocity"])

	var old: Array = []
	for w in NpcGrowth.xp_weights("pitcher", 31):
		old.append(String(w[0]))
	assert_array(old).contains(["mentality", "recovery"])
	assert_array(old).not_contains(["velocity"])

	# 실제로도 그렇게 움직이는가 — 표만 보는 검사는 배선을 안 본다
	var p: Dictionary = _pitcher({"age": 31, "potential_hidden": 99.0,
		"development_rate": 99.0})
	_run_weeks(p, 60)
	# 31세는 노화 구간이라 구속이 내려갈 수는 있다 — 오르지만 않으면 된다
	assert_float(float(p["pitching"]["velocity"])).override_failure_message(
		"31세인데 구속이 올랐다").is_less_equal(50.0)
	assert_float(float(p["pitching"]["mentality"])).is_greater(50.0)


func test_batters_have_their_own_weights() -> void:
	var young: Array = []
	for w in NpcGrowth.xp_weights("batter", 20):
		young.append(String(w[0]))
	assert_array(young).is_equal(["contact", "eye", "speed", "power"])

	var b: Dictionary = _batter({"potential_hidden": 99.0, "development_rate": 90.0})
	_run_weeks(b, 30)
	assert_float(float(b["batting"]["contact"])).is_greater(50.0)
	assert_float(float(b["batting"]["bunting"])).override_failure_message(
		"비중에 없는 스탯이 올랐다").is_equal(50.0)


# ── 팀 환경 ───────────────────────────────────────────────────

## ⚠ **대학이 고교보다 높아야 한다.** 반대였을 때 고교 출신이 대학에 가면
## 성장이 느려져서 **대학 후보가 5년에 220 → 1로 말라붙었다**
func test_college_beats_high_school() -> void:
	assert_float(NpcGrowth.facility_factor("LEAGUE_UNIVERSITY")).is_greater(
		NpcGrowth.facility_factor("LEAGUE_HIGHSCHOOL"))


## ⚠ **리그에서 파생한다.** 02는 팀에 없는 필드를 읽어 182팀 전부
## 최하 등급으로 떨어뜨렸다
func test_every_league_has_a_tier() -> void:
	for league in ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_KBL_FARM",
			"LEAGUE_UNIVERSITY", "LEAGUE_HIGHSCHOOL"]:
		assert_float(NpcGrowth.facility_factor(league)).override_failure_message(
			"%s가 폴백으로 떨어졌다" % league).is_not_equal(NpcGrowth.FACILITY_DEFAULT)
	# 모르는 리그는 폴백
	assert_float(NpcGrowth.facility_factor("LEAGUE_NOWHERE")).is_equal(0.85)
	assert_float(NpcGrowth.facility_factor("LEAGUE_KBL_FARM")).is_less(
		NpcGrowth.facility_factor("LEAGUE_KBL"))


## ⚠ **시설이 실제 성장에 닿아야 한다.** 계수만 맞고 안 태우면 어디서 뛰든
## 똑같이 자라고, 승격·진학이 뜻을 잃는다
func test_the_facility_reaches_the_growth() -> void:
	assert_float(NpcGrowth.training_factor("LEAGUE_UNIVERSITY", "season")) \
		.override_failure_message("리그가 훈련 계수를 안 가른다") \
		.is_not_equal(NpcGrowth.training_factor("LEAGUE_KBL_FARM", "season"))

	assert_float(_week_xp(_pitcher({"league_id": "LEAGUE_UNIVERSITY"}))) \
		.override_failure_message("어느 리그에 있든 같이 자란다") \
		.is_greater(_week_xp(_pitcher({"league_id": "LEAGUE_KBL_FARM"})))


## 오프시즌에 제일 많이 는다
func test_the_offseason_trains_hardest() -> void:
	assert_float(NpcGrowth.training_factor("LEAGUE_KBL", "offseason")).is_greater(
		NpcGrowth.training_factor("LEAGUE_KBL", "season"))
	assert_float(NpcGrowth.training_factor("LEAGUE_KBL", "postseason")).is_less(
		NpcGrowth.training_factor("LEAGUE_KBL", "season"))

	# 배선까지 — 시기가 실제 성장을 바꾸는가
	assert_float(_week_xp(_pitcher(), "offseason")).override_failure_message(
		"시기가 성장에 안 닿는다").is_greater(_week_xp(_pitcher(), "season"))


# ── 성적 ──────────────────────────────────────────────────────

func test_good_numbers_grow_faster_than_bad_ones() -> void:
	var good: float = _week_xp(_pitcher(), "season", {"games_played": 5, "era": 1.80})
	var bad: float = _week_xp(_pitcher(), "season", {"games_played": 5, "era": 7.00})
	assert_float(good).override_failure_message("성적이 성장을 안 가른다").is_greater(bad)


func test_the_quality_bands_match_the_table() -> void:
	assert_float(NpcGrowth.quality_factor({"era": 2.0}, "pitcher")).is_equal(1.40)
	assert_float(NpcGrowth.quality_factor({"era": 3.0}, "pitcher")).is_equal(1.15)
	assert_float(NpcGrowth.quality_factor({"era": 4.0}, "pitcher")).is_equal(1.00)
	assert_float(NpcGrowth.quality_factor({"era": 5.0}, "pitcher")).is_equal(0.80)
	assert_float(NpcGrowth.quality_factor({"era": 9.0}, "pitcher")).is_equal(0.60)

	assert_float(NpcGrowth.quality_factor({"avg": 0.320}, "batter")).is_equal(1.40)
	assert_float(NpcGrowth.quality_factor({"avg": 0.280}, "batter")).is_equal(1.15)
	assert_float(NpcGrowth.quality_factor({"avg": 0.250}, "batter")).is_equal(1.00)
	assert_float(NpcGrowth.quality_factor({"avg": 0.210}, "batter")).is_equal(0.80)
	assert_float(NpcGrowth.quality_factor({"avg": 0.150}, "batter")).is_equal(0.60)

	# 기록이 없으면 못한 게 아니라 모르는 것이다
	assert_float(NpcGrowth.quality_factor({}, "pitcher")).is_equal(1.00)
	# ⚠ **투수 성적을 타자 기준으로 읽으면 안 된다** — 키가 다르다
	assert_float(NpcGrowth.quality_factor({"era": 1.0}, "batter")).is_equal(1.00)


## ⚠ **02가 `gamesPlayed`를 늘 1로 넣는다.** 그래서 성적이 있는 쪽이
## 없는 쪽보다 적게 큰다 — 뒤집힌 게 맞지만 **밸런스 동결이라 그대로 옮긴다.**
## 이 검사가 그 사실을 못 박는다: 값이 바뀌면 여기서 걸린다
func test_the_02_games_quirk_is_preserved() -> void:
	var with_perf: float = NpcGrowth.perf_factor({"games_played": 1, "era": 2.0},
		"season", "pitcher")
	var without: float = NpcGrowth.perf_factor({}, "season", "pitcher")
	assert_float(with_perf).is_equal_approx(0.28, 0.001)
	assert_float(without).is_equal(0.70)
	assert_bool(with_perf < without).override_failure_message(
		"02의 gamesPlayed 결함이 사라졌다 — 고칠 거면 실측 대조부터 다시 한다").is_true()


func test_the_phase_weights_the_performance() -> void:
	assert_float(NpcGrowth.perf_factor({}, "offseason", "pitcher")).is_equal_approx(
		0.49, 0.001)
	assert_float(NpcGrowth.perf_factor({}, "season", "pitcher")).is_equal(0.70)


# ── 잠재력 ────────────────────────────────────────────────────

## ⚠ **주인공 쪽과 다르다.** NPC는 천장에 닿으면 0이고 주인공은 0.10이다 —
## 02가 실제로 둘로 나뉘어 있다
func test_the_ceiling_is_harder_than_the_protagonist_one() -> void:
	assert_float(NpcGrowth.potential_cap(80.0, 80.0)).is_equal(0.00)
	assert_float(Growth.potential_cap_factor(80.0, 80.0)).is_equal(0.10)

	assert_float(NpcGrowth.potential_cap(50.0, 90.0)).is_equal(1.00)
	assert_float(NpcGrowth.potential_cap(70.0, 90.0)).is_equal(0.70)
	assert_float(NpcGrowth.potential_cap(78.0, 90.0)).is_equal(0.35)
	assert_float(NpcGrowth.potential_cap(88.0, 90.0)).is_equal(0.10)


## 천장에 닿으면 멈춘다 — 안 멈추면 전 세계가 99로 수렴한다
func test_growth_stops_at_the_ceiling() -> void:
	var p: Dictionary = _pitcher({"age": 18, "development_rate": 99.0,
		"potential_hidden": 60.0})
	for k in p["pitching"]:
		p["pitching"][k] = 60.0
	_run_weeks(p, 200)
	assert_float(float(p["pitching"]["velocity"])).override_failure_message(
		"천장 60을 넘겼다").is_less_equal(60.0)


## ⚠ **천장 감쇠와 속도 배율은 다른 것이다.** 둘을 한 검사로 보면 감쇠만
## 살아 있어도 통과한다 — 여기 둘은 능력치 50에서 감쇠가 **똑같이 1.00**이라
## 속도 배율만 남는다
func test_high_potential_grows_faster() -> void:
	assert_float(NpcGrowth.potential_cap(50.0, 90.0)).is_equal(
		NpcGrowth.potential_cap(50.0, 99.0))
	assert_float(_week_xp(_pitcher({"potential_hidden": 99.0}))) \
		.override_failure_message("잠재력이 성장 속도를 안 가른다") \
		.is_greater(_week_xp(_pitcher({"potential_hidden": 90.0})))

	# 천장 감쇠도 따로 본다 — 능력치가 천장에 붙으면 느려진다
	var near: Dictionary = _pitcher({"potential_hidden": 62.0})
	for k in near["pitching"]:
		near["pitching"][k] = 60.0
	assert_float(_week_xp(near)).is_less(_week_xp(_pitcher({"potential_hidden": 62.0})))


## ⚠ **한 칸 오르면 그만큼 XP를 뺀다.** 안 빼면 한 번 문턱을 넘은 뒤로
## **매주 한 칸씩** 오른다 — 몇 달이면 전원이 99다
func test_leveling_up_spends_the_xp() -> void:
	var p: Dictionary = _pitcher({"age": 18, "development_rate": 99.0,
		"potential_hidden": 99.0})
	# 문턱을 넘길 때까지 돌린다
	var before: float = 0.0
	for i in 20:
		before = float(p["pitching"]["velocity"])
		NpcGrowth.grow_one(p, "offseason", {}, 1.0)
		if float(p["pitching"]["velocity"]) > before:
			break
	# 방금 올랐다 — 남은 XP는 새 문턱보다 작아야 한다
	var cur: float = float(p["pitching"]["velocity"])
	assert_float(cur).override_failure_message("20주 동안 한 칸도 안 올랐다").is_greater(50.0)
	assert_float(float(p["pitching_xp"]["velocity"])).override_failure_message(
		"올리고도 XP를 안 뺐다 — 다음 주에 또 오른다").is_less(Growth.xp_threshold(cur))


## ⚠ **문턱이 능력치에 비례한다.** 고정이면 90도 40도 같은 속도로 올라
## 상한이 뜻을 잃는다
func test_a_higher_stat_costs_more_xp() -> void:
	var low: Dictionary = _pitcher({"age": 18, "potential_hidden": 99.0})
	var high: Dictionary = _pitcher({"age": 18, "potential_hidden": 99.0})
	for k in low["pitching"]:
		low["pitching"][k] = 40.0
		high["pitching"][k] = 60.0
	# 천장 감쇠는 둘 다 1.00이다 — 남는 건 문턱뿐
	assert_float(NpcGrowth.potential_cap(40.0, 99.0)).is_equal(
		NpcGrowth.potential_cap(60.0, 99.0))
	assert_int(_run_weeks(low, 20, "offseason")).override_failure_message(
		"능력치가 높아도 문턱이 같다").is_greater(_run_weeks(high, 20, "offseason"))


func test_the_development_rate_matters() -> void:
	assert_float(_week_xp(_pitcher({"development_rate": 95.0}))).is_greater(
		_week_xp(_pitcher({"development_rate": 30.0})))


# ── 노화 ──────────────────────────────────────────────────────

## ⚠ **감퇴를 스탯에서 곧바로 빼면 노화가 통째로 사라진다.** 주당 0.048이
## 반올림에 먹혀서 02는 **전 연령이 무변화**였다 — 1군 31세 이상 117명이
## 한 시즌 내내 하나도 안 변했다
func test_aging_actually_lands() -> void:
	var p: Dictionary = _pitcher({"age": 34})
	for i in 52:
		NpcGrowth.grow_one(p, "season", {}, 0.5)
	assert_float(float(p["pitching"]["velocity"])).override_failure_message(
		"34세를 52주 굴렸는데 구속이 그대로다").is_less(50.0)


## 누적분을 들고 다니는가 — 매주 0에서 시작하면 영영 안 걸린다
func test_the_debt_carries_between_weeks() -> void:
	var p: Dictionary = _pitcher({"age": 34})
	NpcGrowth.grow_one(p, "season", {}, 0.5)
	assert_float(float(p["aging_debt"]["velocity"])).is_greater(0.0)
	assert_float(float(p["aging_debt"]["velocity"])).is_less(1.0)


## ⚠ **결과가 사전이 아니라 정수다** — 사람마다 사전을 만들면 주에 7,000개
## 할당이다. 두 값이 한 정수 안에 있으니 읽는 자리도 못 박는다
func test_the_result_packs_both_numbers() -> void:
	var young: int = NpcGrowth.grow_one(
		_pitcher({"age": 18, "development_rate": 99.0}), "offseason", {}, 1.0)
	assert_bool(NpcGrowth.aged_of(young)).is_false()

	var old: Dictionary = _pitcher({"age": 40})
	# 40세는 주당 감퇴가 4.00/52 = 0.077 — 13주면 1을 넘는다
	var dropped: bool = false
	for i in 13:
		dropped = dropped or NpcGrowth.aged_of(
			NpcGrowth.grow_one(old, "season", {}, 0.5))
	assert_bool(dropped).override_failure_message("40세가 13주를 버텼다").is_true()
	assert_int(NpcGrowth.leveled_of(NpcGrowth.grow_one(old, "season", {}, 0.5))) \
		.override_failure_message("40세가 자랐다").is_equal(0)


## ⚠ **누적분을 이월한다.** 내린 뒤 나머지를 버리면 감퇴가 계속 조금씩
## 새서 연 감퇴량에 못 미친다 — 40세 투수는 한 해에 커맨드가 5 내려야 한다
func test_the_yearly_decay_actually_adds_up() -> void:
	var stats: Dictionary = {"command": 99.0, "velocity": 99.0,
		"stamina": 99.0, "control": 99.0, "recovery": 99.0}
	var debt: Dictionary = {}

	# 커맨드는 연 5.0 = 주 0.0962다. 11주째에 처음 1을 넘는데 그때 남는
	# 0.058을 버리면 감퇴가 매번 조금씩 새서 10년이면 두 해치가 사라진다
	var week: int = 0
	while week < 52 and float(stats["command"]) == 99.0:
		NpcGrowth.apply_aging(stats, debt, 40, {}, "season", "pitcher")
		week += 1
	assert_float(float(stats["command"])).override_failure_message(
		"52주 동안 커맨드가 한 번도 안 내렸다").is_less(99.0)
	assert_float(float(debt["command"])).override_failure_message(
		"내리고 나머지를 버렸다 — 감퇴가 계속 샌다").is_greater(0.0)

	# 10년치로 보면 새는 게 눈에 보인다: 이월하면 49~50, 버리면 47
	for i in 520 - week:
		NpcGrowth.apply_aging(stats, debt, 40, {}, "season", "pitcher")
	assert_float(99.0 - float(stats["command"])).override_failure_message(
		"40세 10년인데 커맨드가 %.0f만 내렸다 — 연 5.0이면 49~50이다"
		% (99.0 - float(stats["command"]))).is_greater(48.0)


## ⚠ **가드가 `apply_aging` 안에도 있어야 한다.** 부르는 쪽에만 두면
## 다른 데서 부를 때 조용히 20대가 늙는다
func test_apply_aging_refuses_the_young_itself() -> void:
	var stats: Dictionary = {"velocity": 80.0}
	var debt: Dictionary = {}
	for i in 200:
		assert_bool(NpcGrowth.apply_aging(stats, debt, 25, {}, "season", "pitcher")) \
			.is_false()
	assert_float(float(stats["velocity"])).override_failure_message(
		"25세가 늙었다").is_equal(80.0)
	assert_bool(debt.is_empty()).is_true()


func test_the_young_do_not_decay() -> void:
	var p: Dictionary = _pitcher({"age": 29, "development_rate": 1.0,
		"potential_hidden": 60.0})
	for k in p["pitching"]:
		p["pitching"][k] = 60.0
	for i in 52:
		NpcGrowth.grow_one(p, "season", {}, 0.5)
	assert_float(float(p["pitching"]["velocity"])).is_equal(60.0)
	assert_bool(p.get("aging_debt", {}).is_empty()).override_failure_message(
		"29세인데 노화 빚이 쌓였다").is_true()


## ⚠ 33~35에서 **제구가 구속보다 빨리 무너진다.** 뒤집으면 노장 투수의
## 성격이 통째로 바뀐다
func test_command_falls_before_velocity_in_the_mid_thirties() -> void:
	var y: Dictionary = NpcGrowth.aging_yearly("pitcher", 34)
	assert_float(float(y["command"])).is_greater(float(y["velocity"]))
	# 30대 초반에는 반대다
	var e: Dictionary = NpcGrowth.aging_yearly("pitcher", 31)
	assert_float(float(e["velocity"])).is_greater(float(e["command"]))


func test_older_decays_faster() -> void:
	assert_float(float(NpcGrowth.aging_yearly("pitcher", 40)["velocity"])).is_greater(
		float(NpcGrowth.aging_yearly("pitcher", 34)["velocity"]))
	assert_float(float(NpcGrowth.aging_yearly("batter", 40)["speed"])).is_greater(
		float(NpcGrowth.aging_yearly("batter", 34)["speed"]))


## 잘 던지면 덜 무너진다
func test_good_numbers_slow_the_decay() -> void:
	assert_float(NpcGrowth.aging_mult({"era": 2.0}, "season", "pitcher")).is_less(
		NpcGrowth.aging_mult({"era": 8.0}, "season", "pitcher"))
	assert_float(NpcGrowth.aging_mult({}, "season", "pitcher")).is_equal(1.00)
	assert_float(NpcGrowth.aging_mult({}, "offseason", "pitcher")).is_equal(0.85)


## OVR을 다시 만드는가 — 안 하면 세부는 자랐는데 화면·드래프트가 보는
## 숫자는 그대로다
func test_the_ovr_is_recomputed() -> void:
	var p: Dictionary = _pitcher({"age": 18, "development_rate": 99.0,
		"potential_hidden": 99.0})
	p["pitching"]["ovr"] = 50.0
	_run_weeks(p, 40)
	assert_float(float(p["pitching"]["ovr"])).override_failure_message(
		"능력치가 올랐는데 OVR이 50 그대로다").is_greater(50.0)
	assert_float(float(p["pitching"]["ovr"])).is_equal(
		PlayerGen.pitching_ovr(p["pitching"]))


# ── 성적 창 ───────────────────────────────────────────────────

func _game(day: int, lines: Array) -> Dictionary:
	return {"day": day, "result": {"player_lines": lines}}


## ⚠ **최근 4주를 본다.** 1주만 보면 그 주에 안 나온 선발이 통째로 빠져
## 성장 방향이 등판 요일에 흔들린다
func test_the_window_is_four_weeks() -> void:
	var sched: Array = [
		_game(1, [{"role": "pitcher", "player_id": "A", "er": 9.0, "ip": 9.0}]),
		_game(30, [{"role": "pitcher", "player_id": "B", "er": 1.0, "ip": 9.0}]),
	]
	var perf: Dictionary = NpcGrowth.perf_window(sched, 30)
	assert_bool(perf.has("B")).is_true()
	assert_bool(perf.has("A")).override_failure_message(
		"29일 전 경기가 창에 들어왔다").is_false()

	# 4주 안이면 들어온다
	assert_bool(NpcGrowth.perf_window(sched, 28).has("A")).is_true()


func test_the_window_averages_over_games() -> void:
	var sched: Array = [
		_game(10, [{"role": "pitcher", "player_id": "A", "er": 0.0, "ip": 9.0}]),
		_game(12, [{"role": "pitcher", "player_id": "A", "er": 8.0, "ip": 9.0}]),
	]
	# 8자책 18이닝 = ERA 4.00 — 경기마다 따로 보면 0.00과 8.00이다
	assert_float(float(NpcGrowth.perf_window(sched, 12)["A"]["era"])).is_equal(4.00)


func test_batters_get_an_average() -> void:
	var sched: Array = [
		_game(10, [{"role": "batter", "player_id": "C", "h": 3.0, "ab": 10.0}]),
	]
	assert_float(float(NpcGrowth.perf_window(sched, 10)["C"]["avg"])).is_equal(0.300)


## 안 치른 경기는 안 센다 — 미래 일정이 성적이 되면 안 된다
func test_unplayed_games_are_skipped() -> void:
	var sched: Array = [{"day": 10, "result": null}]
	assert_bool(NpcGrowth.perf_window(sched, 10).is_empty()).is_true()


# ── 세계 한 주 ────────────────────────────────────────────────

func _state() -> Dictionary:
	return {
		"day": 100, "season_year": 2027, "schedule": [],
		"protagonist": {"id": "ME", "league_id": "LEAGUE_HIGHSCHOOL"},
		"world": {"rosters": {
			"TEAM_A": [_pitcher({"id": "N1"}), _batter({"id": "N2"})],
		}, "draft_pool": []},
	}


func test_the_world_grows() -> void:
	var s: Dictionary = _state()
	var r: Dictionary = NpcGrowth.run(s)
	assert_int(int(r["grown"])).is_equal(2)


## ⚠ **주인공은 안 건드린다.** `TrainingGrowth`가 계획대로 돌리는 사람이라
## 두 경로가 같이 만지면 두 배 큰다
func test_the_protagonist_is_left_alone() -> void:
	var s: Dictionary = _state()
	var me: Dictionary = _pitcher({"id": "ME", "is_protagonist": true})
	s["world"]["rosters"]["TEAM_A"].append(me)

	for i in 40:
		NpcGrowth.run(s)
	assert_float(float(me["pitching"]["velocity"])).override_failure_message(
		"주인공이 NPC 경로로도 자랐다").is_equal(50.0)


## 은퇴한 사람도 안 자란다 — 풀에 남아 있어서 계속 딸려 온다
func test_the_retired_are_left_alone() -> void:
	var s: Dictionary = _state()
	var gone: Dictionary = _pitcher({"id": "GONE", "career_status": "retired"})
	s["world"]["draft_pool"] = [gone]

	for i in 40:
		NpcGrowth.run(s)
	assert_float(float(gone["pitching"]["velocity"])).is_equal(50.0)


## ⚠ **드래프트 풀도 자란다.** 소속이 없다고 빼면 졸업하고 지명될 때까지
## 몇 달을 아무도 안 자란 채로 드래프트 평가를 받는다
func test_the_draft_pool_grows_too() -> void:
	var s: Dictionary = _state()
	var free: Dictionary = _pitcher({"id": "FREE", "league_id": ""})
	s["world"]["draft_pool"] = [free]

	for i in 40:
		NpcGrowth.run(s)
	assert_float(float(free["pitching"]["velocity"])).is_greater(50.0)


## ⚠ **같은 사람은 같은 값을 받는다.** 순서 기반 난수를 쓰면 명단에 한 명을
## 넣고 빼는 것만으로 그 뒤 전원의 성장이 달라진다
func test_the_randomness_does_not_depend_on_order() -> void:
	var a: Dictionary = _state()
	var b: Dictionary = _state()
	# b는 앞에 사람을 하나 더 끼운다
	b["world"]["rosters"]["TEAM_A"].insert(0, _pitcher({"id": "N0"}))

	for i in 30:
		NpcGrowth.run(a)
		NpcGrowth.run(b)

	assert_float(float(b["world"]["rosters"]["TEAM_A"][1]["pitching"]["velocity"])) \
		.override_failure_message("앞에 한 명 끼웠더니 뒷사람 성장이 바뀌었다") \
		.is_equal(float(a["world"]["rosters"]["TEAM_A"][0]["pitching"]["velocity"]))


## ⚠ **성적을 사람과 맞춘다.** 안 맞추면 전원이 "성적 없음"으로 자라고,
## 잘 던진 사람과 두들겨 맞은 사람이 똑같이 큰다
func test_each_person_gets_their_own_numbers() -> void:
	var s: Dictionary = _state()
	# N1만 두들겨 맞았다 — N2는 기록이 없다
	s["schedule"] = [_game(98, [{"role": "pitcher", "player_id": "N1",
		"er": 12.0, "ip": 9.0}])]
	NpcGrowth.run(s)

	var beaten: Dictionary = s["world"]["rosters"]["TEAM_A"][0]
	# 같은 사람을 성적 없이 돌린 것과 달라야 한다
	var clean: Dictionary = _state()
	NpcGrowth.run(clean)
	assert_float(float(beaten["pitching_xp"]["velocity"])) \
		.override_failure_message("성적이 사람에게 안 닿는다") \
		.is_not_equal(float(clean["world"]["rosters"]["TEAM_A"][0]["pitching_xp"]["velocity"]))


## ⚠ **훈련 계수를 리그마다 따로 캐시한다.** 한 번 담고 재사용하면 전원이
## 첫 사람의 리그로 자란다 — 고교생이 프로 시설을 쓴다
func test_each_league_keeps_its_own_training_factor() -> void:
	# 섞인 세계 — 명단 첫 사람이 2군이다
	var mixed: Dictionary = _state()
	mixed["world"]["rosters"] = {
		"TEAM_A": [_pitcher({"id": "N1", "league_id": "LEAGUE_KBL_FARM"})],
		"TEAM_B": [_pitcher({"id": "N2", "league_id": "LEAGUE_UNIVERSITY"})],
	}
	NpcGrowth.run(mixed)

	# 같은 사람만 있는 세계. **난수는 사람에 매여 있으므로 값이 딱 같아야 한다** —
	# 다르면 N2가 옆 사람의 리그로 자란 것이다
	var alone: Dictionary = _state()
	alone["world"]["rosters"] = {
		"TEAM_B": [_pitcher({"id": "N2", "league_id": "LEAGUE_UNIVERSITY"})],
	}
	NpcGrowth.run(alone)

	assert_float(float(mixed["world"]["rosters"]["TEAM_B"][0]["pitching_xp"]["velocity"])) \
		.override_failure_message("옆 사람의 리그로 자랐다") \
		.is_equal(float(alone["world"]["rosters"]["TEAM_B"][0]["pitching_xp"]["velocity"]))

	# 대조군 — 2군이 대학과 다르게 자라야 이 비교가 뜻을 갖는다
	assert_float(float(mixed["world"]["rosters"]["TEAM_A"][0]["pitching_xp"]["velocity"])) \
		.is_not_equal(float(mixed["world"]["rosters"]["TEAM_B"][0]["pitching_xp"]["velocity"]))


## ⚠ **넘겨받은 날짜를 쓴다.** 무시하고 도착한 날짜를 쓰면 여러 날을 한 번에
## 진행할 때 **같은 주를 N번 사는 것**이 된다
func test_the_day_argument_is_honoured() -> void:
	var a: Dictionary = _state()
	var b: Dictionary = _state()
	NpcGrowth.run(a, 7)
	NpcGrowth.run(b, 14)
	assert_float(float(a["world"]["rosters"]["TEAM_A"][0]["pitching_xp"]["velocity"])) \
		.override_failure_message("어느 주로 부르든 같은 값이 나온다") \
		.is_not_equal(float(b["world"]["rosters"]["TEAM_A"][0]["pitching_xp"]["velocity"]))


## 주가 다르면 값도 달라야 한다 — 같으면 매주 똑같은 편차를 받는다
func test_the_randomness_moves_between_weeks() -> void:
	var seen: Dictionary = {}
	for day in [7, 14, 21, 28]:
		var s: Dictionary = _state()
		s["day"] = day
		NpcGrowth.run(s)
		seen[float(s["world"]["rosters"]["TEAM_A"][0]["pitching_xp"]["velocity"])] = true
	assert_int(seen.size()).override_failure_message(
		"네 주가 전부 같은 난수를 받았다").is_greater(1)


## 세계가 없으면 아무 일도 안 한다 — 검사·부분 이주 상태다
func test_an_empty_world_is_a_no_op() -> void:
	assert_int(int(NpcGrowth.run({})["grown"])).is_equal(0)


# ── 시기 ──────────────────────────────────────────────────────

## ⚠ **02는 주인공 일정 하나로 세계 전체의 시기를 정한다.** 그대로 옮겼다 —
## 고교생이 쉬는 주엔 프로도 오프시즌 배수를 받는다
func test_the_phase_comes_from_the_protagonist_league() -> void:
	var s: Dictionary = _state()
	# 고교는 64~204일차
	s["day"] = 100
	assert_str(NpcGrowth.phase_of(s)).is_equal("season")
	s["day"] = 10
	assert_str(NpcGrowth.phase_of(s)).is_equal("offseason")
	s["day"] = 300
	assert_str(NpcGrowth.phase_of(s)).is_equal("offseason")

	# 프로는 1~350일차다 — 리그를 안 보면 이 둘이 같아진다
	s["protagonist"]["league_id"] = "LEAGUE_KBL"
	s["day"] = 300
	assert_str(NpcGrowth.phase_of(s)).override_failure_message(
		"주인공 리그를 안 보고 시기를 정했다").is_equal("season")
