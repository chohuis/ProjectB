extends GdUnitTestSuite

## 관계도 — 감독·코치·구단주·동료·라이벌. B-2.
##
## 02 `relationship.rs`의 검사 12개를 옮기고 늘렸다.


func _row(id: String, kind: String, value: float,
		over: Dictionary = {}) -> Dictionary:
	var r: Dictionary = {"person_id": id, "kind": kind, "value": value,
		"contact": "together", "specialty": ""}
	r.merge(over, true)
	return r


func _ctx(over: Dictionary = {}) -> Dictionary:
	var c: Dictionary = {"pitched": false, "won": false, "era": 0.0,
		"complete_shutout": false, "team_played": false, "team_won": false,
		"ovr_delta": 0.0, "training_done": false, "training_skipped": false,
		"training_area": "", "faced_rivals": []}
	c.merge(over, true)
	return c


func _find(deltas: Array, id: String) -> Dictionary:
	for d in deltas:
		if String(d["person_id"]) == id:
			return d
	return {}


# ── 라벨 ──────────────────────────────────────────────────────

## ⚠ **−100~100 전 구간이 정확히 하나의 라벨에 속해야 한다.** 구멍이 있으면
## 특정 값에서 화면이 "중립"으로 조용히 빠진다
func test_the_label_bands_have_no_gaps() -> void:
	for v in range(-100, 101):
		var hits: int = 0
		for b in Relationship.LABELS:
			if v >= int(b[0]) and v <= int(b[1]):
				hits += 1
		assert_int(hits).override_failure_message(
			"값 %d가 %d개 구간에 속한다" % [v, hits]).is_equal(1)

	assert_str(Relationship.label_of(0)).is_equal("중립")
	assert_str(Relationship.label_of(65)).is_equal("각별")
	assert_str(Relationship.label_of(-61)).is_equal("적대")
	# 범위 밖도 안전하다
	assert_str(Relationship.label_of(9999)).is_equal("각별")
	assert_str(Relationship.label_of(-9999)).is_equal("적대")


func test_the_step_counts_neutral_as_zero() -> void:
	assert_int(Relationship.label_step(0)).override_failure_message(
		"중립이 0이 아니다").is_equal(0)
	assert_int(Relationship.label_step(10)).is_equal(0)
	assert_int(Relationship.label_step(11)).is_equal(1)
	assert_int(Relationship.label_step(50)).is_equal(2)
	assert_int(Relationship.label_step(100)).is_equal(3)
	assert_int(Relationship.label_step(-11)).is_equal(-1)
	assert_int(Relationship.label_step(-40)).is_equal(-2)
	assert_int(Relationship.label_step(-100)).is_equal(-3)


func test_the_tone_follows_the_label() -> void:
	assert_str(Relationship.tone_of(0)).is_equal("neutral")
	assert_str(Relationship.tone_of(100)).is_equal("close")
	assert_str(Relationship.tone_of(-100)).is_equal("hostile")


# ── 효과 ──────────────────────────────────────────────────────

## ⚠ **값이 아니라 라벨 단계에 비례한다.** 관계값은 화면에 안 보이므로
## 판정도 라벨로 해야 "각별인데 왜 안 써주지"가 안 생긴다
func test_the_effect_scales_with_the_label_step() -> void:
	var per: float = float(Relationship.rules()["effect"]["manager_role_ovr_per_step"])
	var close: Dictionary = Relationship.effects(80, 80, 80)
	var hostile: Dictionary = Relationship.effects(-80, -80, -80)
	var neutral: Dictionary = Relationship.neutral_effects()

	assert_float(float(close["role_ovr_bias"])).override_failure_message(
		"각별이 최대 보정이 아니다").is_equal(per * 3.0)
	assert_float(float(hostile["role_ovr_bias"])).is_equal(-per * 3.0)
	assert_float(float(neutral["role_ovr_bias"])).override_failure_message(
		"중립이 0이 아니다").is_equal(0.0)
	assert_float(float(close["training_bonus"])).is_greater(0.0)
	assert_float(float(hostile["training_bonus"])).is_less(0.0)
	assert_float(float(close["contract_bonus"])).is_greater(0.0)
	assert_str(String(close["manager_label"])).is_equal("각별")
	assert_str(String(hostile["coach_label"])).is_equal("적대")


## 셋이 각자 자기 값을 본다 — 하나를 돌려쓰면 감독이 훈련까지 좌우한다
func test_each_effect_reads_its_own_value() -> void:
	var only_manager: Dictionary = Relationship.effects(80, 0, 0)
	assert_float(float(only_manager["role_ovr_bias"])).is_greater(0.0)
	assert_float(float(only_manager["training_bonus"])).is_equal(0.0)
	assert_float(float(only_manager["contract_bonus"])).is_equal(0.0)

	var only_owner: Dictionary = Relationship.effects(0, 0, 80)
	assert_float(float(only_owner["contract_bonus"])).is_greater(0.0)
	assert_float(float(only_owner["role_ovr_bias"])).is_equal(0.0)


## 훈련 어휘 → 코치 영역. 규칙 파일이 정본이다
func test_the_training_area_comes_from_the_rules() -> void:
	assert_str(Relationship.training_area_of("velocity")).is_equal("투수")
	assert_str(Relationship.training_area_of("batting")).is_equal("타격")
	assert_str(Relationship.training_area_of("mentality")).is_equal("멘탈")
	# 매핑에 없으면 그 주는 어느 코치도 안 오른다
	assert_str(Relationship.training_area_of("unknown_focus")).is_empty()
	assert_str(Relationship.training_area_of("")).is_empty()


# ── 초기값 ────────────────────────────────────────────────────

func _people(n: int, kind: String = "teammate") -> Array:
	var out: Array = []
	for i in n:
		out.append({"person_id": "PLY_%03d" % i, "kind": kind})
	return out


## 초기값은 중립 근처다 — 처음부터 호불호가 갈리면 쌓는 재미가 없다
func test_the_initial_value_sits_near_neutral() -> void:
	var spread: int = int(Relationship.rules()["init"]["personality_spread"])
	var rows: Array = Relationship.init_values(4242, _people(200))
	var nonzero: int = 0
	var positive: int = 0
	for r in rows:
		assert_int(absi(int(r["value"]))).override_failure_message(
			"초기값 %d가 ±%d를 벗어났다" % [r["value"], spread]).is_less_equal(spread)
		if int(r["value"]) != 0:
			nonzero += 1
		if int(r["value"]) > 0:
			positive += 1

	# 전원이 정확히 0이면 성향 편차가 안 걸린 것이다
	assert_int(nonzero).override_failure_message(
		"성향 편차가 거의 안 걸렸다: %d/200" % nonzero).is_greater(100)
	assert_int(positive).override_failure_message(
		"한쪽으로 쏠렸다: %d/200" % positive).is_between(60, 140)


func test_the_initial_value_is_deterministic() -> void:
	var mgr: Array = [{"person_id": "MGR_1", "kind": "manager"}]
	var a: int = int(Relationship.init_values(4242, mgr, 1, true)[0]["value"])
	var b: int = int(Relationship.init_values(4242, mgr, 1, true)[0]["value"])
	var c: int = int(Relationship.init_values(9999, mgr, 1, true)[0]["value"])
	assert_int(a).override_failure_message("같은 시드가 다른 값을 냈다").is_equal(b)
	assert_int(a).override_failure_message(
		"시드가 달라도 같은 값이다 — 시드가 안 먹었다").is_not_equal(c)


## 1라운드 지명은 감독 초기 호감이 붙는다
func test_the_draft_round_moves_the_manager() -> void:
	var mgr: Array = [{"person_id": "MGR_1", "kind": "manager"}]
	var r1: int = int(Relationship.init_values(4242, mgr, 1, true)[0]["value"])
	var r2: int = int(Relationship.init_values(4242, mgr, 2, true)[0]["value"])
	var r5: int = int(Relationship.init_values(4242, mgr, 5, true)[0]["value"])
	var undrafted: int = int(Relationship.init_values(4242, mgr, 0, true)[0]["value"])
	assert_int(r1).override_failure_message(
		"1라운드(%d)가 2라운드(%d)보다 낮다" % [r1, r2]).is_greater(r2)
	assert_int(r2).is_greater(r5)
	assert_int(r5).is_greater(undrafted)


## ⚠ **지명 절차를 안 거친 맥락에는 감점을 안 준다.** 안 그러면 고교에
## 입학하자마자 감독이 나를 싫어한다
func test_entering_school_is_not_being_undrafted() -> void:
	var mgr: Array = [{"person_id": "MGR_1", "kind": "manager"}]
	var entered: int = int(Relationship.init_values(4242, mgr, 0, false)[0]["value"])
	var undrafted: int = int(Relationship.init_values(4242, mgr, 0, true)[0]["value"])
	assert_int(entered).override_failure_message(
		"입학인데 미지명 감점을 받았다").is_greater(undrafted)


## ⚠ **지명 보정은 감독에게만.** 라커룸 전체가 지명 순위로 나를 대하면
## 안 된다
func test_only_the_manager_cares_about_the_draft() -> void:
	var people: Array = [{"person_id": "X_1", "kind": "coach"},
		{"person_id": "X_1", "kind": "teammate"}]
	var r1: Array = Relationship.init_values(4242, people, 1, true)
	var none: Array = Relationship.init_values(4242, people, 0, false)
	assert_int(int(r1[0]["value"])).is_equal(int(none[0]["value"]))
	assert_int(int(r1[1]["value"])).is_equal(int(none[1]["value"]))


func test_the_initial_row_carries_a_label() -> void:
	var rows: Array = Relationship.init_values(1, _people(5))
	for r in rows:
		assert_str(String(r["label"])).is_equal(
			Relationship.label_of(int(r["value"])))


# ── 성향 ──────────────────────────────────────────────────────

## ⚠ **사람마다 독립 스트림이다.** 한 흐름으로 순차 생성하면 앞쪽 인원이
## 바뀔 때 뒤가 전부 흔들린다
func test_a_disposition_does_not_depend_on_the_others() -> void:
	var alone: Dictionary = Relationship.disposition(7, "PLY_042")
	var again: Dictionary = Relationship.disposition(7, "PLY_042")
	assert_dict(alone).is_equal(again)
	assert_dict(Relationship.disposition(7, "PLY_043")) \
		.override_failure_message("사람이 달라도 성향이 같다").is_not_equal(alone)
	assert_dict(Relationship.disposition(8, "PLY_042")) \
		.override_failure_message("시드가 달라도 성향이 같다").is_not_equal(alone)


func test_every_disposition_axis_is_filled() -> void:
	var d: Dictionary = Relationship.disposition(1, "X")
	for k in Relationship.DISPOSITION_FIELDS:
		assert_bool(d.has(k)).override_failure_message(
			"%s 축이 없다" % k).is_true()
		assert_int(int(d[k])).is_between(0, 100)


# ── 주간 ──────────────────────────────────────────────────────

## ⚠ **담당 영역 코치만 오른다.** 전 코치에게 붙이면 여섯이 다 같이 오른다
func test_only_the_coach_of_that_area_gains() -> void:
	var rows: Array = [
		_row("COA_P", "coach", 0.0, {"specialty": "투수"}),
		_row("COA_B", "coach", 0.0, {"specialty": "타격"})]
	var out: Array = Relationship.weekly(1, rows,
		_ctx({"training_done": true, "training_area": "투수"}))
	assert_int(out.size()).override_failure_message(
		"담당 아닌 코치까지 움직였다").is_equal(1)
	assert_str(String(out[0]["person_id"])).is_equal("COA_P")
	assert_int(int(out[0]["delta"])).is_greater(0)


## 훈련을 했어도 영역이 비면 아무도 안 오른다
func test_training_without_an_area_moves_no_coach() -> void:
	var rows: Array = [_row("COA_P", "coach", 0.0, {"specialty": "투수"})]
	assert_array(Relationship.weekly(1, rows,
		_ctx({"training_done": true, "training_area": ""}))).is_empty()


## ⚠ **`together`만 움직인다.** 헤어진 상대는 시즌 단위로만 감쇠하고
## 끝난 관계는 동결이다
func test_only_those_still_around_move_weekly() -> void:
	var rows: Array = [
		_row("MGR_1", "manager", 40.0, {"contact": "apart"}),
		_row("MGR_2", "manager", 40.0, {"contact": "ended"}),
		_row("MGR_3", "manager", 40.0)]
	var out: Array = Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": true, "era": 1.5}))
	assert_int(out.size()).override_failure_message(
		"together가 아닌 상대가 움직였다").is_equal(1)
	assert_str(String(out[0]["person_id"])).is_equal("MGR_3")


## 등판을 안 한 주는 감독 항목이 안 걸린다
func test_a_week_without_pitching_leaves_the_manager_alone() -> void:
	var rows: Array = [_row("MGR_1", "manager", 0.0)]
	assert_array(Relationship.weekly(1, rows,
		_ctx({"won": true, "era": 1.0}))).is_empty()


## 이겼는가 · 잘 던졌는가 · 완봉인가가 각각 걸린다
func test_the_manager_reads_the_start() -> void:
	var rows: Array = [_row("MGR_1", "manager", 0.0)]
	var win: int = int(Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": true, "era": 4.0}))[0]["delta"])
	var loss: int = int(Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": false, "era": 4.0}))[0]["delta"])
	var quality: int = int(Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": true, "era": 1.0}))[0]["delta"])
	# ⚠ **난타는 패전에 얹어 본다.** 이기면서 난타당한 주는 승리(+2)와
	# 난타(−2)가 상쇄돼 0이 되고, 0인 변화는 아예 안 실린다
	var blowup: int = int(Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": false, "era": 9.0}))[0]["delta"])
	var shutout: int = int(Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": true, "era": 0.0,
			"complete_shutout": true}))[0]["delta"])

	assert_int(win).is_greater(loss)
	assert_int(quality).override_failure_message(
		"호투가 평범한 승리와 같다").is_greater(win)
	assert_int(blowup).override_failure_message(
		"난타당해도 평범한 패전과 같다").is_less(loss)
	assert_int(shutout).override_failure_message(
		"완봉이 호투와 같다").is_greater(quality)


## 훈련을 거른 주는 감독·코치가 같이 내려간다
func test_skipping_training_costs_both() -> void:
	var rows: Array = [_row("MGR_1", "manager", 0.0),
		_row("COA_1", "coach", 0.0, {"specialty": "투수"})]
	var out: Array = Relationship.weekly(1, rows, _ctx({"training_skipped": true}))
	assert_int(out.size()).is_equal(2)
	for d in out:
		assert_int(int(d["delta"])).is_less(0)


## ⚠ **임계는 1이다.** 02는 2로 뒀는데 실측상 191주에 14포인트라
## **델타 2인 주가 아예 없었다** — 성장 가산이 도달 불가였다
func test_growing_is_reachable() -> void:
	var rows: Array = [_row("MGR_1", "manager", 0.0)]
	assert_array(Relationship.weekly(1, rows,
		_ctx({"ovr_delta": 1.0}))).override_failure_message(
		"델타 1로는 성장 가산이 안 걸린다 — 02가 도달 불가로 만들었던 자리다") \
		.is_not_empty()
	assert_array(Relationship.weekly(1, rows, _ctx({"ovr_delta": 0.5}))).is_empty()


## 동료는 팀이 이긴 주에 오른다 — 내 등판과 별개다
func test_a_teammate_reads_the_team_result() -> void:
	var rows: Array = [_row("PLY_1", "teammate", 0.0)]
	var won: Array = Relationship.weekly(1, rows,
		_ctx({"team_played": true, "team_won": true}))
	assert_int(int(won[0]["delta"])).is_greater(0)
	# 경기가 없던 주는 안 움직인다
	assert_array(Relationship.weekly(1, rows,
		_ctx({"team_played": false, "team_won": true}))).is_empty()


## 나는 호투했는데 팀이 진 주 — 에이스가 고립되는 감각
func test_the_isolated_ace_loses_the_room() -> void:
	var rows: Array = [_row("PLY_1", "teammate", 0.0)]
	var out: Array = Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": false, "era": 1.0}))
	assert_int(int(out[0]["delta"])).override_failure_message(
		"호투하고 팀이 졌는데 동료 관계가 안 내려갔다").is_less(0)


## ⚠ **성향이 부호를 가른다.** 같은 사건(내가 이김)에 인정과 적개심이
## 둘 다 나와야 한다
func test_a_rival_reacts_by_temperament() -> void:
	var rows: Array = []
	var ids: Array = []
	for i in 200:
		rows.append(_row("RIV_%03d" % i, "rival", 0.0))
		ids.append("RIV_%03d" % i)
	var out: Array = Relationship.weekly(77, rows,
		_ctx({"pitched": true, "won": true, "era": 1.0, "faced_rivals": ids}))

	var pos: int = 0
	var neg: int = 0
	for d in out:
		if int(d["delta"]) > 0:
			pos += 1
		elif int(d["delta"]) < 0:
			neg += 1
	assert_int(pos).override_failure_message(
		"성향이 부호를 안 가른다 — 인정 %d / 적개심 %d" % [pos, neg]).is_greater(20)
	assert_int(neg).is_greater(20)


## 맞대결이 없던 주는 라이벌이 안 움직인다 — 사건이 관계의 시작이다
func test_a_rival_needs_the_matchup() -> void:
	var rows: Array = [_row("RIV_1", "rival", 0.0)]
	assert_array(Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": true, "era": 1.0}))).is_empty()
	assert_array(Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": true, "era": 1.0,
			"faced_rivals": ["RIV_1"]}))).is_not_empty()


## 구단주는 주간 항목이 없다 — 시즌 성적으로만 움직인다
func test_the_owner_does_not_move_weekly() -> void:
	var rows: Array = [_row("OWN_1", "owner", 0.0)]
	assert_array(Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": true, "era": 0.5, "complete_shutout": true,
			"team_played": true, "team_won": true, "ovr_delta": 5.0,
			"training_done": true, "training_area": "투수"}))).is_empty()


## ⚠ **소통력은 양수 변화에만 곱한다.** 소통 좋은 코치진이라고 미움까지
## 빨리 쌓이면 방향이 뒤집힌다
func test_communication_speeds_up_liking_only() -> void:
	var rows: Array = [_row("MGR_1", "manager", 0.0)]
	var good: Dictionary = _ctx({"pitched": true, "won": true, "era": 1.0})
	var bad: Dictionary = _ctx({"pitched": true, "won": false, "era": 9.0})

	var plain_up: int = int(Relationship.weekly(1, rows, good, 1.0)[0]["delta"])
	var fast_up: int = int(Relationship.weekly(1, rows, good, 1.30)[0]["delta"])
	assert_int(fast_up).override_failure_message(
		"소통력이 좋은 변화를 못 민다").is_greater(plain_up)

	var plain_down: int = int(Relationship.weekly(1, rows, bad, 1.0)[0]["delta"])
	var fast_down: int = int(Relationship.weekly(1, rows, bad, 1.30)[0]["delta"])
	assert_int(fast_down).override_failure_message(
		"소통력이 미움까지 빨리 쌓았다 — 방향이 뒤집혔다").is_equal(plain_down)


## 소통력 폭을 넘겨도 갇힌다 — 스태프 하나가 관계를 지배하면 안 된다
func test_communication_is_capped() -> void:
	var rows: Array = [_row("MGR_1", "manager", 0.0)]
	var good: Dictionary = _ctx({"pitched": true, "won": true, "era": 1.0})
	assert_int(int(Relationship.weekly(1, rows, good, 99.0)[0]["delta"])).is_equal(
		int(Relationship.weekly(1, rows, good, Relationship.MOD_MAX)[0]["delta"]))


## 값이 범위를 못 벗어난다
func test_the_value_stays_in_range() -> void:
	var value: float = 95.0
	for _wk in 60:
		var out: Array = Relationship.weekly(1,
			[_row("MGR_1", "manager", value)],
			_ctx({"pitched": true, "won": true, "era": 0.5,
				"complete_shutout": true}))
		if out.is_empty():
			break
		value = float(out[0]["value"])
	assert_int(int(value)).override_failure_message(
		"상한을 넘거나 못 도달했다: %f" % value).is_equal(100)


## 라벨이 바뀐 주만 알린다 — 값이 1 움직일 때마다 알리면 소식함이 찬다
func test_it_says_when_the_label_changed() -> void:
	# 10 → 12는 중립에서 우호로 넘는다
	var crossed: Array = Relationship.weekly(1, [_row("MGR_1", "manager", 10.0)],
		_ctx({"pitched": true, "won": true, "era": 4.0}))
	assert_bool(bool(crossed[0]["label_changed"])).is_true()
	assert_str(String(crossed[0]["prev_label"])).is_equal("중립")
	assert_str(String(crossed[0]["label"])).is_equal("우호")

	# 20 → 22는 우호 안에서 움직인다
	var inside: Array = Relationship.weekly(1, [_row("MGR_1", "manager", 20.0)],
		_ctx({"pitched": true, "won": true, "era": 4.0}))
	assert_bool(bool(inside[0]["label_changed"])).is_false()


# ── 시즌 ──────────────────────────────────────────────────────

## ⚠ **구단주는 팀 성적, 감독은 개인 성적.** 구단주가 개인 성적을 보면
## 약팀 에이스가 항상 사랑받는다
func test_the_owner_reads_the_team_and_the_manager_reads_me() -> void:
	# 개인은 좋고 팀은 나쁜 시즌 — 약팀 에이스
	var out: Array = Relationship.season(
		[_row("MGR_1", "manager", 0.0), _row("OWN_1", "owner", 0.0)],
		2.10, 0.90, true)
	assert_int(int(_find(out, "MGR_1")["delta"])).override_failure_message(
		"개인 성적이 좋은데 감독이 안 올랐다").is_greater(0)
	assert_int(int(_find(out, "OWN_1")["delta"])).override_failure_message(
		"팀 성적이 나쁜데 구단주가 안 내렸다").is_less(0)


## 등판이 없던 시즌은 개인 성적 판정을 건너뛴다
func test_a_season_without_starts_is_not_judged() -> void:
	var rows: Array = [_row("MGR_1", "manager", 0.0), _row("COA_1", "coach", 0.0)]
	assert_array(Relationship.season(rows, 0.0, 0.5, false)).is_empty()
	assert_array(Relationship.season(rows, 0.0, 0.5, true)).is_not_empty()


## 동료는 한 시즌을 같이 났다는 것만으로 오른다
func test_a_season_together_is_worth_something() -> void:
	var out: Array = Relationship.season([_row("PLY_1", "teammate", 0.0)],
		9.99, 0.99, true)
	assert_int(int(out[0]["delta"])).override_failure_message(
		"성적이 나빠도 한 시즌을 같이 난 값은 있어야 한다").is_greater(0)


## ⚠ **헤어진 관계는 반드시 0으로 수렴한다.** 기하 감쇠는 정수 반올림에서
## 멈춘다(5 × 0.9 = 4.5 → 다시 5) — 안 그러면 20년 전 사람이 영원히 남는다
func test_being_apart_eventually_reaches_zero() -> void:
	var f: float = float(Relationship.rules()["decay"]["on_move"])
	var value: float = 70.0 * f
	for _i in 30:
		var out: Array = Relationship.season(
			[_row("MGR_1", "manager", value, {"contact": "apart"})],
			0.0, 0.5, false)
		if out.is_empty():
			break
		value = float(out[0]["value"])
	assert_int(int(value)).override_failure_message(
		"30시즌이 지나도 0으로 안 갔다: %f" % value).is_equal(0)


## ⚠ **바닥에서 떨군다.** ±1이 끝까지 남으면 20년 전 사람이 목록에
## 영원히 붙어 있다
func test_a_faint_memory_drops_to_zero_at_once() -> void:
	var floor_value: float = float(Relationship.rules()["decay"]["apart_floor"])
	var out: Array = Relationship.season(
		[_row("MGR_1", "manager", floor_value, {"contact": "apart"})],
		0.0, 0.5, false)
	assert_int(int(out[0]["value"])).override_failure_message(
		"바닥(%f) 아래로 내려온 값이 0이 안 됐다" % floor_value).is_equal(0)


## 음수 관계도 0으로 온다 — 한쪽만 수렴하면 미움만 영원히 남는다
func test_a_bad_memory_also_fades() -> void:
	var value: float = -70.0
	for _i in 30:
		var out: Array = Relationship.season(
			[_row("MGR_1", "manager", value, {"contact": "apart"})],
			0.0, 0.5, false)
		if out.is_empty():
			break
		value = float(out[0]["value"])
	assert_int(int(value)).is_equal(0)


## 끝난 관계는 동결이다 — 기록이므로 건드리지 않는다
func test_an_ended_relationship_is_frozen() -> void:
	var rows: Array = [_row("MGR_1", "manager", 70.0, {"contact": "ended"})]
	assert_array(Relationship.season(rows, 1.0, 0.1, true)).is_empty()
	assert_array(Relationship.weekly(1, rows,
		_ctx({"pitched": true, "won": true}))).is_empty()
	assert_array(Relationship.move_decay(rows)).is_empty()


# ── 이동 ──────────────────────────────────────────────────────

## ⚠ **감쇠는 보존이지 리셋이 아니다.** 재회하면 그 값에서 재개되므로
## "옛 감독을 프로에서 다시 만나는" 서사가 산다
func test_moving_fades_but_does_not_reset() -> void:
	var f: float = float(Relationship.rules()["decay"]["on_move"])
	var out: Array = Relationship.move_decay(
		[_row("MGR_1", "manager", 70.0), _row("PLY_1", "teammate", -40.0)])
	var mgr: Dictionary = _find(out, "MGR_1")
	var ply: Dictionary = _find(out, "PLY_1")

	assert_int(int(mgr["value"])).is_equal(int(roundf(70.0 * f)))
	assert_int(int(ply["value"])).is_equal(int(roundf(-40.0 * f)))
	assert_int(int(mgr["value"])).override_failure_message(
		"감쇠가 리셋이 됐다").is_greater(0)
	assert_int(int(ply["value"])).override_failure_message(
		"음수 관계의 부호가 뒤집혔다").is_less(0)


# ── 한 시즌의 감각 (사용자 확정 ±25) ──────────────────────────

func _play_a_season(era_pattern: Callable, won_pattern: Callable,
		ctx_over: Dictionary = {}) -> float:
	var value: float = 0.0
	for wk in 25:
		var ctx: Dictionary = _ctx({"pitched": true, "won": won_pattern.call(wk),
			"era": era_pattern.call(wk), "team_played": true,
			"team_won": won_pattern.call(wk)})
		ctx.merge(ctx_over, true)
		var out: Array = Relationship.weekly(1,
			[_row("MGR_1", "manager", value)], ctx)
		if not out.is_empty():
			value = float(out[0]["value"])
	return value


## 사용자 확정 "중간" = 한 시즌 순변화 대략 ±25 = 라벨 1~2단계.
## **튜닝이 어긋나면 여기서 걸린다**
func test_one_good_season_moves_one_or_two_labels() -> void:
	var value: float = _play_a_season(
		func(wk: int) -> float: return 2.0 if wk % 2 == 0 else 4.0,
		func(wk: int) -> bool: return wk % 5 < 3,
		{"training_done": true})
	var out: Array = Relationship.season([_row("MGR_1", "manager", value)],
		3.10, 0.35, true)
	if not out.is_empty():
		value = float(out[0]["value"])

	assert_int(int(value)).override_failure_message(
		"좋은 시즌 하나의 순변화가 %d — 목표 ±25 감각에서 벗어났다" % int(value)) \
		.is_between(15, 40)
	var label: String = Relationship.label_of(int(value))
	assert_array(["우호", "신뢰"]).override_failure_message(
		"한 시즌 뒤 라벨이 %s — 1~2단계 이동이 아니다" % label).contains([label])


func test_one_bad_season_goes_the_other_way() -> void:
	var value: float = _play_a_season(
		func(_wk: int) -> float: return 6.5,
		func(wk: int) -> bool: return wk % 5 == 0,
		{"training_skipped": true})
	assert_float(value).override_failure_message(
		"부진 시즌인데 %f까지밖에 안 내려갔다" % value).is_less(-20.0)


# ── 기억 ──────────────────────────────────────────────────────

func _memory(intensity: int, season: int, week: int) -> Dictionary:
	return {"intensity": intensity, "season": season, "week": week,
		"text": "s%dw%d" % [season, week]}


## ⚠ **넘치면 약한 것부터 버린다.** 오래된 것부터 버리면 데뷔전 완봉승 같은
## 인생 사건이 평범한 최근 경기에 밀린다
func test_the_weakest_memory_goes_first() -> void:
	var memories: Array = [_memory(9, 2026, 1)]
	for i in 12:
		memories.append(_memory(1, 2030, i))
	var kept: Array = Relationship.trim_memories(memories)

	assert_int(kept.size()).is_equal(Relationship.MAX_MEMORIES)
	var strong_kept: bool = false
	for m in kept:
		if int(m["intensity"]) == 9:
			strong_kept = true
	assert_bool(strong_kept).override_failure_message(
		"데뷔전 완봉승이 평범한 최근 경기에 밀렸다").is_true()


## 같은 세기면 오래된 것부터 버린다
func test_ties_are_broken_by_age() -> void:
	var memories: Array = []
	for i in 12:
		memories.append(_memory(5, 2020 + i, 1))
	var kept: Array = Relationship.trim_memories(memories)
	var seasons: Array = []
	for m in kept:
		seasons.append(int(m["season"]))
	assert_array(seasons).not_contains([2020, 2021])
	assert_array(seasons).contains([2031])


func test_a_short_list_is_left_alone() -> void:
	var memories: Array = [_memory(1, 2026, 1), _memory(2, 2026, 2)]
	assert_array(Relationship.trim_memories(memories)).is_equal(memories)
