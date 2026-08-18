extends GdUnitTestSuite

## 성장 핵심 산식 — XP·잠재력·나이·피로. M4-1.
##
## 원본: `packages/engine-native/src/growth_engine.rs`
##
## ⚠ **여기 `fatigue`는 100 = 탈진이다.** 리그 쪽 `freshness`(100 = 쌩쌩)와
## 방향이 반대다. 02가 둘 다 `fatigue`라 불러서 섞이기 쉽다 — 확인해 보니
## 주인공은 자기 필드로 `fatigue`를 갖고 리그 `playerConditions`에는 안
## 들어간다. **두 축은 다른 값이다.**


# ── XP 문턱 ────────────────────────────────────────────────────────

func test_higher_stats_cost_more_xp() -> void:
	# ⚠ 문턱이 능력에 비례해야 위로 갈수록 느려진다. 고정이면 90도 40도
	# 같은 속도로 올라 상한이 뜻을 잃는다
	assert_float(Growth.xp_threshold(0.0)).is_equal_approx(7.5, 0.001)
	assert_float(Growth.xp_threshold(40.0)).is_equal_approx(21.5, 0.001)
	assert_float(Growth.xp_threshold(90.0)).is_equal_approx(39.0, 0.001)
	assert_bool(Growth.xp_threshold(90.0) > Growth.xp_threshold(40.0)).is_true()


# ── 잠재력 ─────────────────────────────────────────────────────────

func test_potential_speeds_up_learning() -> void:
	# 잠재력이 높으면 같은 훈련에서 더 많이 배운다 (0.80~1.20배)
	assert_float(Growth.potential_speed_factor(60.0)).is_equal_approx(0.80, 0.001)
	assert_float(Growth.potential_speed_factor(99.0)).is_equal_approx(1.20, 0.001)
	assert_bool(Growth.potential_speed_factor(90.0) > Growth.potential_speed_factor(70.0)).is_true()


func test_potential_speed_is_clamped_at_both_ends() -> void:
	# 범위 밖 값이 들어와도 배수가 튀면 안 된다
	assert_float(Growth.potential_speed_factor(10.0)).is_equal_approx(0.80, 0.001)
	assert_float(Growth.potential_speed_factor(150.0)).is_equal_approx(1.20, 0.001)


func test_approaching_the_ceiling_slows_growth() -> void:
	# ⚠ **비율로 본다.** 잠재력 대비 어디쯤인지가 기준이다 —
	# 절대값으로 보면 잠재력이 낮은 선수가 영영 안 자란다
	assert_float(Growth.potential_cap_factor(50.0, 90.0)).is_equal_approx(1.00, 0.001)  # 0.56
	assert_float(Growth.potential_cap_factor(72.0, 90.0)).is_equal_approx(0.70, 0.001)  # 0.80
	assert_float(Growth.potential_cap_factor(81.0, 90.0)).is_equal_approx(0.35, 0.001)  # 0.90
	assert_float(Growth.potential_cap_factor(89.0, 90.0)).is_equal_approx(0.10, 0.001)  # 0.99


func test_the_ceiling_never_fully_blocks_growth() -> void:
	# ⚠ 0이면 천장에 닿는 순간 영영 안 자란다. 0.10은 아주 느리지만 열려 있다
	assert_bool(Growth.potential_cap_factor(99.0, 99.0) > 0.0).is_true()


func test_no_potential_means_no_cap() -> void:
	# 잠재력이 안 정해진 선수(구 세이브)를 0으로 나누면 안 된다
	assert_float(Growth.potential_cap_factor(50.0, 0.0)).is_equal_approx(1.00, 0.001)


# ── 나이 ───────────────────────────────────────────────────────────

func test_training_gets_harder_with_age() -> void:
	assert_float(Growth.age_train_factor(25)).is_equal_approx(1.00, 0.001)
	assert_float(Growth.age_train_factor(29)).is_equal_approx(1.00, 0.001)
	assert_float(Growth.age_train_factor(31)).is_equal_approx(0.85, 0.001)
	assert_float(Growth.age_train_factor(34)).is_equal_approx(0.70, 0.001)
	assert_float(Growth.age_train_factor(37)).is_equal_approx(0.55, 0.001)
	assert_float(Growth.age_train_factor(42)).is_equal_approx(0.45, 0.001)


func test_age_never_stops_training_entirely() -> void:
	# 0이면 노장이 훈련해도 아무 일이 안 일어난다
	assert_bool(Growth.age_train_factor(45) > 0.0).is_true()


# ── 주간 XP ────────────────────────────────────────────────────────

func _xp(o: Dictionary = {}) -> float:
	var d: Dictionary = {"base": 10.0, "condition": 100.0, "fatigue": 0.0,
		"dev_rate": 62.0, "diligence": 50.0}
	d.merge(o, true)
	return Growth.week_xp(d["base"], d["condition"], d["fatigue"], d["dev_rate"], d["diligence"])


func test_exhaustion_cuts_learning() -> void:
	# ⚠ **여기 fatigue는 100 = 탈진이다.** 리그 쪽과 방향이 반대다 —
	# 뒤집어 쓰면 "지친 선수가 더 잘 큰다"가 된다
	var fresh: float = _xp({"fatigue": 0.0})
	var tired: float = _xp({"fatigue": 75.0})
	var spent: float = _xp({"fatigue": 90.0})
	assert_bool(fresh > tired).is_true()
	assert_bool(tired > spent).is_true()


func test_even_mild_fatigue_costs_something() -> void:
	# ⚠ **가벼운 구간(70 미만)에서도 방향이 맞아야 한다.** 큰 값만 보면
	# 구간 문턱(0.65·0.35)이 가려줘서 **식을 통째로 뒤집어도 검사가 통과한다**.
	# 실제로 그 변이가 한 번 빠져나갔다
	assert_bool(_xp({"fatigue": 0.0}) > _xp({"fatigue": 30.0})).is_true()
	assert_bool(_xp({"fatigue": 10.0}) > _xp({"fatigue": 35.0})).is_true()


func test_the_exhaustion_penalty_has_a_floor() -> void:
	# 완전히 쌩쌩해도 배수가 1을 넘지 않는다 — 넘으면 피로 관리가 상이 된다
	assert_bool(_xp({"fatigue": 0.0}) <= _xp({"fatigue": 0.0})).is_true()
	# 조금 지친 구간은 완만하다(0.80 하한)
	assert_bool(_xp({"fatigue": 50.0}) / _xp({"fatigue": 0.0}) >= 0.79).is_true()


func test_condition_scales_learning() -> void:
	assert_bool(_xp({"condition": 100.0}) > _xp({"condition": 50.0})).is_true()
	assert_float(_xp({"condition": 0.0})).is_equal_approx(0.0, 0.001)


func test_development_rate_and_diligence_both_matter() -> void:
	# 성장률은 타고난 것, 성실성은 태도다 — 둘 다 걸려야 육성이 뜻이 있다
	assert_bool(_xp({"dev_rate": 90.0}) > _xp({"dev_rate": 40.0})).is_true()
	assert_bool(_xp({"diligence": 99.0}) > _xp({"diligence": 10.0})).is_true()


func test_diligence_never_zeroes_out_growth() -> void:
	# 0.6 하한이 있다 — 성실성 0이어도 훈련이 무의미하진 않다
	assert_bool(_xp({"diligence": 0.0}) > 0.0).is_true()


# ── 레벨업 ─────────────────────────────────────────────────────────

func test_xp_accumulates_until_the_threshold() -> void:
	# 문턱(50 → 25.0)을 못 넘으면 값은 그대로고 XP만 쌓인다
	var r: Dictionary = Growth.try_level_up(50.0, 0.0, 10.0)
	assert_float(r["value"]).is_equal_approx(50.0, 0.001)
	assert_float(r["acc_xp"]).is_equal_approx(10.0, 0.001)
	assert_int(r["leveled"]).is_equal(0)


func test_crossing_the_threshold_raises_the_stat() -> void:
	var r: Dictionary = Growth.try_level_up(50.0, 20.0, 10.0)
	assert_float(r["value"]).is_equal_approx(51.0, 0.001)
	assert_int(r["leveled"]).is_equal(1)
	# 남은 XP는 다음 단계로 이월된다 — 버리면 성장이 느려진다
	assert_float(r["acc_xp"]).is_equal_approx(5.0, 0.001)


func test_a_big_gain_can_level_more_than_once() -> void:
	var r: Dictionary = Growth.try_level_up(50.0, 0.0, 200.0)
	assert_bool(r["leveled"] > 1).is_true()
	# ⚠ 올라갈수록 문턱이 커지므로 한 번에 무한정 오르지 않는다
	assert_bool(r["leveled"] < 8).is_true()


func test_levelling_up_raises_the_next_threshold() -> void:
	# 50에서 한 칸 오르면 다음 문턱은 51 기준이다 — 안 올리면 같은 XP로
	# 계속 올라간다
	var once: Dictionary = Growth.try_level_up(50.0, 25.0, 0.0)
	assert_float(once["value"]).is_equal_approx(51.0, 0.001)
	assert_float(once["acc_xp"]).is_equal_approx(0.0, 0.001)


# ── 피로 구간 승수 ─────────────────────────────────────────────────

func test_being_tired_makes_training_cost_more() -> void:
	# ⚠ 70/80/90에서 볼록하게 뛴다. 지칠수록 같은 훈련이 더 지치게 한다 —
	# 이게 없으면 피로를 무시하고 계속 훈련하는 게 언제나 최선이 된다
	assert_float(Growth.fatigue_zone_mult(50.0)).is_equal_approx(1.0, 0.001)
	assert_float(Growth.fatigue_zone_mult(70.0)).is_equal_approx(1.5, 0.001)
	assert_float(Growth.fatigue_zone_mult(80.0)).is_equal_approx(2.5, 0.001)
	assert_float(Growth.fatigue_zone_mult(90.0)).is_equal_approx(4.0, 0.001)


func test_the_zone_multiplier_is_convex() -> void:
	# 구간이 올라갈수록 뜀폭이 커진다 — 선형이면 벼랑 끝 관리가 뜻을 잃는다
	var a: float = Growth.fatigue_zone_mult(70.0) - Growth.fatigue_zone_mult(60.0)
	var b: float = Growth.fatigue_zone_mult(80.0) - Growth.fatigue_zone_mult(70.0)
	var c: float = Growth.fatigue_zone_mult(90.0) - Growth.fatigue_zone_mult(80.0)
	assert_bool(b > a).is_true()
	assert_bool(c > b).is_true()


# ── 두 축이 안 섞이는가 ────────────────────────────────────────────

func test_the_two_axes_point_opposite_ways() -> void:
	# ⚠ **이 검사가 지뢰를 지킨다.** 리그 쪽 `freshness`는 높을수록 좋고
	# 여기 `fatigue`는 높을수록 나쁘다. 한쪽을 다른 쪽에 넣으면 조용히 뒤집힌다
	#
	# 성장: 지치면(fatigue 높음) 나빠진다
	assert_bool(_xp({"fatigue": 90.0}) < _xp({"fatigue": 10.0})).is_true()
	# 로스터: 쌩쌩하면(freshness 높음) 좋아진다
	var fresh: int = Roster.effective_ovr(80.0, {"freshness": 90.0, "last_pitched_week": 0}, 10)
	var worn: int = Roster.effective_ovr(80.0, {"freshness": 10.0, "last_pitched_week": 0}, 10)
	assert_bool(fresh > worn).is_true()

# ── 주인공과 NPC의 상한 표는 일부러 다르다 (P-45) ────────────────

## 🔴 **두 표를 통일하고 싶어지면 여기를 읽어라.** 02도 둘로 나뉘어 있다:
##
##   주인공  `growth_engine.rs:186 potential_cap_factor` — **soft cap**
##           `ratio >= 1.00` 갈래가 **없다.** 0.10이 끝이라 천장을 넘어도
##           아주 조금씩 계속 자란다
##   NPC     `npc_sim.rs:2676 potential_cap` — **hard cap**
##           `ratio >= 1.00`이면 **0.00.** 잠재력을 안 넘는다
##
## 🔴 **실제로 한 번 잘못 읽었다** (2026-08-19). 20해 실측에서 주인공이
## OVR 81 / 잠재력 76이 되자 "04가 02 값을 바꿔 놓았다"고 판단했는데,
## **NPC 표를 주인공 표와 견준 것**이었다. 02 주인공 표에는 그 갈래가
## 원래 없다 — **04가 맞게 옮겨 놓았다.**
##
## ⚠ 02 검사도 그 전제 위에 서 있다(`startPresets.test.ts:71`) —
## "잠재력을 넘긴 채 시작하면 1주차부터 **0.10배**가 된다". 0.00이면
## 그 문장이 성립하지 않는다
func test_주인공은_천장을_넘어도_조금씩_자란다() -> void:
	assert_float(Growth.potential_cap_factor(81.0, 76.0)).override_failure_message(
		"주인공 상한이 천장에서 0이 됐다 — 02 growth_engine.rs는 soft cap이다") \
		.is_equal_approx(0.10, 0.001)


## ⚠ **NPC는 안 넘는다** — 02 `npc_sim.rs`가 hard cap이다
func test_npc는_천장을_안_넘는다() -> void:
	assert_float(NpcGrowth.potential_cap(81.0, 76.0)).override_failure_message(
		"NPC 상한이 천장에서 0이 아니다 — 02 npc_sim.rs는 hard cap이다") \
		.is_equal(0.00)
	assert_float(NpcGrowth.potential_cap(76.0, 76.0)).is_equal(0.00)


## 🔴 **천장 아래에서는 두 표가 같다.** 여기가 갈리면 주인공과 NPC의
## 성장 속도가 달라져 그 격차가 그대로 성적이 된다
func test_천장_아래에서는_두_표가_같다() -> void:
	for pair in [[50.0, 90.0], [72.0, 90.0], [81.0, 90.0], [89.0, 90.0]]:
		var a: float = Growth.potential_cap_factor(pair[0], pair[1])
		var b: float = NpcGrowth.potential_cap(pair[0], pair[1])
		assert_float(a).override_failure_message(
			"%.0f/%.0f — 주인공 %.2f · NPC %.2f" % [pair[0], pair[1], a, b]) \
			.is_equal_approx(b, 0.001)
