extends GdUnitTestSuite

## 인시즌 1군↔2군 승강 — P-4.
##
## ⚠ **판정과 값은 원래 다 있었는데 부르는 곳이 검사뿐이었다.** 02는 시즌
## 26주에 145건을 옮기는데 04는 0건이었다 — 시즌 중 1군이 고정돼서 2군에서
## 잘해도 안 올라오고, 부상으로 자리가 비어도 안 메웠다.


func _player(id: String, position: String, ovr: float,
		perf: Dictionary = {}, age: int = 25) -> Dictionary:
	return {"id": id, "position": position, "ovr": ovr, "age": age,
		"perf": perf, "salary": 5000, "registrable": true}


func _neutral() -> Dictionary:
	return TeamProfile.DEFAULT.duplicate()


## 1군을 정원만큼 채운다 — 하한에 안 걸리게 투수 13 · 야수 15
func _active(strength: float = 60.0) -> Array:
	var out: Array = []
	for i in range(6):
		out.append(_player("SP%d" % i, "SP", strength))
	for i in range(7):
		out.append(_player("RP%d" % i, "RP", strength))
	for i in range(15):
		out.append(_player("B%d" % i, "1B", strength))
	return out


func _farm(strength: float = 60.0) -> Array:
	var out: Array = []
	for i in range(9):
		out.append(_player("FSP%d" % i, "SP", strength))
	for i in range(10):
		out.append(_player("FB%d" % i, "1B", strength))
	return out


# ── 콜업 ──────────────────────────────────────────────────────

## ⚠ **문턱을 넘어야 올라온다.** 안 그러면 매주 전원이 후보가 된다
func test_an_equal_player_does_not_get_called_up() -> void:
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), _farm(60.0), _active(60.0), [])
	assert_array(picked).override_failure_message(
		"능력치가 같은데 %d명이 올라온다" % picked.size()).is_empty()


## 훨씬 잘하면 올라온다
func test_a_much_better_player_gets_called_up() -> void:
	var farm: Array = _farm(60.0)
	farm.append(_player("STAR", "1B", 85.0))
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), farm, _active(60.0), [])
	assert_int(picked.size()).is_greater(0)
	assert_str(String(picked[0]["player_id"])).is_equal("STAR")


## ⚠ **부상 자리는 능력치 차가 없어도 메운다.** 안 메우면 1군이 빈 채로 돈다
func test_an_injured_slot_gets_filled() -> void:
	var active: Array = _active(60.0)
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), _farm(60.0), active, ["B0"])
	assert_int(picked.size()).is_greater(0)
	var ids: Array = []
	for c in picked:
		ids.append(String(c["replaces_player_id"]))
	assert_bool(ids.has("B0")).override_failure_message(
		"부상자 B0 자리를 아무도 안 메운다").is_true()


## ⚠ **자리가 통째로 비면 같은 부류에서 최약체를 내린다.** 콜업은 같은
## 포지션 1:1이라, 안 그러면 포수가 0명 된 팀은 영영 못 메운다
func test_an_empty_position_is_filled_from_another_slot() -> void:
	var farm: Array = _farm(60.0)
	farm.append(_player("FC0", "C", 55.0))
	farm.append(_player("FC1", "C", 54.0))
	# 1군에 포수가 하나도 없다
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), farm, _active(60.0), [])
	var reasons: Array = []
	for c in picked:
		reasons.append(String(c["reason"]))
	assert_bool(reasons.has(RosterMaintenance.REASON_POSITION_GAP)
		).override_failure_message(
		"1군 포수가 0명인데 공백 충원이 안 걸린다").is_true()


## ⚠ **2군의 마지막 포수는 안 올린다** — 02가 그걸 올려버려 2군이 포수
## 0명으로 한 해를 났다. 단 1군 그 자리가 비었으면 올린다
func test_the_last_farm_catcher_stays_when_the_first_team_has_one() -> void:
	var farm: Array = _farm(60.0)
	farm.append(_player("FC0", "C", 90.0))
	var active: Array = _active(60.0)
	active.append(_player("C0", "C", 40.0))
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), farm, active, [])
	for c in picked:
		assert_str(String(c["player_id"])).override_failure_message(
			"2군의 마지막 포수를 올렸다").is_not_equal("FC0")


## ⚠ **육성선수는 입단 연도에 못 올라간다** (KBO 5월 1일 이후)
func test_an_unregistrable_player_is_not_a_candidate() -> void:
	var farm: Array = _farm(60.0)
	var rookie: Dictionary = _player("ROOKIE", "1B", 95.0)
	rookie["registrable"] = false
	farm.append(rookie)
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), farm, _active(60.0), [])
	for c in picked:
		assert_str(String(c["player_id"])).override_failure_message(
			"육성선수를 올렸다").is_not_equal("ROOKIE")


## ⚠ **투수 하한 보충은 별도 패스다.** 02가 공백 충원에 묶었다가 투수 12명
## 미만인 모든 팀에서 부진·부상 교체가 사라졌다(회귀 4건)
func test_a_pitcher_short_team_gets_a_pitcher() -> void:
	var active: Array = []
	for i in range(5):
		active.append(_player("SP%d" % i, "SP", 60.0))
	for i in range(20):
		active.append(_player("B%d" % i, "1B", 60.0))
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), _farm(60.0), active, [])
	var reasons: Array = []
	for c in picked:
		reasons.append(String(c["reason"]))
	assert_bool(reasons.has(RosterMaintenance.REASON_PITCHER_SHORT)
		).override_failure_message(
		"1군 투수가 5명인데 하한 보충이 안 걸린다").is_true()


## 하한 보충이 야수 하한을 깨면서까지 하지는 않는다
func test_the_pitcher_floor_does_not_break_the_batter_floor() -> void:
	var active: Array = []
	for i in range(5):
		active.append(_player("SP%d" % i, "SP", 60.0))
	for i in range(FirstTeamMinBatters()):
		active.append(_player("B%d" % i, "1B", 60.0))
	var picked: Array = RosterMaintenance.eval_callup(
		_neutral(), _farm(60.0), active, [])
	for c in picked:
		assert_str(String(c["reason"])).override_failure_message(
			"야수가 하한인데 하한 보충으로 야수를 내렸다"
		).is_not_equal(RosterMaintenance.REASON_PITCHER_SHORT)


func FirstTeamMinBatters() -> int:
	return RosterMaintenance.FIRST_TEAM_MIN_BATTERS


# ── 콜다운 ────────────────────────────────────────────────────

## ⚠ **정원 초과분만 내린다.** 02는 매번 셋을 내놨고 호출측이 둘을 내려서
## 한 시즌에 1군이 30명 → 16명으로 말랐다
func test_a_roster_within_the_cap_sends_nobody_down() -> void:
	assert_array(RosterMaintenance.eval_calldown(
		_neutral(), _active(60.0), 40)).is_empty()


## ⚠ **초과 3으로 재면 안 된다.** 02의 결함이 `over.max(3)`이라 초과가 3일
## 때는 옳은 코드와 결과가 같다 — 처음에 3으로 재서 변이가 안 잡혔다
func test_only_the_overflow_goes_down() -> void:
	var active: Array = _active(60.0)
	for over in [1, 2, 5]:
		var down: Array = RosterMaintenance.eval_calldown(
			_neutral(), active, active.size() - over)
		assert_int(down.size()).override_failure_message(
			"초과 %d명인데 %d명을 내린다" % [over, down.size()]).is_equal(over)


## ⚠ **하한 둘 다 잠기면 강등을 멈춘다.** 어느 쪽을 내려도 라인업이나
## 등판이 무너지는 로스터다
func test_both_floors_locked_stops_the_calldown() -> void:
	var active: Array = []
	for i in range(RosterMaintenance.FIRST_TEAM_MIN_PITCHERS):
		active.append(_player("SP%d" % i, "SP", 60.0))
	for i in range(RosterMaintenance.FIRST_TEAM_MIN_BATTERS):
		active.append(_player("B%d" % i, "1B", 60.0))
	assert_array(RosterMaintenance.eval_calldown(
		_neutral(), active, 1)).is_empty()


## ⚠ **선발 하한이 없으면 불펜만 빠지고 선발이 쌓인다** — 02 실측 팀당
## 선발 9~12명(로테이션은 5)
func test_the_starter_floor_protects_starters() -> void:
	var active: Array = []
	for i in range(RosterMaintenance.FIRST_TEAM_MIN_STARTERS):
		# 선발을 일부러 약하게 — 하한이 없으면 이들이 먼저 내려간다
		active.append(_player("SP%d" % i, "SP", 30.0))
	for i in range(10):
		active.append(_player("RP%d" % i, "RP", 70.0))
	for i in range(20):
		active.append(_player("B%d" % i, "1B", 70.0))
	var down: Array = RosterMaintenance.eval_calldown(
		_neutral(), active, active.size() - 2)
	for d in down:
		assert_bool(String(d["player_id"]).begins_with("SP")
			).override_failure_message(
			"선발이 하한인데 선발을 내렸다").is_false()


## 외국인은 2군에 안 내린다 — 보유 한도가 강등으로 새면 안 된다
func test_a_foreign_player_never_goes_down() -> void:
	var active: Array = _active(60.0)
	var foreign: Dictionary = _player("FOREIGN", "1B", 10.0)
	foreign["is_foreign"] = true
	active.append(foreign)
	var down: Array = RosterMaintenance.eval_calldown(
		_neutral(), active, active.size() - 2)
	for d in down:
		assert_str(String(d["player_id"])).override_failure_message(
			"외국인을 2군에 내렸다").is_not_equal("FOREIGN")


# ── 주기 ──────────────────────────────────────────────────────

## ⚠ **주 경계가 아니면 아무것도 안 한다.** 매일 돌리면 02의 7배가 된다
func test_nothing_happens_mid_week() -> void:
	var s: Dictionary = {"season_year": 2027, "world": {"rosters": {}}}
	var out: Dictionary = PromotionRunner.run(s, 3)
	assert_int(int(out["callups"])).is_equal(0)
	assert_bool(bool(out["regular"])).is_false()


## ⚠ **04는 일 단위라 주 인덱스를 세지 않는다.** 달력의 달이 바뀌면 정기다 —
## 매주 4로 나누는 식으로 세면 달과 서서히 어긋난다
func test_the_first_week_of_a_month_is_the_regular_run() -> void:
	var s: Dictionary = {"season_year": 2027, "world": {"rosters": {}}}
	var months: Dictionary = {}
	var regulars: int = 0
	for w in range(1, 27):
		var day: int = w * Calendar.DAYS_PER_WEEK
		if PromotionRunner.run(s, day)["regular"]:
			regulars += 1
			months[int(Calendar.date_of(2027, day)["month"])] = true
	assert_int(regulars).override_failure_message(
		"26주에 정기가 %d회 — 달마다 한 번이 아니다" % regulars
	).is_equal(months.size())


## 상시 주에는 콜다운이 안 돈다 — **빈 자리 메우기만**
func test_an_urgent_week_does_not_send_anyone_down() -> void:
	var s: Dictionary = {"season_year": 2027, "world": {"rosters": {}}}
	# 첫 주로 달을 기록해 둔다 — 그다음 주는 상시다
	PromotionRunner.run(s, Calendar.DAYS_PER_WEEK)
	var out: Dictionary = PromotionRunner.run(s, Calendar.DAYS_PER_WEEK * 2)
	assert_bool(bool(out["regular"])).is_false()
	assert_int(int(out["calldowns"])).is_equal(0)
