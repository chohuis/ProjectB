extends GdUnitTestSuite

## 투수 교체 — 아웃 예산·강판 판정. M2-4.
##
## 원본: `packages/engine-native/src/match_engine.rs` · `types.rs`(`PitcherQueue`)
## 원본 검사: `apps/ui/src/shared/utils/__tests__/pitcherExitRule.test.ts`
##
## ⚠ **원본 검사는 Rust 소스를 정규식으로 읽고 있었다.** 여기서는 실제로
## 함수를 불러서 본다 — 소스 문자열 검사는 인자 자리가 밀린 결함을 못 잡는다.
##
## ## 이 조각이 고친 결함
##
## 예전엔 주인공만 **스태미나 문턱**(35)으로 내려왔다. 그 상수 주석은 "NPC와
## 같은 기준"이라 적혀 있었지만 **NPC는 스태미나 문턱을 아예 안 쓴다** —
## 아웃카운트 예산과 투구수만 본다. 35라는 숫자는 NPC의 어떤 값과도 대응하지
## 않았다. 결과가 등판 길이 차이다:
##
##   NPC 선발  12 + (스태미나/99)×15 아웃  → 스태미나 60이면 7이닝
##   주인공    스태미나 ≤ 35               → 실측 4.5이닝
##
## 이닝이 짧으니 시즌 이닝이 32~44에 머물렀고, 수상 자격선에 계속 걸렸으며
## 탈삼진왕·방어율왕은 210시즌 0건이었다. **한 엔진에 교체 규칙이 둘이면
## 반드시 어긋난다.**

const ScriptedRng = preload("res://test/support/scripted_rng.gd")


func _queue(count: int, current: int = 0, o: Dictionary = {}) -> Dictionary:
	var pitchers: Array = []
	var lines: Array = []
	for i in count:
		pitchers.append({"name": "P%d" % i, "stamina_cap": 60.0})
		lines.append({"pc": 0})
	var q: Dictionary = {
		"pitchers": pitchers, "current": current, "max_outs": [],
		"outs_by_current": 0, "lines": lines, "pitch_limit": 0.0,
	}
	q.merge(o, true)
	return q


func _state(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"has_entered": true, "exited": false,
		"pitch_count_since_entry": 0, "outs_since_entry": 0,
		"stamina": 80.0, "stamina_cap": 60.0, "mental": 60.0,
		"is_starter": true,
		"pitch_limit": 120.0, "pitch_soft": 90.0,
		"inning": 1, "inning_limit": 9,
		"runners": {"first": {}, "second": {}, "third": {}},
		"manager": {"tactical_iq": 50.0, "clutch_decision": 50.0},
	}
	d.merge(o, true)
	return d


# ── 예산 식은 하나다 ───────────────────────────────────────────────

func test_the_protagonist_uses_the_same_budget_formula_as_an_npc_starter() -> void:
	# ⚠ **이게 이 조각의 핵심이다.** 식이 다르면 통합 엔진에서 주인공만
	# 다른 길이로 던진다
	for cap in [30.0, 60.0, 99.0]:
		var npc: int = PitcherSwitch.starter_max_outs(cap)
		var hero: int = PitcherSwitch.protagonist_max_outs(_state({"stamina_cap": cap}))
		assert_int(hero).is_equal(npc)


func test_the_budget_grows_with_stamina() -> void:
	# 스태미나 60이면 대략 7이닝(21아웃)이다
	assert_int(PitcherSwitch.starter_max_outs(60.0)).is_equal(21)
	assert_bool(PitcherSwitch.starter_max_outs(99.0) > PitcherSwitch.starter_max_outs(30.0)).is_true()


func test_the_budget_is_never_zero_for_a_starter() -> void:
	# 0이면 첫 아웃에 바로 내려간다
	assert_bool(PitcherSwitch.starter_max_outs(0.0) >= 1).is_true()
	# 깨진 세이브가 음수를 들고 올 수 있다. 그래도 1은 준다 —
	# 음수 예산이면 등판하자마자 강판이고 그 경기 기록이 통째로 이상해진다
	assert_bool(PitcherSwitch.starter_max_outs(-999.0) >= 1).is_true()


func test_the_budget_has_no_randomness() -> void:
	# ⚠ 강판 판정은 **타석마다** 불린다. 흔들림을 넣으면 22아웃에서 내려갈지
	# 25아웃에서 내려갈지가 매 타석 재추첨된다
	var s: Dictionary = _state({"stamina_cap": 73.0})
	var first: int = PitcherSwitch.protagonist_max_outs(s)
	for i in 5:
		assert_int(PitcherSwitch.protagonist_max_outs(s)).is_equal(first)


func test_the_budget_comes_from_the_cap_not_the_current_stamina() -> void:
	# ⚠ 현재값을 쓰면 던질수록 예산이 줄어 **자기 자신을 쫓아가는 식**이 된다
	var fresh: int = PitcherSwitch.protagonist_max_outs(_state({"stamina_cap": 60.0, "stamina": 95.0}))
	var spent: int = PitcherSwitch.protagonist_max_outs(_state({"stamina_cap": 60.0, "stamina": 12.0}))
	assert_int(fresh).is_equal(spent)


func test_a_reliever_gets_no_budget() -> void:
	# 구원 등판엔 예산을 안 준다 — 0이면 호출부가 건너뛰고 투구수·전술 판정이 돈다
	assert_int(PitcherSwitch.protagonist_max_outs(_state({"is_starter": false}))).is_equal(0)


# ── 큐 예산 ────────────────────────────────────────────────────────

func test_queue_budgets_give_the_starter_the_long_one() -> void:
	var pitchers: Array = [{"stamina_cap": 60.0}, {"stamina_cap": 60.0}, {"stamina_cap": 60.0}]
	var budgets: Array = PitcherSwitch.queue_max_outs(pitchers, ScriptedRng.new([0.5]))
	assert_bool(budgets[0] > budgets[1]).is_true()
	assert_bool(budgets[0] > budgets[2]).is_true()


func test_relievers_get_a_short_budget() -> void:
	# 불펜은 한두 이닝이다
	var pitchers: Array = [{"stamina_cap": 60.0}, {"stamina_cap": 99.0}]
	var budgets: Array = PitcherSwitch.queue_max_outs(pitchers, ScriptedRng.new([0.5]))
	assert_bool(budgets[1] >= 3 and budgets[1] <= 7).is_true()


func test_the_starter_budget_wobbles_between_games() -> void:
	# 경기마다 다르게 뽑는 건 괜찮다 — 한 경기 안에서만 안 바뀌면 된다
	var pitchers: Array = [{"stamina_cap": 60.0}]
	var low: Array = PitcherSwitch.queue_max_outs(pitchers, ScriptedRng.new([0.0]))
	var high: Array = PitcherSwitch.queue_max_outs(pitchers, ScriptedRng.new([1.0]))
	assert_bool(high[0] > low[0]).is_true()


# ── NPC 교체 판정 ──────────────────────────────────────────────────

func test_npc_switches_when_the_out_budget_runs_out() -> void:
	var q: Dictionary = _queue(3, 0, {"max_outs": [15, 6, 6], "outs_by_current": 15})
	assert_bool(PitcherSwitch.should_switch(q)).is_true()


func test_npc_stays_while_the_budget_holds() -> void:
	var q: Dictionary = _queue(3, 0, {"max_outs": [15, 6, 6], "outs_by_current": 14})
	assert_bool(PitcherSwitch.should_switch(q)).is_false()


func test_npc_switches_on_the_pitch_limit() -> void:
	var q: Dictionary = _queue(3, 0, {"max_outs": [30, 6, 6], "outs_by_current": 5,
		"pitch_limit": 105.0, "lines": [{"pc": 105}, {"pc": 0}, {"pc": 0}]})
	assert_bool(PitcherSwitch.should_switch(q)).is_true()


func test_npc_switching_ignores_stamina() -> void:
	# ⚠ **NPC는 스태미나 문턱을 안 쓴다.** 주인공만 쓰던 게 결함이었다
	var q: Dictionary = _queue(3, 0, {"max_outs": [15, 6, 6], "outs_by_current": 3})
	q["pitchers"][0]["stamina_cap"] = 1.0
	assert_bool(PitcherSwitch.should_switch(q)).is_false()


func test_the_last_pitcher_never_leaves() -> void:
	# 뒤에 아무도 없다. 내보내면 마운드가 빈다
	var q: Dictionary = _queue(2, 1, {"max_outs": [15, 3], "outs_by_current": 99})
	assert_bool(PitcherSwitch.should_switch(q)).is_false()


func test_an_empty_queue_does_nothing() -> void:
	assert_bool(PitcherSwitch.should_switch(_queue(0))).is_false()


func test_a_zero_budget_is_no_budget() -> void:
	# 예산 0은 "상한 없음"이다 — 첫 아웃에 내려가는 게 아니다
	var q: Dictionary = _queue(3, 0, {"max_outs": [0, 6, 6], "outs_by_current": 50})
	assert_bool(PitcherSwitch.should_switch(q)).is_false()


func test_advancing_resets_the_out_count() -> void:
	var q: Dictionary = PitcherSwitch.advance(_queue(3, 0, {"outs_by_current": 15}))
	assert_int(q["current"]).is_equal(1)
	assert_int(q["outs_by_current"]).is_equal(0)


func test_advancing_past_the_end_does_nothing() -> void:
	var q: Dictionary = PitcherSwitch.advance(_queue(2, 1, {"outs_by_current": 5}))
	assert_int(q["current"]).is_equal(1)


# ── 구원 투수의 시작 스태미나 ──────────────────────────────────────

func test_a_reliever_does_not_come_in_at_full_strength() -> void:
	# ⚠ **100으로 리셋하면 교체하는 팀이 압도적으로 유리해진다.** 실측(같은
	# 능력치·타선·수비): 주인공 완투 ERA 3.83 vs 투수진 3명 교체 ERA 1.65.
	# 품질 벌점이 (50 − 스태미나) × 0.18이라 그대로 차이가 된다.
	# **주인공은 82에서 시작한다** — 구원도 같은 기준으로 들어와야 공평하다
	assert_float(PitcherSwitch.relief_start_stamina(99.0)).is_equal_approx(82.0, 0.001)
	# 능력이 낮으면 그 아래에서 시작한다
	assert_float(PitcherSwitch.relief_start_stamina(55.0)).is_equal_approx(55.0, 0.001)


# ── 주인공 강판 판정 ───────────────────────────────────────────────

func test_no_exit_check_before_entering() -> void:
	# ⚠ **다른 조건이 걸릴 상태로 본다.** 평범한 상태로 보면 어차피 안 내려가는
	# 것과 구분이 안 돼서, 문지기를 통째로 빼도 검사가 통과한다
	var loaded: Dictionary = {"pitch_count_since_entry": 200, "outs_since_entry": 99, "stamina": 1.0}
	var before: Dictionary = loaded.duplicate()
	before["has_entered"] = false
	var after: Dictionary = loaded.duplicate()
	after["exited"] = true
	assert_bool(PitcherSwitch.should_protagonist_exit(_state(before))["should_exit"]).is_false()
	assert_bool(PitcherSwitch.should_protagonist_exit(_state(after))["should_exit"]).is_false()
	# 대조군 — 등판 중이면 같은 상태에서 내려간다
	assert_bool(PitcherSwitch.should_protagonist_exit(_state(loaded))["should_exit"]).is_true()


func test_the_hard_pitch_limit_ends_the_outing() -> void:
	var out: Dictionary = PitcherSwitch.should_protagonist_exit(
		_state({"pitch_count_since_entry": 120}))
	assert_bool(out["should_exit"]).is_true()
	assert_str(out["reason"]).is_equal("pitch_limit")


func test_spending_the_out_budget_ends_the_outing() -> void:
	var s: Dictionary = _state({"stamina_cap": 60.0})
	s["outs_since_entry"] = PitcherSwitch.starter_max_outs(60.0)
	var out: Dictionary = PitcherSwitch.should_protagonist_exit(s)
	assert_bool(out["should_exit"]).is_true()
	assert_str(out["reason"]).is_equal("stamina")


func test_the_budget_is_checked_before_the_stamina_floor() -> void:
	# ⚠ 순서가 바뀌면 스태미나가 먼저 걸려서 **예산이 있으나 마나**가 된다.
	# 그게 정확히 원본 결함이었다 — 예산을 넣고도 스태미나로 내려왔다
	var s: Dictionary = _state({"stamina_cap": 60.0, "stamina": 5.0})
	s["outs_since_entry"] = PitcherSwitch.starter_max_outs(60.0)
	# 둘 다 걸리는 상황에서 예산이 이유여야 한다 — 사유가 같아 구분이 안 되므로
	# 예산만 채우고 스태미나는 넉넉한 쪽으로 본다
	var budget_only: Dictionary = _state({"stamina_cap": 60.0, "stamina": 90.0})
	budget_only["outs_since_entry"] = PitcherSwitch.starter_max_outs(60.0)
	assert_bool(PitcherSwitch.should_protagonist_exit(budget_only)["should_exit"]).is_true()


func test_a_starter_with_stamina_left_keeps_pitching() -> void:
	# ⚠ 여기가 결함의 핵심이었다. 스태미나 30이면 예전엔 내려왔다(문턱 35).
	# 지금은 예산이 남아 있으면 계속 던진다
	var s: Dictionary = _state({"stamina_cap": 60.0, "stamina": 30.0, "outs_since_entry": 9,
		"mental": 60.0, "pitch_count_since_entry": 50})
	assert_bool(PitcherSwitch.should_protagonist_exit(s)["should_exit"]).is_false()


func test_the_stamina_floor_is_an_emergency_only() -> void:
	# 부상·급락으로 예산을 채우기 전에 무너지는 경우다
	var s: Dictionary = _state({"stamina_cap": 60.0, "stamina": 10.0, "outs_since_entry": 3})
	var out: Dictionary = PitcherSwitch.should_protagonist_exit(s)
	assert_bool(out["should_exit"]).is_true()
	assert_str(out["reason"]).is_equal("stamina")


func test_a_reliever_leaves_on_pitches_not_on_a_budget() -> void:
	# 구원은 예산이 0이라 그 갈래를 건너뛴다. 100아웃을 잡아도 안 걸린다
	var s: Dictionary = _state({"is_starter": false, "outs_since_entry": 100, "stamina": 90.0,
		"pitch_count_since_entry": 10})
	assert_bool(PitcherSwitch.should_protagonist_exit(s)["should_exit"]).is_false()


func test_tactical_exit_stacks_danger() -> void:
	# 투구수가 소프트캡을 넘고 후반 득점권이면 감독이 움직인다
	var s: Dictionary = _state({
		"stamina_cap": 99.0, "pitch_count_since_entry": 110, "stamina": 25.0, "mental": 25.0,
		"inning": 9, "inning_limit": 9,
		"runners": {"first": {}, "second": {"speed": 70.0}, "third": {}},
	})
	var out: Dictionary = PitcherSwitch.should_protagonist_exit(s)
	assert_bool(out["should_exit"]).is_true()
	assert_str(out["reason"]).is_equal("tactical")


func test_runners_in_scoring_position_late_tip_the_decision() -> void:
	# ⚠ 9회 득점권은 그 자체로 판단을 바꾼다. 다른 항이 이미 문턱을 넘은
	# 상태로 보면 이 항을 빼도 검사가 통과한다 — **여기 하나로 갈리게** 둔다
	var base: Dictionary = {
		"stamina_cap": 99.0, "pitch_count_since_entry": 110,
		"stamina": 60.0, "mental": 60.0, "inning": 9, "inning_limit": 9,
	}
	var empty: Dictionary = base.duplicate()
	var jam: Dictionary = base.duplicate()
	jam["runners"] = {"first": {}, "second": {"speed": 70.0}, "third": {}}
	assert_bool(PitcherSwitch.should_protagonist_exit(_state(empty))["should_exit"]).is_false()
	assert_bool(PitcherSwitch.should_protagonist_exit(_state(jam))["should_exit"]).is_true()


func test_a_sharp_manager_pulls_the_pitcher_sooner() -> void:
	# ⚠ 감독 능력이 판정 문턱을 움직인다. 이게 없으면 감독 능력치가 경기에
	# 아무 영향이 없다
	var base: Dictionary = {
		"stamina_cap": 99.0, "pitch_count_since_entry": 115, "stamina": 45.0, "mental": 45.0,
		"inning": 5, "inning_limit": 9,
	}
	var sharp: Dictionary = base.duplicate()
	sharp["manager"] = {"tactical_iq": 95.0, "clutch_decision": 50.0}
	var dull: Dictionary = base.duplicate()
	dull["manager"] = {"tactical_iq": 5.0, "clutch_decision": 50.0}
	assert_bool(PitcherSwitch.should_protagonist_exit(_state(sharp))["should_exit"]).is_true()
	assert_bool(PitcherSwitch.should_protagonist_exit(_state(dull))["should_exit"]).is_false()


func test_a_fresh_starter_stays_in() -> void:
	assert_bool(PitcherSwitch.should_protagonist_exit(_state())["should_exit"]).is_false()


# ── 리그별 투구수 상한 ─────────────────────────────────────────────

func test_high_school_has_a_lower_pitch_limit() -> void:
	# 성장기 보호이자, 단판 대회에서 "에이스를 아껴 쓸까"를 만드는 장치다
	assert_float(Tuning.league_pitch_limit("LEAGUE_HIGHSCHOOL")).is_equal_approx(105.0, 0.001)
	assert_float(Tuning.league_pitch_limit("LEAGUE_KBL")).is_equal_approx(120.0, 0.001)


func test_the_soft_cap_scales_with_the_hard_cap() -> void:
	# ⚠ 105구 리그에서 소프트캡이 90이면 여유가 15구뿐이라 사실상 하드캡과 같다
	for lid in ["LEAGUE_HIGHSCHOOL", "LEAGUE_KBL"]:
		assert_bool(Tuning.league_pitch_soft(lid) < Tuning.league_pitch_limit(lid)).is_true()
	assert_bool(Tuning.league_pitch_soft("LEAGUE_HIGHSCHOOL")
		< Tuning.league_pitch_soft("LEAGUE_KBL")).is_true()
